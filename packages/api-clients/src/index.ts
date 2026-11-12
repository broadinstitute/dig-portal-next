import type { BottomLineProvenance, Phenotype, PortalDataset, ProvenanceEdge, ProvenanceNode, ProvenanceTrait, VariantAssociation, GlobalEnrichment, GeneticCorrelation, PathwayAssociation, PigeanModel, PigeanGeneSupport, HugeGeneScore, FalconGeneProbability, PigeanGeneSetEvidence, Cs2ctRecord } from '@dig-portal/domain'

export type BioIndexDecoder<T> = (value: unknown) => T

export interface BioIndexProgress {
  readonly bytesRead?: number
  readonly bytesTotal?: number
  readonly filtered?: number
}

export interface BioIndexPage<T> {
  readonly data: readonly T[]
  readonly count: number
  readonly continuation: string | null
  readonly restricted?: number
  readonly progress?: BioIndexProgress | null
}

export interface BioIndexQueryResult<T> {
  readonly data: readonly T[]
  readonly completeness: 'complete' | 'partial' | 'unknown'
  readonly restricted: number | null
  readonly progress: BioIndexProgress | null
}

export interface BioIndexRequestOptions {
  readonly signal?: AbortSignal
}

export interface BioIndexQueryOptions extends BioIndexRequestOptions {
  readonly limit?: number
}

export interface BioIndexClientOptions {
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
}

export class BioIndexHttpError extends Error {
  readonly status: number

  constructor(path: string, status: number) {
    super(`BioIndex request to ${path} failed with HTTP ${status}.`)
    this.name = 'BioIndexHttpError'
    this.status = status
  }
}

export class BioIndexResponseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BioIndexResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string' || baseUrl.trim() !== baseUrl) {
    throw new TypeError('BioIndex baseUrl must be a URL without surrounding whitespace.')
  }
  if (baseUrl === '' || baseUrl === '/') return ''
  if (baseUrl.startsWith('/') && !baseUrl.startsWith('//') && !/[?#]/.test(baseUrl)) {
    return baseUrl.replace(/\/+$/, '')
  }

  let url: URL
  try {
    url = new URL(baseUrl)
  } catch (cause) {
    throw new TypeError('BioIndex baseUrl must be an HTTP(S) URL or an absolute path.', { cause })
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError('BioIndex baseUrl must not include credentials, a query, or a fragment.')
  }
  return url.href.replace(/\/+$/, '')
}

function indexPath(kind: 'query' | 'match', index: string): string {
  if (typeof index !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(index)) {
    throw new TypeError('BioIndex index must be a valid index name.')
  }
  return `/api/bio/${kind}/${index}`
}

function queryParameters(query: string, options: BioIndexQueryOptions): URLSearchParams {
  if (typeof query !== 'string') throw new TypeError('BioIndex query must be a string.')
  const parameters = new URLSearchParams({ q: query })
  if (options.limit !== undefined) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
      throw new RangeError('BioIndex limit must be a positive safe integer.')
    }
    parameters.set('limit', String(options.limit))
  }
  return parameters
}

function requireDecoder<T>(decoder: BioIndexDecoder<T>): void {
  if (typeof decoder !== 'function') throw new TypeError('A BioIndex record decoder is required.')
}

function decodeRecords<T>(data: unknown[], decoder: BioIndexDecoder<T>, path: string): T[] {
  return data.map((record, index) => {
    try {
      return decoder(record)
    } catch (cause) {
      throw new BioIndexResponseError(`BioIndex response from ${path} has an invalid record at index ${index}.`, { cause })
    }
  })
}

function optionalNonnegativeNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BioIndexResponseError(`BioIndex response has an invalid ${field}.`)
  }
  return value
}

