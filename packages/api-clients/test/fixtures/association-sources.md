# Association record sources

`association-records.json` was recorded on 2026-11-11 from public BioIndex
production data at `https://bioindex-ext.hugeamp.org`. Records are unchanged;
the enclosing object groups small samples for tests rather than simulating a
BioIndex query envelope.

- `cad`: the first record for each `inMetaTypes` combination plus the first
  record without a dbSNP identifier from
  `/api/bio/query/global-associations?q=CAD&limit=1000` (598 records returned).
- `european`: the first record from
  `/api/bio/query/ancestry-global-associations?q=CAD,EU&limit=3`.
- `t2d`: the first record from
  `/api/bio/query/global-associations?q=T2D&limit=3`.
- `quantitative`: the first BMI record from
  `/api/bio/query/global-associations?q=BMI&limit=3`.

Index discovery confirmed `global-associations` uses the phenotype key and
`ancestry-global-associations` uses phenotype and ancestry keys, with no locus.
The CAD sample includes `bottom-line;largest`, which the legacy summary does
not count. The replacement summary counts all combinations.

Optional/malformed fields, repeated pages, wrong-trait responses and restricted
access are simulated in tests. A limit being reached never establishes result
completeness, even with a null continuation.
