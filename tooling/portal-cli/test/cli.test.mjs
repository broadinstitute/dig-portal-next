import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverPackages, main, validateWorkspace } from '../src/cli.mjs';

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

test('runs portal scripts with forwarded arguments and underscore IDs', (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', {
    name: '@dig-portal/cmd',
    scripts: { build: 'node build.mjs' },
  });
  createPackage(root, 'apps', 'vision_genomics', {
    name: '@dig-portal/vision_genomics',
    scripts: { typecheck: 'node -e "process.exit(0)"' },
  });
  const app = path.join(root, 'apps', 'cmd');
  writeFileSync(
    path.join(app, 'build.mjs'),
    "import { writeFileSync } from 'node:fs'; writeFileSync('args.json', JSON.stringify(process.argv.slice(2)));\n",
  );

  assert.equal(main(['build', 'cmd', '--example', 'two words'], root), 0);
  assert.deepEqual(JSON.parse(readFileSync(path.join(app, 'args.json'), 'utf8')), ['--example', 'two words']);
  assert.equal(main(['typecheck', 'vision_genomics'], root), 0);
});

test('rejects unknown portals, missing scripts, and invalid portal IDs', (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });

  assert.equal(main(['build', 'unknown'], root), 1);
  assert.equal(main(['build', 'cmd'], root), 1);
  assert.equal(main(['build', '../cmd'], root), 2);
});

test('propagates a failing portal script', (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', {
    name: '@dig-portal/cmd',
    scripts: { typecheck: 'node -e "process.exit(7)"' },
  });

  assert.notEqual(main(['typecheck', 'cmd'], root), 0);
});
