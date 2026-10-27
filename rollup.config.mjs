import terser from "@rollup/plugin-terser";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const banner = `/**
 *  @license ${pkg.name}
 *  Copyright © Valentin Lozev 2016 - Present
 *  Licensed under the MIT license: http://www.opensource.org/licenses/mit-license.php
 *  Source code: http://github.com/valentin-lozev/justcore
 */`;
const common = { banner, intro: `var VERSION = "${pkg.version}";` };
const umd = { ...common, format: "umd", name: "justcore", exports: "named" };

// Input is tsc's output: the compiler type-checks and emits, rollup only bundles.
export default {
    input: ".build/index.js",
    output: [
        { ...umd, file: "dist/justcore.umd.js" },
        { ...umd, file: "dist/justcore.umd.min.js", plugins: [terser({ mangle: false, format: { comments: "some" } })] },
        { ...common, format: "es", file: "dist/justcore.module.js" }
    ]
};
