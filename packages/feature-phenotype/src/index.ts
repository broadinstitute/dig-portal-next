import { ancestryLabel, type Phenotype, type PortalDataset, type ProvenanceGraph, type ProvenanceNode, type ProvenanceTrait, type VariantAssociation, type GlobalEnrichment, type GeneticCorrelation, type PathwayAssociation, type PigeanGeneSupport, type HugeGeneScore, type FalconGeneProbability, type Cs2ctRecord } from '@dig-portal/domain'

export interface PhenotypeRouteState {
  readonly phenotype: string | null
  /** An ancestry code, or an empty string for all ancestries. */
  readonly ancestry: string
}

export interface AncestryOption {
  readonly value: string
  readonly label: string
}

function firstQueryValue(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (typeof candidate !== 'string') return null
  const trimmed = candidate.trim()
  return trimmed === '' ? null : trimmed
}

export function readPhenotypeRouteState(query: Readonly<Record<string, unknown>>): PhenotypeRouteState {
  return {
    phenotype: firstQueryValue(query.phenotype),
    ancestry: firstQueryValue(query.ancestry) ?? '',
  }
}

export function phenotypeRouteQuery(state: PhenotypeRouteState): Record<string, string> {
  return {
    ...(state.phenotype ? { phenotype: state.phenotype } : {}),
    ...(state.ancestry ? { ancestry: state.ancestry } : {}),
  }
}

