export type ObNotificationKind = "info" | "success" | "warning" | "order";

export interface ObNotification {
  id: string;
  kind: ObNotificationKind;
  title: string;
  message?: string;
  createdAt: number;
  read: boolean;
  href?: string;
}

/** Newest-first, hard-capped; duplicates (re-pushed demo ticks) collapse onto
 *  the existing entry and move it to the front instead of piling up. */
export function pushNotification(
  state: ObNotification[],
  notification: ObNotification,
  limit = 30,
): ObNotification[] {
  const withoutDuplicate = state.filter((item) => item.id !== notification.id);
  return [notification, ...withoutDuplicate].slice(0, limit);
}
