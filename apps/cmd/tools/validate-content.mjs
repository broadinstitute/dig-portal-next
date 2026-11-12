import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { effectorCatalogSchema } from '@dig-portal/content'
import portal from '../portal.config.ts'
import { portalDefinitionSchema } from '../portal.schema.ts'

const file = process.argv[2] ?? fileURLToPath(new URL('../content/effector-lists/catalog.json', import.meta.url))
let portalValid = true

try {
  const definition = portalDefinitionSchema.parse(portal)
  // This guards the base definition; selected variant identities are D-27a work.
  const applicationId = path.basename(fileURLToPath(new URL('../', import.meta.url)))
  if (definition.id !== applicationId) throw new Error(`id must match application directory "${applicationId}".`)
  console.log('Portal definition is valid.')
} catch (error) {
  console.error(`Invalid portal definition: ${error.message}`)
  portalValid = false
  process.exitCode = 1
}

if (portalValid) {
  try {
    const catalog = JSON.parse(readFileSync(file, 'utf8'))
    effectorCatalogSchema.parse(catalog)
    console.log('Effector-list content is valid.')
  } catch (error) {
    console.error(`Invalid effector-list content in ${file}: ${error.message}`)
    process.exitCode = 1
  }
}
