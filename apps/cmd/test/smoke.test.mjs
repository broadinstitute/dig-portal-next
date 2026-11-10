import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('the static build contains the rendered shell and SPA fallbacks', () => {
  const output = path.join(process.cwd(), '.output', 'public')
  const html = readFileSync(path.join(output, 'index.html'), 'utf8')

  assert.match(html, /CMD portal preview/)
  assert.ok(existsSync(path.join(output, '200.html')))
  assert.ok(existsSync(path.join(output, '404.html')))
})
