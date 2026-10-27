import { defineConfig } from "astro/config";

// Astro renders the HTML fragment into dist/; vite.config.ts inlines it into the deployed bundle.
export default defineConfig({
    outDir: "dist",
    build: { format: "file" }
});
