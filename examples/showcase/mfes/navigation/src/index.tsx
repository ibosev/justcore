import type { ShowcaseModuleFactory } from "@showcase/contracts";
import { createRoot, type Root } from "react-dom/client";
import { adoptStyles, requireRoot } from "./dom.ts";
import { Navigation } from "./Navigation.tsx";
import css from "./styles.css?inline";

/** Site navigation micro frontend. The path it selects is shared state: other modules react to it. */
const navigation: ShowcaseModuleFactory = sandbox => {
    let root: Root | undefined;

    return {
        sandbox,
        init(props) {
            adoptStyles(css, sandbox.signal);
            root = createRoot(requireRoot(props));
            root.render(<Navigation location={sandbox.getService("location")} />);
        },
        destroy() {
            root?.unmount();
            root = undefined;
        }
    };
};

export default navigation;