/** "Mixed" marks cross-ancestry meta-analyses, which have no ancestry-specific results. */
export function ancestryOptions(datasets: readonly PortalDataset[]): AncestryOption[] {
  return [...new Set(datasets.map(({ ancestry }) => ancestry))]
    .filter((code) => code !== '' && code !== 'Mixed')
    .map((code) => ({ value: code, label: ancestryLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function findPhenotype(phenotypes: readonly Phenotype[], name: string | null): Phenotype | null {
  if (!name) return null
  return phenotypes.find((phenotype) => phenotype.name === name) ?? null
}

export function datasetsForPhenotype(
  datasets: readonly PortalDataset[],
  phenotype: string | null,
  ancestry = '',
): PortalDataset[] {
  if (!phenotype) return []
  return datasets
    .filter(({ phenotypes, ancestry: datasetAncestry }) =>
      phenotypes.includes(phenotype) && (!ancestry || datasetAncestry === ancestry))
    .slice()
    .sort((a, b) => b.subjects - a.subjects || a.name.localeCompare(b.name))
}

export function effectorListsForPhenotype<T extends { readonly traitIds: readonly string[] }>(
  entries: readonly T[],
  phenotype: string | null,
): T[] {
  return phenotype ? entries.filter(({ traitIds }) => traitIds.includes(phenotype)) : []
}

/** Never substitute another ancestry's evidence when the requested result is absent. */
export function selectProvenanceAncestry(traits: readonly ProvenanceTrait[], phenotype: string, ancestry = '') {
  return traits.find(({ legacyId }) => legacyId === phenotype)?.ancestries
    .find(({ ancestryId }) => ancestryId === (ancestry || 'Mixed')) ?? null
}

export function provenanceHttpUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export interface ProvenanceStage {
  readonly activity: ProvenanceNode
  /** Parallel stages share a sequence; null means dependencies contain a cycle. */
  readonly sequence: number | null
  readonly inputs: readonly ProvenanceNode[]
  readonly outputs: readonly ProvenanceNode[]
}

export function provenanceStages(graph: ProvenanceGraph): ProvenanceStage[] {
  const resources = new Map(graph.resources.map((node) => [node.id, node]))
  for (const edge of graph.linked) {
    const dataset = resources.get(edge.subject)
    const location = resources.get(edge.object)?.location
    if (dataset && location) resources.set(dataset.id, { ...dataset, location })
  }
  const resource = (id: string): ProvenanceNode => resources.get(id) ?? { id, name: id, type: 'Unresolved resource', location: null }
  const producers = new Map<string, Set<string>>()
  for (const edge of graph.generated) {
    const ids = producers.get(edge.subject) ?? new Set<string>()
    ids.add(edge.object)
    producers.set(edge.subject, ids)
  }
  const dependencies = new Map(graph.activities.map(({ id }) => [id, new Set<string>()]))
  for (const edge of graph.used) {
    for (const producer of producers.get(edge.object) ?? []) {
      if (producer !== edge.subject) dependencies.get(edge.subject)?.add(producer)
    }
  }
  const remaining = new Map(graph.activities.map((activity) => [activity.id, activity]))
  const rows: ProvenanceStage[] = []
  function add(activity: ProvenanceNode, sequence: number | null) {
    rows.push({
      activity, sequence,
      inputs: graph.used.filter(({ subject }) => subject === activity.id).map(({ object }) => resource(object)),
      outputs: graph.generated.filter(({ object }) => object === activity.id).map(({ subject }) => resource(subject)),
    })
  }
  let sequence = 1
  while (remaining.size) {
    const ready = [...remaining.values()]
      .filter(({ id }) => [...dependencies.get(id)!].every((id) => !remaining.has(id)))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    if (!ready.length) {
      for (const activity of remaining.values()) add(activity, null)
      break
    }
    for (const activity of ready) {
      add(activity, sequence)
      remaining.delete(activity.id)
    }
    sequence += 1
  }
  return rows
}

export interface AssociationTableState {
  readonly gene: string
  readonly pValue: string
  readonly effect: 'all' | 'positive' | 'negative'
  readonly meta: string
  readonly sort: 'pValue' | 'position' | 'effect'
  readonly order: 'asc' | 'desc'
  readonly page: number
  readonly pageSize: 10 | 25 | 50
}

export const associationQueryKeys = ['assocGene', 'assocP', 'assocEffect', 'assocMeta', 'assocSort', 'assocOrder', 'assocPage', 'assocPageSize'] as const

export function readAssociationTableState(query: Readonly<Record<string, unknown>>): AssociationTableState {
  const effect = firstQueryValue(query.assocEffect)
  const sort = firstQueryValue(query.assocSort)
  const page = Number(firstQueryValue(query.assocPage))
  const pageSize = Number(firstQueryValue(query.assocPageSize))
  return {
    gene: firstQueryValue(query.assocGene) ?? '',
    pValue: firstQueryValue(query.assocP) ?? '',
    effect: effect === 'positive' || effect === 'negative' ? effect : 'all',
    meta: firstQueryValue(query.assocMeta) ?? '',
    sort: sort === 'position' || sort === 'effect' ? sort : 'pValue',
    order: firstQueryValue(query.assocOrder) === 'desc' ? 'desc' : 'asc',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: pageSize === 25 || pageSize === 50 ? pageSize : 10,
  }
}

export function associationTableQuery(state: AssociationTableState): Record<string, string> {
  return {
    ...(state.gene ? { assocGene: state.gene } : {}),
    ...(state.pValue ? { assocP: state.pValue } : {}),
    ...(state.effect !== 'all' ? { assocEffect: state.effect } : {}),
    ...(state.meta ? { assocMeta: state.meta } : {}),
    ...(state.sort !== 'pValue' ? { assocSort: state.sort } : {}),
    ...(state.order !== 'asc' ? { assocOrder: state.order } : {}),
    ...(state.page !== 1 ? { assocPage: String(state.page) } : {}),
    ...(state.pageSize !== 10 ? { assocPageSize: String(state.pageSize) } : {}),
  }
}

export function associationPValueError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)
    || !Number.isFinite(Number(trimmed)) || Number(trimmed) > 1) {
    return 'Enter a p-value between 0 and 1, such as 5e-8.'
  }
  if (Number(trimmed) === 0 && /[1-9]/.test(trimmed.split(/e/i)[0]!)) {
    return 'Enter 0 or a p-value of at least 5e-324.'
  }
  return null
}

const metaLabels: Readonly<Record<string, string>> = {
  'bottom-line': 'Bottom-line',
  min_p: 'Minimum p-value',
  largest: 'Largest sample size',
}

export function associationMetaKey(types: readonly string[]): string {
  const order = ['bottom-line', 'min_p', 'largest']
  const rank = (type: string) => order.includes(type) ? order.indexOf(type) : order.length
  return [...new Set(types)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).join(';')
}

export function associationMetaLabel(key: string): string {
  return key ? key.split(';').map((type) => Object.hasOwn(metaLabels, type) ? metaLabels[type] : type).join(' + ') : 'Not recorded'
}

/** Counts every combination, including combinations not named in the legacy legend. */
export function associationMetaSummary(records: readonly VariantAssociation[]) {
  const counts = new Map<string, number>()
  for (const record of records) {
    const key = associationMetaKey(record.metaTypes)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, label: associationMetaLabel(key), count }))
}

export function filterVariantAssociations(records: readonly VariantAssociation[], state: AssociationTableState): VariantAssociation[] {
  const error = associationPValueError(state.pValue)
  if (error) throw new RangeError(error)
  const threshold = state.pValue.trim() ? Number(state.pValue) : 1
  return records.filter((record) => (!state.gene || record.nearestGenes.includes(state.gene))
    && record.pValue <= threshold
    && (state.effect === 'all' || (record.beta !== null && (state.effect === 'positive' ? record.beta > 0 : record.beta < 0)))
    && (!state.meta || associationMetaKey(record.metaTypes) === state.meta))
}

function compareLocus(a: VariantAssociation, b: VariantAssociation): number {
  const chromosome = (value: string) => ({ X: 23, Y: 24, MT: 25, M: 25 })[value.toUpperCase()] ?? (Number(value) || 26)
  return chromosome(a.chromosome) - chromosome(b.chromosome)
    || a.chromosome.localeCompare(b.chromosome, undefined, { numeric: true }) || a.position - b.position
}

