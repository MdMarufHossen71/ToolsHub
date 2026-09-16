/**
 * Per-tool input schemas for the workbench.
 *
 * A tool with no entry here gets the classic single textarea. A tool with an
 * entry renders a small form instead: named fields the branch reads by key,
 * plus an optional file picker and a one-click example. Labels are bilingual
 * inline pairs — field names are content (like tool names), so they live with
 * the schema rather than in the translation dictionary.
 */
import type { TranslationKey } from "@/i18n/translations";

export type FieldType = "text" | "number" | "range" | "select" | "checkbox" | "color" | "date" | "textarea";

export type Bilingual = { en: string; bn: string };

export type Field = {
  key: string;
  type: FieldType;
  label: Bilingual;
  default?: string;
  placeholder?: string;
  /** For `select`: value + bilingual label per option. */
  options?: Array<{ value: string; label: Bilingual }>;
  /** For `number`: passed straight to the input. */
  min?: string;
  max?: string;
  step?: string;
};

export type ToolSchema = {
  /** Named fields rendered as a form. Empty array = classic textarea. */
  fields: Field[];
  /** `accept` attribute when the tool takes files; implies the picker UI. */
  accept?: string;
  /** Allow picking several files (default single). */
  multiple?: boolean;
  /** Prefills the form or textarea. */
  example?: { text?: string; fields?: Record<string, string> };
  /** Short hint under the form; already localized at the call site. */
  hintKey?: TranslationKey;
};

const t = (en: string, bn: string): Bilingual => ({ en, bn });

const MODE_FIELD = (options: Array<{ value: string; en: string; bn: string }>, def: string): Field => ({
  key: "mode",
  type: "select",
  label: t("Mode", "মোড"),
  default: def,
  options: options.map((o) => ({ value: o.value, label: t(o.en, o.bn) })),
});

