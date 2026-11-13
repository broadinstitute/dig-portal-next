# Handoff: CMD phenotype proof of concept

Snapshot: 2026-11-13. Verify the branch, worktree, and validation results before
resuming; this is a handoff, not an architecture decision record.

## Read first

- [Repository instructions](../../AGENTS.md)
- [Decision register](../decisions.md) (authoritative) and [architecture](../architecture.md)
- [Phenotype PoC status](./phenotype-poc.md) for the complete section plan, risks,
  foundation gaps, and chronological log

Keep the status document current as work proceeds. Update this handoff at the
end of a working session with the next actionable steps and verified results.

## Current state

- **Resume checkpoint:** global enrichment is committed in `a22cc34`, and the
  deferred CFDE card in `fc932c6`. All planned visible phenotype sections have
  implementations or legacy links. `6ae87c1` extends D-05 validation to external
  Vue block `src` attributes and corrects stale gate notes. CSS checks are in
  `f3fecdb`, static glob checks in `d12fa46`. This checkpoint adds CMD's app-owned
  base portal-definition schema to the existing build/content guard (`badbf69`).
  `790139e` checks selected static dependency strings in shared Nuxt configs.
  `fee609f` adds alias targets, component directories and configured import
  directories/preset sources. `2935028` adds a bounded D-30 check for
  remote Git layer sources in static Nuxt `extends` values across apps/packages/
  layers, without executing configs or fetching layers. This checkpoint adds
  D-31a checks for graph-visible references to discovered workspace layers:
  use package names with declared workspace dependencies. Same-workspace local
  layers remain allowed; see the verification scope below.
  A bounded audit of
  the historical layer-shadow failure followed: eight isolated runs passed,
  with no reporter or test change and no claim that the intermittency is fixed.
  The 2026-11-13 browser check now covers CAD and T2D rendering, CAD/EU
  ancestry filtering, the CAD/Mixed provenance views, T2D support-tab state,
  on-demand gene-set evidence, and a T2D association filter/history roundtrip.
  A mobile-width page overflow was traced to absolute `sr-only` labels inside
  table actions and fixed by positioning their links/buttons; at 390 px the
  document now fits the 375 px layout width while the result tables retain
  internal horizontal scrolling. T2D CS2CT source/tissue/numeric filters,
  genericity sort/order, pagination, reset and preservation of unrelated URL
  state are now verified in the browser. T2D association position sorting in
  both directions and paging, pathway Beta sorting/paging, and correlation
  multi-select/threshold/empty-state/sort/page/internal navigation are also
  verified. The latest T2D global-enrichment check verified p-value/fold
  filtering (15 matches), ascending Fold sort, page 2 and reset to 63
  shortlisted rows, preserving the unrelated association filter and sort.
  Annotation/tissue selection also worked: `enhancer` reduced the shortlist
  from 63 to 41, then tissue `blood` reduced it to 2; reset preserved the
  unrelated association filter and Fold sort. Browser CSV saving remains
  unverified.
  The T2D ancestry selector also updated the route to `ancestry=EU` and filtered
  75 dataset rows to 30 European-only rows. At 390 px, all seven T2D data tables
  scrolled internally without causing document-level overflow. The same
  no-overflow/internal-scroll result held at 320 px (305 px layout width) for
  both T2D and CAD, each with seven internally scrollable tables. At 320 px the
  CAD/Mixed provenance dialog also fit the viewport and its body scrolled
  internally without page-level horizontal overflow. Larger-text and other
  viewport checks remain. The browser has
  been restored to `?phenotype=T2D&assocP=1e-10&enrichSort=fold`. A CAD/Mixed
  provenance check found that Escape did not dismiss the modal; the page now
  explicitly closes on the modal's Escape event. CMD typecheck and all 11 CMD
  tests pass. Browser verification confirmed Escape dismissal and focus return,
  plus 12 forward Tab presses contained and wrapped within the dialog.
  T2D enrichment dropdowns filtered 63 shortlisted rows to 41 for `enhancer`
  and 2 after adding `blood`; reset restored 63 rows and preserved unrelated
  state. The browser remains on the T2D association-filter/Fold-sort route.
  The first five T2D enhancer rows also produced expected Variant Sifter URLs.
  A `__missing__` tissue filter returned 0/739, so there was no live null-name
  row to verify visually; the null-label and invalid-region cases are unit-
  tested.
  Remaining work is broader interaction/download QA, responsive QA for other
  sections, foundation-gap verification, and hosted QA.
  The user now requests a commit after
  every completed task, with validation and handoff updates before moving on.
  The existing port-3000 server's catalog
  returned HTTP 200 / 9,608 bytes on 2026-11-12; preserve that server. Its
  isolated `portalDev` command was verified on 2026-11-11. Client behavior is
  unchanged; `portal.config.ts` uses type-only schema imports. CMD
  now directly owns the already-locked Zod 3.25.76 for validation. The CLI owns the existing exact-pinned Vue SFC
  parser 3.5.45, PostCSS 8.5.32, postcss-value-parser 4.2.0, TypeScript 5.9.3
  and picomatch 4.0.7. Only importer
  references were added to the lockfile, without new transitive versions.
  No decisions changed.
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
- **Mobile overflow fix (2026-11-13):** at 390 px, the root scroll width was
  1,135 px although body/main were 375 px. Absolutely positioned `sr-only`
  labels inside gene-support and CS2CT result-table actions escaped the
  horizontal scrollers. Adding `relative` to the action buttons/links fixed the
  page overflow without removing accessible labels or table scrolling. Browser
  verification after hot reload measured root client/scroll widths of 375/375;
  both tables retained nonzero internal horizontal scroll ranges. CMD typecheck
  and all 11 CMD tests passed. This fix and its status/handoff updates are
  committed together.
