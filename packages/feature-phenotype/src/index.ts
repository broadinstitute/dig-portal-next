import { ancestryLabel, type Phenotype, type PortalDataset } from '@dig-portal/domain'

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

export function effectorListsForPhenotype<T extends { readonly traitIds: readonly string[] }>(
  entries: readonly T[],
  phenotype: string | null,
): T[] {
  return phenotype ? entries.filter(({ traitIds }) => traitIds.includes(phenotype)) : []
}
