# ToolsHub design system — "Cobalt Workshop"

Date: 2026-09-11. This is the single source of truth for the visual language. It
describes what is actually in the code — `client/src/index.css`,
`client/src/workbench-overrides.css`, `client/src/data/themes.ts` and
`client/src/contexts/AppSettingsContext.tsx` — not what the interface aspires to be.
Where a number is quoted it can be found in one of those files.

## The one visual direction

A workshop bench, not a dashboard. Luminous paper, deep ink, one electric accent.

- **Surface:** luminous paper `#f7f6f1` with a faint stitch texture (3% opacity,
  painted by `body::before` and kept behind content).
- **Ink:** deep ink navy `#0a1025` for text, and for the dark panels behind the hero
  and the games feature.
- **Primary:** Electric Cobalt `#3264ff`. The dark preset lifts it to `#5b85ff` so it
  still clears 4.5:1 as text on an ink field.
- **Secondary:** coral `#ff6b4a`, used sparingly — the playful accent on the games
  half of the site, never on body copy.
- Dense instrument rails, square-cornered plates, and a drafting-sheet registration
  mark. Rounded corners are for controls (`--radius-md`), not for page surfaces.

There is **one** direction. Additional themes are complete palettes derived from a
six-value preset, not variations in layout, spacing or type.

## Colour tokens

Two layers exist, and the distinction matters:

1. **Static defaults** written in `client/src/index.css`. They are the derived
   light-theme values, so the first paint — before React runs — matches what the
   provider then applies.
2. **Runtime values** set imperatively on `document.documentElement.style` by
   `AppSettingsContext` whenever the active theme changes. An inline style
   always wins over a stylesheet, so the runtime values are the ones on screen
   after mount.

