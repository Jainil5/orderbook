const defaultCurrency = "INR";

export function formatMoney(
  amount: number,
  currencyCode = defaultCurrency,
  locale = "en-IN",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(value: string | Date, locale = "en-IN"): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function formatQuantity(qty: number, unit?: string | null): string {
  const n = Number.isInteger(qty) ? qty.toString() : qty.toFixed(2);
  return unit ? `${n} ${unit}` : n;
}
