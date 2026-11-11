import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BioIndexHttpError, BioIndexResponseError, createBioIndexClient } from '../src/index.ts'

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
}

function mockFetch(...responses) {
  const calls = []
  const fetch = async (url, options) => {
    calls.push({ url, options })
    assert.ok(responses.length, 'Unexpected BioIndex request')
    const response = responses.shift()
    return response instanceof Response ? response : Response.json(response)
  }
  return { calls, fetch }
}

function decodeAssociation(value) {
  if (!value || typeof value !== 'object' || typeof value.varId !== 'string' || typeof value.phenotype !== 'string') {
    throw new Error('Invalid association')
  }
  return { variantId: value.varId, phenotype: value.phenotype }
}

test('loads phenotype metadata and forwards cancellation', async () => {
  const mock = mockFetch(fixture('phenotypes'))
  const client = createBioIndexClient({ baseUrl: 'https://example.test/proxy/', fetch: mock.fetch })
  const controller = new AbortController()

  const phenotypes = await client.phenotypes('md', { signal: controller.signal })

  assert.deepEqual(phenotypes.map(({ name }) => name), ['CAD', 'T2D'])
  assert.equal(phenotypes[0].description, 'Coronary artery disease (CAD)')
  assert.equal(phenotypes[0].dichotomous, true)
  assert.equal(mock.calls[0].url, 'https://example.test/proxy/api/portal/phenotypes?q=md')
  assert.equal(mock.calls[0].options.signal, controller.signal)
})

test('decodes an association page without concealing limited results', async () => {
  const mock = mockFetch(fixture('cad-association'))
  const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })

  const page = await client.query('global-associations', 'CAD', decodeAssociation, { limit: 1 })

  assert.equal(mock.calls[0].url, '/bioindex/api/bio/query/global-associations?q=CAD&limit=1')
  assert.deepEqual(page.data, [{ variantId: '9:22098574:A:G', phenotype: 'CAD' }])
  assert.equal(page.continuation, null)
  assert.equal(page.restricted, 0)
  assert.deepEqual(page.progress, { bytesRead: 1286, bytesTotal: 376384, filtered: 0 })
})

test('exposes and encodes continuation tokens for subsequent pages', async () => {
  const first = fixture('cad-association')
  first.continuation = 'token+/=?'
  const mock = mockFetch(first, fixture('cad-association'))
  const client = createBioIndexClient({ baseUrl: '', fetch: mock.fetch })

  const page = await client.query('global-associations', 'CAD', decodeAssociation)
  const next = await client.continuePage(page.continuation, decodeAssociation)

  assert.equal(mock.calls[1].url, '/api/bio/cont?token=token%2B%2F%3D%3F')
  assert.equal(next.continuation, null)
  assert.deepEqual(next.data, page.data)
})

test('returns typed prefix matches', async () => {
  const mock = mockFetch(fixture('gene-match'))
  const client = createBioIndexClient({ baseUrl: 'https://example.test', fetch: mock.fetch })

  const page = await client.match('gene', 'SLC30', { limit: 3 })

  assert.deepEqual(page.data, ['SLC30A1', 'SLC30A10', 'SLC30A11'])
  assert.equal(mock.calls[0].url, 'https://example.test/api/bio/match/gene?q=SLC30&limit=3')
})

test('rejects invalid requests, HTTP errors, malformed envelopes, and invalid records', async () => {
  const mock = mockFetch(
    new Response('Forbidden', { status: 403 }),
    new Response('not JSON'),
    { data: [], count: 0 },
    { data: [{ name: 'CAD', description: 'CAD', group: 'CARDIOVASCULAR', dichotomous: 2 }] },
    { ...fixture('cad-association'), data: [{}] },
  )
  const client = createBioIndexClient({ baseUrl: 'https://example.test', fetch: mock.fetch })

  await assert.rejects(client.query('../gene', 'CAD', decodeAssociation), TypeError)
  await assert.rejects(client.query('gene', 'CAD', decodeAssociation, { limit: 0 }), RangeError)
  await assert.rejects(client.query('gene', 'CAD', null), TypeError)
  assert.equal(mock.calls.length, 0)
  await assert.rejects(client.query('gene', 'CAD', decodeAssociation), (error) =>
    error instanceof BioIndexHttpError && error.status === 403)
  await assert.rejects(client.query('gene', 'CAD', decodeAssociation), BioIndexResponseError)
  await assert.rejects(client.query('gene', 'CAD', decodeAssociation), /invalid continuation/)
  await assert.rejects(client.phenotypes('md'), /invalid record/)
  await assert.rejects(client.query('gene', 'CAD', decodeAssociation), /invalid record/)
})

test('propagates cancellation before and while reading the response', async () => {
  const aborted = new DOMException('Request aborted', 'AbortError')
  const client = createBioIndexClient({
    baseUrl: 'https://example.test',
    fetch: async () => { throw aborted },
  })

  await assert.rejects(client.phenotypes('md'), (error) => error === aborted)

  const controller = new AbortController()
  const bodyClient = createBioIndexClient({
    baseUrl: 'https://example.test',
    fetch: async () => ({
      ok: true,
      async json() {
        controller.abort()
        throw aborted
      },
    }),
  })
  await assert.rejects(bodyClient.phenotypes('md', { signal: controller.signal }), (error) => error === aborted)
})