### Core palette (preset values, `client/src/data/themes.ts`)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `#f7f6f1` | `#0a1025` | page field |
| `--card` / `--surface` | `#fffefb` | `#131a33` | raised panel, card |
| `--foreground` / `--card-foreground` | `#0a1025` | `#f4f7ff` | body and heading text |
| `--primary` | `#3264ff` | `#5b85ff` | fills, rules, focus ring, active state |
| `--secondary` | `#ff6b4a` | `#ff8a5c` | coral accent (preset's `secondary`) |
| `--border` | `#dcd8cc` | `#2a3352` | hairline |

The preset also carries `surface`, `text` and `border`; `--primary` / `--secondary`
are the brand names for the preset's `primary` / `secondary`.

### Derived tokens (computed at runtime)

| Token | Derivation | Role |
|---|---|---|
| `--secondary` | `mix(surface, text, 0.05 light / 0.08 dark)` | quiet neutral fill (note: **not** the coral accent) |
| `--muted` | `mix(surface, text, 0.06 / 0.1)` | subdued fill |
| `--muted-foreground` | `mutedText(text, surface)` | secondary copy, guaranteed under `--foreground` in weight |
| `--accent` | `mix(surface, primary, 0.1 / 0.16)` | cobalt-tinted selection fill |
| `--accent-strong` | preset `secondary` | the coral accent as a token |
| `--primary-foreground` | `readableOn(primary)` | text on a cobalt fill, chosen by contrast |
| `--primary-text` | `readableAccent(primary, worst field)` | cobalt as *text* — links, eyebrows — at ≥4.5:1 |
| `--surface-raised` | `mix(surface, text, 0.03 / 0.06)` | toolbar / header strip |
| `--surface-sunken` | `mix(background, text, 0.02 / 0.04)` | wells, dialog heads |
| `--border-subtle` | `mix(border, surface, 0.45)` | internal dividers |
| `--border-strong` | `mix(border, text, 0.42)` | interactive boundaries, ≥3:1 (WCAG 2.2 non-text) |
| `--ink` | dark preset: `mix(background, #000, 0.25)`; light: `#0a1025` | dark panel field |
| `--ink-raised` / `--ink-border` | derived from `--ink` | panel-on-panel, rules |
| `--on-ink` / `--on-ink-muted` / `--on-ink-accent` | `readableOn(ink, …)`, `mutedText`, `readableAccent` | everything that sits on an ink panel |
| `--danger` / `--on-danger` | `#ef4444` / `#ffffff` | destructive; mapped to Tailwind's `destructive` |
| `--ring` | preset `primary` | focus ring |

`node --experimental-strip-types scripts/theme-contrast.mjs` audits every preset against
the ratios above using the app's own colour helpers. The two default presets must pass
everything; a shortfall in an opt-in preset is a warning.

## Type scale

Families are named by role, so a typeface swap happens in one place
(`client/src/index.css`). `--font-ui` leads with **Noto Sans Bengali** because that
stack serves both languages: the browser only reaches Space Grotesk for codepoints
Noto does not cover, which is exactly the Latin text.

- `--font-ui` — body and UI (Bengali-first, then Space Grotesk)
- `--font-latin-display` — headings and the wordmark
- `--font-bengali` — Bengali-only contexts
- `--font-code` — `DM Mono` for labels, counters, keys, tool output

| Token | Size | Line height |
|---|---|---|
| `--text-xs` | 12px | `--leading-xs` 1.45 |
| `--text-sm` | 14px | `--leading-sm` 1.5 |
| `--text-base` | 16px | `--leading-base` 1.5 |
| `--text-lg` | 18px | `--leading-lg` 1.4 |
| `--text-xl` | 22px | `--leading-xl` 1.25 |
| `--text-2xl` | 28px | `--leading-2xl` 1.15 |
| `--text-3xl` | 36px | `--leading-3xl` 1.08 |

Display headings use `clamp()` against `vw` rather than this scale, and are pinned at
fixed sizes below 400px so a narrow phone does not scroll horizontally. Bangla body
copy sets `line-height: 1.62` (`:root:lang(bn) body`) because its matra bar collides at
the Latin 1.5.

## Spacing scale

4px base, `--space-1` … `--space-8`:

| Token | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| px | 4 | 8 | 12 | 16 | 20 | 24 | 28 | 32 |

Page rhythm is larger than this scale: `.site-frame` caps the content column at
1184px, `.section-space` / `.page-space` use 76px block padding (52px at ≤640px).

## Radius, shadow, motion

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | chips, small controls |
| `--radius-md` | 8px | buttons, inputs, cards, the logo plate |
| `--radius-lg` | 16px | larger rounded containers |
| `--radius-pill` | 999px | pills and chips |
| `--radius` | 0.7rem | shadcn primitives' base radius |
| `--shadow-sm` | ink-tinted, tight | resting control |
| `--shadow-md` | ink-tinted, medium | popover / raised card |
| `--shadow-lg` | ink-tinted, wide | floating panel |
| `--motion-fast` | 140ms | small state changes |
| `--motion` | 180ms | standard state change |
| `--ease` | `cubic-bezier(0.23, 1, 0.32, 1)` | the one easing curve |

Shadows are ink-tinted on paper and switch to pure black under `.dark` (the class the
provider toggles on `<html>` for any dark preset), because an ink-tinted shadow at the
same alpha is invisible on a dark field.

### The micro-interaction rule

State changes read as instant feedback, not animation. Keep them **150–250ms**.
`--motion-fast` (140ms) and `--motion` (180ms) are the standard values; the shared
`button` rule transitions transform, background, border and colour at 150ms. Presses
scale to `0.97`. Card lifts are `translateY(-3px)`. Nothing loops or auto-plays, and
`@media (prefers-reduced-motion: reduce)` removes all transitions and animations
globally.

## Iconography

- **`lucide-react` only.** No icon fonts, no hand-rolled SVG icons beyond the brand
  mark (`client/src/components/Logo.tsx`) and the decorative plates in
  `workbench-overrides.css`.
- Size is set with a Tailwind `size-*` utility (`size-4` for inline UI icons); colour
  is inherited from the surrounding text or set with a token class.
- A decorative icon is `aria-hidden="true"`. An icon that carries meaning the text
  does not gets an adjacent visible label or an `aria-label` from the dictionary —
  never a hardcoded string.

## How to add a new surface

1. **Read the tokens, do not invent values.** Use `--card`, `--border`,
   `--muted-foreground`, `--radius-md`, `--space-*`, `--shadow-*`, `--motion`. If a
   needed value is missing, add a token next to the others rather than a literal.
2. **Write the rule in `client/src/workbench-overrides.css`** (or `index.css` for
   shell-level chrome), keyed by a semantic class name. No Tailwind utilities for
   project surfaces; utilities are for `components/ui` primitives.
3. **Take colour only from custom properties**, so every user theme repaints the
   surface without a second rule.
4. **Put every user-facing string in `client/src/i18n/translations.ts`** with both
   `en` and `bn`, and read it with `t()`. Bengali needs the taller line height and the
   Bengali-first font stack, which the tokens already provide.
5. **Mark state with more than colour** — a rule, a tint, or an icon as well — so it
   survives greyscale and colour-blind viewing.
6. **Give interactive elements a visible `:focus-visible` state** (the shared rule
   supplies one) and, on coarse pointers, a target of at least 44px.
7. **Icons come from `lucide-react`**, decorative ones are `aria-hidden`.
8. **Keep motion within 150–250ms** and assume `prefers-reduced-motion` is on.
9. **Run the audits before committing:**
   `node scripts/i18n-parity.mjs`, `node scripts/hardcoded-strings.mjs`,
   `node scripts/class-audit.mjs` (a class used in JSX must have a stylesheet rule),
   and `node --experimental-strip-types scripts/theme-contrast.mjs`.
