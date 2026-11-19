import type { DemoBrandCode } from "@/lib/workspace/constants";

/**
 * Per-brand marketing copy and identity for the public brand websites
 * (`/site/BR-1`, `/site/BR-2`). Everything the customer sees that is not a
 * product row lives here; everything that is a product row comes from the
 * same CSV packs the workspace reads, via `src/lib/site/menu.ts`.
 *
 * The shape follows the editorial sites these two brands are modelled on:
 * an anchor-navigated single page (statement → card/shelf → the room →
 * a set → voices → visit), counters that tick up on scroll, and a card grid
 * that carries a real detail line per row. Strings may contain `{qty}` or
 * `{n}` placeholders, which `menu.ts` / the components fill from the pack.
 */
export type SiteCounter = {
  /** The number the odometer rolls to. */
  value: number;
  /** Reads after the number, like Ember Larder's "m of firebrick hearth". */
  unit: string;
  caption: string;
};

export type SiteCourse = {
  /** Two-digit index, printed as-is ("01"). */
  n: string;
  label: string;
  text: string;
  /** Product row this course comes from; skipped if the pack drops it. */
  productId: string;
};

export type SiteStep = { n: string; label: string; text: string };

export type SiteProfile = {
  code: DemoBrandCode;
  brandId: string;
  name: string;
  /** Short line under the wordmark in the header. */
  tagline: string;
  /** Hero kicker line (small, above the headline). */
  eyebrow: string;
  /** Hero headline — split into lines for the stagger animation. */
  heroLines: string[];
  heroBody: string;
  /** Small line beside the hero CTAs. */
  heroNote: string;
  /** CSS scope class that recolours every `--site-*` token. */
  themeClass: string;
  /** Site section labels — the two tabs customers actually use. */
  menuTab: string;
  orderTab: string;
  orderIntro: string;
  orderKicker: string;
  /** Anchor nav on the single-page site. */
  nav: { id: string; label: string }[];
  /** Category order for the menu; unknown categories follow in CSV order. */
  categoryOrder: string[];
  /** Category → one-line menu blurb shown above each section. */
  categoryBlurbs: Record<string, string>;

  /* ── The card / shelf section ─────────────────────────────────────── */
  shelfTitle: string;
  shelfIntro: string;
  /** Belt above the grid: the rows the brand sells over and over. */
  railTitle: string;
  railCaption: string;
  /** Badge on the most-repeated lines. */
  popularBadge: string;
  soldOutBadge: string;
  /** Stock sentence; `{qty}` is replaced with the shelf figure. */
  stockLine: string;
  /** Used when the product row carries no stock number at all. */
  noStockLine: string;
  /** Category → tail of the card's detail line ("poured to order"). */
  categoryNotes: Record<string, string>;

  /* ── Editorial counters ───────────────────────────────────────────── */
  counterKicker: string;
  counters: SiteCounter[];
  /** Caption under the counter row, so it is clear these are house claims. */
  counterNote: string;

  /* ── The set / package block ──────────────────────────────────────── */
  set: {
    kicker: string;
    statement: string;
    name: string;
    intro: string;
    priceNote: string;
    courses: SiteCourse[];
    /** Made-to-order brands show the build process instead of extra prose. */
    steps?: SiteStep[];
    addLabel: string;
  };

  /* ── Story, voices, visit, notes ──────────────────────────────────── */
  storyTitle: string;
  storyBody: string;
  pullQuote: string;
  pullQuoteBy: string;
  voicesKicker: string;
  /** `{n}` is the number of notes on the belt. */
  beltCaption: string;
  visitKicker: string;
  visitTitle: string;
  visitBody: string;
  address: string;
  hours: string;
  hoursRows: { day: string; time: string; note: string }[];
  /** What happens between pressing the button and getting the thing. */
  nextSteps: string[];
  journal: {
    kicker: string;
    entries: { title: string; body: string }[];
  };
  city: string;

  /* ── Footer / checkout wording ────────────────────────────────────── */
  ventureLine: string;
  backLabel: string;
  /** Bento-grid highlights under the hero. */
  highlights: { title: string; body: string }[];
  /** Whether the site sells made-to-order work (furniture) or counter food. */
  madeToOrder: boolean;
  /** Checkout fulfilment wording. */
  fulfilment: { takeaway: string; delivery: string };
  /** Free-text hint above the checkout notes field. */
  notesPlaceholder: string;
  /** Confirmation line after an order lands. */
  confirmation: string;
  /** Words the live order summary line uses. */
  summaryWords: { lines: string; items: string };
};