- The working branch is `feature/phenotype-poc`; the implementation baseline
  for this task was clean `2935028`. Workspace layer graph checks, their tests
  and this handoff are committed as one task. Check current HEAD/status rather than interpreting
  historical “uncommitted” log entries as the current worktree state.
- The current on-disk files are the baseline. The architect asked to assume
  the changes shown in an older, stale VS Code review are already present;
  do not reconstruct or undo that review without new evidence.
- The worktree was clean at this resume. Check `git status --short --branch`
  again and preserve unrelated or concurrent edits. Genetic-support model settings live in `portal.config.ts` (sigma 2,
  `mouse_msigdb`) per D-21.
- [The CMD phenotype page](../../apps/cmd/app/pages/phenotype.vue) supports
  `/phenotype?phenotype=CAD` and optional `ancestry`, phenotype selection,
  plots, single-variant associations, genetic-support tabs, CS2CT, pathways,
  genetic correlations, globally enriched annotations, a phenotype/ancestry-filtered dataset table, and
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
- [Global enrichment](../../apps/cmd/app/components/PhenotypeGlobalEnrichments.vue)
  uses the typed `globalEnrichments(phenotype)` client with a 2,000-record cap.
  This index accepts only a phenotype key; ancestry is selected locally.
  After ancestry selection, the legacy shortlist rule is retained: all rows
  with p < 1e-5 when at least 20 qualify, otherwise the best 20 p-values (or all
  available when fewer exist). User annotation/tissue/p-value/minimum-fold
  filters apply afterward; counts and CSV explicitly describe this shortlist.
  Five headers sort; defaults are ascending p-value and ten-row pages. Raw
  duplicate rows and p=0 are retained rather than copying legacy grouping and
  truthiness bugs. Fractional/signed SNP and enrichment estimates are valid.
  Fold is SNPs/expectedSNPs, null for zero denominator or overflow; null names
  and fold have explicit display/filter/sort handling. CSV retains all raw
  statistics and source enrichment separately. Tissue links open legacy pages.
  URL keys are `enrichAnnotation`, `enrichTissue`, `enrichP`, `enrichFold`,
  `enrichSort`, `enrichOrder`, `enrichPage`; `__missing__` selects a null name.
  Local edits preserve other section query values/hash without refetching.
