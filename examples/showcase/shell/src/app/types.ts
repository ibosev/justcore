import type { InspectorService } from "./inspector.ts";
import type { ShellService } from "./shell.ts";

// Services only the shell's own modules use. Remote micro frontends see only @showcase/contracts.
declare global {
    namespace jc {
        interface ServiceLocatorMap {
            inspector: InspectorService;
            shell: ShellService;
        }
    }
}

export {};
