# Gene-support fixture sources

Recorded on 2026-11-11 from `https://bioindex-ext.hugeamp.org`. Record contents
are unchanged; `gene-support-records.json` groups reduced samples rather than
reproducing query envelopes.

- `pigean`: first two and last returned records from
  `/api/bio/query/pigean-gene-phenotype?q=CAD,2,mouse_msigdb&limit=1000`.
- `t2d`: first two records of the same index with `q=T2D,2,mouse_msigdb&limit=2`.
- `huge`: first two records and the first duplicated gene's locus records from
  `/api/bio/query/huge-phenotype?q=CAD&limit=1000`.
- `falcon`: first two and last returned records from
  `/api/bio/query/falcon.trait.associated.genes?q=CAD&limit=2000`.
- `joined`: two records from
  `/api/bio/query/pigean-joined-gene?q=CAD,LDLR,2,mouse_msigdb&limit=2`.

Index discovery verified these key layouts. FALCON is available on production;
the local legacy component fetches it from the development host. The new client
uses the caller's configured BioIndex host for all sources.

PIGEAN `huge_score` is not substituted for `huge-phenotype.huge`: the recorded
LDLR values are 2.5 and 6960 respectively. PIGEAN factor labels are optional.
Multiple HuGE loci can share a gene; comparisons explicitly use the highest
returned score while the HuGE tab retains all records. No match means missing,
never zero. Synthetic tests cover malformed records, wrong models/genes/traits,
zero probabilities, duplicate joins and continuation behavior.
