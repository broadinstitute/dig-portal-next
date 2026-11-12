import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuxtConfigReferences } from './nuxt-config-references.mjs';

const generatedDirectories = new Set(['node_modules', '.git', '.output', '.data', '.cache', 'dist', 'coverage']);
const gitHosts = new Set(['github.com', 'api.github.com', 'codeload.github.com', 'raw.githubusercontent.com', 'gitlab.com', 'bitbucket.org', 'bitbucket.com', 'git.sr.ht']);
const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

function isWithin(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function workspaceLayerError(filename, target, packages) {
  const owner = packages.find((pkg) => isWithin(pkg.directory, filename));
  const named = packages.find(({ manifest }) => target === manifest.name || target.startsWith(`${manifest.name}/`));
  if (named) {
    if (named === owner) return;
    if (owner && dependencySections.some((section) => {
      const version = owner.manifest[section]?.[named.manifest.name];
      return typeof version === 'string' && /^workspace:.+/.test(version);
    })) return;
    return `must declare ${named.manifest.name} as a workspace dependency for its layer reference (D-31a).`;
  }
  let resolved;
  if (target.startsWith('file://')) {
    try { resolved = fileURLToPath(target); } catch { return; }
  } else if (target === '.' || target === '..' || /^[.]{1,2}[\\/]/.test(target) || path.isAbsolute(target)) {
    resolved = path.resolve(path.dirname(filename), target);
  }
  if (!resolved || (owner && isWithin(owner.directory, resolved))) return;
  const referenced = packages.find((pkg) => isWithin(pkg.directory, resolved));
  if (referenced) return `must reference workspace layer ${referenced.manifest.name} by package name with a declared workspace dependency (D-31a).`;
}

function* configs(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!generatedDirectories.has(entry.name) && !entry.name.startsWith('.nuxt')) yield* configs(filename);
    } else if (entry.isFile() && /^nuxt\.config\.[cm]?[jt]s$/i.test(entry.name)) yield filename;
  }
}

function isRemoteGitSource(target) {
  if (/^(?:gh|github|gitlab|bitbucket|sourcehut):/i.test(target)) return true;
  if (/^(?:(?:git|ssh):\/\/|(?:https?|ssh)\+git:|git\+(?:https?|ssh):)/i.test(target)) return true;
  if (/^git:/i.test(target)) {
    // Giget can also clone a local repository; D-30 concerns remote sources.
    return !/^(?:\.{1,2}(?:[\\/]|$)|[\\/]|[a-z]:[\\/]|file:)/i.test(target.slice(4));
  }
  if (/^[^/@\s]+@[^/:\s]+:.+/.test(target)) return true; // Git's SCP-style remote syntax.
  if (!/^https?:\/\//i.test(target)) return false;
  try {
    const url = new URL(target);
    return gitHosts.has(url.hostname.toLowerCase()) || /\.git(?:\/|$)/i.test(url.pathname);
  } catch {
    return false; // Other config/build validation owns malformed URLs.
  }
}

/** Partial D-30/D-31a checks: inspect static extends, never load config or fetch a layer. */
export function validateLayerSources(root, packages) {
  const errors = [];
  const workspaces = packages.map((pkg) => ({ ...pkg, directory: path.dirname(pkg.manifestPath) }))
    .sort((a, b) => b.directory.length - a.directory.length);
  for (const directory of ['apps', 'packages', 'layers']) {
    if (!existsSync(path.join(root, directory))) continue;
    for (const filename of configs(path.join(root, directory))) {
      const source = path.relative(root, filename);
      let references;
      try {
        references = nuxtConfigReferences(readFileSync(filename, 'utf8'), source, { rejectInvalidSyntax: true });
      } catch {
        errors.push(`${source} cannot be parsed for static layer-source validation.`);
        continue;
      }
      for (const { field, target } of references) {
        if ((field === 'extends' || field.endsWith('.extends')) && isRemoteGitSource(target)) {
          // Keep credentials, query parameters and source options out of diagnostics.
          errors.push(`${source} config ${field} uses a remote Git layer, forbidden by D-30.`);
        } else if (field === 'extends' || field.endsWith('.extends')) {
          const error = workspaceLayerError(filename, target, workspaces);
          if (error) errors.push(`${source} config ${field} ${error}`);
        }
      }
    }
  }
  return errors;
}
