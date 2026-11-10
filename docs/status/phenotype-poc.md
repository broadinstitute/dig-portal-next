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
| 1. Workspace + `portal` CLI (D-06, D-31a) | In progress — initial pnpm workspace, `list`/`validate`/`test` CLI, bootstrap CI and CODEOWNERS added; `dev`/`typecheck`/`build`/`package`/`affected` remain |
| 2. CMD application shell, `portal.config.ts` (D-21) | Not started |
| 3. Data layer: typed BioIndex client in `packages/api-clients` (D-05, D-13) | Not started |
| 4. Content pipeline: effector-gene import (narrow, see below) | Not started |
| 5. Prerender-safety conventions applied to the phenotype route (D-11) | Not started |
| 6. Phenotype feature sections | Not started |
| 7. Hosted preview + merge gates (D-31b) | Not started |

Bootstrap CI currently validates the workspace and CLI only; it is not the D-31b merge-gate suite. Extend it to build, typecheck, unit, smoke, and content-schema checks when the app and packages exist.

## Effector-gene lists: fetch vs import

Legacy behavior: on every page load the browser fetches CMS page `egl_241` from `hugeampkpncms.org` (a 64 KB CSV string, 149 rows, 21 columns), parses all of it, keeps rows whose `Trait ID` contains the phenotype name, and renders fields with `v-html`. CAD matches one row (`cardiogram_165`, Aragam et al. 2022). The "View genes" link goes to a legacy `research.html?pageid=…` page.

| | Runtime fetch | Build-time import (chosen) |
| --- | --- | --- |
| Effort | About half a day | About 1–2 days for a narrow, single-dataset import |
| Register | Conflicts with D-07/D-07b; needs an amendment | Matches D-07b |
| Runtime dependency | CMS must stay up, with CORS, and it is scheduled for retirement — the section breaks at go-live | None; data ships in the build |
| Safety | Unsanitized `v-html` rendering | Plain-text rendering, schema-validated, malicious-content fixture test |
| Payload | 64 KB downloaded to show ~1 row | Only the matching rows' data |

The narrow import is a re-runnable CLI step: CSV to a typed Nuxt Content data collection. It doesn't need HTML-to-MDC conversion (the data contains no HTML today). The generic page-import pipeline remains later foundation work for other pages.

## Open questions and risks

- **D-20 scope**: whether the owned regional evidence plot falls under D-20's locus-plot deferral. Moot while the plot is deferred under the rule above.
- **CFDE production source**: production BioIndex returns no CAD rows for `pigean-gene-set-phenotype`; only the dev host has data. Deferred, so the dev feed isn't needed for the preview.
- **Effector-gene publication state (D-07a)**: the CMS data endpoint exposes no publication field. Confirm `egl_241` is published before the first import.
- **Effector-gene trait matching**: legacy uses substring matching, so one phenotype ID can match another's lists; 6 rows list several trait IDs. The import should split IDs and match exactly.
- **Legacy deep links**: `/phenotype.html?phenotype=CAD` needs a static alias or nginx rule on the preview host.
- **Preview hosting**: DNS, nginx and CI access for `cmd.next.hugeamp.org` are unverified.
- **CS2CT robustness**: the legacy page throws a null-name error during CS2CT initialization; the rebuild needs explicit loading, empty and error states.

## Log

- 2026-11-10 — Started foundation work: added the initial pnpm workspace, portable `portal` CLI (`list`, `validate`, `test`), bootstrap-only GitHub Actions validation, and architect CODEOWNERS. Full build and affected commands are not implemented yet.
- 2026-11-10 — Verified `pnpm portal validate`, `pnpm portal test` (3 passing), `pnpm portal list`, and `git diff --check`. The list correctly reports no app packages yet.
- 2026-11-10 — Planning checkpoint: reviewed the register and legacy phenotype page; probed live BioIndex for CAD; set scope. Adopted the deferral rule. Measured the effector-gene payload and chose build-time import.
