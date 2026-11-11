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

test('loads dataset metadata including nullable labels', async () => {
  const mock = mockFetch(fixture('datasets'))
  const client = createBioIndexClient({ baseUrl: 'https://example.test', fetch: mock.fetch })

  const datasets = await client.datasets('md')

  assert.equal(mock.calls[0].url, 'https://example.test/api/portal/datasets?q=md')
  assert.deepEqual(datasets[0], {
    name: 'GWAS_CADT2D',
    description: 'Joint T2D-CHD GWAS',
    phenotypes: ['CAD', 'CADinNonT2D', 'CADinT2D', 'T2D'],
    ancestry: 'Mixed',
    ancestryName: 'Mixed',
    technology: 'GWAS',
    subjects: 265678,
    community: null,
  })
  assert.equal(datasets[1].ancestryName, null)
})

test('rejects incomplete or malformed portal metadata', async () => {
  const incomplete = fixture('phenotypes')
  incomplete.count += 1
  const invalid = fixture('datasets')
  invalid.data[0].subjects = -1
  const mock = mockFetch(incomplete, invalid)
  const client = createBioIndexClient({ baseUrl: 'https://example.test', fetch: mock.fetch })

  await assert.rejects(client.phenotypes('md'), /incomplete count/)
  await assert.rejects(client.datasets('md'), /invalid record/)
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

test('collects continuation pages and reports complete results', async () => {
  const first = fixture('cad-association')
  first.continuation = 'next'
  first.progress = { bytes_read: 500, bytes_total: 1000, filtered: 0 }
  const last = fixture('cad-association')
  last.data[0].varId = '9:22100000:A:G'
  last.progress = { bytes_read: 500, bytes_total: 500, filtered: 0 }
  const mock = mockFetch(first, last)
  const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
  const controller = new AbortController()

  const result = await client.queryAll('global-associations', 'CAD', decodeAssociation, { limit: 3, signal: controller.signal })

  assert.deepEqual(result.data.map(({ variantId }) => variantId), ['9:22098574:A:G', '9:22100000:A:G'])
  assert.equal(result.completeness, 'complete')
  assert.equal(result.restricted, 0)
  assert.equal(mock.calls[1].url, '/bioindex/api/bio/cont?token=next')
  assert.equal(mock.calls[1].options.signal, controller.signal)
})

test('reports truncated, restricted, and unknown result completeness', async () => {
  const limited = fixture('cad-association')
  const restricted = fixture('cad-association')
  restricted.restricted = 2
  restricted.progress.bytes_read = restricted.progress.bytes_total
  const unknown = fixture('cad-association')
  delete unknown.restricted
  unknown.progress = null
  const mismatched = fixture('cad-association')
  mismatched.count = 2
  mismatched.progress.bytes_read = mismatched.progress.bytes_total
  const capped = fixture('cad-association')
  capped.progress.bytes_read = capped.progress.bytes_total
  const mock = mockFetch(limited, restricted, unknown, mismatched, capped)
  const client = createBioIndexClient({ baseUrl: '', fetch: mock.fetch })

  assert.equal((await client.queryAll('global-associations', 'CAD', decodeAssociation, { limit: 1 })).completeness, 'partial')
  const restrictedResult = await client.queryAll('global-associations', 'CAD', decodeAssociation)
  assert.equal(restrictedResult.completeness, 'partial')
  assert.equal(restrictedResult.restricted, 2)
  const unknownResult = await client.queryAll('global-associations', 'CAD', decodeAssociation)
  assert.equal(unknownResult.completeness, 'unknown')
  assert.equal(unknownResult.restricted, null)
  assert.equal((await client.queryAll('global-associations', 'CAD', decodeAssociation)).completeness, 'unknown')
  assert.equal((await client.queryAll('global-associations', 'CAD', decodeAssociation, { limit: 1 })).completeness, 'unknown')
})

test('rejects repeated continuation tokens', async () => {
  const first = fixture('cad-association')
  first.continuation = 'repeated'
  const mock = mockFetch(first, first)
  const client = createBioIndexClient({ baseUrl: '', fetch: mock.fetch })

  await assert.rejects(client.queryAll('global-associations', 'CAD', decodeAssociation), /repeated continuation token/)
  assert.equal(mock.calls.length, 2)
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
    { count: 1, data: [{ name: 'CAD', description: 'CAD', group: 'CARDIOVASCULAR', dichotomous: 2 }] },
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

test('builds encoded phenotype plot URLs', () => {
  const client = createBioIndexClient({ baseUrl: 'https://example.test/', fetch: async () => assert.fail('No request expected') })

  assert.equal(client.phenotypePlotUrl('CAD', 'manhattan'), 'https://example.test/api/raw/plot/phenotype/CAD/manhattan.png')
  assert.equal(client.phenotypePlotUrl('A/B C', 'qq', 'EU'), 'https://example.test/api/raw/plot/phenotype/A%2FB%20C/EU/qq.png')
  assert.throws(() => client.phenotypePlotUrl('CAD', 'qq', '../EU'), TypeError)
})
