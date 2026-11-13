const DAY = 86_400_000;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const integer = new Intl.NumberFormat("en-US");

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Axis label: "$30" for whole dollars, "$12.50" otherwise. */
export function formatAxisCents(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : formatCents(cents);
}

export function formatInteger(n: number): string {
  return integer.format(n);
}

const toMs = (value: string | number) => (typeof value === "number" ? value : Date.parse(value));

const fullDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Oct 15, 2026" */
export function formatDate(value: string | number): string {
  return fullDate.format(toMs(value));
}

/** "Oct 2026" */
export function formatMonthYear(value: string | number): string {
  return monthYear.format(toMs(value));
}

/** "Oct 15" */
export function formatDayMonth(value: string | number): string {
  return dayMonth.format(toMs(value));
}

/** "2026" */
export function formatYear(value: string | number): string {
  return String(new Date(toMs(value)).getUTCFullYear());
}

/** "today", "3 days ago", "2 weeks ago", "5 months ago", "2 years ago" */
export function formatRelative(value: string | number, now = Date.now()): string {
  const days = Math.floor((now - toMs(value)) / DAY);
  if (days < 1) return "today";
  if (days < 14) return days === 1 ? "yesterday" : `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
