import assert from "node:assert/strict";
import {
    existsSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { affectedPortals } from "../src/affected.mjs";
import { validateDependencyDirection } from "../src/boundaries.mjs";
import {
    discoverPackages,
    main,
    runSharedPackageScripts,
    validateWorkspace,
} from "../src/cli.mjs";
import { importEffectorCatalog } from "../src/content-import.mjs";
import { validateLayerSources } from "../src/layer-sources.mjs";

function createWorkspace(t) {
    const root = mkdtempSync(path.join(os.tmpdir(), "portal-cli-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));

    writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({
            private: true,
            packageManager: "pnpm@10.30.3",
        }),
    );
    writeFileSync(
        path.join(root, "pnpm-workspace.yaml"),
        [
            "packages:",
            "  - apps/*",
            "  - packages/*",
            "  - layers/*",
            "  - tooling/*",
            "",
        ].join("\n"),
    );

    return root;
}

function createPackage(root, workspace, directory, manifest) {
    const packageDir = path.join(root, workspace, directory);
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
        path.join(packageDir, "package.json"),
        JSON.stringify(manifest),
    );
}

function writeFixture(root, relative, contents) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
}

function git(root, ...args) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function commitFixture(root, message) {
    git(root, "add", "--all");
    git(
        root,
        "-c",
        "user.name=Portal Test",
        "-c",
        "user.email=portal-test@example.invalid",
        "commit",
        "--quiet",
        "-m",
        message,
    );
    return git(root, "rev-parse", "HEAD");
}

function createAffectedFixture(t, mskDependsOnShared = false) {
    const root = createWorkspace(t);
    const manifests = mkdtempSync(path.join(os.tmpdir(), "portal-manifests-"));
    t.after(() => rmSync(manifests, { recursive: true, force: true }));
    createPackage(root, "apps", "cmd", {
        name: "@dig-portal/cmd",
        dependencies: { "@dig-portal/shared": "workspace:*" },
    });
    createPackage(root, "apps", "msk", {
        name: "@dig-portal/msk",
        ...(mskDependsOnShared && {
            dependencies: { "@dig-portal/shared": "workspace:*" },
        }),
    });
    createPackage(root, "packages", "shared", {
        name: "@dig-portal/shared",
        version: "1.0.0",
    });
    writeFixture(root, "packages/shared/index.js", "export const value = 1;\n");
    writeFixture(root, "apps/msk/docs/notes.md", "# Notes\n");
    writeFixture(root, "apps/msk/content/README.md", "# Published content\n");
    writeFixture(root, "docs/status.md", "# Status\n");
    git(root, "init", "--quiet", "-b", "main");
    const baseline = commitFixture(root, "fixture baseline");
    return { root, manifests, baseline };
}

function writeManifest(directory, portal, commit) {
    writeFileSync(
        path.join(directory, `${portal}.json`),
        JSON.stringify({ portal, commit }),
    );
}

test("validates the workspace and unique package names", (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "tooling", "portal-cli", {
        name: "@dig-portal/portal-cli",
    });

    assert.deepEqual(validateWorkspace(root), []);
    assert.deepEqual(
        discoverPackages(root)
            .map(({ manifest }) => manifest.name)
            .sort(),
        ["@dig-portal/cmd", "@dig-portal/portal-cli"],
    );
});

test("reports duplicate workspace package names", (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "cmd", { name: "@dig-portal/cmd" });

    assert.match(validateWorkspace(root).join("\n"), /declared in both/);
});

test("requires every declared workspace root", (t) => {
    const root = createWorkspace(t);
    writeFileSync(
        path.join(root, "pnpm-workspace.yaml"),
        "packages:\n  - apps/*\n",
    );

    assert.match(
        validateWorkspace(root).join("\n"),
        /must include packages\/\*/,
    );
});

test("runs portal scripts with forwarded arguments and underscore IDs", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", {
        name: "@dig-portal/cmd",
        scripts: {
            "validate-content": 'node -e "process.exit(0)"',
            build: "node build.mjs",
        },
    });
    createPackage(root, "apps", "vision_genomics", {
        name: "@dig-portal/vision_genomics",
        scripts: { typecheck: 'node -e "process.exit(0)"' },
    });
    const app = path.join(root, "apps", "cmd");
    writeFileSync(
        path.join(app, "build.mjs"),
        "import { writeFileSync } from 'node:fs'; writeFileSync('args.json', JSON.stringify(process.argv.slice(2)));\n",
    );

    assert.equal(
        await main(["build", "cmd", "--example", "two words"], root),
        0,
    );
    assert.deepEqual(
        JSON.parse(readFileSync(path.join(app, "args.json"), "utf8")),
        ["--example", "two words"],
    );
    assert.equal(await main(["typecheck", "vision_genomics"], root), 0);
});

test("rejects unknown portals, missing scripts, and invalid portal IDs", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });

    assert.equal(await main(["build", "unknown"], root), 1);
    assert.equal(await main(["build", "cmd"], root), 1);
    assert.equal(await main(["build", "../cmd"], root), 2);
});

