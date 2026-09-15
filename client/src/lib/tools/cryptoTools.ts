/** Crypto & security wave: Web Crypto first, installed libs where they win. */
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";

function hexOf(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

async function passwordKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 120000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const PASSPHRASE_WORDS = [
  "apple", "river", "tiger", "mango", "cloud", "dream", "light", "stone", "dance", "flame",
  "garden", "horse", "island", "jungle", "kite", "lemon", "meadow", "night", "ocean", "piano",
  "quiet", "rain", "sun", "tree", "umbrella", "valley", "wind", "yellow", "zebra", "anchor",
  "bridge", "candle", "desert", "eagle", "forest", "grape", "harbor", "ivory", "jacket", "kernel",
  "lantern", "mirror", "needle", "orchard", "pepper", "quilt", "rocket", "saddle", "table", "unicorn",
  "violet", "whale", "yarn", "zephyr", "baker", "cedar", "daisy", "ember", "fiddle", "grove",
  "hazel", "indigo", "juniper", "kiwi", "lark", "maple", "noble", "onyx", "prairie", "quartz",
  "raven", "sable", "tulip", "umbra", "velvet", "willow", "xenon", "yarrow", "zeal", "acorn",
  "birch", "coral", "dune", "elm", "fern", "glacier", "heather", "iris", "jade", "kestrel",
  "lotus", "moss", "nova", "otter", "pine", "quill", "reed", "spruce", "thistle", "ulna",
  "vista", "wren", "yew", "zinc", "amber", "basalt", "clover", "drift", "echo", "frost",
  "gale", "harp", "inlet", "jolt", "knoll", "lumen", "marsh", "north", "opal", "plume",
  "ridge", "stone", "trail", "upland", "vetch", "wild", "yonder", "zip",
];

function passwordEntropy(password: string): { charset: number; bits: number } {
  let charset = 0;
  if (/[a-z]/.test(password)) charset += 26;
  if (/[A-Z]/.test(password)) charset += 26;
  if (/[0-9]/.test(password)) charset += 10;
  if (/[^A-Za-z0-9]/.test(password)) charset += 32;
  if (/[ঀ-৿]/.test(password)) charset += 64;
  return { charset, bits: charset === 0 ? 0 : password.length * Math.log2(charset) };
}

export const runCryptoTools: ToolRunner = async (slug, _input, _option, t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);

  if (slug === "hmac-generator") {
    if (!crypto.subtle) throw new ToolError("tool.error.generic");
    const key = F("key");
    if (!key) throw new ToolError("tool.error.generic");
    const algo = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(F("mode", "SHA-256")) ? F("mode", "SHA-256") : "SHA-256";
    const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: algo }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(F("text")));
    return { text: JSON.stringify({ algorithm: `HMAC-${algo}`, hex: hexOf(signature) }, null, 2) };
  }
  if (slug === "bcrypt-hash-compare") {
    const { default: bcrypt } = await import("bcryptjs");
    const password = F("text");
    const hash = F("hash").trim();
    if (!password) throw new ToolError("tool.error.generic");
    if (hash !== "") {
      let match = false;
      try {
        match = bcrypt.compareSync(password, hash);
      } catch {
        throw new ToolError("tool.error.generic");
      }
      return { text: JSON.stringify({ match }, null, 2) };
    }
    const rounds = Math.min(Math.max(parseInt(F("rounds", "10"), 10) || 10, 4), 14);
    return { text: JSON.stringify({ hash: bcrypt.hashSync(password, rounds), rounds }, null, 2) };
  }
  if (slug === "encrypt-decrypt-text") {
    if (!crypto.subtle) throw new ToolError("tool.error.generic");
    const password = F("password");
    if (!password) throw new ToolError("tool.error.generic");
    if (F("mode", "encrypt") === "decrypt") {
      const parts = F("text").split(".");
      if (parts.length !== 3) throw new ToolError("tool.error.generic");
      try {
        // Three parts proven by the length check; `?? ""` is type-level only.
        const salt = Uint8Array.from(atob(parts[0] ?? ""), (c) => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(parts[1] ?? ""), (c) => c.charCodeAt(0));
        const data = Uint8Array.from(atob(parts[2] ?? ""), (c) => c.charCodeAt(0));
        const key = await passwordKey(password, salt);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource);
        return { text: new TextDecoder().decode(plain) };
      } catch {
        throw new ToolError("tool.error.generic");
      }
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await passwordKey(password, salt);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(F("text")));
    const b64 = (bytes: Uint8Array) => {
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
      return btoa(binary);
    };
    return { text: `${b64(salt)}.${b64(iv)}.${base64Of(cipher)}` };
  }
  if (slug === "rsa-key-pair-generator") {
    if (!crypto.subtle) throw new ToolError("tool.error.generic");
    const bits = F("mode", "2048") === "4096" ? 4096 : 2048;
    const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    return {
      text: JSON.stringify({ publicKey: publicJwk, privateKey: privateJwk }, null, 2),
      label: t("tool.private.note"),
    };
  }
  if (slug === "password-generator") {
    const length = Math.min(Math.max(parseInt(F("length", "20"), 10) || 20, 4), 128);
    const count = Math.min(Math.max(parseInt(F("count", "5"), 10) || 5, 1), 50);
    let chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    if (F("symbols") === "on") chars += "!@#$%^&*()-_=+[]{};:,.?";
    if (F("ambiguous") === "") chars += "0OIl1";
    const bytes = crypto.getRandomValues(new Uint8Array(length * count));
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) {
      let password = "";
      // Bounded by construction; fallbacks are type-level only.
      for (let j = 0; j < length; j += 1) {
        const byte = bytes[i * length + j] ?? 0;
        password += chars[byte % chars.length] ?? "";
      }
      out.push(password);
    }
    return { text: out.join("\n") };
  }
  if (slug === "password-strength-analyzer") {
    const password = F("text");
    const { charset, bits } = passwordEntropy(password);
    const guesses = Math.pow(2, bits);
    const seconds = guesses / 1e10 / 2;
    const verdict = bits < 28 ? "Very weak" : bits < 40 ? "Weak" : bits < 60 ? "Fair" : bits < 80 ? "Strong" : "Very strong";
    const tips: string[] = [];
    if (password.length < 12) tips.push("Use at least 12 characters.");
    if (!/[A-Z]/.test(password)) tips.push("Add uppercase letters.");
    if (!/[0-9]/.test(password)) tips.push("Add digits.");
    if (!/[^A-Za-z0-9ঀ-৿]/.test(password)) tips.push("Add symbols.");
    return { text: JSON.stringify({ length: password.length, charset, entropyBits: Number(bits.toFixed(1)), verdict, crackEstimate: secondsToWords(seconds), tips }, null, 2) };
  }
  if (slug === "passphrase-generator") {
    const count = Math.min(Math.max(parseInt(F("words", "5"), 10) || 5, 3), 12);
    const separator = F("separator", "-");
    const bytes = crypto.getRandomValues(new Uint8Array(count));
    const picked: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const byte = bytes[i] ?? 0;
      picked.push(PASSPHRASE_WORDS[byte % PASSPHRASE_WORDS.length] ?? "");
    }
    return { text: picked.join(separator) };
  }
  if (slug === "totp-otp-generator") {
    const { TOTP } = await import("otpauth");
    const secret = F("secret").replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-Z2-7]+=*$/.test(secret) || secret.length < 8) throw new ToolError("tool.error.generic");
    const digits = Math.min(Math.max(parseInt(F("digits", "6"), 10) || 6, 6), 8);
    const period = Math.min(Math.max(parseInt(F("period", "30"), 10) || 30, 10), 120);
    const totp = new TOTP({ issuer: "ToolsHub", label: "account", algorithm: "SHA1", digits, period, secret });
    const remaining = period - Math.floor((Date.now() / 1000) % period);
    return { text: JSON.stringify({ code: totp.generate(), secondsLeft: remaining, uri: totp.toString() }, null, 2) };
  }
  if (slug === "basic-auth-header") {
    const user = F("user");
    const bytes = new TextEncoder().encode(`${user}:${F("pass")}`);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
    return { text: `Basic ${btoa(binary)}` };
  }
  if (slug === "file-to-base64") {
    const file = extra?.files?.[0];
    if (!file) throw new ToolError("tool.error.generic");
    if (file.size > 10 * 1024 * 1024) throw new ToolError("tool.error.fileTooLarge");
    const buffer = await file.arrayBuffer();
    const encoded = base64Of(buffer);
    return {
      text: encoded,
      artifacts: [{ name: `${file.name}.b64.txt`, mime: "text/plain", dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(encoded)}` }],
    };
  }
  if (slug === "outlook-safelink-decoder") {
    let url: URL;
    try {
      url = new URL(F("text").trim());
    } catch {
      throw new ToolError("tool.error.generic");
    }
    const inner = url.searchParams.get("url");
    if (!url.hostname.includes("safelinks.protection.outlook.com") || !inner) throw new ToolError("tool.error.generic");
    return { text: inner };
  }
  if (slug === "bip39-mnemonic-generator") {
    const { generateMnemonic } = await import("bip39");
    return { text: generateMnemonic(128) };
  }
  if (slug === "pdf-signature-checker") {
    // Honest boundary: parses signature dictionaries (ByteRange presence) but
    // does not claim cryptographic verification — chain validation needs
    // trusted roots this browser does not ship. Same pattern as JWT decode.
    const file = extra?.files?.[0];
    if (!file) throw new ToolError("tool.error.generic");
    if (file.size > 50 * 1024 * 1024) throw new ToolError("tool.error.fileTooLarge");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 4000000)));
    const byteRanges: number[][] = [];
    const matcher = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
    let found: RegExpExecArray | null;
    while ((found = matcher.exec(text)) !== null) byteRanges.push(found.slice(1, 5).map(Number));
    const hasSig = /\/Type\s*\/Sig|adbe\.pkcs7/i.test(text);
    return {
      text: JSON.stringify(
        { file: file.name, signatures: byteRanges.length, byteRanges, present: hasSig || byteRanges.length > 0, verified: "not verified locally — needs a trusted certificate chain" },
        null,
        2,
      ),
    };
  }
  return null;
};

function secondsToWords(seconds: number): string {
  if (!Number.isFinite(seconds)) return "heat death of the universe";
  const units: Array<[number, string]> = [[31536000, "years"], [86400, "days"], [3600, "hours"], [60, "minutes"], [1, "seconds"]];
  for (const [size, name] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return n >= 1e12 ? "millennia" : `${n.toLocaleString()} ${name}`;
    }
  }
  return "instantly";
}
