// Command-line front end of the stand-in deployment service. Usage:
//   node scripts/publish.mjs cart                          the build the last cart build produced
//   node scripts/publish.mjs cart=1.0.0/cart-DqFGBwNj.js   any build still on the CDN (a rollback)
//   node scripts/publish.mjs header cart                   several at once
// The bundle must already be on the CDN; this only moves the pointer in the live import map, and adds
// the shared libraries the bundle imports. The deployment console in serve.mjs does the same per click.
import { publishBuilds } from "./deployments.mjs";

const targets = process.argv.slice(2).map(target => {
    const [id, file] = target.split("=");
    return { id, file };
});
if (!targets.length) {
    console.error("usage: node scripts/publish.mjs <id>[=<version>/<file>] ...");
    process.exit(1);
}
for (const line of await publishBuilds(targets)) {
    console.info(line);
}
