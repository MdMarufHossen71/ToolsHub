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
      // Modulo-bounded into the eight sentences; `?? ""` is type-level only.
      for (let s = 0; s < sentences; s += 1) lines.push(LOREM[(i * 3 + s) % LOREM.length] ?? "");
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
  if (slug === "line-numberer") {
    const text = F("text", input);
    const start = Math.max(1, Math.floor(Number(F("start", "1")) || 1));
    return { text: text.split("\n").map((line, index) => `${start + index}. ${line}`).join("\n") };
  }
  if (slug === "sentence-counter") {
    const text = F("text", input);
    const count = (text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).filter((s) => s.trim().length > 0).length;
    return { text: JSON.stringify({ sentences: text.trim() ? count : 0 }, null, 2) };
  }
  if (slug === "reading-time") {
    const text = F("text", input);
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return { text: JSON.stringify({ words, characters: text.length, minutes }, null, 2) };
  }
  if (slug === "url-extractor") {
    const text = F("text", input);
    const found = Array.from(new Set(text.match(/https?:\/\/[^\s<>"']+/g) ?? []));
    return { text: found.join("\n") };
  }
  if (slug === "fancy-text") {
    const text = F("text", input);
    const mode = F("mode", "bold");
    const styled = Array.from(text).map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (mode === "monospace") {
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d670 + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d68a + (code - 97));
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7f6 + (code - 48));
        return char;
      }
      if (mode === "italic") {
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d434 + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d44e + (code - 97));
        return char;
      }
      // Default bold: A-Z, a-z, 0-9 in the Mathematical Alphanumeric block.
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d400 + (code - 65));
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d41a + (code - 97));
      if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7ce + (code - 48));
      return char;
    });
    return { text: styled.join("") };
  }
  if (slug === "gmail-alias-variations") {
    const value = F("text", input).trim().toLowerCase();
    const [local, domain] = value.split("@");
    if (!local || !/^(gmail\.com|googlemail\.com)$/i.test(domain ?? "") || !/^[a-z0-9.]+$/.test(local)) throw new ToolError("tool.error.generic");
    const clean = local.replace(/\./g, "");
    if (clean.length < 2) throw new ToolError("tool.error.generic");
    const variants = Array.from(new Set([
      `${clean}@${domain}`,
      `${clean.slice(0, 1)}.${clean.slice(1)}@${domain}`,
      `${clean.slice(0, 2)}.${clean.slice(2)}@${domain}`,
      `${clean}+personal@${domain}`,
      `${clean}+newsletters@${domain}`,
      `${clean}+receipts@${domain}`,
      `${clean}+shopping@${domain}`,
    ]));
    return { text: `Aliases only — these are not new email accounts.\n${variants.slice(0, 7).join("\n")}` };
  }
  if (slug === "email-syntax-advisor") {
    const value = F("text", input).trim().toLowerCase();
    const [local = "", domain = ""] = value.split("@");
    const warnings = [
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && "Use a standard local@domain.tld format",
      local.length > 64 && "Local part is longer than 64 characters",
      domain.length > 253 && "Domain is longer than 253 characters",
      /\.\./.test(value) && "Avoid consecutive dots",
      /@gmail\.con$/.test(value) && "Did you mean gmail.com?",
    ].filter(Boolean);
    return {
      text: JSON.stringify(
        {
          syntax: warnings.length ? "needs review" : "format looks valid",
          localPart: local || null,
          domain: domain || null,
          warnings,
          limitation: "Local format checks only; this does not verify that a mailbox exists or can receive mail.",
        },
        null,
        2,
      ),
    };
  }
  if (slug === "email-extractor") {
    const text = F("text", input);
    const found = Array.from(new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])).slice(0, 100);
    return { text: found.join("\n") };
  }
  if (slug === "email-pattern-builder") {
    const cleanPart = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    const first = cleanPart(F("first", ""));
    const last = cleanPart(F("last", ""));
    const domain = F("domain", "").trim().toLowerCase().replace(/^@/, "");
    const fallback = F("text", input);
    let f = first;
    let l = last;
    let d = domain;
    if ((!f || !l || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) && fallback) {
      const [fr = "", lr = "", dr = ""] = fallback.split(/[\n,]/);
      f = f || cleanPart(fr);
      l = l || cleanPart(lr);
      d = d || dr.trim().toLowerCase().replace(/^@/, "");
    }
    if (!f || !l || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) throw new ToolError("tool.error.generic");
    const candidates = [
      `${f}`, `${l}`, `${f}${l}`, `${f}.${l}`, `${f[0]}${l}`, `${f[0]}.${l}`,
      `${f}${l[0]}`, `${f}.${l[0]}`, `${l}${f}`, `${l}.${f}`, `${l}${f[0]}`, `${l}.${f[0]}`,
    ].map((name) => `${name}@${d}`);
    return { text: `Unverified naming patterns — do not treat these as confirmed contact addresses.\n${Array.from(new Set(candidates)).join("\n")}` };
  }
  if (slug === "mailto-link-builder") {
    const toRaw = F("to", F("text", input));
    const subject = F("subject", "");
    const body = F("body", "");
    const recipients = toRaw.split(/[;,\s]+/).filter(Boolean);
    if (recipients.length === 0 || !recipients.every((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new ToolError("tool.error.generic");
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (body) params.set("body", body);
    const query = params.size ? `?${params.toString()}` : "";
    return { text: `mailto:${recipients.join(",")}${query}` };
  }
  if (slug === "email-size-estimator") {
    const text = F("text", input);
    const bytes = new TextEncoder().encode(text).length;
    return {
      text: JSON.stringify(
        {
          characters: text.length,
          utf8Bytes: bytes,
          estimatedBase64Bytes: Math.ceil(bytes / 3) * 4,
          limitation: "Text-body estimate only; transport and attachment overhead can vary.",
        },
        null,
        2,
      ),
    };
  }
  if (slug === "email-signature-builder") {
    const name = F("name", "").trim() || F("text", input).split("\n")[0]?.trim() || "";
    if (!name) throw new ToolError("tool.error.generic");
    const title = F("title", "").trim();
    const company = F("company", "").trim();
    const phone = F("phone", "").trim();
    const website = F("website", "").trim();
    const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const middle = [title, company].filter(Boolean).join(" · ");
    const lines = [name, middle, phone, website].filter(Boolean);
    const html = lines.map((line) => esc(line)).join("<br>");
    return { text: `${lines.join("\n")}\n\nHTML:\n${html}` };
  }
  if (slug === "spam-wording-advisor") {
    const triggers = ["act now", "click here", "free", "guarantee", "urgent", "winner", "100%", "risk-free", "limited time", "buy now"];
    const lower = F("text", input).toLowerCase();
    const flagged = triggers.filter((word) => lower.includes(word));
    return {
      text: JSON.stringify(
        {
          flaggedPhrases: flagged,
          advisory: flagged.length ? "Review the flagged wording and make claims specific and supportable." : "No phrases from this small local advisory list were found.",
          limitation: "This local heuristic cannot predict spam-folder placement, reputation, or deliverability.",
        },
        null,
        2,
      ),
    };
  }
  if (slug === "subject-line-advisor") {
    const subject = F("subject", F("text", input)).trim();
    const guidance = [
      subject.length === 0 && "Add a subject line",
      subject.length > 60 && "Consider a shorter mobile-friendly subject",
      /^[A-Z\s\d!?.]+$/.test(subject) && subject.length > 2 && "Avoid all-capital wording",
      (subject.match(/!/g) ?? []).length > 1 && "Limit repeated exclamation marks",
    ].filter(Boolean);
    return {
      text: JSON.stringify(
        {
          characters: subject.length,
          guidance: guidance.length ? guidance : ["Length and punctuation look balanced."],
          limitation: "Editorial guidance only; this cannot predict open rates or inbox placement.",
        },
        null,
        2,
      ),
    };
  }
  return null;
};
