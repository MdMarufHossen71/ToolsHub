/**
 * The changelog, as data.
 *
 * Every entry below is taken from the repository's own history — the commit subjects
 * and dates in `git log` and the phase documents under `docs/` — rather than written
 * from memory, so nothing here claims a change that did not happen. Newest first.
 *
 * The prose lives here, in bilingual pairs, for the same reason tool and game
 * descriptions do: it is content, not interface chrome, and the translation dictionary
 * is for the latter. The page title, eyebrow and footer line do go through `t()`.
 */
export type ChangelogEntry = {
  /** ISO calendar date (`yyyy-mm-dd`) of the change. */
  date: string;
  title: { en: string; bn: string };
  items: Array<{ en: string; bn: string }>;
};

export const changelog: readonly ChangelogEntry[] = [
  {
    date: "2026-09-12",
    title: { en: "Polish pass: stability, load speed and honest states", bn: "পরিমার্জন: স্থিরতা, লোডের গতি ও সৎ অবস্থা" },
    items: [
      {
        en: "The install offer became a fixed overlay, so offering install no longer pushes the page down (measured layout shift at 1440×1000 fell from 0.047 to 0).",
        bn: "ইনস্টল প্রস্তাবটি fixed overlay হয়েছে, তাই ইনস্টল অফার আর পেজ নিচে ঠেলে দেয় না (১৪৪০×১০০০-এ মাপা layout shift ০.০৪৭ থেকে ০ হয়েছে)।",
      },
      {
        en: "Webfonts are requested from the page head instead of a CSS @import, so they no longer wait behind the app's own stylesheet.",
        bn: "Webfont এখন CSS @import-এর বদলে পেজ হেড থেকে চাওয়া হয়, তাই আর অ্যাপের নিজের স্টাইলশিটের পিছনে অপেক্ষা করতে হয় না।",
      },
      {
        en: "Removed an unused toast host and tooltip provider from the entry bundle: entry JavaScript fell from 413 KB to 338 KB.",
        bn: "অব্যবহৃত toast host ও tooltip provider entry bundle থেকে সরানো হয়েছে: entry JavaScript ৪১৩ KB থেকে ৩৩৮ KB হয়েছে।",
      },
      {
        en: "A slow tool run and a slow game chunk now show a skeleton in place, instead of stale output or a bare line of text.",
        bn: "ধীরগতির tool run ও গেম chunk এখন পুরনো output বা এক লাইন লেখার বদলে একটি skeleton দেখায়।",
      },
      {
        en: "A bad clean path such as /tools/does-not-exist/ serves the real 404 page again, both on the static host and on the preview server.",
        bn: "/tools/does-not-exist/ -এর মতো ভুল clean path এখন আবার সত্যিকারের 404 পেজ দেয়, static host ও preview server দুটোতেই।",
      },
      {
        en: "Added this changelog, and repaired the hardcoded-string audit, whose JSX text check had silently stopped running.",
        bn: "এই changelog যোগ করা হয়েছে, এবং hardcoded-string audit ঠিক করা হয়েছে, যার JSX text পরীক্ষা চুপচাপ বন্ধ হয়ে গিয়েছিল।",
      },
    ],
  },
  {
    date: "2026-09-09",
    title: { en: "Tools & Games BD becomes ToolsHub", bn: "Tools & Games BD এখন ToolsHub" },
    items: [
      {
        en: "Renamed the project across the wordmark, page titles, backup file names and source files, with the old name no longer used anywhere the site is read or saved.",
        bn: "Wordmark, page title, backup ফাইলের নাম ও source ফাইলজুড়ে প্রকল্পের নাম বদলানো হয়েছে; সাইট পড়া বা সেভ হওয়ার কোথাও পুরনো নাম আর নেই।",
      },
    ],
  },
  {
    date: "2026-09-07",
    title: { en: "Building the workbench: waves 1–7", bn: "ওয়ার্কবেঞ্চ তৈরি: wave ১–৭" },
    items: [
      {
        en: "61 zero-dependency tools (wave 1), 81 dependency-backed tools (wave 2), 15 parser and format tools (wave 3), 43 image tools (wave 4) and 19 live instruments (wave 5).",
        bn: "৬১টি zero-dependency টুল (wave ১), ৮১টি dependency-নির্ভর টুল (wave ২), ১৫টি parser ও format টুল (wave ৩), ৪৩টি image টুল (wave ৪) এবং ১৯টি live instrument (wave ৫)।",
      },
      {
        en: "Recently used tools, favorites, per-tool modes, sticky filters and visible notices followed in waves 6–7.",
        bn: "wave ৬–৭-এ যোগ হয় সম্প্রতি ব্যবহৃত টুল, পছন্দের তালিকা, প্রতি-টুল মোড, sticky filter ও দৃশ্যমান নোটিশ।",
      },
      {
        en: "All 32 games became playable with a keyboard and with touch, each saving its high score on the device only.",
        bn: "৩২টি গেমই keyboard ও touch দুটোতেই খেলার যোগ্য হলো, প্রতিটি high score শুধু ডিভাইসেই সেভ করে।",
      },
      {
        en: "Heavy parsers were split into chunks loaded on first use, so the home page no longer ships them.",
        bn: "ভারী parser প্রথম ব্যবহারে লোড হওয়া chunk-এ ভাগ করা হলো, তাই হোম পেজ আর সেগুলো বহন করে না।",
      },
    ],
  },
  {
    date: "2026-09-07",
    title: { en: "Performance, security and privacy audit", bn: "কর্মক্ষমতা, নিরাপত্তা ও গোপনীয়তা নিরীক্ষা" },
    items: [
      {
        en: "Route-level code splitting replaced a single 1.2 MB script, and the per-page metadata that search engines and social cards need was added.",
        bn: "একটি ১.২ MB স্ক্রিপ্টের বদলে route-level code splitting এল, এবং search engine ও social card-এর জন্য দরকারি per-page metadata যোগ হলো।",
      },
      {
        en: "Hashing moved to the browser's Web Crypto, with local file hashing capped at 50 MB and nothing uploaded.",
        bn: "Hashing এল ব্রাউজারের Web Crypto-তে, লোকাল file hashing সর্বোচ্চ ৫০ MB এবং কিছুই আপলোড হয় না।",
      },
      {
        en: "Removed the eval-based math path, and scoped data export, clear and import to this site's own storage keys.",
        bn: "eval-ভিত্তিক math path সরানো হলো, এবং data export, clear ও import এই সাইটের নিজের storage key-এ সীমাবদ্ধ হলো।",
      },
      {
        en: "Adopted the MIT licence and fixed the privacy copy so it describes only what the site actually does.",
        bn: "MIT লাইসেন্স গৃহীত হলো এবং privacy লেখা ঠিক করা হলো, যাতে তা কেবল সাইটের সত্যিকার কাজের বর্ণনা দেয়।",
      },
    ],
  },
  {
    date: "2026-08-14",
    title: { en: "First release", bn: "প্রথম প্রকাশ" },
    items: [
      {
        en: "The bilingual English and Bangla workbench went up, with every tool running in the browser.",
        bn: "ইংরেজি ও বাংলা দুই ভাষার ওয়ার্কবেঞ্চ চালু হলো, যেখানে প্রতিটি টুল ব্রাউজারেই চলে।",
      },
    ],
  },
];

// The footer's "last updated" date and the shared locale formatter live in
// `lib/siteUpdated.ts`, not here, so the shell does not pull this entry list into the
// entry chunk. See that file's comment.
