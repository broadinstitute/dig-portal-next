# BioIndex client

The client is framework-independent and receives its API base URL from the caller. It supports the phenotype registry, index queries, prefix matches, and explicit continuation requests. Query records are `unknown` until the caller supplies a decoder for that index; malformed envelopes, records, and HTTP failures reject rather than returning an empty result.

```ts
import { createBioIndexClient } from '@dig-portal/api-clients'

const client = createBioIndexClient({ baseUrl: 'https://bioindex.hugeamp.org' })
const phenotypes = await client.phenotypes(registryGroup)
```

`query` and `match` return one page. Pass a continuation token to `continuePage` (with the same record decoder) or `continueMatches` until it is `null`, and detect repeated tokens. BioIndex's `limit` is a total result cap, not a page size: a null continuation can still describe a partial result. Inspect the returned `restricted` and `progress` metadata; do not claim a result is complete when access is restricted, bytes remain unread, or completeness is unknown.

The test fixtures are reduced samples of public BioIndex responses; pagination tokens and error responses are simulated.
