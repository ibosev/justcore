import { defineConfig } from "astro/config";

// The shell compiles only its own code and ships no UI framework. Micro frontends arrive at runtime from the CDN.
export default defineConfig({
    vite: {
        // justcore is linked from the repository root (file:../../..), outside this project.
        server: { fs: { allow: ["../../.."] } }
    }
});