- The CFDE section now renders the agreed link card to the selected phenotype
  on the legacy portal. It uses the existing encoded legacy URL helper and
  performs no CFDE/dev-host data request, per the section's deferral rule.
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

Workspace layer graph checkpoint (2026-11-12): static `extends` references into
another discovered workspace now require its package name and a declared
`workspace:` dependency in the consumer's manifest (D-31a). Relative/absolute
paths and file URLs crossing that boundary fail, even if the dependency is
already declared; package-name subpaths are supported. Nested local layer
configs use the containing workspace's manifest. Same-workspace local layers
remain allowed. The baseline path-reference regression passed incorrectly;
four new tests pass, including actual pnpm graph/affected selection through
dependency, dev, optional and peer declarations. A changed layer selects the
consuming portal. Workspace validation and all 121 shared tests pass (47 CLI,
33 API-client, 2 content, 39 phenotype-feature). No dependencies or portal
runtime changed; preceding CMD typecheck/build/11 tests remain the app
verification. This does not infer graph edges through aliases, symlinks,
unregistered targets, executable/cross-file configs, external packages or other
source/config fields. Variant/artifact affected selection remains pending.

Remote Git layer checkpoint (2026-11-12): `portal validate` now inspects static
`extends` sources in app/package/layer Nuxt configs, including nested local
layers without manifests. It reuses constant/spread/tuple/environment/CommonJS
inspection and rejects explicit Git-provider and transport syntax, known public
Git-host HTTP URLs and HTTP `.git` path segments. Config is never executed;
layers are never fetched by this check. Errors omit URLs/options and malformed
config syntax fails validation. Local paths, local Git repository paths, package
references and generic HTTP archives are not rejected by this Git-specific rule.
Generated/dependency directories and symlinks are skipped. The original app
regression passed validation incorrectly; five new focused tests now pass.
Workspace validation and all 117 shared tests pass (43 CLI, 33 API-client,
2 content, 39 phenotype-feature). No dependencies or app runtime changed;
previous CMD typecheck/build/11 tests remain the app verification. Loader syntax
was checked against installed c12 3.3.4 and Giget 3.3.1. Custom providers/resolvers/
options, unrecognized private-host URLs without `.git`, remote manifest
indirection and computed/cross-file or dependency-tree config remain manual
review gaps. Current CI runs install/prepare **before** validation: this is a
workspace policy gate, not a pre-install network safeguard. Browser QA remains
pending because the browser host was unavailable at this session's last check.

Nuxt scan/alias checkpoint (2026-11-12): shared configs now check alias values,
component directory strings/arrays/options and explicit import/preset module
sources (`from`, `typeFrom`, nested presets and tuple source overrides).
Same-file constants, spreads and environment blocks reuse the static inspector.
Literal `imports.scan: false` skips its directories; names, prefixes, alias keys
and arbitrary module/runtime option text are not dependency paths. The baseline
regressions missed every bad reference; new focused tests pass. Config shapes
were verified against installed Nuxt 4.5.2 and Unimport 6.5.0 types/source.
Workspace validation and 112 shared tests pass (38 CLI, 33 API-client, 2 content,
39 phenotype-feature); the three focused cases passed again with type-source
coverage. No dependencies or app runtime changed. Previous CMD typecheck/build/
11 tests still apply. Broad scan pattern/alias resolution, implicit and generated
auto-imports, executable and cross-file config data and other config fields
remain review gaps. Browser inventory again reported an unavailable host; no
native-browser retry or server change was made.

