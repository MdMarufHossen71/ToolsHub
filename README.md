# ToolsHub

**Live:** https://tools-hub-71.vercel.app/

**ToolsHub** is a privacy-first browser workbench for everyday utilities, developer helpers, image and file tasks, and quick local games. It is built as a static React and TypeScript application: ordinary inputs, preferences, saved game states, and themes remain in the visitor's browser.

## Highlights

| Area | What is included |
|---|---|
| Tools | A searchable browser-side directory across text, crypto, developer, image, color, calculator, time, file, SEO, and generator categories. 271 tools fully implemented (12 AI tools excluded by design — no network tools); the rest show an honest “Not built yet” state instead of fake output. |
| Games | 32 playable games with keyboard + touch controls and local high-score persistence. |
| Localization | **Default language is English; full Bangla UI is available via the language toggle.** Tool names remain in English for familiar search and SEO, while descriptions are supplied in both English and Bangla. |
| Appearance | Light, Dark, and 10 developer-inspired presets, plus a six-token custom-theme builder with import, export, edit, and delete controls. |
| Privacy | No account requirement, server-side tool processing, user tracking, or third-party font request — fonts are self-hosted and everything else runs locally. |
| PWA | Installable (shortcuts, share target), offline-capable via a precached app shell + same-origin cache-first service worker. |
| SEO | 647 prerendered shells (EN + BN under `/bn`, hreflang paired) + sitemap + robots, generated at build time; per-route meta/OG/Twitter/JSON-LD in the app too. |

## Your data stays in your browser

> **আপনার ডেটা আপনার browser-এই থাকে। Settings → আমার ডেটা থেকে download/import/clear করতে পারবেন।**

The **Settings → My Data** area provides a single JSON backup of this app's
namespaced (`tgb:`) browser data only: preferences, language selection, theme
definitions, supported tool drafts, game saves, and notes. Foreign keys from
other sites on the same origin are never exported, cleared, or overwritten.

- **Export:** downloads only `tgb:` keys (oversize values skipped).
- **Import:** validates size (≤2 MB), JSON, source (`ToolsHub`), version
  (1–2), shape, namespace, and per-value limits *before* writing anything.
  Choose **Merge** (backup wins on conflict, rest kept) or **Replace** (app data
  cleared first, then restore). Nothing applies until you confirm; failures leave
  existing data untouched and report a localized reason.
- **Clear:** removes only this app's keys after an explicit confirmation dialog.
- If browser storage is full or unavailable (private browsing), the app warns
  and continues without crashing.

Sensitive inputs — the whole crypto category plus password/passphrase/secret/
token/TOTP/JWT/encrypt/decrypt patterns — are never written to storage, never
exported, and show a “never remembered” note.

## Run locally

Requires `corepack pnpm` (pnpm 10.4.1, Node 24 — see `.nvmrc`):

```bash
corepack pnpm install
corepack pnpm dev
```

Checks, tests (with coverage gate), and build:

```bash
corepack pnpm run check
corepack pnpm run test:coverage
corepack pnpm run build
corepack pnpm run budget
```

Extra audits (plain Node, no runner):

```bash
node scripts/i18n-parity.mjs
node scripts/hardcoded-strings.mjs
node scripts/class-audit.mjs
node scripts/theme-contrast.mjs
node scripts/shell-audit.mjs   # after a build
```

## Deployment

Live at https://tools-hub-71.vercel.app/ (static `dist/public` on Vercel).

The site is designed for static hosting, including GitHub Pages. It uses
hash-based routes (`#/tools/word-counter`) so direct visits, refreshes, and
deep links work without server rewrite rules; `client/public/404.html` covers
old path-style links.

- Canonical/OG/sitemap URLs default to the production origin; override per
  deploy with `VITE_SITE_URL=https://<preview>.vercel.app` (Vercel URLs are
  also picked up automatically). `robots.txt` + `sitemap.xml` are generated.
- `vercel.json` ships security headers (CSP without any third-party origin,
  `nosniff`, `DENY` framing, minimal `Permissions-Policy`) and `no-cache`
  for the worker/manifest.
- Self-host option: `corepack pnpm run build && corepack pnpm start` serves
  `dist/public` with immutable caching for hashed assets and a `/healthz`
  endpoint (see `server/index.ts`).

## Browser support and limitations

- Needs `localStorage`, Web Crypto (`crypto.subtle`), `clipboard`, `FileReader`/`arrayBuffer`.
- Private browsing: storage calls fall back gracefully with a warning.
- `crypto.subtle` requires a secure context (https or localhost).
- Hash tools provide SHA-1/256/384/512. MD5/SHA3 are not offered; SHA-1 is a
  checksum only — never use hashes to store passwords.
- File hashing caps at 50 MB per file; data backups cap at 2 MB / 2000 keys.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `/` | Focus search: the home hero field on the home page, the header field elsewhere. Ignored while typing in a field. |
| `Ctrl`/`Cmd` + `K` | Focus search from anywhere, including while a field has focus. On viewports where the header field is collapsed into the menu, this opens the menu and focuses the field inside it. |

Typing in either field shows live, ranked suggestions — arrow keys move the highlight,
Enter opens the highlighted tool, and Enter with nothing highlighted opens the filtered
tool list. Escape closes the suggestions and keeps focus in the field.

## Game controls