export const SITE_PROFILES: Record<DemoBrandCode, SiteProfile> = {
  "BR-1": {
    code: "BR-1",
    brandId: "demo-brewery-cafe",
    name: "Brewery Cafe",
    tagline: "Slow coffee, fast service",
    eyebrow: "Indiranagar · Bengaluru",
    heroLines: ["The coffee", "is the point."],
    heroBody:
      "A small cafe that roasts for itself, plates what the market gave us that morning, and pours it all across a ten-table room. Order ahead and it is on the counter when you walk in.",
    heroNote: "Sizes and add-ons price live · pay at the counter",
    themeClass: "site-br1",
    menuTab: "Menu",
    orderTab: "Order",
    orderKicker: "Order ahead",
    orderIntro:
      "Build your tray, tell us where it goes, and the counter picks it up on OrderBook the moment you place it — your name, your modifiers, your note.",
    nav: [
      { id: "card", label: "The card" },
      { id: "room", label: "The room" },
      { id: "set", label: "Set brunch" },
      { id: "voices", label: "Voices" },
      { id: "visit", label: "Visit" },
    ],
    categoryOrder: ["Coffee", "Beverages", "Food", "Sides & Dips", "Desserts"],
    categoryBlurbs: {
      Coffee:
        "Our own roast, pulled on a two-group Linea. Pick a size; the oat is house-standard.",
      Beverages:
        "Cold things for the afternoon and hot things for the monsoon.",
      Food: "Toasted, smashed, layered — plated from an open kitchen.",
      "Sides & Dips": "Small plates that keep the coffee company.",
      Desserts: "Baked in-house every morning, gone by evening.",
    },
    shelfTitle: "The card, and the counter behind it",
    shelfIntro:
      "This is not a photograph of a menu. Every line below is the counter's own product row, at the counter's own price, with the same sizes and add-ons Billing asks for.",
    railTitle: "What the counter keeps repeating",
    railCaption: "sorted by how often each line leaves the pass",
    popularBadge: "The one everyone gets",
    soldOutBadge: "Sold out today",
    stockLine: "{qty} portions on the shelf",
    noStockLine: "ground and poured to order",
    categoryNotes: {
      Coffee: "pulled when you order",
      Beverages: "over one big rock",
      Food: "feeds one, easily shared",
      "Sides & Dips": "built for the middle of the table",
      Desserts: "out of the oven by nine",
    },
    counterKicker: "Numbers we argue with",
    counters: [
      {
        value: 12,
        unit: "hrs the cold brew steeps",
        caption: "overnight in the fridge by the pass, never in a hurry",
      },
      {
        value: 10,
        unit: "tables in the room",
        caption: "and one long rail for people who read too slowly",
      },
      {
        value: 2,
        unit: "groups on the Linea",
        caption: "both running from eight, one always behind",
      },
      {
        value: 0,
        unit: "syrups from a bottle",
        caption: "the vanilla is a bean we split ourselves",
      },
    ],
    counterNote:
      "House claims. The strip under them is counted from our own OrderBook ledger.",
    set: {
      kicker: "One tray, four lines",
      statement: "Brunch, the way we'd eat it",
      name: "The Indiranagar Brunch",
      intro:
        "Four lines that already work together. Take the whole tray in one tap, or lift any one of them off the card.",
      priceNote:
        "the four lines at counter price — no set markup, no tasting-menu theatre",
      courses: [
        {
          n: "01",
          label: "First",
          text: "Steeped twelve hours, one rock, no sugar.",
          productId: "p2",
        },
        {
          n: "02",
          label: "Second",
          text: "House granola, curd set two streets away.",
          productId: "p4",
        },
        {
          n: "03",
          label: "Third",
          text: "Sourdough, smashed avocado, chilli on top.",
          productId: "p3",
        },
        {
          n: "04",
          label: "Last",
          text: "Brownie, still slightly warm if you are lucky.",
          productId: "p24",
        },
      ],
      addLabel: "Add the whole tray",
    },
    storyTitle: "A cafe that runs on its own ledger",
    storyBody:
      "Brewery Cafe keeps its books the way it keeps its shots — weighed, timed, and honest. The menu you are reading is the same one the counter rings up: every price, size and add-on you choose here arrives at the bar as a real ticket on OrderBook, with your name on it.",
    pullQuote:
      "You can't hide anything in a ten-table room. That is the whole argument for a short menu.",
    pullQuoteBy: "Rhea, who runs the pass",
    voicesKicker: "Voices",
    beltCaption:
      "{n} notes on the wall · the same {n} come back round on the belt",
    visitKicker: "Visit",
    visitTitle: "Walk in, or be waiting with a name on the cup",
    visitBody:
      "Take what is sitting on the counter, or build the tray here and it is bagged on the shelf by the till when you get in. Nothing on this page is charged — you pay at the counter.",
    address: "10th Main Road, Indiranagar, Bengaluru 560038",
    city: "Indiranagar, Bengaluru",
    hours: "Every day · 8:00 – 23:00",
    hoursRows: [
      {
        day: "Mon – Thu",
        time: "8:00 – 23:00",
        note: "the room is quiet before nine, and that is the good hour",
      },
      {
        day: "Friday",
        time: "8:00 – 23:00",
        note: "the last tables stay late and we let them",
      },
      {
        day: "Saturday",
        time: "8:00 – 23:00",
        note: "queue from ten — worth the twenty minutes",
      },
      {
        day: "Sunday",
        time: "8:00 – 23:00",
        note: "roast day, so the grinder talks louder than we do",
      },
    ],
    nextSteps: [
      "You build the tray here and leave your name.",
      "The ticket prints on the bar rail, marked Online order.",
      "We call your name; you pay at the counter.",
      "It sits in the same sales ledger the baristas bill from.",
    ],
    journal: {
      kicker: "Roast notes",
      entries: [
        {
          title: "The card changes when the market does",
          body: "If the pastry case is thin on a Monday, it is because Sunday went well — not because we forgot to bake.",
        },
        {
          title: "Milk, weighed",
          body: "A flat white is six ounces. Weigh the cup before you argue with us about it.",
        },
        {
          title: "Why we roast in the back room",
          body: "Not to look crafty. Green beans keep; roasted ones do not.",
        },
      ],
    },
    ventureLine: "One room, one roaster, one ledger.",
    backLabel: "Back to the counter",
    highlights: [
      {
        title: "Roasted in-house",
        body: "Every bean in the hopper was roasted in the back room this week, never bought in.",
      },
      {
        title: "Order ahead",
        body: "Build the tray here, pay at pickup — the ticket is already on the bar screen.",
      },
      {
        title: "Real kitchen data",
        body: "What you order lands in the same sales ledger the baristas bill from, stock and all.",
      },
    ],
    madeToOrder: false,
    fulfilment: {
      takeaway: "Pickup at the counter",
      delivery: "Deliver to my door",
    },
    notesPlaceholder: "Extra hot, no sugar, leave at the gate…",
    confirmation:
      "Your ticket is on the bar rail. Give us your name at pickup and we will hand it over warm.",
    summaryWords: { lines: "lines", items: "on the tray" },
  },
  "BR-2": {
    code: "BR-2",
    brandId: "demo-cubig-furniture",
    name: "Cubig Furniture",
    tagline: "Modular furniture, made to measure",
    eyebrow: "Surat · Gujarat",
    heroLines: ["Rooms that", "work for a living."],
    heroBody:
      "Workshop-built office and home furniture from Surat — solid tops, soft-close everything, sized to your floor plan. Configure a piece here and the enquiry lands on the workshop desk with your spec attached.",
    heroNote: "Finishes and upgrades price live · nothing is charged here",
    themeClass: "site-br2",
    menuTab: "Catalog",
    orderTab: "Enquire",
    orderKicker: "Send the list",
    orderIntro:
      "Pick the pieces, choose the upgrades, and send the list to the workshop. A designer confirms dimensions and finish, then your enquiry becomes a quotation in Cubig's OrderBook.",
    nav: [
      { id: "card", label: "The catalog" },
      { id: "room", label: "The workshop" },
      { id: "set", label: "As a set" },
      { id: "voices", label: "Voices" },
      { id: "visit", label: "Visit" },
    ],
    categoryOrder: ["Office", "Dining", "Living Room", "Bedroom"],
    categoryBlurbs: {
      Office: "Desks and seating that survive real workdays.",
      Dining: "Tables and stools built around how your family eats.",
      "Living Room": "Sofas and shelving sized to the room, not the showroom.",
      Bedroom: "Storage that closes quietly and stays that way.",
    },
    shelfTitle: "The price list, and the floor it comes off",
    shelfIntro:
      "The catalog below is the list the sales desk quotes from — the same rows, the same rupee, the same upgrades. What is not on it, we will not pretend to build.",
    railTitle: "What offices keep ordering",
    railCaption: "sorted by how often each piece leaves the workshop",
    popularBadge: "Specified over and over",
    soldOutBadge: "Not on the floor right now",
    stockLine: "{qty} in the finishing bay",
    noStockLine: "cut to order",
    categoryNotes: {
      Office: "built to your floor plan",
      Dining: "seats six, extendable",
      "Living Room": "frames welded in-house",
      Bedroom: "soft-close as standard",
    },
    counterKicker: "How we actually build",
    counters: [
      {
        value: 18,
        unit: "mm solid tops",
        caption: "no honeycomb door, no veneer over a chip core",
      },
      {
        value: 5,
        unit: "yr on every frame",
        caption: "the weld is the part we will not argue about",
      },
      {
        value: 72,
        unit: "hrs from yes to cut",
        caption: "the day you confirm the spec, the saws get the list",
      },
      {
        value: 0,
        unit: "showroom markup",
        caption: "the quote comes from the unit that builds it",
      },
    ],
    counterNote:
      "Workshop claims. The strip under them is counted from Cubig's own OrderBook ledger.",
    set: {
      kicker: "One list, the whole room",
      statement: "A room, priced as one job",
      name: "The One-Desk Studio",
      intro:
        "Three pieces that already fit a 10×12 room, sent as one enquiry with one measurement visit. Add the set, or take the desk and leave the shelf.",
      priceNote:
        "the three pieces at workshop price — the designer visit and install are quoted with them",
      courses: [
        {
          n: "01",
          label: "Work",
          text: "Study desk with a locked drawer and a cable channel cut in the back.",
          productId: "fp5",
        },
        {
          n: "02",
          label: "Sit",
          text: "Mesh chair, lumbar adjustable, armrests that do not creak.",
          productId: "fp2",
        },
        {
          n: "03",
          label: "Store",
          text: "Modular shelf on the wall behind you, depth to your books.",
          productId: "fp8",
        },
      ],
      steps: [
        { n: "01", label: "Measure", text: "A designer takes the floor plan and the photos." },
        { n: "02", label: "Cut", text: "Panels are labelled and on the saw within 72 hours." },
        { n: "03", label: "Finish", text: "Edge banding, then the laminate you actually chose." },
        { n: "04", label: "Build", text: "Dry-built in the bay, doors aligned before it is knocked down." },
        { n: "05", label: "Install", text: "Two people, one van, your site tidied when we leave." },
      ],
      addLabel: "Add the room to the enquiry",
    },
    storyTitle: "Built in Surat, measured for you",
    storyBody:
      "Cubig runs one workshop and one ledger. The catalog here is the same price list the sales desk quotes from — every upgrade, every finish, every rupee — and an enquiry placed on this site arrives at that desk as a real lead with your name and your spec on it.",
    pullQuote:
      "A showroom piece feels right for a weekend and wrong for a decade. We only build the second kind.",
    pullQuoteBy: "Faiz, who runs the floor",
    voicesKicker: "Voices",
    beltCaption:
      "{n} notes from sites we fitted · the same {n} come back round on the belt",
    visitKicker: "Visit",
    visitTitle: "Come to the bay, or send us the floor plan",
    visitBody:
      "The workshop floor is open on working days — bring a plan and we will lay the pieces out on it. Enquiries sent here are quoted by the same desk.",
    address: "Udhna – Magdalla Road, Surat 395001, Gujarat",
    city: "Surat, Gujarat",
    hours: "Mon – Sat · 10:00 – 19:00",
    hoursRows: [
      {
        day: "Mon – Fri",
        time: "10:00 – 19:00",
        note: "the floor is open; the saws stop at six sharp",
      },
      {
        day: "Saturday",
        time: "10:00 – 16:00",
        note: "delivery day — most of the vans go out of this gate",
      },
      {
        day: "Sunday",
        time: "Closed",
        note: "the workshop is cold and the phones are off",
      },
    ],
    nextSteps: [
      "You send the list, the room and your floor notes.",
      "A designer calls to measure and confirm the finish.",
      "The workshop cuts after you say yes — 72 hours later.",
      "It becomes a quotation in OrderBook, then a delivery slot.",
    ],
    journal: {
      kicker: "Bench notes",
      entries: [
        {
          title: "Solid top, or nothing",
          body: "A honeycomb door feels fine in a showroom and hollow in a flat after two years. We only cut one kind.",
        },
        {
          title: "The hinge is the product",
          body: "Nobody complains about the panel in year four. They complain about the drawer that will not close.",
        },
        {
          title: "Measure twice, quote once",
          body: "A floor plan with the wall that is not straight on it saves three calls and one apology.",
        },
      ],
    },
    ventureLine:
      "Cubig is a workshop, not a reseller — every piece here is cut, welded and packed in Surat.",
    backLabel: "Back to the workshop floor",
    highlights: [
      {
        title: "Workshop-direct",
        body: "No showroom markup — the quote you get comes from the unit that builds it.",
      },
      {
        title: "Made to order",
        body: "Every piece is cut after you confirm; finishes and add-ons are priced up front.",
      },
      {
        title: "One desk, one thread",
        body: "Your enquiry lands in the same pipeline the sales team quotes from, with your spec on it.",
      },
    ],
    madeToOrder: true,
    fulfilment: {
      takeaway: "Pickup from the workshop",
      delivery: "Deliver & install at my site",
    },
    notesPlaceholder: "Floor plan notes, site address, preferred finish…",
    confirmation:
      "Your enquiry is on the workshop desk. A designer will call to confirm dimensions and finish before it becomes a quotation.",
    summaryWords: { lines: "pieces", items: "in the list" },
  },
};

export function siteProfile(code: string): SiteProfile | null {
  const normalized = code.trim().toUpperCase();
  if (normalized === "BR-1" || normalized === "BR-2") {
    return SITE_PROFILES[normalized];
  }
  return null;
}
