/**
 * The slug list `runTool` actually implements.
 *
 * Kept in its own dependency-free module (no React, no alias imports) so the
 * build-time shell generator can import it under `node --experimental-strip-types`,
 * the same way `scripts/i18n-parity.mjs` imports the registries. `toolOperations.ts`
 * re-exports it, so existing importers keep one entry point.
 */
export const IMPLEMENTED_TOOLS: ReadonlySet<string> = new Set([
  // Text & string
  "word-counter", "case-converter", "reverse-text", "remove-extra-whitespaces", "remove-empty-lines",
  "remove-line-breaks", "remove-duplicate-lines", "sort-list", "list-randomizer", "string-shuffler",
  "slug-generator", "text-to-nato-alphabet", "text-to-ascii", "text-to-binary", "text-to-hex",
  "morse-code", "rot13-caesar-cipher", "base64-text", "url-encode-decode", "html-entities",
  "email-normalizer", "html-to-plain-text", "markdown-to-html",
  "text-repeater", "find-replace", "filter-lines", "add-text-to-each-line", "tabs-to-spaces",
  "comma-inserter", "text-splitter", "space-remover", "character-remover", "string-obfuscator",
  "text-censor", "text-to-unicode", "zalgo-text-generator", "numeronym-generator",
  "lorem-ipsum-generator", "random-sentence-generator", "regex-replacer",
  "emoji-kaomoji-picker", "unicode-character-finder",
  "ascii-art-text-generator", "text-diff-checker",
  // Crypto & security
  "hash-generator", "uuid-generator", "ulid-generator", "nanoid-generator", "secure-token-generator",
  "jwt-decoder-debugger",
  "hmac-generator", "bcrypt-hash-compare", "encrypt-decrypt-text", "rsa-key-pair-generator",
  "password-generator", "password-strength-analyzer", "passphrase-generator", "totp-otp-generator",
  "basic-auth-header", "file-to-base64", "outlook-safelink-decoder", "bip39-mnemonic-generator",
  "pdf-signature-checker",
  // Developer & data
  "markdown-editor", "json-formatter-validator", "json-minifier", "yaml-formatter", "toml-formatter",
  "xml-formatter", "yaml-json-toml-xml-converter", "sql-formatter", "url-parser",
  "keyword-density-analyzer", "chmod-calculator", "math-evaluator",
  "json-to-csv-tsv", "csv-converter", "csv-sorter", "json-diff", "compare-files",
  "regex-tester", "url-builder", "open-graph-generator", "twitter-card-generator",
  "meta-tags-generator", "robots-txt-generator", "xml-sitemap-generator",
  "device-information", "user-agent-parser", "http-status-codes", "mime-types-lookup",
  "git-cheatsheet", "random-port-generator", "mac-address-generator",
  "ipv4-subnet-calculator", "ipv4-address-converter", "ipv4-range-expander",
  "ipv6-ula-generator", "eta-calculator", "svg-placeholder-generator",
  "docker-run-converter", "crontab-generator",
  "html-beautifier", "css-beautifier-minifier", "javascript-beautifier-minifier",
  "code-syntax-highlighter", "json-schema-validator", "html-minifier", "css-minifier",
  "js-minifier", "xlsx-json-converter",
  "keycode-info", "benchmark-builder", "favicon-generator", "html-wysiwyg-editor",
  "camera-recorder", "screen-audio-recorder",
  // Colour
  "hex-rgb-hsl-hsv-converter", "color-picker",
  "css-named-colors", "lighten-darken-color", "saturation-shift", "greyscale-color",
  "invert-color", "hue-shift-color", "random-color-generator", "color-scheme-generator",
  "color-blender", "gradient-generator", "gradient-palette", "contrast-checker",
  "color-blindness-simulator", "shades-tints-generator",
  // Calculators
  "basic-calculator", "scientific-calculator", "percentage-calculator", "bmi-calculator",
  "area-calculator", "rule-of-three", "trigonometry-calculator", "radians-degrees-converter",
  "age-calculator", "date-difference-calculator", "tip-calculator", "ratio-calculator",
  "unit-converter", "temperature-converter", "fibonacci-generator", "prime-checker-generator",
  "number-base-converter", "binary-hex-octal-converter", "roman-numeral-converter",
  "average-min-max", "number-list-generator", "number-to-words", "percentage-fraction-decimal",
  "gpa-calculator", "discount-calculator", "loan-emi-calculator", "bangla-calendar-converter",
  // Date & time
  "add-subtract-date", "unix-timestamp-converter", "date-formatter", "julian-date",
  "days-between-dates", "working-days-calculator", "timezone-converter",
  "countdown-timer", "stopwatch", "world-clock", "timer-with-alarm",
  // Random & generators
  "random-number-generator", "random-string-generator", "email-validator",
  "gaussian-generator", "coin-flipper", "dice-roller", "random-team-generator",
  "random-name-generator", "mock-data-generator", "random-file-generator",
  "qr-code-generator", "barcode-generator", "iban-validator", "credit-card-validator",
  "phone-number-parser", "vin-checker", "isbn-validator", "list-wheel-picker",
  // File
  "file-hash-calculator",
  "split-file", "join-files", "file-type-detector", "file-size-converter",
  "batch-file-rename", "text-to-file-download", "zip-creator-extractor",
  "pdf-merge", "pdf-split", "pdf-rotate", "pdf-page-reorder", "pdf-watermark",
  "images-to-pdf", "svg-optimizer", "exif-viewer", "pdf-to-images", "compress-pdf",
  // Image Studio
  "image-resize", "image-crop", "image-rotate", "image-flip", "image-format-converter",
  "image-compressor", "brightness-contrast", "saturation-vibrance", "exposure-gamma",
  "hue-hsl-adjust", "rgb-channels", "grayscale-sepia-invert", "colorize-duotone",
  "blur-sharpen", "noise-pixelate", "posterize-solarize-threshold", "vignette-glow",
  "emboss-clip-effect", "equalize", "edge-detection", "tilt-shift", "vintage-instant-lomo",
  "blend-colors-into-image", "merge-images", "overlay-images", "split-image",
  "round-corners", "add-border-frame", "text-watermark-image", "image-color-picker",
  "image-gradient-generator", "random-bitmap-generator", "svg-png-converter",
  "blurred-background-frame", "image-censor", "gif-toolkit", "video-thumbnail-extractor",
  "background-remover", "batch-image-processing", "screenshot-capture", "meme-generator",
  "favicon-multi-size", "image-base64", "palette-extractor",
  // Misc
  "notes-pad",
  "age-in-seconds", "dog-cat-years-converter", "love-calculator",
  "aspect-ratio-calculator", "aspect-ratio-cropper", "event-countdown",
  "screen-resolution-detector",
  "typing-speed-test", "reaction-time-test", "decision-wheel",
  "screen-ruler", "fullscreen-dead-pixel-test", "whiteboard", "pomodoro-timer",
  // SEO & web
  "htaccess-redirect-generator", "html-entity-table", "seo-word-counter",
  "twitter-card-info", "website-text-extractor",
]);
