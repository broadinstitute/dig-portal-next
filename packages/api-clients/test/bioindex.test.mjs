import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodePathwayAssociation } from '../src/index.ts'
import { BioIndexHttpError, BioIndexResponseError, createBioIndexClient, createProvenanceClient, decodeVariantAssociation, decodePigeanGeneSupport, decodeHugeGeneScore, decodeFalconGeneProbability, decodePigeanGeneSetEvidence, decodeCs2ctRecord } from '../src/index.ts'

test('decodes recorded pathway statistics without mixing distinct standard errors or transforming beta', () => {
  const records = fixture('pathway-records')
  const cad = decodePathwayAssociation(records.cad[0])
  const eu = decodePathwayAssociation(records.european[0])
  assert.equal(cad.standardError, records.cad[0].stdErr)
  assert.equal(cad.betaStandardError, null)
  assert.equal(cad.geneCount, null)
  assert.equal(eu.standardError, 0.21346)
  assert.equal(eu.betaStandardError, 0.074097)
  assert.equal(eu.geneCount, 29)
  assert.equal(decodePathwayAssociation({ ...records.cad[0], beta: -1.25, pValue: 0, stdErr: 0, numGenes: 0, betaStdErr: 0 }).beta, -1.25)
  for (const patch of [{ pValue: -1 }, { pValue: 1.1 }, { beta: Infinity }, { stdErr: -1 }, { stdErr: undefined }, { betaStdErr: -1 }, { numGenes: 1.5 }, { pathwayName: '' }, { phenotype: null }]) {
    assert.throws(() => decodePathwayAssociation({ ...records.cad[0], ...patch }), BioIndexResponseError)
  }
})

test('queries pathway associations with verified phenotype/ancestry keys, cap and cancellation', async () => {
  const records = fixture('pathway-records')
  const envelope = (data) => ({ data, count: data.length, continuation: null, restricted: 0, progress: { bytes_read: 100, bytes_total: 100 } })
  const mock = mockFetch(envelope(records.cad), envelope(records.european), envelope(records.t2d))
  const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
  const signal = new AbortController().signal
  const combined = await client.pathwayAssociations('CAD', '', { signal })
  await client.pathwayAssociations('CAD', 'EU', { signal, limit: 20 })
  await client.pathwayAssociations('T2D', '', { signal })
  assert.deepEqual(mock.calls.map(({ url }) => url), [
    '/bioindex/api/bio/query/pathway-associations?q=CAD&limit=100',
    '/bioindex/api/bio/query/pathway-associations?q=CAD%2CEU&limit=20',
    '/bioindex/api/bio/query/pathway-associations?q=T2D&limit=100',
  ])
  assert.equal(combined.completeness, 'complete')
  assert.ok(mock.calls.every(({ options }) => options.signal === signal))
  await assert.rejects(client.pathwayAssociations('CAD,EU'), TypeError)
  await assert.rejects(client.pathwayAssociations('CAD', 'EU,CAD'), TypeError)
})

test('rejects mismatched pathway trait and ancestry on initial and continuation pages', async () => {
  const row = fixture('pathway-records').european[0]
  const envelope = (data) => ({ data, count: data.length, continuation: null, restricted: 0, progress: { bytes_read: 100, bytes_total: 100 } })
  for (const patch of [{ phenotype: 'T2D' }, { ancestry: 'EA' }]) {
    const wrong = envelope([{ ...row, ...patch }])
    const mock = mockFetch(wrong, { ...envelope([row]), continuation: 'next', progress: { bytes_read: 50, bytes_total: 100 } }, wrong)
    const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
    await assert.rejects(client.pathwayAssociations('CAD', 'EU'), BioIndexResponseError)
    await assert.rejects(client.pathwayAssociations('CAD', 'EU'), BioIndexResponseError)
    assert.match(mock.calls[2].url, /\/cont\?token=next/)
  }
})

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

test('loads CS2CT annotation tuples without inventing a data/count envelope', async () => {
  const mock = mockFetch(fixture('cs2ct-annotations'), { keys: [['z'], ['a'], ['z']] }, { keys: [['a', 'b']] }, { keys: [[null]] }, { data: [] }, { keys: [], continuation: 'next' })
  const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
  const signal = new AbortController().signal
  const annotations = await client.cs2ctAnnotations({ signal })
  assert.ok(annotations.includes('accessible_chromatin'))
  assert.equal(annotations.length, 5)
  assert.equal(mock.calls[0].url, '/bioindex/api/bio/keys/c2ct-annotation/2?columns=annotation')
  assert.equal(mock.calls[0].options.signal, signal)
  assert.deepEqual(await client.cs2ctAnnotations(), ['a', 'z'])
  for (let i = 0; i < 4; i++) await assert.rejects(client.cs2ctAnnotations(), BioIndexResponseError)
})

