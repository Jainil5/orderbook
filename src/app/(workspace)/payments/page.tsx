import { redirect } from "next/navigation";

/** Kept so older links, printed receipts and bookmarks still work. */
export default function Page() {
  redirect("/manager/finance/payments");
}
