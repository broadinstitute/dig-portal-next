import assert from 'node:assert/strict'
import test from 'node:test'
import { ancestryOptions, datasetsForPhenotype, effectorListsForPhenotype, findPhenotype, phenotypeRouteQuery, readPhenotypeRouteState, selectProvenanceAncestry, provenanceHttpUrl, provenanceStages, readAssociationTableState, associationTableQuery, associationPValueError, associationMetaSummary, filterVariantAssociations, sortVariantAssociations, associationPage, formatAssociationPValue, formatAssociationEffect, variantAssociationsCsv } from '../src/index.ts'

test('reads legacy phenotype and ancestry query parameters', () => {
  assert.deepEqual(readPhenotypeRouteState({ phenotype: ' CAD ', ancestry: 'EU' }), { phenotype: 'CAD', ancestry: 'EU' })
  assert.deepEqual(readPhenotypeRouteState({ phenotype: ['T2D', 'CAD'], ancestry: [null] }), { phenotype: 'T2D', ancestry: '' })
  assert.deepEqual(readPhenotypeRouteState({ phenotype: '', ancestry: '  ' }), { phenotype: null, ancestry: '' })
})

test('writes only non-empty route state', () => {
  assert.deepEqual(phenotypeRouteQuery({ phenotype: 'CAD', ancestry: '' }), { phenotype: 'CAD' })
  assert.deepEqual(phenotypeRouteQuery({ phenotype: 'CAD', ancestry: 'EA' }), { phenotype: 'CAD', ancestry: 'EA' })
})

test('offers each dataset ancestry once, excluding meta-analysis datasets', () => {
  const dataset = (ancestry) => ({ ancestry })
  assert.deepEqual(ancestryOptions([dataset('EU'), dataset('Mixed'), dataset('EA'), dataset('EU'), dataset('XYZ')]), [
    { value: 'EA', label: 'East Asian' },
    { value: 'EU', label: 'European' },
    { value: 'XYZ', label: 'XYZ' },
  ])
})

test('finds phenotypes by exact name', () => {
  const phenotypes = [{ name: 'CAD' }, { name: 'CADinT2D' }]
  assert.equal(findPhenotype(phenotypes, 'CAD'), phenotypes[0])
  assert.equal(findPhenotype(phenotypes, 'cad'), null)
  assert.equal(findPhenotype(phenotypes, null), null)
})

test('filters and sorts datasets for a phenotype and optional ancestry', () => {
  const dataset = (name, phenotypes, ancestry, subjects) => ({ name, phenotypes, ancestry, subjects })
  const datasets = [
    dataset('CAD EU small', ['CAD'], 'EU', 100),
    dataset('T2D EU', ['T2D'], 'EU', 500),
    dataset('CAD EA', ['CAD'], 'EA', 300),
    dataset('CAD EU large', ['CAD'], 'EU', 400),
  ]
  assert.deepEqual(datasetsForPhenotype(datasets, 'CAD').map(({ name }) => name), [
    'CAD EU large',
    'CAD EA',
    'CAD EU small',
  ])
  assert.deepEqual(datasetsForPhenotype(datasets, 'CAD', 'EU').map(({ name }) => name), [
    'CAD EU large',
    'CAD EU small',
  ])
  assert.deepEqual(datasetsForPhenotype(datasets, null), [])
})

test('matches effector lists by exact trait ID, including multi-trait entries', () => {
  const entries = [
    { traitIds: ['CAD'] },
    { traitIds: ['CADinT2D'] },
    { traitIds: ['T2D', 'CAD'] },
  ]
  assert.deepEqual(effectorListsForPhenotype(entries, 'CAD'), [entries[0], entries[2]])
  assert.deepEqual(effectorListsForPhenotype(entries, 'T2D'), [entries[2]])
  assert.deepEqual(effectorListsForPhenotype(entries, 'cad'), [])
  assert.deepEqual(effectorListsForPhenotype(entries, null), [])
})

test('selects exact provenance without substituting a different trait or ancestry', () => {
  const mixed = { id: 'mixed', ancestryId: 'Mixed' }
  const european = { id: 'eu', ancestryId: 'EU' }
  const traits = [{ legacyId: 'CAD', ancestries: [european, mixed] }, { legacyId: 'CADinT2D', ancestries: [mixed] }]
  assert.equal(selectProvenanceAncestry(traits, 'CAD'), mixed)
  assert.equal(selectProvenanceAncestry(traits, 'CAD', 'EU'), european)
  assert.equal(selectProvenanceAncestry(traits, 'CAD', 'GME'), null)
  assert.equal(selectProvenanceAncestry(traits, 'cad'), null)
  assert.equal(selectProvenanceAncestry([{ legacyId: 'T2D', ancestries: [european] }], 'T2D'), null)
})

