# Status: phenotype page proof of concept (CMD)

Working status for the first production-bound slice: the CMD (`md`) phenotype page, using CAD as the reference example. See the [handoff](./phenotype-poc-handoff.md) to resume across sessions. This document tracks progress only; architecture decisions live in [`../decisions.md`](../decisions.md), which wins on any disagreement.

_Last updated: 2026-11-11_

## Scope

| Item | Choice |
| --- | --- |
| Portal | `cmd` (BioIndex registry name `md`), base build only (D-04, D-27a) |
| Page | `/phenotype?phenotype=<id>[&ancestry=<code>]`: one prerendered shell rendered client-side (the architect chose this over a per-phenotype path; not indexable per phenotype, accepted). The whole visible legacy page is in scope. Legacy `/phenotype.html?…` links redirect through a static stub that preserves the query and hash. |
| Reference example | CAD; other `md` phenotypes (e.g. T2D) must also work |
| Data | Live BioIndex at runtime; recorded fixtures for tests |
| UI | Nuxt UI primitives where practical (D-16) |
| Delivery | Production-bound code in this repo; hosted static preview at `cmd.next.hugeamp.org` (D-38b) |

### Deferral rule

A significant rewrite that only one page uses is deferred; the page reuses the current (legacy) implementation instead. In practice the deferred section renders a short summary card linking to the same section on the legacy page (`hugeamp.org/phenotype.html?phenotype=<id>`, later `old.hugeamp.org`, per D-38b). Components shared by several legacy pages are built, because the work pays off beyond this page.

## Section plan

Reuse is measured across legacy `src/views/*` pages.

| Section | Also used by | Plan | Status |
| --- | --- | --- | --- |
| Search, ancestry selector, title/description | All pages | Build | Done for phenotypes. The selector is phenotype-only for now, because gene and region pages don't exist yet; the legacy search also covers those |
| Manhattan / QQ plot images | Phenotype only, but simple (BioIndex raw PNGs) | Build | Done, with a per-plot "not available" state |
| Bottom-line provenance modal | BottomLine page | Build | Implemented: verified Translator source, typed client, exact trait/ancestry selection, lazy graph, stage table, JSON, and summary-statistics links. Offline render verified; browser verification remains |
| Top single-variant associations (filters, table) | Region, gene pages | Build | Not started |
| Genetic support for genes (PIGEAN tabs) | PIGEAN, Factorization, Gene pages | Build | Not started |
| ↳ "View evidence" regional plot | Inside PIGEAN tables; D-20 scope unresolved | Defer — link to legacy | Agreed |
| Genetic factors (`PigeanFactors`) | Phenotype only | Defer — link to legacy | Agreed |
| CS2CT | Tissue page | Build | Not started |
| Datasets with associations | Phenotype only, simple table | Build | Implemented with phenotype and ancestry filtering; offline render verified |
| Top pathways | Phenotype only, simple table | Build | Not started |
| CFDE gene sets (`GeneSet2Phenotype`) | Phenotype only; data only on dev host | Defer — link to legacy | Agreed |
| Genetic correlations | Phenotype only, simple table | Build | Not started |
| Globally enriched annotations | Phenotype only, simple table | Build | Not started |
| Predicted effector-gene lists | Gene page | Build, from imported content | Connected to the CMD page with exact trait matching; offline render verified |
| Gene-level associations | Hidden in legacy (`v-if="false"`) | Out of scope | — |

Simple single-page tables are built rather than deferred: they don't count as significant rewrites.

## Foundation order (O-01, D-35)

