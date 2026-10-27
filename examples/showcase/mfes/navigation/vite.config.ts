import react from "@vitejs/plugin-react";
import { sharedLibraries } from "@showcase/vendor/plugin";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

// One content-hashed ES module with a manifest the shell reads. The framework is not bundled: the
// shared-libraries plugin turns its imports into versioned import map names served from the CDN.
export default defineConfig({
    plugins: [sharedLibraries(), react()],
    // Library builds keep process.env references; frameworks need them replaced for the browser.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
        outDir: "../../cdn/navigation",
        // Never delete earlier versions: pages that are already open may still load them.
        emptyOutDir: false,
        manifest: true,
        lib: { entry: "src/index.tsx", formats: ["es"] },
        // Fully minified: this file goes straight to browsers, not to another bundler. The release version
        // is part of the path, so the import map, rollbacks and the inspector show which version runs.
        rolldownOptions: { output: { entryFileNames: `${pkg.version}/navigation-[hash].js`, minify: true } }
    }
});