test('orders provenance dependencies, preserves parallel stages and resolves resource locations', () => {
  const node = (id) => ({ id, name: id, type: 'Activity', location: null })
  const graph = {
    activities: ['final', 'sourceB', 'sourceA'].map(node),
    resources: [node('inputA'), node('inputB'), node('dataset'), { ...node('drs'), location: 'drs://result' }],
    used: [{ subject: 'final', object: 'inputA' }, { subject: 'final', object: 'inputB' }],
    generated: [{ subject: 'inputA', object: 'sourceA' }, { subject: 'inputB', object: 'sourceB' }, { subject: 'dataset', object: 'final' }],
    linked: [{ subject: 'dataset', object: 'drs' }],
  }
  const stages = provenanceStages(graph)
  assert.deepEqual(stages.map(({ activity, sequence }) => [activity.id, sequence]), [['sourceA', 1], ['sourceB', 1], ['final', 2]])
  assert.deepEqual(stages[2].inputs.map(({ id }) => id), ['inputA', 'inputB'])
  assert.equal(stages[2].outputs[0].location, 'drs://result')
  assert.equal(graph.resources[2].location, null, 'does not mutate source records')
  graph.used.push({ subject: 'sourceA', object: 'dataset' }, { subject: 'sourceB', object: 'missing' })
  const cyclic = provenanceStages(graph)
  assert.equal(cyclic.find(({ activity }) => activity.id === 'final').sequence, null)
  assert.equal(cyclic.find(({ activity }) => activity.id === 'sourceB').inputs[0].type, 'Unresolved resource')
})

test('makes only credential-free HTTP resource locations clickable', () => {
  assert.equal(provenanceHttpUrl('https://example.org/path'), 'https://example.org/path')
  for (const location of ['javascript:alert(1)', 'data:text/html,test', 's3://bucket/key', 'drs://id', 'https://user:password@example.org', '/relative', null]) {
    assert.equal(provenanceHttpUrl(location), null)
  }
})

const defaultAssociationState = () => readAssociationTableState({})
const association = (patch = {}) => ({
  variantId: '2:20:A:G', phenotype: 'TRAIT', ancestry: 'Mixed', chromosome: '2', position: 20,
  reference: 'A', alternate: 'G', rsId: 'rs1', consequence: null, nearestGenes: ['GENE'],
  pValue: 1e-9, beta: 0.2, metaTypes: ['bottom-line'], dataset: 'study', source: 'common', ...patch,
})

test('round-trips URL-backed association filters, sorting and pagination', () => {
  const state = readAssociationTableState({
    assocGene: ['CDKN2B', 'OTHER'], assocP: ' 5e-8 ', assocEffect: 'negative', assocMeta: 'bottom-line;largest',
    assocSort: 'position', assocOrder: 'desc', assocPage: '3', assocPageSize: '25',
  })
  assert.deepEqual(state, { gene: 'CDKN2B', pValue: '5e-8', effect: 'negative', meta: 'bottom-line;largest', sort: 'position', order: 'desc', page: 3, pageSize: 25 })
  assert.deepEqual(readAssociationTableState(associationTableQuery(state)), state)
  assert.deepEqual(associationTableQuery(defaultAssociationState()), {})
  const invalid = readAssociationTableState({ assocPage: 'Infinity', assocPageSize: '-1', assocEffect: 'typo', assocSort: 'typo' })
  assert.equal(invalid.page, 1)
  assert.equal(invalid.pageSize, 10)
  assert.equal(invalid.effect, 'all')
  assert.equal(invalid.sort, 'pValue')
})

test('validates scientific p-value thresholds without silently rounding underflow to zero', () => {
  for (const input of ['', '0', '1', '.05', '5e-8', '5e-324', '0e-999', '+.5']) assert.equal(associationPValueError(input), null, input)
  for (const input of ['-0.1', '2', 'NaN', 'Infinity', '0x1', '1e-999', 'abc']) assert.ok(associationPValueError(input), input)
  assert.throws(() => filterVariantAssociations([], { ...defaultAssociationState(), pValue: 'invalid' }), RangeError)
})