| Step | Status |
| --- | --- |
| 1. Workspace + `portal` CLI (D-06, D-31a) | In progress — `list`, workspace `validate`, `dev`, `typecheck`, `test`, `build`, and application-level `affected` work; `package`, variant selection, and full schema validation remain |
| 2. CMD application shell, `portal.config.ts` (D-21) | In progress. The Nuxt 4/Nuxt UI shell builds statically from the typed CMD config, and the `/phenotype` route exists. The BioIndex base URL is a build-time public setting (`NUXT_PUBLIC_BIOINDEX_URL`, default `https://bioindex.hugeamp.org`, D-23) |
| 3. Data layer: typed BioIndex client in `packages/api-clients` (D-05, D-13) | In progress. Phenotype and dataset metadata, plot URLs, query/match pages, and query continuation/completeness handling work; feature-specific record decoders remain |
| 4. Content pipeline: effector-gene import (narrow, see below) | In progress — the published effector catalog imports into a validated data collection; page collections, Studio, and general sanitization remain |
| 5. Prerender-safety conventions applied to the phenotype route (D-11) | Applied to the first slice. The data-independent shell and heading are prerendered. Query-dependent UI renders inside `<ClientOnly>`, and data fetches use `server: false`. A smoke test checks the shell and the legacy redirect |
| 6. Phenotype feature sections | In progress. `packages/feature-phenotype` holds headless route-state, ancestry-option, phenotype lookup, dataset filtering, effector-list matching, and provenance selection/lineage logic (D-14); the CMD page owns presentation. Search, ancestry, title, and plots are done; datasets, effector lists, and provenance have offline render verification |
| 7. Hosted preview + merge gates (D-31b) | Not started |

Bootstrap CI currently runs workspace validation, CLI tests, and CMD typecheck, static build, and shell smoke test. `validate` now includes an initial D-05 check for declared application dependencies and explicit imports in shared packages and layers. It conservatively rejects Nuxt's `~`, `@`, `#shared`, and `#server` aliases in shared code, including independently configured aliases with those names; use explicit relative or package imports instead.

The platform layer reports possible layer shadows during Nuxt preparation, typecheck, and build: it uses Nuxt's resolved component names and scanned auto-imports, checks common file-based resources, and lists merged configuration files for review. A real layered-app regression covers differently named components, auto-imports, dynamic routes, and layouts. The report is deliberately conservative, not a proof of absence: custom directories outside layer roots and generated resources need manual review, and configuration files are listed rather than compared key by key (D-30).

The dependency check is **not complete enforcement**: Nuxt auto-imports, config string references, Vue external `src` blocks and CSS imports, `import.meta.glob`, computed references, and branching on portal IDs still require review. The D-05 check needs broader enforcement before these foundation changes are merged. Package-level affected selection, feature/package tests, and content-schema validation also remain before the full D-31b merge-gate suite.

The current commands are `pnpm portal list`, `pnpm portal validate`, `pnpm portal test` (CLI and shared-package tests), `pnpm portal typecheck` (shared packages), `pnpm portal dev|typecheck|build|test cmd` (portal scripts), `pnpm portal affected <manifest-directory>`, and `pnpm portal content:import cmd effector-genes`. The affected command compares each application with its own last successful manifest using pnpm's graph; see the [CLI README](../../tooling/portal-cli/README.md) for its input and clean-checkout requirements. Every portal build requires and runs its `validate-content` script. The CMD test checks the static output, so run `build cmd` first. Local builds stamp the current Git commit as their build ID; uncommitted changes are not represented in that ID and are not release artifacts.

## Effector-gene lists: fetch vs import

Legacy behavior: on every page load the browser fetches CMS page `egl_241` from `hugeampkpncms.org` (a 64 KB CSV string, 149 rows, 21 columns), parses all of it, keeps rows whose `Trait ID` contains the phenotype name, and renders fields with `v-html`. CAD matches one row (`cardiogram_165`, Aragam et al. 2022). The "View genes" link goes to a legacy `research.html?pageid=…` page.