test('decodes CS2CT statistics while retaining missing names and original identifiers', () => {
  const raw = fixture('cs2ct-records').european[0]
  const decoded = decodeCs2ctRecord(raw)
  assert.equal(decoded.score, raw.Q)
  assert.equal(decoded.variantCount, raw.varTotal)
  assert.equal(decoded.overlapProbability, raw.posteriorProbability)
  assert.equal(decoded.genericity, raw.totalEntropy)
  assert.equal(decoded.biosample, raw.biosample)
  assert.equal(decodeCs2ctRecord(fixture('cs2ct-records').negative).score, -0.003709092740890707)
  const missing = decodeCs2ctRecord({ ...raw, tissue: null, biosample: undefined, overlapLeadSNP: '', varTotal: 0, totalEntropy: 0, Q: 0, posteriorProbability: 0 })
  assert.deepEqual([missing.tissue, missing.biosample, missing.overlapLeadVariant], [null, null, null])
  assert.equal(missing.score, 0)
  for (const patch of [{ Q: NaN }, { totalEntropy: Infinity }, { posteriorProbability: 1.1 }, { varTotal: 1.5 }, { clumpStart: -1 }, { clumpEnd: raw.clumpStart - 1 }, { tissue: 42 }, { dataset: '' }]) {
    assert.throws(() => decodeCs2ctRecord({ ...raw, ...patch }), BioIndexResponseError)
  }
})

test('queries CS2CT with phenotype-first keys, selected annotation and cancellation', async () => {
  const raw = fixture('cs2ct-records')
  const envelope = (data) => ({ data, count: data.length, continuation: null, progress: { bytes_read: 100, bytes_total: 100 }, restricted: 0 })
  const mock = mockFetch(envelope(raw.cad), envelope(raw.european), envelope(raw.t2d))
  const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
  const signal = new AbortController().signal
  await client.cs2ct('CAD', '', '', { signal })
  await client.cs2ct('CAD', 'EU', 'accessible_chromatin', { signal, limit: 25 })
  await client.cs2ct('T2D', '', 'enhancer', { signal })
  assert.deepEqual(mock.calls.map(({ url }) => url), [
    '/bioindex/api/bio/query/c2ct?q=CAD&limit=1000',
    '/bioindex/api/bio/query/c2ct-annotation?q=CAD%2CEU%2Caccessible_chromatin&limit=25',
    '/bioindex/api/bio/query/c2ct-annotation?q=T2D%2Cenhancer&limit=1000',
  ])
  assert.ok(mock.calls.every(({ options }) => options.signal === signal))
  await assert.rejects(client.cs2ct('CAD,EU'), TypeError)
  await assert.rejects(client.cs2ct('CAD', '', 'enhancer,promoter'), TypeError)
})

test('rejects wrong CS2CT trait, ancestry and annotation on initial and continuation pages', async () => {
  const row = fixture('cs2ct-records').european[0]
  const envelope = (data) => ({ data, count: data.length, continuation: null, progress: { bytes_read: 100, bytes_total: 100 }, restricted: 0 })
  for (const patch of [{ phenotype: 'T2D' }, { ancestry: 'EA' }, { annotation: 'promoter' }]) {
    const wrong = envelope([{ ...row, ...patch }])
    const mock = mockFetch(wrong, { ...envelope([row]), continuation: 'next', progress: { bytes_read: 50, bytes_total: 100 } }, wrong)
    const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
    await assert.rejects(client.cs2ct('CAD', 'EU', 'accessible_chromatin'), BioIndexResponseError)
    await assert.rejects(client.cs2ct('CAD', 'EU', 'accessible_chromatin'), BioIndexResponseError)
    assert.match(mock.calls[2].url, /\/cont\?token=next/)
  }
})

test('decodes recorded PIGEAN, HuGE, FALCON and gene-set evidence without confusing score units', () => {
  const raw = fixture('gene-support-records')
  const p = raw.pigean.map(decodePigeanGeneSupport)
  assert.equal(p[0].combined, 11.4)
  assert.equal(p[0].direct, 5.13)
  assert.equal(p[0].indirect, 6.25)
  assert.equal(p.at(-1).factor, null)
  assert.equal(decodeHugeGeneScore(raw.huge[0]).score, 6960)
  assert.notEqual(raw.pigean[1].huge_score, 6960, 'PIGEAN huge_score is not the HuGE feed')
  assert.equal(decodeFalconGeneProbability({ ...raw.falcon[0], PIP: 0 }).pip, 0)
  assert.equal(decodePigeanGeneSetEvidence(raw.joined[0]).jointEffect, 1.33)
  for (const [decode, value] of [[decodePigeanGeneSupport, { ...raw.pigean[0], combined: NaN }], [decodeHugeGeneScore, { ...raw.huge[0], huge: -1 }], [decodeHugeGeneScore, { ...raw.huge[0], end: -1 }], [decodeFalconGeneProbability, { ...raw.falcon[0], PIP: 1.1 }], [decodeFalconGeneProbability, { ...raw.falcon[0], PIP: '0.5' }], [decodePigeanGeneSetEvidence, { ...raw.joined[0], beta: Infinity }]]) {
    assert.throws(() => decode(value), BioIndexResponseError)
  }
})

