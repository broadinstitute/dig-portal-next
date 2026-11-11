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
    // Build-time public setting (D-23); override with NUXT_PUBLIC_BIOINDEX_URL.
    runtimeConfig: { public: { bioindexUrl: "https://bioindex.hugeamp.org" } },
});