| | Runtime fetch | Build-time import (chosen) |
| --- | --- | --- |
| Effort | About half a day | About 1–2 days for a narrow, single-dataset import |
| Register | Conflicts with D-07/D-07b; needs an amendment | Matches D-07b |
| Runtime dependency | CMS must stay up, with CORS, and it is scheduled for retirement — the section breaks at go-live | None; data ships in the build |
| Safety | Unsanitized `v-html` rendering | Plain-text rendering, schema-validated, malicious-content fixture test |
| Payload | 64 KB downloaded to show ~1 row | The collection dump contains all imported rows: currently 9,608 bytes encoded (7,206 bytes compressed, 42,090 bytes decoded SQL); matching happens locally |

The narrow import is a re-runnable CLI step: CSV to a typed Nuxt Content data collection. It imports 112 phenotype-linked rows and skips 37 rows without trait IDs; the built collection contains one CAD list and eight T2D lists. It doesn't need HTML-to-MDC conversion (the data contains no HTML today). The pinned SQLite WASM file is 856,447 bytes uncompressed (393,511 bytes with local gzip); it is shared by collections. The page now queries the effector collection client-side, but actual browser transfer and additional JavaScript costs remain to be measured. The generic page-import pipeline remains later foundation work for other pages.

Each successful pre-go-live import overwrites the previous catalog. A failed import preserves the previous file but must block a release refresh rather than silently ship stale data. Imports require `legacyContentImportEnabled: true` in `portal.config.ts`; set it to `false` at cutover. After CMD goes live, never run this import again: Studio content becomes authoritative (D-07b).

## Open questions and risks