Nuxt-config checkpoint (2026-11-12): the D-05 check now reads selected static
`extends`, `modules`, `plugins` and `css` fields in shared `nuxt.config` files.
It handles literals/`defineNuxtConfig`/CommonJS, same-file const bindings,
arrays/tuples/spreads, plugin `src` objects, `$env`, standard environment and
override blocks without executing source. Final static object-property values
are used, so overwritten config and arbitrary module option/data text are not
reported as imports. Baseline tests missed all bad config references; the four
new cases pass. Real workspace validation and all 109 shared tests pass (35 CLI,
33 API-client, 2 content, 39 phenotype-feature). Focused config cases passed
again after checking the pinned Nuxt 4.5.2 schema and adding layer-option tuples.
No dependencies or portal runtime code changed. The previous CMD schema static
build, typechecks and 11 CMD tests remain the latest app checks. This is partial
config inspection: aliases/components/import directories were pending here and
are covered by the newer checkpoint above; other fields,
cross-file data, computed/function-produced config and Nuxt's complete path/
merge behavior still need review. No architecture decision changed.

CMD base-definition checkpoint (2026-11-12): `apps/cmd/portal.schema.ts` is
owned by CMD and its inferred `PortalDefinition` is type-only imported and
re-exported by `portal.config.ts` (D-21). `validate-content` checks this schema
and base ID/directory agreement before checking the catalog; the existing CLI
build preflight therefore stops invalid definitions before artifact generation.
The schema covers current identity/registry/title/import flag, unique features,
finite positive sigma, one collection identifier and safe navigation shapes;
unknown fields fail validation. It is not a shared portal contract. CMD variants
must validate their selected artifact IDs under D-27a when implemented; do not
apply the base directory-identity rule unchanged to variant-selected configs.
Frozen offline install, workspace validation, shared/CMD typechecks, static
build, all 11 CMD tests and diff checks pass. The four new schema/build-guard
tests passed again after the guard used its validated result. The last 105
shared-test run remains unchanged from the glob checkpoint; it was not repeated
for this app-only change. The existing localhost catalog returned HTTP 200 /
9,608 bytes after preparation/typecheck/build; no server was started or stopped.
General content collections and future portal/variant schemas remain work.

Glob checkpoint (2026-11-12): baseline regressions detected none of the direct,
broad or inline-Vue application glob imports. The new AST/matcher check covers
literal strings/arrays (including safe TS wrappers and JS escapes), relative
patterns and relative `base`, negative patterns, braces, case sensitivity and
exhaustive matching. Literal base directories are escaped independently of the
glob syntax. Only existing application file metadata is inspected; source is
not executed and patterns are never expanded elsewhere on the computer.
Application enumeration skips dependency/Git directories and symlinks; generated
shared sources are skipped. Nonliteral inputs/options, root-relative/configured
alias patterns and malformed source produce explicit diagnostics. Supported
scripts are JS/TS/JSX/TSX and Vue scripts/setup. Other languages, macro/computed
references outside `import.meta.glob`, app dependency-tree references, custom
alias resolution, symlinks and remaining D-05 gaps still need review. Direct
TypeScript/picomatch pins reuse existing lock versions. Frozen offline install
and real workspace validation pass, as do all 105 shared tests (31 CLI,
33 API-client, 2 content, 39 phenotype-feature) and diff checks. The five focused
glob tests passed again after adding non-execution, hidden-file and TSX cases.
Portal runtime code has not changed and earlier app verification still applies.

CSS-import checkpoint (2026-11-12): baseline regressions missed all standalone
and inline CSS application references. The parser-backed check now detects
relative/absolute paths, file URLs, application packages, aliases and escaped
targets across quoted imports and URL functions, including import modifiers.
Comments and declaration strings do not become dependencies. Shared/remote
imports pass; generated directories are skipped. Malformed CSS fails validation.
The two new direct tooling dependencies reuse locked versions. Frozen offline
install, real workspace validation, diff checks and all 100 shared tests pass
(26 CLI, 33 API-client, 2 content, 39 phenotype-feature).
Runtime code is unchanged, so the earlier CFDE app build/typecheck/seven CMD
tests remain the latest app verification. Sass/Less/other style languages and
non-`@import` directives remain explicit review gaps. No server was changed.