export function sortVariantAssociations(records: readonly VariantAssociation[], state: AssociationTableState): VariantAssociation[] {
  return records.slice().sort((a, b) => {
    let comparison: number
    if (state.sort === 'effect') {
      if (a.beta === null || b.beta === null) {
        if (a.beta !== b.beta) return a.beta === null ? 1 : -1
        comparison = 0
      } else comparison = a.beta - b.beta
    } else comparison = state.sort === 'position' ? compareLocus(a, b) : a.pValue - b.pValue
    return (state.order === 'desc' ? -comparison : comparison)
      || a.variantId.localeCompare(b.variantId) || a.dataset.localeCompare(b.dataset) || a.source.localeCompare(b.source)
  })
}

export function associationPage<T>(records: readonly T[], requestedPage: number, pageSize: number) {
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('Page and page size must be positive integers.')
  }
  const pages = Math.max(1, Math.ceil(records.length / pageSize))
  const page = Math.min(requestedPage, pages)
  const start = (page - 1) * pageSize
  return { records: records.slice(start, start + pageSize), page, pages, start: records.length ? start + 1 : 0, end: Math.min(start + pageSize, records.length) }
}

export function formatAssociationPValue(value: number): string {
  if (value <= Number.MIN_VALUE) return '≤5e-324'
  return value < 0.001 ? value.toExponential(2).replace(/\.?0+e/, 'e') : String(Number(value.toPrecision(3)))
}

export function formatAssociationEffect(beta: number | null, dichotomous: boolean): string {
  if (beta === null) return 'Not available'
  const effect = dichotomous ? Math.exp(beta) : beta
  if (!Number.isFinite(effect)) return 'Too large to display'
  if (dichotomous && effect === 0) return '<5e-324'
  return String(Number(effect.toPrecision(4)))
}

