import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import portal from '../portal.config.ts'
import { portalDefinitionSchema } from '../portal.schema.ts'

const cmd = fileURLToPath(new URL('../', import.meta.url))

function fixture(t, config = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'portal-definition-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const app = path.join(root, 'apps', 'cmd')
  mkdirSync(path.join(app, 'tools'), { recursive: true })
  symlinkSync(path.join(cmd, 'node_modules'), path.join(app, 'node_modules'), 'junction')
  const manifest = JSON.parse(readFileSync(path.join(cmd, 'package.json'), 'utf8'))
  manifest.scripts.build = 'node build.mjs'
  writeFileSync(path.join(app, 'package.json'), JSON.stringify(manifest))
  for (const file of ['portal.schema.ts', 'tools/validate-content.mjs']) writeFileSync(path.join(app, file), readFileSync(path.join(cmd, file)))
  const definition = {
    id: 'cmd', registryGroup: 'md', title: 'CMD', legacyContentImportEnabled: true,
    enabledFeatures: [], geneticSupport: { sigma: 2, geneSetCollection: 'mouse_msigdb' },
    navigation: [{ label: 'Home', href: '/' }], ...config,
  }
  writeFileSync(path.join(app, 'portal.config.ts'), `export default ${JSON.stringify(definition)}`)
  mkdirSync(path.join(app, 'content', 'effector-lists'), { recursive: true })
  writeFileSync(path.join(app, 'content', 'effector-lists', 'catalog.json'), JSON.stringify({ sourceId: 'egl_241', entries: [] }))
  writeFileSync(path.join(app, 'build.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('built.txt', 'yes')")
  return { root, app }
}

function build(root) {
  const cli = new URL('../../../tooling/portal-cli/src/cli.mjs', import.meta.url)
  const runner = `import { main } from ${JSON.stringify(cli.href)}; process.exitCode = await main(['build', 'cmd'], ${JSON.stringify(root)})`
  return spawnSync(process.execPath, ['--input-type=module', '-e', runner], { encoding: 'utf8' })
}

test('CMD schema validates the actual config, finite settings and navigation references', () => {
  assert.equal(portalDefinitionSchema.safeParse(portal).success, true)
  for (const href of ['/', '/phenotype?phenotype=CAD#associations', '#section', 'https://hugeamp.org/']) {
    assert.equal(portalDefinitionSchema.safeParse({ ...portal, navigation: [{ label: 'Page', href }] }).success, true)
  }
  for (const patch of [
    { id: 'CMD' }, { registryGroup: '' }, { legacyContentImportEnabled: 'true' },
    { geneticSupport: { sigma: Infinity, geneSetCollection: 'mouse_msigdb' } },
    { geneticSupport: { sigma: 2, geneSetCollection: 'mouse,other' } },
    ...['//other.org/', 'javascript:alert(1)', 'https://user:password@example.org/', '/\\other.org/'].map((href) => ({ navigation: [{ label: 'Page', href }] })),
  ]) assert.equal(portalDefinitionSchema.safeParse({ ...portal, ...patch }).success, false)
})

test('portal build validates its definition before producing an artifact', (t) => {
  const { root, app } = fixture(t)
  const result = build(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Portal definition is valid/)
  assert.equal(existsSync(path.join(app, 'built.txt')), true)
})

test('portal build rejects malformed model settings and unknown config fields', (t) => {
  for (const config of [{ geneticSupport: { sigma: 0, geneSetCollection: 'mouse_msigdb' } }, { title: '  ' }, { enabledFeatures: ['phenotype', 'phenotype'] }, { typo: true }, { navigation: [{ label: 'Unsafe', href: 'javascript:alert(1)' }] }]) {
    const { root, app } = fixture(t, config)
    const result = build(root)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Invalid portal definition/)
    assert.equal(existsSync(path.join(app, 'built.txt')), false)
  }
})

test('portal build rejects an identity that differs from its application directory', (t) => {
  const { root, app } = fixture(t, { id: 'msk' })
  const result = build(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /id must match application directory/)
  assert.equal(existsSync(path.join(app, 'built.txt')), false)
})
