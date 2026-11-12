import assert from 'node:assert/strict'
import test from 'node:test'
import { readCs2ctState, cs2ctQuery, cs2ctFilterError, cs2ctEligibleRows, cs2ctLabel, cs2ctTissueKey, missingCs2ctTissue, filterCs2ctRows, sortCs2ctRows, cs2ctCsv, cs2ctVariantRegion } from '../src/index.ts'
import { ancestryOptions, datasetsForPhenotype, effectorListsForPhenotype, findPhenotype, phenotypeRouteQuery, readPhenotypeRouteState, selectProvenanceAncestry, provenanceHttpUrl, provenanceStages, readAssociationTableState, associationTableQuery, associationPValueError, associationMetaSummary, filterVariantAssociations, sortVariantAssociations, associationPage, formatAssociationPValue, formatAssociationEffect, variantAssociationsCsv, readGeneSupportState, geneSupportQuery, geneSupportRows, geneSupportMinimumError, filterGeneSupportRows, sortGeneSupportRows, geneticSupportCsv, geneSupportPlotPoints, geneSupportEvidence } from '../src/index.ts'

const csRow = (patch = {}) => ({ phenotype: 'CAD', ancestry: 'EU', annotation: 'accessible_chromatin', tissue: 'central_nervous_system', biosample: 'glial_cell', source: 'credible_set', dataset: 'dataset', credibleSetId: 'set1', chromosome: '6', clumpStart: 100, clumpEnd: 201, variantCount: 2, overlapLeadVariant: '6:200:G:A', overlapProbability: 0.9501932626366195, genericity: 1.5, score: 0.65, ...patch })

test('roundtrips CS2CT multi-select query state and normalizes invalid controls', () => {
  const state = readCs2ctState({ csAnnotation: 'enhancer', csSource: ['credible_set', null, ' credible_set ', 'common'], csTissue: ['blood', '__missing__'], csVariants: '2', csGenericity: '.5', csSort: 'tissue', csOrder: 'asc', csPage: '3' })
  assert.deepEqual(state.sources, ['credible_set', 'common'])
  assert.deepEqual(readCs2ctState(cs2ctQuery(state)), state)
  assert.deepEqual(cs2ctQuery(readCs2ctState({ csSort: 'nonsense', csPage: '-1' })), {})
  for (const csVariants of ['-1', '2.5', '1e3', 'NaN', '9007199254740992']) assert.ok(cs2ctFilterError(readCs2ctState({ csVariants })))
  for (const csGenericity of ['-1', 'Infinity', '1e999', '0x10', 'word']) assert.ok(cs2ctFilterError(readCs2ctState({ csGenericity })))
  assert.equal(cs2ctFilterError(readCs2ctState({ csVariants: '0', csGenericity: '1e-3' })), null)
})

test('filters CS2CT exact sources and tissues with inclusive bounds and null names', () => {
  const rows = Object.freeze([Object.freeze(csRow()), Object.freeze(csRow({ source: 'bottom-line_analysis_rare' })), Object.freeze(csRow({ tissue: null, biosample: null, variantCount: 0, genericity: 0, score: 0 })), Object.freeze(csRow({ tissue: 'blood', source: 'common' }))])
  const eligible = cs2ctEligibleRows(rows)
  assert.equal(eligible.length, 3)
  assert.equal(rows.length, 4)
  assert.equal(cs2ctLabel(rows[0].biosample), 'glial cell')
  assert.equal(rows[0].biosample, 'glial_cell')
  assert.equal(cs2ctLabel(null), 'Not recorded')
  assert.equal(cs2ctTissueKey(rows[2]), missingCs2ctTissue)
  assert.deepEqual(filterCs2ctRows(eligible, readCs2ctState({ csTissue: ['__missing__'], csVariants: '0', csGenericity: '0' })), [rows[2]])
  assert.deepEqual(filterCs2ctRows(eligible, readCs2ctState({ csSource: ['credible_set', 'common'], csTissue: ['blood', 'central_nervous_system'], csVariants: '2', csGenericity: '1.5' })), [rows[0], rows[3]])
  assert.equal(filterCs2ctRows(eligible, readCs2ctState({ csSource: 'credible' })).length, 0)
  assert.throws(() => filterCs2ctRows(eligible, readCs2ctState({ csVariants: 'bad' })), RangeError)
})

