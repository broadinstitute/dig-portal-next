import { defineNuxtModule, getLayerDirectories, resolveFiles } from '@nuxt/kit'
import path from 'node:path'

type LayerDirectories = ReturnType<typeof getLayerDirectories>[number]

interface Candidate {
  layer: number
  file: string
}

interface ComponentCandidate extends Candidate {
  name: string
  mode: 'all' | 'client' | 'server'
}

type CandidateGroups = Map<string, Candidate[]>

function isWithin(directory: string, file: string): boolean {
  const relative = path.relative(directory, file)
  return relative !== '' && !path.isAbsolute(relative)
    && relative !== '..' && !relative.startsWith(`..${path.sep}`)
}

function ownerOf(layers: LayerDirectories[], file: string): number {
  if (!path.isAbsolute(file)) return -1
  let owner = -1
  let rootLength = -1
  for (const [index, layer] of layers.entries()) {
    const root = path.resolve(layer.root)
    if (root.length > rootLength && isWithin(root, file)
      && !path.relative(root, file).split(path.sep).includes('node_modules')) {
      owner = index
      rootLength = root.length
    }
  }
  return owner
}

function addCandidate(groups: CandidateGroups, key: string, candidate: Candidate): void {
  const entries = groups.get(key) ?? []
  if (!entries.some((entry) => entry.layer === candidate.layer && entry.file === candidate.file)) {
    entries.push(candidate)
    groups.set(key, entries)
  }
}

function nameParts(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase())
}

function layoutKey(relative: string): string {
  const parts = relative.split(/[\\/]/)
  const filename = parts.pop() ?? ''
  const stem = filename.slice(0, filename.length - path.extname(filename).length)
  const directories = parts.flatMap(nameParts)
  const name = stem.toLowerCase() === 'index' ? [] : nameParts(stem)
  let overlap = Math.min(directories.length, name.length)
  while (overlap > 0 && directories.slice(-overlap).join('/') !== name.slice(0, overlap).join('/')) overlap--
  return [...directories.slice(0, directories.length - overlap), ...name].join('-')
}

function routeKey(relative: string): string {
  const key = relative.replaceAll('\\', '/')
    .replace(/\.[^.]+$/, '')
    .replace(/\[\[(?:\.\.\.)?[^\]]+\]\]|\[(?:\.\.\.)?[^\]]+\]/g, (segment) =>
      segment.startsWith('[[')
        ? segment.startsWith('[[...') ? '[[...]]' : '[[]]'
        : segment.startsWith('[...') ? '[...]' : '[]')
    .replace(/(^|\/)index$/i, '')
    .toLowerCase()
  return key || '/'
}

async function fileCandidates(layers: LayerDirectories[], extensions: string[]): Promise<CandidateGroups> {
  const groups: CandidateGroups = new Map()
  const codeExtensions = new Set(extensions)
  const directories = [
    { label: 'page', key: 'appPages', normalize: routeKey, codeOnly: true },
    { label: 'layout', key: 'appLayouts', normalize: layoutKey, codeOnly: true },
    { label: 'middleware', key: 'appMiddleware', normalize: (file: string) => layoutKey(path.basename(file)), codeOnly: true },
    { label: 'server file', key: 'server', normalize: routeKey, codeOnly: true },
    { label: 'public file', key: 'public', normalize: (file: string) => file.replaceAll('\\', '/').toLowerCase(), codeOnly: false },
  ] as const

  await Promise.all(layers.map(async (layer, index) => {
    for (const directory of directories) {
      const base = layer[directory.key]
      for (const file of await resolveFiles(base, '**/*')) {
        if (directory.codeOnly && (!codeExtensions.has(path.extname(file)) || /\.d\.[cm]?ts$/.test(file))) continue
        const key = directory.normalize(path.relative(base, file))
        if (key) addCandidate(groups, `${directory.label} ${key}`, { layer: index, file })
      }
    }
    for (const [label, base, pattern] of [
      ['app entry', layer.app, '{App,app,error}.{vue,js,mjs,ts,tsx}'],
      ['app configuration (merged)', layer.app, 'app.config.{js,mjs,cjs,ts,mts,cts}'],
      ['Nuxt configuration (merged)', layer.root, 'nuxt.config.{js,mjs,cjs,ts,mts,cts}'],
    ] as const) {
      for (const file of await resolveFiles(base, pattern)) {
        const name = label === 'app entry' ? path.basename(file, path.extname(file)).toLowerCase() : ''
        addCandidate(groups, `${label} ${name}`.trim(), { layer: index, file })
      }
    }
  }))
  return groups
}

function collidingGroups(groups: CandidateGroups): [string, Candidate[]][] {
  return [...groups.entries()]
    .filter(([, entries]) => new Set(entries.map(({ layer }) => layer)).size > 1)
    .map(([key, entries]): [string, Candidate[]] => [key, entries.sort((a, b) => a.layer - b.layer)])
    .sort(([a], [b]) => a.localeCompare(b))
}

export default defineNuxtModule({
  meta: { name: 'portal-layer-shadow-report' },
  setup(_options, nuxt) {
    const layers = getLayerDirectories(nuxt)
    let scannedComponents: ComponentCandidate[] = []
    let imports: CandidateGroups = new Map()
    let components: CandidateGroups = new Map()

    nuxt.hook('imports:extend', (entries) => {
      imports = new Map()
      for (const entry of entries) {
        const layer = ownerOf(layers, entry.from)
        if (layer >= 0) addCandidate(imports, `auto-import ${entry.as || entry.name}`, { layer, file: entry.from })
      }
    })

    nuxt.hook('components:dirs', (directories) => {
      scannedComponents = []
      for (let index = 0; index < directories.length; index++) {
        const original = directories[index]
        if (!original) continue
        const directory = typeof original === 'string' ? { path: original } : original
        directories[index] = directory
        const extend = directory.extendComponent
        directory.extendComponent = async (component) => {
          const result = await extend?.call(directory, component) || component
          const layer = ownerOf(layers, result.filePath)
          if (layer >= 0) {
            scannedComponents.push({
              layer,
              file: result.filePath,
              name: result.pascalName,
              mode: result.mode ?? 'all',
            })
          }
          return result
        }
      }
    })

    nuxt.hook('components:extend', (resolved) => {
      components = new Map()
      const resolvedFiles = new Set(resolved.map(({ filePath }) => path.resolve(filePath)))
      for (const candidate of scannedComponents) {
        if (resolvedFiles.has(path.resolve(candidate.file))) continue
        for (const winner of resolved) {
          const layer = ownerOf(layers, winner.filePath)
          const mode = winner.mode ?? 'all'
          if (layer < 0 || layer === candidate.layer || winner.pascalName !== candidate.name
            || (mode !== 'all' && candidate.mode !== 'all' && mode !== candidate.mode)) continue
          const key = `component ${candidate.name}`
          addCandidate(components, key, { layer, file: winner.filePath })
          addCandidate(components, key, candidate)
        }
      }
    })

    nuxt.hook('app:templatesGenerated', async () => {
      const files = await fileCandidates(layers, nuxt.options.extensions)
      const findings = [files, imports, components].flatMap(collidingGroups)
      if (findings.length === 0) {
        console.info('[portal] No Nuxt layer-shadow candidates found.')
        return
      }
      console.info('[portal] Review Nuxt layer-shadow candidates (highest-priority layer first):')
      for (const [name, entries] of findings) {
        console.info(`  ${name}:`)
        for (const entry of entries) console.info(`    ${path.relative(nuxt.options.rootDir, entry.file)}`)
      }
    })
  },
})
