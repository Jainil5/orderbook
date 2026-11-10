"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BellRing, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  pushNotification,
  type ObNotification,
  type ObNotificationKind,
} from "./reducer";

export interface NotifyInput {
  kind?: ObNotificationKind;
  title: string;
  message?: string;
  href?: string;
  /** Stable id lets re-emitted events collapse instead of piling up. */
  id?: string;
}

interface NotificationsApi {
  items: ObNotification[];
  toasts: ObNotification[];
  unreadCount: number;
  notify: (input: NotifyInput) => void;
  /** Backfills the bell feed (e.g. demo data) without firing toasts. */
  seed: (notifications: ObNotification[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsApi | null>(null);

const TOAST_MS = 6000;
const ITEMS_LIMIT = 30;
const TOASTS_LIMIT = 4;

const TOAST_ICONS: Record<ObNotificationKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  order: BellRing,
};

const TOAST_TONES: Record<ObNotificationKind, string> = {
  info: "text-[var(--ob-primary)]",
  success: "text-[var(--ob-success)]",
  warning: "text-[var(--ob-warning)]",
  order: "text-[var(--ob-accent)]",
};

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ObNotification[]>([]);
  const [toasts, setToasts] = useState<ObNotification[]>([]);
  const sequence = useRef(0);
  const reduceMotion = useReducedMotion();

  const notify = useCallback((input: NotifyInput) => {
    sequence.current += 1;
    const notification: ObNotification = {
      id: input.id ?? `ob-${Date.now()}-${sequence.current}`,
      kind: input.kind ?? "info",
      title: input.title,
      message: input.message,
      href: input.href,
      createdAt: Date.now(),
      read: false,
    };
    setItems((state) => pushNotification(state, notification, ITEMS_LIMIT));
    setToasts((state) => pushNotification(state, notification, TOASTS_LIMIT));
    setTimeout(() => {
      setToasts((state) => state.filter((item) => item.id !== notification.id));
    }, TOAST_MS);
  }, []);

  const seed = useCallback((incoming: ObNotification[]) => {
    setItems((state) => {
      const fresh = incoming.filter((n) => !state.some((s) => s.id === n.id));
      if (fresh.length === 0) return state;
      return [...state, ...fresh]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, ITEMS_LIMIT);
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setItems((state) =>
      state.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setItems((state) => state.map((item) => ({ ...item, read: true })));
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((state) => state.filter((item) => item.id !== id));
    setToasts((state) => state.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setToasts([]);
  }, []);

  const value = useMemo<NotificationsApi>(
    () => ({
      items,
      toasts,
      unreadCount: items.filter((item) => !item.read).length,
      notify,
      seed,
      markRead,
      markAllRead,
      dismiss,
      clearAll,
    }),
    [items, toasts, notify, seed, markRead, markAllRead, dismiss, clearAll],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-end gap-2 p-4 sm:inset-x-auto sm:right-4"
        role="region"
        aria-label="New notifications"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = TOAST_ICONS[toast.kind];
            return (
              <motion.div
                key={toast.id}
                layout={!reduceMotion}
                initial={
                  reduceMotion ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.96 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="ob-card pointer-events-auto flex w-full max-w-sm items-start gap-3 p-3"
              >
                <Icon size={18} className={`mt-0.5 shrink-0 ${TOAST_TONES[toast.kind]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.message ? (
                    <p className="mt-0.5 text-xs text-[var(--ob-text-muted)]">
                      {toast.message}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="ob-touch-target -m-2 shrink-0 rounded-full p-2 text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]"
                  aria-label={`Dismiss ${toast.title}`}
                >
                  ×
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsApi {
  const api = useContext(NotificationsContext);
  if (!api) {
    throw new Error("useNotifications must be used inside NotificationsProvider");
  }
  return api;
}
