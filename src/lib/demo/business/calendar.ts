import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { ExternalEvent, PendingSyncAction } from "@/types/integrations";
import { isoAt, isoInstant } from "./dates";

/**
 * External calendar/email rows shown in the unified agenda.
 *
 * With Google OAuth configured these come from the sync adapter
 * (`lib/integrations/sync.ts`) and overwrite these rows by `externalId`.
 * The seeded rows below stand in for "already synced" data so the unified
 * calendar and its conflict detection are demoable without credentials.
 */

const CAFE_EVENTS: ExternalEvent[] = [
  {
    id: "bc-ext-1",
    brand_id: "demo-brewery-cafe",
    source: "google_calendar",
    externalId: "seed-bc-ext-1",
    kind: "event",
    title: "Roastery pickup — Sector 18",
    startsAt: isoAt(11, 0, 1),
    endsAt: isoAt(12, 0, 1),
    location: "Okhla Phase 2",
    accountLabel: "owner@brewery-cafe.demo",
    customerId: null,
    attendeeCount: 1,
    snippet: null,
    needsFollowUp: false,
    syncedAt: isoInstant(-1),
  },
  {
    id: "bc-ext-2",
    brand_id: "demo-brewery-cafe",
    source: "gmail",
    externalId: "seed-bc-ext-2",
    kind: "email",
    title: "Re: Table for six on Friday",
    startsAt: isoAt(16, 0, 0),
    endsAt: isoAt(17, 0, 0),
    location: null,
    accountLabel: "hello@brewery-cafe.demo",
    customerId: "c2",
    attendeeCount: null,
    snippet: "Could you hold the corner table for six at 4pm Friday?",
    needsFollowUp: true,
    syncedAt: isoInstant(0),
  },
];

const FURNITURE_EVENTS: ExternalEvent[] = [
  {
    id: "cf-ext-1",
    brand_id: "demo-cubig-furniture",
    source: "google_calendar",
    externalId: "seed-cf-ext-1",
    kind: "event",
    title: "Site measurement — Kulkarni dining",
    startsAt: isoAt(16, 0, 1),
    endsAt: isoAt(17, 30, 1),
    location: "Bandra West",
    accountLabel: "works@cubeeg-furniture.demo",
    customerId: "fc2",
    attendeeCount: 2,
    snippet: null,
    needsFollowUp: false,
    syncedAt: isoInstant(-1),
  },
  {
    id: "cf-ext-2",
    brand_id: "demo-cubig-furniture",
    source: "gmail",
    externalId: "seed-cf-ext-2",
    kind: "email",
    title: "Ply supplier — revised lead time",
    startsAt: isoAt(10, 30, 0),
    endsAt: isoAt(11, 0, 0),
    location: null,
    accountLabel: "works@cubeeg-furniture.demo",
    customerId: null,
    attendeeCount: null,
    snippet: "Wrc ply lot slips to next week; teak schedule unchanged.",
    needsFollowUp: true,
    syncedAt: isoInstant(0),
  },
];

const PACKS: Record<DemoBrandCode, ExternalEvent[]> = {
  "BR-1": CAFE_EVENTS,
  "BR-2": FURNITURE_EVENTS,
};

export function demoExternalEvents(brandCode: DemoBrandCode): ExternalEvent[] {
  return PACKS[brandCode] ?? [];
}

/** Outbound actions wait here until a user confirms them; nothing is sent automatically. */
export function demoSyncActions(): PendingSyncAction[] {
  return [];
}
