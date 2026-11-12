# Handoff: CMD phenotype proof of concept

Snapshot: 2026-11-11. Verify the branch, worktree, and validation results before
resuming; this is a handoff, not an architecture decision record.

## Read first

- [Repository instructions](../../AGENTS.md)
- [Decision register](../decisions.md) (authoritative) and [architecture](../architecture.md)
- [Phenotype PoC status](./phenotype-poc.md) for the complete section plan, risks,
  foundation gaps, and chronological log

Keep the status document current as work proceeds. Update this handoff at the
end of a working session with the next actionable steps and verified results.

## Current state

- The working branch is `feature/phenotype-poc`; HEAD at resume is `016b3cb`
  (the committed provenance slice). Single-variant associations are now
  implemented in the uncommitted worktree.
- The current on-disk files are the baseline. The architect asked to assume
  the changes shown in an older, stale VS Code review are already present;
  do not reconstruct or undo that review without new evidence.
- The worktree was clean at this resume. Earlier manifest/test edits and the
  provenance work were committed in `016b3cb`. Check `git status --short --branch`
  again and preserve unrelated or concurrent edits. The association slice adds
  no dependencies or manifest/lockfile changes.
- [The CMD phenotype page](../../apps/cmd/app/pages/phenotype.vue) supports
  `/phenotype?phenotype=CAD` and optional `ancestry`, phenotype selection,
  plots, single-variant associations, a phenotype/ancestry-filtered dataset table, and
  [effector-gene lists](../../apps/cmd/app/components/EffectorGeneLists.vue).
  A static `phenotype.html` redirect preserves legacy queries and fragments.
- [The association section](../../apps/cmd/app/components/PhenotypeAssociations.vue)
  uses the typed client's `variantAssociations` method. It offers exact gene,
  raw p-value, effect-direction, and full meta-analysis combination filters;
  position/p-value/effect sorting; pagination; summary counts for every
  combination; and CSV export of all filtered/sorted rows. The presentation
  table is [a separate component](../../apps/cmd/app/components/VariantAssociationsTable.vue).
  Filters/sorting/paging use `assocGene`, `assocP`, `assocEffect`, `assocMeta`,
  `assocSort`, `assocOrder`, `assocPage`, and `assocPageSize` query parameters.
  Updates preserve other parameters and the hash. Parent phenotype/ancestry
  selectors reset table state. Region/gene/variant links open the legacy portal.
- Typed association decoding rejects malformed statistics and wrong-trait or
  wrong-ancestry records, including continuation pages. The UI warns when
  completeness is partial/unknown. Counts and CSV never imply exhaustive data
  beyond returned records. Binary traits display odds ratios; CSV keeps raw beta.
- [Bottom-line provenance](../../apps/cmd/app/components/BottomLineProvenance.vue)
  now offers graph, table, original JSON, and summary-statistics links. It loads
  on opening and follows the page selection without rewriting its URL. A
  missing requested ancestry shows no result; it never substitutes another
  ancestry. The combined selection uses `Mixed`.
- The source was verified against the clean local legacy checkout at
  `30957525d`: `src/components/researchPortal/bottomLineProvenance/` and
  `src/views/Phenotype/Template.vue` in `C:/Work/dig-dug-portal`. Provenance is
  served by Translator, **not BioIndex**. The public build-time override is
  `NUXT_PUBLIC_PROVENANCE_URL`; the default is
  `https://translator.broadinstitute.org/artifact_provenance`.
- [Headless phenotype logic](../../packages/feature-phenotype/src/index.ts)
  handles route state, ancestry options, exact trait matching, and dataset
  filtering, plus association filtering/sorting/pagination/formatting/CSV and
  provenance lineage. The imported Nuxt Content catalog contains one CAD list and eight
  T2D lists; do not use substring matching for trait IDs.

## Verification at this snapshot

The following passed with the phenotype changes in the worktree on
2026-11-11: `pnpm portal validate`, shared `pnpm portal typecheck`, `pnpm portal test`,
`pnpm portal typecheck cmd`, `pnpm portal build cmd`, and
`pnpm portal test cmd`. The shared tests included 19 CLI, 17 API-client,
2 content, and 16 phenotype-feature tests; the CMD suite had 6 tests. The
workspace suite needed command-scoped `GIT_CONFIG_COUNT=1`,
`GIT_CONFIG_KEY_0=commit.gpgsign`, `GIT_CONFIG_VALUE_0=false` so temporary Git
fixture commits did not inherit user signing; the plain command failed in GPG.
No global or repository Git configuration was changed.

During the previous provenance session, the first CMD suite run passed six tests.
A repeat passed five and failed
the existing layer-shadow test because the report omitted `auto-import
useFeature`. An isolated diagnostic copy passed three consecutive runs and
showed both scan candidates; the original test and reporter were not modified.
The cause remains unknown. Do not treat the earlier green run as proof that
this gate is reliable; investigate before merge. The association-slice run passed
all six CMD tests; no reporter/test fix was made and the earlier cause is unresolved.