test('queries gene-support sources with verified keys, explicit limits and cancellation', async () => {
  const raw = fixture('gene-support-records')
  const envelope = (data) => ({ ...fixture('cad-association'), data: [data] })
  const mock = mockFetch(envelope(raw.pigean[0]), envelope(raw.huge[0]), envelope(raw.falcon[0]), envelope(raw.joined[0]))
  const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
  const signal = new AbortController().signal
  const model = { sigma: 2, geneSetCollection: 'mouse_msigdb' }
  await client.pigeanGeneSupport('CAD', model, { signal })
  await client.hugeGeneScores('CAD', { signal })
  await client.falconGeneProbabilities('CAD', { signal })
  await client.pigeanGeneSets('CAD', 'LDLR', model, { signal, limit: 20 })
  assert.deepEqual(mock.calls.map(({ url }) => url), [
    '/bioindex/api/bio/query/pigean-gene-phenotype?q=CAD%2C2%2Cmouse_msigdb&limit=1000',
    '/bioindex/api/bio/query/huge-phenotype?q=CAD&limit=1000',
    '/bioindex/api/bio/query/falcon.trait.associated.genes?q=CAD&limit=2000',
    '/bioindex/api/bio/query/pigean-joined-gene?q=CAD%2CLDLR%2C2%2Cmouse_msigdb&limit=20',
  ])
  assert.ok(mock.calls.every(({ options }) => options.signal === signal))
  await assert.rejects(client.pigeanGeneSupport('CAD', { ...model, sigma: 0 }), /sigma/)
  await assert.rejects(client.pigeanGeneSets('CAD', 'LDLR,OTHER', model), /single genetic-support/)
})

test('rejects wrong-phenotype, wrong-model and wrong-gene support records through continuation pages', async () => {
  const raw = fixture('gene-support-records')
  const envelope = (value) => ({ ...fixture('cad-association'), data: [value] })
  const first = envelope(raw.pigean[0]); first.continuation = 'next'
  const mock = mockFetch(first, envelope(raw.t2d[0]), envelope({ ...raw.pigean[0], gene_set_size: 'other' }), envelope({ ...raw.huge[0], phenotype: 'T2D' }), envelope({ ...raw.falcon[0], TRAIT: 'T2D' }), envelope(raw.joined[0]))
  const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
  const model = { sigma: 2, geneSetCollection: 'mouse_msigdb' }
  await assert.rejects(client.pigeanGeneSupport('CAD', model), /invalid record/)
  assert.ok(mock.calls[1].url.includes('/api/bio/cont?token=next'))
  await assert.rejects(client.pigeanGeneSupport('CAD', model), /invalid record/)
  await assert.rejects(client.hugeGeneScores('CAD'), /invalid record/)
  await assert.rejects(client.falconGeneProbabilities('CAD'), /invalid record/)
  await assert.rejects(client.pigeanGeneSets('CAD', 'APOE', model), /invalid record/)
})

test('decodes recorded association annotations, absent fields, binary and quantitative effects', () => {
  const records = fixture('association-records')
  const cad = records.cad.map(decodeVariantAssociation)
  assert.equal(cad[0].phenotype, 'CAD')
  assert.ok(cad.some(({ metaTypes }) => metaTypes.includes('largest') && !metaTypes.includes('min_p')))
  assert.ok(cad.some(({ rsId }) => rsId === null))
  assert.ok(cad.some(({ pValue }) => pValue === Number.MIN_VALUE))
  assert.equal(decodeVariantAssociation(records.european).ancestry, 'EU')
  assert.equal(decodeVariantAssociation(records.t2d).beta, -0.143)
  assert.equal(decodeVariantAssociation(records.quantitative).beta, 0.0591)
  const optional = { ...records.european, beta: null, dbSNP: null, nearest: null, consequence: null, inMetaTypes: null }
  assert.deepEqual(decodeVariantAssociation(optional).nearestGenes, [])
  assert.deepEqual(decodeVariantAssociation(optional).metaTypes, [])
  assert.equal(decodeVariantAssociation(optional).beta, null)
  for (const patch of [{ pValue: -1 }, { pValue: 1.1 }, { pValue: NaN }, { beta: Infinity }, { position: 1.5 }, { position: 0 }, { nearest: 'CDKN2B' }, { nearest: [42] }, { inMetaTypes: [] }, { alt: '' }]) {
    assert.throws(() => decodeVariantAssociation({ ...records.european, ...patch }), BioIndexResponseError)
  }
})