test("propagates a failing portal script", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", {
        name: "@dig-portal/cmd",
        scripts: { typecheck: 'node -e "process.exit(7)"' },
    });

    assert.notEqual(await main(["typecheck", "cmd"], root), 0);
});

test("blocks a portal build when its content validation fails", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", {
        name: "@dig-portal/cmd",
        scripts: {
            "validate-content": 'node -e "process.exit(7)"',
            build: "node build.mjs",
        },
    });
    const app = path.join(root, "apps", "cmd");
    writeFileSync(
        path.join(app, "build.mjs"),
        "import { writeFileSync } from 'node:fs'; writeFileSync('built.txt', 'yes');\n",
    );

    assert.notEqual(await main(["build", "cmd"], root), 0);
    assert.equal(existsSync(path.join(app, "built.txt")), false);
});

test("requires a nonempty content validation script before building a portal", async (t) => {
    const root = createWorkspace(t);
    const app = path.join(root, "apps", "cmd");
    for (const validation of [undefined, "   "]) {
        createPackage(root, "apps", "cmd", {
            name: "@dig-portal/cmd",
            scripts: {
                "validate-content": validation,
                build: "node build.mjs",
            },
        });
        writeFileSync(
            path.join(app, "build.mjs"),
            "import { writeFileSync } from 'node:fs'; writeFileSync('built.txt', 'yes');\n",
        );

        assert.equal(await main(["build", "cmd"], root), 1);
        assert.equal(existsSync(path.join(app, "built.txt")), false);
    }
});

test("runs shared package scripts without running application scripts", (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", {
        name: "@dig-portal/cmd",
        scripts: { test: 'node -e "process.exit(7)"' },
    });
    createPackage(root, "packages", "shared", {
        name: "@dig-portal/shared",
        scripts: { test: "node test.mjs" },
    });
    const packageDir = path.join(root, "packages", "shared");
    writeFileSync(
        path.join(packageDir, "test.mjs"),
        "import { writeFileSync } from 'node:fs'; writeFileSync('ran.txt', 'ok');\n",
    );

    assert.equal(runSharedPackageScripts(root, "test"), 0);
    assert.equal(readFileSync(path.join(packageDir, "ran.txt"), "utf8"), "ok");
});

test("selects graph dependents without treating content Markdown as documentation", async (t) => {
    const { root, manifests, baseline } = createAffectedFixture(t);
    writeFixture(root, "packages/shared/index.js", "export const value = 2;\n");
    writeFixture(root, "apps/msk/docs/notes.md", "# Updated notes\n");
    const sharedCommit = commitFixture(root, "shared code and documentation");
    writeManifest(manifests, "cmd", baseline);
    writeManifest(manifests, "msk", baseline);

    assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), [
        "cmd",
    ]);
    const log = t.mock.method(console, "log", () => {});
    assert.equal(await main(["affected", manifests], root), 0);
    assert.deepEqual(
        log.mock.calls.map(({ arguments: args }) => args[0]),
        ["cmd"],
    );
    log.mock.restore();

    writeFixture(
        root,
        "apps/msk/content/README.md",
        "# Updated published content\n",
    );
    const contentCommit = commitFixture(root, "update content");
    writeManifest(manifests, "cmd", sharedCommit);
    assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), [
        "msk",
    ]);

    writeManifest(manifests, "msk", contentCommit);
    writeFixture(root, "apps/msk/app/pages/guide.md", "# Page source\n");
    const pageCommit = commitFixture(root, "add Markdown page source");
    assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), [
        "msk",
    ]);

    writeManifest(manifests, "msk", pageCommit);
    writeFixture(
        root,
        "apps/msk/content/docs/topic.md",
        "# Content under docs\n",
    );
    commitFixture(root, "add content under docs");
    assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), [
        "msk",
    ]);
});

test("compares each portal to its own last successful build", (t) => {
    const { root, manifests, baseline } = createAffectedFixture(t, true);
    writeFixture(root, "packages/shared/index.js", "export const value = 2;\n");
    const newer = commitFixture(root, "change shared package");
    writeManifest(manifests, "cmd", newer);
    writeManifest(manifests, "msk", baseline);

    assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), [
        "msk",
    ]);
});

test("ignores documentation-only changes and rebuilds all portals for global changes", (t) => {
    const { root, manifests, baseline } = createAffectedFixture(t);
    writeManifest(manifests, "cmd", baseline);
    writeManifest(manifests, "msk", baseline);
    writeFixture(root, "docs/status.md", "# Updated status\n");
    writeFixture(root, "apps/msk/docs/notes.md", "# Updated notes\n");
    commitFixture(root, "documentation only");
    assert.deepEqual(
        affectedPortals(root, discoverPackages(root), manifests),
        [],
    );

    writeFixture(root, "pnpm-lock.yaml", "lockfileVersion: 9\n");
    commitFixture(root, "global lockfile");
    assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), [
        "cmd",
        "msk",
    ]);
});

