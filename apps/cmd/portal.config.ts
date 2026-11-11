export interface PortalDefinition {
  id: string
  registryGroup: string
  title: string
  legacyContentImportEnabled: boolean
  enabledFeatures: readonly string[]
  navigation: readonly { label: string, href: string }[]
}

export default {
  id: 'cmd',
  registryGroup: 'md',
  title: 'Common Metabolic Diseases Knowledge Portal',
  legacyContentImportEnabled: true,
  enabledFeatures: [],
  navigation: [
    { label: 'Current portal', href: 'https://hugeamp.org/' },
  ],
} satisfies PortalDefinition
