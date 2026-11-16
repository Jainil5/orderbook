/**
 * Small form pieces used by the review screens' client forms — the same label
 * treatment as the CRM directory form, kept in this section folder because
 * `crm-ui.tsx` is shared and must not be edited per screen.
 */

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--ob-text-muted)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--ob-danger)]">*</span> : null}
      </span>
      <div className="mt-1">{children}</div>
      {hint ? (
        <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

export type FormStatus = { kind: "idle" | "ok" | "error"; message: string };

export const IDLE: FormStatus = { kind: "idle", message: "" };

/** Save feedback: `role="alert"` on a rejection, `role="status"` on success. */
export function FormFeedback({ status }: { status: FormStatus }) {
  if (status.kind === "idle") return null;
  return (
    <p
      role={status.kind === "error" ? "alert" : "status"}
      aria-live="polite"
      className={
        status.kind === "error"
          ? "text-sm text-[var(--ob-danger)]"
          : "text-sm text-[var(--crm-lab-strong)]"
      }
    >
      {status.message}
    </p>
  );
}

/** `<select>` with the app's input skin — the CRM forms all use the same one. */
export function Select({
  value,
  onChange,
  children,
  ...rest
}: {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="ob-input w-full"
      {...rest}
    >
      {children}
    </select>
  );
}
