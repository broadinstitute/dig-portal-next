import { ancestryLabel, type Phenotype, type PortalDataset, type ProvenanceGraph, type ProvenanceNode, type ProvenanceTrait, type VariantAssociation } from '@dig-portal/domain'

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
export function variantAssociationsCsv(records: readonly VariantAssociation[]): string {
  function cell(value: string | number | null): string {
    if (value === null) return ''
    let text = String(value)
    if (typeof value === 'string' && (/^[\t\r\n]/.test(text) || /^[\s]*[=+\-@]/.test(text))) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  const headers = ['variantId', 'phenotype', 'ancestry', 'chromosome', 'position', 'reference', 'alternate', 'rsId', 'consequence', 'nearestGenes', 'pValue', 'beta', 'metaAnalysis', 'dataset', 'source']
  return [headers.map(cell).join(','), ...records.map((record) => [
    record.variantId, record.phenotype, record.ancestry, record.chromosome, record.position, record.reference, record.alternate,
    record.rsId, record.consequence, record.nearestGenes.join(';'), record.pValue, record.beta,
    associationMetaKey(record.metaTypes), record.dataset, record.source,
  ].map(cell).join(','))].join('\r\n') + '\r\n'
}