function decodePage<T>(response: Record<string, unknown>, decoder: BioIndexDecoder<T>, path: string): BioIndexPage<T> {
  const { count, continuation, data, restricted, progress } = response
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new BioIndexResponseError(`BioIndex response from ${path} has an invalid count.`)
  }
  if (continuation !== null && (typeof continuation !== 'string' || continuation.length === 0)) {
    throw new BioIndexResponseError(`BioIndex response from ${path} has an invalid continuation.`)
  }
  if (!Array.isArray(data)) {
    throw new BioIndexResponseError(`BioIndex response from ${path} has invalid data.`)
  }
  const restrictedCount = optionalNonnegativeNumber(restricted, 'restricted count')
  let decodedProgress: BioIndexProgress | null | undefined
  if (progress === null) {
    decodedProgress = null
  } else if (progress !== undefined) {
    if (!isRecord(progress)) throw new BioIndexResponseError('BioIndex response has invalid progress.')
    decodedProgress = {
      bytesRead: optionalNonnegativeNumber(progress.bytes_read, 'bytes_read'),
      bytesTotal: optionalNonnegativeNumber(progress.bytes_total, 'bytes_total'),
      filtered: optionalNonnegativeNumber(progress.filtered, 'filtered count'),
    }
  }
  return {
    data: decodeRecords(data, decoder, path),
    count,
    continuation,
    restricted: restrictedCount,
    progress: decodedProgress,
  }
}

function decodePhenotype(value: unknown): Phenotype {
  if (!isRecord(value)
    || typeof value.name !== 'string'
    || typeof value.description !== 'string'
    || typeof value.group !== 'string'
    || (value.dichotomous !== 0 && value.dichotomous !== 1)) {
    throw new BioIndexResponseError('Invalid phenotype metadata.')
  }
  return {
    name: value.name,
    description: value.description,
    group: value.group,
    dichotomous: value.dichotomous === 1,
  }
}

function decodeDataset(value: unknown): PortalDataset {
  if (!isRecord(value)
    || typeof value.name !== 'string'
    || typeof value.description !== 'string'
    || !Array.isArray(value.phenotypes)
    || !value.phenotypes.every((phenotype): phenotype is string => typeof phenotype === 'string')
    || typeof value.ancestry !== 'string'
    || (value.ancestry_name !== null && typeof value.ancestry_name !== 'string')
    || typeof value.tech !== 'string'
    || typeof value.subjects !== 'number'
    || !Number.isSafeInteger(value.subjects)
    || value.subjects < 0
    || (value.community !== null && typeof value.community !== 'string')) {
    throw new BioIndexResponseError('Invalid portal dataset metadata.')
  }
  return {
    name: value.name,
    description: value.description,
    phenotypes: value.phenotypes,
    ancestry: value.ancestry,
    ancestryName: value.ancestry_name,
    technology: value.tech,
    subjects: value.subjects,
    community: value.community,
  }
}

function decodeString(value: unknown): string {
  if (typeof value !== 'string') throw new BioIndexResponseError('Expected a string match.')
  return value
}

export function decodeVariantAssociation(value: unknown): VariantAssociation {
  if (!isRecord(value)) throw new BioIndexResponseError('Invalid variant association.')
  for (const field of ['varId', 'phenotype', 'ancestry', 'chromosome', 'reference', 'alt', 'dataset', 'source']) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      throw new BioIndexResponseError(`Invalid association ${field}.`)
    }
  }
  if (typeof value.position !== 'number' || !Number.isSafeInteger(value.position) || value.position < 1
    || typeof value.pValue !== 'number' || !Number.isFinite(value.pValue) || value.pValue < 0 || value.pValue > 1
    || (value.beta != null && (typeof value.beta !== 'number' || !Number.isFinite(value.beta)))
    || (value.dbSNP != null && typeof value.dbSNP !== 'string')
    || (value.consequence != null && typeof value.consequence !== 'string')
    || (value.inMetaTypes != null && typeof value.inMetaTypes !== 'string')
    || (value.nearest != null && (!Array.isArray(value.nearest) || !value.nearest.every((gene) => typeof gene === 'string')))) {
    throw new BioIndexResponseError('Invalid association statistics or annotations.')
  }
  return {
    variantId: value.varId as string,
    phenotype: value.phenotype as string,
    ancestry: value.ancestry as string,
    chromosome: value.chromosome as string,
    position: value.position,
    reference: value.reference as string,
    alternate: value.alt as string,
    rsId: (value.dbSNP as string | undefined | null) || null,
    consequence: (value.consequence as string | undefined | null) || null,
    nearestGenes: value.nearest == null ? [] : [...new Set(value.nearest as string[])].filter(Boolean),
    pValue: value.pValue,
    beta: (value.beta as number | undefined | null) ?? null,
    metaTypes: value.inMetaTypes == null ? [] : [...new Set((value.inMetaTypes as string).split(';').filter(Boolean))],
    dataset: value.dataset as string,
    source: value.source as string,
  }
}

function supportRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new BioIndexResponseError('Invalid genetic-support record.')
  return value
}

function supportString(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new BioIndexResponseError('Invalid genetic-support identifier.')
  return value
}

function supportNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new BioIndexResponseError('Invalid genetic-support statistic.')
  return value
}

function optionalSupportString(value: unknown): string | null {
  return value == null ? null : supportString(value)
}

function decodePigeanModel(row: Record<string, unknown>): PigeanModel {
  const sigma = supportNumber(row.sigma)
  if (sigma <= 0) throw new BioIndexResponseError('Invalid PIGEAN sigma.')
  return { sigma, geneSetCollection: supportString(row.gene_set_size) }
}

export function decodePigeanGeneSupport(value: unknown): PigeanGeneSupport {
  const row = supportRecord(value)
  return {
    ...decodePigeanModel(row),
    phenotype: supportString(row.phenotype), gene: supportString(row.gene),
    combined: supportNumber(row.combined), direct: supportNumber(row.log_bf), indirect: supportNumber(row.prior),
    factor: optionalSupportString(row.factor), factorLabel: optionalSupportString(row.label),
  }
}

export function decodeHugeGeneScore(value: unknown): HugeGeneScore {
  const row = supportRecord(value)
  const start = supportNumber(row.start)
  const end = supportNumber(row.end)
  const score = supportNumber(row.huge)
  const common = row.bf_common == null ? null : supportNumber(row.bf_common)
  const rare = row.bf_rare == null ? null : supportNumber(row.bf_rare)
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end < start
    || score < 0 || (common !== null && common < 0) || (rare !== null && rare < 0)) {
    throw new BioIndexResponseError('Invalid HuGE score or locus.')
  }
  return { phenotype: supportString(row.phenotype), gene: supportString(row.gene), chromosome: supportString(row.chromosome), start, end, score, common, rare }
}

export function decodeFalconGeneProbability(value: unknown): FalconGeneProbability {
  const row = supportRecord(value)
  const pip = supportNumber(row.PIP)
  if (pip < 0 || pip > 1) throw new BioIndexResponseError('Invalid FALCON probability.')
  return { phenotype: supportString(row.TRAIT), gene: supportString(row.GENE), pip }
}

export function decodePigeanGeneSetEvidence(value: unknown): PigeanGeneSetEvidence {
  const row = supportRecord(value)
  return { ...decodePigeanModel(row), phenotype: supportString(row.phenotype), gene: supportString(row.gene), geneSet: supportString(row.gene_set), jointEffect: supportNumber(row.beta), source: supportString(row.source) }
}

function supportKey(value: string): string {
  if (typeof value !== 'string' || !value || value.includes(',')) throw new TypeError('A single genetic-support query key is required.')
  return value
}

export function decodeGlobalEnrichment(value: unknown): GlobalEnrichment {
  const row = supportRecord(value)
  const pValue = supportNumber(row.pValue), snps = supportNumber(row.SNPs), expectedSnps = supportNumber(row.expectedSNPs)
  const sourceEnrichment = row.enrichment == null ? null : supportNumber(row.enrichment)
  if (pValue < 0 || pValue > 1 || expectedSnps < 0) throw new BioIndexResponseError('Invalid global-enrichment statistics.')
  const ratio = expectedSnps > 0 ? snps / expectedSnps : NaN
  const name = (value: unknown) => value == null || value === '' ? null : supportString(value)
  return {
    phenotype: supportString(row.phenotype), ancestry: supportString(row.ancestry), annotation: name(row.annotation), tissue: name(row.tissue), method: name(row.method),
    pValue, snps, expectedSnps, sourceEnrichment, fold: Number.isFinite(ratio) ? ratio : null,
  }
}