test("handles first builds and rejects malformed manifests and dirty worktrees", (t) => {
    const { root, manifests, baseline } = createAffectedFixture(t);
    assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), [
        "cmd",
        "msk",
    ]);
    writeManifest(manifests, "cmd", baseline);
    assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), [
        "msk",
    ]);

    writeFileSync(
        path.join(manifests, "msk.json"),
        '{"portal":"msk","commit":"short"}',
    );
    assert.throws(
        () => affectedPortals(root, discoverPackages(root), manifests),
        /full commit SHA/,
    );
    writeManifest(manifests, "msk", "f".repeat(40));
    assert.throws(
        () => affectedPortals(root, discoverPackages(root), manifests),
        /git failed/,
    );
    writeFixture(root, "apps/cmd/untracked.js", "export const value = 1;\n");
    assert.throws(
        () => affectedPortals(root, discoverPackages(root), manifests),
        /clean working tree/,
    );
});

test("rebuilds a portal whose previous build is not an ancestor of HEAD", (t) => {
    const { root, manifests, baseline } = createAffectedFixture(t);
    writeFixture(root, "packages/shared/index.js", "export const value = 2;\n");
    const otherBranch = commitFixture(root, "different history");
    git(root, "switch", "--quiet", "--detach", baseline);
    writeFixture(root, "apps/msk/content/README.md", "# Divergent content\n");
    const head = commitFixture(root, "divergent history");
    writeManifest(manifests, "cmd", otherBranch);
    writeManifest(manifests, "msk", head);

    assert.deepEqual(affectedPortals(root, discoverPackages(root), manifests), [
        "cmd",
    ]);
});

test("imports only published public effector lists and preserves the previous file on failure", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    const app = path.join(root, "apps", "cmd");
    const csv = [
        "Trait ID,Effector list name,Title,Citation,PMID,Page ID",
        "CAD; T2D,<script>alert(1)</script>List,<img src=x onerror=alert(1)>Title,<a href=javascript:alert(1)>Citation</a>,123,page_1",
        "CAD2,Other,Other title,Other citation,,page_2",
        ",Excluded,Title,Citation,,page_3",
    ].join("\n");
    const attributes = {
        status: true,
        field_page_mode: "public",
        field_page_id: "egl_241",
        field_data_type: "direct_csv",
        field_data_points: csv,
    };
    const fetch = async (url) => {
        assert.equal(url.searchParams.get("filter[field_page_id]"), "egl_241");
        assert.match(
            url.searchParams.get("fields[node--research_page]"),
            /status/,
        );
        return Response.json({ data: [{ attributes }] });
    };

    const result = await importEffectorCatalog(app, fetch);
    const saved = readFileSync(result.destination, "utf8");
    const catalog = JSON.parse(saved);
    assert.equal(result.imported, 2);
    assert.equal(result.skipped, 1);
    assert.deepEqual(catalog.entries[0], {
        traitIds: ["CAD", "T2D"],
        name: "List",
        title: "Title",
        citation: "Citation",
        pmid: "123",
        pageId: "page_1",
    });
    assert.equal(
        catalog.entries.filter(({ traitIds }) => traitIds.includes("CAD"))
            .length,
        1,
    );

    attributes.status = false;
    await assert.rejects(importEffectorCatalog(app, fetch), /unpublished/);
    assert.equal(readFileSync(result.destination, "utf8"), saved);
    attributes.status = true;
    attributes.field_page_mode = "dev";
    await assert.rejects(importEffectorCatalog(app, fetch), /not public/);
    assert.equal(readFileSync(result.destination, "utf8"), saved);
    attributes.field_page_mode = "public";
    attributes.field_data_points = csv.replace("page_1", "javascript:alert(1)");
    await assert.rejects(importEffectorCatalog(app, fetch));
    assert.equal(readFileSync(result.destination, "utf8"), saved);
});

test("requires explicit pre-go-live permission before fetching legacy content", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    let requests = 0;
    globalThis.fetch = async () => {
        requests += 1;
        return Response.json({
            data: [
                {
                    attributes: {
                        status: true,
                        field_page_mode: "public",
                        field_page_id: "egl_241",
                        field_data_type: "direct_csv",
                        field_data_points:
                            "Trait ID,Effector list name,Title,Citation,PMID,Page ID\nCAD,List,Title,Journal,123,page_1",
                    },
                },
            ],
        });
    };

    for (const enabled of [undefined, false, true]) {
        const root = createWorkspace(t);
        createPackage(root, "apps", "cmd", {
            name: "@dig-portal/cmd",
            type: "module",
            scripts: { "validate-content": "node validate.mjs" },
        });
        const app = path.join(root, "apps", "cmd");
        const property =
            enabled === undefined
                ? ""
                : `legacyContentImportEnabled: ${enabled}`;
        writeFileSync(
            path.join(app, "portal.config.ts"),
            `export default { ${property} };\n`,
        );

        assert.equal(
            await main(["content:import", "cmd", "effector-genes"], root),
            enabled ? 0 : 1,
        );
        assert.equal(
            existsSync(
                path.join(app, "content", "effector-lists", "catalog.json"),
            ),
            enabled === true,
        );
    }
    assert.equal(requests, 1);
});

