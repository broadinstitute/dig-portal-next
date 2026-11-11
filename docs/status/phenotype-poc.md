# Status: phenotype page proof of concept (CMD)

Working status for the first production-bound slice: the CMD (`md`) phenotype page, using CAD as the reference example. This document tracks progress only; architecture decisions live in [`../decisions.md`](../decisions.md), which wins on any disagreement.

_Last updated: 2026-11-10_

## Scope

| Item | Choice |
| --- | --- |
| Portal | `cmd` (BioIndex registry name `md`), base build only (D-04, D-27a) |
| Page | `/phenotype` — whole visible legacy page; legacy `/phenotype.html?phenotype=CAD` links must keep working |
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
| Search, ancestry selector, title/description | All pages | Build | Not started |
| Manhattan / QQ plot images | Phenotype only, but simple (BioIndex raw PNGs) | Build | Not started |
| Bottom-line provenance modal | BottomLine page | Build | Not started |
| Top single-variant associations (filters, table) | Region, gene pages | Build | Not started |
| Genetic support for genes (PIGEAN tabs) | PIGEAN, Factorization, Gene pages | Build | Not started |
| ↳ "View evidence" regional plot | Inside PIGEAN tables; D-20 scope unresolved | Defer — link to legacy | Agreed |
| Genetic factors (`PigeanFactors`) | Phenotype only | Defer — link to legacy | Agreed |
| CS2CT | Tissue page | Build | Not started |
| Datasets with associations | Phenotype only, simple table | Build | Not started |
| Top pathways | Phenotype only, simple table | Build | Not started |
| CFDE gene sets (`GeneSet2Phenotype`) | Phenotype only; data only on dev host | Defer — link to legacy | Agreed |
| Genetic correlations | Phenotype only, simple table | Build | Not started |
| Globally enriched annotations | Phenotype only, simple table | Build | Not started |
| Predicted effector-gene lists | Gene page | Build, from imported content | Not started |
| Gene-level associations | Hidden in legacy (`v-if="false"`) | Out of scope | — |

Simple single-page tables are built rather than deferred: they don't count as significant rewrites.

## Foundation order (O-01, D-35)

| Step | Status |
| --- | --- |
| 1. Workspace + `portal` CLI (D-06, D-31a) | In progress — `list`, workspace `validate`, `dev`, `typecheck`, `test`, and `build` work; `package`, `affected`, and full schema validation remain |
| 2. CMD application shell, `portal.config.ts` (D-21) | In progress — minimal Nuxt 4/Nuxt UI shell and typed CMD config build statically; the phenotype route is not yet implemented |
| 3. Data layer: typed BioIndex client in `packages/api-clients` (D-05, D-13) | In progress — phenotype and dataset metadata, query/match pages, and query continuation/completeness handling work; feature-specific record decoders remain |
| 4. Content pipeline: effector-gene import (narrow, see below) | In progress — the published effector catalog imports into a validated data collection; page collections, Studio, and general sanitization remain |
| 5. Prerender-safety conventions applied to the phenotype route (D-11) | Not started |
| 6. Phenotype feature sections | Not started |
| 7. Hosted preview + merge gates (D-31b) | Not started |

Bootstrap CI currently runs workspace validation, CLI tests, and CMD typecheck, static build, and shell smoke test. `validate` now includes an initial D-05 check for declared application dependencies and explicit imports in shared packages and layers. It conservatively rejects Nuxt's `~`, `@`, `#shared`, and `#server` aliases in shared code, including independently configured aliases with those names; use explicit relative or package imports instead.

The platform layer reports possible layer shadows during Nuxt preparation, typecheck, and build: it uses Nuxt's resolved component names and scanned auto-imports, checks common file-based resources, and lists merged configuration files for review. A real layered-app regression covers differently named components, auto-imports, dynamic routes, and layouts. The report is deliberately conservative, not a proof of absence: custom directories outside layer roots and generated resources need manual review, and configuration files are listed rather than compared key by key (D-30).

The dependency check is **not complete enforcement**: Nuxt auto-imports, config string references, Vue external `src` blocks and CSS imports, `import.meta.glob`, computed references, and branching on portal IDs still require review. The D-05 check needs broader enforcement before these foundation changes are merged. Affected-package selection, feature/package tests, and content-schema validation also remain before the full D-31b merge-gate suite.

