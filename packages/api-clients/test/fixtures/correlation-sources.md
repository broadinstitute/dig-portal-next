# Genetic-correlation fixture sources

Recorded on 2026-11-12 from `https://bioindex-ext.hugeamp.org`.
`correlation-records.json` contains unchanged reduced records without envelopes:

- `cad`: first two, first negative-rg and first rg-above-one records from
  `/api/bio/query/genetic-correlation?q=CAD&limit=1000`.
- `european`: first two records with `q=CAD,EU&limit=1000`.
- `t2d`: first and first rg-below-minus-one records with `q=T2D&limit=1000`.

Live index discovery verifies `phenotype` and `phenotype,ancestry` keys.
CAD returned 651 rows, CAD/EU 603, T2D 715 and CAD/GME zero, each with complete
byte progress, no continuation and no restricted records. Estimated rg spans
-0.6979 to 1.37 for CAD and -1.0777 to 1.1924 for T2D. Preserve these estimates;
do not clamp to [-1, 1]. The smallest recorded p-values are `5e-324`.

Legacy references: `src/components/CorrelationTable.vue` and
`src/views/Phenotype/{Template.vue,store.js,main.js}`. The table filters to
phenotypes in the portal metadata, then applies exact phenotype choices,
maximum p-value and minimum rg; defaults are ascending p-value and ten-row pages.
The replacement receives the already-loaded metadata rather than fetching it
again, reports excluded records, and exports all eligible filtered rows. It
does not add the legacy session/disease-selection workflow, which is absent
from this phenotype-only shell. Links open the rebuilt phenotype page and
keep the selected ancestry; sorting phenotype names uses the displayed labels.