Layer-shadow audit (2026-11-12): eight consecutive isolated runs of the unchanged
`apps/cmd/test/layer-shadowing.test.mjs` passed. No concurrent suite reproduction
was attempted in this bounded audit, and the historical cause is still unknown.
The installed Nuxt 4.5.2 source regenerates imports on `modules:done` and after
non-import templates, calls `imports:extend` with scanned entries, and then
updates import templates. The reporter snapshots that hook before reporting
at `app:templatesGenerated`; this inspection alone does not establish a race.
On recurrence, retain complete child stdout/stderr, hook invocation order and
`useFeature` scan entries plus resolved layer roots. The ignored diagnostic aid
`apps/cmd/.data/diagnose-layer.mjs` logs scan entries, but timing instrumentation
can affect reproduction. Do not relax the assertion or mark D-30 stable merely
from these green runs. No runtime/dependency changes were made in this audit.

D-05 checkpoint (2026-11-12): the new external-Vue regression failed against
the previous checker (zero of six application references detected), then passed
after SFC block parsing. Tests cover relative/absolute application paths,
application packages and aliases across template/script/style/custom blocks,
allowed shared sources, comments, generated directories and malformed SFCs.
Frozen offline install, real workspace validation, diff checks and all 96 shared
tests pass (22 CLI, 33 API-client, 2 content, 39 phenotype-feature).
The tooling-only change does not alter portal runtime code; the latest CMD
typecheck/static build/seven tests passed for the preceding CFDE checkpoint.
Audit correction: shared-package tests/typechecks and the current catalog's
content guard already run in bootstrap CI. Remaining work is broader D-05
coverage, portal-definition/general content schemas, affected/variant matrices,
the intermittent layer-shadow failure, and browser/hosted/Linux verification.

CFDE link-card checkpoint (2026-11-12): CMD typecheck, static build, all seven
CMD tests and diff checks passed. This small route-only change adds no requests,
dependencies or new domain logic; shared tests were not repeated. The card and
handoff are committed together before the next foundation task.

Global-enrichment checkpoint (2026-11-12): typed live CAD returned 1,296 rows
and T2D 1,512, both complete/unrestricted at limit 2,000. At limit 1,000 both
were partial. CAD shortlist is 159 overall and 54 EU (216 EU rows); T2D is
63 overall and the best 20 EU (216 EU rows). Neither had GME rows. Discovery
and HTTP 400 probes confirm ancestry is not an index key. Sources are in
[enrichment-sources.md](../../packages/api-clients/test/fixtures/enrichment-sources.md).
The full data includes signed SNP/enrichment estimates; CAD row 415 is a
recorded regression against an incorrect nonnegative assumption. Validation,
shared/CMD typechecks, 93 shared tests (19 CLI, 33 API-client, 2 content,
39 phenotype-feature), final static build, seven CMD tests and diff checks
passed. Shared tests use the command-scoped signing override below. The
historical layer-shadow intermittency remains unresolved despite this green run.
The ignored `.data/verify-enrichment.mjs` passed shortlist modes, local ancestry,
labels/links, URL controls/sorting, zero p-values, null names/fold, coverage/
loading/error/empty/invalid states, pagination, a full 23-row CSV handler from
a three-row page and escaped text. Browser QA remains pending.

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

Browser QA on 2026-11-13 used the existing user-owned
`http://127.0.0.1:3000` server; it was not restarted or stopped. The CAD page
rendered plots, association rows, genetic support, CS2CT, datasets, pathways,
correlations, global enrichment, and an effector list. Selecting European
ancestry changed the URL to `ancestry=EU`, showed European datasets, and loaded
337 association records (10 visible on the first page). T2D rendered with its
plots, 75 dataset rows, and eight effector lists. The CAD/Mixed provenance
modal loaded 88 stages and 121 resources; Graph, the 88-stage Table, and the
136,705-character JSON view rendered. A desktop screenshot showed the heading,
selectors, and plots.

