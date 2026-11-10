import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverPackages, validateWorkspace } from '../src/cli.mjs';

function createWorkspace(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'portal-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    private: true,
    packageManager: 'pnpm@10.30.3',
  }));
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - apps/*',
    '  - packages/*',
    '  - layers/*',
    '  - tooling/*',
    '',
  ].join('\n'));

  return root;
}

function createPackage(root, workspace, directory, manifest) {
  const packageDir = path.join(root, workspace, directory);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest));
}

test('validates the workspace and unique package names', (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
  createPackage(root, 'tooling', 'portal-cli', { name: '@dig-portal/portal-cli' });

  assert.deepEqual(validateWorkspace(root), []);
  assert.deepEqual(
    discoverPackages(root).map(({ manifest }) => manifest.name).sort(),
    ['@dig-portal/cmd', '@dig-portal/portal-cli'],
  );
});

test('reports duplicate workspace package names', (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
  createPackage(root, 'packages', 'cmd', { name: '@dig-portal/cmd' });

  assert.match(validateWorkspace(root).join('\n'), /declared in both/);
});

test('requires every declared workspace root', (t) => {
  const root = createWorkspace(t);
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');

  assert.match(validateWorkspace(root).join('\n'), /must include packages\/\*/);
});
