import { redirect } from "next/navigation";

/** Field visits open inside Meetings & Visits, on their own tab. */
export default function VisitsPage() {
  redirect("/manager/meetings?tab=visits");
}