const schemas: Record<string, ToolSchema> = {
  // -- Text & String -------------------------------------------------------
  "text-repeater": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "ha" },
      { key: "count", type: "number", label: t("Times", "বার"), default: "3", min: "1", max: "1000" },
      { key: "separator", type: "text", label: t("Separator", "বিভাজক"), default: "\n" },
    ],
    example: { fields: { text: "ha", count: "3", separator: "\n" } },
  },
  "find-replace": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "hello world" },
      { key: "find", type: "text", label: t("Find", "খুঁজুন"), default: "world" },
      { key: "replace", type: "text", label: t("Replace with", "বদলে দিন"), default: "বাংলাদেশ" },
    ],
    example: { fields: { text: "hello world", find: "world", replace: "বাংলাদেশ" } },
  },
  "filter-lines": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "apple\nbanana\navocado" },
      { key: "pattern", type: "text", label: t("Contains", "যাতে আছে"), default: "av" },
      MODE_FIELD(
        [
          { value: "keep", en: "Keep matching", bn: "মিল রেখে দিন" },
          { value: "drop", en: "Remove matching", bn: "মিল মুছে দিন" },
        ],
        "keep",
      ),
    ],
    example: { fields: { pattern: "av", mode: "keep" } },
  },
  "add-text-to-each-line": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "one\ntwo" },
      { key: "prefix", type: "text", label: t("Prefix", "আগে যোগ"), default: "- " },
      { key: "suffix", type: "text", label: t("Suffix", "পরে যোগ"), default: "" },
    ],
    example: { fields: { prefix: "- " } },
  },
  "tabs-to-spaces": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "\tindented" },
      { key: "spaces", type: "number", label: t("Spaces per tab", "প্রতি ট্যাবে স্পেস"), default: "4", min: "1", max: "16" },
    ],
    example: { fields: { spaces: "4" } },
  },
  "comma-inserter": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "1000000" },
      MODE_FIELD(
        [
          { value: "comma", en: "Thousands comma", bn: "হাজার কমা" },
          { value: "lines", en: "Join lines with comma", bn: "লাইন কমায় জোড়া" },
        ],
        "comma",
      ),
    ],
    example: { fields: { mode: "comma" } },
  },
  "text-splitter": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "a,b,c" },
      { key: "delimiter", type: "text", label: t("Delimiter", "বিভাজক"), default: "," },
    ],
    example: { fields: { delimiter: "," } },
  },
  "space-remover": {
    fields: [{ key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "hello world" }],
    example: {},
  },
  "character-remover": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "Hello 123!" },
      MODE_FIELD(
        [
          { value: "nondigits", en: "Keep digits only", bn: "শুধু সংখ্যা" },
          { value: "nonletters", en: "Keep letters only", bn: "শুধু অক্ষর" },
          { value: "punct", en: "Remove punctuation", bn: "যতিচিহ্ন মুছুন" },
          { value: "digits", en: "Remove digits", bn: "সংখ্যা মুছুন" },
        ],
        "nondigits",
      ),
    ],
    example: { fields: { mode: "nondigits" } },
  },
  "string-obfuscator": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "hello@example.com" },
      { key: "visible", type: "number", label: t("Visible chars", "দৃশ্যমান অক্ষর"), default: "2", min: "0", max: "20" },
    ],
    example: { fields: { visible: "2" } },
  },
  "text-censor": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "this is bad and ugly" },
      { key: "words", type: "text", label: t("Words (comma separated)", "শব্দ (কমায়)"), default: "bad, ugly" },
    ],
    example: { fields: { words: "bad, ugly" } },
  },
  "text-to-unicode": {
    fields: [{ key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "Hi ক" }],
    example: {},
  },
  "zalgo-text-generator": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "spooky" },
      MODE_FIELD(
        [
          { value: "mini", en: "Mini", bn: "হালকা" },
          { value: "normal", en: "Normal", bn: "সাধারণ" },
          { value: "maxi", en: "Maxi", bn: "ভারী" },
        ],
        "normal",
      ),
    ],
    example: { fields: { mode: "normal" } },
  },
  "numeronym-generator": {
    fields: [{ key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "localization internationalization" }],
    example: {},
  },
  "lorem-ipsum-generator": {
    fields: [{ key: "paras", type: "number", label: t("Paragraphs", "অনুচ্ছেদ"), default: "3", min: "1", max: "20" }],
    example: { fields: { paras: "3" } },
  },
  "random-sentence-generator": {
    fields: [{ key: "count", type: "number", label: t("Sentences", "বাক্য"), default: "3", min: "1", max: "50" }],
    example: { fields: { count: "3" } },
  },
  "regex-replacer": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "Call 01711-223344 now" },
      { key: "pattern", type: "text", label: t("Pattern", "প্যাটার্ন"), default: "\\d[\\d-]*\\d" },
      { key: "flags", type: "text", label: t("Flags", "ফ্ল্যাগ"), default: "g" },
      { key: "replacement", type: "text", label: t("Replacement ($1…)", "প্রতিস্থাপন"), default: "[phone]" },
    ],
    example: { fields: { pattern: "\\d[\\d-]*\\d", flags: "g", replacement: "[phone]" } },
  },
  "emoji-kaomoji-picker": {
    fields: [
      MODE_FIELD(
        [
          { value: "emoji", en: "Emoji", bn: "ইমোজি" },
          { value: "kaomoji", en: "Kaomoji", bn: "কাওমোজি" },
        ],
        "emoji",
      ),
    ],
    example: { fields: { mode: "emoji" } },
  },
  "unicode-character-finder": {
    fields: [
      { key: "query", type: "text", label: t("Search", "খুঁজুন"), default: "bengali" },
      MODE_FIELD(
        [
          { value: "bengali", en: "Bengali block", bn: "বাংলা ব্লক" },
          { value: "latin", en: "Basic Latin symbols", bn: "ল্যাটিন চিহ্ন" },
          { value: "arrows", en: "Arrows", bn: "তীর" },
        ],
        "bengali",
      ),
    ],
    example: { fields: { query: "", mode: "bengali" } },
  },
  "ascii-art-text-generator": {
    fields: [
      { key: "text", type: "text", label: t("Text (A–Z 0–9)", "টেক্সট"), default: "Hi" },
      MODE_FIELD(
        [
          { value: "Standard", en: "Standard", bn: "Standard" },
          { value: "Small", en: "Small", bn: "Small" },
          { value: "Big", en: "Big", bn: "Big" },
        ],
        "Standard",
      ),
    ],
    example: { fields: { text: "Hi", mode: "Standard" } },
  },
  "text-diff-checker": {
    fields: [
      { key: "text", type: "textarea", label: t("First text", "প্রথম টেক্সট"), default: "line one\nline two" },
      { key: "text2", type: "textarea", label: t("Second text", "দ্বিতীয় টেক্সট"), default: "line one\nline 2" },
    ],
    example: {},
  },

  // -- Math & calculators --------------------------------------------------
  "area-calculator": {
    fields: [
      MODE_FIELD(
        [
          { value: "rect", en: "Rectangle", bn: "আয়তক্ষেত্র" },
          { value: "circle", en: "Circle", bn: "বৃত্ত" },
          { value: "triangle", en: "Triangle", bn: "ত্রিভুজ" },
        ],
        "rect",
      ),
      { key: "a", type: "number", label: t("Width / radius / base", "প্রস্থ / ব্যাসার্ধ / ভূমি"), default: "10" },
      { key: "b", type: "number", label: t("Height (if needed)", "উচ্চতা (লাগলে)"), default: "5" },
    ],
    example: { fields: { mode: "rect", a: "10", b: "5" } },
  },
  "rule-of-three": {
    fields: [
      { key: "a", type: "number", label: t("A", "ক"), default: "2" },
      { key: "b", type: "number", label: t("B", "খ"), default: "5" },
      { key: "c", type: "number", label: t("C", "গ"), default: "8" },
    ],
    example: { fields: { a: "2", b: "5", c: "8" } },
  },
  "trigonometry-calculator": {
    fields: [
      MODE_FIELD(
        [
          { value: "sin", en: "sin", bn: "sin" },
          { value: "cos", en: "cos", bn: "cos" },
          { value: "tan", en: "tan", bn: "tan" },
        ],
        "sin",
      ),
      { key: "angle", type: "range", label: t("Angle", "কোণ"), default: "30", min: "0", max: "360" },
      { key: "unit", type: "select", label: t("Unit", "একক"), default: "deg",
        options: [
          { value: "deg", label: t("Degrees", "ডিগ্রি") },
          { value: "rad", label: t("Radians", "রেডিয়ান") },
        ] },
    ],
    example: { fields: { mode: "sin", angle: "30" } },
  },
  "radians-degrees-converter": {
    fields: [
      { key: "value", type: "number", label: t("Value", "মান"), default: "180" },
      MODE_FIELD(
        [
          { value: "todeg", en: "Radians → degrees", bn: "রেডিয়ান → ডিগ্রি" },
          { value: "torad", en: "Degrees → radians", bn: "ডিগ্রি → রেডিয়ান" },
        ],
        "todeg",
      ),
    ],
    example: { fields: { value: "3.14159", mode: "torad" } },
  },
  "age-calculator": {
    fields: [{ key: "dob", type: "date", label: t("Birth date", "জন্ম তারিখ"), default: "2000-01-01" }],
    example: { fields: { dob: "2000-01-01" } },
  },
  "date-difference-calculator": {
    fields: [
      { key: "from", type: "date", label: t("From", "থেকে"), default: "2026-01-01" },
      { key: "to", type: "date", label: t("To", "পর্যন্ত"), default: "2026-12-31" },
    ],
    example: { fields: { from: "2026-01-01", to: "2026-12-31" } },
  },
  "tip-calculator": {
    fields: [
      { key: "bill", type: "number", label: t("Bill", "বিল"), default: "500" },
      { key: "percent", type: "number", label: t("Tip %", "টিপ %"), default: "10" },
      { key: "people", type: "number", label: t("People", "জন"), default: "2", min: "1" },
    ],
    example: { fields: { bill: "500", percent: "10", people: "2" } },
  },
  "ratio-calculator": {
    fields: [
      { key: "a", type: "number", label: t("A", "ক"), default: "3" },
      { key: "b", type: "number", label: t("B", "খ"), default: "4" },
      { key: "c", type: "number", label: t("C (find D)", "গ (ঘ বের করুন)"), default: "6" },
    ],
    example: { fields: { a: "3", b: "4", c: "6" } },
  },
  "unit-converter": {
    fields: [
      { key: "value", type: "number", label: t("Value", "মান"), default: "1" },
      {
        key: "unit", type: "select", label: t("Convert", "রূপান্তর"), default: "km-mi",
        options: [
          { value: "km-mi", label: t("km → miles", "কিমি → মাইল") },
          { value: "mi-km", label: t("miles → km", "মাইল → কিমি") },
          { value: "m-ft", label: t("metres → feet", "মিটার → ফুট") },
          { value: "ft-m", label: t("feet → metres", "ফুট → মিটার") },
          { value: "kg-lb", label: t("kg → pounds", "কেজি → পাউন্ড") },
          { value: "lb-kg", label: t("pounds → kg", "পাউন্ড → কেজি") },
          { value: "l-gal", label: t("litres → gallons", "লিটার → গ্যালন") },
          { value: "inch-cm", label: t("inches → cm", "ইঞ্চি → সেমি") },
          { value: "cm-inch", label: t("cm → inches", "সেমি → ইঞ্চি") },
        ],
      },
    ],
    example: { fields: { value: "5", unit: "km-mi" } },
  },
  "temperature-converter": {
    fields: [
      { key: "value", type: "number", label: t("Value", "মান"), default: "100" },
      MODE_FIELD(
        [
          { value: "c-f", en: "°C → °F", bn: "°সে → °ফা" },
          { value: "f-c", en: "°F → °C", bn: "°ফা → °সে" },
          { value: "c-k", en: "°C → K", bn: "°সে → K" },
          { value: "k-c", en: "K → °C", bn: "K → °সে" },
        ],
        "c-f",
      ),
    ],
    example: { fields: { value: "37", mode: "c-f" } },
  },
  "fibonacci-generator": {
    fields: [{ key: "count", type: "number", label: t("Terms", "পদ"), default: "10", min: "1", max: "200" }],
    example: { fields: { count: "10" } },
  },
  "prime-checker-generator": {
    fields: [
      { key: "n", type: "number", label: t("Number", "সংখ্যা"), default: "97" },
      MODE_FIELD(
        [
          { value: "check", en: "Check primality", bn: "মৌলিক কিনা" },
          { value: "list", en: "List primes up to N", bn: "N পর্যন্ত মৌলিক" },
        ],
        "check",
      ),
    ],
    example: { fields: { n: "97", mode: "check" } },
  },
  "number-base-converter": {
    fields: [
      { key: "value", type: "text", label: t("Value", "মান"), default: "255" },
      { key: "from", type: "number", label: t("From base", "কোন বেস থেকে"), default: "10", min: "2", max: "36" },
      { key: "to", type: "number", label: t("To base", "কোন বেসে"), default: "16", min: "2", max: "36" },
    ],
    example: { fields: { value: "255", from: "10", to: "16" } },
  },
  "binary-hex-octal-converter": {
    fields: [
      { key: "value", type: "text", label: t("Value", "মান"), default: "1010" },
      MODE_FIELD(
        [
          { value: "bin", en: "From binary", bn: "বাইনারি থেকে" },
          { value: "hex", en: "From hex", bn: "হেক্স থেকে" },
          { value: "oct", en: "From octal", bn: "অক্টাল থেকে" },
          { value: "dec", en: "From decimal", bn: "দশমিক থেকে" },
        ],
        "bin",
      ),
    ],
    example: { fields: { value: "1010", mode: "bin" } },
  },
  "roman-numeral-converter": {
    fields: [
      { key: "value", type: "text", label: t("Value", "মান"), default: "2026" },
      MODE_FIELD(
        [
          { value: "to-roman", en: "Number → Roman", bn: "সংখ্যা → রোমান" },
          { value: "from-roman", en: "Roman → number", bn: "রোমান → সংখ্যা" },
        ],
        "to-roman",
      ),
    ],
    example: { fields: { value: "2026", mode: "to-roman" } },
  },
  "average-min-max": {
    fields: [{ key: "text", type: "textarea", label: t("Numbers (any separator)", "সংখ্যা"), default: "4 8 15 16 23 42" }],
    example: {},
  },
  "number-list-generator": {
    fields: [
      { key: "from", type: "number", label: t("From", "থেকে"), default: "1" },
      { key: "to", type: "number", label: t("To", "পর্যন্ত"), default: "10" },
      { key: "step", type: "number", label: t("Step", "ধাপ"), default: "1" },
    ],
    example: { fields: { from: "1", to: "10", step: "1" } },
  },
  "number-to-words": {
    fields: [
      { key: "n", type: "number", label: t("Number", "সংখ্যা"), default: "2026" },
      MODE_FIELD(
        [
          { value: "en", en: "English", bn: "English" },
          { value: "bn", en: "Bangla", bn: "বাংলা" },
        ],
        "en",
      ),
    ],
    example: { fields: { n: "2026", mode: "en" } },
  },
  "percentage-fraction-decimal": {
    fields: [{ key: "value", type: "text", label: t("Value (50%, 1/2, 0.5)", "মান"), default: "3/4" }],
    example: { fields: { value: "3/4" } },
  },
  "gpa-calculator": {
    fields: [{ key: "text", type: "textarea", label: t("Grades with credits (A 3, B+ 2…)", "গ্রেড ও ক্রেডিট"), default: "A 3\nA- 3\nB+ 2" }],
    example: {},
  },
  "discount-calculator": {
    fields: [
      { key: "price", type: "number", label: t("Price", "দাম"), default: "1000" },
      { key: "percent", type: "number", label: t("Discount %", "ছাড় %"), default: "15" },
    ],
    example: { fields: { price: "1000", percent: "15" } },
  },
  "loan-emi-calculator": {
    fields: [
      { key: "principal", type: "number", label: t("Principal", "আসল"), default: "500000" },
      { key: "rate", type: "number", label: t("Yearly rate %", "বাৎসরিক সুদ %"), default: "9" },
      { key: "months", type: "number", label: t("Months", "মাস"), default: "60", min: "1", max: "600" },
    ],
    example: { fields: { principal: "500000", rate: "9", months: "60" } },
  },
  "bangla-calendar-converter": {
    fields: [
      { key: "date", type: "date", label: t("Gregorian date", "ইংরেজি তারিখ"), default: "2026-04-14" },
      MODE_FIELD(
        [
          { value: "to-bangla", en: "English → Bangla", bn: "ইংরেজি → বাংলা" },
          { value: "pohela", en: "Days to Pohela Boishakh", bn: "পহেলা বৈশাখ কতদিন" },
        ],
        "to-bangla",
      ),
    ],
    example: { fields: { date: "2026-04-14", mode: "to-bangla" } },
  },

  // -- Date & Time ---------------------------------------------------------
  "add-subtract-date": {
    fields: [
      { key: "date", type: "date", label: t("Date", "তারিখ"), default: "2026-01-01" },
      { key: "days", type: "number", label: t("Days (+/-)", "দিন (+/-)"), default: "30" },
    ],
    example: { fields: { date: "2026-01-01", days: "30" } },
  },
  "unix-timestamp-converter": {
    fields: [
      { key: "value", type: "text", label: t("Timestamp or date", "টাইমস্ট্যাম্প বা তারিখ"), default: "1767225600" },
      MODE_FIELD(
        [
          { value: "to-date", en: "Timestamp → date", bn: "টাইমস্ট্যাম্প → তারিখ" },
          { value: "to-stamp", en: "Date → timestamp", bn: "তারিখ → টাইমস্ট্যাম্প" },
          { value: "now", en: "Current timestamp", bn: "বর্তমান টাইমস্ট্যাম্প" },
        ],
        "to-date",
      ),
    ],
    example: { fields: { value: "1767225600", mode: "to-date" } },
  },
  "date-formatter": {
    fields: [
      { key: "date", type: "date", label: t("Date", "তারিখ"), default: "2026-04-14" },
      MODE_FIELD(
        [
          { value: "iso", en: "ISO", bn: "ISO" },
          { value: "long-en", en: "Long English", bn: "Long English" },
          { value: "long-bn", en: "Long Bangla", bn: "Long Bangla" },
          { value: "short", en: "Short", bn: "Short" },
        ],
        "long-en",
      ),
    ],
    example: { fields: { date: "2026-04-14", mode: "long-en" } },
  },
  "julian-date": {
    fields: [{ key: "date", type: "date", label: t("Date", "তারিখ"), default: "2026-01-01" }],
    example: { fields: { date: "2026-01-01" } },
  },
  "days-between-dates": {
    fields: [
      { key: "from", type: "date", label: t("From", "থেকে"), default: "2026-01-01" },
      { key: "to", type: "date", label: t("To", "পর্যন্ত"), default: "2026-12-31" },
    ],
    example: { fields: { from: "2026-01-01", to: "2026-12-31" } },
  },
  "working-days-calculator": {
    fields: [
      { key: "from", type: "date", label: t("From", "থেকে"), default: "2026-01-01" },
      { key: "to", type: "date", label: t("To", "পর্যন্ত"), default: "2026-01-31" },
      { key: "weekend", type: "select", label: t("Weekend", "সাপ্তাহিক ছুটি"), default: "fri-sat",
        options: [
          { value: "fri-sat", label: t("Fri–Sat (BD)", "শুক্র–শনি") },
          { value: "sat-sun", label: t("Sat–Sun", "শনি–রবি") },
        ] },
    ],
    example: { fields: { from: "2026-01-01", to: "2026-01-31", weekend: "fri-sat" } },
  },
  "timezone-converter": {
    fields: [
      { key: "time", type: "text", label: t("Time (HH:MM)", "সময়"), default: "12:00" },
      { key: "date", type: "date", label: t("Date", "তারিখ"), default: "2026-01-01" },
      {
        key: "zone", type: "select", label: t("Show in", "দেখুন"), default: "America/New_York",
        options: [
          { value: "Asia/Dhaka", label: t("Dhaka", "ঢাকা") },
          { value: "Asia/Kolkata", label: t("Kolkata", "কলকাতা") },
          { value: "UTC", label: t("UTC", "UTC") },
          { value: "Europe/London", label: t("London", "লন্ডন") },
          { value: "America/New_York", label: t("New York", "নিউইয়র্ক") },
          { value: "Asia/Dubai", label: t("Dubai", "দুবাই") },
          { value: "Asia/Singapore", label: t("সিঙ্গাপুর", "সিঙ্গাপুর") },
          { value: "Australia/Sydney", label: t("Sydney", "সিডনি") },
        ],
      },
    ],
    example: { fields: { time: "12:00", date: "2026-01-01", zone: "Asia/Dhaka" } },
  },

  // -- SEO & Web ------------------------------------------------------------
  "htaccess-redirect-generator": {
    fields: [
      { key: "from", type: "text", label: t("Old path", "পুরনো পাথ"), default: "/old-page" },
      { key: "to", type: "text", label: t("New URL", "নতুন URL"), default: "https://example.com/new-page" },
      MODE_FIELD(
        [
          { value: "301", en: "301 permanent", bn: "301 স্থায়ী" },
          { value: "302", en: "302 temporary", bn: "302 অস্থায়ী" },
        ],
        "301",
      ),
    ],
    example: { fields: { from: "/old-page", to: "https://example.com/new-page", mode: "301" } },
  },
  "html-entity-table": {
    fields: [{ key: "query", type: "text", label: t("Search", "খুঁজুন"), default: "copy" }],
    example: { fields: { query: "" } },
  },
  "seo-word-counter": {
    fields: [{ key: "text", type: "textarea", label: t("Article", "আর্টিকেল"), default: "Write your article here." }],
    example: {},
  },
  "twitter-card-info": {
    fields: [{ key: "query", type: "text", label: t("Search", "খুঁজুন"), default: "" }],
    example: { fields: { query: "" } },
  },
  "website-text-extractor": {
    fields: [{ key: "url", type: "text", label: t("URL", "URL"), default: "https://example.com" }],
    example: {},
  },

  // -- Fun & Misc (static) ---------------------------------------------------
  "age-in-seconds": {
    fields: [{ key: "dob", type: "date", label: t("Birth date", "জন্ম তারিখ"), default: "2000-01-01" }],
    example: { fields: { dob: "2000-01-01" } },
  },
  "dog-cat-years-converter": {
    fields: [
      { key: "age", type: "number", label: t("Pet age", "বয়স"), default: "3", min: "0" },
      MODE_FIELD(
        [
          { value: "dog", en: "Dog years", bn: "কুকুরের বছর" },
          { value: "cat", en: "Cat years", bn: "বিড়ালের বছর" },
        ],
        "dog",
      ),
    ],
    example: { fields: { age: "3", mode: "dog" } },
  },
  "love-calculator": {
    fields: [
      { key: "a", type: "text", label: t("First name", "প্রথম নাম"), default: "Rahim" },
      { key: "b", type: "text", label: t("Second name", "দ্বিতীয় নাম"), default: "Karim" },
    ],
    example: { fields: { a: "Rahim", b: "Karim" } },
  },
  "aspect-ratio-calculator": {
    fields: [
      { key: "w", type: "number", label: t("Width", "প্রস্থ"), default: "1920" },
      { key: "h", type: "number", label: t("Height", "উচ্চতা"), default: "1080" },
      { key: "nw", type: "number", label: t("New width (height = ?)", "নতুন প্রস্থ"), default: "1280" },
    ],
    example: { fields: { w: "1920", h: "1080", nw: "1280" } },
  },
  "aspect-ratio-cropper": {
    fields: [
      { key: "w", type: "number", label: t("Width", "প্রস্থ"), default: "1920" },
      { key: "h", type: "number", label: t("Height", "উচ্চতা"), default: "1080" },
      { key: "ratio", type: "text", label: t("Target ratio (W:H)", "লক্ষ্য অনুপাত"), default: "1:1" },
    ],
    example: { fields: { w: "1920", h: "1080", ratio: "1:1" } },
  },
  "event-countdown": {
    fields: [{ key: "date", type: "date", label: t("Event date", "ইভেন্ট তারিখ"), default: "2027-01-01" }],
    example: { fields: { date: "2027-01-01" } },
  },
  "screen-resolution-detector": { fields: [], example: {} },

  // -- Crypto & Security (Wave 2) -------------------------------------------
  "hmac-generator": {
    fields: [
      { key: "text", type: "textarea", label: t("Message", "বার্তা"), default: "hello" },
      { key: "key", type: "text", label: t("Secret key", "গোপন key"), default: "secret" },
      MODE_FIELD(
        [
          { value: "SHA-256", en: "HMAC-SHA-256", bn: "HMAC-SHA-256" },
          { value: "SHA-384", en: "HMAC-SHA-384", bn: "HMAC-SHA-384" },
          { value: "SHA-512", en: "HMAC-SHA-512", bn: "HMAC-SHA-512" },
          { value: "SHA-1", en: "HMAC-SHA-1", bn: "HMAC-SHA-1" },
        ],
        "SHA-256",
      ),
    ],
    example: { fields: { text: "hello", key: "secret", mode: "SHA-256" } },
  },
  "bcrypt-hash-compare": {
    fields: [
      { key: "text", type: "text", label: t("Password", "পাসওয়ার্ড"), default: "correct-horse" },
      { key: "hash", type: "text", label: t("Hash to compare (empty = hash)", "মিলিয়ে দেখুন (খালি = hash করুন)"), default: "" },
      { key: "rounds", type: "number", label: t("Cost", "কস্ট"), default: "10", min: "4", max: "14" },
    ],
    example: { fields: { text: "correct-horse" } },
  },
  "encrypt-decrypt-text": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "secret message" },
      { key: "password", type: "text", label: t("Password", "পাসওয়ার্ড"), default: "s3cr3t!" },
      MODE_FIELD(
        [
          { value: "encrypt", en: "Encrypt (AES-GCM)", bn: "এনক্রিপ্ট" },
          { value: "decrypt", en: "Decrypt", bn: "ডিক্রিপ্ট" },
        ],
        "encrypt",
      ),
    ],
    example: { fields: { text: "secret message", password: "s3cr3t!", mode: "encrypt" } },
  },
  "rsa-key-pair-generator": {
    fields: [
      MODE_FIELD(
        [
          { value: "2048", en: "2048-bit", bn: "2048-বিট" },
          { value: "4096", en: "4096-bit", bn: "4096-বিট" },
        ],
        "2048",
      ),
    ],
    example: { fields: { mode: "2048" } },
  },
  "password-generator": {
    fields: [
      { key: "length", type: "number", label: t("Length", "দৈর্ঘ্য"), default: "20", min: "4", max: "128" },
      { key: "count", type: "number", label: t("Count", "সংখ্যা"), default: "5", min: "1", max: "50" },
      { key: "symbols", type: "checkbox", label: t("Symbols", "চিহ্ন"), default: "on" },
      { key: "ambiguous", type: "checkbox", label: t("Skip ambiguous (0OIl1)", "দ্ব্যর্থক বাদ"), default: "" },
    ],
    example: { fields: { length: "20", count: "5", symbols: "on" } },
  },
  "password-strength-analyzer": {
    fields: [{ key: "text", type: "text", label: t("Password", "পাসওয়ার্ড"), default: "Tr7!xQ9#mZ" }],
    example: {},
  },
  "passphrase-generator": {
    fields: [
      { key: "words", type: "number", label: t("Words", "শব্দ"), default: "5", min: "3", max: "12" },
      { key: "separator", type: "text", label: t("Separator", "বিভাজক"), default: "-" },
    ],
    example: { fields: { words: "5", separator: "-" } },
  },
  "totp-otp-generator": {
    fields: [
      { key: "secret", type: "text", label: t("Secret (base32)", "সিক্রেট"), default: "JBSWY3DPEHPK3PXP" },
      { key: "digits", type: "number", label: t("Digits", "সংখ্যা"), default: "6", min: "6", max: "8" },
      { key: "period", type: "number", label: t("Period (s)", "মেয়াদ"), default: "30", min: "10", max: "120" },
    ],
    example: { fields: { secret: "JBSWY3DPEHPK3PXP" } },
  },
  "basic-auth-header": {
    fields: [
      { key: "user", type: "text", label: t("Username", "ইউজারনেম"), default: "admin" },
      { key: "pass", type: "text", label: t("Password", "পাসওয়ার্ড"), default: "secret" },
    ],
    example: { fields: { user: "admin", pass: "secret" } },
  },
  "file-to-base64": {
    fields: [], accept: "*/*", multiple: false,
    example: {},
  },
  "outlook-safelink-decoder": {
    fields: [{ key: "text", type: "textarea", label: t("SafeLink URL", "SafeLink URL"), default: "https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2F&data=1" }],
    example: {},
  },
  "pdf-signature-checker": {
    fields: [], accept: "application/pdf", multiple: false, example: {},
  },

  // -- Developer & Data (Wave 2) ----------------------------------------------
  "json-to-csv-tsv": {
    fields: [
      { key: "text", type: "textarea", label: t("JSON array", "JSON অ্যারে"), default: '[{"name":"Amina","city":"Dhaka"},{"name":"Rahim","city":"CTG"}]' },
      MODE_FIELD(
        [
          { value: "csv", en: "CSV", bn: "CSV" },
          { value: "tsv", en: "TSV", bn: "TSV" },
        ],
        "csv",
      ),
    ],
    example: {},
  },
  "csv-converter": {
    fields: [
      { key: "text", type: "textarea", label: t("CSV", "CSV"), default: "name,city\nAmina,Dhaka" },
      MODE_FIELD(
        [
          { value: "json", en: "CSV → JSON", bn: "CSV → JSON" },
          { value: "tsv", en: "CSV → TSV", bn: "CSV → TSV" },
          { value: "md", en: "CSV → Markdown table", bn: "CSV → Markdown" },
        ],
        "json",
      ),
    ],
    example: {},
  },
  "csv-sorter": {
    fields: [
      { key: "text", type: "textarea", label: t("CSV (header row first)", "CSV"), default: "name,score\nRahim,80\nAmina,95" },
      { key: "column", type: "text", label: t("Column", "কলাম"), default: "score" },
      MODE_FIELD(
        [
          { value: "asc", en: "Ascending", bn: "ঊর্ধ্বক্রম" },
          { value: "desc", en: "Descending", bn: "অধঃক্রম" },
        ],
        "desc",
      ),
    ],
    example: { fields: { column: "score", mode: "desc" } },
  },
  "json-diff": {
    fields: [
      { key: "text", type: "textarea", label: t("First JSON", "প্রথম JSON"), default: '{"a":1,"b":2}' },
      { key: "text2", type: "textarea", label: t("Second JSON", "দ্বিতীয় JSON"), default: '{"a":1,"b":3}' },
    ],
    example: {},
  },
  "compare-files": {
    fields: [
      { key: "text", type: "textarea", label: t("First text", "প্রথম টেক্সট"), default: "line one\nline two" },
      { key: "text2", type: "textarea", label: t("Second text", "দ্বিতীয় টেক্সট"), default: "line one\nline 2" },
    ],
    example: {},
  },
  "regex-tester": {
    fields: [
      { key: "pattern", type: "text", label: t("Pattern", "প্যাটার্ন"), default: "\\b\\w+@\\w+\\.\\w+\\b" },
      { key: "flags", type: "text", label: t("Flags", "ফ্ল্যাগ"), default: "gi" },
      { key: "text", type: "textarea", label: t("Test text", "টেক্সট"), default: "mail me at hi@example.com or ops@example.org" },
    ],
    example: {},
  },
  "url-builder": {
    fields: [
      { key: "base", type: "text", label: t("Base URL", "বেস URL"), default: "https://example.com/search" },
      { key: "params", type: "textarea", label: t("Params (key=value per line)", "প্যারাম"), default: "q=hello world\npage=2" },
    ],
    example: {},
  },
  "open-graph-generator": {
    fields: [
      { key: "title", type: "text", label: t("Title", "শিরোনাম"), default: "My page" },
      { key: "desc", type: "text", label: t("Description", "বর্ণনা"), default: "A short description." },
      { key: "url", type: "text", label: t("URL", "URL"), default: "https://example.com/page" },
      { key: "image", type: "text", label: t("Image URL", "ছবির URL"), default: "https://example.com/og.png" },
    ],
    example: {},
  },
  "twitter-card-generator": {
    fields: [
      { key: "title", type: "text", label: t("Title", "শিরোনাম"), default: "My page" },
      { key: "desc", type: "text", label: t("Description", "বর্ণনা"), default: "A short description." },
      { key: "image", type: "text", label: t("Image URL", "ছবির URL"), default: "https://example.com/card.png" },
    ],
    example: {},
  },
  "meta-tags-generator": {
    fields: [
      { key: "title", type: "text", label: t("Title", "শিরোনাম"), default: "My page" },
      { key: "desc", type: "text", label: t("Description", "বর্ণনা"), default: "A short description." },
      { key: "keywords", type: "text", label: t("Keywords", "কীওয়ার্ড"), default: "tools, bangladesh" },
    ],
    example: {},
  },
  "robots-txt-generator": {
    fields: [
      { key: "sitemap", type: "text", label: t("Sitemap URL", "সাইটম্যাপ URL"), default: "https://example.com/sitemap.xml" },
      { key: "disallow", type: "text", label: t("Disallow paths (comma)", "নিষেধ পাথ"), default: "/admin, /private" },
    ],
    example: {},
  },
  "xml-sitemap-generator": {
    fields: [
      { key: "text", type: "textarea", label: t("URLs (one per line)", "URL প্রতি লাইনে"), default: "https://example.com/\nhttps://example.com/about" },
    ],
    example: {},
  },
  "device-information": { fields: [], example: {} },
  "user-agent-parser": {
    fields: [{ key: "text", type: "textarea", label: t("User-Agent", "User-Agent"), default: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" }],
    example: {},
  },
  "http-status-codes": {
    fields: [{ key: "query", type: "text", label: t("Search", "খুঁজুন"), default: "404" }],
    example: { fields: { query: "" } },
  },
  "mime-types-lookup": {
    fields: [{ key: "query", type: "text", label: t("Extension or type", "এক্সটেনশন"), default: "pdf" }],
    example: { fields: { query: "pdf" } },
  },
  "git-cheatsheet": {
    fields: [{ key: "query", type: "text", label: t("Search", "খুঁজুন"), default: "commit" }],
    example: { fields: { query: "" } },
  },
  "random-port-generator": {
    fields: [
      { key: "count", type: "number", label: t("Count", "সংখ্যা"), default: "5", min: "1", max: "50" },
      { key: "registered", type: "checkbox", label: t("Unprivileged only (>1023)", "শুধু >1023"), default: "on" },
    ],
    example: { fields: { count: "5" } },
  },
  "mac-address-generator": {
    fields: [
      { key: "count", type: "number", label: t("Count", "সংখ্যা"), default: "3", min: "1", max: "50" },
      { key: "sep", type: "text", label: t("Separator", "বিভাজক"), default: ":" },
    ],
    example: { fields: { count: "3" } },
  },
  "ipv4-subnet-calculator": {
    fields: [{ key: "cidr", type: "text", label: t("CIDR (e.g. 192.168.1.0/24)", "CIDR"), default: "192.168.1.0/24" }],
    example: { fields: { cidr: "192.168.1.0/24" } },
  },
  "ipv4-address-converter": {
    fields: [{ key: "value", type: "text", label: t("IPv4 or integer", "IPv4 বা সংখ্যা"), default: "192.168.1.1" }],
    example: { fields: { value: "192.168.1.1" } },
  },
  "ipv4-range-expander": {
    fields: [{ key: "cidr", type: "text", label: t("CIDR (max /24 shown)", "CIDR"), default: "192.168.1.0/30" }],
    example: { fields: { cidr: "192.168.1.0/30" } },
  },
  "ipv6-ula-generator": {
    fields: [{ key: "count", type: "number", label: t("Count", "সংখ্যা"), default: "3", min: "1", max: "20" }],
    example: { fields: { count: "3" } },
  },
  "eta-calculator": {
    fields: [
      { key: "done", type: "number", label: t("Done", "সম্পন্ন"), default: "40" },
      { key: "total", type: "number", label: t("Total", "মোট"), default: "100" },
      { key: "elapsed", type: "number", label: t("Elapsed minutes", "গত মিনিট"), default: "20" },
    ],
    example: { fields: { done: "40", total: "100", elapsed: "20" } },
  },
  "svg-placeholder-generator": {
    fields: [
      { key: "w", type: "number", label: t("Width", "প্রস্থ"), default: "600" },
      { key: "h", type: "number", label: t("Height", "উচ্চতা"), default: "400" },
      { key: "label", type: "text", label: t("Label", "লেখা"), default: "600×400" },
      { key: "bg", type: "color", label: t("Background", "ব্যাকগ্রাউন্ড"), default: "#e5e7eb" },
      { key: "fg", type: "color", label: t("Text color", "লেখার রং"), default: "#374151" },
    ],
    example: {},
  },
  "docker-run-converter": {
    fields: [{ key: "text", type: "textarea", label: t("docker run command", "docker run"), default: "docker run -d --name web -p 8080:80 -v data:/data -e NODE_ENV=production nginx:alpine" }],
    example: {},
  },
  "crontab-generator": {
    fields: [
      { key: "minute", type: "text", label: t("Minute", "মিনিট"), default: "*/5" },
      { key: "hour", type: "text", label: t("Hour", "ঘণ্টা"), default: "*" },
      { key: "dom", type: "text", label: t("Day of month", "মাসের দিন"), default: "*" },
      { key: "month", type: "text", label: t("Month", "মাস"), default: "*" },
      { key: "dow", type: "text", label: t("Day of week", "সপ্তাহের দিন"), default: "*" },
      { key: "cmd", type: "text", label: t("Command", "কমান্ড"), default: "/usr/bin/backup.sh" },
    ],
    example: {},
  },
  "html-beautifier": {
    fields: [{ key: "text", type: "textarea", label: t("HTML", "HTML"), default: "<div><p>hi</p></div>" }],
    example: {},
  },
  "css-beautifier-minifier": {
    fields: [
      { key: "text", type: "textarea", label: t("CSS", "CSS"), default: "a{color:red}" },
      MODE_FIELD(
        [
          { value: "beautify", en: "Beautify", bn: "সাজান" },
          { value: "minify", en: "Minify", bn: "ছোট করুন" },
        ],
        "beautify",
      ),
    ],
    example: {},
  },
  "javascript-beautifier-minifier": {
    fields: [
      { key: "text", type: "textarea", label: t("JavaScript", "JavaScript"), default: "function f(a){return a+1}" },
      MODE_FIELD(
        [
          { value: "beautify", en: "Beautify", bn: "সাজান" },
          { value: "minify", en: "Minify (terser)", bn: "ছোট করুন" },
        ],
        "beautify",
      ),
    ],
    example: {},
  },
  "code-syntax-highlighter": {
    fields: [
      { key: "text", type: "textarea", label: t("Code", "কোড"), default: "const greeting = \"hello\";" },
      {
        key: "lang", type: "select", label: t("Language", "ভাষা"), default: "javascript",
        options: ["javascript", "typescript", "xml", "css", "json", "bash", "yaml", "sql", "markdown", "python"].map((l) => ({ value: l, label: t(l, l) })),
      },
    ],
    example: {},
  },
  "json-schema-validator": {
    fields: [
      { key: "text", type: "textarea", label: t("JSON", "JSON"), default: '{"age":30}' },
      { key: "schema", type: "textarea", label: t("Schema", "স্কিমা"), default: '{"type":"object","properties":{"age":{"type":"number"}},"required":["age"]}' },
    ],
    example: {},
  },
  "html-minifier": {
    fields: [{ key: "text", type: "textarea", label: t("HTML", "HTML"), default: "<div>\n  <p>hi</p>\n</div>" }],
    example: {},
  },
  "css-minifier": {
    fields: [{ key: "text", type: "textarea", label: t("CSS", "CSS"), default: "a {\n  color: red;\n}" }],
    example: {},
  },
  "js-minifier": {
    fields: [{ key: "text", type: "textarea", label: t("JavaScript", "JavaScript"), default: "function add(a, b) {\n  return a + b;\n}" }],
    example: {},
  },
  "xlsx-json-converter": {
    fields: [
      MODE_FIELD(
        [
          { value: "to-json", en: "XLSX → JSON", bn: "XLSX → JSON" },
          { value: "to-csv", en: "XLSX → CSV", bn: "XLSX → CSV" },
        ],
        "to-json",
      ),
    ],
    accept: ".xlsx,.xls", multiple: false, example: {},
  },

  // -- Color Lab (Wave 2, colord) ---------------------------------------------
  "css-named-colors": {
    fields: [{ key: "query", type: "text", label: t("Search", "খুঁজুন"), default: "blue" }],
    example: { fields: { query: "" } },
  },
  "lighten-darken-color": {
    fields: [
      { key: "color", type: "color", label: t("Color", "রং"), default: "#3264ff" },
      { key: "amount", type: "range", label: t("Amount % (-100…100)", "পরিমাণ %"), default: "20", min: "-100", max: "100" },
    ],
    example: {},
  },
  "saturation-shift": {
    fields: [
      { key: "color", type: "color", label: t("Color", "রং"), default: "#3264ff" },
      { key: "amount", type: "range", label: t("Amount % (-100…100)", "পরিমাণ %"), default: "30", min: "-100", max: "100" },
    ],
    example: {},
  },
  "greyscale-color": {
    fields: [{ key: "color", type: "color", label: t("Color", "রং"), default: "#3264ff" }],
    example: {},
  },
  "invert-color": {
    fields: [{ key: "color", type: "color", label: t("Color", "রং"), default: "#3264ff" }],
    example: {},
  },
  "hue-shift-color": {
    fields: [
      { key: "color", type: "color", label: t("Color", "রং"), default: "#3264ff" },
      { key: "degrees", type: "range", label: t("Degrees", "ডিগ্রি"), default: "90", min: "0", max: "360" },
    ],
    example: {},
  },
  "random-color-generator": {
    fields: [{ key: "count", type: "number", label: t("Count", "সংখ্যা"), default: "5", min: "1", max: "30" }],
    example: { fields: { count: "5" } },
  },
  "color-scheme-generator": {
    fields: [
      { key: "color", type: "color", label: t("Base", "মূল রং"), default: "#3264ff" },
      MODE_FIELD(
        [
          { value: "analogous", en: "Analogous", bn: "সদৃশ" },
          { value: "triadic", en: "Triadic", bn: "ত্রয়ী" },
          { value: "split", en: "Split-complementary", bn: "বিভক্ত-পরিপূরক" },
          { value: "tetradic", en: "Tetradic", bn: "চতুর্মুখী" },
        ],
        "analogous",
      ),
    ],
    example: {},
  },
  "color-blender": {
    fields: [
      { key: "a", type: "color", label: t("First", "প্রথম"), default: "#3264ff" },
      { key: "b", type: "color", label: t("Second", "দ্বিতীয়"), default: "#ff6b4a" },
      { key: "amount", type: "range", label: t("Mix % toward second", "মিশ্রণ %"), default: "50", min: "0", max: "100" },
    ],
    example: {},
  },
  "gradient-generator": {
    fields: [
      { key: "a", type: "color", label: t("From", "থেকে"), default: "#3264ff" },
      { key: "b", type: "color", label: t("To", "পর্যন্ত"), default: "#22d3ee" },
      { key: "angle", type: "range", label: t("Angle", "কোণ"), default: "135", min: "0", max: "360" },
    ],
    example: {},
  },
  "gradient-palette": {
    fields: [
      { key: "a", type: "color", label: t("From", "থেকে"), default: "#3264ff" },
      { key: "b", type: "color", label: t("To", "পর্যন্ত"), default: "#22d3ee" },
      { key: "steps", type: "range", label: t("Steps", "ধাপ"), default: "5", min: "2", max: "20" },
    ],
    example: {},
  },
  "contrast-checker": {
    fields: [
      { key: "a", type: "color", label: t("Foreground", "সামনের রং"), default: "#0a1025" },
      { key: "b", type: "color", label: t("Background", "পেছনের রং"), default: "#f7f6f1" },
    ],
    example: {},
  },
  "color-blindness-simulator": {
    fields: [{ key: "color", type: "color", label: t("Color", "রং"), default: "#22aa55" }],
    example: {},
  },
  "shades-tints-generator": {
    fields: [
      { key: "color", type: "color", label: t("Base", "মূল রং"), default: "#3264ff" },
      { key: "steps", type: "range", label: t("Steps each way", "ধাপ"), default: "4", min: "1", max: "10" },
    ],
    example: {},
  },

  // -- Random & Generators (Wave 2) --------------------------------------------
  "gaussian-generator": {
    fields: [
      { key: "mean", type: "number", label: t("Mean", "গড়"), default: "0" },
      { key: "dev", type: "number", label: t("Std dev", "বিচ্যুতি"), default: "1" },
      { key: "count", type: "number", label: t("Count", "সংখ্যা"), default: "5", min: "1", max: "100" },
    ],
    example: {},
  },
  "coin-flipper": {
    fields: [{ key: "count", type: "number", label: t("Flips", "টস"), default: "5", min: "1", max: "100" }],
    example: { fields: { count: "5" } },
  },
  "dice-roller": {
    fields: [
      { key: "dice", type: "number", label: t("Dice", "ছক্কা"), default: "2", min: "1", max: "20" },
      { key: "sides", type: "number", label: t("Sides", "পার্শ্ব"), default: "6", min: "2", max: "100" },
    ],
    example: {},
  },
  "random-team-generator": {
    fields: [
      { key: "text", type: "textarea", label: t("Names (one per line)", "নাম প্রতি লাইনে"), default: "Amina\nRahim\nSadia\nKarim" },
      { key: "teams", type: "number", label: t("Teams", "দল"), default: "2", min: "2", max: "20" },
    ],
    example: {},
  },
  "random-name-generator": {
    fields: [
      { key: "count", type: "number", label: t("Count", "সংখ্যা"), default: "5", min: "1", max: "50" },
      MODE_FIELD(
        [
          { value: "bn", en: "Bangla", bn: "বাংলা" },
          { value: "en", en: "English", bn: "English" },
        ],
        "bn",
      ),
    ],
    example: {},
  },
  "mock-data-generator": {
    fields: [
      { key: "count", type: "number", label: t("Rows", "সারি"), default: "5", min: "1", max: "100" },
      MODE_FIELD(
        [
          { value: "person", en: "People", bn: "মানুষ" },
          { value: "address", en: "Addresses", bn: "ঠিকানা" },
        ],
        "person",
      ),
    ],
    example: {},
  },
  "random-file-generator": {
    fields: [
      { key: "size", type: "number", label: t("Size KB", "সাইজ KB"), default: "100", min: "1", max: "5120" },
      { key: "name", type: "text", label: t("File name", "ফাইল নাম"), default: "random.bin" },
    ],
    example: {},
  },
  "qr-code-generator": {
    fields: [
      { key: "text", type: "textarea", label: t("Text / URL", "টেক্সট / URL"), default: "https://example.com" },
      { key: "size", type: "number", label: t("Size px", "সাইজ"), default: "256", min: "128", max: "1024" },
    ],
    example: {},
  },
  "barcode-generator": {
    fields: [
      { key: "text", type: "text", label: t("Value (CODE128)", "মান"), default: "123456789012" },
      MODE_FIELD(
        [
          { value: "CODE128", en: "CODE128", bn: "CODE128" },
          { value: "EAN13", en: "EAN-13", bn: "EAN-13" },
          { value: "CODE39", en: "CODE39", bn: "CODE39" },
        ],
        "CODE128",
      ),
    ],
    example: {},
  },
  "iban-validator": {
    fields: [{ key: "text", type: "text", label: t("IBAN", "IBAN"), default: "DE89370400440532013000" }],
    example: {},
  },
  "credit-card-validator": {
    fields: [{ key: "text", type: "text", label: t("Card number", "কার্ড নম্বর"), default: "4111111111111111" }],
    example: {},
  },
  "phone-number-parser": {
    fields: [
      { key: "text", type: "text", label: t("Number", "নম্বর"), default: "+8801712345678" },
      { key: "country", type: "text", label: t("Default country (e.g. BD)", "দেশ কোড"), default: "BD" },
    ],
    example: {},
  },
  "vin-checker": {
    fields: [{ key: "text", type: "text", label: t("VIN (17 chars)", "VIN"), default: "1HGCM82633A004352" }],
    example: {},
  },
  "isbn-validator": {
    fields: [{ key: "text", type: "text", label: t("ISBN", "ISBN"), default: "978-3-16-148410-0" }],
    example: {},
  },

  // -- File & PDF (Wave 2; readers need picked files) ---------------------------
  "split-file": {
    fields: [{ key: "parts", type: "number", label: t("Parts", "ভাগ"), default: "3", min: "2", max: "99" }],
    accept: "*/*", multiple: false, example: {},
  },
  "join-files": {
    fields: [], accept: "*/*", multiple: true, example: {},
  },
  "file-type-detector": {
    fields: [], accept: "*/*", multiple: false, example: {},
  },
  "file-size-converter": {
    fields: [{ key: "value", type: "number", label: t("Value", "মান"), default: "1536" },
      { key: "unit", type: "select", label: t("From unit", "একক"), default: "KB",
        options: ["B", "KB", "MB", "GB", "TB"].map((u) => ({ value: u, label: t(u, u) })) }],
    example: {},
  },
  "batch-file-rename": {
    fields: [
      { key: "pattern", type: "text", label: t("Name pattern ({n} = number)", "প্যাটার্ন"), default: "photo-{n}" },
      { key: "start", type: "number", label: t("Start number", "শুরু"), default: "1", min: "0" },
    ],
    accept: "*/*", multiple: true, example: {},
  },
  "text-to-file-download": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "Hello!" },
      { key: "name", type: "text", label: t("File name", "ফাইল নাম"), default: "notes.txt" },
    ],
    example: {},
  },
  "zip-creator-extractor": {
    fields: [
      MODE_FIELD(
        [
          { value: "create", en: "Create ZIP", bn: "ZIP বানান" },
          { value: "extract", en: "List ZIP contents", bn: "ZIP তালিকা" },
        ],
        "create",
      ),
      { key: "name", type: "text", label: t("ZIP name", "ZIP নাম"), default: "files.zip" },
    ],
    accept: "*/*", multiple: true, example: {},
  },
  "pdf-merge": {
    fields: [], accept: "application/pdf", multiple: true, example: {},
  },
  "pdf-split": {
    fields: [{ key: "ranges", type: "text", label: t("Pages (e.g. 1-3,5)", "পেজ"), default: "1-2" }],
    accept: "application/pdf", multiple: false, example: {},
  },
  "pdf-rotate": {
    fields: [{ key: "degrees", type: "range", label: t("Degrees", "ডিগ্রি"), default: "90", min: "0", max: "360", step: "90" }],
    accept: "application/pdf", multiple: false, example: {},
  },
  "pdf-page-reorder": {
    fields: [{ key: "order", type: "text", label: t("New order (e.g. 3,1,2)", "নতুন ক্রম"), default: "" }],
    accept: "application/pdf", multiple: false, example: {},
  },
  "pdf-watermark": {
    fields: [{ key: "text", type: "text", label: t("Watermark", "ওয়াটারমার্ক"), default: "DRAFT" }],
    accept: "application/pdf", multiple: false, example: {},
  },
  "images-to-pdf": {
    fields: [], accept: "image/*", multiple: true, example: {},
  },
  "svg-optimizer": {
    fields: [{ key: "text", type: "textarea", label: t("SVG", "SVG"), default: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g><rect width="10" height="10" fill="red"/></g></svg>' }],
    example: {},
  },
  "exif-viewer": {
    fields: [], accept: "image/*", multiple: false, example: {},
  },
  "pdf-to-images": {
    fields: [{ key: "pages", type: "number", label: t("Pages (max 5)", "পেজ"), default: "2", min: "1", max: "5" }],
    accept: "application/pdf", multiple: false, example: {},
  },
  "compress-pdf": {
    fields: [], accept: "application/pdf", multiple: false, example: {},
  },

  // -- Image Studio (Wave 4) --------------------------------------------------
  "image-resize": {
    fields: [
      { key: "width", type: "number", label: t("Width (0 = auto)", "প্রস্থ"), default: "800", min: "0", max: "1920" },
      { key: "height", type: "number", label: t("Height (0 = auto)", "উচ্চতা"), default: "0", min: "0", max: "1920" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "image-crop": {
    fields: [
      { key: "x", type: "number", label: t("Left", "বাম"), default: "0", min: "0" },
      { key: "y", type: "number", label: t("Top", "উপর"), default: "0", min: "0" },
      { key: "w", type: "number", label: t("Width", "প্রস্থ"), default: "400", min: "1" },
      { key: "h", type: "number", label: t("Height", "উচ্চতা"), default: "400", min: "1" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "image-rotate": {
    fields: [
      MODE_FIELD(
        [
          { value: "90", en: "90° clockwise", bn: "৯০° ডানে" },
          { value: "180", en: "180°", bn: "১৮০°" },
          { value: "270", en: "90° counter-clockwise", bn: "৯০° বামে" },
        ],
        "90",
      ),
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "image-flip": {
    fields: [
      MODE_FIELD(
        [
          { value: "h", en: "Horizontal", bn: "আনুভূমিক" },
          { value: "v", en: "Vertical", bn: "উল্লম্ব" },
        ],
        "h",
      ),
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "image-format-converter": {
    fields: [
      MODE_FIELD(
        [
          { value: "jpeg", en: "JPEG", bn: "JPEG" },
          { value: "png", en: "PNG", bn: "PNG" },
          { value: "webp", en: "WebP", bn: "WebP" },
        ],
        "jpeg",
      ),
      { key: "quality", type: "range", label: t("Quality %", "মান %"), default: "90", min: "1", max: "100" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "image-compressor": {
    fields: [
      { key: "quality", type: "range", label: t("Quality %", "মান %"), default: "80", min: "1", max: "100" },
      { key: "maxdim", type: "number", label: t("Max side px (0 = keep)", "সর্বোচ্চ পার্শ্ব"), default: "1600", min: "0", max: "4000" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "brightness-contrast": {
    fields: [
      { key: "brightness", type: "number", label: t("Brightness -100…100", "উজ্জ্বলতা"), default: "10", min: "-100", max: "100" },
      { key: "contrast", type: "number", label: t("Contrast -100…100", "কনট্রাস্ট"), default: "10", min: "-100", max: "100" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "saturation-vibrance": {
    fields: [
      { key: "saturation", type: "number", label: t("Saturation -100…100", "সম্পৃক্তি"), default: "20", min: "-100", max: "100" },
      { key: "vibrance", type: "number", label: t("Vibrance 0…100", "প্রাণবন্ততা"), default: "20", min: "0", max: "100" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "exposure-gamma": {
    fields: [
      { key: "exposure", type: "number", label: t("Exposure stops", "এক্সপোজার"), default: "0.5", min: "-3", max: "3", step: "0.1" },
      { key: "gamma", type: "number", label: t("Gamma", "গামা"), default: "1", min: "0.1", max: "3", step: "0.1" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "hue-hsl-adjust": {
    fields: [
      { key: "hue", type: "number", label: t("Hue shift°", "হিউ"), default: "30", min: "-180", max: "180" },
      { key: "sat", type: "number", label: t("Saturation %", "সম্পৃক্তি %"), default: "0" },
      { key: "light", type: "number", label: t("Lightness %", "উজ্জ্বলতা %"), default: "0" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "rgb-channels": {
    fields: [
      { key: "r", type: "number", label: t("Red ×", "লাল"), default: "1", min: "0", max: "2", step: "0.1" },
      { key: "g", type: "number", label: t("Green ×", "সবুজ"), default: "1", min: "0", max: "2", step: "0.1" },
      { key: "b", type: "number", label: t("Blue ×", "নীল"), default: "1", min: "0", max: "2", step: "0.1" },
      MODE_FIELD(
        [
          { value: "none", en: "Keep color", bn: "রঙিন রাখুন" },
          { value: "r", en: "Red channel only", bn: "শুধু লাল" },
          { value: "g", en: "Green channel only", bn: "শুধু সবুজ" },
          { value: "b", en: "Blue channel only", bn: "শুধু নীল" },
        ],
        "none",
      ),
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "grayscale-sepia-invert": {
    fields: [
      MODE_FIELD(
        [
          { value: "gray", en: "Grayscale", bn: "সাদা-কালো" },
          { value: "sepia", en: "Sepia", bn: "সেপিয়া" },
          { value: "invert", en: "Invert", bn: "উল্টান" },
        ],
        "gray",
      ),
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "colorize-duotone": {
    fields: [
      { key: "dark", type: "color", label: t("Shadows", "ছায়া"), default: "#0a1025" },
      { key: "light", type: "color", label: t("Highlights", "আলো"), default: "#f7f6f1" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "blur-sharpen": {
    fields: [
      MODE_FIELD(
        [
          { value: "blur", en: "Blur", bn: "ঝাপসা" },
          { value: "sharpen", en: "Sharpen", bn: "তীক্ষ্ণ" },
        ],
        "blur",
      ),
      { key: "amount", type: "range", label: t("Amount 1…10", "পরিমাণ"), default: "3", min: "1", max: "10" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "noise-pixelate": {
    fields: [
      MODE_FIELD(
        [
          { value: "pixelate", en: "Pixelate", bn: "পিক্সেলেট" },
          { value: "noise", en: "Film grain", bn: "গ্রেইন" },
        ],
        "pixelate",
      ),
      { key: "amount", type: "range", label: t("Amount", "পরিমাণ"), default: "8", min: "1", max: "64" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "posterize-solarize-threshold": {
    fields: [
      MODE_FIELD(
        [
          { value: "posterize", en: "Posterize", bn: "পোস্টারাইজ" },
          { value: "solarize", en: "Solarize", bn: "সোলারাইজ" },
          { value: "threshold", en: "Threshold", bn: "থ্রেশহোল্ড" },
        ],
        "posterize",
      ),
      { key: "levels", type: "number", label: t("Levels / cutoff", "লেভেল"), default: "4", min: "2", max: "16" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "vignette-glow": {
    fields: [
      MODE_FIELD(
        [
          { value: "vignette", en: "Vignette", bn: "ভিগনেট" },
          { value: "glow", en: "Glow", bn: "আভা" },
        ],
        "vignette",
      ),
      { key: "strength", type: "range", label: t("Strength %", "তীব্রতা %"), default: "50", min: "0", max: "100" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "emboss-clip-effect": {
    fields: [
      MODE_FIELD(
        [
          { value: "emboss", en: "Emboss", bn: "এমবস" },
          { value: "clip", en: "High-contrast clip", bn: "কনট্রাস্ট ক্লিপ" },
        ],
        "emboss",
      ),
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "equalize": { fields: [], accept: "image/*", multiple: false, example: {} },
  "edge-detection": { fields: [], accept: "image/*", multiple: false, example: {} },
  "tilt-shift": {
    fields: [
      { key: "focus", type: "number", label: t("Focus band center %", "ফোকাস %"), default: "50", min: "0", max: "100" },
      { key: "blur", type: "range", label: t("Blur", "ঝাপসা"), default: "4", min: "1", max: "12" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "vintage-instant-lomo": {
    fields: [
      MODE_FIELD(
        [
          { value: "vintage", en: "Vintage", bn: "ভিনটেজ" },
          { value: "instant", en: "Instant film", bn: "ইনস্ট্যান্ট" },
          { value: "lomo", en: "Lomo", bn: "লোমো" },
        ],
        "vintage",
      ),
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "blend-colors-into-image": {
    fields: [
      { key: "color", type: "color", label: t("Color", "রং"), default: "#3264ff" },
      { key: "opacity", type: "range", label: t("Opacity %", "অস্বচ্ছতা %"), default: "30", min: "0", max: "100" },
      MODE_FIELD(
        [
          { value: "multiply", en: "Multiply", bn: "মাল্টিপ্লাই" },
          { value: "screen", en: "Screen", bn: "স্ক্রিন" },
          { value: "overlay", en: "Overlay", bn: "ওভারলে" },
        ],
        "multiply",
      ),
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "merge-images": {
    fields: [
      MODE_FIELD(
        [
          { value: "side", en: "Side by side", bn: "পাশাপাশি" },
          { value: "stack", en: "Stacked", bn: "একটার নিচে একটা" },
        ],
        "side",
      ),
    ],
    accept: "image/*", multiple: true, example: {},
  },
  "overlay-images": {
    fields: [
      { key: "x", type: "number", label: t("Offset X", "X অফসেট"), default: "20" },
      { key: "y", type: "number", label: t("Offset Y", "Y অফসেট"), default: "20" },
      { key: "opacity", type: "range", label: t("Opacity %", "অস্বচ্ছতা %"), default: "80", min: "0", max: "100" },
    ],
    accept: "image/*", multiple: true, example: {},
  },
  "split-image": {
    fields: [
      { key: "rows", type: "number", label: t("Rows", "সারি"), default: "2", min: "1", max: "8" },
      { key: "cols", type: "number", label: t("Columns", "কলাম"), default: "2", min: "1", max: "8" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "round-corners": {
    fields: [{ key: "radius", type: "number", label: t("Radius %", "ব্যাসার্ধ %"), default: "15", min: "1", max: "50" }],
    accept: "image/*", multiple: false, example: {},
  },
  "add-border-frame": {
    fields: [
      { key: "thickness", type: "number", label: t("Thickness %", "পুরুত্ব %"), default: "5", min: "1", max: "25" },
      { key: "color", type: "color", label: t("Color", "রং"), default: "#0a1025" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "text-watermark-image": {
    fields: [
      { key: "text", type: "text", label: t("Text", "লেখা"), default: "© ToolsHub" },
      { key: "size", type: "number", label: t("Size % of width", "সাইজ %"), default: "6", min: "2", max: "30" },
      { key: "opacity", type: "range", label: t("Opacity %", "অস্বচ্ছতা %"), default: "60", min: "5", max: "100" },
      MODE_FIELD(
        [
          { value: "bottom-right", en: "Bottom right", bn: "নিচে ডানে" },
          { value: "bottom-left", en: "Bottom left", bn: "নিচে বামে" },
          { value: "center", en: "Center", bn: "মাঝখানে" },
          { value: "top-left", en: "Top left", bn: "উপরে বামে" },
        ],
        "bottom-right",
      ),
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "image-color-picker": {
    fields: [{ key: "colors", type: "number", label: t("Swatches", "রং সংখ্যা"), default: "5", min: "1", max: "10" }],
    accept: "image/*", multiple: false, example: {},
  },
  "palette-extractor": {
    fields: [{ key: "colors", type: "number", label: t("Swatches", "রং সংখ্যা"), default: "8", min: "1", max: "12" }],
    accept: "image/*", multiple: false, example: {},
  },
  "image-gradient-generator": {
    fields: [
      { key: "a", type: "color", label: t("From", "থেকে"), default: "#3264ff" },
      { key: "b", type: "color", label: t("To", "পর্যন্ত"), default: "#22d3ee" },
      { key: "angle", type: "range", label: t("Angle", "কোণ"), default: "135", min: "0", max: "360" },
      { key: "w", type: "number", label: t("Width", "প্রস্থ"), default: "800", min: "16", max: "2000" },
      { key: "h", type: "number", label: t("Height", "উচ্চতা"), default: "600", min: "16", max: "2000" },
    ],
    example: {},
  },
  "random-bitmap-generator": {
    fields: [
      { key: "w", type: "number", label: t("Width", "প্রস্থ"), default: "64", min: "8", max: "512" },
      { key: "h", type: "number", label: t("Height", "উচ্চতা"), default: "64", min: "8", max: "512" },
      { key: "cells", type: "number", label: t("Cell px", "সেল px"), default: "8", min: "1", max: "64" },
      { key: "colors", type: "number", label: t("Colors", "রং"), default: "4", min: "2", max: "8" },
    ],
    example: {},
  },
  "svg-png-converter": {
    fields: [
      { key: "text", type: "textarea", label: t("SVG", "SVG"), default: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#3264ff"/></svg>' },
      { key: "scale", type: "range", label: t("Scale ×", "স্কেল"), default: "2", min: "1", max: "8" },
    ],
    example: {},
  },
  "blurred-background-frame": {
    fields: [{ key: "blur", type: "range", label: t("Blur", "ঝাপসা"), default: "8", min: "1", max: "20" }],
    accept: "image/*", multiple: false, example: {},
  },
  "image-censor": {
    fields: [
      { key: "x", type: "number", label: t("Left %", "বাম %"), default: "30", min: "0", max: "100" },
      { key: "y", type: "number", label: t("Top %", "উপর %"), default: "30", min: "0", max: "100" },
      { key: "w", type: "number", label: t("Width %", "প্রস্থ %"), default: "40", min: "1", max: "100" },
      { key: "h", type: "number", label: t("Height %", "উচ্চতা %"), default: "40", min: "1", max: "100" },
      { key: "blocks", type: "range", label: t("Blocks", "ব্লক"), default: "12", min: "2", max: "60" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "gif-toolkit": {
    fields: [], accept: ".gif", multiple: false, example: {},
  },
  "video-thumbnail-extractor": {
    fields: [{ key: "time", type: "number", label: t("Seconds in", "সেকেন্ড"), default: "1", min: "0", max: "3600" }],
    accept: "video/*", multiple: false, example: {},
  },
  "background-remover": {
    fields: [
      { key: "color", type: "color", label: t("Key color", "মূল রং"), default: "#00ff00" },
      { key: "threshold", type: "range", label: t("Tolerance", "সহনশীলতা"), default: "60", min: "1", max: "200" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "batch-image-processing": {
    fields: [
      MODE_FIELD(
        [
          { value: "grayscale", en: "Grayscale all", bn: "সাদা-কালো" },
          { value: "half", en: "Resize to half", bn: "অর্ধেক সাইজ" },
          { value: "thumb", en: "256px thumbnails", bn: "থাম্বনেইল" },
        ],
        "grayscale",
      ),
    ],
    accept: "image/*", multiple: true, example: {},
  },
  "screenshot-capture": {
    fields: [
      MODE_FIELD(
        [
          { value: "screen", en: "Full screen", bn: "পুরো স্ক্রিন" },
          { value: "window", en: "Window / tab", bn: "উইন্ডো / ট্যাব" },
        ],
        "screen",
      ),
    ],
    example: {},
  },
  "meme-generator": {
    fields: [
      { key: "top", type: "text", label: t("Top text", "উপরের লেখা"), default: "WHEN THE BUILD" },
      { key: "bottom", type: "text", label: t("Bottom text", "নিচের লেখা"), default: "PASSES FIRST TRY" },
    ],
    accept: "image/*", multiple: false, example: {},
  },
  "favicon-multi-size": {
    fields: [], accept: "image/*", multiple: false, example: {},
  },
  "image-base64": {
    fields: [], accept: "image/*", multiple: false, example: {},
  },
  // -- Server-side parity: browser-local utilities with honest limits --------
  "line-numberer": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "first\nsecond" },
      { key: "start", type: "number", label: t("Start at", "শুরু"), default: "1", min: "1", max: "100000" },
    ],
    example: { fields: { text: "first\nsecond", start: "1" } },
  },
  "fancy-text": {
    fields: [
      { key: "text", type: "textarea", label: t("Text", "টেক্সট"), default: "Hello 123" },
      MODE_FIELD(
        [
          { value: "bold", en: "Bold", bn: "বোল্ড" },
          { value: "italic", en: "Italic", bn: "ইটালিক" },
          { value: "monospace", en: "Monospace", bn: "মনোস্পেস" },
        ],
        "bold",
      ),
    ],
    example: { fields: { text: "Hello 123", mode: "bold" } },
  },
  "email-pattern-builder": {
    fields: [
      { key: "first", type: "text", label: t("First name", "নামের প্রথম অংশ"), default: "arifa" },
      { key: "last", type: "text", label: t("Last name", "নামের শেষ অংশ"), default: "rahman" },
      { key: "domain", type: "text", label: t("Domain", "ডোমেইন"), default: "example.com" },
    ],
    example: { fields: { first: "arifa", last: "rahman", domain: "example.com" } },
  },
  "mailto-link-builder": {
    fields: [
      { key: "to", type: "text", label: t("To", "প্রাপক"), default: "hello@example.com" },
      { key: "subject", type: "text", label: t("Subject", "বিষয়"), default: "Hello" },
      { key: "body", type: "textarea", label: t("Body", "বডি"), default: "Hi there" },
    ],
    example: { fields: { to: "hello@example.com", subject: "Hello", body: "Hi there" } },
  },
  "email-signature-builder": {
    fields: [
      { key: "name", type: "text", label: t("Name", "নাম"), default: "Arifa Rahman" },
      { key: "title", type: "text", label: t("Title", "পদবি"), default: "Support Officer" },
      { key: "company", type: "text", label: t("Company", "প্রতিষ্ঠান"), default: "Example Ltd" },
      { key: "phone", type: "text", label: t("Phone", "ফোন"), default: "+880 1XXX-XXXXXX" },
      { key: "website", type: "text", label: t("Website", "ওয়েবসাইট"), default: "https://example.com" },
    ],
    example: { fields: { name: "Arifa Rahman" } },
  },
  "subject-line-advisor": {
    fields: [
      { key: "subject", type: "text", label: t("Subject", "বিষয়"), default: "Monthly update is here" },
    ],
    example: { fields: { subject: "Monthly update is here" } },
  },
};

export function getToolSchema(slug: string): ToolSchema | null {
  return schemas[slug] ?? null;
}

/** Field values merged over schema defaults. */
export function defaultFieldValues(slug: string): Record<string, string> {
  const schema = getToolSchema(slug);
  const out: Record<string, string> = {};
  if (!schema) return out;
  for (const field of schema.fields) out[field.key] = field.default ?? "";
  return out;
}
