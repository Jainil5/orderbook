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

export type OdometerFormat =
  | { kind: "number"; locale?: string }
  | { kind: "currency"; currency: string; locale?: string }
  | { kind: "percent"; locale?: string };

export function formatOdometer(
  value: number,
  format: OdometerFormat,
  decimals = 0,
): string {
  if (!Number.isFinite(value)) return "–";
  switch (format.kind) {
    case "currency":
      return new Intl.NumberFormat(format.locale ?? "en-IN", {
        style: "currency",
        currency: format.currency,
        maximumFractionDigits: decimals,
        minimumFractionDigits: 0,
      }).format(value);
    case "percent":
      return new Intl.NumberFormat(format.locale ?? "en-IN", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
    case "number":
      return new Intl.NumberFormat(format.locale ?? "en-IN", {
        maximumFractionDigits: decimals,
      }).format(value);
  }
}
