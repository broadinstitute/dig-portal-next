# Handoff: CMD phenotype proof of concept

Snapshot: 2026-11-12. Verify the branch, worktree, and validation results before
resuming; this is a handoff, not an architecture decision record.

## Read first

- [Repository instructions](../../AGENTS.md)
- [Decision register](../decisions.md) (authoritative) and [architecture](../architecture.md)
- [Phenotype PoC status](./phenotype-poc.md) for the complete section plan, risks,
  foundation gaps, and chronological log

Keep the status document current as work proceeds. Update this handoff at the
end of a working session with the next actionable steps and verified results.

## Current state

- **Resume checkpoint:** this slice started from clean commit `d6310e3`,
  which includes pathways and all earlier features. Genetic correlations is
  now implemented in the uncommitted worktree; globally enriched annotations
  is the next section. The existing port-3000 server's catalog
  returned HTTP 200 / 9,608 bytes on 2026-11-12; preserve that server. Its
  isolated `portalDev` command was verified on 2026-11-11. No new dependencies
  or architecture decisions were introduced.
- **Latest fix:** the user reported an effector catalog load failure after
  validation ran alongside their dev server. Its dump endpoint returned empty
  HTTP 204 because prepare/typecheck rewrote `.nuxt/content` with a prepare-only
  manifest and empty dumps. The catalog source and component were intact.
  CMD's `dev` script now selects `portalDev`, configured in `nuxt.config.ts` to
  use the ignored sibling `.nuxt-dev` directory. Prepare/typecheck retain
  `.nuxt`, and production generation retains its normal output. A pre-fix
  server needs one restart through `pnpm portal dev cmd --host 127.0.0.1 --no-fork`
  to pick up the script; reload the page afterward to clear failed browser
  Content initialization. Keep using the CLI so this environment is selected.
- The working branch is `feature/phenotype-poc`; HEAD at resume is `d6310e3`.
  Pathways and all earlier slices are committed. Genetic correlations, its
  tests/fixtures and these status updates are uncommitted.
- The current on-disk files are the baseline. The architect asked to assume
  the changes shown in an older, stale VS Code review are already present;
  do not reconstruct or undo that review without new evidence.
- The worktree was clean at this resume. Check `git status --short --branch`
  again and preserve unrelated or concurrent edits. The current slice adds no
  dependencies or lockfile changes. Genetic-support model settings live in `portal.config.ts` (sigma 2,
  `mouse_msigdb`) per D-21.
- [The CMD phenotype page](../../apps/cmd/app/pages/phenotype.vue) supports
  `/phenotype?phenotype=CAD` and optional `ancestry`, phenotype selection,
  plots, single-variant associations, genetic-support tabs, CS2CT, pathways,
  genetic correlations, a phenotype/ancestry-filtered dataset table, and
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
- [Genetic correlations](../../apps/cmd/app/components/PhenotypeGeneticCorrelations.vue)
  uses typed `geneticCorrelations` queries with verified `phenotype[,ancestry]`
  keys and a 1,000-record cap. Existing page phenotype metadata is passed as a
  prop, not fetched again. The legacy table's exact portal-membership filter
  is retained, and excluded counts are shown separately from completeness.
  Controls select multiple correlated phenotypes, maximum p-value and minimum
  rg; four headers sort, with ascending p-value and ten-row pages as defaults.
  The [table](../../apps/cmd/app/components/GeneticCorrelationsTable.vue) uses
  friendly labels, unrounded CSV values, and internal phenotype links retaining
  the selected ancestry while clearing section state. Name sorting uses the
  displayed label. The URL keys are `corrPhenotype` (repeated values), `corrP`,
  `corrMin`, `corrSort`, `corrOrder`, `corrPage`; local edits preserve all other
  section query values/hash and do not refetch. Numeric filters reject invalid
  input and nonzero underflow. Estimated rg is signed and can exceed [-1, 1];
  do not clamp or exponentiate it. Export includes all eligible filtered/sorted
  rows, not just the current page. The legacy session/disease workflow is not
  added to this phenotype-only shell.
- [Top pathways](../../apps/cmd/app/components/PhenotypePathways.vue) uses typed
  `pathwayAssociations` queries with verified `phenotype[,ancestry]` keys and
  the legacy 100-record cap. The [presentation table](../../apps/cmd/app/components/PathwayAssociationsTable.vue)
  shows pathway identifier, p-value, beta and standard error. All four headers
  sort with `aria-sort`; defaults are ascending p-value and ten-row pages.
  CSV includes every returned/sorted row, not just the visible page, with raw
  precision and both distinct error fields (`stdErr`, optional `betaStdErr`)
  plus optional `numGenes`. Never exponentiate pathway beta for binary traits,
  or substitute `betaStdErr` for `stdErr`. Missing optional values remain null.
  URL keys are `pathwaySort`, `pathwayOrder`, `pathwayPage`; local changes
  preserve other sections/hash and reset paging on sorting, without refetching.
  Parent trait/ancestry changes reset state. Loading, retry/error, empty and
  partial/restricted coverage states are explicit; local sorting/export does
  not imply that the capped feed is exhaustive.