test("rejects shared-package dependencies on application packages", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "shared", {
        name: "@dig-portal/shared",
        dependencies: {
            "@dig-portal/cmd": "workspace:*",
            alias: "file:../../apps/cmd",
        },
    });
    writeFileSync(
        path.join(root, "packages", "shared", "index.ts"),
        "export const value = 1;\n",
    );

    const errors = await validateDependencyDirection(
        root,
        discoverPackages(root),
    );
    assert.equal(errors.length, 2);
    assert.match(errors.join("\n"), /@dig-portal\/cmd/);
    assert.match(errors.join("\n"), /alias/);
    assert.equal(await main(["validate"], root), 1);
});

test("rejects application imports in TypeScript and Vue shared code", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    createPackage(root, "layers", "platform", { name: "@dig-portal/platform" });
    writeFileSync(
        path.join(root, "apps", "cmd", "data.ts"),
        "export type Data = string; export const data = 1;\n",
    );
    mkdirSync(path.join(root, "apps", "cmd", ".nuxt"));
    writeFileSync(
        path.join(root, "apps", "cmd", ".nuxt", "generated.ts"),
        "export const generated = 1;\n",
    );
    writeFileSync(
        path.join(root, "packages", "shared", "index.ts"),
        "import type { Data } from '../../apps/cmd/data';\nexport { data } from '@dig-portal/cmd/private';\nexport { generated } from '../../apps/cmd/.nuxt/generated';\nexport const load = () => import('~/composables/example');\nexport { value } from '#shared/example';\nexport type Value = Data;\n",
    );
    writeFileSync(
        path.join(root, "layers", "platform", "Example.vue"),
        "<script setup lang=\"ts\">import { data } from '../../apps/cmd/data';</script>\n",
    );

    const errors = await validateDependencyDirection(
        root,
        discoverPackages(root),
    );
    assert.equal(errors.length, 6);
    assert.match(errors.join("\n"), /index\.ts.*\.\.\/\.\.\/apps\/cmd\/data/);
    assert.match(errors.join("\n"), /@dig-portal\/cmd\/private/);
    assert.match(errors.join("\n"), /apps\/cmd\/\.nuxt\/generated/);
    assert.match(errors.join("\n"), /~\/composables\/example/);
    assert.match(errors.join("\n"), /#shared\/example/);
    assert.match(errors.join("\n"), /Example\.vue.*apps\/cmd\/data/);
});

test("rejects application references in external Vue blocks", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    createPackage(root, "layers", "platform", { name: "@dig-portal/platform" });
    writeFixture(root, "apps/cmd/data.ts", "export const value = 1;\n");
    writeFixture(root, "apps/cmd/template.html", "<p>Application template</p>\n");
    writeFixture(root, "packages/shared/External.vue", [
        '<template src="../../apps/cmd/template.html"></template>',
        '<script src="../../apps/cmd/data.ts"></script>',
        '<style src="~/app.css"></style>',
        '<style scoped src="@dig-portal/cmd/private.css"></style>',
        '<i18n src="#shared/messages.json"></i18n>',
    ].join("\n"));
    writeFixture(root, "layers/platform/External.vue", `<template src="${path.join(root, "apps/cmd/template.html").replaceAll("\\", "/")}"></template>`);
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 6);
    assert.match(errors.join("\n"), /External\.vue.*template.*apps\/cmd\/template/);
    assert.match(errors.join("\n"), /External\.vue.*script.*apps\/cmd\/data/);
    assert.match(errors.join("\n"), /External\.vue.*style.*~\/app\.css/);
    assert.match(errors.join("\n"), /External\.vue.*style.*@dig-portal\/cmd\/private\.css/);
    assert.match(errors.join("\n"), /External\.vue.*i18n.*#shared\/messages/);
    assert.equal(await main(["validate"], root), 1);
});

test("allows shared external Vue blocks and ignores comments and generated dependency trees", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    writeFixture(root, "packages/shared/local.html", "<p>Shared template</p>\n");
    writeFixture(root, "packages/shared/local.ts", "export const value = 1;\n");
    writeFixture(root, "packages/shared/Allowed.vue", '<!-- <style src="../../apps/cmd/private.css"></style> -->\n<template src="./local.html"></template>\n<script src="./local.ts"></script>\n<style src="./local.css"></style>');
    for (const directory of ["node_modules", ".nuxt-dev", ".output", ".data", "dist"]) {
        writeFixture(root, `packages/shared/${directory}/Ignored.vue`, '<template src="~/private.html"></template>');
    }
    assert.deepEqual(await validateDependencyDirection(root, discoverPackages(root)), []);
});

test("fails dependency validation when a shared Vue source cannot be parsed", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    writeFixture(root, "packages/shared/Broken.vue", "<template><div></template>");
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.match(errors.join("\n"), /Broken\.vue cannot be parsed/);
});