All four T2D genetic-support tabs selected and updated `supportTab` in the URL;
the HuGE, comparison, and direct/indirect values were `huge`, `comparison`, and
`direct-indirect`, and returning to Combined support removed the parameter.
Opening TCF7L2 gene-set evidence loaded 114 records. Setting the T2D association
maximum p-value to `1e-10` updated `assocP` and displayed 778 matches among
1,000 returned records. Browser Back returned to the previous CAD/EU route and
Forward restored the filtered T2D URL.

This is rendering and a small set of interaction checks, not complete browser
QA. Keyboard/focus behavior, modal lifecycle, support-tab controls, filters,
sorting/paging, real CSV downloads, empty/error states, responsive layouts,
browser transfer size, and T2D/Mixed graph performance (315 activities) remain
unverified. Playwright download listeners timed out after clicks on both the
association and genetic-support CSV buttons. A DOM click probe confirmed the
association handler clicked a temporary download anchor for a Blob URL named
`T2D-all-associations.csv`; no application-level error was shown. The CSV
helper is unit-tested, but actual file saving remains unverified. Check a
normal browser's download list before changing the handler. Hosted-preview
CORS, Cloudflare behavior, and deployment are also still open.

On `e4f8c97`, workspace validation, shared-package typechecks, CMD typecheck,
static build, and all 11 CMD tests passed on 2026-11-13. The full shared test
suite was not rerun in that check because CLI fixture commits inherit the
user's Git signing setting; do not disable signing to work around that. The
static build is not a release artifact.

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
1. Review the worktree without discarding changes. Continue browser QA using
   the existing server if it is still running; do not restart or stop a
   user-owned server. CAD/T2D rendering, CAD-to-EU URL/data selection, and
   CAD/Mixed graph/table/JSON rendering, all four support tabs, TCF7L2
   gene-set evidence, and an association p-value filter/history roundtrip
   have been checked. The provenance modal's Escape dismissal, focus return,
   and forward-Tab containment/wrap are now verified. CSV handler anchor
   creation was observed, but actual downloads were not confirmed. Still
   exercise nested modal-control keyboard behavior, graph mount/unmount,
   remaining partial-result warnings, SVG performance, CS2CT null-name display
   on a live row if available, pathway/correlation Back/Forward, browser CSV
   downloads (the integrated browser did not report download events), and
   other empty/error states. Responsive checks at larger text and additional
   viewport sizes remain. Verify CORS and Cloudflare on the hosted preview
   separately; localhost success does not establish hosted behavior.
2. Continue the remaining foundation gaps against actual tooling/CI, then take a
   bounded enforcement or gate task at a time. The [section plan](./phenotype-poc.md#section-plan)
   now has implementations or link cards for every planned visible section.
   Keep regional plots, factors and CFDE deferred. Do not duplicate completed
   data sections or copy the old CS2CT ancestry-first query order.
   External Vue blocks, static CSS imports and supported literal glob macros are
   now checked, as are selected static Nuxt config fields. Static remote Git
   `extends` sources also have a bounded D-30 check; custom providers and dynamic
   config still require review, and validation runs after install/prepare in CI.
   Static cross-workspace layer references have D-31a package-name/dependency
   checks for discovered workspaces; other cross-workspace imports and config
   fields still need dependency-graph review. Variant/artifact selection remains.
   Next bounded tasks
   can address remaining config fields or portal-ID
   branching. CMD's base definition is validated; future portal/variant and
   general content schemas remain. Keep residual auto-import
   and portal-ID branching limitations explicit. Shared tests/typechecks and
   catalog content validation are already implemented in CI.
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
