import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { Note } from "@/types/business";
import { isoInstant } from "./dates";

/**
 * Seeded business notes per demo brand. Owned by Productivity Manager;
 * extend the arrays here rather than adding another notes data source.
 */

const CAFE_NOTES: Note[] = [
  {
    id: "bc-note-1",
    brand_id: "demo-brewery-cafe",
    title: "Single-origin flight — tasting notes",
    body: "Nutty body, low acidity. Ananya preferred the washed lot over the natural. Order two bags for next month's cupping.",
    category: "customer",
    scope: "shared",
    pinned: true,
    linkedCustomerId: "c2",
    linkedStaffId: "bc-staff-1",
    linkedAppointmentId: null,
    linkedTaskId: null,
    created_at: isoInstant(-6),
    updated_at: isoInstant(0),
  },
  {
    id: "bc-note-2",
    brand_id: "demo-brewery-cafe",
    title: "Espresso dial-down on the rotary machine",
    body: "Grind coarser by 0.4 after 3pm — the machine runs hot near the window and shots go sour.",
    category: "operations",
    scope: "shared",
    pinned: false,
    linkedCustomerId: null,
    linkedStaffId: "bc-staff-3",
    linkedAppointmentId: null,
    linkedTaskId: null,
    created_at: isoInstant(-3),
    updated_at: isoInstant(-1),
  },
  {
    id: "bc-note-3",
    brand_id: "demo-brewery-cafe",
    title: "Idea: quiet-hour study sessions",
    body: "Low-fi weekday evening slot, no machine noise. Check whether it hurts the dinner rush before trialling it.",
    category: "idea",
    scope: "personal",
    pinned: false,
    linkedCustomerId: null,
    linkedStaffId: null,
    linkedAppointmentId: null,
    linkedTaskId: null,
    created_at: isoInstant(-9),
    updated_at: isoInstant(-9),
  },
];

const FURNITURE_NOTES: Note[] = [
  {
    id: "cf-note-1",
    brand_id: "demo-cubig-furniture",
    title: "Sheesham lot 42 — moisture reading",
    body: "Kiln-dried to 11%. Two planks with casehardening; keep them for small parts rather than the dining top.",
    category: "operations",
    scope: "shared",
    pinned: true,
    linkedCustomerId: null,
    linkedStaffId: "cf-staff-3",
    linkedAppointmentId: null,
    linkedTaskId: null,
    created_at: isoInstant(-12),
    updated_at: isoInstant(0),
  },
  {
    id: "cf-note-2",
    brand_id: "demo-cubig-furniture",
    title: "Kulkarni dining — finish choice",
    body: "Client chose matte hardwax oil over PU for the table top. Delivery crew needs an extra 24h cure before install.",
    category: "customer",
    scope: "shared",
    pinned: false,
    linkedCustomerId: "fc2",
    linkedStaffId: "cf-staff-1",
    linkedAppointmentId: null,
    linkedTaskId: null,
    created_at: isoInstant(-4),
    updated_at: isoInstant(-2),
  },
  {
    id: "cf-note-3",
    brand_id: "demo-cubig-furniture",
    title: "Meeting — workshop capacity",
    body: "Can take two more bespoke orders for the month if the wardrobe job slips a week. Follow up with the vendor on ply delivery.",
    category: "meeting",
    scope: "personal",
    pinned: false,
    linkedCustomerId: null,
    linkedStaffId: "cf-staff-1",
    linkedAppointmentId: null,
    linkedTaskId: null,
    created_at: isoInstant(-1),
    updated_at: isoInstant(-1),
  },
];

const PACKS: Record<DemoBrandCode, Note[]> = {
  "BR-1": CAFE_NOTES,
  "BR-2": FURNITURE_NOTES,
};

export function demoNotes(brandCode: DemoBrandCode): Note[] {
  return PACKS[brandCode] ?? [];
}