test("rejects application CSS imports including url functions, modifiers and escaped paths", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    const appCss = path.join(root, "apps/cmd/private.css");
    writeFixture(root, "apps/cmd/private.css", "a { color: red; }\n");
    writeFixture(root, "packages/shared/imports.css", [
        '@import "../../apps/cmd/private.css";',
        '@import url(../../apps/cmd/private.css);',
        '@import url("../../apps/cmd/private.css") layer(component) supports(display: grid) screen;',
        '@IMPORT "~~/assets/private.css";',
        '@import "@dig-portal/cmd/private.css";',
        String.raw`@import "@dig-portal/\63 md/private.css";`,
        String.raw`@import u\72l("@dig-portal/cmd/private.css");`,
        String.raw`@import "..\2f ..\2f apps\2f cmd\2f private.css";`,
        `@import "${pathToFileURL(appCss).href}";`,
        `@import "${appCss.replaceAll("\\", "/")}";`,
    ].join("\n"));
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 10, errors.join('\n'));
    assert.match(errors.join("\n"), /imports\.css.*CSS @import.*apps\/cmd\/private/);
    assert.match(errors.join("\n"), /CSS @import.*~~\/assets/);
    assert.equal(errors.filter((error) => error.includes('@dig-portal/cmd/private.css')).length, 3);
    assert.equal(await main(["validate"], root), 1);
});

test("rejects application imports inside every inline CSS Vue style block", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "layers", "platform", { name: "@dig-portal/platform" });
    writeFixture(root, "layers/platform/Styled.vue", [
        '<template><div>Shared</div></template>',
        '<style scoped>@import "~/private.css";</style>',
        '<style lang="css">@import url("#shared/private.css");</style>',
        '<style lang="CSS">@import "@dig-portal/cmd/private.css";</style>',
    ].join("\n"));
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 3);
    assert.match(errors.join("\n"), /Styled\.vue.*CSS @import.*#shared\/private/);
});

test("allows shared and remote CSS imports, ignoring declaration strings, comments and generated output", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    writeFixture(root, "packages/shared/allowed.css", [
        '@import "./local.css";',
        '@import url(https://example.org/styles.css) screen;',
        '@import "@dig-portal/domain/theme.css";',
        '/* @import "../../apps/cmd/private.css"; */',
        'a { content: \'@import "../../apps/cmd/private.css";\'; }',
    ].join("\n"));
    writeFixture(root, "packages/shared/Styled.vue", '<template><div /></template><style>@import "./allowed.css";</style><style lang="scss">@use "~/mixins";</style>');
    for (const directory of ["node_modules", ".nuxt-dev", ".output", ".data", "dist"]) {
        writeFixture(root, `packages/shared/${directory}/Ignored.css`, '@import "~/private.css";');
    }
    assert.deepEqual(await validateDependencyDirection(root, discoverPackages(root)), []);
});

test("fails dependency validation on malformed CSS and inline Vue CSS", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    writeFixture(root, "packages/shared/broken.css", 'a { color: red;');
    writeFixture(root, "packages/shared/BrokenStyle.vue", '<template><div /></template><style>a { color: red;</style>');
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 2);
    assert.match(errors.join("\n"), /broken\.css cannot be parsed as CSS/);
    assert.match(errors.join("\n"), /BrokenStyle\.vue.*cannot be parsed as CSS/);
});

test("rejects literal and broad import.meta.glob patterns that match application files", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    writeFixture(root, "apps/cmd/target.ts", 'export const value = 1;');
    writeFixture(root, "apps/cmd/private.ts", 'export const value = 2;');
    writeFixture(root, "apps/cmd/[data]/target.ts", 'export const value = 3;');
    writeFixture(root, "apps/cmd/.hidden/secret.ts", 'export const value = 4;');
    writeFixture(root, "packages/shared/globs.ts", [
        'import.meta.glob("../../apps/cmd/*.ts");',
        'import.meta.glob("../../{apps,packages}/**/*.ts");',
        'import.meta.glob(["../../**/*.ts", "!../../apps/cmd/private.ts"]);',
        'import.meta.glob("./*.ts", { base: "../../apps/cmd", eager: true });',
        String.raw`import.meta.glob("../../app\u0073/cmd/**/*.ts");`,
        'import.meta.glob("./*.TS", { base: "../../apps/cmd", caseSensitive: false });',
        'import.meta.glob("./*.ts", { base: "../../apps/cmd/[data]" });',
        'import.meta.glob("../../apps/cmd/**/secret.ts", { exhaustive: true });',
    ].join('\n'));
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 8, errors.join('\n'));
    assert.match(errors.join('\n'), /globs\.ts.*import\.meta\.glob.*apps\/cmd\/target\.ts/);
    assert.equal(await main(['validate'], root), 1);
});

test("checks globs in Vue scripts and script setup", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "layers", "platform", { name: "@dig-portal/platform" });
    writeFixture(root, "apps/cmd/target.ts", 'export const value = 1;');
    writeFixture(root, "layers/platform/Globs.vue", '<template><div /></template><script lang="ts">const normal = import.meta.glob("../../apps/cmd/*.ts"); export default {};</script><script setup lang="ts">const setup = import.meta.glob("../../apps/cmd/*.ts");</script>');
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 2, errors.join('\n'));
    assert.match(errors.join('\n'), /Globs\.vue.*import\.meta\.glob/);
});

