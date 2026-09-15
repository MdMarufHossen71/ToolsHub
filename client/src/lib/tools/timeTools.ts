/** Date & time wave: calendar math over named fields. Live ticking tools live in Wave 5. */
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new ToolError("tool.error.generic");
  return date;
}

const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const toBnDigits = (text: string) => text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);

export const runTimeTools: ToolRunner = async (slug, _input, _option, _t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);

  if (slug === "add-subtract-date") {
    // UTC throughout: local midnights shift the ISO slice near timezones.
    const date = new Date(`${F("date", "2026-01-01")}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new ToolError("tool.error.generic");
    const days = Number(F("days", "30"));
    if (!Number.isFinite(days)) throw new ToolError("tool.error.number");
    const result = new Date(date.getTime() + Math.trunc(days) * 86400000);
    return { text: JSON.stringify({ result: result.toISOString().slice(0, 10), weekday: result.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) }, null, 2) };
  }
  if (slug === "unix-timestamp-converter") {
    const mode = F("mode", "to-date");
    if (mode === "now") {
      const now = Math.floor(Date.now() / 1000);
      return { text: JSON.stringify({ timestamp: now, iso: new Date(now * 1000).toISOString() }, null, 2) };
    }
    if (mode === "to-stamp") {
      const date = new Date(F("value", ""));
      if (Number.isNaN(date.getTime())) throw new ToolError("tool.error.generic");
      return { text: JSON.stringify({ timestamp: Math.floor(date.getTime() / 1000), iso: date.toISOString() }, null, 2) };
    }
    const stamp = Number(F("value", "1767225600"));
    if (!Number.isFinite(stamp)) throw new ToolError("tool.error.number");
    const date = new Date(stamp * 1000);
    return { text: JSON.stringify({ iso: date.toISOString(), utc: date.toUTCString(), local: date.toString() }, null, 2) };
  }
  if (slug === "date-formatter") {
    // UTC throughout: a bare date has no timezone, so formatting must not
    // borrow the viewer's offset and shift the day.
    const date = new Date(`${F("date", "2026-04-14")}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new ToolError("tool.error.generic");
    const mode = F("mode", "long-en");
    let formatted = date.toISOString().slice(0, 10);
    if (mode === "long-en") formatted = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    else if (mode === "long-bn") formatted = toBnDigits(`${date.getUTCDate()} ${BN_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`);
    else if (mode === "short") formatted = date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
    return { text: JSON.stringify({ formatted }, null, 2) };
  }
  if (slug === "julian-date") {
    const date = new Date(`${F("date", "2026-01-01")}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new ToolError("tool.error.generic");
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
    const jdn = Math.floor(date.getTime() / 86400000) + 2440588;
    return { text: JSON.stringify({ dayOfYear, julianDayNumber: jdn }, null, 2) };
  }
  if (slug === "days-between-dates") {
    const from = parseDate(F("from", "2026-01-01"));
    const to = parseDate(F("to", "2026-12-31"));
    const days = Math.round((to.getTime() - from.getTime()) / 86400000);
    return { text: JSON.stringify({ days, weeks: Number((days / 7).toFixed(2)), weekdaysOnly: "see working-days-calculator" }, null, 2) };
  }
  if (slug === "working-days-calculator") {
    const from = parseDate(F("from", "2026-01-01"));
    const to = parseDate(F("to", "2026-01-31"));
    const weekend = F("weekend", "fri-sat") === "sat-sun" ? [0, 6] : [5, 6];
    let working = 0;
    let total = 0;
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
      total += 1;
      if (!weekend.includes(d.getDay())) working += 1;
    }
    return { text: JSON.stringify({ totalDays: total, workingDays: working, weekendDays: total - working }, null, 2) };
  }
  if (slug === "timezone-converter") {
    const time = F("time", "12:00");
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) throw new ToolError("tool.error.generic");
    const date = parseDate(F("date", "2026-01-01"));
    const zone = F("zone", "America/New_York");
    const base = new Date(date);
    base.setHours(Number(match[1]), Number(match[2]), 0, 0);
    let converted: string;
    try {
      converted = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", year: "numeric", timeZone: zone }).format(base);
    } catch {
      throw new ToolError("tool.error.generic");
    }
    return { text: JSON.stringify({ [`${time} local in ${zone}`]: converted }, null, 2) };
  }
  return null;
};
