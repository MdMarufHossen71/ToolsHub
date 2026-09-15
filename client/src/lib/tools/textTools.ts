/** Text & String wave: pure string transforms over named fields. */
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";

const ZALGO_UP = ["̀", "́", "̂", "̃", "̄", "̅", "̆", "̇", "̈", "̉", "̊", "̋", "̌", "̍", "̎", "̏", "̐", "̑", "̒", "̓"];
const ZALGO_MID = ["̖", "̗", "̘", "̙", "̜", "̝", "̞", "̟", "̠", "̡", "̢", "̣", "̤", "̥", "̦", "̧", "̨", "̩", "̪", "̫"];
const ZALGO_DOWN = ["̰", "̱", "̲", "̳", "̴", "̵", "̶", "̷", "̸", "̹", "̺", "̻", "̼", "̽", "̾", "̿", "̀", "́", "͂", "̓"];

function zalgo(input: string, level: string): string {
  const count = level === "mini" ? 1 : level === "maxi" ? 6 : 3;
  // `Array.from` keeps emoji / surrogate pairs intact; `split("")` would insert
  // combining marks between the halves and corrupt the character.
  return Array.from(input)
    .map((char) => {
      if (char === "\n") return char;
      let out = char;
      for (let i = 0; i < count; i += 1) {
        out += ZALGO_UP[Math.floor(Math.random() * ZALGO_UP.length)];
        if (i % 2 === 0) out += ZALGO_MID[Math.floor(Math.random() * ZALGO_MID.length)];
        out += ZALGO_DOWN[Math.floor(Math.random() * ZALGO_DOWN.length)];
      }
      return out;
    })
    .join("");
}

const LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.",
  "Deserunt mollit anim id est laborum sed ut perspiciatis unde omnis.",
  "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.",
  "Neque porro quisquam est qui dolorem ipsum quia dolor sit amet.",
];

const SENTENCE_SUBJECTS = ["The river", "A coder", "The cat", "Morning light", "An old map", "The monsoon", "A quiet bus", "The market"];
const SENTENCE_VERBS = ["crosses", "compiles", "chases", "wakes", "hides", "soaks", "carries", "remembers"];
const SENTENCE_OBJECTS = ["the sleepy town", "a thousand fireflies", "yesterday's rain", "the last train", "an unsent letter", "the citadel gates", "a mango orchard", "the winter sun"];

const EMOJI_GROUPS: Array<[string, string[]]> = [
  ["Smileys", ["😀", "😁", "😂", "🤣", "😊", "😍", "🤔", "😴", "🥳", "😎", "😭", "😡"]],
  ["Gestures", ["👍", "👎", "👏", "🙏", "💪", "👋", "✌️", "🤝", "👀", "🙌"]],
  ["Nature", ["🌸", "🌙", "⭐", "🔥", "🌊", "🍎", "🌵", "🐱", "🦁", "🐟"]],
  ["Objects", ["⚽", "🎮", "🚀", "💡", "📚", "🎁", "💰", "🔑", "⏰", "✈️"]],
  ["Symbols", ["❤️", "✅", "❌", "⚠️", "♻️", "☂️", "☃️", "★", "▶️", "◀️", "©️", "®️"]],
];

const KAOMOJI_GROUPS: Array<[string, string[]]> = [
  ["Joy", ["(＾▽＾)", "(￣▽￣)", "(≧◡≦)", "＼(＾▽＾)／", "(o^▽^o)"]],
  ["Love", ["(♥‿♥)", "(๑♡⌓♡๑)", "♡(˃͈ દ ˂͈ ༶ )", "(◕‿◕)♡"]],
  ["Sad", ["(╥_╥)", "(T_T)", "(;_;)", "(／_＼)"]],
  ["Angry", ["(╬ಠ益ಠ)", "(҂⌣̀_⌣́)", "୧((#Φ益Φ#))୨"]],
  ["Surprised", ["(⊙_⊙)", "(°o°)", "w(°ｏ°)w"]],
  ["Sleepy", ["(－_－) zzZ", "(∪｡∪)｡｡｡zzz", "(－‿－)"]],
];

