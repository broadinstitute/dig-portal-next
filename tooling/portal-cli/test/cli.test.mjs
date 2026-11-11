import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { affectedPortals } from '../src/affected.mjs';
import { validateDependencyDirection } from '../src/boundaries.mjs';
import { discoverPackages, main, runSharedPackageScripts, validateWorkspace } from '../src/cli.mjs';
import { importEffectorCatalog } from '../src/content-import.mjs';

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

function writeFixture(root, relative, contents) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commitFixture(root, message) {
  git(root, 'add', '--all');
  git(root, '-c', 'user.name=Portal Test', '-c', 'user.email=portal-test@example.invalid', 'commit', '--quiet', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function createAffectedFixture(t, mskDependsOnShared = false) {
  const root = createWorkspace(t);
  const manifests = mkdtempSync(path.join(os.tmpdir(), 'portal-manifests-'));
  t.after(() => rmSync(manifests, { recursive: true, force: true }));
  createPackage(root, 'apps', 'cmd', {
    name: '@dig-portal/cmd',
    dependencies: { '@dig-portal/shared': 'workspace:*' },
  });
  createPackage(root, 'apps', 'msk', {
    name: '@dig-portal/msk',
    ...(mskDependsOnShared && { dependencies: { '@dig-portal/shared': 'workspace:*' } }),
  });
  createPackage(root, 'packages', 'shared', { name: '@dig-portal/shared', version: '1.0.0' });
  writeFixture(root, 'packages/shared/index.js', 'export const value = 1;\n');
  writeFixture(root, 'apps/msk/docs/notes.md', '# Notes\n');
  writeFixture(root, 'apps/msk/content/README.md', '# Published content\n');
  writeFixture(root, 'docs/status.md', '# Status\n');
  git(root, 'init', '--quiet', '-b', 'main');
  const baseline = commitFixture(root, 'fixture baseline');
  return { root, manifests, baseline };
}

function writeManifest(directory, portal, commit) {
  writeFileSync(path.join(directory, `${portal}.json`), JSON.stringify({ portal, commit }));
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

test('runs portal scripts with forwarded arguments and underscore IDs', async (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', {
    name: '@dig-portal/cmd',
    scripts: { 'validate-content': 'node -e "process.exit(0)"', build: 'node build.mjs' },
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

  assert.equal(await main(['build', 'cmd', '--example', 'two words'], root), 0);
  assert.deepEqual(JSON.parse(readFileSync(path.join(app, 'args.json'), 'utf8')), ['--example', 'two words']);
  assert.equal(await main(['typecheck', 'vision_genomics'], root), 0);
});

test('rejects unknown portals, missing scripts, and invalid portal IDs', async (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });

  assert.equal(await main(['build', 'unknown'], root), 1);
  assert.equal(await main(['build', 'cmd'], root), 1);
  assert.equal(await main(['build', '../cmd'], root), 2);
});

test('propagates a failing portal script', async (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', {
    name: '@dig-portal/cmd',
    scripts: { typecheck: 'node -e "process.exit(7)"' },
  });

  assert.notEqual(await main(['typecheck', 'cmd'], root), 0);
});

test('blocks a portal build when its content validation fails', async (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', {
    name: '@dig-portal/cmd',
    scripts: { 'validate-content': 'node -e "process.exit(7)"', build: 'node build.mjs' },
  });
  const app = path.join(root, 'apps', 'cmd');
  writeFileSync(path.join(app, 'build.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('built.txt', 'yes');\n");

  assert.notEqual(await main(['build', 'cmd'], root), 0);
  assert.equal(existsSync(path.join(app, 'built.txt')), false);
});

