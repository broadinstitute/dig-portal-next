import type { PigeanModel } from '@dig-portal/domain'

export interface PortalDefinition {
  id: string
  registryGroup: string
  title: string
  legacyContentImportEnabled: boolean
  enabledFeatures: readonly string[]
  geneticSupport: PigeanModel
  navigation: readonly { label: string, href: string }[]
}

export default {
  id: 'cmd',
  registryGroup: 'md',
  title: 'Common Metabolic Diseases Knowledge Portal',
  legacyContentImportEnabled: true,
  enabledFeatures: [],
  geneticSupport: { sigma: 2, geneSetCollection: 'mouse_msigdb' },
  navigation: [
    { label: 'Current portal', href: 'https://hugeamp.org/' },
  ],
} satisfies PortalDefinition