test('queries typed phenotype associations with the correct index, cap and cancellation', async () => {
  const eu = { ...fixture('cad-association'), data: [fixture('association-records').european] }
  const mock = mockFetch(fixture('cad-association'), eu)
  const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
  const signal = new AbortController().signal
  const { variantAssociations } = client
  const combined = await variantAssociations('CAD', '', { signal })
  const european = await variantAssociations('CAD', 'EU', { limit: 25, signal })
  assert.equal(mock.calls[0].url, '/bioindex/api/bio/query/global-associations?q=CAD&limit=1000')
  assert.equal(mock.calls[1].url, '/bioindex/api/bio/query/ancestry-global-associations?q=CAD%2CEU&limit=25')
  assert.ok(mock.calls.every(({ options }) => options.signal === signal))
  assert.equal(combined.data[0].variantId, '9:22098574:A:G')
  assert.equal(european.data[0].variantId, '9:22106225:G:A')
  assert.equal(combined.completeness, 'partial')
  await assert.rejects(variantAssociations('CAD,EU'), /single phenotype/)
  await assert.rejects(variantAssociations('CAD', 'EU,CAD'), /ancestry code/)
})

test('rejects records for another phenotype or ancestry, including continuation pages', async () => {
  const first = fixture('cad-association')
  first.continuation = 'next'
  const wrongTrait = { ...fixture('cad-association'), data: [fixture('association-records').t2d] }
  const mock = mockFetch(first, wrongTrait, fixture('cad-association'))
  const client = createBioIndexClient({ baseUrl: '/bioindex', fetch: mock.fetch })
  await assert.rejects(client.variantAssociations('CAD'), /invalid record/)
  assert.ok(mock.calls[1].url.includes('/api/bio/cont?token=next'))
  await assert.rejects(client.variantAssociations('CAD', 'EU'), /invalid record/)
})

test('loads recorded bottom-line traits and provenance with cancellation', async () => {
  const recorded = fixture('cad-provenance')
  const mock = mockFetch(fixture('bottom-line-traits'), recorded)
  const client = createProvenanceClient({ baseUrl: 'https://example.test/artifact_provenance/', fetch: mock.fetch })
  const signal = new AbortController().signal
  const traits = await client.traits({ signal })
  assert.deepEqual(traits.map(({ legacyId }) => legacyId), ['CAD', 'T2D'])
  const artifact = traits[0].ancestries.find(({ ancestryId }) => ancestryId === 'Mixed')
  const detail = await client.provenance(artifact.id, { signal })
  assert.equal(detail.traitId, 'CAD')
  assert.equal(detail.ancestryId, 'Mixed')
  assert.equal(detail.graph.activities.length, 2)
  assert.equal(detail.graph.resources.length, 5)
  assert.deepEqual(detail.raw, recorded.provenance)
  assert.equal(mock.calls[0].url, 'https://example.test/artifact_provenance/ws/bottom_line/trait_list_full')
  assert.equal(mock.calls[1].url, client.provenanceUrl(artifact.id))
  assert.ok(mock.calls.every(({ options }) => options.signal === signal))
  assert.equal(client.summaryStatisticsUrl('CAD', 'Mixed'), 'https://dig-open-bottom-line-analysis.s3.amazonaws.com/bottom-line/Mixed/CAD.sumstats.tsv.gz')
  assert.ok(client.provenanceUrl('a?b&c').endsWith('?id=a%3Fb%26c'))
})

test('rejects malformed, mismatched and failed provenance responses', async () => {
  const missingArray = fixture('cad-provenance')
  delete missingArray.provenance.used_edges
  const duplicate = fixture('cad-provenance')
  duplicate.provenance.activities.push(duplicate.provenance.activities[0])
  const mock = mockFetch({}, missingArray, duplicate, fixture('cad-provenance'), new Response('unavailable', { status: 503 }), new Response('<html>unavailable</html>'))
  const client = createProvenanceClient({ baseUrl: '/provenance', fetch: mock.fetch })
  await assert.rejects(client.traits(), /array/)
  await assert.rejects(client.provenance(missingArray.id), /array/)
  await assert.rejects(client.provenance(duplicate.id), /Duplicate/)
  await assert.rejects(client.provenance('wrong-artifact'), /does not match/)
  await assert.rejects(client.traits(), { status: 503 })
  await assert.rejects(client.traits(), /not valid JSON/)
  await assert.rejects(client.provenance(''), /artifact ID/)
})

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
