import type { CustomerReview } from "@/types/crm";
import type { Customer, Product } from "@/types/database";

/**
 * The voices on the site are the brand's own review inbox, not copy written for
 * the page. Only praise is published, and each one stays tied to the customer,
 * the date and the dish it names so a chip can link it back to the board.
 */
export interface Voice {
  id: string;
  name: string;
  when: string;
  quote: string;
  /** Product the quote names, so the card can point at it on the menu. */
  productId: string | null;
}

const ATTRIBUTION_BY_SOURCE: Record<string, string> = {
  "Google Business Profile": "Google review",
  "In-store card": "In-store card",
  "Walk-in feedback": "Walk-in feedback",
};

function initials(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest[rest.length - 1];
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

function monthYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
}

export function buildVoices(params: {
  reviews: CustomerReview[];
  customers: Customer[];
  products: Product[];
}): Voice[] {
  const customersById = new Map(params.customers.map((c) => [c.id, c] as const));
  return params.reviews
    .filter((review) => review.sentiment === "positive" && review.rating >= 4)
    .sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())
    .map((review) => {
      const customer = review.customer_id
        ? customersById.get(review.customer_id)
        : undefined;
      const text = review.text.trim();
      const lower = text.toLowerCase();
      return {
        id: review.id,
        name: customer ? initials(customer.name) : (ATTRIBUTION_BY_SOURCE[review.source] ?? review.source),
        when: `${monthYear(review.reviewed_at)} · ${review.rating}★`,
        quote: text,
        productId:
          params.products.find((product) => lower.includes(product.name.toLowerCase()))?.id ??
          null,
      };
    });
}
