/**
 * Starred ("favorite") tools, kept in the same local-only store as every other
 * preference. Modelled on `recent.ts`: a capped list of slugs under one `tgb:` key,
 * validated on read so a hand-edited or half-written value can never render a broken
 * home page, and dropped against the live registry so a stale slug from an older
 * build simply disappears instead of becoming a dead card.
 *
 * Unlike `recent.ts` this store is observable. A favorite can be toggled from the
 * home page, the tool directory and the tool page, and all three have to agree
 * without a reload, so a module-level subscriber list is exposed through
 * `useFavoriteSlugs` / `useFavorites` (React 19's `useSyncExternalStore`).
 */
import { useMemo, useSyncExternalStore } from "react";
import { findTool } from "@/data/tools";
import { safeGet, safeSet, STORAGE_PREFIX } from "@/lib/storage";
import type { Tool } from "@/data/tools";

const KEY = `${STORAGE_PREFIX}favorite-tools`;

/**
 * The cap is a personal shortlist rather than a second directory: enough to pin a
 * working set, small enough that the home page strip stays a strip. Starring beyond
 * the cap keeps the newest entries and drops the oldest, matching how the list is
 * ordered.
 */
export const MAX_FAVORITES = 24;

const EMPTY_SLUGS: readonly string[] = [];

const listeners = new Set<() => void>();

function notify() {
  // `forEach` tolerates a listener that unsubscribes during its own callback: a deleted
  // entry is simply skipped rather than visited after removal.
  listeners.forEach((listener) => listener());
}

/** Keeps the parsed list stable between reads when the stored value has not changed. */
let lastKey: string | undefined;
let lastValue: string[] = [];

/**
 * Returns only slugs a tool still answers to, in stored order, with duplicates and
 * the cap enforced. `Array.isArray` is checked before anything else because the value
 * comes straight from `localStorage`.
 */
function validate(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    if (out.includes(entry)) continue;
    if (!findTool(entry)) continue;
    out.push(entry);
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

/**
 * The single source of truth is storage; the memo only exists so
 * `useSyncExternalStore` sees the same array reference while nothing has changed.
 */
function snapshot(): string[] {
  const stored = safeGet<unknown>(KEY, []);
  const key = JSON.stringify(stored) ?? "";
  if (key !== lastKey) {
    lastKey = key;
    lastValue = validate(stored);
  }
  return lastValue;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/**
 * A change made in another tab is not applied to this tab's in-memory copy
 * automatically, and `storage` is the only signal that one happened. The memo above
 * re-reads on the next `snapshot`, so a notification is all that is needed.
 */
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== KEY) return;
  notify();
}

/** Favorites as full tool records, most recently starred first. */
export function getFavoriteTools(): Tool[] {
  return snapshot()
    .map((slug) => findTool(slug))
    .filter((tool): tool is Tool => Boolean(tool));
}

/** True when `slug` is starred. An unknown slug is never starred. */
export function isFavorite(slug: string): boolean {
  return snapshot().includes(slug);
}

/**
 * Adds `slug` to the front of the list, or removes it. An unknown slug is rejected
 * rather than stored-and-ignored, so the list can only ever hold real tools. Returns
 * the new state, which is what a caller may want for a polite announcement.
 */
export function toggleFavorite(slug: string): boolean {
  if (!findTool(slug)) return false;
  const current = snapshot();
  const favorite = current.includes(slug);
  const next = favorite ? current.filter((entry) => entry !== slug) : [slug, ...current].slice(0, MAX_FAVORITES);
  safeSet(KEY, next);
  notify();
  return !favorite;
}

/** Live slug list for components that only need to know membership (e.g. a star). */
export function useFavoriteSlugs(): readonly string[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_SLUGS);
}

/** Live tool list for the home page's Favorites strip. */
export function useFavorites(): Tool[] {
  const slugs = useFavoriteSlugs();
  return useMemo(
    () => slugs.map((slug) => findTool(slug)).filter((tool): tool is Tool => Boolean(tool)),
    [slugs],
  );
}