test('requires a nonempty content validation script before building a portal', async (t) => {
  const root = createWorkspace(t);
  const app = path.join(root, 'apps', 'cmd');
  for (const validation of [undefined, '   ']) {
    createPackage(root, 'apps', 'cmd', {
      name: '@dig-portal/cmd',
      scripts: { 'validate-content': validation, build: 'node build.mjs' },
    });
    writeFileSync(path.join(app, 'build.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('built.txt', 'yes');\n");

    assert.equal(await main(['build', 'cmd'], root), 1);
    assert.equal(existsSync(path.join(app, 'built.txt')), false);
  }
});

test('runs shared package scripts without running application scripts', (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', {
    name: '@dig-portal/cmd',
    scripts: { test: 'node -e "process.exit(7)"' },
  });
  createPackage(root, 'packages', 'shared', {
    name: '@dig-portal/shared',
    scripts: { test: 'node test.mjs' },
  });
  const packageDir = path.join(root, 'packages', 'shared');
  writeFileSync(path.join(packageDir, 'test.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('ran.txt', 'ok');\n");

  assert.equal(runSharedPackageScripts(root, 'test'), 0);
  assert.equal(readFileSync(path.join(packageDir, 'ran.txt'), 'utf8'), 'ok');
});

test('selects graph dependents without treating content Markdown as documentation', async (t) => {
  const { root, manifests, baseline } = createAffectedFixture(t);
  writeFixture(root, 'packages/shared/index.js', 'export const value = 2;\n');
  writeFixture(root, 'apps/msk/docs/notes.md', '# Updated notes\n');
  const sharedCommit = commitFixture(root, 'shared code and documentation');
  writeManifest(manifests, 'cmd', baseline);
  writeManifest(manifests, 'msk', baseline);

  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), ['cmd']);
  const log = t.mock.method(console, 'log', () => {});
  assert.equal(await main(['affected', manifests], root), 0);
  assert.deepEqual(log.mock.calls.map(({ arguments: args }) => args[0]), ['cmd']);
  log.mock.restore();

  writeFixture(root, 'apps/msk/content/README.md', '# Updated published content\n');
  const contentCommit = commitFixture(root, 'update content');
  writeManifest(manifests, 'cmd', sharedCommit);
  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), ['msk']);

  writeManifest(manifests, 'msk', contentCommit);
  writeFixture(root, 'apps/msk/app/pages/guide.md', '# Page source\n');
  const pageCommit = commitFixture(root, 'add Markdown page source');
  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), ['msk']);

  writeManifest(manifests, 'msk', pageCommit);
  writeFixture(root, 'apps/msk/content/docs/topic.md', '# Content under docs\n');
  commitFixture(root, 'add content under docs');
  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), ['msk']);
});

test('compares each portal to its own last successful build', (t) => {
  const { root, manifests, baseline } = createAffectedFixture(t, true);
  writeFixture(root, 'packages/shared/index.js', 'export const value = 2;\n');
  const newer = commitFixture(root, 'change shared package');
  writeManifest(manifests, 'cmd', newer);
  writeManifest(manifests, 'msk', baseline);

  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), ['msk']);
});

test('ignores documentation-only changes and rebuilds all portals for global changes', (t) => {
  const { root, manifests, baseline } = createAffectedFixture(t);
  writeManifest(manifests, 'cmd', baseline);
  writeManifest(manifests, 'msk', baseline);
  writeFixture(root, 'docs/status.md', '# Updated status\n');
  writeFixture(root, 'apps/msk/docs/notes.md', '# Updated notes\n');
  commitFixture(root, 'documentation only');
  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), []);

  writeFixture(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
  commitFixture(root, 'global lockfile');
  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), ['cmd', 'msk']);
});

test('handles first builds and rejects malformed manifests and dirty worktrees', (t) => {
  const { root, manifests, baseline } = createAffectedFixture(t);
  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), ['cmd', 'msk']);
  writeManifest(manifests, 'cmd', baseline);
  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), ['msk']);

  writeFileSync(path.join(manifests, 'msk.json'), '{"portal":"msk","commit":"short"}');
  assert.throws(() => affectedPortals(root, discoverPackages(root), manifests), /full commit SHA/);
  writeManifest(manifests, 'msk', 'f'.repeat(40));
  assert.throws(() => affectedPortals(root, discoverPackages(root), manifests), /git failed/);
  writeFixture(root, 'apps/cmd/untracked.js', 'export const value = 1;\n');
  assert.throws(() => affectedPortals(root, discoverPackages(root), manifests), /clean working tree/);
});

