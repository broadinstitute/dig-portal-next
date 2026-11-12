import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';
import { parse } from '@vue/compiler-sfc';
import { cssImports } from './css-imports.mjs';
import { applicationGlobMatches, scriptGlobs } from './glob-imports.mjs';

const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const generatedDirectories = new Set(['node_modules', '.git', '.output', '.data', '.cache', 'dist', 'coverage']);
const scriptExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

function* sharedSources(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!generatedDirectories.has(entry.name) && !entry.name.startsWith('.nuxt')) yield* sharedSources(filename);
    } else if (entry.isFile() && (['.vue', '.css'].includes(path.extname(entry.name).toLowerCase()) || scriptExtensions.has(path.extname(entry.name).toLowerCase()))) {
      yield filename;
    }
  }
}

function* applicationFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') yield* applicationFiles(filename);
    else if (entry.isFile()) yield filename;
  }
}

function isWithin(directory, target) {
  const relative = path.relative(directory, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function referencesApplication(name, appNames) {
  return appNames.some((appName) => name === appName || name.startsWith(`${appName}/`));
}

function sourceReferencesApplication(root, source, specifier, appNames, appsPath) {
  if (/^(?:(?:~{1,2}|@{1,2})\/|#(?:shared|server)(?:\/|$))/.test(specifier) || referencesApplication(specifier, appNames)) return true;
  if (specifier.startsWith('file://')) return isWithin(appsPath, fileURLToPath(specifier));
  const filename = specifier.replace(/[?#].*$/, '');
  if (filename.startsWith('.')) return isWithin(appsPath, path.resolve(root, path.dirname(source), filename));
  return path.isAbsolute(filename) && isWithin(appsPath, path.resolve(filename));
}

function manifestReferencesApplication(packagePath, name, specifier, appNames, appsPath) {
  if (referencesApplication(name, appNames)) return true;
  if (typeof specifier !== 'string') return false;

  if (appNames.some((appName) => ['workspace:', 'npm:'].some((prefix) =>
    specifier === `${prefix}${appName}` || specifier.startsWith(`${prefix}${appName}@`),
  ))) return true;

  if (specifier.startsWith('file://')) return isWithin(appsPath, fileURLToPath(specifier));

  const local = /^(?:file|link|workspace):(.+)$/.exec(specifier)?.[1];
  if (local && (local.startsWith('.') || path.isAbsolute(local))) {
    return isWithin(appsPath, path.resolve(packagePath, local));
  }
  return false;
}

export async function validateDependencyDirection(root, packages) {
  const appsPath = path.join(root, 'apps');
  const appNames = packages
    .filter(({ workspace, manifest }) => workspace === 'apps' && typeof manifest.name === 'string')
    .map(({ manifest }) => manifest.name);
  const errors = [];

  for (const { manifest, manifestPath, workspace } of packages) {
    if (workspace !== 'packages' && workspace !== 'layers') continue;
    for (const section of dependencySections) {
      for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
        if (manifestReferencesApplication(path.dirname(manifestPath), name, specifier, appNames, appsPath)) {
          errors.push(`${path.relative(root, manifestPath)} declares an application dependency: ${name}.`);
        }
      }
    }
  }

  const sources = ['packages', 'layers'].filter((directory) => existsSync(path.join(root, directory)));
  if (sources.length === 0) return errors;

  function validateCss(contents, source, context = source) {
    let references;
    try {
      references = cssImports(contents, source);
    } catch (error) {
      errors.push(`${context} cannot be parsed as CSS for dependency validation: ${error.reason ?? error.message}.`);
      return;
    }
    for (const specifier of references) {
      if (sourceReferencesApplication(root, source, specifier, appNames, appsPath)) errors.push(`${context} has an application or app-relative CSS @import: ${specifier}.`);
    }
  }

  let appFiles;
  function validateGlobs(contents, source, language, context = source) {
    const result = scriptGlobs(contents, source, language);
    for (const error of result.errors) errors.push(`${context} ${error}.`);
    for (const glob of result.globs) {
      try {
        appFiles ??= existsSync(appsPath) ? [...applicationFiles(appsPath)] : [];
        const matches = applicationGlobMatches(glob, root, source, appFiles);
        if (matches.length) errors.push(`${context} import.meta.glob at line ${glob.line} matches application files: ${matches.slice(0, 5).map((file) => path.relative(root, file).split(path.sep).join('/')).join(', ')}${matches.length > 5 ? ` (+${matches.length - 5} more)` : ''}.`);
      } catch (error) {
        errors.push(`${context} cannot analyze import.meta.glob at line ${glob.line}: ${error.message}.`);
      }
    }
  }

  // Script transpilation does not expose SFC src attributes or CSS imports (D-05).
  for (const directory of sources) {
    for (const filename of sharedSources(path.join(root, directory))) {
      const source = path.relative(root, filename).split(path.sep).join('/');
      const contents = readFileSync(filename, 'utf8');
      if (path.extname(filename).toLowerCase() === '.css') {
        validateCss(contents, source);
        continue;
      }
      if (scriptExtensions.has(path.extname(filename).toLowerCase())) {
        validateGlobs(contents, source);
        continue;
      }
      const { descriptor, errors: parseErrors } = parse(contents, { filename });
      if (parseErrors.length) errors.push(`${source} cannot be parsed for dependency validation.`);
      const blocks = [descriptor.template, descriptor.script, descriptor.scriptSetup, ...descriptor.styles, ...descriptor.customBlocks];
      for (const block of blocks) {
        if (block?.src && sourceReferencesApplication(root, source, block.src, appNames, appsPath)) {
          errors.push(`${source} has an application or app-relative ${block.type} src: ${block.src}.`);
        }
      }
      for (const [index, style] of descriptor.styles.entries()) {
        if (!style.src && (!style.lang || style.lang.toLowerCase() === 'css')) validateCss(style.content, source, `${source} style ${index + 1}`);
      }
      for (const script of [descriptor.script, descriptor.scriptSetup]) {
        if (script && !script.src) validateGlobs(script.content, source, script.lang || 'js', `${source} ${script.setup ? 'script setup' : 'script'}`);
      }
    }
  }

  const result = await cruise(sources, {
    baseDir: root,
    outputType: 'json',
    tsPreCompilationDeps: true,
    doNotFollow: { path: '(^|/)(node_modules|\\.nuxt|\\.output|dist)(/|$)' },
  });
  if (result.exitCode !== 0) {
    throw new Error(`Dependency analysis failed with exit code ${result.exitCode}.`);
  }

  const graph = JSON.parse(result.output);
  if (!Array.isArray(graph.modules)) throw new Error('Dependency analysis returned no module graph.');
  const transpilers = graph.summary?.environment?.transpilersFound;
  if (!Array.isArray(transpilers)) throw new Error('Dependency analysis did not report its parsers.');
  for (const name of ['typescript', '@vue/compiler-sfc']) {
    if (!transpilers.some((transpiler) => transpiler.name === name && transpiler.available)) {
      throw new Error(`Dependency analysis cannot load ${name}.`);
    }
  }

  for (const { source, dependencies } of graph.modules) {
    if (!/^(packages|layers)\//.test(source)) continue;
    for (const dependency of dependencies) {
      const specifier = dependency.module;
      const resolvesToApplication = !dependency.couldNotResolve
        && isWithin(appsPath, path.resolve(root, dependency.resolved));
      if (resolvesToApplication || sourceReferencesApplication(root, source, specifier, appNames, appsPath)) {
        errors.push(`${source} imports an application or app-relative alias: ${specifier}.`);
      }
    }
  }

  return errors;
}