Earlier offline Vue rendering covered datasets and effector-list integration.
This session's offline rendering covered the provenance graph shell, stage
table, JSON, loading, empty/error, exact-selection, link, and escaped-text
states. The ignored `.data/verify-provenance.mjs` script can reproduce that
offline check in this worktree; it is not a substitute for browser tests.
The typed client also decoded all 1,529 live traits and CAD/T2D `Mixed`/`EU`
graphs. CAD/Mixed and T2D/EU summary-statistics HEAD requests returned 200,
and the trait-list service sent `Access-Control-Allow-Origin: *` for localhost.

This session's `.data/verify-associations.mjs` offline check passed table/summary
rendering, URL update events (without refetching), pagination, binary/quantitative
effects, missing/partial/loading/empty/error states, encoded links, escaped text,
and the actual CSV event handler against a simulated document. A 27-record export
from a seven-row page included all 27 records. This is not real-browser validation.
Live typed-client queries returned CAD 598/complete, CAD/EU 337/complete, T2D
1,000/partial, BMI 3/partial (limit 3), and CAD/GME 0/complete. The recorded
[association samples](../../packages/api-clients/test/fixtures/association-sources.md)
include every CAD meta-analysis combination; `bottom-line;largest` is present
and is omitted by the legacy summary, so the replacement counts all combinations.

The dataset, effector, provenance, and association sections have **not** been verified in
a real browser. The architect explicitly authorized localhost HTTP and
browser checks during this session; that authorization persists. An initial
forked-server probe timed out; after a restart using `--no-fork`, the
phenotype route returned HTTP 200. The underlying timeout cause is unknown.
The temporary server was stopped. Computer use ended because it could not
reliably determine the browser URL to enforce its access policy; browser
checks must wait for a working authorized browser surface.
The latest inventory still returned no browsers and `The browser access host is
unavailable`. No native-browser retry or preview server was started this session.

The current static build includes uncommitted work and is not a release
artifact. The renderer is dynamically imported, but the build warns about a
client chunk exceeding 500 kB. Browser transfer and graph performance remain
unmeasured, particularly for T2D/Mixed (315 activities).

## Resume in this order

1. Review the worktree without discarding changes. When browser access is
   working, start `pnpm portal dev cmd --host 127.0.0.1 --no-fork` and check
   datasets, effector lists, provenance, and associations for CAD, T2D, ancestry, empty,
   and error states. Also check modal focus/closing, graph/table/JSON switching,
   keyboard navigation, graph mount/unmount, association URL back/forward,
   filtering/sorting/paging, partial-result warnings, and real CSV downloads. The successful local HTTP
   check used a session-only `NUXT_PUBLIC_BIOINDEX_URL=https://bioindex-ext.hugeamp.org`.
   Stop the server afterward. Verify CORS and Cloudflare on the hosted preview
   separately; localhost success does not establish hosted behavior.
2. Continue the [section plan](./phenotype-poc.md#section-plan) with genetic
   support for genes (PIGEAN tabs). Start with the legacy phenotype template,
   store, and `src/components/PigeanPhenotype.vue`; verify the active tabs,
   endpoints/keys, and actual record shapes before implementing typed decoders.
   Keep regional evidence plots deferred with a legacy link per the agreed rule.
   The existing association API adapter and headless table logic are available
   for future region/gene pages; do not duplicate their transport/precision logic.
3. Keep the agreed deferral rule: a significant rewrite used on only this
   page stays on the legacy portal and gets a link card. Finish the remaining
   D-05 enforcement and D-31b merge gates before merge, and arrange the hosted
   preview when infrastructure is available. Studio OAuth/publishing
   verification remains deferred by the architect.
   Resolve the intermittent layer-shadow regression described above before
   claiming the CMD gate is stable.

## Guardrails

- `cmd` is the repository portal ID; `md` is its BioIndex registry group
  (D-04/D-04a). Shared packages must not import apps or read portal IDs
  (D-05).
- Portals are static with SPA fallback, not a Node deployment or BFF
  (D-11--D-13). Public API base URLs are build-time settings (D-23); never
  put secrets in public config or content (D-22).
- Pin direct external dependencies exactly; use `workspace:*` for local
  workspace dependencies. Use the `portal` CLI as the build contract (D-06).
- The effector import is repeatable only before CMD goes live. At cutover,
  disable `legacyContentImportEnabled` and stop importing from the CMS
  (D-07b). The pre-cutover command is
  `pnpm portal content:import cmd effector-genes`.
- A BioIndex response with no continuation is not automatically complete:
  restricted data, progress, and requested limits must be considered.
- Respect tool and access decisions. If an operation is denied, do not
  repeat it through a different tool or route; obtain the required
  authorization before dependent work.
