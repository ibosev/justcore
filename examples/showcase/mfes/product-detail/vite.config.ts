import { svelte } from "@sveltejs/vite-plugin-svelte";
import { sharedLibraries } from "@showcase/vendor/plugin";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

// Showcase only: SHOWCASE_FAULT builds a deliberately broken release (see npm run build:faults) to show
// that a failure stays inside this module's region. Normal builds compile the fault out.
const fault = process.env.SHOWCASE_FAULT ?? "";
const version = fault ? process.env.SHOWCASE_VERSION : pkg.version;

// One content-hashed ES module with a manifest the shell reads. The framework is not bundled: the
// shared-libraries plugin turns its imports into versioned import map names served from the CDN.
export default defineConfig({
    plugins: [sharedLibraries(), svelte()],
    // Library builds keep process.env references; frameworks need them replaced for the browser.
    define: { "process.env.NODE_ENV": JSON.stringify("production"), __SHOWCASE_FAULT__: JSON.stringify(fault) },
    build: {
        outDir: "../../cdn/product-detail",
        // Never delete earlier versions: pages that are already open may still load them.
        emptyOutDir: false,
        // A broken build leaves the manifest alone, so publishing without a file still picks the last good build.
        manifest: !fault,
        lib: { entry: "src/index.ts", formats: ["es"] },
        // Fully minified: this file goes straight to browsers, not to another bundler. The release version
        // is part of the path, so the import map, rollbacks and the inspector show which version runs.
        rolldownOptions: { output: { entryFileNames: `${version}/product-detail-[hash].js`, minify: true } }
    }
});