export function decodeGeneticCorrelation(value: unknown): GeneticCorrelation {
  const row = supportRecord(value)
  const pValue = supportNumber(row.pValue), correlation = supportNumber(row.rg), standardError = supportNumber(row.stdErr)
  if (pValue < 0 || pValue > 1 || standardError < 0) throw new BioIndexResponseError('Invalid genetic-correlation statistics.')
  return {
    phenotype: supportString(row.phenotype), otherPhenotype: supportString(row.other_phenotype),
    ancestry: supportString(row.ancestry), project: supportString(row.project), pValue, correlation, standardError,
  }
}

export function decodePathwayAssociation(value: unknown): PathwayAssociation {
  const row = supportRecord(value)
  const pValue = supportNumber(row.pValue), beta = supportNumber(row.beta), standardError = supportNumber(row.stdErr)
  const betaStandardError = row.betaStdErr == null ? null : supportNumber(row.betaStdErr)
  const geneCount = row.numGenes == null ? null : supportNumber(row.numGenes)
  if (pValue < 0 || pValue > 1 || standardError < 0 || (betaStandardError !== null && betaStandardError < 0)
    || (geneCount !== null && (!Number.isSafeInteger(geneCount) || geneCount < 0))) throw new BioIndexResponseError('Invalid pathway statistics.')
  return {
    phenotype: supportString(row.phenotype), ancestry: supportString(row.ancestry), pathwayName: supportString(row.pathwayName),
    pValue, beta, standardError, betaStandardError, geneCount,
  }
}

export function decodeCs2ctRecord(value: unknown): Cs2ctRecord {
  const row = supportRecord(value)
  const clumpStart = supportNumber(row.clumpStart), clumpEnd = supportNumber(row.clumpEnd)
  const variantCount = supportNumber(row.varTotal), overlapProbability = supportNumber(row.posteriorProbability)
  const genericity = supportNumber(row.totalEntropy), score = supportNumber(row.Q)
  if (!Number.isSafeInteger(clumpStart) || clumpStart < 0 || !Number.isSafeInteger(clumpEnd) || clumpEnd < clumpStart
    || !Number.isSafeInteger(variantCount) || variantCount < 0 || overlapProbability < 0 || overlapProbability > 1 || genericity < 0) {
    throw new BioIndexResponseError('Invalid CS2CT statistics or interval.')
  }
  return {
    phenotype: supportString(row.phenotype), ancestry: supportString(row.ancestry), annotation: supportString(row.annotation),
    tissue: row.tissue == null || row.tissue === '' ? null : supportString(row.tissue),
    biosample: row.biosample == null || row.biosample === '' ? null : supportString(row.biosample),
    source: supportString(row.source), dataset: supportString(row.dataset), credibleSetId: supportString(row.credibleSetId),
    chromosome: supportString(row.chromosome), clumpStart, clumpEnd, variantCount,
    overlapLeadVariant: row.overlapLeadSNP == null || row.overlapLeadSNP === '' ? null : supportString(row.overlapLeadSNP),
    overlapProbability, genericity, score,
  }
}

function modelKeys(model: PigeanModel): string {
  if (!model || !Number.isFinite(model.sigma) || model.sigma <= 0) throw new TypeError('A positive PIGEAN sigma is required.')
  return `${model.sigma},${supportKey(model.geneSetCollection)}`
}