- [CS2CT](../../apps/cmd/app/components/PhenotypeCs2ct.vue) offers annotation
  selection, multiple source/tissue filters, minimum variant count, maximum
  genericity, sorting, ten-row pages and CSV of all filtered/sorted rows.
  [The table](../../apps/cmd/app/components/Cs2ctResultsTable.vue) retains the
  raw identifiers for links/export, formats labels without mutating records,
  and renders null tissue/biosample names as “Not recorded.” The exact source
  `bottom-line_analysis_rare` is excluded, matching the legacy rule; counts and
  exports explicitly describe the remaining returned records.
  Query keys are `csAnnotation`, `csSource`, `csTissue`, `csVariants`,
  `csGenericity`, `csSort`, `csOrder`, `csPage`. Source/tissue use repeated query
  values; missing tissue uses `__missing__`. Changes preserve other sections'
  parameters/hash and reset the page. Parent trait/ancestry changes reset state.
  Annotation changes clear source/tissue selections. Tissue/variant/Sifter links
  open the legacy portal; Sifter uses the overlap SNP ±200 kb, clipped at 1.
- CS2CT clients use verified keys `phenotype[,ancestry]` for `c2ct`, and
  `phenotype[,ancestry],annotation` for `c2ct-annotation`. The legacy phenotype
  store reverses trait/ancestry, yielding zero rows for `EU,CAD,…`; the new
  client correctly sends `CAD,EU,…`. Annotation discovery uses
  `/api/bio/keys/c2ct-annotation/2?columns=annotation` and its `keys` tuple
  envelope (no `data`/`count`). The five verified annotations are
  `accessible_chromatin`, `binding_sites`, `enhancer`, `promoter`,
  `uniform_accessible_chromatin_sites`. Do not impose a nonnegative bound on
  Q: valid live combined scores are negative. Probability, count, interval,
  finite-number and per-page trait/ancestry/annotation guards remain enforced.
  The default cap is 1,000 returned records; partial/unknown coverage and
  restricted records are shown, independently of local filters/source exclusion.
- Typed association decoding rejects malformed statistics and wrong-trait or
  wrong-ancestry records, including continuation pages. The UI warns when
  completeness is partial/unknown. Counts and CSV never imply exhaustive data
  beyond returned records. Binary traits display odds ratios; CSV keeps raw beta.
- [Genetic support](../../apps/cmd/app/components/PhenotypeGeneticSupport.vue)
  has four active legacy tabs: combined support, HuGE scores, combined support
  versus HuGE, and direct versus indirect. They include native Vue/SVG plots,
  tables, URL-backed filters/sorting/paging, full filtered CSV, and independent
  loading/error/completeness states for PIGEAN, HuGE and FALCON. Query parameters
  are `supportTab`, `supportGene`, `supportMin`, `supportSort`, `supportOrder`,
  and `supportPage`; association parameters and the hash are preserved.
- [Gene-set evidence](../../apps/cmd/app/components/PigeanGeneSetEvidence.vue)
  loads on demand through `pigean-joined-gene` and has its own loading, error,
  empty, coverage and pagination states. Regional evidence and genetic factors
  remain deferred with rendered legacy links. All three gene-level sources
  lack ancestry keys; the UI explicitly states that ancestry selection does not
  filter this section.
- The typed clients validate phenotype, model and gene identity on every page.
  Production currently serves FALCON, so the caller's configured BioIndex host
  serves all sources; there is no hidden dev-host override. PIGEAN `huge_score`
  is not used as a substitute for `huge-phenotype.huge` (recorded LDLR: 2.5 vs
  6960). Only plot HuGE values use the natural logarithm. Joins match exact
  phenotype/gene IDs, keep missing values null and preserve zero probabilities.
  The HuGE tab retains all loci, including duplicate gene IDs; comparisons
  explicitly select the highest returned HuGE score per gene.
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
  provenance lineage, genetic-support joins/plots/CSV, CS2CT controls/CSV and
  pathway sorting/paging/CSV and genetic-correlation controls/CSV. The imported Nuxt Content catalog contains one CAD list and eight
  T2D lists; do not use substring matching for trait IDs.

## Verification at this snapshot

