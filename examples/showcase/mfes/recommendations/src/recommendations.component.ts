import { ChangeDetectionStrategy, Component, computed, inject, InjectionToken } from "@angular/core";
import type { LocationService } from "@showcase/contracts";
import type { Product } from "./api.ts";
import { formatPrice } from "./format.ts";
import { related } from "./related.ts";
import { fromStore } from "./store.ts";

/** What the module hands the component: data, shared state and the one request it can send. */
export interface RecommendationsContext {
    products: readonly Product[];
    location: LocationService;
    add(product: Product): void;
}

export const CONTEXT = new InjectionToken<RecommendationsContext>("recommendations context");

@Component({
    selector: "mfe-recommendations",
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="recs__head">
            <h2>Pairs well with</h2>
            @if (items().length) {
                <span class="recs__count">{{ items().length }} picks</span>
            }
        </div>
        @if (items().length) {
            <ul class="recs">
                @for (item of items(); track item.id) {
                    <li class="recs__item" [style.--accent]="item.color">
                        <button type="button" class="recs__show" (click)="show(item)">
                            <span class="recs__tile" aria-hidden="true">{{ item.name.charAt(0) }}</span>
                            <span class="recs__name">{{ item.name }}</span>
                            <span class="recs__price">{{ price(item.price) }}</span>
                        </button>
                        <button type="button" class="recs__add" (click)="context.add(item)" [attr.aria-label]="'Add ' + item.name + ' to cart'">+</button>
                    </li>
                }
            </ul>
        } @else {
            <p class="recs__empty">Pick a product and we will suggest what goes with it.</p>
        }
    `
})
export class RecommendationsComponent {
    protected readonly context = inject(CONTEXT);
    private readonly query = fromStore(this.context.location.$query);
    protected readonly items = computed(() => related(this.context.products, this.query().product));
    protected readonly price = formatPrice;

    protected show(product: Product): void {
        // Shared state is changed by asking the shell, which owns the URL.
        this.context.location.setQuery({ product: product.id });
    }
}
