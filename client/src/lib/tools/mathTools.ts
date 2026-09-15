/** Math & calculators wave: pure arithmetic over named fields. */
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";

function num(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ToolError("tool.error.number");
  return n;
}

function isPrime(n: number): boolean {
  if (n < 2 || !Number.isInteger(n)) return false;
  if (n % 2 === 0) return n === 2;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
}

function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new ToolError("tool.error.number");
  const table: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, glyph] of table) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

function fromRoman(text: string): number {
  const clean = text.trim().toUpperCase();
  if (!/^[MDCLXVI]+$/.test(clean)) throw new ToolError("tool.error.number");
  const values: Record<string, number> = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 };
  let total = 0;
  for (let i = 0; i < clean.length; i += 1) {
    // Validated charset above, so both lookups hit; `?? 0` is type-level only.
    const current = values[clean[i] ?? ""] ?? 0;
    const next = values[clean[i + 1] ?? ""] ?? 0;
    total += next > current ? -current : current;
  }
  return total;
}

const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberToEnglish(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999999999) throw new ToolError("tool.error.number");
  if (n < 20) return EN_ONES[n] ?? "";
  if (n < 100) return EN_TENS[Math.floor(n / 10)] + (n % 10 === 0 ? "" : `-${EN_ONES[n % 10]}`);
  if (n < 1000) return `${EN_ONES[Math.floor(n / 100)]} hundred${n % 100 === 0 ? "" : ` ${numberToEnglish(n % 100)}`}`;
  if (n < 1000000) return `${numberToEnglish(Math.floor(n / 1000))} thousand${n % 1000 === 0 ? "" : ` ${numberToEnglish(n % 1000)}`}`;
  return `${numberToEnglish(Math.floor(n / 1000000))} million${n % 1000000 === 0 ? "" : ` ${numberToEnglish(n % 1000000)}`}`;
}

const BN_UNDER_100 = [
  "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়", "দশ",
  "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "ঊনিশ", "বিশ",
  "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ", "ঊনত্রিশ", "ত্রিশ",
  "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ", "চল্লিশ",
  "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চুয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ", "পঞ্চাশ",
  "একান্ন", "বাহান্ন", "তিপ্পান্ন", "চুয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট", "ষাট",
  "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর", "সত্তর",
  "একাত্তর", "বাহাত্তর", "তিয়াত্তর", "চুয়াত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনআশি", "আশি",
  "একাশি", "বিরাশি", "তিরাশি", "চুরাশি", "পঁচাশি", "ছিয়াশি", "সাতাশি", "আটাশি", "ঊননব্বই", "নব্বই",
  "একানব্বই", "বিরানব্বই", "তিরানব্বই", "চুরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই",
];

function numberToBangla(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999999999) throw new ToolError("tool.error.number");
  if (n < 100) return BN_UNDER_100[n] ?? "";
  if (n < 1000) return `${BN_UNDER_100[Math.floor(n / 100)]} শত${n % 100 === 0 ? "" : ` ${numberToBangla(n % 100)}`}`;
  if (n < 100000) return `${numberToBangla(Math.floor(n / 1000))} হাজার${n % 1000 === 0 ? "" : ` ${numberToBangla(n % 1000)}`}`;
  if (n < 10000000) return `${numberToBangla(Math.floor(n / 100000))} লাখ${n % 100000 === 0 ? "" : ` ${numberToBangla(n % 100000)}`}`;
  return `${numberToBangla(Math.floor(n / 10000000))} কোটি${n % 10000000 === 0 ? "" : ` ${numberToBangla(n % 10000000)}`}`;
}

const GRADE_POINTS: Record<string, number> = { "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7, "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, F: 0 };

const UNIT_RATES: Record<string, number> = {
  "km-mi": 0.621371, "mi-km": 1.60934, "m-ft": 3.28084, "ft-m": 0.3048,
  "kg-lb": 2.20462, "lb-kg": 0.453592, "l-gal": 0.264172, "inch-cm": 2.54, "cm-inch": 0.393701,
};