The current commands are `pnpm portal list`, `pnpm portal validate`, `pnpm portal test` (CLI and shared-package tests), `pnpm portal typecheck` (shared packages), `pnpm portal dev|typecheck|build|test cmd` (portal scripts), and `pnpm portal content:import cmd effector-genes`. Every portal build requires and runs its `validate-content` script. The CMD test checks the static output, so run `build cmd` first. Local builds stamp the current Git commit as their build ID; uncommitted changes are not represented in that ID and are not release artifacts.

## Effector-gene lists: fetch vs import

Legacy behavior: on every page load the browser fetches CMS page `egl_241` from `hugeampkpncms.org` (a 64 KB CSV string, 149 rows, 21 columns), parses all of it, keeps rows whose `Trait ID` contains the phenotype name, and renders fields with `v-html`. CAD matches one row (`cardiogram_165`, Aragam et al. 2022). The "View genes" link goes to a legacy `research.html?pageid=…` page.

| | Runtime fetch | Build-time import (chosen) |
| --- | --- | --- |
| Effort | About half a day | About 1–2 days for a narrow, single-dataset import |
| Register | Conflicts with D-07/D-07b; needs an amendment | Matches D-07b |
| Runtime dependency | CMS must stay up, with CORS, and it is scheduled for retirement — the section breaks at go-live | None; data ships in the build |
| Safety | Unsanitized `v-html` rendering | Plain-text rendering, schema-validated, malicious-content fixture test |
| Payload | 64 KB downloaded to show ~1 row | The collection dump contains all imported rows: currently 9,608 bytes encoded (7,206 bytes compressed, 42,090 bytes decoded SQL); matching happens locally |

The narrow import is a re-runnable CLI step: CSV to a typed Nuxt Content data collection. It imports 112 phenotype-linked rows and skips 37 rows without trait IDs; the built collection contains one CAD list and eight T2D lists. It doesn't need HTML-to-MDC conversion (the data contains no HTML today). The pinned SQLite WASM file is 856,447 bytes uncompressed (393,511 bytes with local gzip); it is shared by collections, but the page has not yet queried one, so actual browser transfer and additional JavaScript costs remain to be measured. The generic page-import pipeline remains later foundation work for other pages.

Each successful pre-go-live import overwrites the previous catalog. A failed import preserves the previous file but must block a release refresh rather than silently ship stale data. Imports require `legacyContentImportEnabled: true` in `portal.config.ts`; set it to `false` at cutover. After CMD goes live, never run this import again: Studio content becomes authoritative (D-07b).

## Open questions and risks

- **D-20 scope**: whether the owned regional evidence plot falls under D-20's locus-plot deferral. Moot while the plot is deferred under the rule above.
- **CFDE production source**: production BioIndex returns no CAD rows for `pigean-gene-set-phenotype`; only the dev host has data. Deferred, so the dev feed isn't needed for the preview.
- **Effector-gene publication state (D-07a)**: the CMS JSON:API reports `status: true` and public mode for `egl_241`. The import checks publication on every run and fails closed if the record is missing, unpublished, or inaccessible; the data endpoint alone does not expose publication state.
- **Effector-gene trait matching**: legacy uses substring matching, so one phenotype ID can match another's lists; 6 rows list several trait IDs. The import splits IDs for exact matching by the future page.
- **Effector-gene import lifecycle**: the cutover procedure must set `legacyContentImportEnabled` to `false` before CMS authority ends.
- **Legacy deep links**: `/phenotype.html?phenotype=CAD` needs a static alias or nginx rule on the preview host.
- **Preview hosting**: `cmd.next.hugeamp.org` did not resolve from this environment on 2026-11-10; nginx and CI deployment access remain unverified.
- **CS2CT robustness**: the legacy page throws a null-name error during CS2CT initialization; the rebuild needs explicit loading, empty and error states.
- **CI portability**: pnpm reports ignored `esbuild` and `vue-demi` install scripts. The Windows typecheck and static build pass without them; the Linux workflow has not yet run.
- **BioIndex result limits**: a query can consume a record without returning it when its total limit is reached. CAD has 598 global-association rows; a live `limit=597` returned 597 while reporting all bytes read. The collector reports this boundary as unknown rather than complete.
- **Studio monorepo arrangement (O-03)**: in an isolated Studio 1.7.0 test, Nuxt Content read a sibling portal's collection through `source.cwd`, but Studio's development content and media endpoints read and wrote the editing app's own `content` and `public` directories, not the sibling portal's. Running the test app with the portal directory as its Nuxt root made local content and media writes land in the portal. Neither experiment verifies production Git publication or proves the separate-app arrangement; that still needs a throwaway repository and an authorized Studio login.

## Log

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
