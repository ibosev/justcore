import type { LocationService } from "@showcase/contracts";
import { useStore } from "@nanostores/react";
import type { MouseEvent } from "react";
import { activePath, links } from "./links.ts";

export function Navigation({ location }: { location: LocationService }) {
    const active = activePath(useStore(location.$path));

    const go = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
            return; // let the browser open a new tab
        }
        event.preventDefault();
        // The shell owns history; navigation only asks for the change. Keep the rest of the query.
        location.navigate(path, { query: location.$query.get() });
    };

    return (
        <>
            <h2 className="nav__title">Shop by category</h2>
            <ul className="nav">
                {links.map(link => (
                    <li key={link.path}>
                        <a
                            className="nav__item"
                            href={link.path}
                            aria-current={link.path === active ? "page" : undefined}
                            onClick={event => go(event, link.path)}
                        >
                            <span className="nav__icon" aria-hidden="true">{link.icon}</span>
                            {link.label}
                        </a>
                    </li>
                ))}
            </ul>
        </>
    );
}