test('filters exact genes, raw p-values, effect direction and entire meta-analysis combinations', () => {
  const target = association({ nearestGenes: ['OTHER', 'GENE'], beta: -0.2, metaTypes: ['largest', 'bottom-line'] })
  const records = [target, association({ nearestGenes: ['GENE2'] }), association({ pValue: 0.1 }), association({ beta: 0 }), association({ beta: null })]
  const state = { ...defaultAssociationState(), gene: 'GENE', pValue: '5e-8', effect: 'negative', meta: 'bottom-line;largest' }
  assert.deepEqual(filterVariantAssociations(records, state), [target])
  assert.equal(filterVariantAssociations(records, { ...defaultAssociationState(), effect: 'positive' }).length, 2)
  assert.equal(filterVariantAssociations(records, { ...defaultAssociationState(), gene: 'gene' }).length, 0)
})

test('counts every recorded meta-analysis combination exactly once', () => {
  const records = ['bottom-line', 'bottom-line;min_p', 'bottom-line;largest', 'bottom-line;min_p;largest']
    .map((types) => association({ metaTypes: types.split(';') }))
  records.push(association({ metaTypes: [] }), association({ metaTypes: ['future_analysis'] }))
  const summary = associationMetaSummary(records)
  assert.equal(summary.reduce((sum, item) => sum + item.count, 0), records.length)
  assert.ok(summary.some(({ key }) => key === 'bottom-line;largest'))
  assert.ok(summary.some(({ label }) => label === 'Not recorded'))
  assert.ok(summary.some(({ label }) => label === 'future_analysis'))
})

test('sorts loci numerically and keeps missing effects last in either direction without mutating source data', () => {
  const records = [association({ chromosome: '10', position: 1, beta: null }), association({ chromosome: '2', position: 30, beta: -1 }), association({ chromosome: 'X', beta: 0 }), association({ chromosome: '2', position: 20, beta: 1 })]
  const original = records.slice()
  const state = { ...defaultAssociationState(), sort: 'position' }
  assert.deepEqual(sortVariantAssociations(records, state).map(({ chromosome, position }) => `${chromosome}:${position}`), ['2:20', '2:30', '10:1', 'X:20'])
  for (const order of ['asc', 'desc']) {
    const sorted = sortVariantAssociations(records, { ...state, sort: 'effect', order })
    assert.equal(sorted.at(-1).beta, null)
    assert.equal(sorted[0].beta, order === 'asc' ? -1 : 1)
  }
  assert.deepEqual(records, original)
})

test('clamps pages after filtering and exports every filtered record with raw statistics and safe CSV quoting', () => {
  const records = Array.from({ length: 27 }, (_, index) => association({ variantId: `2:${index + 1}:A:G`, pValue: Number.MIN_VALUE, beta: -0.143 }))
  const page = associationPage(records, 99, 10)
  assert.equal(page.page, 3)
  assert.equal(page.records.length, 7)
  assert.equal(page.start, 21)
  assert.equal(page.end, 27)
  assert.equal(associationPage([], 99, 10).start, 0)
  assert.throws(() => associationPage(records, 0, 10), RangeError)
  const csv = variantAssociationsCsv(records)
  assert.equal(csv.trim().split('\r\n').length, 28)
  assert.ok(csv.includes('"5e-324","-0.143"'))
  const escaped = variantAssociationsCsv([association({ dataset: '=HYPERLINK("https://example.test")', nearestGenes: ['G"ENE'], source: 'line1\nline2' })])
  assert.ok(escaped.includes('"\'=HYPERLINK(""https://example.test"")"'))
  assert.ok(escaped.includes('"G""ENE"'))
  assert.ok(escaped.includes('"line1\nline2"'))
})

test('formats tiny p-values and reports odds ratios for binary traits while retaining zero and missing effects', () => {
  assert.equal(formatAssociationPValue(Number.MIN_VALUE), '≤5e-324')
  assert.equal(formatAssociationPValue(0), '≤5e-324')
  assert.equal(formatAssociationPValue(5e-8), '5e-8')
  assert.equal(formatAssociationEffect(-0.143, true), '0.8668')
  assert.equal(formatAssociationEffect(-0.143, false), '-0.143')
  assert.equal(formatAssociationEffect(0, true), '1')
  assert.equal(formatAssociationEffect(0, false), '0')
  assert.equal(formatAssociationEffect(null, true), 'Not available')
  assert.equal(formatAssociationEffect(1000, true), 'Too large to display')
})
