/**
 * One slot for the home page's hero search field.
 *
 * `SiteShell` owns the global `/` and `Ctrl`/`Cmd`+`K` shortcut, but the hero field
 * lives in `pages/Home.tsx`, below `SiteShell` in the tree. Threading a ref through
 * context for a single element would couple every page to the shell; instead the field
 * registers itself on mount and clears on unmount.
 *
 * The getter refuses to focus an element with no `offsetParent` (i.e. hidden by CSS),
 * so a shortcut on a viewport where the hero field is not rendered falls through to
 * the header search rather than moving focus somewhere invisible.
 */
let heroInput: HTMLInputElement | null = null;

export function registerHeroSearch(input: HTMLInputElement | null) {
  heroInput = input;
}

/** Focuses the hero search field and reports whether it was focusable. */
export function focusHeroSearch(): boolean {
  if (!heroInput || heroInput.offsetParent === null) return false;
  heroInput.focus();
  return true;
}
