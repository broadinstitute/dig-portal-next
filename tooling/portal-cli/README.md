# Portal CLI

## Affected portals

`pnpm portal affected <manifest-directory>` prints one affected application ID per line. The directory contains `<portal-id>.json` files from the **last successful build** for the relevant environment; each must include the portal ID and full Git commit SHA:

```json
{ "portal": "cmd", "commit": "0123456789abcdef0123456789abcdef01234567" }
```

The caller must retain the previous manifest if a build fails or is skipped. A portal without a manifest is selected for its first build; a previous commit outside the current history also selects that portal. Missing commits or malformed manifests fail explicitly. The checkout must be clean, including untracked files, and contain the required history; keep downloaded manifests outside the checkout or in an ignored directory.

Selection uses pnpm's workspace dependency graph and compares each portal with its own manifest. Changes outside application, package, and layer workspaces rebuild every portal. Documentation means the root `docs/`, each workspace package's `docs/`, and conventional root or package-root `README.md`, `AGENTS.md`, `CHANGELOG.md`, and `CONTRIBUTING.md` files. Nuxt Content and public files are never treated as documentation; other files are conservatively considered build inputs. Documentation directories must not be used as application content sources.

This command currently selects application directories only; CMD variants and artifact packaging are not implemented yet.

## Dependency boundaries

`pnpm portal validate` enforces D-05 for shared packages and layers. It checks
manifest dependencies, explicit script imports, Vue external block `src`
attributes (template, script, styles and custom blocks), static CSS `@import`
targets in `.css` files and inline Vue CSS styles, and `import.meta.glob` macros
in JS/TS/JSX/TSX files and Vue scripts. Relative/absolute paths,
file URLs, application package names and app-relative Nuxt aliases are checked.
Vue sources are parsed with a direct, exact-pinned `@vue/compiler-sfc` dependency;
malformed SFCs fail validation. CSS uses directly pinned PostCSS/value parsers,
including quoted targets, `url(...)`, import modifiers and escaped target paths.
CSS must be parsable by the pinned parser; parse failures fail validation.
The source scan skips generated output
and dependency directories, and does not follow symlinked source trees.

Glob analysis parses literal strings/arrays and path-affecting options without
executing source. Relative patterns and relative `base` paths are matched
against existing application files, respecting negative patterns, braces,
`exhaustive` and `caseSensitive`. It does not expand patterns elsewhere on the
computer. Application metadata scanning excludes dependency/Git directories and
does not follow symlinks. Malformed scripts, nonliteral glob inputs/options,
app-root patterns and configured aliases report errors requiring review rather
than silently passing. Custom alias resolution is not simulated.

This is partial static enforcement. Nuxt auto-imports, config strings,
Sass/Less and other non-CSS style languages, directives other than `@import`,
computed references outside these macros, other script languages, symlinked
sources, dependency-tree references and portal-ID branching
still need review. A green validation result does not prove their absence.

## CMD development output

Use `pnpm portal dev cmd` to start CMD. Its app script selects the `portalDev`
Nuxt environment and writes generated development files to `apps/cmd/.nuxt-dev`.
`prepare` and `typecheck` use `.nuxt`; they generate preparation-only Nuxt Content
manifests without collection dumps. Sharing that directory with a running dev
server can make the catalog endpoint return an empty response. The separate,
ignored dev directory keeps validation from overwriting or clearing live Content
artifacts. Production generation retains Nuxt's normal build directory behavior.

Restart servers started before this isolation change once so they pick up the
updated `dev` script. A page reload clears any failed client-side Content load.

## CMD definition and content validation

`pnpm portal build cmd` runs CMD's `validate-content` script before generation.
The guard first validates `portal.config.ts` against the app-owned
`portal.schema.ts`, then validates the imported effector catalog. Invalid config
or content stops the build before generation. `PortalDefinition` is inferred
from that schema and re-exported by `portal.config.ts` through type-only imports;
the schema does not become a runtime import through the public config.

The current base-definition contract checks identity/registry IDs, nonblank
title and labels, a Boolean import flag, unique feature names, positive finite
PIGEAN sigma, one gene-set collection identifier and navigation to root-relative
paths, fragments or credential-free HTTP(S) URLs. Unknown fields are rejected.
The base portal ID must match the application directory. This is CMD's contract,
not a shared requirement for other applications. Variant-selected definitions
and artifact identities still need D-27a-aware validation when variants are built.
