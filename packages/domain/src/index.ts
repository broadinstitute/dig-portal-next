export interface Phenotype {
  readonly name: string
  readonly description: string
  readonly group: string
  readonly dichotomous: boolean
}

export const ancestryLabels: Readonly<Record<string, string>> = {
  ABA: 'Aboriginal Australian',
  AA: 'African American or Afro-Caribbean',
  AF: 'African unspecified',
  SSAF: 'Sub-Saharan African',
  ASUN: 'Asian unspecified',
  CA: 'Central Asian',
  EA: 'East Asian',
  SA: 'South Asian',
  SEA: 'South East Asian',
  EU: 'European',
  GME: 'Greater Middle Eastern (Middle Eastern, North African, or Persian)',
  HS: 'Hispanic or Latin American',
  NAM: 'Native American',
  NR: 'Not reported',
  OC: 'Oceanian',
  OTH: 'Other',
  OAD: 'Other admixed ancestry',
  Mixed: 'Mixed ancestry',
}

export function ancestryLabel(code: string): string {
  return Object.hasOwn(ancestryLabels, code) ? ancestryLabels[code]! : code
}

export interface PortalDataset {
  readonly name: string
  readonly description: string
  readonly phenotypes: readonly string[]
  readonly ancestry: string
  readonly ancestryName: string | null
  readonly technology: string
  readonly subjects: number
  readonly community: string | null
}

export interface VariantAssociation {
  readonly variantId: string
  readonly phenotype: string
  readonly ancestry: string
  readonly chromosome: string
  readonly position: number
  readonly reference: string
  readonly alternate: string
  readonly rsId: string | null
  readonly consequence: string | null
  readonly nearestGenes: readonly string[]
  readonly pValue: number
  readonly beta: number | null
  readonly metaTypes: readonly string[]
  readonly dataset: string
  readonly source: string
}

export interface GeneticCorrelation {
  readonly phenotype: string
  readonly otherPhenotype: string
  readonly ancestry: string
  readonly project: string
  readonly pValue: number
  /** Estimated rg can exceed [-1, 1]; preserve the source value. */
  readonly correlation: number
  readonly standardError: number
}

export interface PathwayAssociation {
  readonly phenotype: string
  readonly ancestry: string
  readonly pathwayName: string
  readonly pValue: number
  readonly beta: number
  /** Source stdErr; betaStdErr is a separate field and is not substituted. */
  readonly standardError: number
  readonly betaStandardError: number | null
  readonly geneCount: number | null
}

export interface PigeanModel {
  readonly sigma: number
  readonly geneSetCollection: string
}

export interface PigeanGeneSupport extends PigeanModel {
  readonly phenotype: string
  readonly gene: string
  readonly combined: number
  readonly direct: number
  readonly indirect: number
  readonly factor: string | null
  readonly factorLabel: string | null
}

export interface HugeGeneScore {
  readonly phenotype: string
  readonly gene: string
  readonly chromosome: string
  readonly start: number
  readonly end: number
  readonly score: number
  readonly common: number | null
  readonly rare: number | null
}

export interface FalconGeneProbability {
  readonly phenotype: string
  readonly gene: string
  readonly pip: number
}

export interface PigeanGeneSetEvidence extends PigeanModel {
  readonly phenotype: string
  readonly gene: string
  readonly geneSet: string
  readonly jointEffect: number
  readonly source: string
}

export interface Cs2ctRecord {
  readonly phenotype: string
  readonly ancestry: string
  readonly annotation: string
  readonly tissue: string | null
  readonly biosample: string | null
  readonly source: string
  readonly dataset: string
  readonly credibleSetId: string
  readonly chromosome: string
  readonly clumpStart: number
  readonly clumpEnd: number
  readonly variantCount: number
  readonly overlapLeadVariant: string | null
  readonly overlapProbability: number
  readonly genericity: number
  readonly score: number
}

export interface ProvenanceAncestry {
  readonly id: string
  readonly ancestryId: string
  readonly ancestryName: string
}

export interface ProvenanceTrait {
  readonly legacyId: string
  readonly name: string
  readonly ancestries: readonly ProvenanceAncestry[]
}

export interface ProvenanceNode {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly location: string | null
}

export interface ProvenanceEdge {
  readonly subject: string
  readonly object: string
}

export interface ProvenanceGraph {
  readonly activities: readonly ProvenanceNode[]
  readonly resources: readonly ProvenanceNode[]
  readonly used: readonly ProvenanceEdge[]
  readonly generated: readonly ProvenanceEdge[]
  readonly linked: readonly ProvenanceEdge[]
}

export interface BottomLineProvenance {
  readonly id: string
  readonly traitId: string
  readonly ancestryId: string
  readonly pipelineType: string
  readonly description: string | null
  readonly graph: ProvenanceGraph
  /** Original graph for JSON inspection and export. */
  readonly raw: Readonly<Record<string, unknown>>
}
