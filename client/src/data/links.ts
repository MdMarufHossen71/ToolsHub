/**
 * Curated outbound directory.
 *
 * Every entry carries genuinely separate Bangla and English copy. Previously the
 * `make` helper set `en: bn`, so an English reader saw Bangla descriptions on all
 * twenty-two rows while the page looked complete. The helper now requires both
 * strings, which makes that mistake impossible to repeat silently.
 */
export type UsefulLink = { name: string; url: string; category: string; categoryBn: string; description: { bn: string; en: string } };
const make = (category: string, categoryBn: string, name: string, url: string, bn: string, en: string): UsefulLink => ({ name, url, category, categoryBn, description: { bn, en } });
export const usefulLinks: UsefulLink[] = [
  make("Education", "শিক্ষা", "Khan Academy", "https://www.khanacademy.org", "বিনামূল্যে বিষয়ভিত্তিক শেখার প্ল্যাটফর্ম।", "Free subject-by-subject lessons and practice, from arithmetic to university physics."),
  make("Education", "শিক্ষা", "freeCodeCamp", "https://www.freecodecamp.org", "কোডিং শেখা ও প্র্যাকটিসের ফ্রি প্ল্যাটফর্ম।", "Free coding curriculum with in-browser exercises and certification projects."),
  make("Education", "শিক্ষা", "MDN Web Docs", "https://developer.mozilla.org", "ওয়েব প্রযুক্তির নির্ভরযোগ্য ডকুমেন্টেশন।", "The reference documentation for HTML, CSS, JavaScript and browser APIs."),
  make("Design", "ডিজাইন", "Figma", "https://www.figma.com", "ইন্টারফেস ডিজাইন ও সহযোগিতার টুল।", "Interface design and prototyping in the browser, with a free personal tier."),
  make("Design", "ডিজাইন", "Canva", "https://www.canva.com", "সহজ গ্রাফিক ডিজাইনের ওয়েব অ্যাপ।", "Template-driven graphic design for posters, slides and social posts."),
  make("Design", "ডিজাইন", "Photopea", "https://www.photopea.com", "ব্রাউজারেই শক্তিশালী ইমেজ এডিটর।", "A capable layered image editor that runs entirely in the browser and opens PSD files."),
  make("Developer", "ডেভেলপার", "GitHub", "https://github.com", "কোড হোস্টিং ও ওপেন-সোর্স সহযোগিতা।", "Code hosting, issue tracking and open-source collaboration, plus free static site hosting."),
  make("Developer", "ডেভেলপার", "Stack Overflow", "https://stackoverflow.com", "ডেভেলপার প্রশ্নোত্তরের কমিউনিটি।", "Question-and-answer archive for concrete programming problems."),
  make("Developer", "ডেভেলপার", "DevDocs", "https://devdocs.io", "দ্রুত API ডকুমেন্টেশন সার্চ।", "Fast unified search across API documentation for hundreds of languages and libraries, with offline support."),
  make("Productivity", "প্রোডাক্টিভিটি", "Google Drive", "https://drive.google.com", "ফাইল ও ডকুমেন্ট ব্যবস্থাপনা।", "Cloud file storage with collaborative documents, spreadsheets and slides."),
  make("Productivity", "প্রোডাক্টিভিটি", "Notion", "https://www.notion.so", "নোট ও প্রজেক্ট সংগঠনের ওয়ার্কস্পেস।", "Flexible workspace for notes, wikis and lightweight project tracking."),
  make("AI", "AI সাইট", "ChatGPT", "https://chatgpt.com", "সাধারণ কাজের AI সহকারী।", "General-purpose AI assistant for writing, explaining and drafting code."),
  make("AI", "AI সাইট", "Google Gemini", "https://gemini.google.com", "Google-এর AI সহকারী।", "Google's AI assistant, with image understanding and Workspace integration."),
  make("AI", "AI সাইট", "Hugging Face", "https://huggingface.co", "ওপেন AI মডেল ও কমিউনিটি।", "Open model and dataset hub, with runnable demos for most published models."),
  make("Bangladesh", "বাংলাদেশ", "Education Board Results", "https://eboardresults.gov.bd", "শিক্ষা বোর্ডের ফলাফল দেখুন।", "Official portal for SSC, HSC and other education board results."),
  make("Bangladesh", "বাংলাদেশ", "NID Services", "https://services.nidw.gov.bd/nid-pub/", "এনআইডি নিবন্ধন, সংশোধন ও ডুপ্লিকেট কপির সেবা।", "Election Commission portal for NID registration, correction, duplicate copies and downloads."),
  make("Bangladesh", "বাংলাদেশ", "Bangladesh e-Passport", "https://epassport.gov.bd/", "ই-পাসপোর্টের অনলাইন আবেদন ও রি-ইস্যু পোর্টাল।", "Official e-Passport portal for online applications and reissues."),
  make("Bangladesh", "বাংলাদেশ", "Birth Registration", "https://bdris.gov.bd/", "জন্ম-মৃত্যু নিবন্ধন, স্ট্যাটাস ও সনদ পুনর্মুদ্রণ।", "Birth and death registration with application status, certificate reprint and corrections."),
  make("Bangladesh", "বাংলাদেশ", "BRTA Service Portal", "https://bsp.brta.gov.bd/", "ড্রাইভিং লাইসেন্স, নবায়ন, নিবন্ধন ও ফি প্রদান।", "BRTA portal for licences, renewals, duplicate licences, registration and fee payments."),
  make("Bangladesh", "বাংলাদেশ", "Land Services", "https://land.gov.bd/", "নামজারি, ভূমি উন্নয়ন কর, রেকর্ড ও ম্যাপ সেবা।", "Land portal for mutation, development tax, records, maps and related services."),
  make("Bangladesh", "বাংলাদেশ", "Railway E-Ticket", "https://eticket.railway.gov.bd/", "রেলের অনলাইন টিকিট কাটার পোর্টাল।", "Online portal for Bangladesh Railway e-tickets."),
  make("Bangladesh", "বাংলাদেশ", "e-Tax Return", "https://etaxnbr.gov.bd/", "এনবিআরের অনলাইন কর রিটার্ন দাখিল।", "NBR online portal for e-return filing, linked from the official NBR site."),
  make("Bangladesh", "বাংলাদেশ", "Bangladesh Railway", "https://railway.gov.bd", "বাংলাদেশ রেলওয়ের অফিসিয়াল তথ্য।", "Official Bangladesh Railway site for schedules, fares and ticketing information."),
  make("Bangladesh", "বাংলাদেশ", "bKash", "https://www.bkash.com", "বিকাশের অফিসিয়াল ওয়েবসাইট।", "Official site for the bKash mobile financial service, including charges and agent lookup."),
  make("Bangladesh", "বাংলাদেশ", "NBR", "https://nbr.gov.bd", "জাতীয় রাজস্ব বোর্ডের অফিসিয়াল পোর্টাল।", "National Board of Revenue portal for tax rates, returns and e-TIN registration."),
  make("Bangladesh", "বাংলাদেশ", "BDjobs", "https://bdjobs.com", "বাংলাদেশের চাকরির পোর্টাল।", "The largest job board in Bangladesh, covering private and public sector openings."),
  make("Career", "ক্যারিয়ার", "LinkedIn", "https://www.linkedin.com", "পেশাদার নেটওয়ার্ক ও ক্যারিয়ারের সুযোগ।", "Professional network for contacts, company research and job listings."),
  make("Media", "মিডিয়া", "Internet Archive", "https://archive.org", "ফ্রি বই, অডিও, ভিডিও ও ওয়েব আর্কাইভ।", "Free books, audio and video, plus the Wayback Machine archive of the web."),
  make("Media", "মিডিয়া", "Pexels", "https://www.pexels.com", "ফ্রি ছবি ও ভিডিও।", "Free stock photos and video clips, usable without attribution."),
];