Genetic-correlation checkpoint (2026-11-12): typed live clients decoded CAD
651/complete, CAD/EU 603/complete, T2D 715/complete and CAD/GME 0/complete,
all unrestricted. Exact membership in the 936-phenotype CMD metadata leaves
398, 364, 456 and zero eligible rows respectively. The recorded sources and
estimated rg ranges are in [correlation-sources.md](../../packages/api-clients/test/fixtures/correlation-sources.md).
Validation, shared/CMD typechecks, static build, 85 shared tests (19 CLI,
30 API-client, 2 content, 34 phenotype-feature) and all seven CMD tests passed.
`git diff --check` passed. CLI fixture tests used the same command-scoped
signing override described below. The unchanged layer-shadow test passed;
its historical intermittent failure remains undiagnosed.
The ignored `.data/verify-correlations.mjs` offline check passed labels,
encoded internal links retaining ancestry, signed rg outside [-1, 1], multi-
select/numeric/sort/page URL events preserving other sections/hash without a
metadata refetch, explicit metadata exclusions, coverage/loading/error/empty/
invalid-filter states, clamped pagination, a full 23-row CSV handler from a
three-row page and escaped service text. Browser behavior remains unverified.

Pathway checkpoint (2026-11-12): live typed queries returned CAD 100/partial,
CAD/EU 100/partial, T2D 100/partial and CAD/GME 0/complete, all unrestricted.
Index discovery verified both key layouts. The recorded fixture sources are
documented in [pathway-sources.md](../../packages/api-clients/test/fixtures/pathway-sources.md).
Validation, shared/CMD typechecks, static build and all seven CMD tests passed,
as did 77 shared tests (19 CLI, 27 API, 2 content, 29 phenotype-feature).
`git diff --check` also passed. The unchanged layer-shadow regression passed;
its historical intermittent failure remains unresolved. Shared tests used the
same command-scoped signing override described below.
The ignored `.data/verify-pathways.mjs` offline check passed table rendering,
beta/stdErr display, ancestry keys, sort/page URL events preserving other
sections/hash without refetching, loading/error/empty states, coverage warnings,
clamped pagination, a full 23-row CSV handler from a three-row page, signed/zero
statistics and escaped text. It is not browser validation.

Earlier verification: the following passed with the phenotype changes in the worktree on
2026-11-11: `pnpm portal validate`, shared `pnpm portal typecheck`, `pnpm portal test`,
`pnpm portal typecheck cmd`, `pnpm portal build cmd`, and
`pnpm portal test cmd`. Before CS2CT, the shared tests included 19 CLI,
20 API-client, 2 content, and 21 phenotype-feature tests (62 total), and the
catalog fix brought CMD to seven tests. The CS2CT checkpoint passed validation,
shared/CMD typechecks and 71 shared tests (19 CLI, 24 API-client, 2 content,
26 phenotype-feature). After live data exposed signed Q values, the decoder
was corrected and all 24 API tests passed again. The final static build and
all seven CMD tests also passed. `git diff --check` passed. The
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
all six CMD tests; the genetic-support run also passed six. No reporter/test
fix was made and the earlier cause is unresolved. This session's seven CMD tests
passed, including the unchanged layer-shadow regression; this does not resolve
its earlier intermittent failure.

Earlier offline Vue rendering covered datasets and effector-list integration.
Previous offline rendering covered the provenance graph shell, stage
table, JSON, loading, empty/error, exact-selection, link, and escaped-text
states. The ignored `.data/verify-provenance.mjs` script can reproduce that
offline check in this worktree; it is not a substitute for browser tests.
The typed client also decoded all 1,529 live traits and CAD/T2D `Mixed`/`EU`
graphs. CAD/Mixed and T2D/EU summary-statistics HEAD requests returned 200,
and the trait-list service sent `Access-Control-Allow-Origin: *` for localhost.

The `.data/verify-associations.mjs` offline check passed table/summary
rendering, URL update events (without refetching), pagination, binary/quantitative
effects, missing/partial/loading/empty/error states, encoded links, escaped text,
and the actual CSV event handler against a simulated document. A 27-record export
from a seven-row page included all 27 records. This is not real-browser validation.
Live typed-client queries returned CAD 598/complete, CAD/EU 337/complete, T2D
1,000/partial, BMI 3/partial (limit 3), and CAD/GME 0/complete. The recorded
[association samples](../../packages/api-clients/test/fixtures/association-sources.md)
include every CAD meta-analysis combination; `bottom-line;largest` is present
and is omitted by the legacy summary, so the replacement counts all combinations.

The `.data/verify-gene-support.mjs` offline rendering passed all four
plots/tables, URL events without refetching, independent source failures,
coverage warnings, invalid filters, pagination, the actual 23-row CSV event
from a three-row page against a simulated document, gene-set details, empty/
loading/error states, and escaped service text. It does not establish browser
keyboard behavior, tab mount/unmount, downloads, responsiveness or full-cap SVG
performance. Recorded sources are documented in
[`gene-support-sources.md`](../../packages/api-clients/test/fixtures/gene-support-sources.md).
Live typed clients decoded CAD and T2D at the configured caps: each had 1,000
PIGEAN/partial, 1,000 HuGE/partial and 2,000 FALCON/partial. CAD/LDLR gene-set
evidence returned 100/complete.

