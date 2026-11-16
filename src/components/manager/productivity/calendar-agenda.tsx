"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  CALENDAR_KIND_LABELS,
  CALENDAR_VIEWS,
  CALENDAR_WEEKDAYS,
  buildAgenda,
  formatDayLabel,
  shiftAnchor,
  type CalendarEntry,
  type CalendarView,
} from "@/lib/manager/calendar";

const VIEW_LABELS: Record<CalendarView, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

const MONTH_CELL_LIMIT = 3;

function timeLabel(instant: string): string {
  return new Date(instant).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function entrySubtitle(entry: CalendarEntry, staffNames: Record<string, string>): string {
  return [
    entry.staffIds.map((id) => staffNames[id] ?? "Unknown").join(", "),
    entry.location ?? "",
    entry.detail ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function EntryRow({
  entry,
  staffNames,
  conflict,
}: {
  entry: CalendarEntry;
  staffNames: Record<string, string>;
  conflict: boolean;
}) {
  const subtitle = entrySubtitle(entry, staffNames);
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        conflict ? "border-[#be123c]" : "border-[var(--ob-border)]"
      }`}
    >
      <p className="text-sm font-medium">
        {timeLabel(entry.startsAt)}
        {entry.endsAt ? ` – ${timeLabel(entry.endsAt)}` : ""} · {entry.title}
        {conflict ? (
          <span className="ml-2 rounded bg-[#fbeaec] px-1.5 py-0.5 text-xs text-[#be123c]">
            Conflict
          </span>
        ) : null}
      </p>
      <p className="text-xs text-[var(--ob-text-muted)]">
        {CALENDAR_KIND_LABELS[entry.kind]}
        {subtitle ? ` · ${subtitle}` : ""}
      </p>
    </div>
  );
}

export function CalendarAgenda({
  entries,
  staffNames,
  today,
}: {
  entries: CalendarEntry[];
  staffNames: Record<string, string>;
  today: string;
}) {
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(today);
  const agenda = buildAgenda(entries, { view, anchor, staffNames });
  const conflictIds = new Set(agenda.conflicts.flatMap((c) => c.entryIds));

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing on the agenda yet"
        description="Appointments, tasks with due dates, field visits, shifts and synced calendar rows all land here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={view}
            onChange={(next) => {
              setView(next);
              setAnchor(today);
            }}
            label="Agenda view"
            options={CALENDAR_VIEWS.map((id) => ({ id, label: VIEW_LABELS[id] }))}
          />
          <nav aria-label="Agenda dates" className="flex items-center gap-1">
            <button
              type="button"
              className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
              onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
              onClick={() => setAnchor(today)}
            >
              Today
            </button>
            <button
              type="button"
              className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
              onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
            >
              Next
            </button>
          </nav>
        </div>
        <p className="text-sm font-semibold">{agenda.title}</p>
      </div>

      {agenda.conflicts.length === 0 ? (
        <Card className="p-4">
          <h2 className="font-semibold">No conflicts</h2>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Nothing is double-booked and every booking sits inside the staff
            member&apos;s shift.
          </p>
        </Card>
      ) : (
        <Card className="border-[#be123c]! p-4">
          <h2 className="font-semibold">
            Conflicts
            <span className="ml-2 rounded bg-[#fbeaec] px-1.5 py-0.5 text-xs text-[#be123c]">
              {agenda.conflicts.length}
            </span>
          </h2>
          <ul className="mt-2 space-y-1">
            {agenda.conflicts.map((conflict) => (
              <li
                key={`${conflict.reason}:${conflict.entryIds.join("+")}`}
                className="text-sm text-[var(--ob-text-secondary)]"
              >
                {conflict.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {view === "month" ? (
        <div>
          <div className="mb-1 grid grid-cols-7 gap-2">
            {CALENDAR_WEEKDAYS.map((label) => (
              <p
                key={label}
                className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]"
              >
                {label}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {agenda.days.map((day) => {
              // Days carried in from the neighbouring month read as background.
              const outsideMonth = day.date.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <div
                  key={day.date}
                  className={`min-h-28 rounded-md border border-[var(--ob-border)] p-2 ${
                    day.date === today
                      ? "bg-[var(--ob-surface-muted)]"
                      : "bg-[var(--ob-surface)]"
                  } ${outsideMonth ? "opacity-60" : ""}`}
                >
                  <p className="text-xs font-medium text-[var(--ob-text-secondary)]">
                    {Number(day.date.slice(8, 10))}
                  </p>
                  <div className="mt-1 space-y-1">
                    {day.entries.slice(0, MONTH_CELL_LIMIT).map((entry) => (
                      <p
                        key={entry.id}
                        className={`truncate text-xs ${
                          conflictIds.has(entry.id)
                            ? "text-[#be123c]"
                            : "text-[var(--ob-text-secondary)]"
                        }`}
                        title={`${timeLabel(entry.startsAt)} ${CALENDAR_KIND_LABELS[entry.kind]} — ${entry.title}`}
                      >
                        {timeLabel(entry.startsAt)} {entry.title}
                      </p>
                    ))}
                    {day.entries.length > MONTH_CELL_LIMIT ? (
                      <p className="text-xs text-[var(--ob-text-muted)]">
                        +{day.entries.length - MONTH_CELL_LIMIT} more
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {agenda.days.map((day) => (
            <section key={day.date}>
              <h2
                className={`mb-2 text-sm font-semibold ${
                  day.date === today ? "text-[var(--ob-primary)]" : ""
                }`}
              >
                {formatDayLabel(day.date)}
                {day.date === today ? " · Today" : ""}
              </h2>
              {day.entries.length === 0 ? (
                <p className="text-sm text-[var(--ob-text-muted)]">Nothing scheduled.</p>
              ) : (
                <div className="space-y-2">
                  {day.entries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      staffNames={staffNames}
                      conflict={conflictIds.has(entry.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
