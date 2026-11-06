import { redirect } from "next/navigation";

export default function OffersRedirectPage() {
  redirect("/products?tab=offers");
}
