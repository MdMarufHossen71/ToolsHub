import {
  Braces, Calculator, ChartNoAxesCombined, Clock3, Code2,
  FileText, Gamepad2, Image, Palette, ShieldCheck,
  Sparkles, TextCursorInput, WandSparkles,
} from "lucide-react";

// The `.ts` extension is explicit so `scripts/i18n-parity.mjs` can import this
// module chain through plain Node ESM as well as through Vite.
import { toolDescriptions } from "./toolDescriptions.ts";

export type ToolGroup = "text" | "crypto" | "data" | "image" | "color" | "math" | "time" | "random" | "file" | "seo" | "misc" | "ai";

export type Tool = {
  name: string;
  slug: string;
  category: string;
  categoryBn: string;
  group: ToolGroup;
  description: { bn: string; en: string };
  keywords: string[];
  featured?: boolean;
};

export const groupMeta: Record<ToolGroup, { label: string; bn: string; icon: typeof Code2; tone: string }> = {
  text: { label: "Text & String", bn: "টেক্সট ও স্ট্রিং", icon: TextCursorInput, tone: "text-cyan-600 bg-cyan-500/10" },
  crypto: { label: "Crypto & Security", bn: "ক্রিপ্টো ও নিরাপত্তা", icon: ShieldCheck, tone: "text-violet-600 bg-violet-500/10" },
  data: { label: "Developer & Data", bn: "ডেভেলপার ও ডেটা", icon: Braces, tone: "text-blue-600 bg-blue-500/10" },
  image: { label: "Image Studio", bn: "ইমেজ স্টুডিও", icon: Image, tone: "text-rose-600 bg-rose-500/10" },
  color: { label: "Color Lab", bn: "কালার ল্যাব", icon: Palette, tone: "text-orange-600 bg-orange-500/10" },
  math: { label: "Calculators", bn: "ক্যালকুলেটর", icon: Calculator, tone: "text-emerald-600 bg-emerald-500/10" },
  time: { label: "Date & Time", bn: "তারিখ ও সময়", icon: Clock3, tone: "text-sky-600 bg-sky-500/10" },
  random: { label: "Random & Generators", bn: "র‍্যান্ডম ও জেনারেটর", icon: Sparkles, tone: "text-fuchsia-600 bg-fuchsia-500/10" },
  file: { label: "File & PDF", bn: "ফাইল ও পিডিএফ", icon: FileText, tone: "text-amber-700 bg-amber-500/10" },
  seo: { label: "SEO & Web", bn: "SEO ও ওয়েব", icon: ChartNoAxesCombined, tone: "text-lime-700 bg-lime-500/10" },
  misc: { label: "Fun & Misc", bn: "মজার ও অন্যান্য", icon: Gamepad2, tone: "text-pink-600 bg-pink-500/10" },
  ai: { label: "AI Tools", bn: "AI টুলস", icon: WandSparkles, tone: "text-indigo-600 bg-indigo-500/10" },
};

type Seed = Omit<Tool, "name" | "slug" | "description" | "keywords"> & { names: string };

