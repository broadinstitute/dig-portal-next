import assert from 'node:assert/strict'
import test from 'node:test'
import { ancestryOptions, datasetsForPhenotype, effectorListsForPhenotype, findPhenotype, phenotypeRouteQuery, readPhenotypeRouteState, selectProvenanceAncestry, provenanceHttpUrl, provenanceStages } from '../src/index.ts'

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