export const runMathTools: ToolRunner = async (slug, input, _option, _t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);

  if (slug === "area-calculator") {
    const a = num(F("a", "10"));
    const b = num(F("b", "5"));
    const mode = F("mode", "rect");
    if (mode === "circle") return { text: JSON.stringify({ area: Number((Math.PI * a * a).toFixed(4)), circumference: Number((2 * Math.PI * a).toFixed(4)) }, null, 2) };
    if (mode === "triangle") return { text: JSON.stringify({ area: Number(((a * b) / 2).toFixed(4)) }, null, 2) };
    return { text: JSON.stringify({ area: Number((a * b).toFixed(4)), perimeter: Number((2 * (a + b)).toFixed(4)) }, null, 2) };
  }
  if (slug === "rule-of-three") {
    const a = num(F("a", "2"));
    const b = num(F("b", "5"));
    const c = num(F("c", "8"));
    if (a === 0) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ [`${a} : ${b} = ${c} : x`]: Number(((b * c) / a).toFixed(6)) }, null, 2) };
  }
  if (slug === "trigonometry-calculator") {
    const angle = num(F("angle", "30"));
    const radians = F("unit", "deg") === "rad" ? angle : (angle * Math.PI) / 180;
    const mode = F("mode", "sin");
    const value = mode === "cos" ? Math.cos(radians) : mode === "tan" ? Math.tan(radians) : Math.sin(radians);
    return { text: JSON.stringify({ [`${mode}(${angle}${F("unit", "deg") === "rad" ? "rad" : "°"})`]: Number(value.toFixed(6)) }, null, 2) };
  }
  if (slug === "radians-degrees-converter") {
    const value = num(F("value", "180"));
    const result = F("mode", "todeg") === "torad" ? (value * Math.PI) / 180 : (value * 180) / Math.PI;
    return { text: JSON.stringify({ result: Number(result.toFixed(6)) }, null, 2) };
  }
  if (slug === "age-calculator") {
    const dob = new Date(`${F("dob", "2000-01-01")}T00:00:00`);
    if (Number.isNaN(dob.getTime())) throw new ToolError("tool.error.generic");
    const now = new Date();
    if (dob > now) throw new ToolError("tool.error.generic");
    let years = now.getFullYear() - dob.getFullYear();
    let months = now.getMonth() - dob.getMonth();
    let days = now.getDate() - dob.getDate();
    if (days < 0) {
      months -= 1;
      days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    const totalDays = Math.floor((now.getTime() - dob.getTime()) / 86400000);
    return { text: JSON.stringify({ years, months, days, totalDays, totalMonths: years * 12 + months }, null, 2) };
  }
  if (slug === "date-difference-calculator") {
    const from = new Date(`${F("from", "2026-01-01")}T00:00:00`);
    const to = new Date(`${F("to", "2026-12-31")}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ToolError("tool.error.generic");
    const days = Math.round((to.getTime() - from.getTime()) / 86400000);
    return { text: JSON.stringify({ days, weeks: Number((days / 7).toFixed(2)), months: Number((days / 30.44).toFixed(2)) }, null, 2) };
  }
  if (slug === "tip-calculator") {
    const bill = num(F("bill", "500"));
    const percent = num(F("percent", "10"));
    const people = Math.max(1, Math.floor(num(F("people", "2"))));
    const tip = (bill * percent) / 100;
    return { text: JSON.stringify({ tip: Number(tip.toFixed(2)), total: Number((bill + tip).toFixed(2)), perPerson: Number(((bill + tip) / people).toFixed(2)) }, null, 2) };
  }
  if (slug === "ratio-calculator") {
    const a = num(F("a", "3"));
    const b = num(F("b", "4"));
    const c = num(F("c", "6"));
    if (a === 0) throw new ToolError("tool.error.number");
    const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
    const divisor = gcd(Math.abs(Math.round(a)), Math.abs(Math.round(b))) || 1;
    return { text: JSON.stringify({ [`${a}:${b} = ${c}:x`]: Number(((b * c) / a).toFixed(4)), simplified: `${Math.round(a) / divisor}:${Math.round(b) / divisor}` }, null, 2) };
  }
  if (slug === "unit-converter") {
    const value = num(F("value", "1"));
    const unit = F("unit", "km-mi");
    const rate = UNIT_RATES[unit];
    if (!rate) throw new ToolError("tool.error.generic");
    return { text: JSON.stringify({ [`${value} ${unit.split("-")[0]}`]: Number((value * rate).toFixed(6)), [`in ${unit.split("-")[1]}`]: true }, null, 2) };
  }
  if (slug === "temperature-converter") {
    const value = num(F("value", "100"));
    const mode = F("mode", "c-f");
    let result = value;
    if (mode === "c-f") result = (value * 9) / 5 + 32;
    else if (mode === "f-c") result = ((value - 32) * 5) / 9;
    else if (mode === "c-k") result = value + 273.15;
    else result = value - 273.15;
    return { text: JSON.stringify({ result: Number(result.toFixed(2)) }, null, 2) };
  }
  if (slug === "fibonacci-generator") {
    const count = Math.min(Math.max(Math.floor(num(F("count", "10"))), 1), 200);
    const seq = [0, 1];
    while (seq.length < count) seq.push((seq[seq.length - 1] ?? 0) + (seq[seq.length - 2] ?? 0));
    return { text: seq.slice(0, count).join(", ") };
  }
  if (slug === "prime-checker-generator") {
    const n = num(F("n", "97"));
    if (F("mode", "check") === "list") {
      const limit = Math.min(Math.max(Math.floor(n), 2), 100000);
      const sieve = new Array(limit + 1).fill(true);
      sieve[0] = false;
      if (limit >= 1) sieve[1] = false;
      for (let i = 2; i * i <= limit; i += 1) {
        if (sieve[i]) for (let j = i * i; j <= limit; j += i) sieve[j] = false;
      }
      const primes: number[] = [];
      for (let i = 2; i <= limit; i += 1) if (sieve[i]) primes.push(i);
      return { text: JSON.stringify({ count: primes.length, primes: primes.slice(0, 5000) }, null, 2) };
    }
    return { text: JSON.stringify({ number: n, prime: isPrime(n) }, null, 2) };
  }
  if (slug === "number-base-converter") {
    const value = F("value", "255").trim();
    const from = Math.min(Math.max(parseInt(F("from", "10"), 10) || 10, 2), 36);
    const to = Math.min(Math.max(parseInt(F("to", "10"), 10) || 10, 2), 36);
    const decimal = parseInt(value, from);
    if (!Number.isFinite(decimal)) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ decimal, [`base${to}`]: decimal.toString(to).toUpperCase() }, null, 2) };
  }
  if (slug === "binary-hex-octal-converter") {
    const value = F("value", "1010").trim();
    const mode = F("mode", "bin");
    const base = mode === "bin" ? 2 : mode === "hex" ? 16 : mode === "oct" ? 8 : 10;
    const decimal = parseInt(value, base);
    if (!Number.isFinite(decimal)) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ binary: decimal.toString(2), octal: decimal.toString(8), decimal, hex: decimal.toString(16).toUpperCase() }, null, 2) };
  }
  if (slug === "roman-numeral-converter") {
    const value = F("value", "2026").trim();
    if (F("mode", "to-roman") === "from-roman") return { text: JSON.stringify({ roman: value.toUpperCase(), number: fromRoman(value) }, null, 2) };
    return { text: JSON.stringify({ number: num(value), roman: toRoman(num(value)) }, null, 2) };
  }
  if (slug === "average-min-max") {
    const numbers = (F("text", input).match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
    if (numbers.length === 0) throw new ToolError("tool.error.number");
    const sum = numbers.reduce((a, b) => a + b, 0);
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    // Non-empty by the throw above: both branches read live entries.
    const median = sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
    return { text: JSON.stringify({ count: numbers.length, sum: Number(sum.toFixed(4)), average: Number((sum / numbers.length).toFixed(4)), median: Number(median.toFixed(4)), min: sorted[0] ?? 0, max: sorted[sorted.length - 1] ?? 0 }, null, 2) };
  }
  if (slug === "number-list-generator") {
    const from = num(F("from", "1"));
    const to = num(F("to", "10"));
    const step = num(F("step", "1"));
    if (step === 0) throw new ToolError("tool.error.number");
    const out: number[] = [];
    if (step > 0) for (let i = from; i <= to && out.length < 10000; i += step) out.push(Number(i.toFixed(6)));
    else for (let i = from; i >= to && out.length < 10000; i += step) out.push(Number(i.toFixed(6)));
    return { text: out.join(", ") };
  }
  if (slug === "number-to-words") {
    const n = num(F("n", "2026"));
    return { text: F("mode", "en") === "bn" ? numberToBangla(n) : numberToEnglish(n) };
  }
  if (slug === "percentage-fraction-decimal") {
    const value = F("value", "3/4").trim();
    let decimal: number | null = null;
    if (value.endsWith("%")) {
      const n = Number(value.slice(0, -1));
      if (Number.isFinite(n)) decimal = n / 100;
    } else if (value.includes("/")) {
      const [a = NaN, b = NaN] = value.split("/").map(Number);
      if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) decimal = a / b;
    } else {
      const n = Number(value);
      if (Number.isFinite(n)) decimal = n;
    }
    if (decimal === null) throw new ToolError("tool.error.number");
    const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
    const rounded = Math.round(decimal * 1000000);
    const divisor = gcd(Math.abs(rounded), 1000000) || 1;
    return { text: JSON.stringify({ decimal: Number(decimal.toFixed(6)), percent: `${Number((decimal * 100).toFixed(4))}%`, fraction: `${rounded / divisor}/${1000000 / divisor}` }, null, 2) };
  }
  if (slug === "gpa-calculator") {
    const lines = F("text", input).split("\n").map((l) => l.trim()).filter(Boolean);
    let points = 0;
    let credits = 0;
    for (const line of lines) {
      const [grade, credit] = line.split(/[\s,]+/);
      const gp = GRADE_POINTS[(grade ?? "").toUpperCase()];
      const cr = Number(credit);
      if (gp === undefined || !Number.isFinite(cr)) throw new ToolError("tool.error.generic");
      points += gp * cr;
      credits += cr;
    }
    if (credits === 0) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ gpa: Number((points / credits).toFixed(2)), credits }, null, 2) };
  }
  if (slug === "discount-calculator") {
    const price = num(F("price", "1000"));
    const percent = num(F("percent", "15"));
    const off = (price * percent) / 100;
    return { text: JSON.stringify({ discount: Number(off.toFixed(2)), payable: Number((price - off).toFixed(2)) }, null, 2) };
  }
  if (slug === "loan-emi-calculator") {
    const principal = num(F("principal", "500000"));
    const yearly = num(F("rate", "9"));
    const months = Math.min(Math.max(Math.floor(num(F("months", "60"))), 1), 600);
    const monthly = yearly / 1200;
    const emi = monthly === 0 ? principal / months : (principal * monthly * Math.pow(1 + monthly, months)) / (Math.pow(1 + monthly, months) - 1);
    const total = emi * months;
    const schedule: string[][] = [];
    let balance = principal;
    for (let m = 1; m <= Math.min(months, 360); m += 1) {
      const interest = balance * monthly;
      const capital = Math.min(emi - interest, balance);
      balance = Math.max(0, balance - capital);
      if (m <= 12 || m === months || m % 12 === 0) {
        schedule.push([String(m), emi.toFixed(2), capital.toFixed(2), interest.toFixed(2), balance.toFixed(2)]);
      }
    }
    return {
      text: JSON.stringify({ emi: Number(emi.toFixed(2)), totalPayable: Number(total.toFixed(2)), totalInterest: Number((total - principal).toFixed(2)) }, null, 2),
      table: { head: ["Month", "EMI", "Principal", "Interest", "Balance"], rows: schedule },
    };
  }
  if (slug === "bangla-calendar-converter") {
    // UTC throughout so the day count never shifts with the viewer's timezone.
    const date = new Date(`${F("date", "2026-04-14")}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new ToolError("tool.error.generic");
    const year = date.getUTCFullYear();
    const newYear = Date.UTC(year, 3, 14);
    const target = date.getTime() < newYear ? Date.UTC(year - 1, 3, 14) : newYear;
    // After Pohela Boishakh the Bangla year trails by 593 (Apr 2026 → 1433).
    const banglaYear = year - (date.getTime() < newYear ? 594 : 593);
    const monthLengths = [31, 31, 32, 32, 31, 31, 30, 29, 30, 29, 30, 29];
    const monthNames = ["বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়", "শ্রাবণ", "ভাদ্র", "আশ্বিন", "কার্তিক", "অগ্রহায়ণ", "পৌষ", "মাঘ", "ফাল্গুন", "চৈত্র"];
    let remaining = Math.round((date.getTime() - target) / 86400000);
    let month = 0;
    while (month < 11 && remaining >= (monthLengths[month] ?? 0)) {
      remaining -= monthLengths[month] ?? 0;
      month += 1;
    }
    const day = remaining + 1;
    if (F("mode", "to-bangla") === "pohela") {
      const nextPohela = date.getTime() < newYear ? newYear : Date.UTC(year + 1, 3, 14);
      const daysLeft = Math.round((nextPohela - date.getTime()) / 86400000);
      return { text: JSON.stringify({ daysToPohelaBoishakh: daysLeft }, null, 2) };
    }
    return { text: JSON.stringify({ bangla: `${day} ${monthNames[month]}, ${banglaYear}`, day, month: monthNames[month], year: banglaYear }, null, 2) };
  }
  return null;
};
