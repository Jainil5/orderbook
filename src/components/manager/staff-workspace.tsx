"use client";

import { useState } from "react";
import { SchedulesManager } from "@/components/manager/schedules-manager";
import { StaffManager } from "@/components/manager/staff-manager";
import { Tabs } from "@/components/ui/tabs";
import type { StaffMember } from "@/types/manager";
import type { Shift } from "@/types/operations";

type Tab = "team" | "schedules";

/**
 * Who works here, and when. A rota is written against a person, so the two
 * halves live on one screen: editing someone's role or availability and
 * rostering their week are the same conversation.
 */
export function StaffWorkspace({
  initialTab = "team",
  staff,
  shifts,
  canEdit,
  canAdd,
}: {
  initialTab?: Tab;
  staff: StaffMember[];
  shifts: Shift[];
  canEdit: boolean;
  canAdd: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const active = staff.filter((member) => member.status === "active");
  const options = active.map((member) => ({ id: member.id, name: member.name }));

  return (
    <div className="space-y-4">
      <Tabs
        label="Staff sections"
        value={tab}
        onChange={setTab}
        options={[
          { id: "team", label: `Team (${active.length})` },
          { id: "schedules", label: `Schedules (${shifts.length})` },
        ]}
      />
      {tab === "team" ? (
        <StaffManager staff={staff} canEdit={canEdit} canAdd={canAdd} />
      ) : (
        <SchedulesManager
          shifts={shifts}
          staff={options}
          canEdit={canEdit}
          canAdd={canAdd}
        />
      )}
    </div>
  );
}
