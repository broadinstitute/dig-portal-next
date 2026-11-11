import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

function catalogWithName(name) {
  return {
    sourceId: 'egl_241',
    entries: [{
      traitIds: ['CAD'],
      name,
      title: 'Title',
      citation: 'Citation',
      pmid: null,
      pageId: 'page_1',
    }],
  }
}

test('content validation fails on unsafe Studio edits', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'portal-content-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'catalog.json')
  const validator = fileURLToPath(new URL('../tools/validate-content.mjs', import.meta.url))
  for (const name of [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">link</a>',
  ]) {
    writeFileSync(file, JSON.stringify(catalogWithName(name)))
    const result = spawnSync(process.execPath, [validator, file], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Invalid effector-list content/)
  }
})

test('a portal build stops when the content validator rejects unsafe edits', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'portal-content-build-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const app = path.join(root, 'apps', 'cmd')
  mkdirSync(path.join(app, 'tools'), { recursive: true })
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  manifest.scripts.build = 'node build.mjs'
  writeFileSync(path.join(app, 'package.json'), JSON.stringify(manifest))
  const validator = fileURLToPath(new URL('../tools/validate-content.mjs', import.meta.url))
  writeFileSync(path.join(app, 'tools', 'validate-content.mjs'), [
    "process.argv[2] = 'catalog.json'",
    `await import(${JSON.stringify(pathToFileURL(validator).href)})`,
  ].join('\n'))
  writeFileSync(path.join(app, 'catalog.json'), JSON.stringify(catalogWithName('<script>alert(1)</script>')))
  writeFileSync(path.join(app, 'build.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('built.txt', 'yes')\n")
  const cli = new URL('../../../tooling/portal-cli/src/cli.mjs', import.meta.url)
  const runner = `import { main } from ${JSON.stringify(cli.href)}; process.exitCode = await main(['build', 'cmd'], ${JSON.stringify(root)})`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', runner], { encoding: 'utf8' })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Invalid effector-list content/)
  assert.equal(existsSync(path.join(app, 'built.txt')), false)
})
