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
