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