test('sorts CS2CT numerically and keeps missing labels last without mutating rows', () => {
  const rows = Object.freeze([csRow({ score: 2, tissue: 'z' }), csRow({ score: 10, tissue: null }), csRow({ score: 1, tissue: 'a' })])
  assert.deepEqual(sortCs2ctRows(rows, readCs2ctState({})).map((r) => r.score), [10, 2, 1])
  for (const csOrder of ['asc', 'desc']) assert.equal(sortCs2ctRows(rows, readCs2ctState({ csSort: 'tissue', csOrder })).at(-1).tissue, null)
  assert.deepEqual(rows.map((r) => r.score), [2, 10, 1])
})

test('exports every supplied filtered CS2CT row with raw identifiers, precision and CSV escaping', () => {
  const rows = Array.from({ length: 23 }, (_, i) => csRow({ credibleSetId: `set${i}` }))
  assert.equal(associationPage(rows, 3, 10).records.length, 3)
  const csv = cs2ctCsv(rows)
  assert.equal(csv.trim().split('\r\n').length, 24)
  assert.match(csv, /glial_cell/)
  assert.match(csv, /0\.9501932626366195/)
  const escaped = cs2ctCsv([csRow({ biosample: '=1+1', tissue: 'a,"b"' })])
  assert.match(escaped, /'=1\+1/)
  assert.match(escaped, /"a,""b"""/)
})

test('builds CS2CT Sifter regions from usable same-chromosome variants', () => {
  assert.equal(cs2ctVariantRegion(csRow()), '6:1-200200')
  assert.equal(cs2ctVariantRegion(csRow({ overlapLeadVariant: '6:1000000:G:A' })), '6:800000-1200000')
  for (const overlapLeadVariant of [null, 'rs123', '6:0:G:A', '7:200:G:A', '6:9007199254740992:G:A']) assert.equal(cs2ctVariantRegion(csRow({ overlapLeadVariant })), null)
})

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

const support = (patch = {}) => ({ phenotype: 'CAD', gene: 'GENE', combined: 11.4, direct: 5.13, indirect: 6.25, factor: 'Factor1', factorLabel: 'Factor label', sigma: 2, geneSetCollection: 'mouse_msigdb', ...patch })
const huge = (patch = {}) => ({ phenotype: 'CAD', gene: 'GENE', chromosome: '1', start: 10, end: 20, score: 6960, common: 20, rare: 348, ...patch })

test('round-trips gene-support URLs and validates tab-specific sorting and score thresholds', () => {
  const state = readGeneSupportState({ supportTab: 'huge', supportGene: 'GENE', supportMin: '3', supportSort: 'common', supportOrder: 'asc', supportPage: '2' })
  assert.deepEqual(readGeneSupportState(geneSupportQuery(state)), state)
  assert.deepEqual(geneSupportQuery(readGeneSupportState({})), {})
  assert.equal(readGeneSupportState({ supportTab: 'huge', supportSort: 'combined', supportPage: '-1' }).sort, 'huge')
  assert.equal(readGeneSupportState({ supportTab: 'unknown', supportPage: 'Infinity' }).page, 1)
  assert.equal(readGeneSupportState({ supportTab: 'direct-indirect', supportSort: 'pip' }).sort, 'combined')
  assert.equal(geneSupportMinimumError('-2', 'combined'), null)
  assert.ok(geneSupportMinimumError('-2', 'huge'))
  for (const value of ['bad', 'Infinity', '1e-999']) assert.ok(geneSupportMinimumError(value, 'combined'))
})

test('joins exact gene IDs, retains every HuGE locus, and distinguishes zero from missing values', () => {
  const p = [support(), support({ gene: 'gene' }), support({ gene: 'NO_MATCH' })]
  const h = [huge(), huge({ score: 350, chromosome: '2' }), huge({ gene: 'HUGE_ONLY', score: 0 })]
  const f = [{ phenotype: 'CAD', gene: 'GENE', pip: 0 }, { phenotype: 'CAD', gene: 'GENE', pip: 0.8 }]
  const rows = geneSupportRows(p, h, f, 'comparison')
  assert.equal(rows[0].huge, 6960)
  assert.equal(rows[0].hugeRecords, 2)
  assert.equal(rows[0].combined, 11.4, 'preserves the reported score rather than recomputing a sum')
  assert.equal(rows[0].pip, 0.8)
  assert.equal(rows[1].huge, null, 'does not case-fold gene IDs')
  assert.equal(rows[2].pip, null)
  const hugeRows = geneSupportRows(p, h, f, 'huge')
  assert.equal(hugeRows.length, 3)
  assert.equal(hugeRows[2].huge, 0)
  assert.equal(geneSupportRows(p, [], [{ phenotype: 'CAD', gene: 'GENE', pip: 0 }], 'combined')[0].pip, 0)
  assert.deepEqual(h.map(({ score }) => score), [6960, 350, 0])
  const mismatched = geneSupportRows([support()], [huge({ phenotype: 'T2D' })], [{ phenotype: 'T2D', gene: 'GENE', pip: 1 }], 'combined')[0]
  assert.equal(mismatched.huge, null, 'does not join evidence across traits')
  assert.equal(mismatched.pip, null)
})

test('filters and sorts support rows without dropping missing matches or mutating source arrays', () => {
  const rows = geneSupportRows([support(), support({ gene: 'SECOND', combined: -2 })], [huge()], [], 'combined')
  const state = readGeneSupportState({ supportGene: 'GENE', supportMin: '3' })
  assert.equal(filterGeneSupportRows(rows, state).length, 1)
  assert.throws(() => filterGeneSupportRows(rows, { ...state, minimum: 'bad' }), RangeError)
  assert.equal(filterGeneSupportRows(rows, { ...state, gene: 'GENE2' }).length, 0)
  for (const order of ['asc', 'desc']) assert.equal(sortGeneSupportRows(rows, { ...state, sort: 'huge', order }).at(-1).huge, null)
  assert.equal(sortGeneSupportRows(rows, { ...state, sort: 'combined', order: 'asc' })[0].gene, 'SECOND')
  assert.equal(rows[0].gene, 'GENE')
})

test('plots raw support and natural-log HuGE explicitly, omitting only unplottable values', () => {
  const rows = geneSupportRows([support()], [huge({ score: Math.E })], [], 'comparison')
  const points = geneSupportPlotPoints(rows, 'comparison')
  assert.equal(points.find(({ series }) => series === 'ln(HuGE)').y, 1)
  assert.equal(points.find(({ series }) => series === 'Combined').y, 11.4)
  assert.deepEqual(geneSupportPlotPoints(rows, 'direct-indirect')[0], { gene: 'GENE', x: 5.13, y: 6.25, series: 'Gene' })
  assert.equal(geneSupportPlotPoints(geneSupportRows([], [huge({ score: 0 })], [], 'huge'), 'huge').length, 0)
  assert.equal(geneSupportEvidence(3), 'Strongly suggestive')
  assert.equal(geneSupportEvidence(3.01), 'Very strong')
  assert.equal(geneSupportEvidence(null), 'Not available')
})

test('exports every filtered gene-support row with raw scores, model metadata and safe CSV text', () => {
  const p = Array.from({ length: 23 }, (_, index) => support({ gene: index === 0 ? '=FORMULA' : `GENE${index}`, combined: 1.23456789 }))
  const rows = geneSupportRows(p, [], [], 'combined')
  assert.equal(associationPage(rows, 3, 10).records.length, 3)
  const csv = geneticSupportCsv(rows)
  assert.equal(csv.trim().split('\r\n').length, 24)
  assert.ok(csv.includes('"\'=FORMULA"'))
  assert.ok(csv.includes('"1.23456789"'))
  assert.ok(csv.includes('"2","mouse_msigdb"'))
})