/** Exports unrounded source statistics for all filtered rows, not just the current page. */
function encodeCsv(headers: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  function cell(value: string | number | null): string {
    if (value === null) return ''
    let text = String(value)
    if (typeof value === 'string' && (/^[\t\r\n]/.test(text) || /^[\s]*[=+\-@]/.test(text))) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  return [headers.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n') + '\r\n'
}

export function variantAssociationsCsv(records: readonly VariantAssociation[]): string {
  const headers = ['variantId', 'phenotype', 'ancestry', 'chromosome', 'position', 'reference', 'alternate', 'rsId', 'consequence', 'nearestGenes', 'pValue', 'beta', 'metaAnalysis', 'dataset', 'source']
  return encodeCsv(headers, records.map((record) => [
    record.variantId, record.phenotype, record.ancestry, record.chromosome, record.position, record.reference, record.alternate,
    record.rsId, record.consequence, record.nearestGenes.join(';'), record.pValue, record.beta,
    associationMetaKey(record.metaTypes), record.dataset, record.source,
  ]))
}

export type EnrichmentSort = 'tissue' | 'annotation' | 'ancestry' | 'pValue' | 'fold'
export interface EnrichmentTableState {
  readonly annotation: string
  readonly tissue: string
  readonly pValue: string
  readonly minimumFold: string
  readonly sort: EnrichmentSort
  readonly order: 'asc' | 'desc'
  readonly page: number
}
export const enrichmentQueryKeys = ['enrichAnnotation', 'enrichTissue', 'enrichP', 'enrichFold', 'enrichSort', 'enrichOrder', 'enrichPage'] as const
export const missingEnrichmentValue = '__missing__'
export const enrichmentValue = (value: string | null) => value ?? missingEnrichmentValue
export const enrichmentLabel = (value: string | null) => value === null || value === missingEnrichmentValue ? 'Not recorded' : value.replaceAll('_', ' ')

export function readEnrichmentTableState(query: Readonly<Record<string, unknown>>): EnrichmentTableState {
  const sort = firstQueryValue(query.enrichSort), page = Number(firstQueryValue(query.enrichPage))
  return {
    annotation: firstQueryValue(query.enrichAnnotation) ?? '', tissue: firstQueryValue(query.enrichTissue) ?? '',
    pValue: firstQueryValue(query.enrichP) ?? '', minimumFold: firstQueryValue(query.enrichFold) ?? '',
    sort: sort && ['tissue', 'annotation', 'ancestry', 'pValue', 'fold'].includes(sort) ? sort as EnrichmentSort : 'pValue',
    order: firstQueryValue(query.enrichOrder) === 'desc' ? 'desc' : 'asc', page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  }
}
export function enrichmentTableQuery(state: EnrichmentTableState): Record<string, string> {
  return {
    ...(state.annotation ? { enrichAnnotation: state.annotation } : {}), ...(state.tissue ? { enrichTissue: state.tissue } : {}),
    ...(state.pValue ? { enrichP: state.pValue } : {}), ...(state.minimumFold ? { enrichFold: state.minimumFold } : {}),
    ...(state.sort !== 'pValue' ? { enrichSort: state.sort } : {}), ...(state.order !== 'asc' ? { enrichOrder: state.order } : {}),
    ...(state.page !== 1 ? { enrichPage: String(state.page) } : {}),
  }
}
export function enrichmentFilterError(state: EnrichmentTableState): string | null {
  const error = associationPValueError(state.pValue)
  if (error) return `P-value filter: ${error}`
  if (state.minimumFold && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(state.minimumFold) || !Number.isFinite(Number(state.minimumFold)))) return 'Minimum fold must be a finite number.'
  if (state.minimumFold && Number(state.minimumFold) === 0 && /[1-9]/.test(state.minimumFold.split(/e/i)[0]!)) return 'Minimum fold is too close to zero to represent.'
  return null
}
/** Apply the legacy shortlist after selecting ancestry and before user filters. */
export function globalEnrichmentSelection(rows: readonly GlobalEnrichment[], ancestry = '') {
  const scope = rows.filter((row) => !ancestry || row.ancestry === ancestry)
  const significant = scope.filter((row) => row.pValue < 1e-5)
  const mode = significant.length >= 20 ? 'significant' : 'top20'
  const sorted = sortGlobalEnrichments(mode === 'significant' ? significant : scope, readEnrichmentTableState({}))
  return { scope, records: mode === 'significant' ? sorted : sorted.slice(0, 20), mode }
}
export function filterGlobalEnrichments(rows: readonly GlobalEnrichment[], state: EnrichmentTableState): GlobalEnrichment[] {
  const error = enrichmentFilterError(state)
  if (error) throw new RangeError(error)
  return rows.filter((row) => (!state.annotation || enrichmentValue(row.annotation) === state.annotation) && (!state.tissue || enrichmentValue(row.tissue) === state.tissue)
    && (!state.pValue || row.pValue <= Number(state.pValue)) && (!state.minimumFold || (row.fold !== null && row.fold >= Number(state.minimumFold))))
}
export function sortGlobalEnrichments(rows: readonly GlobalEnrichment[], state: EnrichmentTableState): GlobalEnrichment[] {
  return rows.slice().sort((a, b) => {
    const av = a[state.sort], bv = b[state.sort]
    if (av === null || bv === null) { if (av !== bv) return av === null ? 1 : -1 }
    const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''))
    return (state.order === 'desc' ? -comparison : comparison) || String(a.tissue).localeCompare(String(b.tissue))
      || String(a.annotation).localeCompare(String(b.annotation)) || a.ancestry.localeCompare(b.ancestry) || String(a.method).localeCompare(String(b.method))
  })
}
export function globalEnrichmentsCsv(rows: readonly GlobalEnrichment[]): string {
  return encodeCsv(['phenotype', 'ancestry', 'annotation', 'tissue', 'method', 'pValue', 'SNPs', 'expectedSNPs', 'enrichment', 'fold'],
    rows.map((row) => [row.phenotype, row.ancestry, row.annotation, row.tissue, row.method, row.pValue, row.snps, row.expectedSnps, row.sourceEnrichment, row.fold]))
}

export type CorrelationSort = 'otherPhenotype' | 'pValue' | 'correlation' | 'standardError'
export interface CorrelationTableState {
  readonly phenotypes: readonly string[]
  readonly pValue: string
  readonly minimum: string
  readonly sort: CorrelationSort
  readonly order: 'asc' | 'desc'
  readonly page: number
}
export const correlationQueryKeys = ['corrPhenotype', 'corrP', 'corrMin', 'corrSort', 'corrOrder', 'corrPage'] as const

export function readCorrelationTableState(query: Readonly<Record<string, unknown>>): CorrelationTableState {
  const choices = Array.isArray(query.corrPhenotype) ? query.corrPhenotype : [query.corrPhenotype]
  const sort = firstQueryValue(query.corrSort), page = Number(firstQueryValue(query.corrPage))
  return {
    phenotypes: [...new Set(choices.flatMap((v) => typeof v === 'string' && v.trim() ? [v.trim()] : []))],
    pValue: firstQueryValue(query.corrP) ?? '', minimum: firstQueryValue(query.corrMin) ?? '',
    sort: sort && ['otherPhenotype', 'pValue', 'correlation', 'standardError'].includes(sort) ? sort as CorrelationSort : 'pValue',
    order: firstQueryValue(query.corrOrder) === 'desc' ? 'desc' : 'asc', page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  }
}

export function correlationTableQuery(state: CorrelationTableState): Record<string, string | string[]> {
  return {
    ...(state.phenotypes.length ? { corrPhenotype: [...state.phenotypes] } : {}), ...(state.pValue ? { corrP: state.pValue } : {}),
    ...(state.minimum ? { corrMin: state.minimum } : {}), ...(state.sort !== 'pValue' ? { corrSort: state.sort } : {}),
    ...(state.order !== 'asc' ? { corrOrder: state.order } : {}), ...(state.page !== 1 ? { corrPage: String(state.page) } : {}),
  }
}

