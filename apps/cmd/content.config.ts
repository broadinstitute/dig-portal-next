import { effectorCatalogSchema } from '@dig-portal/content'
import { defineCollection, defineContentConfig } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    effectorLists: defineCollection({
      type: 'data',
      source: 'effector-lists/catalog.json',
      schema: effectorCatalogSchema,
    }),
  },
})