- **D-20 scope**: whether the owned regional evidence plot falls under D-20's locus-plot deferral. Moot while the plot is deferred under the rule above.
- **CFDE production source**: production BioIndex returns no CAD rows for `pigean-gene-set-phenotype`; only the dev host has data. Deferred, so the dev feed isn't needed for the preview.
- **Effector-gene publication state (D-07a)**: the CMS JSON:API reports `status: true` and public mode for `egl_241`. The import checks publication on every run and fails closed if the record is missing, unpublished, or inaccessible; the data endpoint alone does not expose publication state.
- **Effector-gene trait matching**: legacy uses substring matching, so one phenotype ID can match another's lists; 6 rows list several trait IDs. The import splits IDs for exact matching by the page.
- **Effector-gene page integration**: the display component is connected to the phenotype page and typechecked. Offline rendering with mocked Nuxt Content covered its matching, links, loading, empty, error, and missing-catalog states. Live browser behavior has not been checked.
- **Datasets table**: rendered offline against fixtures for CAD, T2D, selected ancestry, empty results, and BioIndex errors. Browser behavior remains unverified.
- **Bottom-line provenance**: the local legacy component uses Translator's artifact-provenance service, not BioIndex. The typed client decoded all 1,529 catalog entries and live CAD/T2D results for `Mixed` and `EU` on 2026-11-11. CAD/Mixed has 88 activities and 121 resources; T2D/Mixed has 315 activities. The modal loads only on opening, and the pinned `vis-network` 10.1.5 standalone renderer imports inside `onMounted` (D-11/D-19). Stage tables and original JSON provide text inspection. Missing ancestry results show an empty state rather than another ancestry's evidence. Visual rendering, keyboard interaction, and largest-graph performance remain unverified in a browser.
- **Provenance service and downloads**: the trait-list response sends `Access-Control-Allow-Origin: *` for a localhost-origin probe. CAD/Mixed and T2D/EU summary-statistics URLs returned HTTP 200 to HEAD requests. Service artifact IDs include `stg`; download paths follow the legacy public `dig-open-bottom-line-analysis` bucket. Hosted-preview CORS remains unverified. Override the service at build time with `NUXT_PUBLIC_PROVENANCE_URL` (D-23).
- **Local preview verification (2026-11-11)**: the architect authorized localhost HTTP and browser checks. The initial forked dev-server probe timed out. A subsequent `pnpm portal dev cmd --host 127.0.0.1 --no-fork`, with a session-only `NUXT_PUBLIC_BIOINDEX_URL=https://bioindex-ext.hugeamp.org`, returned HTTP 200 for `/phenotype?phenotype=CAD`. The cause of the earlier timeout is undiagnosed. The server was stopped. Computer use ended because it could not reliably determine the browser URL to enforce its access policy, so no dataset, effector, or provenance browser checks were completed.
- **Local test signing**: the CLI fixture commits inherit the user's Git signing setting. Plain `pnpm portal test` failed while GPG was signing temporary fixture commits; the full suite passed with command-scoped `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=commit.gpgsign`, and `GIT_CONFIG_VALUE_0=false`. No global/repository Git configuration or existing CLI test edits were changed.
- **Layer-shadow test instability (2026-11-11)**: all six CMD tests passed on the first run, but a later run passed five and failed the existing layer-shadow regression because its report omitted `auto-import useFeature`. An isolated copy with diagnostic hooks passed three consecutive runs and showed both expected scan candidates. The reporter and original regression were not modified; the intermittent failure remains undiagnosed, so the full CMD suite is not established as reliable. This remains a merge-gate concern alongside the broader D-05/D-31b gaps.
- **Effector-gene import lifecycle**: the cutover procedure must set `legacyContentImportEnabled` to `false` before CMS authority ends.
- **Legacy deep links**: resolved without nginx. `public/phenotype.html` is a static `noindex` stub that runs `location.replace('/phenotype' + search + hash)` and has a no-script link.
- **Browser access to BioIndex**: the page calls `bioindex.hugeamp.org` cross-origin. It worked from `localhost` in the VS Code integrated browser on 2026-11-10: phenotypes, datasets, and plots loaded. Scripted clients receive a Cloudflare managed challenge, and that browser may already hold Cloudflare clearance, so preview-host behavior is unverified. The fallback is a build-time switch to `bioindex-ext.hugeamp.org`, which sends `Access-Control-Allow-Origin: *`. Missing plots return JSON 404s that the browser blocks as cross-origin reads (ORB); the image error handler still shows the "not available" message.
- **Ancestry options**: as in legacy, the list holds every ancestry in the portal's datasets, not only those with results for the selected phenotype. Ancestries without plots show the "not available" message.
- **Preview hosting**: `cmd.next.hugeamp.org` did not resolve from this environment on 2026-11-10; nginx and CI deployment access remain unverified.
- **CS2CT robustness**: the legacy page throws a null-name error during CS2CT initialization; the rebuild needs explicit loading, empty and error states.
- **CI portability**: pnpm reports ignored `esbuild` and `vue-demi` install scripts. The Windows typecheck and static build pass without them; the Linux workflow has not yet run.
- **BioIndex result limits**: a query can consume a record without returning it when its total limit is reached. CAD has 598 global-association rows; a live `limit=597` returned 597 while reporting all bytes read. The collector reports this boundary as unknown rather than complete.
- **Studio monorepo arrangement (O-03)**: in isolated Studio 1.7.0 tests, Nuxt Content read a sibling portal's collection through `source.cwd`, but Studio's development content and media endpoints read and wrote the editing app's own `content` and `public` directories, not the sibling portal's. An SSR build also failed to serve the sibling portal's existing media through Studio's image endpoint. Running the test app with the portal directory as its Nuxt root made local content and media writes land in the portal. Production Git publication needs an authorized Studio login; a private synthetic test repository is prepared, and OAuth setup is deferred at the architect's request.
- **Studio authentication configuration**: Studio 1.7.0's login route checks `STUDIO_GITHUB_CLIENT_ID` in the process environment. In the isolated SSR build, setting only `NUXT_STUDIO_AUTH_GITHUB_CLIENT_ID` and `_SECRET` left the login route at 404; the `STUDIO_GITHUB_CLIENT_ID` and `STUDIO_GITHUB_CLIENT_SECRET` variables enabled its GitHub redirect. The default session secret is derived at build time, so a deployment that injects credentials only at runtime must also set a unique private `NUXT_STUDIO_AUTH_SESSION_SECRET`. An intentionally short test value caused the expected session error, confirming that this override is read.