export function correlationFilterError(state: CorrelationTableState): string | null {
  const pValueError = associationPValueError(state.pValue)
  if (pValueError) return `P-value filter: ${pValueError}`
  if (state.minimum && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(state.minimum) || !Number.isFinite(Number(state.minimum)))) return 'Enter a finite minimum correlation, such as -0.2.'
  if (state.minimum && Number(state.minimum) === 0 && /[1-9]/.test(state.minimum.split(/e/i)[0]!)) return 'Minimum correlation is too close to zero to represent.'
  return null
}

export function eligibleGeneticCorrelations(rows: readonly GeneticCorrelation[], phenotypes: readonly Phenotype[]): GeneticCorrelation[] {
  const ids = new Set(phenotypes.map(({ name }) => name))
  return rows.filter(({ otherPhenotype }) => ids.has(otherPhenotype))
}

export function correlationPhenotypeLabel(id: string, phenotypes: readonly Phenotype[]): string {
  return findPhenotype(phenotypes, id)?.description.trim() || id
}

export function filterGeneticCorrelations(rows: readonly GeneticCorrelation[], state: CorrelationTableState): GeneticCorrelation[] {
  const error = correlationFilterError(state)
  if (error) throw new RangeError(error)
  return rows.filter((row) => (!state.phenotypes.length || state.phenotypes.includes(row.otherPhenotype))
    && (!state.pValue || row.pValue <= Number(state.pValue)) && (!state.minimum || row.correlation >= Number(state.minimum)))
}

export function sortGeneticCorrelations(rows: readonly GeneticCorrelation[], state: CorrelationTableState, phenotypes: readonly Phenotype[]): GeneticCorrelation[] {
  const labels = new Map(phenotypes.map(({ name, description }) => [name, description.trim() || name]))
  return rows.slice().sort((a, b) => {
    const comparison = state.sort === 'otherPhenotype' ? (labels.get(a.otherPhenotype) ?? a.otherPhenotype).localeCompare(labels.get(b.otherPhenotype) ?? b.otherPhenotype)
      : a[state.sort] - b[state.sort]
    return (state.order === 'desc' ? -comparison : comparison) || a.otherPhenotype.localeCompare(b.otherPhenotype)
      || a.project.localeCompare(b.project) || a.ancestry.localeCompare(b.ancestry)
  })
}

export function geneticCorrelationsCsv(rows: readonly GeneticCorrelation[]): string {
  return encodeCsv(['phenotype', 'other_phenotype', 'ancestry', 'project', 'pValue', 'rg', 'stdErr'],
    rows.map((row) => [row.phenotype, row.otherPhenotype, row.ancestry, row.project, row.pValue, row.correlation, row.standardError]))
}

export type PathwaySort = 'pathwayName' | 'pValue' | 'beta' | 'standardError'
export interface PathwayTableState {
  readonly sort: PathwaySort
  readonly order: 'asc' | 'desc'
  readonly page: number
}
export const pathwayQueryKeys = ['pathwaySort', 'pathwayOrder', 'pathwayPage'] as const

export function readPathwayTableState(query: Readonly<Record<string, unknown>>): PathwayTableState {
  const sort = firstQueryValue(query.pathwaySort)
  const page = Number(firstQueryValue(query.pathwayPage))
  return {
    sort: sort && ['pathwayName', 'pValue', 'beta', 'standardError'].includes(sort) ? sort as PathwaySort : 'pValue',
    order: firstQueryValue(query.pathwayOrder) === 'desc' ? 'desc' : 'asc',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  }
}

export function pathwayTableQuery(state: PathwayTableState): Record<string, string> {
  return {
    ...(state.sort !== 'pValue' ? { pathwaySort: state.sort } : {}),
    ...(state.order !== 'asc' ? { pathwayOrder: state.order } : {}),
    ...(state.page !== 1 ? { pathwayPage: String(state.page) } : {}),
  }
}

export function sortPathwayAssociations(rows: readonly PathwayAssociation[], state: PathwayTableState): PathwayAssociation[] {
  return rows.slice().sort((a, b) => {
    const comparison = state.sort === 'pathwayName' ? a.pathwayName.localeCompare(b.pathwayName) : a[state.sort] - b[state.sort]
    return (state.order === 'desc' ? -comparison : comparison) || a.pathwayName.localeCompare(b.pathwayName)
      || a.ancestry.localeCompare(b.ancestry) || a.phenotype.localeCompare(b.phenotype)
  })
}

