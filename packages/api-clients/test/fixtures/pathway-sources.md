# Pathway fixture sources

Recorded on 2026-11-12 from `https://bioindex-ext.hugeamp.org`.
`pathway-records.json` contains unchanged reduced records, without query envelopes:

- `cad`: first two and last returned records from
  `/api/bio/query/pathway-associations?q=CAD&limit=100`.
- `european`: first two records from the same index with `q=CAD,EU&limit=100`.
- `t2d`: first two records with `q=T2D&limit=100`.

Live `/api/bio/indexes` discovery verifies `phenotype` and `phenotype,ancestry`
keys for this index. Each nonempty query above returned 100 records with partial
byte progress; `CAD,GME` returned zero with complete progress. A null continuation
does not establish completeness for a capped query.

The legacy `PathwayTable.vue` displays `pathwayName`, `pValue`, `beta`, `stdErr`,
defaults to ascending p-value and ten-row pages, and the phenotype store requests
100 rows. The replacement preserves those columns and cap. European records
also have `betaStdErr` and `numGenes`; they are retained separately for CSV.
Do not substitute `betaStdErr` for `stdErr`, or exponentiate beta for binary
phenotypes. Synthetic tests cover signed/zero statistics, missing optional fields,
malformed values, trait/ancestry mismatches, continuation, numeric sorting and CSV.
