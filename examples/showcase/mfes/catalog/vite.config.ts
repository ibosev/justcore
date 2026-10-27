import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

// One content-hashed file that carries Astro's markup, so a deploy can never mix markup and code versions.
export default defineConfig({
    build: {
        outDir: "../../cdn/catalog",
        // Never delete earlier versions: pages that are already open may still load them.
        emptyOutDir: false,
        manifest: true,
        lib: { entry: "src/index.ts", formats: ["es"] },
        // The release version is part of the path, so the import map, rollbacks and the inspector show which version runs.
        rolldownOptions: { output: { entryFileNames: `${pkg.version}/catalog-[hash].js`, minify: true } }
    }
});
