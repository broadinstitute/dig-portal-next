import { z } from 'zod'

const text = z.string().min(1).refine((value) => value === value.trim(), 'Use nonblank text without surrounding whitespace.')
const identifier = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/)
const navigationHref = text.refine((value) => {
  if (/\s|\\/.test(value)) return false
  if (value.startsWith('#')) return true
  if (value.startsWith('/')) return !value.startsWith('//')
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}, 'Use a root-relative path, fragment, or HTTP(S) URL without credentials.')

/** CMD's currently consumed definition; other applications own their contracts (D-21). */
export const portalDefinitionSchema = z.object({
  id: identifier,
  registryGroup: identifier,
  title: text,
  legacyContentImportEnabled: z.boolean(),
  enabledFeatures: z.array(text).readonly().refine((features) => new Set(features).size === features.length, 'Feature names must be unique.'),
  geneticSupport: z.object({
    sigma: z.number().finite().positive(),
    geneSetCollection: text.refine((value) => !value.includes(','), 'Use one gene-set collection identifier.'),
  }).strict(),
  navigation: z.array(z.object({ label: text, href: navigationHref }).strict()).readonly(),
}).strict()

export type PortalDefinition = z.infer<typeof portalDefinitionSchema>
