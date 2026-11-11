import assert from 'node:assert/strict'
import test from 'node:test'
import { ancestryOptions, findPhenotype, phenotypeRouteQuery, readPhenotypeRouteState } from '../src/index.ts'

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
