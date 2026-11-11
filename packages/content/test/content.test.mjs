import assert from 'node:assert/strict'
import test from 'node:test'
import { effectorCatalogSchema, sanitizePlainText } from '../src/index.ts'

test('sanitizes markup, event handlers, and unsafe links to plain text', () => {
  const input = '<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">Paper &amp; genes</a>'

  assert.equal(sanitizePlainText(input), 'Paper & genes')
  assert.equal(sanitizePlainText('A < B & C'), 'A < B & C')
})

test('rejects unsafe editor content and invalid link identifiers', () => {
  const entry = {
    traitIds: ['CAD'],
    name: 'Safe list',
    title: 'Paper title',
    citation: 'Journal',
    pmid: '123',
    pageId: 'page_1',
  }
  const catalog = { sourceId: 'egl_241', entries: [entry] }

  assert.equal(effectorCatalogSchema.safeParse(catalog).success, true)
  for (const name of [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">link</a>',
    '&lt;img src=x onerror=alert(1)&gt;',
  ]) {
    assert.equal(effectorCatalogSchema.safeParse({ ...catalog, entries: [{ ...entry, name }] }).success, false)
  }
  assert.equal(effectorCatalogSchema.safeParse({ ...catalog, entries: [{ ...entry, pageId: 'javascript:alert(1)' }] }).success, false)
})
