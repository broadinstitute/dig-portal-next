import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import spawn from 'cross-spawn';

function run(command, args, cwd, allowedStatuses = [0]) {
  const result = spawn.sync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (!allowedStatuses.includes(result.status)) {
    throw new Error(`${command} failed: ${result.stderr.trim() || `exit code ${result.status}`}`);
  }
  return result;
}

function normalizedPath(file) {
  const absolute = path.resolve(file);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function isDocumentation(file) {
  const segments = file.split('/');
  if (segments[0] === 'docs') return true;
  if (segments.includes('content') || segments.includes('public')) return false;
  const isWorkspace = ['apps', 'packages', 'layers', 'tooling'].includes(segments[0]);
  if (isWorkspace && segments[2] === 'docs') return true;
  return (segments.length === 1 || (isWorkspace && segments.length === 3))
    && /^(?:README|AGENTS|CHANGELOG|CONTRIBUTING)\.md$/i.test(segments.at(-1));
}

function readManifest(directory, portalId) {
  const file = path.join(directory, `${portalId}.json`);
  let contents;
  try {
    contents = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Could not read manifest ${file}: ${error.message}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid manifest ${file}: ${error.message}`);
  }
  if (!manifest || manifest.portal !== portalId
    || typeof manifest.commit !== 'string'
    || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(manifest.commit)) {
    throw new Error(`Manifest ${file} must contain the matching portal and a full commit SHA.`);
  }
  return manifest.commit;
}

function selectedByPnpm(root, filters, changedSince) {
  const args = ['--recursive'];
  for (const filter of filters) args.push('--filter', filter);
  if (changedSince) args.push('--changed-files-ignore-pattern', 'docs/**');
  args.push('list', '--depth', '-1', '--json');
  const result = run('pnpm', args, root);
  let entries;
  try {
    entries = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Could not parse pnpm's affected-package output: ${error.message}`);
  }
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry?.path !== 'string')) {
    throw new Error('pnpm returned invalid affected-package metadata.');
  }
  return new Set(entries.map(({ path: packagePath }) => normalizedPath(packagePath)));
}

function selectionSince(root, commit, packages) {
  run('git', ['cat-file', '-e', `${commit}^{commit}`], root);
  const ancestry = run('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], root, [0, 1]);
  if (ancestry.status === 1) return null;

  const files = run('git', ['diff', '--name-only', '--no-renames', '-z', commit, 'HEAD', '--'], root)
    .stdout.split('\0').filter(Boolean).filter((file) => !isDocumentation(file));
  if (files.length === 0) return new Set();

  const byDirectory = new Map(packages.map((pkg) => [
    normalizedPath(path.dirname(pkg.manifestPath)), pkg,
  ]));
  const changedNames = new Set();
  for (const file of files) {
    const segments = file.split('/');
    if (!['apps', 'packages', 'layers'].includes(segments[0]) || segments.length < 3) return null;
    const pkg = byDirectory.get(normalizedPath(path.join(root, segments[0], segments[1])));
    if (!pkg) return null;
    const name = pkg.manifest.name;
    if (typeof name !== 'string' || !/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/.test(name)) {
      throw new Error(`Cannot select an invalid workspace package name: ${name}.`);
    }
    changedNames.add(name);
  }

  const changed = selectedByPnpm(root, [`...[${commit}]`], true);
  const relevant = selectedByPnpm(root, [...changedNames].map((name) => `...${name}`), false);
  return new Set([...changed].filter((packagePath) => relevant.has(packagePath)));
}

export function affectedPortals(root, packages, manifestDirectory) {
  const directory = path.resolve(root, manifestDirectory);
  try {
    if (!statSync(directory).isDirectory()) throw new Error('not a directory');
  } catch (error) {
    throw new Error(`Cannot use manifest directory ${directory}: ${error.message}`);
  }

  const status = run('git', ['status', '--porcelain', '-z', '--untracked-files=all'], root);
  if (status.stdout.length > 0) {
    throw new Error('Affected selection requires a clean working tree, including untracked files.');
  }
  run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], root);

  const portals = packages.filter(({ workspace }) => workspace === 'apps')
    .map((pkg) => ({ ...pkg, id: path.basename(path.dirname(pkg.manifestPath)) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const selections = new Map();
  const affected = [];
  for (const portal of portals) {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(portal.id)) {
      throw new Error(`Invalid portal ID in workspace: ${portal.id}.`);
    }
    const commit = readManifest(directory, portal.id);
    if (commit === null) {
      affected.push(portal.id);
      continue;
    }
    if (!selections.has(commit)) selections.set(commit, selectionSince(root, commit, packages));
    const selected = selections.get(commit);
    if (selected === null || selected.has(normalizedPath(path.dirname(portal.manifestPath)))) {
      affected.push(portal.id);
    }
  }
  return affected;
}
