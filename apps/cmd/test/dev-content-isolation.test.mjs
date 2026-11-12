import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { loadNuxt } from 'nuxt'

const app = fileURLToPath(new URL('../', import.meta.url))
const nuxtBin = path.join(path.dirname(fileURLToPath(import.meta.resolve('nuxt/package.json'))), 'bin', 'nuxt.mjs')

test('prepare and typecheck preserve a running development Content manifest and dump', async (t) => {
  // Keep the fixture inside the checkout so the actual config can resolve its
  // Git build ID. Its generated files and dependencies stay isolated from CMD.
  const base = path.join(app, '.data')
  mkdirSync(base, { recursive: true })
  const fixture = mkdtempSync(path.join(base, 'content-isolation-'))
  t.after(() => {
    const relative = path.relative(base, path.resolve(fixture))
    assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    rmSync(fixture, { recursive: true, force: true })
  })
  symlinkSync(path.join(app, 'node_modules'), path.join(fixture, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ type: 'module' }))
  const configImport = path.relative(fixture, path.join(app, 'nuxt.config.ts')).replaceAll('\\', '/').replace(/\.ts$/, '')
  writeFileSync(path.join(fixture, 'nuxt.config.ts'), `import config from ${JSON.stringify(configImport)}; export default defineNuxtConfig({ ...config, rootDir: ${JSON.stringify(fixture)}, css: [] })`)
  copyFileSync(path.join(app, 'tsconfig.json'), path.join(fixture, 'tsconfig.json'))
  copyFileSync(path.join(app, 'content.config.ts'), path.join(fixture, 'content.config.ts'))
  mkdirSync(path.join(fixture, 'app'), { recursive: true })
  writeFileSync(path.join(fixture, 'app', 'app.vue'), '<template><div>Content isolation fixture</div></template>')

  const manifest = JSON.parse(readFileSync(path.join(app, 'package.json'), 'utf8'))
  const devEnvironment = manifest.scripts.dev.match(/--envName\s+(\S+)/)?.[1] ?? 'development'
  const nuxt = await loadNuxt({ cwd: fixture, dev: true, envName: devEnvironment, ready: false })
  const devDir = nuxt.options.buildDir
  await nuxt.close()
  mkdirSync(path.join(devDir, 'content'), { recursive: true })
  const sentinels = {
    'manifest.ts': 'export const checksums = { effectorLists: "live-catalog" }',
    'database.compressed.mjs': 'export default { effectorLists: "live-data" }',
    'sql_dump.txt': 'live collection dump',
  }
  for (const [name, content] of Object.entries(sentinels)) writeFileSync(path.join(devDir, 'content', name), content)

  for (const command of ['prepare', 'typecheck']) {
    const result = spawnSync(process.execPath, [nuxtBin, command, '--cwd', fixture], {
      cwd: fixture, encoding: 'utf8', timeout: 120000,
      // Even an ambient development NODE_ENV must not select the dev server's
      // explicitly named environment for these non-serving commands.
      env: { ...process.env, NODE_ENV: 'development', NUXT_TELEMETRY_DISABLED: '1' },
    })
    assert.equal(result.status, 0, `${command}: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`)
    for (const [name, content] of Object.entries(sentinels)) {
      assert.equal(readFileSync(path.join(devDir, 'content', name), 'utf8'), content, `${command} overwrote live ${name}`)
    }
  }
})
