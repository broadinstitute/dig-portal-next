import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const cmd = fileURLToPath(new URL('../', import.meta.url))
const platform = fileURLToPath(new URL('../../../layers/platform/', import.meta.url))
const nuxtPackage = fileURLToPath(import.meta.resolve('nuxt/package.json'))
const nuxtBin = path.join(path.dirname(nuxtPackage), 'bin', 'nuxt.mjs')

function write(root, relative, contents) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, contents)
}

test('reports resolved component and auto-import shadows and layer file candidates', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'portal-layers-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const app = path.join(root, 'app')
  const base = path.join(root, 'base')
  mkdirSync(app, { recursive: true })
  symlinkSync(path.join(cmd, 'node_modules'), path.join(app, 'node_modules'), 'junction')
  write(app, 'package.json', JSON.stringify({ type: 'module', dependencies: { nuxt: '4.5.2' } }))
  write(app, 'nuxt.config.ts', `export default defineNuxtConfig({ extends: [${JSON.stringify(platform)}, ${JSON.stringify(base)}], compatibilityDate: '2026-11-10' })`)
  write(base, 'nuxt.config.ts', 'export default defineNuxtConfig({})')

  for (const layer of [app, base]) {
    write(layer, 'app/pages/index.vue', '<template><div>Page</div></template>')
  }
  write(app, 'app/pages/traits/[id].vue', '<template><div>Trait</div></template>')
  write(base, 'app/pages/traits/[name].vue', '<template><div>Trait</div></template>')
  write(app, 'app/composables/feature.ts', 'export function useFeature() { return true }')
  write(base, 'app/composables/other.ts', 'export function useFeature() { return false }')
  write(app, 'app/components/UserCard.vue', '<template><div>App</div></template>')
  write(base, 'app/components/user-card.vue', '<template><div>Base</div></template>')
  write(app, 'app/components/Widget.client.vue', '<template><div>Client</div></template>')
  write(base, 'app/components/Widget.server.vue', '<template><div>Server</div></template>')
  write(app, 'app/layouts/FooBar.vue', '<template><div><slot /></div></template>')
  write(base, 'app/layouts/foo-bar.vue', '<template><div><slot /></div></template>')

  const result = spawnSync(process.execPath, [nuxtBin, 'prepare', '--cwd', app], {
    cwd: app,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, NUXT_TELEMETRY_DISABLED: '1' },
  })
  const output = `${result.stdout}\n${result.stderr}`
  assert.equal(result.status, 0, output)
  assert.match(output, /component UserCard:/)
  assert.match(output, /auto-import useFeature:/)
  assert.match(output, /layout foo-bar:/)
  assert.match(output, /page \/:/)
  assert.match(output, /page traits\/\[\]:/)
  assert.match(output, /Nuxt configuration \(merged\):/)
  assert.doesNotMatch(output, /component Widget:/)
  const paths = output.replaceAll('\\', '/')
  const appComponent = paths.indexOf('app/components/UserCard.vue')
  assert.ok(appComponent >= 0)
  assert.ok(paths.indexOf('../base/app/components/user-card.vue') > appComponent)
})
