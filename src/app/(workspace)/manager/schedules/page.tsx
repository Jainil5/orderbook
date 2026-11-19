import { redirect } from "next/navigation";

/**
 * The rota belongs with the people it roster, so it lives on the Staff screen
 * now. This URL keeps working for older links and saved shortcuts.
 */
export default function SchedulesPage() {
  redirect("/manager/staff?tab=schedules");
}
