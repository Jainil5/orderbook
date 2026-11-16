/**
 * One labelled input slot for the loyalty forms. `crm-ui.tsx` is shared and
 * off-limits to a section, so the pieces this screen needs live here.
 *
 * Wrapping the control in a `<label>` is the same pattern the CRM customer
 * form uses: every input gets a visible name, no placeholder-as-label.
 */
export function LoyaltyField({
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

export function LoyaltySelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      className="ob-input w-full"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Save feedback for a client form: `role="alert"` when it went wrong. */
export function LoyaltyFormStatus({
  status,
}: {
  status: { kind: "idle" | "ok" | "error"; message: string };
}) {
  if (status.kind === "idle") return null;
  return (
    <p
      role={status.kind === "error" ? "alert" : "status"}
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