export function pathwayAssociationsCsv(rows: readonly PathwayAssociation[]): string {
  return encodeCsv(['phenotype', 'ancestry', 'pathwayName', 'pValue', 'beta', 'stdErr', 'betaStdErr', 'numGenes'],
    rows.map((row) => [row.phenotype, row.ancestry, row.pathwayName, row.pValue, row.beta, row.standardError, row.betaStandardError, row.geneCount]))
}

export type GeneSupportTab = 'combined' | 'huge' | 'comparison' | 'direct-indirect'
export type GeneSupportSort = 'gene' | 'combined' | 'direct' | 'indirect' | 'huge' | 'pip' | 'common' | 'rare'
export interface GeneSupportState {
  readonly tab: GeneSupportTab
  readonly gene: string
  readonly minimum: string
  readonly sort: GeneSupportSort
  readonly order: 'asc' | 'desc'
  readonly page: number
}

export const geneSupportQueryKeys = ['supportTab', 'supportGene', 'supportMin', 'supportSort', 'supportOrder', 'supportPage'] as const

export function readGeneSupportState(query: Readonly<Record<string, unknown>>): GeneSupportState {
  const candidate = firstQueryValue(query.supportTab)
  const tab: GeneSupportTab = candidate === 'huge' || candidate === 'comparison' || candidate === 'direct-indirect' ? candidate : 'combined'
  const sort = firstQueryValue(query.supportSort)
  const allowed = tab === 'huge' ? ['gene', 'huge', 'common', 'rare'] : tab === 'comparison' ? ['gene', 'combined', 'huge'] : tab === 'direct-indirect' ? ['gene', 'combined', 'direct', 'indirect'] : ['gene', 'combined', 'direct', 'indirect', 'pip']
  const page = Number(firstQueryValue(query.supportPage))
  return {
    tab, gene: firstQueryValue(query.supportGene) ?? '', minimum: firstQueryValue(query.supportMin) ?? '',
    sort: sort && allowed.includes(sort) ? sort as GeneSupportSort : tab === 'huge' ? 'huge' : 'combined',
    order: firstQueryValue(query.supportOrder) === 'asc' ? 'asc' : 'desc',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  }
}

export function geneSupportQuery(state: GeneSupportState): Record<string, string> {
  return {
    ...(state.tab !== 'combined' ? { supportTab: state.tab } : {}),
    ...(state.gene ? { supportGene: state.gene } : {}),
    ...(state.minimum ? { supportMin: state.minimum } : {}),
    ...(state.sort !== (state.tab === 'huge' ? 'huge' : 'combined') ? { supportSort: state.sort } : {}),
    ...(state.order !== 'desc' ? { supportOrder: state.order } : {}),
    ...(state.page !== 1 ? { supportPage: String(state.page) } : {}),
  }
}

export interface GeneSupportRow {
  readonly key: string
  readonly gene: string
  readonly phenotype: string
  readonly combined: number | null
  readonly direct: number | null
  readonly indirect: number | null
  readonly factor: string | null
  readonly factorLabel: string | null
  readonly huge: number | null
  readonly common: number | null
  readonly rare: number | null
  readonly chromosome: string | null
  readonly start: number | null
  readonly end: number | null
  readonly pip: number | null
  readonly hugeRecords: number
  readonly sigma: number | null
  readonly geneSetCollection: string | null
}

/** Exact-ID joins. Comparisons use the highest returned HuGE score; the HuGE tab retains every locus. */
export function geneSupportRows(pigean: readonly PigeanGeneSupport[], huge: readonly HugeGeneScore[], falcon: readonly FalconGeneProbability[], tab: GeneSupportTab): GeneSupportRow[] {
  const identity = (phenotype: string, gene: string) => JSON.stringify([phenotype, gene])
  const probabilities = new Map<string, number>()
  for (const row of falcon) {
    const key = identity(row.phenotype, row.gene)
    probabilities.set(key, Math.max(probabilities.get(key) ?? 0, row.pip))
  }
  const bestHuge = new Map<string, HugeGeneScore>()
  const counts = new Map<string, number>()
  for (const row of huge) {
    const key = identity(row.phenotype, row.gene)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!bestHuge.has(key) || row.score > bestHuge.get(key)!.score) bestHuge.set(key, row)
  }
  function combine(gene: string, phenotype: string, p: PigeanGeneSupport | null, h: HugeGeneScore | null, index: number): GeneSupportRow {
    return {
      key: JSON.stringify([gene, p?.factor ?? null, h?.chromosome ?? null, h?.start ?? null, index]), gene, phenotype,
      combined: p?.combined ?? null, direct: p?.direct ?? null, indirect: p?.indirect ?? null,
      factor: p?.factor ?? null, factorLabel: p?.factorLabel ?? null,
      huge: h?.score ?? null, common: h?.common ?? null, rare: h?.rare ?? null,
      chromosome: h?.chromosome ?? null, start: h?.start ?? null, end: h?.end ?? null,
      pip: probabilities.get(identity(phenotype, gene)) ?? null, hugeRecords: counts.get(identity(phenotype, gene)) ?? 0,
      sigma: p?.sigma ?? null, geneSetCollection: p?.geneSetCollection ?? null,
    }
  }
  return tab === 'huge' ? huge.map((h, index) => combine(h.gene, h.phenotype, null, h, index))
    : pigean.map((p, index) => combine(p.gene, p.phenotype, p, bestHuge.get(identity(p.phenotype, p.gene)) ?? null, index))
}

