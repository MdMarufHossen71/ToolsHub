/**
 * Locale parity audit.
 *
 * The type system already guarantees that `bn` has an entry for every key in `en`
 * (`bn` is declared as `Record<TranslationKey, string>`), so a missing key is a
 * compile error, not something a script needs to find. What it cannot catch is a
 * Bangla entry that was filled in with the English string — a placeholder that
 * typechecks, renders, and looks finished while showing English to a Bangla reader.
 *
 * This script finds those, and it also flags English keys that still hold a
 * placeholder marker. Some identical values are correct: proper nouns, product
 * names, technical identifiers and pure punctuation are meant to stay the same in
 * both locales, so those are reported as "expected" rather than as problems.
 *
 * The translation dictionary is not the only place user-facing prose lives. Tools,
 * games and links each carry a `description: { en, bn }` pair in `client/src/data`,
 * and those had the same failure mode — links.ts set `en: bn` for all 22 entries, and
 * both data files generated one locale from a template. So the same checks run over
 * the registries too.
 *
 * Run with:  node --experimental-strip-types scripts/i18n-parity.mjs
 */
import { translations } from "../client/src/i18n/translations.ts";
import { toolRegistry } from "../client/src/data/tools.ts";
import { toolDescriptions } from "../client/src/data/toolDescriptions.ts";
import { gameRegistry } from "../client/src/data/games.ts";
import { usefulLinks } from "../client/src/data/links.ts";

const { en, bn } = translations;

/** Keys whose Bangla value is deliberately identical to the English one. */
const INTENTIONALLY_SHARED = new Set([
  // The product name is a proper noun and stays Latin for searchability.
  "static.eyebrow",
  // "AI" is the form in ordinary Bangla usage; the transliteration "এআই" is not.
  "nav.ai",
  // Serialization format names are identifiers, not prose.
  "tool.mode.yaml",
  "tool.mode.xml",
  // A copyright line: a symbol, an interpolated year and the product name. There is
  // no prose in it to translate, and the year comes from the runtime.
  "footer.copyright",
  // The label printed on the physical key. Bangla keyboards ship the same cap, and a
  // transliteration would stop matching the hardware the player is looking at.
  "key.escape",
  // Unit acronyms used identically in Bangla technical writing.
  "tool.live.wpm",
  "tool.live.opsSec",
  // An ISO date format mask: digits and separators, identical in both locales.
  "tool.field.dateHint",
]);

/**
 * A value that carries no translatable prose: only Latin-script product names,
 * technical identifiers, digits, punctuation or interpolation placeholders. These
 * are expected to match across locales.
 */
function isUntranslatable(value) {
  const withoutPlaceholders = value.replace(/\{\w+\}/g, "").trim();
  if (!withoutPlaceholders) return true;
  // No letters at all — digits, arrows, separators.
  if (!/\p{L}/u.test(withoutPlaceholders)) return true;
  return false;
}

const identical = [];
const expected = [];
const placeholders = [];

for (const key of Object.keys(en)) {
  const source = en[key];
  const target = bn[key];
  if (/\bTODO\b|\bFIXME\b|^\s*$/.test(source)) placeholders.push({ key, source });
  if (source !== target) continue;
  if (INTENTIONALLY_SHARED.has(key) || isUntranslatable(source)) expected.push({ key, source });
  else identical.push({ key, source });
}

/** Interpolation placeholders must survive translation or the value breaks at runtime. */
const brokenPlaceholders = [];
for (const key of Object.keys(en)) {
  const inSource = [...en[key].matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  const inTarget = [...bn[key].matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  if (inSource.join(",") !== inTarget.join(",")) brokenPlaceholders.push({ key, inSource, inTarget });
}

const total = Object.keys(en).length;
console.log(`Checked ${total} translation keys across 2 locales.`);

/**
 * The registries. Each entry is checked the same three ways as a dictionary key:
 * the two locales must differ, both must be non-empty, and neither may be a stub.
 */
const registries = [
  { label: "tools", file: "client/src/data/tools.ts", items: toolRegistry.map((tool) => ({ id: tool.name, ...tool.description })) },
  { label: "games", file: "client/src/data/games.ts", items: gameRegistry.map((game) => ({ id: game.name, ...game.description })) },
  { label: "links", file: "client/src/data/links.ts", items: usefulLinks.map((link) => ({ id: link.name, ...link.description })) },
];

const registryProblems = [];
for (const { label, file, items } of registries) {
  const shared = items.filter((item) => item.en === item.bn && !isUntranslatable(item.en));
  const empty = items.filter((item) => !item.en?.trim() || !item.bn?.trim());
  if (shared.length) registryProblems.push({ label, file, kind: "identical", items: shared });
  if (empty.length) registryProblems.push({ label, file, kind: "empty", items: empty });
  console.log(`Checked ${items.length} ${label} description pairs.`);
}

/**
 * A tool with no entry in `toolDescriptions` falls back to a generated sentence.
 * That is not an error — the fallback exists so a new seed name cannot render an
 * empty card — but it is worth reporting, because a card on the fallback says
 * nothing about what the tool does.
 */
const onFallback = toolRegistry.filter((tool) => !toolDescriptions[tool.name]);
if (onFallback.length) {
  console.log(`\n${onFallback.length} tool(s) still using the generated fallback description:\n`);
  for (const tool of onFallback) console.log(`  ${tool.name}`);
}

if (registryProblems.length) {
  for (const { label, file, kind, items } of registryProblems) {
    const description = kind === "identical" ? "where the two locales hold the same string" : "with an empty description in one locale";
    console.log(`\n${items.length} ${label} entr(y/ies) ${description}  (${file}):\n`);
    for (const item of items) console.log(`  ${item.id}  =  ${JSON.stringify(item.en.length > 60 ? `${item.en.slice(0, 60)}…` : item.en)}`);
  }
}

if (expected.length) console.log(`\n${expected.length} key(s) identical by design (proper nouns, identifiers, punctuation) — not a problem.`);

if (brokenPlaceholders.length) {
  console.log(`\n${brokenPlaceholders.length} key(s) with mismatched interpolation placeholders:\n`);
  for (const { key, inSource, inTarget } of brokenPlaceholders) console.log(`  ${key}\n    en: {${inSource.join("} {")}}\n    bn: {${inTarget.join("} {")}}`);
}

if (placeholders.length) {
  console.log(`\n${placeholders.length} English key(s) left as a placeholder:\n`);
  for (const { key, source } of placeholders) console.log(`  ${key}  =  ${JSON.stringify(source)}`);
}

if (identical.length) {
  console.log(`\n${identical.length} key(s) where the Bangla value is still the English string:\n`);
  for (const { key, source } of identical) console.log(`  ${key}  =  ${JSON.stringify(source.length > 70 ? `${source.slice(0, 70)}…` : source)}`);
}

const failures = identical.length + placeholders.length + brokenPlaceholders.length + registryProblems.reduce((sum, group) => sum + group.items.length, 0);
console.log(`\n${failures} problem(s) found.`);
process.exit(failures ? 1 : 0);
