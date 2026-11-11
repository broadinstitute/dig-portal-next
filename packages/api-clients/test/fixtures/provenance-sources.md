# Provenance fixture sources

Recorded on 2026-11-11 from the public service used by the legacy
`BottomLineProvenance.vue` component:

- `bottom-line-traits.json`: CAD and T2D entries selected unchanged from
  `https://translator.broadinstitute.org/artifact_provenance/ws/bottom_line/trait_list_full`.
- `cad-provenance.json`: CAD/Mixed from
  `https://translator.broadinstitute.org/artifact_provenance/get_provenance?id=dig-open-bottom-line-analysis-stg_bottom-line_Mixed_CAD.sumstats.tsv.gz`.
  Metadata is unchanged. The graph is reduced to the first two activities,
  their input/output edges, and referenced resources to keep the fixture small.

The complete CAD/Mixed response contained 88 activities, 121 resources,
170 input edges, 103 output edges, and one dataset-to-DRS edge. These are
artifact-provenance responses, not BioIndex query envelopes. The service's
artifact IDs include `stg`; the legacy summary-statistics download uses the
separate public `dig-open-bottom-line-analysis` bucket.
