"use client";

import { useState } from "react";
import { AppointmentsManager } from "@/components/manager/appointments-manager";
import { VisitsManager } from "@/components/manager/visits-manager";
import { Tabs } from "@/components/ui/tabs";
import type { Appointment, FieldVisit } from "@/types/operations";

type Tab = "meetings" | "visits";
type Option = { id: string; name: string };

/**
 * One screen for the two ways a team commits time to a customer: a meeting
 * somebody books in, and a visit the team makes on site. They share the same
 * people and the same customers, so they share a tab bar instead of two tabs
 * in the Manager nav.
 */
export function MeetingsWorkspace({
  initialTab = "meetings",
  appointments,
  visits,
  customers,
  staff,
  services,
  canEdit,
  canAdd,
}: {
  initialTab?: Tab;
  appointments: Appointment[];
  visits: FieldVisit[];
  customers: Option[];
  staff: Option[];
  services: Option[];
  canEdit: boolean;
  canAdd: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const openVisits = visits.filter((v) => v.status !== "completed").length;

  return (
    <div className="space-y-4">
      <Tabs
        label="Meetings and visits"
        value={tab}
        onChange={setTab}
        options={[
          { id: "meetings", label: `Meetings (${appointments.length})` },
          { id: "visits", label: `Field visits (${openVisits})` },
        ]}
      />
      {tab === "meetings" ? (
        <AppointmentsManager
          appointments={appointments}
          customers={customers}
          staff={staff}
          services={services}
          canEdit={canEdit}
          canAdd={canAdd}
        />
      ) : (
        <VisitsManager
          visits={visits}
          customers={customers}
          staff={staff}
          canEdit={canEdit}
          canAdd={canAdd}
        />
      )}
    </div>
  );
}
