import type { PortalDefinition } from './portal.schema'
export type { PortalDefinition } from './portal.schema'

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
