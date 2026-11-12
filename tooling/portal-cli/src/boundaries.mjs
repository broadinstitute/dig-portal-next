import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';
import { parse } from '@vue/compiler-sfc';

const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const generatedDirectories = new Set(['node_modules', '.git', '.output', '.data', '.cache', 'dist', 'coverage']);

function* vueSources(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!generatedDirectories.has(entry.name) && !entry.name.startsWith('.nuxt')) yield* vueSources(filename);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.vue') {
      yield filename;
    }
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

  // Script transpilation does not expose src attributes on SFC blocks (D-05).
  for (const directory of sources) {
    for (const filename of vueSources(path.join(root, directory))) {
      const source = path.relative(root, filename).split(path.sep).join('/');
      const { descriptor, errors: parseErrors } = parse(readFileSync(filename, 'utf8'), { filename });
      if (parseErrors.length) errors.push(`${source} cannot be parsed for dependency validation.`);
      const blocks = [descriptor.template, descriptor.script, descriptor.scriptSetup, ...descriptor.styles, ...descriptor.customBlocks];
      for (const block of blocks) {
        if (block?.src && sourceReferencesApplication(root, source, block.src, appNames, appsPath)) {
          errors.push(`${source} has an application or app-relative ${block.type} src: ${block.src}.`);
        }
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
