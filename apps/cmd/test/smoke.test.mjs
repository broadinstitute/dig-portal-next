import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

test('the static build contains the rendered shell and SPA fallbacks', () => {
  const output = path.join(process.cwd(), '.output', 'public')
  const html = readFileSync(path.join(output, 'index.html'), 'utf8')

  assert.match(html, /CMD portal preview/)
  assert.ok(existsSync(path.join(output, '200.html')))
  assert.ok(existsSync(path.join(output, '404.html')))
})

test('the static content dump contains the validated effector catalog', (t) => {
  const output = path.join(process.cwd(), '.output', 'public')
  const dump = readFileSync(path.join(output, '__nuxt_content', 'effectorLists', 'sql_dump.txt'), 'utf8')
  const statements = JSON.parse(gunzipSync(Buffer.from(dump, 'base64')).toString('utf8'))
  const catalog = JSON.parse(readFileSync(path.join(process.cwd(), 'content', 'effector-lists', 'catalog.json'), 'utf8'))
  const database = new DatabaseSync(':memory:')
  t.after(() => database.close())

  for (const statement of statements) database.exec(statement)
  const rows = database.prepare('SELECT "sourceId", "entries" FROM "_content_effectorLists"').all()
  assert.equal(rows.length, 1)
  assert.deepEqual({ sourceId: rows[0].sourceId, entries: JSON.parse(rows[0].entries) }, catalog)
})
