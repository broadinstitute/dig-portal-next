#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import spawn from 'cross-spawn';

const workspacePackages = ['apps', 'packages', 'layers', 'tooling'];

export function discoverPackages(root) {
  const found = [];

  for (const workspace of workspacePackages) {
    const workspacePath = path.join(root, workspace);
    let entries;

    try {
      entries = readdirSync(workspacePath, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(workspacePath, entry.name, 'package.json');

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        found.push({ manifest, manifestPath, workspace });
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw new Error(`Could not read ${manifestPath}: ${error.message}`);
      }
    }
  }

  return found;
}

export function validateWorkspace(root) {
  const errors = [];
  let rootManifest;

  try {
    rootManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch (error) {
    return [`Could not read root package.json: ${error.message}`];
  }

  if (!rootManifest.private) errors.push('The root package.json must be private.');
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(rootManifest.packageManager ?? '')) {
    errors.push('The root package.json must pin packageManager to an exact pnpm version.');
  }

  let workspaceFile;
  try {
    workspaceFile = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  } catch (error) {
    return [...errors, `Could not read pnpm-workspace.yaml: ${error.message}`];
  }

  for (const workspace of workspacePackages) {
    if (!new RegExp(`^\\s*-\\s*['"]?${workspace}/\\*['"]?\\s*$`, 'm').test(workspaceFile)) {
      errors.push(`pnpm-workspace.yaml must include ${workspace}/*.`);
    }
  }

  const names = new Map();
  for (const { manifest, manifestPath } of discoverPackages(root)) {
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
      errors.push(`${manifestPath} must declare a package name.`);
      continue;
    }

    const previousPath = names.get(manifest.name);
    if (previousPath) {
      errors.push(`${manifest.name} is declared in both ${previousPath} and ${manifestPath}.`);
    } else {
      names.set(manifest.name, manifestPath);
    }
  }

  return errors;
}

function listPortals(root) {
  const portals = discoverPackages(root)
    .filter(({ workspace }) => workspace === 'apps')
    .map(({ manifestPath }) => path.basename(path.dirname(manifestPath)))
    .sort();

  if (portals.length === 0) {
    console.log('No portal applications found.');
    return 0;
  }

  for (const portal of portals) console.log(portal);
  return 0;
}

function runPortalCommand(root, command, portalId, args) {
  if (!portalId || !/^[a-z0-9][a-z0-9_-]*$/.test(portalId)) {
    console.error(`Usage: pnpm portal ${command} <portal-id> [arguments]`);
    return 2;
  }

  const portal = discoverPackages(root).find(({ manifestPath, workspace }) =>
    workspace === 'apps' && path.basename(path.dirname(manifestPath)) === portalId,
  );
  if (!portal) {
    console.error(`Portal "${portalId}" was not found.`);
    return 1;
  }
  if (typeof portal.manifest.scripts?.[command] !== 'string' || !portal.manifest.scripts[command].trim()) {
    console.error(`Portal "${portalId}" does not define a "${command}" script.`);
    return 1;
  }

  const result = spawn.sync('pnpm', ['--dir', path.dirname(portal.manifestPath), 'run', command, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Could not run "${command}" for "${portalId}": ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function runTests(root) {
  const testFile = fileURLToPath(new URL('../test/cli.test.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd: root,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`Could not run CLI tests: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

export function main(args, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')) {
  const [command, ...rest] = args;

  if ((command === 'list' || command === 'validate') && rest.length > 0) {
    console.error(`Usage: pnpm portal ${command}`);
    return 2;
  }

  if (command === 'list') return listPortals(root);
  if (command === 'validate') {
    const errors = validateWorkspace(root);
    if (errors.length > 0) {
      for (const error of errors) console.error(`error: ${error}`);
      return 1;
    }
    console.log('Workspace validation passed.');
    return 0;
  }
  if (command === 'test' && rest.length === 0) return runTests(root);
  if (['dev', 'typecheck', 'test', 'build'].includes(command)) {
    return runPortalCommand(root, command, rest[0], rest.slice(1));
  }
  if (command === '--help' || command === '-h' || command === undefined) {
    console.log('Usage: pnpm portal <list|validate|test|dev|typecheck|build> [portal-id] [arguments]');
    return 0;
  }

  console.error(`Unknown command "${command}". Run "pnpm portal --help" for usage.`);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