test("allows shared globs and exclusions, ignoring comments, strings and generated sources", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    writeFixture(root, "apps/cmd/target.ts", 'export const value = 1;');
    writeFixture(root, "packages/shared/allowed.ts", [
        'throw new Error("validation must not execute source");',
        'import.meta.glob("./*.ts");',
        'import.meta.glob("./*.ts", { base: "." });',
        'import.meta.glob("../../apps/cmd/**/secret.ts");',
        'import.meta.glob(["../../**/*.ts", "!../../apps/**"] as const);',
        '// import.meta.glob("../../apps/cmd/*.ts");',
        'const text = \'import.meta.glob("../../apps/cmd/*.ts")\';',
    ].join('\n'));
    writeFixture(root, "apps/cmd/.hidden/secret.ts", 'export const value = 1;');
    writeFixture(root, "packages/shared/Widget.tsx", 'export const widget = <div />; const files = import.meta.glob("./*.tsx");');
    for (const directory of ['.data', '.nuxt-dev', '.output', 'node_modules', 'dist']) writeFixture(root, `packages/shared/${directory}/ignored.ts`, 'import.meta.glob("~/private.ts");');
    assert.deepEqual(await validateDependencyDirection(root, discoverPackages(root)), []);
});

test("reports glob patterns and options that require unresolved runtime or app-root configuration", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    writeFixture(root, "packages/shared/unresolved.ts", [
        'const pattern = "./*.ts"; import.meta.glob(pattern);',
        'import.meta.glob("./*.ts", { base: pattern });',
        'import.meta.glob("./*.ts", { ...options });',
        'import.meta.glob("/app/*.ts");',
        'import.meta.glob("~/app/*.ts");',
    ].join('\n'));
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 5, errors.join('\n'));
    assert.match(errors.join('\n'), /cannot analyze import\.meta\.glob/);
});

test("fails dependency validation on malformed script source instead of skipping glob analysis", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "packages", "shared", { name: "@dig-portal/shared" });
    writeFixture(root, "packages/shared/broken.ts", 'const files = import.meta.glob(');
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.match(errors.join('\n'), /broken\.ts.*cannot be parsed for glob dependency validation/);
});

test("rejects application strings in shared Nuxt configuration dependency fields", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    createPackage(root, 'layers', 'platform', { name: '@dig-portal/platform' });
    writeFixture(root, 'layers/platform/nuxt.config.ts', [
        'export default defineNuxtConfig({',
        '  extends: [["../../apps/cmd", { meta: { text: "option" } }]],',
        '  modules: ["@dig-portal/cmd/module", ["~/module", { arbitrary: "option" }]],',
        '  plugins: [{ src: "#shared/plugin", mode: "client" }],',
        '  css: ["../../apps/cmd/private.css"],',
        '});',
    ].join('\n'));
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 5, errors.join('\n'));
    assert.match(errors.join('\n'), /nuxt\.config\.ts.*config extends.*apps\/cmd/);
    assert.match(errors.join('\n'), /config modules.*@dig-portal\/cmd\/module/);
    assert.match(errors.join('\n'), /config plugins.*#shared\/plugin/);
    assert.equal(await main(['validate'], root), 1);
});

test("checks static Nuxt environment and override blocks", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    createPackage(root, 'layers', 'platform', { name: '@dig-portal/platform' });
    writeFixture(root, 'layers/platform/nuxt.config.mjs', 'export default { $env: { portalDev: { extends: "../../apps/cmd", modules: ["@dig-portal/cmd/module"] } }, $development: { plugins: ["~/plugin"] }, overrides: { css: ["#shared/style.css"] } };');
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 4, errors.join('\n'));
    assert.match(errors.join('\n'), /\$env\.portalDev\.extends/);
    assert.match(errors.join('\n'), /\$development\.plugins/);
});

test("checks same-file constant configs, arrays, spreads and CommonJS exports without executing them", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    createPackage(root, 'packages', 'shared', { name: '@dig-portal/shared' });
    writeFixture(root, 'packages/shared/nuxt.config.ts', 'const styles = ["~/app.css"] as const; const base = { css: styles }; const modules = [["@dig-portal/cmd/module", {}]] as const; const config = { ...base, modules: [...modules] }; export default defineNuxtConfig(config);');
    writeFixture(root, 'packages/shared/nuxt.config.cjs', 'throw new Error("must not execute"); module.exports = { plugins: ["../../apps/cmd/plugin"] };');
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 3, errors.join('\n'));
});

test("allows shared Nuxt references and module identifiers without treating option text as dependencies", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    createPackage(root, 'layers', 'platform', { name: '@dig-portal/platform' });
    writeFixture(root, 'layers/platform/plugin.ts', 'export default function plugin() {}');
    writeFixture(root, 'layers/platform/nuxt.config.ts', [
        'import plugin from "./plugin";',
        'const modules = [[plugin, { modules: ["@dig-portal/cmd/not-a-dependency"] }]];',
        'const overridden = { css: ["~/unused.css"] };',
        'export default defineNuxtConfig({ ...overridden, extends: [["@dig-portal/other-layer", { text: "@dig-portal/cmd/not-a-dependency" }]], modules, plugins: [{ src: "./plugin" }], css: ["./style.css"], runtimeConfig: { public: { css: "~/label-only" } } });',
    ].join('\n'));
    writeFixture(root, 'layers/platform/settings.ts', 'export const text = { modules: ["@dig-portal/cmd/label-only"] };');
    assert.deepEqual(await validateDependencyDirection(root, discoverPackages(root)), []);
});

