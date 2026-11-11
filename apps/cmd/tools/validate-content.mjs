import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { effectorCatalogSchema } from '@dig-portal/content'

const file = process.argv[2] ?? fileURLToPath(new URL('../content/effector-lists/catalog.json', import.meta.url))

try {
  const catalog = JSON.parse(readFileSync(file, 'utf8'))
  effectorCatalogSchema.parse(catalog)
  console.log('Effector-list content is valid.')
} catch (error) {
  console.error(`Invalid effector-list content in ${file}: ${error.message}`)
  process.exitCode = 1
}
