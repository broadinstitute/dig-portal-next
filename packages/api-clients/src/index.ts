import type { Phenotype } from '@dig-portal/domain'

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
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
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

function decodeString(value: unknown): string {
  if (typeof value !== 'string') throw new BioIndexResponseError('Expected a string match.')
  return value
}

export function createBioIndexClient(options: BioIndexClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchRequest = options.fetch ?? globalThis.fetch
  if (typeof fetchRequest !== 'function') throw new TypeError('A fetch implementation is required.')

  async function request(path: string, parameters: URLSearchParams, signal?: AbortSignal): Promise<Record<string, unknown>> {
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
    if (!isRecord(body) || !Array.isArray(body.data)) {
      throw new BioIndexResponseError(`BioIndex response from ${path} has invalid data.`)
    }
    return body
  }

  async function continuePage<T>(token: string, decoder: BioIndexDecoder<T>, requestOptions: BioIndexRequestOptions = {}): Promise<BioIndexPage<T>> {
    if (typeof token !== 'string' || token.length === 0) throw new TypeError('BioIndex continuation token must not be empty.')
    requireDecoder(decoder)
    const path = '/api/bio/cont'
    const response = await request(path, new URLSearchParams({ token }), requestOptions.signal)
    return decodePage(response, decoder, path)
  }

  return {
    async phenotypes(group: string, requestOptions: BioIndexRequestOptions = {}): Promise<readonly Phenotype[]> {
      if (typeof group !== 'string' || group.length === 0) throw new TypeError('BioIndex phenotype group must not be empty.')
      const path = '/api/portal/phenotypes'
      const response = await request(path, new URLSearchParams({ q: group }), requestOptions.signal)
      if (!Array.isArray(response.data)) throw new BioIndexResponseError(`BioIndex response from ${path} has invalid data.`)
      return decodeRecords(response.data, decodePhenotype, path)
    },

    async query<T>(index: string, query: string, decoder: BioIndexDecoder<T>, requestOptions: BioIndexQueryOptions = {}): Promise<BioIndexPage<T>> {
      const path = indexPath('query', index)
      requireDecoder(decoder)
      const response = await request(path, queryParameters(query, requestOptions), requestOptions.signal)
      return decodePage(response, decoder, path)
    },

    async match(index: string, query: string, requestOptions: BioIndexQueryOptions = {}): Promise<BioIndexPage<string>> {
      const path = indexPath('match', index)
      const response = await request(path, queryParameters(query, requestOptions), requestOptions.signal)
      return decodePage(response, decodeString, path)
    },

    continuePage,

    async continueMatches(token: string, requestOptions: BioIndexRequestOptions = {}): Promise<BioIndexPage<string>> {
      return continuePage(token, decodeString, requestOptions)
    },
  }
}
