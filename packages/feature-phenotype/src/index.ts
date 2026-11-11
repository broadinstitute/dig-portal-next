import { ancestryLabel, type Phenotype, type PortalDataset, type ProvenanceGraph, type ProvenanceNode, type ProvenanceTrait } from '@dig-portal/domain'

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
