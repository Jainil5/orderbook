"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useNotifications } from "./notifications-context";
import { cn } from "@/lib/cn";

const KIND_DOT: Record<string, string> = {
  info: "bg-[var(--ob-primary)]",
  success: "bg-[var(--ob-success)]",
  warning: "bg-[var(--ob-warning)]",
  order: "bg-[var(--ob-accent)]",
};

function relativeTime(timestamp: number, now: number): string {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Collapsed state previews the newest notifications as a pile; expanding
 *  fans them into a full list (the iOS notifications-stack pattern). */
export function NotificationStack() {
  const { items, unreadCount, markRead, markAllRead, dismiss, clearAll } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const preview = items.slice(0, 3);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        className={cn(
          "ob-press ob-touch-target relative inline-flex items-center justify-center rounded-full border",
          open
            ? "border-[var(--ob-primary)] bg-[var(--ob-surface-muted)]"
            : "border-[var(--ob-border)] bg-[var(--ob-surface)] hover:border-[var(--ob-border-strong)]",
        )}
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--ob-danger)] px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {/* Collapsed pile preview — decorative; the real list is the panel. */}
      {!open && preview.length > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-1.5 right-1 hidden h-2.5 w-8 rounded-sm border border-[var(--ob-border)] bg-[var(--ob-surface)] shadow-[var(--ob-shadow-sm)] sm:block"
          style={{ transform: "rotate(6deg)" }}
        />
      ) : null}

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={
              reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8, scale: 0.97 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="ob-card absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-[var(--ob-border)] px-3 py-2">
              <p className="text-sm font-semibold">Notifications</p>
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={markAllRead}
                  className="ob-press rounded-md px-2 py-1 font-medium text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]"
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="ob-press rounded-md px-2 py-1 font-medium text-[var(--ob-text-muted)] hover:text-[var(--ob-danger)]"
                >
                  Clear
                </button>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--ob-text-muted)]">
                Nothing here yet.
              </p>
            ) : (
              <ul className="ob-scroll-x max-h-80 overflow-y-auto">
                {items.map((item, index) => (
                  <motion.li
                    key={item.id}
                    initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index, 6) * 0.02 }}
                    className={cn(
                      "flex items-start gap-2.5 border-b border-[var(--ob-border)] px-3 py-2.5 text-sm last:border-b-0",
                      !item.read && "bg-[var(--ob-surface-muted)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        KIND_DOT[item.kind],
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.title}</p>
                      {item.message ? (
                        <p className="mt-0.5 text-xs text-[var(--ob-text-muted)]">
                          {item.message}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-[var(--ob-text-muted)]">
                        {relativeTime(item.createdAt, now)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!item.read ? (
                        <button
                          type="button"
                          onClick={() => markRead(item.id)}
                          aria-label={`Mark "${item.title}" as read`}
                          className="ob-press rounded-md p-1.5 text-[var(--ob-text-muted)] hover:text-[var(--ob-success)]"
                        >
                          <Check size={14} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => dismiss(item.id)}
                        aria-label={`Dismiss "${item.title}"`}
                        className="ob-press rounded-md p-1.5 text-[var(--ob-text-muted)] hover:text-[var(--ob-danger)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
