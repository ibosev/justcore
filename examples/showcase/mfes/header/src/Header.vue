<script setup lang="ts">
import { useStore } from "@nanostores/vue";
import type { LocationService, SharedStateService } from "@showcase/contracts";
import type { ReadableAtom } from "nanostores";
import { formatPrice } from "./format.ts";
import type { Toast } from "./toasts.ts";

const props = defineProps<{
    location: LocationService;
    shared: SharedStateService;
    toasts: ReadableAtom<readonly Toast[]>;
}>();

const query = useStore(props.location.$query);
// Undefined until the cart micro frontend has loaded and claimed its shared summary.
const summary = useStore(props.shared.read("cart.summary"));
const toasts = useStore(props.toasts);

function search(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    props.location.setQuery({ q: value || undefined }, { replace: true });
}
</script>

<template>
  <div class="header">
    <div class="header__brand">
      <span class="header__logo">jc</span>
      <div>
        <strong class="header__name">justcore shop</strong>
        <span class="header__tagline">Six frameworks, six deployments, one core</span>
      </div>
    </div>
    <label class="header__search">
      <span aria-hidden="true">⌕</span>
      <input
        type="search"
        aria-label="Search products"
        placeholder="Search the shop"
        :value="query.q ?? ''"
        @input="search"
      />
    </label>
    <div class="header__cart" aria-live="polite">
      <template v-if="summary">
        <span>{{ formatPrice(summary.total) }}</span>
        <!-- A new key replays the pop animation whenever the count changes. -->
        <span :key="summary.count" class="header__badge">{{ summary.count }}</span>
      </template>
      <span v-else class="header__muted">Cart loading…</span>
    </div>
    <ul class="header__toasts">
      <li v-for="toast in toasts" :key="toast.id" class="header__toast"><span aria-hidden="true">✓</span>{{ toast.text }}</li>
    </ul>
  </div>
</template>
