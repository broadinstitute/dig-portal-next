export interface Phenotype {
  readonly name: string
  readonly description: string
  readonly group: string
  readonly dichotomous: boolean
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
