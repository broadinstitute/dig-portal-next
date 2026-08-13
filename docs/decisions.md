# DIG Portal rewrite — decisions of record

> Status: authoritative current state of the rewrite architecture decisions. Not yet ratified as a set of ADRs, but this document — not `brainstorming.md` — is what to read for what has been decided. The decided structure is drawn in [`architecture.md`](./architecture.md); this register holds the rationale.
>
> Date: 2026-08-12
>
> Scope: a new implementation in a successor repository. The current Vue 2.7 application remains maintained as-is. This is not a migration plan.

## How to use this document

`brainstorming.md` is an append-only working record. It contains three chronological sessions — the original proposal, a review dated 2026-08-01, and a decisions log — and earlier sections were never amended when later sections overrode them. As a result it now gives contradictory answers to the repository-topology question, the Nuxt Content Studio question, and the shared-chrome question.

This document supersedes the decisions log in `brainstorming.md`. Where the two disagree, this one is current. `brainstorming.md` is retained for rationale, evidence, and the reasoning trail; the [Superseded positions](#superseded-positions) section below lists what specifically no longer holds.

Every decision carries an ID (`D-nn`). Reference these IDs in ADRs, pull requests, and issues rather than restating the decisions.

---

## 1. Repository, tooling, and scope

### D-01 — Monorepo with one application per deployable portal

**Decided.** A single repository containing one independently composed and independently deployable Nuxt application per production portal. Not one configurable multi-tenant application, and not one repository per portal.

**Rationale.** No production portal requires repository-level access isolation, legal separation, authentication differences, or independent release approval. Shared domain, API, and visualization changes must be atomic across consuming portals; separate repositories would convert those into package publishing and coordinated-upgrade work with no offsetting governance benefit. Portals retain meaningful autonomy inside the monorepo — separate owners, pages, layouts, themes, configuration, builds, artifacts, and deployment schedules.

**Reconsider only if** legally restricted code, repository-level access control, incompatible release governance, or organizations that cannot coordinate through a shared repository emerge. Different CI jobs, portal-specific presentation, and independent deployment schedules are not sufficient reasons.

### D-02 — New successor repository

**Decided.** The rewrite lives in a new repository. The existing `dig-dug-portal` repository continues to maintain all Vue 2 portals until they are retired.

Final naming, and whether the new repository formally replaces the old one at cutover, remain a governance decision rather than an architecture one.

### D-03 — pnpm workspace, single lockfile

**Decided.** pnpm, chosen specifically because its strict `node_modules` layout structurally prevents phantom dependencies. That is what makes D-05 enforceable rather than aspirational.

### D-04 — Version-one portals: CMD and MSK

**Decided (revised).** CMD is the first portal; **MSK** is the second and must be added before CMD is feature-complete. CFDE is no longer the second portal; its disposition is a separate assessment ([O-15](#o-15--cfde-disposition-monorepo-or-separate-repository)).

**What MSK is, verified against production.** MSK has no branch, no separate build, and no separate deployment. `hugeamp.org` and `msk.hugeamp.org` serve **byte-identical artifacts** — same HTML shells (checked on `index`, `phenotype`, and `about`), same asset hashes, same non-hashed CSS and JS, differing only in the Cloudflare token. All differentiation happens at runtime: `hostUtils.js` parses the subdomain, `bioPortal.js` matches it against disease groups fetched from BioIndex `/api/portal/groups` (defaulting to `md` when there is no subdomain), and `PageHeader.vue` composes CSS class names from the group (`mskkp-header`, `mskkp-logo`, …) that are all pre-shipped in the shared `mdkp.css`. Phenotypes, documentation, and datasets are refetched with `q=msk`. Even the static `<title>` says "Common Metabolic Diseases Knowledge Portal" on the MSK domain until JavaScript corrects it.

It is not the `matkp-main` branch — an earlier revision of this document conflated the two and attributed that branch's statistics to MSK; both errors are corrected here, and `matkp` returns to the undispositioned list in O-05.

**Scoping `apps/msk`, therefore:** its delta over CMD is one disease-group record (branding, logo, description), one block of rules in the shared stylesheet, and a phenotype/documentation subset selected by portal ID. As a compiled application it is portal config plus theme tokens plus its landing content — the smallest possible second portal, and the runtime subdomain-switching mechanism it currently relies on dissolves rather than being ported (D-27: each portal is a distinct compiled application).

**Naming, settled.** The flagship application is **CMD**, and its directory is `apps/cmd`. "HuGeAMP" is not a separate portal — `hugeamp.org` is the domain that serves the CMD portal, branded as CMD. The earlier trees showing both `apps/a2f` and `apps/hugeamp` described one application under two names. Use `cmd` everywhere in code, configuration, and artifact identifiers; the second portal's ID is `msk` regardless of the old branch name.

**Naming addendum (2026-08-13): `md` and CMD are the same portal.** The BioIndex registry and the old platform know the flagship as disease group **`md`** — the group `hugeamp.org` resolves to when no subdomain is present (see "What MSK is" above). They are one portal under two naming systems: `cmd` is canonical in this repository (code, configuration, artifact identifiers, per the paragraph above), and `md` is what the BioIndex API calls the same thing (`portalGroup: md`, `q=md`) — an upstream identifier CMD's portal config carries as data, never something a shared package branches on (D-05). This is the **only** portal whose repository ID diverges from its registry name; every other portal (`msk`, `t2d`, `sleep`, …) uses its registry name as its portal ID, which is why portal config needs an explicit registry-group field rather than assuming the ID matches. Where these documents say the "md family," read: the CMD family, under its registry name.

**Rationale.** CMD first validates the foundation against the hardest case immediately. MSK is the purest available test of the governing design principle — *features are shared, looks are portal-customizable* (D-14). Same features, different presentation, no separate branch to reconcile: exactly the shape every portal is supposed to have in the new architecture. It should also be the cheapest possible second portal to stand up, since its delta over CMD is theme, chrome, and landing rather than new capability.

**What this pairing does and does not validate.** CMD-plus-MSK exercises the presentation-customization boundary thoroughly and the feature-divergence boundary barely at all. CFDE was originally chosen as portal two *because* it was the most divergent; that stress test is now deferred to whenever CFDE is rebuilt (O-15). The second-consumer risk (an abstraction with one caller cannot be validated) is mitigated for theming and chrome, and remains open for deep feature divergence.

**Consequence.** Adding MSK early remains a hard requirement, not a preference.

### D-04a — Domain model

**Decided.** The CMD portal is served at `hugeamp.org`. Every other portal is served at `<portal>.hugeamp.org`.

Portal identity in code is the portal ID (`cmd`, `msk`, …), never the hostname. Nothing in a shared package may branch on either, per D-05.

**Clarification (2026-08-13):** no `md.hugeamp.org` exists — the registry's `md` group has always been served as bare `hugeamp.org` (it is the CMD portal under its registry name, per the D-04 naming addendum). The `<portal>.hugeamp.org` rule applies to the other portals; there is no `md` subdomain to alias or migrate.

### D-05 — One-directional dependency rule

**Decided.** Shared packages must never import a portal application and must never inspect a portal ID to select behavior. Portal applications may import shared packages and provide portal implementations of extension contracts.

This is the single most load-bearing rule in the architecture. Enforce it with pnpm workspace boundaries, a dependency-direction lint check, and `CODEOWNERS`.

### D-06 — Repository-owned build CLI as the sole build contract

**Decided.** The repository owns a provider-neutral `portal` CLI (`list`, `validate`, `dev`, `typecheck`, `test`, `build`, `package`, `affected`). CI invokes those commands and holds no build knowledge of its own — no Nuxt config paths, output directory conventions, feature dependency graphs, or manifest formats.

**Rationale, strengthened by inspection.** There are currently no pipeline definitions in this repository at all: the only workflow file is `.github/workflows/codeql.yml` and there is no `Jenkinsfile`. Every piece of build knowledge for every portal lives outside version control today. This is not a refinement of the current process; it is the first time the build becomes reviewable.

Scripts must be portable Node/TypeScript. No bash-specific `export` expressions and no PowerShell-specific setup in package scripts — the current `watch`, `build`, and `deploy` scripts all begin with a bash `export NODE_OPTIONS=...` that fails on Windows today.

---

## 2. Content and the CMS

This area changed most in the current session. Read D-07 before anything else in this document, because it has the widest downstream effect.

### D-07 — The runtime CMS is retired; all CMS content migrates to Nuxt Content

**Decided.** All content currently served from `hugeampkpncms.org` is copied into Nuxt Content collections in the new repository. The CMS does not survive as a runtime data source for the new portals.

**What this covers.** Both classes of CMS content, which the earlier notes treated as one:

1. **Editorial prose** — About, Help, Policies, Publications, Collaborate, Contacts, News, Downloads. These become Nuxt Content *page* collections.
2. **Research page composition** — the definitions fetched today by `getResearchPage`, `getResearchDevPage`, `getResearchMode`, `getResearchMenu`, `getResearchMethod`, and `getResearchData` in `src/modules/hugeampkpncms.js`. These become Nuxt Content *data* collections with Zod schemas.

**Rationale.** Research pages stay configuration-driven, which is the capability worth preserving, but the configuration becomes a schema-validated, reviewable, version-controlled artifact instead of an unvalidated runtime fetch. This also aligns with D-14: sections are composed through props and configuration, so the page definition is exactly the shape Nuxt Content data collections are for.

**Consequences.**

- Research pages become prerenderable and crawlable, which they are not today. This is a gain the earlier notes did not anticipate.
- `src/modules/hugeampkpncms.js` and the 26 files in `src/` that reference the CMS host have no successor in the new codebase.
- The 136 `.vue` files in `src/components/researchPortal` are the renderer set for these configurations. They are rewritten as shared section components (D-14), not ported.
- Content migrates incrementally rather than in one pass. See D-07b.
- The capability genuinely lost is publishing without a build. That was accepted: rebuild-and-deploy latency is acceptable, but easy editing by non-engineers is not negotiable — which is what D-08 provides.
- The WASM SQLite dump (D-10) now carries all portal content, not just editorial prose. Measuring its size moves from nice-to-have to required foundation work.

### D-07b — Content lifecycle: import per page, refresh before launch, Nuxt Content only after

**Decided.** There is no content migration project. Content moves across in three defined phases, per portal:

1. **When a page is built** — fetch that page's current content from the CMS and import it into Nuxt Content. This first import is a **placeholder**: it makes the page real to work against, and it is not the content that will ship.
2. **Until the portal goes live** — the import may be re-run as often as useful, and **each run overwrites** what came before. The CMS remains the authoritative source throughout this stage, so overwriting is the intended behaviour rather than a hazard.
3. **Once the portal is live at its production domain** — no further refetching. Nuxt Content becomes the sole source and all editing moves to Studio.

**The CMS stays editable until its portal goes live.** Editors continue working normally in the CMS for every portal not yet replaced, and nothing about the existing portals changes while the new ones are built. Given that D-38a sets no end date, this matters: freezing content across eight or more portals for an open-ended period was never an acceptable cost.

**Overwrite is safe here because the authority is unambiguous.** Before go-live the CMS is authoritative and Nuxt Content is a working copy; after go-live that reverses permanently. There is no period where both are authoritative, which is what would otherwise make repeated overwriting dangerous. Studio edits made before go-live are provisional and may be discarded by the next import — that is understood and accepted, not a defect.

**Diffing between imports is useful but not required.** Seeing what moved in the CMS since the last run helps, and the tool should offer it. It is not a gate and does not need human sign-off.

**On the race an adversarial review identified.** An edit landing after the final import but before the domain switch will not reach Nuxt Content. Two things bound that:

- The final import can run immediately before cutover, since it needs no diff review, so the window is minutes rather than months.
- Anything missed is recoverable. Under D-38b the old build stays reachable at `old.<domain>` through the reference stage, and stage 4 takes a final snapshot before decommissioning, so a late edit is retrievable well after cutover.

That is why "archived" in phase 3 means *no longer read by the new portal*, not deleted. The distinction is load-bearing.

**Consequences.**

- **The import must be a repeatable command, not a manual copy.** It is expected to run many times per page. This belongs in the `portal` CLI alongside the other build contracts (D-06) and in foundation item 5 (D-35).
- **The publication-state filter lives in the import.** D-07a is enforced here concretely: records not in a published state route to the content branch rather than into a public collection.
- **HTML sanitization is mandatory at the import boundary — a blocking requirement, not an option.** CMS fields carry raw HTML that the current application renders directly. Left untouched, that HTML flows into Nuxt Content and into prerendered public pages, and with CSP deferred (O-10) there is no backstop: a malicious or compromised CMS record becomes persistent script execution in a portal build. The import therefore sanitizes every HTML-bearing field with tag, attribute, and URL-scheme allowlists (the current app already ships `dompurify`, so the approach is familiar), preferring conversion to Markdown/MDC where structure allows. The same sanitization applies to Studio-published content on its way into a build, complementing D-08c's component allowlist, which governs *which components* may be inserted but says nothing about raw HTML *inside* content. Build tests should include malicious-content fixtures — a script tag, an event-handler attribute, a `javascript:` URL — that fail the build if they survive to output.
- **Going live is the point of no return for content.** After it, the CMS copy stops mattering and Studio is the only way to change anything. Worth making explicit to editors, since it is the moment their working habits change.

### D-07a — Protected content never enters a public portal build; the dev-page mechanism is retired

**Decided.** Content that is not published does not go into a portal's Nuxt Content collections. The current password-gated draft mechanism is replaced rather than ported.

**The problem this closes.** `src/modules/hugeampkpncms.js` checks `field_page_mode === 'dev'` and routes those pages through `getResearchDevPage`, which requires a development ID and password. D-07 migrates all CMS content into Nuxt Content, and D-10 ships collection content to the browser. Migrating draft page definitions into a portal collection would put them at a publicly retrievable URL.

**Why there is no configuration answer.** Nuxt Content has no collection-level privacy. Each collection's dump is served at the predictable path `/__nuxt_content/<collection>/sql_dump.txt`, so anything compiled into the static artifact is retrievable by anyone who guesses the path, whether or not the interface ever queries it. The only reliable control is not building it.

**Replacement, which is stronger than what exists.** Drafts live on the Studio content branch (D-08b) and are absent from the production build entirely rather than hidden inside it. Where editors need drafts rendered, build a preview deployment from the content branch and restrict access at nginx. That is real access control.

**Severity note, so this is scoped honestly.** Today's protection is thin: credentials travel as URL query parameters (`&&devid=...&&devpw=...`) and are cached in a plain cookie for 14 days. This is draft-hiding, not access control. The regression being prevented is *weakly gated* to *fully public* — worth fixing, but not the loss of a real security boundary.

**Scope correction.** An adversarial review also flagged BYOR as protected content. It is not: `ResearchByorProjects.vue` fetches `https://hugeampkpncms.org/rest/views/byor_projects` with no authentication, and it is a public directory of projects. No BYOR work follows from this decision.

**Enforcement.** Add a build check asserting that no record carrying a non-published state appears in any generated collection dump.

### D-08 — Nuxt Studio runs as a separate internal editing deployment

**Decided.** Portals remain prerendered static (D-11). Nuxt Studio runs as its own small internally-hosted SSR deployment pointed at the same repository. Editors author through Studio, Studio commits Markdown and data files to Git, and portal builds read the committed files.

**Rationale.** Nuxt Studio changed substantially since the earlier notes were written. As of 2026-01-05 it is free, open source (MIT), and self-hosted — the hosted SaaS at nuxt.studio is sunset and that domain is now the module's documentation. The package is `nuxt-studio` (not `@nuxt/studio`), latest 1.7.0. So the cost and approval concerns in the earlier notes are gone.

But Studio requires SSR hosting via `nuxt build` for production mode and cannot run on a purely static or `nuxi generate` deployment. That is irreconcilable with prerendered-static portals if Studio has to live inside the portal application. Separating the editing surface from the served artifact resolves it: Studio needs a Node process only where editors edit, not where readers read.

**Consequences and unknowns.**

- One Node process per portal for the editing host. The portals themselves stay static, so D-11 and D-12 are unaffected.
- Requires a GitHub OAuth app (`NUXT_STUDIO_AUTH_GITHUB_CLIENT_ID` / `_SECRET`). GitHub and GitLab are the only supported Git providers.
- Studio auto-detects repository details on GitHub Actions and **CI values take precedence over `nuxt.config.ts`**. Set them explicitly for the editing deployment or CI will silently override the configuration.
- See D-08a for the verified instance-count answer and D-08b for the Git write flow.

### D-08a — One Studio instance per portal; a single instance cannot serve several portals

**Decided, and verified against the module source rather than inferred.** Each portal that needs content editing gets its own Studio deployment. There is no configuration that lets one instance manage several portals' content.

**Evidence.** Three independent constraints in `nuxt-content/nuxt-studio` at `main`:

1. `studio.repository` is a single object, and `rootDir` is typed `rootDir?: string` with default `''` — one string, not an array (`src/module/src/module.ts`).
2. The Git provider computes every repository path as `joinURL(rootDir, path)`, and file URLs as `joinURL(rootDir, featureDir, fsPath)` where `featureDir` is the literal string `'content'` or `'public'` (`src/app/src/utils/providers/github.ts`). Studio therefore assumes exactly one `<rootDir>/content` tree and one `<rootDir>/public` tree per instance.
3. Studio is a Nuxt module inside a Nuxt Content application, not a standalone service. It edits the collections of the app it is installed in.

**The one genuinely open trick, and why it needs a test.** Nuxt Content collection `source.cwd` can point outside the application — the docs give `cwd: path.resolve('packages/my-pkg/docs')`. So an editing app could *read* a sibling portal's content, while `rootDir` independently controls where commits are *written*. Setting the editing app's `rootDir` to `apps/cmd` would make Studio write to `apps/cmd/content/...`, which is the correct destination. Read path and write path are configured separately and can be made to agree.

That gets one editing app per portal, which is the arrangement above. It does **not** get one editing app for several portals, because `rootDir` is a single value and cannot vary per collection. The unverified part is whether Studio's draft `path` values compose cleanly onto `rootDir` when collections use an external `cwd`. That is the specific thing [O-03](#o-03--studio-monorepo-arrangement) tests.

**Operational note.** The entire `repository` object is written into `runtimeConfig.public.studio`, so `rootDir` and `branch` are overridable per deployment via `NUXT_PUBLIC_STUDIO_REPOSITORY_ROOT_DIR` and the documented `NUXT_PUBLIC_STUDIO_REPOSITORY_BRANCH`. That means one built image can serve several *environments* of the same portal. It does not help across portals, because the app's compiled Nuxt Content collections are fixed at build time.

### D-08b — Studio commits directly to a branch; point it at a content branch

**Decided.** Studio has no pull-request workflow. It commits directly to the configured branch through the Git provider API, one commit per publish. If content changes should be reviewed, point Studio at a dedicated `content` branch and open pull requests from that branch through the normal process.

Concurrency behaviour follows from the same design: Studio compares the draft against the latest version in the repository, and a second editor publishing the same file gets a conflict notification to resolve through Git. This is acceptable at the expected editing volume but should be explained to editors rather than discovered.

Two commit-hygiene settings worth applying: `studio.git.commit.messagePrefix` (for example `content:`) to keep content commits filterable, and awareness that Studio appends a `Co-authored-by: Nuxt Studio <noreply@nuxt.studio>` trailer to every commit.

### D-08c — MDC component allowlisting uses Studio's native editor filtering

**Decided.** The content-renderable component allowlist that `brainstorming.md` called for is a built-in Studio feature rather than something to build:

```ts
studio: {
  editor: {
    components: {
      include: ['Content*', 'ResearchSection'],
      exclude: ['InternalDebugPanel'],
      groups: [{ label: 'Research sections', include: ['app/components/research/**'] }],
      ungrouped: 'omit',
    },
    iconLibraries: ['material-symbols', 'lucide'],
  },
}
```

`ungrouped: 'omit'` makes the allowlist closed rather than advisory, which is the posture to adopt. This governs what editors may insert; it does not replace sanitising embedded HTML — that boundary is mandatory in the import and publication path, defined in D-07b.

### D-08d — Media storage: Git-committed, revisit at a threshold

**Decided.** Studio's default behaviour stands: uploaded media commits into `<portal>/public` and ships with the build. No external blob storage, no new credentials or buckets to operate.

**The tripwire.** Keep Studio's 10 MB single-file cap (`media.maxFileSize` default), and revisit toward `media.external` (S3/R2) only if repository growth from media becomes a real problem — measured, not predicted. The O-04 content pull will reveal the existing CMS media volume, which is the first data point.

### D-09 — Editorial versus application boundary

**Decided.** Default rule: static informational pages are editorial content; anything issuing a data query is an application feature. Edge cases are decided as they arise.

Under D-07 this boundary no longer decides *which system* owns the content — everything is Nuxt Content. It now decides *which collection type*: page collections for prose, data collections for research-page configuration consumed by application features.

### D-10 — Content database adapter: default SQLite

**Decided.** Default file-backed SQLite with prerendering. Nuxt Content v3 also supports `d1`, `postgresql`, `libsql`, and `pglite`, but SQLite plus a browser WASM dump is the only combination compatible with static hosting.

**Verified constraint, corrected against the Nuxt Content source.** Under static hosting the client downloads a generated WASM SQLite dump and replays it into an in-browser database, and there is no documented flag to disable that. Two refinements that matter:

- **Dumps are per collection, not one monolithic file.** The client calls `fetchDatabase(undefined, collection)` and loads each collection's dump lazily, on the first query that touches it. So dump size is a per-collection cost, and a rarely-used collection is not downloaded by ordinary visitors.
- **Each dump is served at a predictable public path**, `/__nuxt_content/<collection>/sql_dump.txt`. Laziness limits incidental download; it provides no privacy. See D-07a.

Two consequences to carry: the dump size must be measured per collection on a real portal with real migrated content (foundation work under D-07), and a strict Content Security Policy will break it, because compiling that WASM requires `wasm-unsafe-eval`. Settle the CSP posture alongside it.

---

## 3. Rendering, hosting, and the backend boundary

### D-11 — Prerendered static with SPA fallback

**Decided.** Real prerendered HTML for enumerable routes; client rendering for `/gene/[symbol]`, variant, and region URLs that cannot be enumerated at build time.

Search-engine indexing is required for informational pages only. Interactive research tools do not need to be indexable. Under D-07, research pages become prerenderable too, which widens the indexable set beyond what was originally assumed.

**Consequence carried into foundation work.** Prerendering executes component code at build time, so any browser-only visualization that touches `window` or the DOM at import will crash the build. The client-only boundary and dynamic-import pattern is a foundation convention (D-19, item 4), established once so every visualization rewrite inherits the answer.

### D-12 — DIG-DUG server serves the built output; Node runtime must justify itself

**Decided.** Compiled assets are static and served by nginx through the DIG-DUG server, preserving same-origin API access and matching the current operational model. Node processes may be run where the advantage is clear and observable, but not by default. The Studio editing host (D-08) is the one currently justified exception.

### D-13 — No Nuxt BFF by default

**Decided.** A Nitro BFF is allowed only if a specific need justifies it, and is not adopted in v1. Typed API client interfaces must stay implementation-neutral — the same interface whether the call originates in the browser or a server route — so the decision stays reversible.

Scientific computation, long-running workflows, primary authorization policy, canonical persistence, and large query engines remain in BioIndex and the existing data services regardless.

---

## 4. Design surface

### Governing principle

> Features — visualizations and data behavior — are shared. Everything concerning **looks** is portal-customizable.

### D-14 — No shared layouts; maximum layout flexibility through configuration

**Decided.** The platform layer ships no layouts. Each portal owns all of its layouts. Styling flows through theme tokens, and shared components and sections are customized through props and configuration rather than through layout variants.

**Rationale.** This is the consistent reading of the governing principle. Layouts are looks. A shared `research` layout would attract exactly the `if (portal === ...)` pressure that D-05 forbids, and the earlier decision to share `research` and `fullscreen` sat in unresolved tension with the principle.

**Consequences.**

- The platform layer shrinks to bootstrap, baseline modules, and the error shell. It is now genuinely thin.
- Feature packages ship headless composables and minimally-styled default renderers. The design system shrinks to tokens plus primitives.
- The `PortalComponentOverrides` contract becomes much less central. When all presentation is portal-owned and sections compose through configuration, a typed override list for `pageHeader` and `pageFooter` is describing the normal case rather than an exception. Keep the typed contract for whole-capability replacement, but do not build the architecture around it.
- **Amends proposed initial decision 6 in `brainstorming.md`.** "Nuxt UI for primitives and shared application chrome" no longer holds: there is no shared chrome. Nuxt UI is for primitives only.
- **Accepted cost:** responsive behavior and accessibility work is no longer done once in a shared layout. The mitigation is that shared *section* components carry the accessibility and responsive contract, and portal layouts stay thin composition shells. WCAG 2.1 AA (D-17) applies per portal, so this must be tested per portal.

### D-15 — Portal-replaceable presentation surfaces

**Decided.** `pageHeader`, `pageFooter`, landing/front page, `globalSearch`, and navigation are portal-owned. More broadly, any presentation surface is portal-customizable.

### D-16 — Nuxt UI for primitives, with Tailwind CSS v4

**Decided.** Nuxt UI (currently 4.10.0, MIT, with the former Pro tier merged into the free library) for accessible primitives. Plots, genome browsers, network graphs, and high-volume scientific tables are feature components and are not Nuxt UI's responsibility.

**Verified constraint the earlier notes understated.** Nuxt UI v4 requires Tailwind CSS v4 specifically — `peerDependencies` declares `tailwindcss: "^4.0.0"`. Tailwind v4 is CSS-first: theme configuration moves into `@theme` blocks in CSS and there is no `tailwind.config.js`. That is a different authoring model, not a set of conventions, and it is where portal brand tokens live. Do not plan against Tailwind v3 examples.

### D-17 — Browsers and accessibility

**Decided.** Modern evergreen browsers (Chrome, Firefox, Safari, Edge) and WCAG 2.1 AA. Keyboard-only and screen-reader checks belong in the definition of done for shared section components.

### D-18 — Internationalization is a non-goal

**Decided.** Explicitly out of scope, stated here so it is a decision rather than an omission.

---

## 5. Visualizations

### D-19 — Mandatory visualizations for v1

**Decided.** Manhattan/MQQ/PheWAS plots, heatmaps and expression plots, and network graphs (vis-network). Most existing visualizations carry forward in substance until improvements or replacements are made.

### D-20 — The locus plot is not in the first release, and that is not a blocker

**Decided.** Gene, region, and variant ship without the locus plot. Shipping pages with features still missing is acceptable; missing features are added as the project evolves.

**Rationale.** The locus plot will eventually be rewritten as a first-class owned component rather than a third-party dependency, so it is not a library-compatibility question and no Vue 3 wrapper or replacement evaluation is needed. Shipping an interim wrapper would drag `locuszoom` and the D3 v5 it carries into the new dependency tree for something already scheduled for deletion.

**Consequences.**

- `locuszoom` and D3 v5 never enter the new repository. This is the cleanest possible dependency outcome.
- LocusZoom is imported today by `src/views/Gene`, `src/views/Region`, `src/views/Variant`, and `src/views/HuGeCalculator`. All four are rebuilt without it.
- **No parity gate applies.** Under D-38 nothing blocks a portal from cutting over with features still missing, and under D-38b the old build stays reachable at `old.<domain>` for anyone who needs the older view in the meantime.
- The owned rewrite is a scheduled project needing its own owner and estimate. It remains the largest single unknown in the plan, but it gates nothing.

**Note for whoever does that rewrite.** `src/components/lz/beta/LzPlot.vue` computes a unique `this.dom_id` (`lz-plot-${uid}`) in `beforeCreate` and then never uses it: line 172 hardcodes `:id="'lz'"` and line 105 calls `LocusZoom.populate('#lz', ...)`. The uniqueness mechanism is dead code and two plot instances on one page would collide on the same DOM id. Do not carry that forward.

---

## 5a. State management

### D-20a — Pinia for cross-component workflows only, not as a data cache

**Decided.** Pinia is adopted for durable client-side and cross-page state, but it is not the default home for fetched data.

| State | Mechanism |
| --- | --- |
| Route parameters and shareable filters | URL and query parameters |
| Page request data | `useFetch` / `useAsyncData` |
| Local component state | `ref`, `reactive`, local composables |
| Cross-component feature workflow | Feature-scoped Pinia store |
| Cross-page user preferences | Pinia plus an explicit persistence adapter |
| API transport and cache policy | API client abstraction, not a global store |

**Rules.** Setup-style, feature-scoped stores rather than one portal store. Stores may import domain packages, but presentation components must not require knowledge of unrelated stores. Never fetch the same resource once through `useAsyncData` and again through a store action. Do not translate the current Vuex tree one-for-one — design stores around new workflows.

Under D-11 most pages are prerendered or client-rendered rather than server-rendered per request, so SSR store hydration is a narrow concern. Keep any hydrated state serializable and small regardless.

---

## 6. Configuration

### D-21 — `portal.config.ts` is the single authoritative portal configuration surface

**Decided.** `portal.config.ts` exports `PortalDefinition` and is the one place portal identity, enabled features, and navigation structure live. `app.config.ts` carries Nuxt UI theme tokens only. Composition with Nuxt file-based routing still needs proving in foundation work.

This resolves the three-candidate ambiguity the review identified, where `portal.config.ts`, `PortalDefinition`, and `app.config.ts` all appeared to carry portal identity.

### D-22 — Configuration split

**Decided.**

| Configuration | Location |
| --- | --- |
| Portal ID, enabled features, navigation, theme structure | `portal.config.ts` |
| Nuxt UI theme tokens | `app.config.ts` |
| Public API base URLs varying by environment | Build-time, per environment (D-24) |
| Server-only credentials | Private `runtimeConfig`; never in client code |
| Deployment and artifact metadata | Generated build manifest (D-25) |

No secret may appear in `app.config`, public runtime config, generated client bundles, or Nuxt Content.

### D-23 — Build-time environment configuration; runtime config option kept documented

**Decided.** Rebuilding per environment is accepted, matching current behavior — `vue.config.js` bakes the BioIndex host into `bioIndexUtils.js` at build time via `string-replace-loader` today. Since no artifact promotion is required (D-24), a validated public `/portal-runtime-config.json` is not a v1 obligation. Keep the approach documented for whenever promotion is wanted.

---

## 7. Build, environments, and delivery

### D-24 — GitHub Actions, single provider; no artifact promotion

**Decided.** GitHub Actions only to start; add or switch providers when a concrete limit is reached. Cross-provider artifact parity is deferred and is not a v1 requirement. No artifact promotion between environments — each environment builds.

**Consequence.** The original Spike D premise, two CI providers producing byte-equivalent artifacts, is gone, and with it the reproducibility problem it was designed to expose. The replacement objective: one GitHub Actions workflow invoking the `portal` CLI, producing an identified artifact a developer can reproduce locally.

### D-25 — `buildId` pinned to the commit SHA

**Decided.** Pin `buildId` in `nuxt.config`. Nuxt otherwise assigns a fresh `randomUUID()` per production build. It costs nothing and preserves the option of artifact comparison later.

Note that byte-equivalence remains unachievable regardless: Nitro writes wall-clock timestamps into `nitro.json` and into server- and public-asset `mtime` values, the upstream `SOURCE_DATE_EPOCH` request (nitrojs/nitro#2645) is still open, and the artifact manifest itself contains `createdAt`. Any future equivalence claim must be stated as content hashes matching over a normalized file set with timestamp fields excluded.

### D-26 — Environments

**Decided.** dev, qa, and production exist today. Adding **review** (like dev, but built on a fixed schedule rather than bleeding edge) and **prototype** (D-28).

### D-27 — Each portal is a distinct compiled artifact

**Decided.** Separate artifact per portal. No universal bundle containing every portal's code. Bundle size and memory behavior are checked per portal, and performance budgets are per portal rather than aggregate.

### D-27a — The md family builds as config variants of the CMD application

**Decided.** The seven `md`-family portals (`md`, `t2d`, `sleep`, `cd`, `cvd`, `t1d`, `kidney`) are **one application with seven build configurations**, producing seven separate static artifacts. They are not seven `apps/` directories. Portals outside the family remain distinct applications.

**Naming note (2026-08-13).** Registry `md` is the CMD portal itself under its BioIndex name (D-04, naming addendum) — the family's default member is the flagship, not a seventh variant. Concretely: the base build of `apps/cmd` is what the registry calls `md`, the `variants/` directory holds the other six (`t2d`, `sleep`, `cd`, `cvd`, `t1d`, `kidney`), and "seven build configurations" means base plus six variants. The flagship's artifact identifier is `cmd`, never `md` (D-04); the six variant artifacts keep their registry names, which are their portal IDs.

**Why this doesn't reopen D-27.** The artifact contract is unchanged: seven configs still yield seven independently deployable, per-portal artifacts with their own manifests — no universal bundle. What softens is only "one *application* per portal," for a family whose members differ in phenotype subset, branding, and content rather than capability. This is also strictly better than today, where all 26 portals share one artifact at runtime; the family goes from runtime-switched to build-time-separated.

**The variant boundary, stated as a rule:**

- A variant may have its own theme tokens, phenotype subset, content directory, landing composition, and layout *selection*.
- Everything a variant uses must exist inside the CMD application. A family member that needs a unique capability — a new interactive page, a route CMD doesn't have — has outgrown the variant mechanism and graduates to its own `apps/` directory. The promotion is cheap precisely because the artifact contract is identical on both sides.
- Shared packages still may not branch on portal ID (D-05); the variant selection lives in the CMD app's own build configuration.

### D-28 — Prototype environment: separate sandbox repository from a template

**Decided.** Non-engineers produce short-lived test builds and demos, frequently with AI/LLM assistance, in a separate sandbox repository generated from a template. Prototypes are outside the production CI matrix and are excluded from the build-all-consuming-portals rule.

**Consequences.**

- The template must stay structurally aligned with `apps/*` or folding a prototype back in becomes a rewrite. This tradeoff was accepted knowingly in choosing a separate sandbox over in-monorepo scaffolding.
- **The template is generated from the monorepo via the `portal` CLI, not maintained by hand.** Decided; this closes O-06. A scaffold command derives the sandbox template from the real `apps/*` structure, so the template cannot drift from the thing it imitates — alignment is structural rather than disciplinary. The alternative (a scheduled diff job that reports divergence) was rejected because reporting drift is not preventing it.
- Conventions must be legible enough for an LLM to follow unaided. That argues for explicit typed contracts over implicit layer shadowing, and for per-directory `AGENTS.md` files in the new repository.

### D-29 — Nuxt 4, minor line pinned

**Decided.** Build on Nuxt 4 and pin the minor line. Do not set `future.compatibilityVersion`. Schedule a Nuxt 5 upgrade window as a planned dependency event.

**Verified context.** Nuxt is at 4.5.2. Nuxt 5 has not shipped and has no announced date, though Nitro v3 work is in progress and opt-in v5 behavior flags have existed since 4.3. Nuxt 3 reached end of life on 2026-07-31. A rewrite starting now will very likely land during the 4-to-5 transition, so the upgrade posture is stated up front rather than discovered mid-rewrite.

### D-30 — Nuxt layers used narrowly

**Decided.** The platform layer is consumed through explicit `extends`, not auto-registration. Layer shadowing must be reported in CI and reviewed. Prefer explicit typed contracts over filename-based shadowing when the difference is intentional product behavior. No remote Git layers.

**Clarification of a wording error in the earlier notes.** "Auto-registered layers are alphabetically prioritized" reads backwards: alphabetically *later* wins, which is why the upstream `1.base` / `2.theme` convention exists. It is also moot here — auto-registration applies to a `~~/layers` directory *inside* an application, whereas the root-level `layers/platform` in this monorepo is consumed through explicit `extends`.

### D-31 — Affected builds use the dependency graph

**Decided.** Affected-portal calculation uses the workspace dependency graph, not path prefixes — a shared-package change affects portals whose directories did not change. Every shared-package change builds all consuming portals before merge, supplemented by a scheduled full build of all production portals. A task orchestrator (Nx, Turborepo) may be evaluated if build time justifies it, but not before the repository's own scripts and dependency boundaries are sound.

### D-31a — Only tagged versions are built, and how the affected set is determined

**Decided.** Production artifacts are built from tags, not from every commit on the default branch.

**The check itself.** `portal affected` wraps pnpm's own dependency-graph filtering. pnpm can select every workspace package changed since a git ref together with all of its dependents:

```bash
pnpm --filter "...[<ref>]" build          # changed packages + everything that depends on them
```

Leading `...` means dependents; trailing `...` means dependencies. A directory glob can be combined inside one selector, as in `"{apps/*}[<ref>]"`. Multiple `--filter` flags are a **union**, not an intersection, so the CLI resolves the affected package set from pnpm and then narrows it to workspace packages under `apps/` itself. That intersection is the reason this lives in the repository CLI rather than in a CI expression.

**Three things it must handle, none of which fall out for free:**

1. **Every shared thing must be a declared workspace dependency, or the graph cannot see it.** This is the one real trap. A Nuxt layer extended by relative path — `extends: ["../../layers/platform"]` — is invisible to pnpm, so a platform-layer change would silently rebuild nothing. Declare the layer as a workspace package and extend it by package name so the dependency is real. Feature packages imported normally are fine.
2. **Repository-global changes rebuild everything.** `pnpm-lock.yaml`, the root config, `tooling/`, and the Node or pnpm version pins are not owned by any one package. Treat a change to them as selecting all portals.
3. **Content changes map to a single portal by path.** Studio commits touch one portal's `content/` directory, so they select that portal and nothing else. Use `--changed-files-ignore-pattern` to keep documentation-only edits from selecting anything.

**The risk that tagged builds introduce, and the fix.** Diffing tag to tag is not the same as diffing against what was actually built. If a portal is affected at tag *N* but its build fails or is skipped, the diff from *N* to *N+1* will not list it again and the change is silently never shipped. Compare each portal against **the commit its last successful artifact was built from** — already recorded in the manifest (D-25) — rather than against the previous tag. The scheduled full build (D-31) stays as the backstop for whatever this still misses.

### D-31b — Merge gates

**Decided.** A pull request merges when, for every affected portal and package:

1. The build succeeds.
2. Typecheck passes.
3. Unit tests pass (domain and feature packages).
4. Critical-route smoke tests pass against the built output.
5. Content schemas validate (portal definitions and Nuxt Content collections).

**Deliberately not gates:**

- **No coverage-percentage threshold.** Coverage targets on a young codebase produce tests written for the metric. Test discipline is enforced through review, not a number. Revisit only if quality problems demonstrate the need.
- **No visual regression in v1.** Screenshot baselines are a real recurring maintenance cost across a growing portal matrix, and the portal-owned-presentation model (D-14) multiplies the baseline count. Not adopted until someone is prepared to own baseline management; this closes O-13 as *not adopted* rather than undecided.

This resolves the merge-gate half of the testing strategy. The layered test structure itself (Vitest unit, component, `@nuxt/test-utils` integration, Playwright browser, contract fixtures) is unchanged — the layers above the gate run in the scheduled full build rather than per merge.

---

## 8. Observability and operations

### D-32 — Keep GA4; error monitoring deferred

**Decided.** GA4 continues (`src/components/analytics/GoogleAnalytics4.vue`, `src/utils/gaUtils.js`, `GAEventLog.vue`). Error monitoring is deferred to a later phase.

**Stated trade.** There is no Sentry or equivalent anywhere in `src/` today, so error monitoring is a new capability rather than a migration. Deferring it means the observability goals in `brainstorming.md` — portal ID, correlation ID, and artifact commit in error telemetry — are explicitly **not met in v1**, and production failures remain as invisible as they are today. That is a conscious trade, not an oversight.

**Reaffirmed against an adversarial challenge, on corrected reasoning.** A review argued that deferring monitoring is indefensible during a cutover, because rollback needs an objective trigger. An earlier version of this document dismissed that by claiming no cutover occurs. That claim was wrong — D-38b makes each domain switch a real cutover.

The decision still stands, but for a different reason: the reversal path is cheap and always available. The previous build keeps running at `old.<domain>`, so recovering from a bad cutover is a routing change to a deployment already serving traffic, not a diagnosis-then-rebuild exercise. Detection can be human — a report that the site is broken — because the response does not depend on telemetry to pinpoint a cause before acting.

**The residual risk, stated plainly.** Failures that are real but not obvious — a broken export, a silently failing API call on one route, a client-side exception affecting one browser — will go unnoticed as long as they do today. That is the accepted cost, and it grows with each portal cut over. Revisit alongside D-33 (O-09).

### D-33 — No production source maps

**Decided.** No source maps in production, matching `productionSourceMap: false` today. Enabled in dev, qa, review, and prototype builds.

**Coupling to revisit together.** If error monitoring is adopted later, production maps become necessary for it to be useful. Revisit D-32 and D-33 as a pair, never independently.

### D-34 — Access control

**Decided.** All portals are public for now. No portal requires independent access control, and release approval is not differentiated by portal. Access can be added per portal later through a component or through server configuration such as nginx basic auth.

Note that this decision is what removes the main forcing function for multiple repositories, and therefore underpins D-01.

**Caveat raised and resolved:** the BioIndex portal registry contains a `private_sleep` entry, which briefly looked like a counterexample to "no portal requires access control." Confirmed otherwise: it holds test data and is not an established portal. It is excluded from the disposition inventory (O-05) and this decision stands as written.

---

## 9. Strategy and sequencing

### D-35 — Foundation-first replaces the five-spike plan

**Decided.** Build the base, then add features and components over time. Since nearly every component is being rewritten regardless, there is little value in spiking components in isolation. The spike questions do not disappear; they become properties of the foundation.

**Foundation scope — all of the following, before feature work:**

1. Repository, pnpm workspace, GitHub Actions, and the `portal` CLI. The build contract exists before anything is built with it.
2. Application shell: `portal.config.ts`, Nuxt UI theme token structure, and the portal-owned layout and chrome pattern (D-14).
3. Data layer: typed, framework-independent API clients and domain types for BioIndex, so each feature rewrite builds against something stable instead of inventing its own access pattern.
4. Prerender-safety conventions for visualizations: the client-only boundary and dynamic-import pattern, established once as a convention every visualization rewrite follows.
5. **Content pipeline** — added by D-07 and D-08. Nuxt Content collection structure and schemas for both page and data collections, the Studio editing deployment, and a measured WASM dump size on real migrated content.

Item 5 closes a real gap: the original four-item foundation scope contained no content work at all, despite content being on the critical path.

### D-35a — Staffing model: single architect, contributors at the feature level

**Decided.** Version one is built by one person with AI assistance. Additional contributors join later for **modules, components, and features only — never architecture**. The foundation, the shared-package boundaries, the build contract, and the extension contracts have a single owner.

**Consequences, most of which the architecture already anticipated:**

- **The contribution surface is `packages/feature-*`, portal components, and content.** `layers/platform`, `tooling/`, the domain/API packages' contracts, and this decision register stay under the architect. Express that in `CODEOWNERS` from the first commit, so it is enforced rather than remembered.
- **Explicit typed contracts stop being a preference and become the onboarding mechanism.** A feature contributor who receives a typed extension contract, a per-directory `AGENTS.md`, and merge gates (D-31b) can contribute without holding the whole architecture in their head. The same properties that made conventions LLM-legible (D-28) are what make them contributor-legible.
- **Review of shared-package changes has no second human.** Adversarial AI review fills that role for v1 — it has already caught real defects in this register. Worth being honest that this is the model rather than pretending review happens otherwise.
- **Governance rule 7 ("every portal has named owners") collapses to one name for v1.** It regains meaning as contributors arrive.
- **O-01 shrinks accordingly:** with ownership resolved to a single person, what remains is sequencing and timeboxes for the five foundation items.

### D-36 — Portal sequencing

**Decided.** Foundation plus CMD, then MSK added early — before CMD is feature-complete. See D-04 for why the "early" is load-bearing.

### D-37 — The CMD route inventory is a build order, not a parity contract

**Decided.** Produce the route and URL inventory as immediate foundation work. Under D-38 it is a prioritised list of what to build, not a checklist that gates a replacement event.

`vue.config.js` declares 49 page entries, 47 of which ship in production (`debug` and `mouse_diff_exp` are deleted when `NODE_ENV=production`). Order those 47 so the sequence of work is deliberate rather than incidental.

**Suggested first group:** `index`, `gene`, `phenotype`, `region`, `variant`, plus the informational set now served by Nuxt Content.

Capture per route what a rebuild needs to know: supported URLs, query parameters, redirects, analytics, and data exports. The inventory is cheap to generate now from `vue.config.js` and the CMS, and effectively impossible to reconstruct after the Vue 2 application is retired — which is the actual reason to do it early.

### D-38 — Build alongside; no staged route migration and no parity gate

**Decided.** The new setup is developed alongside the existing one. The old repository continues to be maintained and continues to serve production throughout. Each portal switches over on its own schedule (D-38b), and the old setup is retired once every necessary portal has been rebuilt (D-38a).

**What this rules out.** There is no route-by-route migration, no parity gate, and no feature checklist standing between a new portal and production. A portal is not assembled behind the old one page by page; it is built separately and then takes over.

**Correction to an earlier framing.** This decision previously read "there is no cutover event and no rollback." That was too strong, and an adversarial review was right to challenge it. There *is* a per-portal cutover — the moment a domain starts serving the new build — and there is a reversal path. What does not exist is the staged, gated migration the phrase was meant to rule out. D-38b describes the actual mechanism.

**What follows:**

- **Missing features do not block anything** (D-20). A page can ship incomplete and gain features later.
- **The route inventory is a build order, not a contract** (D-37).
- **Deferring error monitoring stays defensible** (D-32), but on the strength of D-38b's reversal path rather than on a claim that no cutover occurs.

Vue 2 and Vue 3 do not share live component packages; reuse API contracts, observed behavior, test cases, terminology, and visual references instead.

### D-38b — Domain lifecycle: test on a second domain, cut over, keep the old build reachable

**Decided.** Each portal moves through four stages:

1. **Testing** — the new build is served on a separate domain while the production domain continues to serve the existing Vue 2 build. Both are live and public-facing at once.
2. **Cutover** — the new build takes over the production domain (`hugeamp.org` for CMD, `<portal>.hugeamp.org` for the others, per D-04a). The previous production build moves to `old.<domain>` and stays running.
3. **Reference** — the old build remains reachable at `old.<domain>` for as long as it is useful. Routes not yet rebuilt are still available there.
4. **Decommission** — when the old version is no longer maintained, a final snapshot is built and the old platform and server are decommissioned.

**This is the reversal path, and it is why no separate rollback tooling is needed.** The old build is not an archived artifact to be redeployed under pressure; it is a running deployment at a known address. Reversing a bad cutover means pointing the production domain back at something already serving traffic — an nginx or DNS change, not a rebuild.

**Consequences.**

- **Keep the reversal genuinely available.** The value depends on `old.<domain>` staying deployed and functional through a meaningful soak period after each cutover, not being torn down the same week. Worth stating in the runbook whenever one is written.
- **Unbuilt routes must redirect, not 404.** A bookmarked or inbound-linked URL on the production domain does not know the old build moved. At cutover, configure nginx so any path the new build does not serve falls through to a redirect at the same path on `<portal>.old.hugeamp.org`. This is one rule per portal, it is what makes "routes are still reachable" true for real visitors rather than only for people who know the old domain exists, and it doubles as a passive inventory — the redirect log is a live record of which unbuilt routes still have traffic.
- **It softens the "unbuilt routes disappear" concern.** During stage 3 those routes are reachable at `<portal>.old.hugeamp.org` — and with the redirect rule above, reachable at their original URLs. Stage 4's snapshot preserves them beyond that, subject to the dependency gate below.
- **The stage-4 snapshot is only as alive as its upstream services — gate decommission on this.** The old build fetches the CMS (and BioIndex) at runtime, so a static file snapshot of it still depends on those services: snapshot the files, retire the CMS, and every CMS-composed page in the snapshot is a broken shell. An adversarial review caught this contradiction between the preservation claim here and CMS retirement under D-07/D-07b. Two acceptable resolutions, chosen per portal at stage 4: keep the CMS (read-only) alive for as long as the snapshot is expected to work, or **flatten** — crawl the CMS-dependent pages to self-contained static HTML before decommissioning anything. Either way, the gate is: *prove the snapshot renders with retired services unavailable before retiring them.*
- **Stage 1 domain naming, decided: `<portal>.next.hugeamp.org`** — `cmd.next.hugeamp.org`, `msk.next.hugeamp.org`, and so on. The portal label comes first specifically so a single wildcard certificate for `*.next.hugeamp.org` covers every portal's testing domain; the reverse order (`next.<portal>.hugeamp.org`) would need a certificate per portal, since a wildcard matches only one label.
- **Stage 3 domain naming, decided: `<portal>.old.hugeamp.org`** — mirroring stage 1 for the same wildcard-certificate reason (`*.old.hugeamp.org` covers every portal). The portal lifecycle reads `<portal>.next.hugeamp.org` → production domain → `<portal>.old.hugeamp.org`.
- **Stage 4 is a separate, later event** from cutover. Decommissioning the old platform is not triggered by the last cutover but by the old version ceasing to be maintained (D-38a sets no date for either).

### D-38a — "Proven" means every necessary portal has a new version

**Decided.** The old setup is retired once all the necessary portals have new versions built in the new framework. Retirement is gated on portal coverage, not on per-route parity, traffic thresholds, or a feature checklist.

This is consistent with D-20: a portal counts as having a new version when it exists and serves, not when it matches the old one feature for feature. Missing features are added as the project evolves.

**A distinction worth stating explicitly.** This defines when the *old setup* is retired, not when an *individual portal* goes live. Portals cut over independently on their own schedules (D-38b); the old repository, its branches, and its build infrastructure are retired only when the last necessary portal has been rebuilt.

**No cutoff date.** Old-repository maintenance is open-ended. There is no deadline by which portals must be rebuilt and no date at which the old setup stops being supported. Retirement happens when the work is done, however long that takes. This is a deliberate position, not an unresolved one.

**Consequences.**

- **The necessary portal set should still be enumerated.** Not as a deadline, but because it determines CI cost and owner staffing (D-31, D-39). Eleven live portal lines exist beyond `master`. See [O-05](#o-05--disposition-of-the-remaining-portal-lines).
- **The old repository is maintained for the whole buildout**, with no end date. Accepted.

### D-39 — Governance rules

**Decided.** Carried forward unchanged from `brainstorming.md`, with amendments noted:

1. Portal variation lives in portal source, configuration, or an explicit extension contract — never a portal branch.
2. A shared package cannot reference a portal ID (D-05).
3. A feature package owns its domain and API boundary and may provide a default renderer.
4. Portal-specific renderers may share headless logic without being forced into one universal template.
5. Nuxt layer shadowing must be reported and reviewed (D-30).
6. Every shared-package change builds all consuming portals before merge (D-31).
7. Every portal has named owners and critical smoke routes.
8. Pipeline configuration stays thin; repository commands are the source of truth (D-06).
9. Experimental framework options require an ADR and an exit plan.
10. Dependencies are added at the narrowest workspace that consumes them.

---

## Superseded positions

These appear in `brainstorming.md` and no longer hold.

| Superseded position | Superseded by |
| --- | --- |
| "One monorepo or multiple repositories: **Open**", and "decide when the second portal lands" | D-01 — decided: monorepo |
| "Evaluate Nuxt Content Studio" as a v1 blocking evaluation | D-08 — decided: adopted, as a separate editing deployment |
| Fallback of keeping the existing CMS as the runtime content source | D-07 — the CMS is retired |
| "The CMS survives the rewrite" | D-07 — content survives; the CMS does not |
| Shared `research` and `fullscreen` layouts; `default` and `content` portal-owned | D-14 — no shared layouts |
| Proposed initial decision 6, "Nuxt UI for primitives and shared application chrome" | D-14 and D-16 — no shared chrome; primitives only |
| Interim locus-plot handling "deliberately not decided" | D-20 — decided: shipped without, gates nothing |
| Cut over one route group at a time behind a parity gate | D-38 and D-38b — whole-portal cutover, no parity gate |
| A one-time CMS migration with a window and a decommission date | D-07b — repeated per-page imports, CMS authoritative until go-live |
| "The CMS becomes read-only" (an intermediate position) | D-07b — the CMS stays editable until its portal is replaced |
| "There is no cutover event and no rollback" | D-38 and D-38b — per-portal cutover with reversal via `old.<domain>` |
| `apps/a2f` and `apps/hugeamp` as separate applications | D-04 — one application, `apps/cmd`, served at `hugeamp.org` |
| Five discrete spikes A–E | D-35 — foundation-first |
| Spike D as cross-provider byte-equivalence | D-24 and D-25 |
| Error monitoring in v1 (an early answer) | D-32 — deferred |
| CFDE as the version-one second portal | D-04 — MSK is portal two; CFDE disposition is O-15 |

## Corrections of record

Factual errors in `brainstorming.md` worth fixing if it is ever revised:

- **"34 source files reference the CMS host"** is wrong; there are 26 in `src/`. The larger figure appears to have counted a built tree — `portals/` is a gitignored local build directory holding 30 more matches. The argument does not depend on the figure.
- **`https://docs.npmjs.com/misc/workspaces/`** is a legacy meta-refresh stub. Use `https://docs.npmjs.com/cli/v12/using-npm/workspaces/`.
- **The composition-model Mermaid diagram** draws `Routes`, `Layouts`, and `Overrides` as external inputs to the portal application while the prose places all three inside it. Under D-14 the diagram is further out of date.
- **The `apps/` tree lists six portals** while twelve live portal lines exist (`a2fkp`, `adipose_gw`, `cancerkp`, `cfde`, `cfde-liver`, `matkp`, `mouse`, `nephkp`, `pankbase`, `radiant`, `sysbio`, plus `master`). CI cost, owner staffing, and the smoke-route matrix all scale with the real number. D-04 scopes v1 to two portals, but the eventual target set should be enumerated honestly.
- **Nuxt Studio's status** is materially different from what the earlier notes assumed. See D-08.

---

## Open items

Triaged 2026-08-13: only items that gate a foundation milestone or decay irreversibly remain blocking (O-01–O-04). Every other undecided or deferred item moved to the deferred section below with an explicit revisit trigger, and O-10 moved to the closed ledger.

### Blocking

#### O-01 — Sequence and timeboxes for the foundation milestones

The ownership half is resolved by D-35a: all five foundation items belong to the single architect, with AI assistance. What remains is the order and rough timeboxes — still worth writing down even solo, because timeboxes are what keep foundation work from absorbing feature time indefinitely.

A suggested order, following the dependency grain (adjust freely):

1. **Repo + pnpm workspace + Actions + `portal` CLI** — everything else lands inside this.
2. **Application shell** (`portal.config.ts`, theme tokens, layout pattern) — CMD's skeleton.
3. **Data layer** (BioIndex clients, domain types) — needed before the first data-bearing page.
4. **Content pipeline** (collections, schemas, `content:import`, Studio deployment, dump measurement) — needed before the first informational page; includes the O-03 test as its first step.
5. **Prerender-safety conventions** — established concretely when the first browser-only visualization is rebuilt, not speculatively before.

#### O-02 — CMD route inventory and build order

The raw list is mechanically derivable from `vue.config.js`. Ordering the 47 production entries is the part requiring judgment, and D-37 makes it foundation work. Owned by the architect (D-35a). Do it before the Vue 2 application is retired, since the CMS-defined routes cannot be reconstructed afterwards.

#### O-03 — Studio monorepo arrangement

Narrowed by D-08a and D-08b. The instance-count question is answered (one per portal) and the write-flow question is answered (direct commits to a content branch). What remains is one empirical test and one operational decision:

- **Test:** stand up an editing app whose Nuxt Content collections use `source.cwd` pointing at a sibling portal's content directory, with `studio.repository.rootDir` set to that portal's directory. Confirm that reads resolve, that published commits land at `<rootDir>/content/...` rather than a doubled or escaped path, and that media lands at `<rootDir>/public/...`. This is an afternoon's work against a throwaway repository and it de-risks the whole content pipeline.
- **Fallback if the test fails:** move each portal's content to a repository-root `content/<portal>/` tree so each editing app's `rootDir` addresses it directly without an external `cwd`. Costs some colocation; removes the unknown entirely.
- **Operational:** where the per-portal editing deployments run, who operates them, and how they are access-restricted. They are internal-only and do not serve public traffic, so they can sit behind the same nginx with an auth restriction rather than being publicly routable.

#### O-04 — CMS import tooling

The policy questions are closed by D-07b. The CMS stays editable until its portal goes live, there is no migration project, and there is no decommission date. What remains is build work rather than a decision:

- **A repeatable `portal content:import` command.** Runs per page at build time and as often as useful until go-live, overwriting on each run (D-07b). Must filter on publication state (D-07a) and **must sanitize all HTML-bearing fields** (tag/attribute/URL-scheme allowlists, Markdown/MDC conversion where possible — D-07b). Malicious-content fixtures belong in its tests from the first version. A diff of what moved in the CMS since the last run is worth offering but is not a gate.
- **Zod schemas for research-page definitions** that the existing CMS configurations actually validate against. This is the harder half of the content work and the place where the shape of the old data will resist the new model.

Both belong to foundation item 5 (D-35) and are owned by the architect (D-35a).

### Deferred — priority lowered (2026-08-13)

Nothing in this section gates version-one foundation work. Each entry states its revisit trigger; act on the trigger, not the calendar.

#### O-05 — Disposition of the remaining portal lines

Partially resolved: the confirmed rebuild set is **CMD and MSK** (D-04), with CFDE under separate assessment (O-15).

That leaves ten live portal lines with no stated disposition: `a2fkp`, `adipose_gw`, `cancerkp`, `cfde-liver`, `matkp`, `mouse`, `nephkp`, `pankbase`, `radiant`, `sysbio`. (`matkp` is not MSK — MSK is served from `master` with presentation differences, and the `matkp-main` branch is its own line: 582 commits ahead of `master`, deletion-heavy, substantially a trimmed and restyled master.) Each line needs one of three answers eventually: rebuilt in the new framework, retired with the old platform, or kept running on the old platform indefinitely.

**The authoritative registry, fetched from BioIndex `/api/portal/groups` (2026-08-12, prod via `bioindex-ext.hugeamp.org`, confirmed byte-identical in content to dev): 26 disease groups.** These are runtime subdomain variants of the single `master` build (see D-04, "What MSK is") — a third variation mechanism alongside branches and the CMS, and the list that actually sizes the disposition exercise, the CI matrix, and the owner roster:

| Family (`portalGroup`) | Portals |
| --- | --- |
| `md` (default: `md` itself) | `md`, `t2d`, `sleep`, `cd`, `cvd`, `t1d`, `kidney` |
| `ndkp` | `ndkp`, `als` |
| `cancer` | `cancer` |
| ungrouped | `v2f`, `msk`, `lung`, `nage`, `neph`, `a2f`, `aggregator`, `ocular`, `autoimmune`, `reproductive`, `aging`, `vision_genomics`, `private_sleep`, `skin`, `radiant`, `sysbio_kp` |

Caveats and two findings this surfaced:

- **Registry `md` is CMD** (D-04, naming addendum): the flagship is the only portal whose repository ID (`cmd`) diverges from its registry name. The `md` entry is therefore already dispositioned — it is the flagship being rebuilt — and the family row below should be read with that equivalence.
- **Prod and dev registries match exactly** — 26 entries with identical fields in both. Whether every registry entry corresponds to a live, visited deployment is still a disposition question.
- **`private_sleep` is out of scope by decision:** it contains test data and is not an established portal. It is not part of the disposition inventory, leaving **25 registry entries** to disposition. (It was briefly flagged as a challenge to D-34; resolved — see D-34.)
- **The mechanisms overlap.** `radiant`, `sysbio_kp`, `cancer`, and `neph` appear in this runtime registry *and* have their own branches (`radiant-main`, `sysbio-main`, `cancerkp-main`, `nephkp-main`). The disposition inventory is the union of both lists with the overlaps reconciled, not either list alone.

The `md`-family fork this finding raised is resolved by D-27a: the family builds as config variants of the CMD application, not seven separate apps. Disposition still decides which family members are alive at all.

The third answer deserves scrutiny wherever it appears, because D-38a ties old-setup decommissioning to the necessary set being rebuilt — every portal left on the old platform extends old-repository maintenance without an end date. This does not need answering now, but each unrebuilt portal is implicitly choosing that third answer by default.

**Priority lowered (2026-08-13):** not a v1 blocker — the version-one rebuild set is settled (D-04). Revisit trigger: decommission planning under D-38a/D-38b, or whenever old-platform maintenance cost makes the implicit third answer worth confronting deliberately.

#### O-07 — Owned locus-plot rewrite

Deferred by D-20 and gates nothing, but it is still the largest single unknown in the plan and the pages that want it are in the first build group. **Priority lowered (2026-08-13):** revisit trigger is scheduling the first build-group page that needs the plot — size the rewrite then, before that page's work is committed, so the estimate is made when it is actually needed rather than assumed.

#### O-08 — Nuxt 5 upgrade window

D-29 pins the 4.x minor line and schedules an upgrade window. Nuxt 5 has not shipped and has no announced date, so the window is currently a placeholder to revisit when a release candidate appears.

#### O-09 — Error monitoring tool and owner

Deferred by D-32. Revisit together with D-33, since neither is useful without the other. **Priority lowered (2026-08-13):** revisit trigger is the first production cutover, when the accepted silent-failure risk (D-33) starts accruing against real users.

#### O-14 — Shared Nuxt Content collections across applications

Content collections are configured per application in `content.config.ts`, and sharing one collection across sibling applications in a monorepo is not a documented upstream pattern. D-07 raises the stakes, since all content now lives in Content. **Priority lowered (2026-08-13):** not separately scheduled — the O-03 test exercises the same external-`cwd` mechanism and will confirm or refute it in passing, and a design-around exists (per-application collections reading a shared source directory). Resolve it inside foundation item 5, not as its own effort.

#### O-15 — CFDE disposition: monorepo or separate repository

CFDE was dropped as portal two in favour of MSK (D-04), with an open question of whether it belongs in the monorepo at all or in a separate repository, on the view that it has little in common with the other portals.

**What the branch evidence says.** Checked against `origin/cfde-main` (308 commits ahead of `master`, 121 behind):

- **The dependency stack is the same.** Its `package.json` differences are version-range formatting, a swap of `marked` for `showdown`, additions of `lodash` and Jest tooling, and one extra script. It keeps `locuszoom`, `vis-network`, `d3`, `@amcharts/amcharts4`, BootstrapVue — the whole shared stack.
- **The page set is the standard portal set.** 44 build entries against master's 49, with the same names — `phenotype`, `region`, `variant`, `gene`, `research`, the PIGEAN suite. No view directory exists on the CFDE branch that does not exist on `master`, and none was removed.
- **The divergence is churn inside shared views, not separate structure.** The 531 changed files concentrate in `views/CVDI_Pigean`, `views/PIGEAN`, `views/Gene`, `components/researchPortal` — shared pages modified on a branch that is 121 commits behind, which is drift, not difference. Its genuinely unique code is presentation: `cfdeLanding`, `cfdeEcoSystem`, `cfdePhenotypeXing`, `ResearchSingleSearchCFDE`, and the NCATS component suite.

**The part the repository cannot show, confirmed separately:** CFDE's real weight is in **CMS-authored content and the `researchPortal` component system**. Its pages are substantially runtime compositions — CMS page definitions rendered by the shared `researchPortal` components — so the branch diff understates CFDE's actual divergence, because most of what makes CFDE *CFDE* lives in CMS records rather than in Git.

**Assessment.** Both halves of the evidence point the same way. The code CFDE runs on is shared — same BioIndex data model, same visualization stack, same page set, and the `researchPortal` renderer system is shared machinery from `master`, not CFDE's own. What is unique to CFDE is CMS-authored page composition plus presentation components, and under this architecture both of those become products of the shared pipeline: page definitions become Nuxt Content data collections (D-07), and the renderer set becomes the shared section library (D-14). A portal whose identity is mostly configuration-plus-content is the *strongest* case for the monorepo, not the weakest — a separate repository would need to import or duplicate the section library and the content pipeline, recreating the coordination problem for the portal that depends on shared machinery most.

**The sequencing consequence, which is the practically important one.** CFDE cannot be rebuilt early even if wanted: its pages need the research-page section library and the content schemas to exist and be reasonably mature first. Dropping it as portal two is therefore right for a second reason beyond divergence — it depends on the most foundation. Its natural slot is after CMD has forced the section library into existence.

**Recommendation:** plan CFDE as a monorepo portal, scheduled after the section library and content schemas mature, and decided finally when its rebuild is scheduled. If a governance reason emerges by then (separate funder requirements, its own release approval), D-01 already names that as legitimate grounds to separate.

**Priority lowered (2026-08-13):** the recommendation above is the working plan; the final decision is deliberately deferred to when the CFDE rebuild is scheduled. Nothing to do until then.

### Closed — ledger

Kept so the numbering stays audit-clean.

- **O-06** — closed by D-39: the sandbox template is generated from the monorepo by the `portal` CLI, never maintained by hand.
- **O-13** — closed by D-31b as *not adopted*: no visual regression testing in v1.
- **O-11, O-12** — never assigned; the numbers do not appear in this register or its history, and the gap is not a lost item.

#### O-10 — CSP: closed, no CSP in v1

**Decided: no CSP in v1**, matching the current portals, which ship none. Closed as decided rather than pending.

What was learned before deferring, so it isn't relearned later: `nuxt-security` was evaluated and covers less than expected under this hosting model. With static files served by nginx (D-12) its header machinery never runs; what it can do is bake a `<meta http-equiv>` CSP and inline-script hashes into the prerendered HTML (`ssg: { hashScripts: true }`). Report-only mode cannot be delivered via meta tag at all — that is a browser restriction — so any future rollout needs nginx to own the authoritative header, run it as `Content-Security-Policy-Report-Only` first, and enforce once reports go quiet, with `wasm-unsafe-eval` allowed for Nuxt Content's browser SQLite (D-10). When someone picks this up, that hybrid is the starting design.

---

## Immediate next actions

1. Confirm the foundation sequence and set rough timeboxes (O-01, D-35a). Ownership is resolved — single architect with AI assistance; contributors join later at the feature level only.
2. Generate the CMD route inventory from `vue.config.js` and put it in build order (O-02, D-37). Time-sensitive: the CMS-defined routes cannot be reconstructed once the Vue 2 application is retired.
3. Build the repeatable `portal content:import` command (O-04, D-07b). Overwrites per run; publication-state filter included.
4. Stand up a throwaway Studio deployment against a test repository to answer the `rootDir` and Git-write-flow questions (O-03, D-08).
5. Measure the per-collection WASM SQLite dump size against a realistic content set (D-10, foundation item 5).
6. Confirm the MSK requirements with its owners, since it replaced CFDE as portal two (D-04). Its presentation delta is now located and scoped — disease-group record, stylesheet block, phenotype subset — so `apps/msk` can be estimated directly.
7. Disposition of the remaining portal lines is deferred (O-05) — revisit at decommission planning (D-38a/D-38b), enumerating deployed portals rather than branches; each one left undecided implicitly extends old-platform maintenance.
8. Convert this document into per-area ADRs once owners are assigned, keeping the `D-nn` identifiers stable as cross-references.

## Reference documentation

- [Nuxt 4 layers](https://nuxt.com/docs/4.x/getting-started/layers)
- [Nuxt 4 layouts](https://nuxt.com/docs/4.x/directory-structure/app/layouts)
- [Nuxt configuration](https://nuxt.com/docs/4.x/getting-started/configuration)
- [Nuxt deployment modes](https://nuxt.com/docs/4.x/getting-started/deployment)
- [Nuxt testing example](https://nuxt.com/docs/4.x/examples/advanced/testing)
- [Nuxt UI](https://ui.nuxt.com/docs/getting-started)
- [Nuxt Content collections](https://content.nuxt.com/docs/collections/define)
- [Nuxt Content configuration](https://content.nuxt.com/docs/getting-started/configuration)
- [Nuxt Content database architecture](https://content.nuxt.com/docs/advanced/database)
- [Nuxt Content static hosting](https://content.nuxt.com/docs/deploy/static)
- [Nuxt Studio is now open source](https://content.nuxt.com/blog/studio-oss)
- [Nuxt Studio setup](https://nuxt.studio/setup)
- [Pinia with Nuxt](https://pinia.vuejs.org/ssr/nuxt.html)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [npm workspaces](https://docs.npmjs.com/cli/v12/using-npm/workspaces/)