test("rejects app aliases, component scan directories and configured import sources in Nuxt layers", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    createPackage(root, 'layers', 'platform', { name: '@dig-portal/platform' });
    writeFixture(root, 'layers/platform/nuxt.config.ts', [
        'export default defineNuxtConfig({',
        '  alias: { "#private": "../../apps/cmd/private" },',
        '  components: { dirs: ["../../apps/cmd/components", { path: "~/components", prefix: "Shared" }] },',
        '  imports: { dirs: ["../../apps/cmd/composables"], imports: [{ name: "useApp", from: "@dig-portal/cmd/imports", typeFrom: "#shared/types" }],',
        '    presets: [{ from: "#shared/preset", imports: [{ from: "~/nested", imports: ["useNested"] }, ["useOther", "useAlias", "@dig-portal/cmd/override"]] }] },',
        '});',
    ].join('\n'));
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 9, errors.join('\n'));
    assert.match(errors.join('\n'), /config alias\.#private/);
    assert.match(errors.join('\n'), /config components\.dirs\.path/);
    assert.match(errors.join('\n'), /config imports\.presets\.imports.*@dig-portal\/cmd\/override/);
    assert.equal(await main(['validate'], root), 1);
});

test("checks component array and single-directory forms plus same-file import constants in environments", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    createPackage(root, 'packages', 'shared', { name: '@dig-portal/shared' });
    writeFixture(root, 'packages/shared/nuxt.config.ts', 'const scan = ["~/imports"]; const preset = { from: "@dig-portal/cmd/preset", imports: ["useX"] }; export default defineNuxtConfig({ components: [[{ path: "../../apps/cmd/components" }]], $env: { qa: { components: { path: "#shared/components" }, imports: { dirs: [...scan], presets: [preset] } } } });');
    const errors = await validateDependencyDirection(root, discoverPackages(root));
    assert.equal(errors.length, 4, errors.join('\n'));
    assert.match(errors.join('\n'), /\$env\.qa\.imports\.presets\.from/);
});

test("allows shared scan paths and preset sources without treating labels or names as dependencies", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    createPackage(root, 'layers', 'platform', { name: '@dig-portal/platform' });
    writeFixture(root, 'layers/platform/nuxt.config.ts', [
        'const aliases = { "@dig-portal/cmd/compatibility-label": "../../packages/shared" };',
        'export default defineNuxtConfig({ alias: aliases, components: { dirs: [{ path: "./app/components", prefix: "~/label-only" }] },',
        'imports: { dirs: ["./app/composables"], imports: [{ from: "./safe", typeFrom: "./safe/types", name: "@dig-portal/cmd/name-only" }], presets: [{ from: "vue", imports: [["@dig-portal/cmd/name-only", "~/alias-only", "./safe"]] }] },',
        'modules: [[() => {}, { components: ["~/option-text-only"], imports: { dirs: ["~/option-text-only"] } }]], runtimeConfig: { public: { alias: { text: "~/label-only" } } } });',
    ].join('\n'));
    writeFixture(root, 'layers/platform/nuxt.config.cjs', 'module.exports = { components: false, imports: { scan: false, dirs: ["~/disabled-scan"] } };');
    assert.deepEqual(await validateDependencyDirection(root, discoverPackages(root)), []);
});

test("workspace validation rejects a remote Git layer in an application config", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    writeFixture(root, 'apps/cmd/nuxt.config.ts', 'export default defineNuxtConfig({ extends: ["github:example/layer"] });');
    assert.equal(await main(['validate'], root), 1);
});

test("rejects explicit Git providers, transports and repository URLs without disclosing credentials", (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    const sources = [
        'gh:example/layer', 'github:example/layer#main', 'gitlab:group/layer',
        'bitbucket:team/layer', 'sourcehut:~team/layer', 'git:example/layer',
        'git://example.test/team/layer', 'ssh://git@example.test/team/layer',
        'git+https://example.test/team/layer', 'https+git://example.test/team/layer',
        'ssh+git://git@example.test/team/layer', 'git@example.test:team/layer.git',
        'https://github.com/example/layer', 'https://api.github.com/repos/example/layer/tarball/main',
        'https://codeload.github.com/example/layer/tar.gz/main', 'https://raw.githubusercontent.com/example/layer/main/template.json',
        'https://gitlab.com/team/layer/-/archive/main/layer.tar.gz', 'https://bitbucket.org/team/layer/get/main.tar.gz',
        'https://git.sr.ht/~team/layer/archive/main.tar.gz',
        'https://fixture-user:fixture-secret@example.test/team/layer.git?token=fixture-token#main',
    ];
    writeFixture(root, 'apps/cmd/nuxt.config.ts', `export default defineNuxtConfig({ extends: ${JSON.stringify(sources)} });`);
    const errors = validateLayerSources(root);
    assert.equal(errors.length, sources.length, errors.join('\n'));
    for (const error of errors) assert.match(error, /nuxt\.config\.ts config extends.*D-30/);
    assert.doesNotMatch(errors.join('\n'), /fixture-user|fixture-secret|fixture-token/);
});