export function createBioIndexClient(options: BioIndexClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchRequest = options.fetch ?? globalThis.fetch
  if (typeof fetchRequest !== 'function') throw new TypeError('A fetch implementation is required.')

  async function requestBody(path: string, parameters: URLSearchParams, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const response = await fetchRequest(`${baseUrl}${path}?${parameters}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!response.ok) throw new BioIndexHttpError(path, response.status)

    let body: unknown
    try {
      body = await response.json()
    } catch (cause) {
      if (signal?.aborted) throw cause
      throw new BioIndexResponseError(`BioIndex response from ${path} is not valid JSON.`, { cause })
    }
    if (!isRecord(body)) {
      throw new BioIndexResponseError(`BioIndex response from ${path} has invalid data.`)
    }
    return body
  }

  async function request(path: string, parameters: URLSearchParams, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const body = await requestBody(path, parameters, signal)
    if (!Array.isArray(body.data)) throw new BioIndexResponseError(`BioIndex response from ${path} has invalid data.`)
    return body
  }

  async function continuePage<T>(token: string, decoder: BioIndexDecoder<T>, requestOptions: BioIndexRequestOptions = {}): Promise<BioIndexPage<T>> {
    if (typeof token !== 'string' || token.length === 0) throw new TypeError('BioIndex continuation token must not be empty.')
    requireDecoder(decoder)
    const path = '/api/bio/cont'
    const response = await request(path, new URLSearchParams({ token }), requestOptions.signal)
    return decodePage(response, decoder, path)
  }

  async function queryPage<T>(index: string, query: string, decoder: BioIndexDecoder<T>, requestOptions: BioIndexQueryOptions = {}): Promise<BioIndexPage<T>> {
    const path = indexPath('query', index)
    requireDecoder(decoder)
    const response = await request(path, queryParameters(query, requestOptions), requestOptions.signal)
    return decodePage(response, decoder, path)
  }

  async function portalMetadata<T>(path: string, group: string, decoder: BioIndexDecoder<T>, requestOptions: BioIndexRequestOptions): Promise<readonly T[]> {
    if (typeof group !== 'string' || group.length === 0) throw new TypeError('BioIndex portal group must not be empty.')
    const response = await request(path, new URLSearchParams({ q: group }), requestOptions.signal)
    if (!Array.isArray(response.data) || !Number.isSafeInteger(response.count) || response.count !== response.data.length) {
      throw new BioIndexResponseError(`BioIndex response from ${path} has an invalid or incomplete count.`)
    }
    return decodeRecords(response.data, decoder, path)
  }

  async function queryAll<T>(index: string, query: string, decoder: BioIndexDecoder<T>, requestOptions: BioIndexQueryOptions = {}): Promise<BioIndexQueryResult<T>> {
    let page = await queryPage(index, query, decoder, requestOptions)
    const data: T[] = []
    const tokens = new Set<string>()
    let restricted: number | null = 0
    let hasRestrictedRecords = false
    let countsMatch = true

    while (true) {
      for (const record of page.data) data.push(record)
      countsMatch &&= page.count === page.data.length
      if (page.restricted === undefined) {
        restricted = null
      } else {
        hasRestrictedRecords ||= page.restricted > 0
        if (restricted !== null) restricted += page.restricted
      }
      if (page.continuation === null) break
      if (tokens.has(page.continuation)) throw new BioIndexResponseError('BioIndex returned a repeated continuation token.')
      tokens.add(page.continuation)
      page = await continuePage(page.continuation, decoder, { signal: requestOptions.signal })
    }

    const progress = page.progress ?? null
    const { bytesRead, bytesTotal } = progress ?? {}
    let completeness: BioIndexQueryResult<T>['completeness'] = 'unknown'
    if (hasRestrictedRecords || (bytesRead !== undefined && bytesTotal !== undefined && bytesRead < bytesTotal)) {
      completeness = 'partial'
    } else if (restricted !== null && countsMatch
      && (requestOptions.limit === undefined || data.length < requestOptions.limit)
      && bytesRead !== undefined && bytesRead === bytesTotal) {
      completeness = 'complete'
    }
    return { data, completeness, restricted, progress }
  }

  return {
    async phenotypes(group: string, requestOptions: BioIndexRequestOptions = {}): Promise<readonly Phenotype[]> {
      return portalMetadata('/api/portal/phenotypes', group, decodePhenotype, requestOptions)
    },

    async datasets(group: string, requestOptions: BioIndexRequestOptions = {}): Promise<readonly PortalDataset[]> {
      return portalMetadata('/api/portal/datasets', group, decodeDataset, requestOptions)
    },

    query: queryPage,

    queryAll,

    async variantAssociations(phenotype: string, ancestry = '', requestOptions: BioIndexQueryOptions = {}): Promise<BioIndexQueryResult<VariantAssociation>> {
      if (typeof phenotype !== 'string' || !phenotype || phenotype.includes(',')) {
        throw new TypeError('A single phenotype ID is required.')
      }
      if (typeof ancestry !== 'string' || (ancestry !== '' && !/^[A-Za-z]+$/.test(ancestry))) {
        throw new TypeError('An ancestry code is required.')
      }
      return queryAll(
        ancestry ? 'ancestry-global-associations' : 'global-associations',
        ancestry ? `${phenotype},${ancestry}` : phenotype,
        (value) => {
          const association = decodeVariantAssociation(value)
          if (association.phenotype !== phenotype || (ancestry && association.ancestry !== ancestry)) {
            throw new BioIndexResponseError('Association does not match the requested phenotype and ancestry.')
          }
          return association
        },
        { ...requestOptions, limit: requestOptions.limit ?? 1000 },
      )
    },

    async pigeanGeneSupport(phenotype: string, model: PigeanModel, requestOptions: BioIndexQueryOptions = {}) {
      const keys = `${supportKey(phenotype)},${modelKeys(model)}`
      return queryAll('pigean-gene-phenotype', keys, (value) => {
        const row = decodePigeanGeneSupport(value)
        if (row.phenotype !== phenotype || row.sigma !== model.sigma || row.geneSetCollection !== model.geneSetCollection) throw new BioIndexResponseError('PIGEAN record does not match the requested model.')
        return row
      }, { ...requestOptions, limit: requestOptions.limit ?? 1000 })
    },

    async hugeGeneScores(phenotype: string, requestOptions: BioIndexQueryOptions = {}) {
      return queryAll('huge-phenotype', supportKey(phenotype), (value) => {
        const row = decodeHugeGeneScore(value)
        if (row.phenotype !== phenotype) throw new BioIndexResponseError('HuGE record does not match the requested phenotype.')
        return row
      }, { ...requestOptions, limit: requestOptions.limit ?? 1000 })
    },

    async falconGeneProbabilities(phenotype: string, requestOptions: BioIndexQueryOptions = {}) {
      return queryAll('falcon.trait.associated.genes', supportKey(phenotype), (value) => {
        const row = decodeFalconGeneProbability(value)
        if (row.phenotype !== phenotype) throw new BioIndexResponseError('FALCON record does not match the requested phenotype.')
        return row
      }, { ...requestOptions, limit: requestOptions.limit ?? 2000 })
    },

    async pigeanGeneSets(phenotype: string, gene: string, model: PigeanModel, requestOptions: BioIndexQueryOptions = {}) {
      const keys = `${supportKey(phenotype)},${supportKey(gene)},${modelKeys(model)}`
      return queryAll('pigean-joined-gene', keys, (value) => {
        const row = decodePigeanGeneSetEvidence(value)
        if (row.phenotype !== phenotype || row.gene !== gene || row.sigma !== model.sigma || row.geneSetCollection !== model.geneSetCollection) throw new BioIndexResponseError('Gene-set evidence does not match the requested gene and model.')
        return row
      }, { ...requestOptions, limit: requestOptions.limit ?? 1000 })
    },

    async globalEnrichments(phenotype: string, requestOptions: BioIndexQueryOptions = {}) {
      return queryAll('global-enrichment', supportKey(phenotype), (value) => {
        const row = decodeGlobalEnrichment(value)
        if (row.phenotype !== phenotype) throw new BioIndexResponseError('Global enrichment does not match the requested phenotype.')
        return row
      }, { ...requestOptions, limit: requestOptions.limit ?? 2000 })
    },

    async geneticCorrelations(phenotype: string, ancestry = '', requestOptions: BioIndexQueryOptions = {}) {
      const keys = [supportKey(phenotype), ...(ancestry ? [supportKey(ancestry)] : [])]
      return queryAll('genetic-correlation', keys.join(','), (value) => {
        const row = decodeGeneticCorrelation(value)
        if (row.phenotype !== phenotype || (ancestry && row.ancestry !== ancestry)) throw new BioIndexResponseError('Genetic correlation does not match the requested phenotype and ancestry.')
        return row
      }, { ...requestOptions, limit: requestOptions.limit ?? 1000 })
    },

    async pathwayAssociations(phenotype: string, ancestry = '', requestOptions: BioIndexQueryOptions = {}) {
      const keys = [supportKey(phenotype), ...(ancestry ? [supportKey(ancestry)] : [])]
      return queryAll('pathway-associations', keys.join(','), (value) => {
        const row = decodePathwayAssociation(value)
        if (row.phenotype !== phenotype || (ancestry && row.ancestry !== ancestry)) throw new BioIndexResponseError('Pathway record does not match the requested phenotype and ancestry.')
        return row
      }, { ...requestOptions, limit: requestOptions.limit ?? 100 })
    },

    async cs2ctAnnotations(requestOptions: BioIndexRequestOptions = {}): Promise<readonly string[]> {
      const body = await requestBody('/api/bio/keys/c2ct-annotation/2', new URLSearchParams({ columns: 'annotation' }), requestOptions.signal)
      if (!Array.isArray(body.keys) || (body.continuation !== undefined && body.continuation !== null)) throw new BioIndexResponseError('Invalid or incomplete CS2CT annotation keys.')
      const annotations = body.keys.map((tuple) => {
        if (!Array.isArray(tuple) || tuple.length !== 1) throw new BioIndexResponseError('Invalid CS2CT annotation tuple.')
        return supportString(tuple[0])
      })
      return [...new Set(annotations)].sort()
    },

    async cs2ct(phenotype: string, ancestry = '', annotation = '', requestOptions: BioIndexQueryOptions = {}) {
      const keys = [supportKey(phenotype), ...(ancestry ? [supportKey(ancestry)] : []), ...(annotation ? [supportKey(annotation)] : [])]
      return queryAll(annotation ? 'c2ct-annotation' : 'c2ct', keys.join(','), (value) => {
        const row = decodeCs2ctRecord(value)
        if (row.phenotype !== phenotype || (ancestry && row.ancestry !== ancestry) || (annotation && row.annotation !== annotation)) throw new BioIndexResponseError('CS2CT record does not match the requested phenotype, ancestry and annotation.')
        return row
      }, { ...requestOptions, limit: requestOptions.limit ?? 1000 })
    },

    async match(index: string, query: string, requestOptions: BioIndexQueryOptions = {}): Promise<BioIndexPage<string>> {
      const path = indexPath('match', index)
      const response = await request(path, queryParameters(query, requestOptions), requestOptions.signal)
      return decodePage(response, decodeString, path)
    },

    continuePage,

    phenotypePlotUrl(phenotype: string, plot: 'manhattan' | 'qq', ancestry?: string): string {
      if (typeof phenotype !== 'string' || phenotype.length === 0) throw new TypeError('A phenotype name is required.')
      if (plot !== 'manhattan' && plot !== 'qq') throw new TypeError('BioIndex plot must be manhattan or qq.')
      if (ancestry && !/^[A-Za-z]+$/.test(ancestry)) throw new TypeError('BioIndex ancestry must be an ancestry code.')
      const segments = [phenotype, ...(ancestry ? [ancestry] : [])].map(encodeURIComponent).join('/')
      return `${baseUrl}/api/raw/plot/phenotype/${segments}/${plot}.png`
    },

    async continueMatches(token: string, requestOptions: BioIndexRequestOptions = {}): Promise<BioIndexPage<string>> {
      return continuePage(token, decodeString, requestOptions)
    },
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new BioIndexResponseError(`Invalid provenance ${field}.`)
  return value
}

function nullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new BioIndexResponseError(`Invalid provenance ${field}.`)
  return value
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new BioIndexResponseError('Invalid provenance record.')
  return value
}

function array<T>(value: unknown, decode: (entry: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new BioIndexResponseError('Invalid provenance array.')
  return value.map(decode)
}

function decodeProvenanceTrait(value: unknown): ProvenanceTrait {
  const trait = record(value)
  return {
    legacyId: requiredString(trait.legacy_id, 'trait ID'),
    name: requiredString(trait.name ?? trait.description ?? trait.legacy_id, 'trait name'),
    ancestries: array(trait.ancestries, (value) => {
      const ancestry = record(value)
      return {
        id: requiredString(ancestry.id, 'ancestry artifact ID'),
        ancestryId: requiredString(ancestry.ancestry_id, 'ancestry ID'),
        ancestryName: requiredString(ancestry.ancestry_name ?? ancestry.ancestry_id, 'ancestry name'),
      }
    }),
  }
}

function decodeProvenance(value: unknown): BottomLineProvenance {
  const detail = record(value)
  const graph = record(detail.provenance)
  function nodes(field: string, type: string): ProvenanceNode[] {
    return array(graph[field], (value) => {
      const node = record(value)
      return {
        id: requiredString(node.id, 'node ID'),
        name: requiredString(node.name ?? node.description ?? node.filename ?? node.id, 'node name'),
        type: nullableString(node.activity_type, 'activity type') ?? type,
        location: nullableString(node.repo_url ?? node.self_uri ?? node.local_id ?? node.location ?? node.url, 'location'),
      }
    })
  }
  function edges(field: string): ProvenanceEdge[] {
    return array(graph[field], (value) => {
      const edge = record(value)
      return { subject: requiredString(edge.subject, 'edge subject'), object: requiredString(edge.object, 'edge object') }
    })
  }
  const activities = nodes('activities', 'Activity')
  const resources = [...nodes('c2m2_files', 'C2M2 file'), ...nodes('datasets', 'Dataset'), ...nodes('drs_objects', 'DRS object')]
  const ids = new Set<string>()
  for (const { id } of [...activities, ...resources]) {
    if (ids.has(id)) throw new BioIndexResponseError('Duplicate provenance node ID.')
    ids.add(id)
  }
  return {
    id: requiredString(detail.id, 'artifact ID'),
    traitId: requiredString(detail.trait_legacy_id, 'trait ID'),
    ancestryId: requiredString(detail.ancestry_id, 'ancestry ID'),
    pipelineType: requiredString(detail.pipeline_type, 'pipeline type'),
    description: nullableString(detail.description, 'description'),
    graph: { activities, resources, used: edges('used_edges'), generated: edges('was_generated_by_edges'), linked: edges('has_drs_object_edges') },
    raw: graph,
  }
}

/** Translator artifact provenance uses plain JSON rather than BioIndex envelopes. */
export function createProvenanceClient(options: BioIndexClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchRequest = options.fetch ?? globalThis.fetch
  if (typeof fetchRequest !== 'function') throw new TypeError('A fetch implementation is required.')

  async function request(path: string, requestOptions: BioIndexRequestOptions): Promise<unknown> {
    const response = await fetchRequest(`${baseUrl}${path}`, { headers: { Accept: 'application/json' }, signal: requestOptions.signal })
    if (!response.ok) throw new BioIndexHttpError(path, response.status)
    try {
      return await response.json()
    } catch (cause) {
      if (requestOptions.signal?.aborted) throw cause
      throw new BioIndexResponseError('Provenance response is not valid JSON.', { cause })
    }
  }

  function provenanceUrl(id: string): string {
    requiredString(id, 'artifact ID')
    return `${baseUrl}/get_provenance?${new URLSearchParams({ id })}`
  }

  return {
    async traits(requestOptions: BioIndexRequestOptions = {}): Promise<readonly ProvenanceTrait[]> {
      return array(await request('/ws/bottom_line/trait_list_full', requestOptions), decodeProvenanceTrait)
    },
    async provenance(id: string, requestOptions: BioIndexRequestOptions = {}): Promise<BottomLineProvenance> {
      requiredString(id, 'artifact ID')
      const result = decodeProvenance(await request(`/get_provenance?${new URLSearchParams({ id })}`, requestOptions))
      if (result.id !== id) throw new BioIndexResponseError('Provenance artifact does not match the request.')
      return result
    },
    provenanceUrl,
    summaryStatisticsUrl(traitId: string, ancestryId: string): string {
      requiredString(traitId, 'trait ID')
      requiredString(ancestryId, 'ancestry ID')
      return `https://dig-open-bottom-line-analysis.s3.amazonaws.com/bottom-line/${encodeURIComponent(ancestryId)}/${encodeURIComponent(traitId)}.sumstats.tsv.gz`
    },
  }
}
