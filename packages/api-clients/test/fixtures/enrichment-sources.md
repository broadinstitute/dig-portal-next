# Global-enrichment fixture sources

Recorded on 2026-11-12 from `https://bioindex-ext.hugeamp.org`.
`enrichment-records.json` contains unchanged reduced records without envelopes:

- `cad`: first two and last rows from
  `/api/bio/query/global-enrichment?q=CAD&limit=2000`.
- `european`: first two EU rows from the same CAD response.
- `t2d`: first two rows with `q=T2D&limit=2000`.
- `negative`: CAD row 415 (zero-based), with signed SNPs and enrichment estimates.

Discovery verifies a phenotype-only key. `CAD,EU` and `CAD,GME` queries return
HTTP 400; ancestry must be selected locally from the all-ancestry result.
CAD returned 1,296 rows and T2D 1,512, both complete/unrestricted at limit 2,000.
At limit 1,000 both responses were partial despite null continuation.

Legacy references are `EnrichmentTable.vue` and phenotype `main.js`/template/store.
The shortlist is chosen after ancestry filtering: all p-values strictly below
1e-5 when at least 20 qualify, otherwise the lowest 20 p-values. User filters
then operate on this shortlist. The replacement keeps zero p-values and raw
rows rather than copying the legacy truthiness/group-index bugs. SNPs and
expectedSNPs are fractional, not integer counts; SNPs and enrichment estimates
can be negative. Preserve their sign. Fold is their ratio, with null
for zero denominators or overflow; source enrichment is retained separately.
Synthetic tests cover missing names, undefined ratios, zero statistics,
duplicate rows, shortlist boundaries, exact/inclusive filters and safe CSV.