test("inspects local layer configs, static environments, tuple sources and CommonJS without executing config", (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    createPackage(root, 'layers', 'platform', { name: '@dig-portal/platform' });
    createPackage(root, 'packages', 'shared', { name: '@dig-portal/shared' });
    writeFixture(root, 'apps/cmd/nuxt.config.ts', 'const base = { extends: [["github:example/layer", { auth: "fixture-secret" }]] }; export default defineNuxtConfig({ ...base, $env: { qa: { extends: "gitlab:group/layer" } }, $production: { extends: ["bitbucket:team/layer"] }, overrides: { extends: "gh:example/layer" } });');
    writeFixture(root, 'layers/platform/nuxt.config.mts', 'throw new Error("must not execute"); export default { extends: "https://example.test/team/layer.git" };');
    writeFixture(root, 'packages/shared/nuxt.config.cjs', 'module.exports = { extends: ["sourcehut:~team/layer"] };');
    // A local/auto-discovered nested layer need not have its own package manifest.
    writeFixture(root, 'apps/cmd/layers/theme/nuxt.config.mjs', 'export default { extends: "github:example/theme" };');
    const errors = validateLayerSources(root);
    assert.equal(errors.length, 7, errors.join('\n'));
    assert.match(errors.join('\n'), /\$env\.qa\.extends/);
    assert.match(errors.join('\n'), /\$production\.extends/);
    assert.doesNotMatch(errors.join('\n'), /fixture-secret/);
});

test("allows local and package layers and excludes unrelated text and generated configs", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    const local = ['../../layers/platform', '@dig-portal/platform', '@scope/layer/subpath', './github:local', 'C:\\local\\layer', 'file:///local/layer', 'git:./local-repository', 'git:file:///local/repository', 'https://example.test/layer.tar.gz', 'https://github.com.example.test/layer.tar.gz?label=.git'];
    writeFixture(root, 'apps/cmd/nuxt.config.ts', [
        'const old = { extends: ["github:example/overridden"] };',
        `export default defineNuxtConfig({ ...old, extends: ${JSON.stringify(local)},`,
        'modules: [[() => {}, { extends: ["github:example/option-text"] }]],',
        'runtimeConfig: { public: { extends: "gitlab:example/label-only" } } });',
        '// extends: ["github:example/comment"]',
    ].join('\n'));
    for (const directory of ['.data', '.nuxt-dev', '.output', 'node_modules', 'dist', 'coverage', '.cache', '.git']) writeFixture(root, `apps/cmd/${directory}/nuxt.config.ts`, 'export default { extends: "github:example/ignored" };');
    writeFixture(root, 'apps/cmd/settings.ts', 'export const label = { extends: "github:example/text-only" };');
    assert.deepEqual(validateLayerSources(root), []);
    assert.equal(await main(['validate'], root), 0);
});

test("reports malformed application configs instead of silently skipping layer validation", (t) => {
    const root = createWorkspace(t);
    createPackage(root, 'apps', 'cmd', { name: '@dig-portal/cmd' });
    writeFixture(root, 'apps/cmd/nuxt.config.ts', 'export default defineNuxtConfig({ extends: [');
    assert.match(validateLayerSources(root).join('\n'), /nuxt\.config\.ts cannot be parsed for static layer-source validation/);
});

test("allows shared dependencies and applications importing shared code", async (t) => {
    const root = createWorkspace(t);
    createPackage(root, "apps", "cmd", { name: "@dig-portal/cmd" });
    createPackage(root, "packages", "domain", { name: "@dig-portal/domain" });
    createPackage(root, "layers", "platform", {
        name: "@dig-portal/platform",
        dependencies: { "@dig-portal/domain": "workspace:*" },
    });
    mkdirSync(
        path.join(root, "packages", "domain", "node_modules", "example"),
        { recursive: true },
    );
    writeFileSync(
        path.join(
            root,
            "packages",
            "domain",
            "node_modules",
            "example",
            "index.js",
        ),
        "export { value } from '../../../../apps/cmd/index';\n",
    );
    writeFileSync(
        path.join(root, "packages", "domain", "index.ts"),
        "export const value = 1;\n",
    );
    writeFileSync(
        path.join(root, "layers", "platform", "index.ts"),
        "export { value } from '../../packages/domain/index';\n",
    );
    writeFileSync(
        path.join(root, "apps", "cmd", "index.ts"),
        "export { value } from '../../packages/domain/index';\n",
    );

    assert.deepEqual(
        await validateDependencyDirection(root, discoverPackages(root)),
        [],
    );
});