test('rebuilds a portal whose previous build is not an ancestor of HEAD', (t) => {
  const { root, manifests, baseline } = createAffectedFixture(t);
  writeFixture(root, 'packages/shared/index.js', 'export const value = 2;\n');
  const otherBranch = commitFixture(root, 'different history');
  git(root, 'switch', '--quiet', '--detach', baseline);
  writeFixture(root, 'apps/msk/content/README.md', '# Divergent content\n');
  const head = commitFixture(root, 'divergent history');
  writeManifest(manifests, 'cmd', otherBranch);
  writeManifest(manifests, 'msk', head);

  assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), ['cmd']);
});

test('imports only published public effector lists and preserves the previous file on failure', async (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
  const app = path.join(root, 'apps', 'cmd');
  const csv = [
    'Trait ID,Effector list name,Title,Citation,PMID,Page ID',
    'CAD; T2D,<script>alert(1)</script>List,<img src=x onerror=alert(1)>Title,<a href=javascript:alert(1)>Citation</a>,123,page_1',
    'CAD2,Other,Other title,Other citation,,page_2',
    ',Excluded,Title,Citation,,page_3',
  ].join('\n');
  const attributes = {
    status: true,
    field_page_mode: 'public',
    field_page_id: 'egl_241',
    field_data_type: 'direct_csv',
    field_data_points: csv,
  };
  const fetch = async (url) => {
    assert.equal(url.searchParams.get('filter[field_page_id]'), 'egl_241');
    assert.match(url.searchParams.get('fields[node--research_page]'), /status/);
    return Response.json({ data: [{ attributes }] });
  };

  const result = await importEffectorCatalog(app, fetch);
  const saved = readFileSync(result.destination, 'utf8');
  const catalog = JSON.parse(saved);
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(catalog.entries[0], {
    traitIds: ['CAD', 'T2D'],
    name: 'List',
    title: 'Title',
    citation: 'Citation',
    pmid: '123',
    pageId: 'page_1',
  });
  assert.equal(catalog.entries.filter(({ traitIds }) => traitIds.includes('CAD')).length, 1);

  attributes.status = false;
  await assert.rejects(importEffectorCatalog(app, fetch), /unpublished/);
  assert.equal(readFileSync(result.destination, 'utf8'), saved);
  attributes.status = true;
  attributes.field_page_mode = 'dev';
  await assert.rejects(importEffectorCatalog(app, fetch), /not public/);
  assert.equal(readFileSync(result.destination, 'utf8'), saved);
  attributes.field_page_mode = 'public';
  attributes.field_data_points = csv.replace('page_1', 'javascript:alert(1)');
  await assert.rejects(importEffectorCatalog(app, fetch));
  assert.equal(readFileSync(result.destination, 'utf8'), saved);
});

test('requires explicit pre-go-live permission before fetching legacy content', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({ data: [{ attributes: {
      status: true,
      field_page_mode: 'public',
      field_page_id: 'egl_241',
      field_data_type: 'direct_csv',
      field_data_points: 'Trait ID,Effector list name,Title,Citation,PMID,Page ID\nCAD,List,Title,Journal,123,page_1',
    } }] });
  };

  for (const enabled of [undefined, false, true]) {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', {
      name: '@dig-portal/cmd',
      type: 'module',
      scripts: { 'validate-content': 'node validate.mjs' },
    });
    const app = path.join(root, 'apps', 'cmd');
    const property = enabled === undefined ? '' : `legacyContentImportEnabled: ${enabled}`;
    writeFileSync(path.join(app, 'portal.config.ts'), `export default { ${property} };\n`);

    assert.equal(await main(['content:import', 'cmd', 'effector-genes'], root), enabled ? 0 : 1);
    assert.equal(existsSync(path.join(app, 'content', 'effector-lists', 'catalog.json')), enabled === true);
  }
  assert.equal(requests, 1);
});

