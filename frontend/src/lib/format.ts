import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return format(parseISO(value), "d MMM yyyy");
}

export function formatDateTime(value: string | number) {
  return format(typeof value === "number" ? new Date(value) : parseISO(value), "d MMM yyyy, HH:mm");
}

export function formatRelative(value: string) {
  return `${formatDistanceToNowStrict(parseISO(value))} ago`;
}

const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });
const integerFormat = new Intl.NumberFormat("en");

export function formatNumber(value: number) {
  return numberFormat.format(value);
}

export function formatCount(value: number) {
  return integerFormat.format(value);
}

export function formatValue(value: number, unit: string) {
  return `${formatNumber(value)} ${unit}`;
}

export function humanize(value: string) {
  const s = value.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