export function geneSupportMinimumError(value: string, tab: GeneSupportTab): string | null {
  const text = value.trim()
  if (!text) return null
  const number = Number(text)
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(number)) return 'Enter a finite numeric score.'
  if (tab === 'huge' && number < 0) return 'HuGE scores must be at least 0.'
  if (number === 0 && /[1-9]/.test(text.split(/e/i)[0]!)) return 'The minimum score is too close to zero to represent.'
  return null
}

export function filterGeneSupportRows(rows: readonly GeneSupportRow[], state: GeneSupportState): GeneSupportRow[] {
  const error = geneSupportMinimumError(state.minimum, state.tab)
  if (error) throw new RangeError(error)
  return rows.filter((row) => (!state.gene || row.gene === state.gene) && (!state.minimum.trim()
    || ((state.tab === 'huge' ? row.huge : row.combined) !== null && (state.tab === 'huge' ? row.huge! : row.combined!) >= Number(state.minimum))))
}

export function sortGeneSupportRows(rows: readonly GeneSupportRow[], state: GeneSupportState): GeneSupportRow[] {
  return rows.slice().sort((a, b) => {
    let comparison: number
    if (state.sort === 'gene') comparison = a.gene.localeCompare(b.gene)
    else {
      const av = a[state.sort], bv = b[state.sort]
      if (av === null || bv === null) {
        if (av !== bv) return av === null ? 1 : -1
        comparison = 0
      } else comparison = av - bv
    }
    return (state.order === 'desc' ? -comparison : comparison) || a.key.localeCompare(b.key)
  })
}

export function geneticSupportCsv(rows: readonly GeneSupportRow[]): string {
  return encodeCsv(['gene', 'phenotype', 'combined', 'direct', 'indirect', 'factor', 'factorLabel', 'HuGE', 'commonBF', 'rareBF', 'chromosome', 'start', 'end', 'FALCON_PIP', 'returnedHuGELoci', 'sigma', 'geneSetCollection'],
    rows.map((r) => [r.gene, r.phenotype, r.combined, r.direct, r.indirect, r.factor, r.factorLabel, r.huge, r.common, r.rare, r.chromosome, r.start, r.end, r.pip, r.hugeRecords, r.sigma, r.geneSetCollection]))
}

export interface GeneSupportPoint { readonly gene: string, readonly x: number, readonly y: number, readonly series: string }
export function geneSupportPlotPoints(rows: readonly GeneSupportRow[], tab: GeneSupportTab): GeneSupportPoint[] {
  return rows.flatMap((row, index) => {
    if (tab === 'direct-indirect') return row.direct === null || row.indirect === null ? [] : [{ gene: row.gene, x: row.direct, y: row.indirect, series: 'Gene' }]
    const values = tab === 'huge' ? [['ln(HuGE)', row.huge !== null && row.huge > 0 ? Math.log(row.huge) : null] as const]
      : tab === 'comparison' ? [['Combined', row.combined] as const, ['ln(HuGE)', row.huge !== null && row.huge > 0 ? Math.log(row.huge) : null] as const]
        : [['Combined', row.combined] as const, ['Direct', row.direct] as const, ['Indirect', row.indirect] as const]
    return values.flatMap(([series, y]) => y === null ? [] : [{ gene: row.gene, x: index + 1, y, series }])
  })
}

export function geneSupportEvidence(value: number | null): string {
  return value === null ? 'Not available' : value > 3 ? 'Very strong' : value >= 2 ? 'Strongly suggestive' : value >= 1 ? 'Nominally significant' : 'Not significant'
}

export function formatGeneSupport(value: number | null): string {
  return value === null ? 'Not returned' : String(Number(value.toPrecision(4)))
}

export type Cs2ctSort = 'score' | 'overlapProbability' | 'genericity' | 'variantCount' | 'tissue' | 'biosample' | 'source'
export interface Cs2ctState {
  readonly annotation: string
  readonly sources: readonly string[]
  readonly tissues: readonly string[]
  readonly minVariants: string
  readonly maxGenericity: string
  readonly sort: Cs2ctSort
  readonly order: 'asc' | 'desc'
  readonly page: number
}
export const cs2ctQueryKeys = ['csAnnotation', 'csSource', 'csTissue', 'csVariants', 'csGenericity', 'csSort', 'csOrder', 'csPage'] as const
export const missingCs2ctTissue = '__missing__'
export const cs2ctTissueKey = (row: Cs2ctRecord) => row.tissue ?? missingCs2ctTissue
export const cs2ctLabel = (value: string | null) => value === null || value === missingCs2ctTissue ? 'Not recorded' : value.replaceAll('_', ' ')