The new `.data/verify-cs2ct.mjs` offline check passed table/links, rare-source
exclusion, multi-select URL events preserving other sections/hash, annotation
selection, metadata/data loading/error/empty states, unknown annotations, null
names, completeness/restricted warnings, invalid filters, pagination, escaped
service text and an actual 23-row CSV handler from a three-row page against a
simulated document. These ignored `.data` scripts are local aids, not committed
tests or browser validation. Committed API/headless tests cover these contracts.
Live typed queries returned CAD/accessibility 1,000/partial (713 eligible),
CAD/EU/accessibility 1,000/partial (995 eligible), T2D/enhancer 1,000/partial
(739 eligible), and CAD/GME/accessibility 0/complete, all with zero restricted
records. See [recorded sources](../../packages/api-clients/test/fixtures/cs2ct-sources.md).
Source references are legacy `src/components/C2ctTable.vue`,
`src/views/Phenotype/{Template.vue,store.js,main.js}` and Tissue template in
the local legacy checkout. The initial Q positivity assumption failed on CAD
record 243; its unchanged negative-score record is now a regression fixture.

The dataset, effector, provenance, association, genetic-support, CS2CT, pathway
and genetic-correlation sections have **not** been verified in
a real browser. The architect explicitly authorized localhost HTTP and
browser checks during this session; that authorization persists. An initial
forked-server probe timed out; after a restart using `--no-fork`, the
phenotype route returned HTTP 200. The underlying timeout cause is unknown.
The temporary server was stopped. Computer use ended because it could not
reliably determine the browser URL to enforce its access policy; browser
checks must wait for a working authorized browser surface.
The latest inventory (2026-11-12) returned no browsers and `The browser
access host is unavailable`. No native-browser retry or preview server was
started by the agent this session. Preserve the user's isolated port-3000 server.

The current static build includes uncommitted work and is not a release
artifact. The renderer is dynamically imported, but the build warns about a
client chunk exceeding 500 kB. Browser transfer and graph performance remain
unmeasured, particularly for T2D/Mixed (315 activities).

## Resume in this order

0. Keep using the CLI dev command so the server selects `portalDev`:
   `pnpm portal dev cmd --host 127.0.0.1 --no-fork`.
   The user's current server already uses this environment; do not restart it
   merely because the earlier catalog-fix log says a restart was needed.
   The isolation regression passed for real prepare and typecheck with an
   ambient development NODE_ENV. Its old-directory counterfactual failed on
   `prepare overwrote live manifest.ts`. A temporary port-3002 dev server
   returned an unchanged HTTP 200 catalog dump through actual CMD typecheck;
   SQLite decoding verified 112 entries, CAD 1 and T2D 8. Do not reimport the
   CMS catalog to address this generated-file issue. Browser recovery still
   needs verification on a working browser surface.
   Workspace validation, CMD typecheck, static build and all seven CMD tests
   passed for this fix. The temporary port-3002 server was stopped; the
   user-owned port-3000 process was left running. Its watched configuration
   reload restored HTTP 200 catalog data (112 entries, CAD 1, T2D 8). It
   has since been restarted into the isolated environment, verified this session.
1. Review the worktree without discarding changes. When browser access is
   working, use the existing server or start the CLI command above and check
   datasets, effector lists, provenance, associations, genetic support, CS2CT,
   pathways and genetic correlations for CAD, T2D, ancestry, empty,
   and error states. Also check modal focus/closing, graph/table/JSON switching,
   keyboard navigation, graph mount/unmount, association URL back/forward,
   filtering/sorting/paging, all four support tabs and gene-set details, partial-result
   warnings, SVG performance, CS2CT annotation/multi-select controls, missing-name
   rows, negative scores, Sifter links, pathway/correlation sorting/back-forward,
   correlation multi-select/thresholds/internal links and real CSV downloads. The successful local HTTP
   check used a session-only `NUXT_PUBLIC_BIOINDEX_URL=https://bioindex-ext.hugeamp.org`.
   Stop temporary servers started by the agent afterward; leave user-owned servers
   running. Verify CORS and Cloudflare on the hosted preview
   separately; localhost success does not establish hosted behavior.
2. Continue the [section plan](./phenotype-poc.md#section-plan) with **globally
   enriched annotations**, then
   the deferred CFDE link card. Inspect the legacy template/store/components
   and verify live index discovery, key ordering, score meanings and sample
   records before adding decoders. CS2CT, pathways and genetic correlations
   are implemented; do not repeat them or
   copy the old ancestry-first key ordering. Reuse the typed clients and
   headless logic already available; keep regional plots/factors deferred.
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
