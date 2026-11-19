import { redirect } from "next/navigation";

/**
 * Meetings and field visits are one screen now (`/manager/meetings`). This URL
 * keeps working for older links and saved shortcuts.
 */
export default function AppointmentsPage() {
  redirect("/manager/meetings");
}