const BENGALI_BLOCK: Array<[string, string]> = [
  ["অ", "BENGALI LETTER A"], ["আ", "BENGALI LETTER AA"], ["ই", "BENGALI LETTER I"], ["ঈ", "BENGALI LETTER II"],
  ["উ", "BENGALI LETTER U"], ["ঊ", "BENGALI LETTER UU"], ["এ", "BENGALI LETTER E"], ["ঐ", "BENGALI LETTER AI"],
  ["ও", "BENGALI LETTER O"], ["ঔ", "BENGALI LETTER AU"], ["ক", "BENGALI LETTER KA"], ["খ", "BENGALI LETTER KHA"],
  ["গ", "BENGALI LETTER GA"], ["চ", "BENGALI LETTER CA"], ["ছ", "BENGALI LETTER CHA"], ["জ", "BENGALI LETTER JA"],
  ["ট", "BENGALI LETTER TTA"], ["ড", "BENGALI LETTER DDA"], ["ত", "BENGALI LETTER TA"], ["থ", "BENGALI LETTER THA"],
  ["দ", "BENGALI LETTER DA"], ["ন", "BENGALI LETTER NA"], ["প", "BENGALI LETTER PA"], ["ম", "BENGALI LETTER MA"],
  ["য", "BENGALI LETTER YA"], ["র", "BENGALI LETTER RA"], ["ল", "BENGALI LETTER LA"], ["স", "BENGALI LETTER SA"],
  ["হ", "BENGALI LETTER HA"], ["০", "BENGALI DIGIT ZERO"], ["১", "BENGALI DIGIT ONE"], ["২", "BENGALI DIGIT TWO"],
  ["৩", "BENGALI DIGIT THREE"], ["৪", "BENGALI DIGIT FOUR"], ["৫", "BENGALI DIGIT FIVE"], ["৬", "BENGALI DIGIT SIX"],
  ["৭", "BENGALI DIGIT SEVEN"], ["৮", "BENGALI DIGIT EIGHT"], ["৯", "BENGALI DIGIT NINE"], ["।", "DEVANAGARI DANDA"],
  ["ঁ", "BENGALI SIGN CANDRABINDU"], ["ং", "BENGALI SIGN ANUSVARA"], ["ঃ", "BENGALI SIGN VISARGA"], ["া", "BENGALI VOWEL SIGN AA"],
  ["ি", "BENGALI VOWEL SIGN I"], ["ী", "BENGALI VOWEL SIGN II"], ["ু", "BENGALI VOWEL SIGN U"], ["ূ", "BENGALI VOWEL SIGN UU"],
  ["ৃ", "BENGALI VOWEL SIGN VOCALIC R"], ["ে", "BENGALI VOWEL SIGN E"], ["ৈ", "BENGALI VOWEL SIGN AI"], ["ো", "BENGALI VOWEL SIGN O"],
  ["ৌ", "BENGALI VOWEL SIGN AU"], ["্", "BENGALI SIGN VIRAMA"], ["ৎ", "BENGALI LETTER KHANDA TA"], ["ড়", "BENGALI LETTER RRA"],
  ["ঢ়", "BENGALI LETTER RHA"], ["য়", "BENGALI LETTER YYA"],
];

const LATIN_SYMBOLS: Array<[string, string]> = [
  ["©", "COPYRIGHT SIGN"], ["®", "REGISTERED SIGN"], ["™", "TRADE MARK SIGN"], ["°", "DEGREE SIGN"],
  ["±", "PLUS-MINUS SIGN"], ["×", "MULTIPLICATION SIGN"], ["÷", "DIVISION SIGN"], ["€", "EURO SIGN"],
  ["£", "POUND SIGN"], ["¥", "YEN SIGN"], ["§", "SECTION SIGN"], ["¶", "PILCROW SIGN"],
  ["•", "BULLET"], ["…", "HORIZONTAL ELLIPSIS"], ["–", "EN DASH"], ["—", "EM DASH"],
  ["«", "LEFT-POINTING DOUBLE ANGLE QUOTATION MARK"], ["»", "RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK"],
  ["‹", "SINGLE LEFT-POINTING ANGLE QUOTATION MARK"], ["›", "SINGLE RIGHT-POINTING ANGLE QUOTATION MARK"],
  ["¼", "VULGAR FRACTION ONE QUARTER"], ["½", "VULGAR FRACTION ONE HALF"], ["¾", "VULGAR FRACTION THREE QUARTERS"],
  ["‰", "PER MILLE SIGN"], ["†", "DAGGER"], ["‡", "DOUBLE DAGGER"], ["•", "BULLET OPERATOR"],
];