## Log

- 2026-11-11 — Continued from the handoff and implemented the bottom-line provenance modal. Verified the local legacy component's Translator endpoints and decoded the full live catalog plus CAD/T2D `Mixed`/`EU` results. Added reduced recorded fixtures and tests for malformed/mismatched responses, cancellation forwarding, exact ancestry selection, dependency ordering, cycles, and safe resource links. Workspace validation, shared typecheck, CMD typecheck, and static build pass; shared tests pass (19 CLI, 14 API-client, 2 content, 9 phenotype-feature) with command-scoped Git signing disabled for fixture commits. Six CMD tests passed initially, but a repeat exposed an intermittent auto-import report failure in the existing layer-shadow test; see the risk above. Offline Vue rendering passed for graph shell, table, JSON, loading, empty/error, link, and escaped-text states. A non-forked dev server returned HTTP 200 and was stopped; browser verification remains blocked by computer use's URL-policy check. The single-variant association table is the next implementation slice.
- 2026-11-11 — Added a [handoff](./phenotype-poc-handoff.md) with the current worktree, verification, blockers, and next steps for later sessions and agents.
- 2026-11-11 — Connected the effector-list component and added the phenotype-matched datasets table with ancestry filtering. Feature-package tests pass (6); workspace tests (19 CLI, 12 API-client, 2 content, 6 feature), CMD typecheck, workspace validation, static build, and six CMD smoke tests pass. Offline Vue rendering also passed for CAD, T2D, ancestry, empty/error, and effector-list states. A dev server started but no successful HTTP response was recorded; it was stopped, so its responsiveness at the time remains unknown.
- 2026-11-11 — Added and unit-tested exact trait-ID matching for the imported effector catalog, and added a typechecked CMD display component. An isolated render with mocked Nuxt Content checked matching, escaped text, links, loading, empty, error, and missing-catalog states. Workspace validation, shared tests, CMD typecheck, static build, and six CMD smoke tests pass. Connecting the component to the phenotype page was not authorized, so this section remains incomplete and has not been browser-tested. The legacy provenance implementation and live BioIndex index discovery were also unavailable for verification.
- 2026-11-10 — Added the first phenotype slice: the `/phenotype` route with a searchable, virtualized phenotype selector, an ancestry selector, title, and Manhattan/QQ plots, plus the legacy `.html` redirect stub. Logic lives in the new `@dig-portal/feature-phenotype` package (4 tests), and the plot URL builder in `api-clients`. Verified CMD typecheck, the static build, and 6 smoke tests. In a browser against live BioIndex, checked CAD, T2D selection (the URL updates and the ancestry is kept), the EU and GME ancestries (GME has no plots), the unknown-phenotype state, and the legacy redirect.
- 2026-11-10 — Added application-level affected selection using pnpm's graph and one last-successful commit per portal. Focused Git-backed tests cover shared dependents, per-portal baselines, Markdown content, documentation-only and global changes, initial builds, invalid manifests, dirty worktrees, and divergent history. Variant and package-level selection remain.
- 2026-11-10 — Deferred Studio OAuth setup and the production publish test at the architect's request; continue independent foundation work.
- 2026-11-10 — With permission, prepared a private throwaway GitHub repository and content branch containing only synthetic fixtures. A separate Studio SSR build read the sibling content but did not serve its existing media; Git publishing awaits OAuth setup. Verified the pinned Studio version's login-route environment variable behavior without using real credentials.
- 2026-11-10 — Tested Studio locally without touching this repository's content: a sibling content source is readable but local Studio edits land under the editor root; a portal-root test put both content and media writes in the intended tree. Stopped the test servers and removed their scratch files. Production Git writes remain unverified (O-03).
- 2026-11-10 — Confirmed all direct external workspace dependencies use exact pins, then passed `pnpm install --frozen-lockfile`, workspace validation, shared tests and typechecks, and CMD typecheck, static build, and five tests. The new exact `@nuxt/kit` dependency also re-resolved the locked kit version used by Nuxt Content's MDC/component metadata and Nuxt Fonts from 4.6.4 to 4.5.2; the affected direct dependency versions did not change.
- 2026-11-10 — Continued after commit `c5b3673`: added typed dataset metadata for ancestry selection and the datasets section, rejected incomplete portal metadata, added query continuation/completeness handling, and added an explicit pre-go-live import switch. Verified the BioIndex source and live limit boundary: final progress is relative to the resumed reader and a reached cap is not proof of completeness.
- 2026-11-10 — Added a D-30 layer-shadow candidate report using Nuxt's layer ordering, component scan, and auto-import hooks, with a real layered-app regression. CI emits the candidates during the existing typecheck/build; custom and generated resources still need manual review.
- 2026-11-10 — Imported the published, public effector catalog into Nuxt Content and verified that the generated dump contains all 112 entries, including the expected CAD and T2D lists. Added schema validation for editor changes, malicious-content fixtures, and a build-guard test. The base64 dump is 9,608 bytes; actual browser transfer is not yet measured.
- 2026-11-10 — Adversarial review found the content guard was optional and the shared content package lacked architect ownership. Portal builds now require content validation, and the package has a CODEOWNER. Layer-shadow reporting remains an explicit pre-merge gap.
- 2026-11-10 — Corrected the association-client fixture request to the live `global-associations` index's phenotype-only key. A phenotype-plus-ancestry query belongs to the separate `ancestry-global-associations` index.
- 2026-11-10 — Switched Nuxt Content to its default SQLite connector rather than relying on an experimental framework option (D-39); the SQLite driver is an exact dependency pin.
- 2026-11-10 — Confirmed the CMS JSON:API currently reports the `egl_241` research page as published and public. The repeatable import must still verify that state on each run.
- 2026-11-10 — Added the framework-independent BioIndex transport and a phenotype domain type, with fixture-based tests and shared-package CLI test/typecheck dispatch. Verified CAD and T2D metadata and a limited CAD association query against production. A null continuation after a limited query does not imply a complete result; progress and restricted metadata are retained for consumers.
- 2026-11-10 — Added the initial dependency-direction check to `portal validate`, with pinned parser dependencies. Nine CLI tests pass, including the same suite in an isolated pnpm installation with hoisting disabled; static-analysis gaps are listed above.
- 2026-11-10 — Committed the CMD foundation shell as `3beb6d7` on `feature/phenotype-poc`.
- 2026-11-10 — Pinned direct external dependencies to the versions resolved in the lockfile; local workspace dependencies continue to use the `workspace:` protocol.
- 2026-11-10 — Register review identified the missing D-05/D-30 CI checks, now tracked above. Added CMD ownership and support for canonical portal IDs containing underscores.
- 2026-11-10 — Committed the bootstrap as `d76c3af` on `feature/phenotype-poc`; added portal-targeted CLI dispatch and the minimal CMD shell with an explicit workspace platform layer. Verified frozen install, six CLI tests, CMD typecheck, static build and smoke test, plus a responsive local dev-server/browser check. No phenotype data or hosted preview yet.
- 2026-11-10 — Started foundation work: added the initial pnpm workspace, portable `portal` CLI (`list`, `validate`, `test`), bootstrap-only GitHub Actions validation, and architect CODEOWNERS. Full build and affected commands are not implemented yet.
- 2026-11-10 — Verified `pnpm portal validate`, `pnpm portal test` (3 passing), `pnpm portal list`, and `git diff --check`. The list correctly reports no app packages yet.
- 2026-11-10 — Planning checkpoint: reviewed the register and legacy phenotype page; probed live BioIndex for CAD; set scope. Adopted the deferral rule. Measured the effector-gene payload and chose build-time import.