test('rejects shared-package dependencies on application packages', async (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
  createPackage(root, 'packages', 'shared', {
    name: '@dig-portal/shared',
    dependencies: { '@dig-portal/cmd': 'workspace:*', alias: 'file:../../apps/cmd' },
  });
  writeFileSync(path.join(root, 'packages', 'shared', 'index.ts'), 'export const value = 1;\n');

  const errors = await validateDependencyDirection(root, discoverPackages(root));
  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /@dig-portal\/cmd/);
  assert.match(errors.join('\n'), /alias/);
  assert.equal(await main(['validate'], root), 1);
});

test('rejects application imports in TypeScript and Vue shared code', async (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
  createPackage(root, 'packages', 'shared', { name: '@dig-portal/shared' });
  createPackage(root, 'layers', 'platform', { name: '@dig-portal/platform' });
  writeFileSync(path.join(root, 'apps', 'cmd', 'data.ts'), 'export type Data = string; export const data = 1;\n');
  mkdirSync(path.join(root, 'apps', 'cmd', '.nuxt'));
  writeFileSync(path.join(root, 'apps', 'cmd', '.nuxt', 'generated.ts'), 'export const generated = 1;\n');
  writeFileSync(
    path.join(root, 'packages', 'shared', 'index.ts'),
    "import type { Data } from '../../apps/cmd/data';\nexport { data } from '@dig-portal/cmd/private';\nexport { generated } from '../../apps/cmd/.nuxt/generated';\nexport const load = () => import('~/composables/example');\nexport { value } from '#shared/example';\nexport type Value = Data;\n",
  );
  writeFileSync(
    path.join(root, 'layers', 'platform', 'Example.vue'),
    '<script setup lang="ts">import { data } from \'../../apps/cmd/data\';</script>\n',
  );

  const errors = await validateDependencyDirection(root, discoverPackages(root));
  assert.equal(errors.length, 6);
  assert.match(errors.join('\n'), /index\.ts.*\.\.\/\.\.\/apps\/cmd\/data/);
  assert.match(errors.join('\n'), /@dig-portal\/cmd\/private/);
  assert.match(errors.join('\n'), /apps\/cmd\/\.nuxt\/generated/);
  assert.match(errors.join('\n'), /~\/composables\/example/);
  assert.match(errors.join('\n'), /#shared\/example/);
  assert.match(errors.join('\n'), /Example\.vue.*apps\/cmd\/data/);
});

test('allows shared dependencies and applications importing shared code', async (t) => {
  const root = createWorkspace(t);
  createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
  createPackage(root, 'packages', 'domain', { name: '@dig-portal/domain' });
  createPackage(root, 'layers', 'platform', {
    name: '@dig-portal/platform',
    dependencies: { '@dig-portal/domain': 'workspace:*' },
  });
  mkdirSync(path.join(root, 'packages', 'domain', 'node_modules', 'example'), { recursive: true });
  writeFileSync(
    path.join(root, 'packages', 'domain', 'node_modules', 'example', 'index.js'),
    "export { value } from '../../../../apps/cmd/index';\n",
  );
  writeFileSync(path.join(root, 'packages', 'domain', 'index.ts'), 'export const value = 1;\n');
  writeFileSync(path.join(root, 'layers', 'platform', 'index.ts'), "export { value } from '../../packages/domain/index';\n");
  writeFileSync(path.join(root, 'apps', 'cmd', 'index.ts'), "export { value } from '../../packages/domain/index';\n");

  assert.deepEqual(await validateDependencyDirection(root, discoverPackages(root)), []);
});