export function readCs2ctState(query: Readonly<Record<string, unknown>>): Cs2ctState {
  const list = (value: unknown) => [...new Set((Array.isArray(value) ? value : [value]).flatMap((v) => typeof v === 'string' && v.trim() ? [v.trim()] : []))]
  const sort = firstQueryValue(query.csSort)
  const allowed = ['score', 'overlapProbability', 'genericity', 'variantCount', 'tissue', 'biosample', 'source']
  const page = Number(firstQueryValue(query.csPage))
  return {
    annotation: firstQueryValue(query.csAnnotation) ?? '', sources: list(query.csSource), tissues: list(query.csTissue),
    minVariants: firstQueryValue(query.csVariants) ?? '', maxGenericity: firstQueryValue(query.csGenericity) ?? '',
    sort: sort && allowed.includes(sort) ? sort as Cs2ctSort : 'score', order: firstQueryValue(query.csOrder) === 'asc' ? 'asc' : 'desc',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  }
}

export function cs2ctQuery(state: Cs2ctState): Record<string, string | string[]> {
  return {
    ...(state.annotation ? { csAnnotation: state.annotation } : {}), ...(state.sources.length ? { csSource: [...state.sources] } : {}),
    ...(state.tissues.length ? { csTissue: [...state.tissues] } : {}), ...(state.minVariants ? { csVariants: state.minVariants } : {}),
    ...(state.maxGenericity ? { csGenericity: state.maxGenericity } : {}), ...(state.sort !== 'score' ? { csSort: state.sort } : {}),
    ...(state.order !== 'desc' ? { csOrder: state.order } : {}), ...(state.page !== 1 ? { csPage: String(state.page) } : {}),
  }
}

export function cs2ctFilterError(state: Cs2ctState): string | null {
  if (state.minVariants && (!/^\d+$/.test(state.minVariants) || !Number.isSafeInteger(Number(state.minVariants)))) return 'Minimum variants must be a nonnegative integer.'
  if (state.maxGenericity && (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(state.maxGenericity) || !Number.isFinite(Number(state.maxGenericity)))) return 'Maximum genericity must be a finite nonnegative number.'
  return null
}

export function cs2ctEligibleRows(rows: readonly Cs2ctRecord[]): Cs2ctRecord[] {
  return rows.filter(({ source }) => source !== 'bottom-line_analysis_rare')
}

export function filterCs2ctRows(rows: readonly Cs2ctRecord[], state: Cs2ctState): Cs2ctRecord[] {
  const error = cs2ctFilterError(state)
  if (error) throw new RangeError(error)
  return rows.filter((row) => (!state.sources.length || state.sources.includes(row.source)) && (!state.tissues.length || state.tissues.includes(cs2ctTissueKey(row)))
    && (!state.minVariants || row.variantCount >= Number(state.minVariants)) && (!state.maxGenericity || row.genericity <= Number(state.maxGenericity)))
}

export function sortCs2ctRows(rows: readonly Cs2ctRecord[], state: Cs2ctState): Cs2ctRecord[] {
  return rows.slice().sort((a, b) => {
    const av = a[state.sort], bv = b[state.sort]
    if (av === null || bv === null) { if (av !== bv) return av === null ? 1 : -1 }
    const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''))
    return (state.order === 'asc' ? comparison : -comparison) || a.credibleSetId.localeCompare(b.credibleSetId) || String(a.biosample).localeCompare(String(b.biosample))
  })
}

export function cs2ctVariantRegion(row: Cs2ctRecord): string | null {
  const match = row.overlapLeadVariant?.match(/^([^:]+):(\d+)(?::|$)/)
  if (!match || match[1] !== row.chromosome) return null
  const position = Number(match[2])
  return Number.isSafeInteger(position) && position > 0 ? `${row.chromosome}:${Math.max(1, position - 200000)}-${Math.min(Number.MAX_SAFE_INTEGER, position + 200000)}` : null
}

export function cs2ctCsv(rows: readonly Cs2ctRecord[]): string {
  return encodeCsv(['phenotype', 'ancestry', 'annotation', 'tissue', 'biosample', 'source', 'dataset', 'credibleSetId', 'chromosome', 'clumpStart', 'clumpEnd', 'variants', 'overlapLeadVariant', 'overlapProbability', 'genericity', 'combinedScore'],
    rows.map((r) => [r.phenotype, r.ancestry, r.annotation, r.tissue, r.biosample, r.source, r.dataset, r.credibleSetId, r.chromosome, r.clumpStart, r.clumpEnd, r.variantCount, r.overlapLeadVariant, r.overlapProbability, r.genericity, r.score]))
}