const ARROWS: Array<[string, string]> = [
  ["←", "LEFTWARDS ARROW"], ["↑", "UPWARDS ARROW"], ["→", "RIGHTWARDS ARROW"], ["↓", "DOWNWARDS ARROW"],
  ["↔", "LEFT RIGHT ARROW"], ["↕", "UP DOWN ARROW"], ["↖", "NORTH WEST ARROW"], ["↗", "NORTH EAST ARROW"],
  ["↘", "SOUTH EAST ARROW"], ["↙", "SOUTH WEST ARROW"], ["⇒", "RIGHTWARDS DOUBLE ARROW"], ["⇐", "LEFTWARDS DOUBLE ARROW"],
  ["⇔", "LEFT RIGHT DOUBLE ARROW"], ["↵", "DOWNWARDS ARROW WITH CORNER LEFTWARDS"], ["⟵", "LONG LEFTWARDS ARROW"],
  ["⟶", "LONG RIGHTWARDS ARROW"], ["⤴", "ARROW POINTING RIGHTWARDS THEN CURVING UPWARDS"], ["⤵", "ARROW POINTING RIGHTWARDS THEN CURVING DOWNWARDS"],
];

function codePointOf(char: string): string {
  const code = char.codePointAt(0) ?? 0;
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

export const runTextTools: ToolRunner = async (slug, input, _option, t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);

  if (slug === "text-repeater") {
    const text = F("text", input);
    const count = Math.min(Math.max(Number(F("count", "3")) || 1, 1), 1000);
    const separator = F("separator", "\n").replace(/\\n/g, "\n");
    return { text: Array(count).fill(text).join(separator) };
  }
  if (slug === "find-replace") {
    const text = F("text", input);
    const find = F("find");
    if (!find) throw new ToolError("tool.error.generic");
    return { text: text.split(find).join(F("replace")) };
  }
  if (slug === "filter-lines") {
    const lines = F("text", input).split("\n");
    const pattern = F("pattern").toLowerCase();
    const keep = F("mode", "keep") === "keep";
    return { text: lines.filter((line) => (pattern === "" ? true : line.toLowerCase().includes(pattern)) === keep).join("\n") };
  }
  if (slug === "add-text-to-each-line") {
    const prefix = F("prefix");
    const suffix = F("suffix");
    return { text: F("text", input).split("\n").map((line) => `${prefix}${line}${suffix}`).join("\n") };
  }
  if (slug === "tabs-to-spaces") {
    const spaces = Math.min(Math.max(Number(F("spaces", "4")) || 4, 1), 16);
    return { text: F("text", input).replace(/\t/g, " ".repeat(spaces)) };
  }
  if (slug === "comma-inserter") {
    if (F("mode", "comma") === "lines") {
      return { text: F("text", input).split("\n").map((line) => line.trim()).filter(Boolean).join(", ") };
    }
    return { text: F("text", input).replace(/\d[\d,]*/g, (match) => match.replace(/,/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")) };
  }
  if (slug === "text-splitter") {
    const delimiter = F("delimiter", ",");
    return { text: F("text", input).split(delimiter).map((part) => part.trim()).join("\n") };
  }
  if (slug === "space-remover") return { text: F("text", input).replace(/\s+/g, "") };
  if (slug === "character-remover") {
    const text = F("text", input);
    const mode = F("mode", "nondigits");
    if (mode === "nondigits") return { text: text.replace(/\D+/g, "") };
    if (mode === "nonletters") return { text: text.replace(/[^A-Za-zঀ-৿]+/g, "") };
    if (mode === "punct") return { text: text.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~।]+/g, "") };
    return { text: text.replace(/[0-9০-৯]+/g, "") };
  }
  if (slug === "string-obfuscator") {
    const visible = Math.min(Math.max(Number(F("visible", "2")) || 0, 0), 20);
    const chars = Array.from(F("text", input));
    if (chars.length <= visible * 2) return { text: "•".repeat(chars.length) };
    return { text: chars.slice(0, visible).join("") + "•".repeat(chars.length - visible * 2) + chars.slice(-visible).join("") };
  }
  if (slug === "text-censor") {
    const banned = F("words").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    let out = F("text", input);
    for (const word of banned) {
      out = out.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (match) => (match[0] ?? "*") + "*".repeat(Math.max(0, match.length - 1)));
    }
    return { text: out };
  }
  if (slug === "text-to-unicode") {
    // `Array.from` keeps astral characters (emoji) as one unit so `U+1F600` is
    // reported, not two surrogate halves.
    return { text: Array.from(F("text", input)).map((char) => codePointOf(char)).join(" ") };
  }
  if (slug === "zalgo-text-generator") return { text: zalgo(F("text", input), F("mode", "normal")) };
  if (slug === "numeronym-generator") {
    const out = F("text", input)
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        const chars = Array.from(word);
        return chars.length <= 3 ? word : `${chars[0]}${chars.length - 2}${chars[chars.length - 1]}`;
      });
    return { text: out.join(" ") };
  }
  if (slug === "lorem-ipsum-generator") {
    const paras = Math.min(Math.max(Number(F("paras", "3")) || 3, 1), 20);
    const out: string[] = [];
    for (let i = 0; i < paras; i += 1) {
      const sentences = 3 + Math.floor(Math.random() * 3);
      const lines: string[] = [];
      for (let s = 0; s < sentences; s += 1) lines.push(LOREM[(i * 3 + s) % LOREM.length]);
      out.push(lines.join(" "));
    }
    return { text: out.join("\n\n") };
  }
  if (slug === "random-sentence-generator") {
    const count = Math.min(Math.max(Number(F("count", "3")) || 3, 1), 50);
    const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) out.push(`${pick(SENTENCE_SUBJECTS)} ${pick(SENTENCE_VERBS)} ${pick(SENTENCE_OBJECTS)}.`);
    return { text: out.join(" ") };
  }
  if (slug === "regex-replacer") {
    const pattern = F("pattern");
    if (!pattern) throw new ToolError("tool.error.generic");
    let flags = F("flags", "g").replace(/[^dgimsuy]/g, "");
    if (!flags.includes("g")) flags += "g";
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      throw new ToolError("tool.error.generic");
    }
    return { text: F("text", input).replace(regex, F("replacement")) };
  }
  if (slug === "emoji-kaomoji-picker") {
    const groups = F("mode", "emoji") === "kaomoji" ? KAOMOJI_GROUPS : EMOJI_GROUPS;
    return {
      text: groups.map(([name, items]) => `${name}: ${items.join(" ")}`).join("\n"),
      table: { head: ["Group", "Pick any — tap Copy, then paste"], rows: groups.map(([name, items]) => [name, items.join(" ")]) },
    };
  }
  if (slug === "unicode-character-finder") {
    const query = F("query").toLowerCase();
    const mode = F("mode", "bengali");
    const table = mode === "latin" ? LATIN_SYMBOLS : mode === "arrows" ? ARROWS : BENGALI_BLOCK;
    const rows = table
      .filter(([char, name]) => query === "" || name.toLowerCase().includes(query) || char === query)
      .slice(0, 60)
      .map(([char, name]) => [char, codePointOf(char), name]);
    return {
      text: rows.map(([char, code, name]) => `${char} ${code} ${name}`).join("\n") || t("tool.error.generic"),
      table: { head: ["Char", "Code", "Name"], rows },
    };
  }
  if (slug === "ascii-art-text-generator") {
    const text = F("text", "Hi").replace(/[^A-Za-z0-9 !?.,'-]/g, "").slice(0, 20);
    if (!text.trim()) throw new ToolError("tool.error.generic");
    const font = ["Standard", "Small", "Big"].includes(F("mode", "Standard")) ? F("mode", "Standard") : "Standard";
    const figlet = (await import("figlet")).default;
    // Browser bundles cannot read the .flf files off disk; the importable
    // font modules carry the same data as JS for dynamic loading.
    const fontData = (await import(`figlet/importable-fonts/${font}.js`)) as { default: string };
    figlet.parseFont(font, fontData.default);
    return { text: figlet.textSync(text, { font }) };
  }
  if (slug === "text-diff-checker") {
    const { diffLines } = await import("diff");
    const parts = diffLines(F("text", input), F("text2"));
    const added = parts.filter((p: { added?: boolean }) => p.added).reduce((n: number, p: { count?: number }) => n + (p.count ?? 0), 0);
    const removed = parts.filter((p: { removed?: boolean }) => p.removed).reduce((n: number, p: { count?: number }) => n + (p.count ?? 0), 0);
    return {
      text: parts.map((part: { added?: boolean; removed?: boolean; value: string }) => (part.added ? "+ " : part.removed ? "- " : "  ") + part.value).join(""),
      table: { head: ["Metric", "Lines"], rows: [["Added", String(added)], ["Removed", String(removed)]] },
    };
  }
  return null;
};
