import { execFileSync } from "node:child_process";
import portal from "./portal.config";

const buildId = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
    encoding: "utf8",
}).trim();

export default defineNuxtConfig({
    buildId,
    compatibilityDate: "2026-11-10",
    extends: ["@dig-portal/platform"],
    modules: ["@nuxt/content", "@nuxt/ui"],
    css: ["~/assets/css/main.css"],
    ui: { fonts: false },
    app: { head: { title: portal.title } },
    // D-23: build-time public settings; NUXT_PUBLIC_BIOINDEX_URL / NUXT_PUBLIC_PROVENANCE_URL.
    runtimeConfig: {
        public: {
            bioindexUrl: "https://bioindex.hugeamp.org",
            provenanceUrl: "https://translator.broadinstitute.org/artifact_provenance",
        },
    },
});
