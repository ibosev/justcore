// Docs-only entry: TypeDoc skips `declare global` blocks, so expose the global jc namespace as an export.
export { Core, remoteModule } from "../../src/index";
import jcNamespace = jc;
export { jcNamespace as jc };
