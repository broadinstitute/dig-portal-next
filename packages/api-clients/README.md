# BioIndex client

The client is framework-independent and receives its API base URL from the caller. It supports the phenotype and dataset registries, index queries, prefix matches, and explicit continuation requests. Portal metadata rejects a count that does not match the returned records. Query records are `unknown` until the caller supplies a decoder for that index; malformed envelopes, records, and HTTP failures reject rather than returning an empty result.

```ts
import { createBioIndexClient } from '@dig-portal/api-clients'

const client = createBioIndexClient({ baseUrl: 'https://bioindex.hugeamp.org' })
const phenotypes = await client.phenotypes(registryGroup)
const datasets = await client.datasets(registryGroup)
```

`query` and `match` return one page. Pass a continuation token to `continuePage` (with the same record decoder) or `continueMatches` until it is `null`, and detect repeated tokens. `queryAll` follows query continuations, rejects repeated tokens, and reports `complete`, `partial`, or `unknown` along with the restricted count and final progress; it may still return a partial result.

BioIndex's `limit` is a total result cap, not a page size: a null continuation can still describe a partial result. A result is complete only when each page has a matching count and known unrestricted access, the cap was not reached, and the final progress reports that all remaining bytes were read. Missing or inconsistent evidence yields `unknown`; unread bytes or restricted records yield `partial`.

The cap check matters even when all bytes are reported as read: BioIndex can consume one extra record without returning it. For example, the CAD global-associations query currently has 598 records, but `limit=597` reports 597 records and all bytes read. Progress on continuation responses is relative to that resumed reader, not the original query.

The test fixtures are reduced samples of public BioIndex responses; pagination tokens and error responses are simulated.

## Single-variant associations

`variantAssociations(phenotype, ancestry?, options?)` selects
`global-associations` for the combined results or `ancestry-global-associations`
for a selected ancestry. It uses a default total limit of 1,000, follows
continuations, and returns the same explicit completeness information as
`queryAll`. Reaching that limit is not proof that all records were returned.

The client validates consumed variant/statistic fields and rejects records for
another phenotype or selected ancestry, including continuation pages. Missing
optional annotations and effects remain explicitly unavailable. The exported
`decodeVariantAssociation` can also decode these records in other typed queries.
Public recorded samples and source endpoints are documented in
[`association-sources.md`](./test/fixtures/association-sources.md).

```ts
const result = await client.variantAssociations('CAD', 'EU', { signal, limit: 1000 })
// Show result.completeness alongside result.data; do not imply exhaustive counts.
```

## Bottom-line provenance

`createProvenanceClient` reads the public Translator artifact-provenance service
used by the legacy bottom-line component. This service returns plain JSON, not
BioIndex envelopes. `traits()` decodes the trait/ancestry catalog;
`provenance(artifactId)` validates the artifact metadata and graph and rejects a
response for a different artifact. Both methods accept an abort signal and reject
malformed responses and HTTP failures. Original graph JSON is retained for inspection.

```ts
import { createProvenanceClient } from '@dig-portal/api-clients'

const client = createProvenanceClient({
  baseUrl: 'https://translator.broadinstitute.org/artifact_provenance',
})
const traits = await client.traits()
```

The caller selects the exact trait ID and ancestry; an absent ancestry must not
silently display another ancestry's evidence. On the phenotype page, the combined
result selects `Mixed`. `summaryStatisticsUrl(traitId, ancestryId)` follows the
legacy public download path, independently of the provenance service's artifact
IDs. Fixture sources and reductions are recorded in
[`provenance-sources.md`](./test/fixtures/provenance-sources.md).

CMD supplies this service URL through public build-time config; use
`NUXT_PUBLIC_PROVENANCE_URL` when rebuilding for another environment (D-23).

## Gene-level genetic support

The following typed queries use the caller's configured BioIndex host:

- `pigeanGeneSupport(phenotype, model, options?)`: `pigean-gene-phenotype`,
  with phenotype, sigma, annotation collection keys; default limit 1,000.
- `hugeGeneScores(phenotype, options?)`: `huge-phenotype`; default limit 1,000.
- `falconGeneProbabilities(phenotype, options?)`: `falcon.trait.associated.genes`;
  default limit 2,000. This index was verified on production; no hidden dev-host
  fallback is used.
- `pigeanGeneSets(phenotype, gene, model, options?)`: `pigean-joined-gene`,
  with phenotype, gene, sigma, annotation collection keys; default limit 1,000.

All follow continuations, accept cancellation, report completeness, and reject
records belonging to another requested phenotype, gene, or PIGEAN model.
The model is supplied by the caller (CMD configures sigma 2 and `mouse_msigdb`
in `portal.config.ts`). These queries have no ancestry key.

Preserve the source units: PIGEAN `combined`, `log_bf` and `prior` are reported
support scores; `huge-phenotype.huge` is a raw HuGE score, not the PIGEAN feed's
similarly named `huge_score`. Natural-log HuGE values are a plot transformation
only. Multiple HuGE loci can share a gene. The HuGE tab retains every locus;
comparisons explicitly choose the highest returned score per exact phenotype
and gene ID. Missing matches remain null, and zero FALCON probabilities remain
zero. Sources and reduced fixtures are documented in
[`gene-support-sources.md`](./test/fixtures/gene-support-sources.md).