const seeds: Seed[] = [
  { category: "Text & String", categoryBn: "টেক্সট ও স্ট্রিং", group: "text", featured: true, names: "Word Counter|Case Converter|Reverse Text|Text Repeater|Find & Replace|Remove Extra Whitespaces|Remove Empty Lines|Remove Line Breaks|Remove Duplicate Lines|Sort List|List Randomizer|Filter Lines|Add Text to Each Line|Tabs to Spaces|Comma Inserter|Text Splitter|Space Remover|Character Remover|Slug Generator|String Obfuscator|Text Censor|Text Diff Checker|Text to NATO Alphabet|Text to ASCII|Text to Binary|Text to Hex|Text to Unicode|Zalgo Text Generator|ASCII Art Text Generator|Numeronym Generator|Lorem Ipsum Generator|Random Sentence Generator|Emoji & Kaomoji Picker|Unicode Character Finder|Regex Replacer|String Shuffler|Morse Code|ROT13 Caesar Cipher|Base64 Text|URL Encode Decode|HTML Entities|Email Normalizer|Markdown to HTML|HTML to Plain Text" },
  { category: "Crypto & Security", categoryBn: "ক্রিপ্টো ও নিরাপত্তা", group: "crypto", featured: true, names: "Hash Generator|HMAC Generator|Bcrypt Hash & Compare|Encrypt Decrypt Text|RSA Key Pair Generator|Password Generator|Password Strength Analyzer|Passphrase Generator|TOTP OTP Generator|JWT Decoder Debugger|UUID Generator|ULID Generator|NanoID Generator|BIP39 Mnemonic Generator|Basic Auth Header|Secure Token Generator|File to Base64|Outlook SafeLink Decoder|PDF Signature Checker" },
  { category: "Developer & Data", categoryBn: "ডেভেলপার ও ডেটা", group: "data", featured: true, names: "JSON Formatter Validator|JSON Minifier|JSON to CSV TSV|CSV Converter|CSV Sorter|YAML JSON TOML XML Converter|XML Formatter|YAML Formatter|TOML Formatter|SQL Formatter|Markdown Editor|HTML Beautifier|CSS Beautifier Minifier|JavaScript Beautifier Minifier|JSON Diff|Code Syntax Highlighter|Regex Tester|Compare Files|JSON Schema Validator|URL Parser|URL Builder|Open Graph Generator|Twitter Card Generator|Meta Tags Generator|robots.txt Generator|XML Sitemap Generator|Keyword Density Analyzer|Favicon Generator|Device Information|User Agent Parser|Keycode Info|HTTP Status Codes|MIME Types Lookup|Git Cheatsheet|Crontab Generator|Chmod Calculator|Docker Run Converter|Random Port Generator|MAC Address Generator|IPv4 Subnet Calculator|IPv4 Address Converter|IPv4 Range Expander|IPv6 ULA Generator|Benchmark Builder|ETA Calculator|Math Evaluator|HTML WYSIWYG Editor|SVG Placeholder Generator|Camera Recorder|Screen Audio Recorder" },
  { category: "Image Studio", categoryBn: "ইমেজ স্টুডিও", group: "image", featured: true, names: "Image Resize|Image Crop|Image Rotate|Image Flip|Image Format Converter|Image Compressor|Brightness Contrast|Saturation Vibrance|Exposure Gamma|Hue HSL Adjust|RGB Channels|Grayscale Sepia Invert|Colorize Duotone|Blur Sharpen|Noise Pixelate|Posterize Solarize Threshold|Vignette Glow|Emboss Clip Effect|Equalize|Edge Detection|Tilt Shift|Vintage Instant Lomo|Blend Colors into Image|Merge Images|Overlay Images|Split Image|Round Corners|Add Border Frame|Text Watermark Image|Image Color Picker|Image Gradient Generator|Random Bitmap Generator|SVG PNG Converter|Blurred Background Frame|Image Censor|GIF Toolkit|Video Thumbnail Extractor|Background Remover|Batch Image Processing|Screenshot Capture|Meme Generator|Favicon Multi Size|EXIF Viewer|Image Base64|SVG Optimizer" },
  { category: "Color Lab", categoryBn: "কালার ল্যাব", group: "color", names: "Color Picker|HEX RGB HSL HSV Converter|CSS Named Colors|Lighten Darken Color|Saturation Shift|Greyscale Color|Invert Color|Hue Shift Color|Random Color Generator|Color Scheme Generator|Color Blender|Gradient Generator|Gradient Palette|Contrast Checker|Palette Extractor|Color Blindness Simulator|Shades Tints Generator" },
  { category: "Calculators", categoryBn: "ক্যালকুলেটর", group: "math", featured: true, names: "Basic Calculator|Scientific Calculator|Percentage Calculator|Area Calculator|Rule of Three|Trigonometry Calculator|Radians Degrees Converter|BMI Calculator|Age Calculator|Date Difference Calculator|Loan EMI Calculator|Tip Calculator|Ratio Calculator|Unit Converter|Temperature Converter|Fibonacci Generator|Prime Checker Generator|Number Base Converter|Binary Hex Octal Converter|Roman Numeral Converter|Average Min Max|Number List Generator|Number to Words|Percentage Fraction Decimal|GPA Calculator|Discount Calculator|Bangla Calendar Converter" },
  { category: "Date & Time", categoryBn: "তারিখ ও সময়", group: "time", names: "Add Subtract Date|Unix Timestamp Converter|Countdown Timer|Stopwatch|World Clock|Timezone Converter|Date Formatter|Julian Date|Days Between Dates|Working Days Calculator|Timer With Alarm" },
  { category: "Random & Generators", categoryBn: "র‍্যান্ডম ও জেনারেটর", group: "random", names: "Random Number Generator|Gaussian Generator|Random String Generator|Coin Flipper|Dice Roller|List Wheel Picker|Random Team Generator|Random Name Generator|Mock Data Generator|QR Code Generator|Barcode Generator|Random File Generator|IBAN Validator|Credit Card Validator|Email Validator|Phone Number Parser|VIN Checker|ISBN Validator" },
  { category: "File & PDF", categoryBn: "ফাইল ও পিডিএফ", group: "file", names: "Split File|Join Files|File Hash Calculator|File Type Detector|File Size Converter|Batch File Rename|PDF Merge|PDF Split|PDF Rotate|PDF Page Reorder|PDF to Images|Images to PDF|PDF Watermark|Compress PDF|XLSX JSON Converter|ZIP Creator Extractor|Text to File Download" },
  { category: "SEO & Web", categoryBn: "SEO ও ওয়েব", group: "seo", names: "Htaccess Redirect Generator|Website Text Extractor|HTML Entity Table|SEO Word Counter|Twitter Card Info|HTML Minifier|CSS Minifier|JS Minifier" },
  { category: "Fun & Misc", categoryBn: "মজার ও অন্যান্য", group: "misc", names: "Age In Seconds|Dog Cat Years Converter|Typing Speed Test|Reaction Time Test|Decision Wheel|Event Countdown|Love Calculator|Screen Ruler|Fullscreen Dead Pixel Test|Whiteboard|Notes Pad|Pomodoro Timer|Screen Resolution Detector|Aspect Ratio Calculator|Aspect Ratio Cropper" },
  { category: "AI Tools", categoryBn: "AI টুলস", group: "ai", names: "AI Chat Assistant|AI Paraphraser|AI Summarizer|AI Grammar Fixer|AI Translator|AI Tone Changer|AI Image Generator|AI Image Editor|Speech to Text|Text to Speech|AI Code Helper|PDF Q&A" },
];

const titleToSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Fallback description, used only for a tool with no hand-written entry in
 * `toolDescriptions`. It is deliberately generic, because a generic sentence is what
 * this function can honestly produce — it knows a tool's name and group and nothing
 * about what the tool does. Every tool in the registry currently has a real entry;
 * this exists so adding a name to `seeds` cannot render an empty card.
 */
function describeTool(name: string, group: ToolGroup) {
  const localLine = group === "image" || group === "file" ? "Files are handled on this device." : "Your working text stays in this browser.";
  return {
    en: `${name}, in a focused browser workbench. ${localLine}`,
    bn: `${name} — কাজটি ব্রাউজারেই সারুন। আপনার কাজ এই ডিভাইসেই থাকে।`,
  };
}

export const toolRegistry: Tool[] = seeds.flatMap((seed) => seed.names.split("|").map((name) => ({
  name,
  slug: titleToSlug(name),
  category: seed.category,
  categoryBn: seed.categoryBn,
  group: seed.group,
  featured: seed.featured,
  description: toolDescriptions[name] ?? describeTool(name, seed.group),
  keywords: `${name} ${seed.category} ${seed.categoryBn}`.toLowerCase().split(/\s+/),
})));

export const findTool = (slug: string) => toolRegistry.find((tool) => tool.slug === slug);
// Re-exported so the lazy pages keep one import site; the map itself lives in a module
// with no dependency on the tool descriptions (see `toolIcons.ts`). The `.ts` extension
// keeps the chain resolvable by plain Node ESM for `scripts/i18n-parity.mjs`.
export { getToolIcon } from "./toolIcons.ts";
export const featuredTools = toolRegistry.filter((tool) => tool.featured).slice(0, 12);
export const categories = Object.entries(groupMeta).map(([key, value]) => ({ id: key as ToolGroup, ...value, count: toolRegistry.filter((t) => t.group === key).length }));

export function fuzzyMatch(tool: Tool, query: string) {
  const text = `${tool.name} ${tool.category} ${tool.categoryBn} ${tool.keywords.join(" ")}`.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (text.includes(needle)) return true;
  let index = 0;
  for (const char of text) if (char === needle[index]) index += 1;
  return index === needle.length;
}
