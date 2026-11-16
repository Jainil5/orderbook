import { redirect } from "next/navigation";

/**
 * The pipeline moved to the CRM, where it sits next to the customers an
 * enquiry becomes. This URL keeps working for old links and the Manager
 * overview card.
 */
export default function LeadsPage() {
  redirect("/customers/leads");
}
