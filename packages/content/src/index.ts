import { decodeHTML } from 'entities'
import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'

export function sanitizePlainText(value: string): string {
  return decodeHTML(sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    allowedSchemes: [],
  }))
}

const plainText = z.string().min(1).refine((value) => sanitizePlainText(value) === value, {
  message: 'Expected plain text without HTML.',
})

const pageId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/)

export const effectorCatalogSchema = z.object({
  sourceId: pageId,
  entries: z.array(z.object({
    traitIds: z.array(plainText).min(1),
    name: plainText,
    title: plainText,
    citation: plainText,
    pmid: z.string().regex(/^\d+$/).nullable(),
    pageId: pageId.nullable(),
  }).strict()),
}).strict()

export type EffectorCatalog = z.infer<typeof effectorCatalogSchema>
export type EffectorList = EffectorCatalog['entries'][number]