All 32 playable games: keyboard-only and touch-only full rounds supported.
Bindings are shown in each game's UI and localized. Heavy tool parsers
(SQL, YAML, Markdown…) download on first use of that tool only.

| Game | Keyboard | Touch |
|---|---|---|
| Snake | Arrows/WASD move, Esc/P pause, R restart, Space/Enter start | 4-way d-pad + swipe |
| Tetris | ←→↓ move, ↑/X rotate right, Z rotate left, Space hard-drop, Esc/P pause, R restart | ←→↓ d-pad + ↻/↺/⤓ buttons + swipe (down = hard-drop) |
| 2048 | Arrows/WASD slide, Esc/P pause, R restart | 4-way d-pad + swipe |
| Sky Hopper | Space/Enter hop, Esc/P pause, R restart | Wide action button + tap board |
| Brick Breaker | ←→/AD paddle, Space/Enter launch, Esc/P pause, R restart | ◀▶ buttons + wide launch + drag paddle |
| Tic Tac Toe | Arrows move cursor, Enter/Space place, Esc/P pause, R restart | Tap cell directly |
| Connect Four | Arrows move column, Enter/Space drop, Esc/P pause, R restart | Tap column or Action button |
| Memory Match | Arrows move cursor, Enter/Space flip, Esc/P pause, R restart | Tap card directly |
| 15 Puzzle | Arrows move cursor, Enter/Space slide, Esc/P pause, R restart | Tap tile to slide |
| Hangman | A–Z guess, Esc/P pause (R suppressed while typing) | On-screen A–Z pad |
| Geo Quiz | Tab + Enter on choices, Esc/P pause, R restart | Tap choice button |
| Math Sprint | 0–9 entry, Backspace erase, Enter submit, Esc/P pause, R restart | 1–9 pad + 0 key + erase + submit |
| Word Grid | A–Z entry, Backspace erase, Enter submit, Esc/P pause (R suppressed) | On-screen A–Z pad + erase + submit |
| Anagram Sprint | A–Z entry, Backspace erase, Enter submit, F skip, Esc/P pause (R suppressed) | On-screen A–Z pad + submit + skip + erase |
| Word Search | Arrows move, Enter/Space anchor + submit, drag path, Esc/P pause, R restart | Finger-drag across the grid |
| Type Blaster | A–Z targeting, Backspace untarget, Esc/P pause (R suppressed) | On-screen A–Z pad + erase |
| Minesweeper | Arrows move, Enter/Space reveal, Shift+Enter/F flag, Esc/P pause, R restart | Tap reveal, long-press flag |
| Sudoku | Arrows move, 1–9 entry, Backspace clear, F notes, Esc/P pause, R restart | Tap cell + 1–9 pad + erase + notes |
| Maze Runner | Arrows/WASD step, Esc/P pause, R restart | 4-way d-pad + swipe |
| Space Defenders | ←→/AD move, Space fire, Shift/F bomb, Esc/P pause, R restart | ◀▶ d-pad + fire + bomb buttons |
| Dino Dash | ↑/Space jump, ↓ duck (hold), Esc/P pause, R restart | ▲▼ buttons + swipe up |
| Water Sort | Arrows move tube, Enter select/pour, Backspace undo, Esc/P pause, R restart | Tap source → tap dest |
| Block Fit | Arrows move, Enter place, F rotate, Esc/P pause, R restart | Tap tray piece → tap cell |
| Idle Workshop | Tab + Enter/Space on shop buttons, Esc/P pause, R restart | Tap buttons directly |
| Asteroids | ←→ rotate, ↑ thrust, Space fire, Shift/F hyperspace, Esc/P pause, R restart | Rotate + thrust buttons + fire + hyperspace |
| Maze Chaser | Arrows/WASD steer, Esc/P pause, R restart | 4-way d-pad + swipe |
| Checkers | Arrows move, Enter select + land, Esc/P pause, R restart | Tap piece → tap target |
| Fruit Merge | ←→ aim, Space drop, Esc/P pause, R restart | Drag to aim, release to drop |
| Hill Rider | →/↑ throttle, ←/↓ brake, Esc/P pause, R restart | 4-way d-pad (held) |
| Pocket Pool | ←→ aim, ↑↓ power, Space shoot, Esc/P pause, R restart | Pull-back drag to shoot, tap to aim |
| Territory Loop | Arrows/WASD steer, Esc/P pause, R restart | 4-way d-pad + swipe |
| Tower Guard | Arrows move cursor, Enter build/select, F upgrade, Backspace sell, Esc/P pause, R restart | Tap shop buttons: tower type, wave, upgrade, sell |

Games pause on tab switch, survive resize/rotate, reset cleanly on double
restart, and persist best score locally.

## Technology

- React 19 + TypeScript + Vite
- Wouter with hash routing
- Tailwind CSS v4 with CSS custom-property theme tokens
- Self-hosted fonts (Fontsource: Noto Sans Bengali, Space Grotesk, DM Mono)
- Service worker (precache + cache-first, no third-party requests)
- Browser-native storage, file, and Web Crypto APIs
- Vitest: 56 files / 311 tests (logic + jsdom component + axe a11y) with a v8 coverage gate; CI also runs shell/SEO, i18n, contrast, and bundle-budget audits

## License

MIT — see `LICENSE`.
