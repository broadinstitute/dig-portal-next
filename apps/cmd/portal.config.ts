export interface PortalDefinition {
  id: string
  registryGroup: string
  title: string
  enabledFeatures: readonly string[]
  navigation: readonly { label: string, href: string }[]
}

export default {
  id: 'cmd',
  registryGroup: 'md',
  title: 'Common Metabolic Diseases Knowledge Portal',
  enabledFeatures: [],
  navigation: [
    { label: 'Current portal', href: 'https://hugeamp.org/' },
  ],
} satisfies PortalDefinition
