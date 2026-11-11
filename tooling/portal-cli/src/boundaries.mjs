import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';

const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

function isWithin(directory, target) {
  const relative = path.relative(directory, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function referencesApplication(name, appNames) {
  return appNames.some((appName) => name === appName || name.startsWith(`${appName}/`));
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
      const relativeApplication = specifier.startsWith('.')
        && isWithin(appsPath, path.resolve(root, path.dirname(source), specifier));
      const appAlias = /^(?:(?:~{1,2}|@{1,2})\/|#(?:shared|server)(?:\/|$))/.test(specifier);
      if (resolvesToApplication || relativeApplication || appAlias || referencesApplication(specifier, appNames)) {
        errors.push(`${source} imports an application or app-relative alias: ${specifier}.`);
      }
    }
  }

  return errors;
}
