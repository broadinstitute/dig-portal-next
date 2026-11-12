# CS2CT fixture sources

Recorded on 2026-11-11 from `https://bioindex-ext.hugeamp.org`.
`cs2ct-records.json` groups unchanged reduced records, without query envelopes:

- `cad`: the first rare-source record and first three eligible records from
  `/api/bio/query/c2ct-annotation?q=CAD,accessible_chromatin&limit=1000`.
- `european`: two records from the same index with
  `q=CAD,EU,accessible_chromatin&limit=2`.
- `t2d`: the first two eligible records with `q=T2D,enhancer&limit=1000`.
- `negative`: record 243 (zero-based) from the CAD sample. Q is a signed score,
  not a probability; its recorded negative value must not be rejected or clamped.
- `cs2ct-annotations.json`: the full response from
  `/api/bio/keys/c2ct-annotation/2?columns=annotation`. Its envelope uses `keys`,
  not `data` or `count`.

Discovery and live responses verify phenotype-first keys. The legacy store's
ancestry-first query (`EU,CAD,accessible_chromatin`) returns no records; do not
copy that ordering. The UI excludes `bottom-line_analysis_rare`, matching the
legacy table's source rule, without mutating raw tissue/biosample identifiers.
Synthetic tests cover null names, zero statistics, invalid intervals, mismatched
traits/ancestries/annotations, and continuation pages.
