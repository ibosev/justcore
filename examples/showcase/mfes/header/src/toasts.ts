import type { ShowcaseMessage } from "@showcase/contracts";
import { formatPrice } from "./format.ts";

export interface Toast {
    id: number;
    text: string;
}

/** Facts worth telling the user about; requests such as "cart.add" are not the header's business. */
export function toastText(message: ShowcaseMessage): string | undefined {
    switch (message.type) {
        case "cart.itemAdded":
            return `Added ${message.quantity} × ${message.name}`;
        case "order.placed":
            return `Order placed: ${message.items} items, ${formatPrice(message.total)}`;
        default:
            return undefined;
    }
}
