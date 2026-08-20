# dig-portal-next

## Purpose and Intended Audience

Successor repository for the DIG/HuGeAMP portal rewrite: a pnpm monorepo of independently deployable Nuxt 4 / Vue 3 / TypeScript portal applications. Replaces the branch-per-portal Vue 2.7 repository (`dig-dug-portal`), which remains maintained and serving production until every necessary portal is rebuilt here.

Audience: the architect and any coding agent or contributor working in this repository.

## Read This First

**`docs/decisions.md` is the authoritative decision register.** It holds every architecture decision as a numbered `D-nn` entry with rationale, evidence, corrections, and the open-items list (`O-nn`). Do not re-litigate a settled `D-nn` without new information; reference decision IDs in PRs and issues instead of restating them.

- [`docs/decisions.md`](docs/decisions.md) — decisions of record (authoritative; ~56 decisions, open items at the end)
- [`docs/architecture.md`](docs/architecture.md) — the decided structure with diagrams; every element cites its `D-nn`
- [`docs/brainstorming.md`](docs/brainstorming.md) — historical working notes; superseded in part, kept for the reasoning trail

If any document here disagrees with `decisions.md`, `decisions.md` wins.

## Core Facts (details and rationale in the register)

- **Version-one portals:** `cmd` (flagship, serves `hugeamp.org`) and `msk` (`msk.hugeamp.org`), MSK added before CMD is feature-complete (D-04). Portal IDs are `cmd`, `msk`, … — never hostnames or the old branch names (D-04a).
- **Repository shape:** `apps/<portal>` per portal; `packages/` for domain, api-clients, design-system, feature-*; `layers/platform` (thin, explicit `extends`, declared as a workspace package); `tooling/portal-cli` (D-01, D-30, D-31a).
- **One-directional dependency rule:** shared packages never import an application and never read a portal ID (D-05). The single most load-bearing rule.
- **The md family** builds from `apps/cmd` as one app, seven artifacts (D-27a): the base build — registry name `md`, which **is** the CMD portal itself (D-04 naming addendum) — plus six config variants (`t2d`, `sleep`, `cd`, `cvd`, `t1d`, `kidney`). `cmd` and `md` are one portal under two naming systems: `cmd` canonical in the repo, `md` its BioIndex registry name — the only portal whose two names differ.
- **Rendering/hosting:** prerendered static with SPA fallback, served by nginx via DIG-DUG server; no Node runtime for portals; no BFF by default (D-11, D-12, D-13).
- **Content:** Git-managed Nuxt Content; legacy CMS retired per portal (import → refresh → go-live lifecycle, D-07b); per-portal self-hosted Nuxt Studio for editing (D-08); HTML sanitization mandatory at the import boundary (D-07b).
- **Build:** repository-owned `portal` CLI is the sole build contract; GitHub Actions only; tagged builds; affected set from the pnpm dependency graph compared against last-built manifest commits (D-06, D-24, D-31a). Merge gates: build, typecheck, unit, smoke, content-schema validation (D-31b).
- **Domain lifecycle per portal:** `<portal>.next.hugeamp.org` → production domain → `<portal>.old.hugeamp.org` → gated snapshot/decommission; unbuilt routes 404-redirect to the old domain (D-38b).
- **Staffing:** single architect with AI assistance; contributors work at the feature/component/content level only, never architecture (D-35a). Enforce with `CODEOWNERS`.

## Constraints and Non-Negotiables

- Uppercase `AGENTS.md` for all agent docs; `CLAUDE.md` is an alias that imports this file.
- Portable Node/TypeScript scripts only — no bash-specific `export` or PowerShell-specific syntax in package scripts (D-06).
- No portal branches, ever (D-39 rule 1). Portal variation lives in portal source, configuration, or typed extension contracts.
- No secrets in `app.config`, public runtime config, client bundles, or content (D-22).
- Foundation order (O-01): repo + `portal` CLI → application shell → data layer → content pipeline → prerender-safety conventions.

## Reference

- Predecessor repo: https://github.com/broadinstitute/dig-dug-portal (branch-per-portal Vue 2.7; treat its components as behavior reference, never port mechanically)
- Backend: BioIndex (`bioindex.hugeamp.org`; `bioindex-ext.hugeamp.org` is reachable without Cloudflare; `bioindex-dev.hugeamp.org` for dev)
- Portal registry: `GET /api/portal/groups` on any BioIndex host — 26 entries; `private_sleep` is test data, ignore it (O-05)
- AI tooling: https://github.com/broadinstitute/dig-portal-tooling — plugin marketplace (skills, agents, linked Nuxt/Nuxt UI/Nuxt Content MCPs, secret-guard hook) auto-enabled via `.claude/settings.json`; Codex users sync with `node codex/install.mjs` from a clone (`.codex/config.toml` is committed, synced skills are gitignored). The `portal-migration` plugin is sunset tooling: review at D-38a, drop it from `enabledPlugins` once no pre-go-live portal and no legacy-derived feature work remains.
