/**
 * ===========================================================================
 * LOCAL STUB — the script writer behind the Content Management screen.
 *
 * A merchant picks a product, says whether it is a reel or a photo post,
 * picks an objective, types a note like "30% off on pizza" and presses
 * Generate script. This file answers that press. It is not a model: the copy
 * comes from fixed template banks and a seeded random pick, so output is
 * plausible, changes every time, and is reproducible in tests.
 *
 * WHERE A REAL PROVIDER WOULD BE WIRED IN — `generateScript` is the only seam.
 * Its body would become the provider call (`await provider.generate(payload)`)
 * and nothing else would change: keep the `GeneratedScript` shape, keep the
 * `RangeError` validation, and keep `meta.generator` truthful about which
 * writer produced the script, because saved scripts must stay explainable.
 * The call cannot live here — this module deliberately imports nothing, the
 * demo is a self-contained build, and the CSP in docs/SECURITY.md allows no
 * external connect target, so a provider belongs behind a server route when
 * one is connected. Until then `generator` is always `"local-stub"`, and no
 * copy in this file claims a machine wrote it.
 * ===========================================================================
 */

export type ContentKind = "reel" | "image";
export type ContentObjective = "discount" | "new_launch" | "content";

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  reel: "Reel",
  image: "Photo post",
};

export const CONTENT_OBJECTIVE_LABELS: Record<ContentObjective, string> = {
  discount: "Discount offer",
  new_launch: "New launch",
  content: "Content only",
};

/** The only reel lengths the screen offers, so tiling maths stays finite. */
export const REEL_DURATIONS = [7, 15, 30] as const;
export type ReelDuration = (typeof REEL_DURATIONS)[number];

export type ScriptInput = {
  brandName: string;
  productName: string;
  category?: string | null;
  price?: number | null;
  objective: ContentObjective;
  kind: ContentKind;
  /** Only meaningful for kind === "reel". Must be one of REEL_DURATIONS. */
  seconds: number;
  notes: string;
};

export type ScriptShot = {
  /** Human timing label, e.g. "0.0 – 2.0s"; "Frame" for an image. */
  at: string;
  /** Segment length in seconds; 0 for an image. */
  duration: number;
  headline: string;
  action: string;
  voiceover: string;
};

export type GeneratedScript = {
  title: string;
  kind: ContentKind;
  objective: ContentObjective;
  /** Echo of input for a reel, 0 for an image. */
  seconds: number;
  hook: string;
  shots: ScriptShot[];
  cta: string;
  caption: string;
  hashtags: string[];
  meta: { seed: number; generator: "local-stub" };
};

/**
 * The rules this module holds itself to, and which the tests pin down:
 *
 *  - **A reel is tiled, not eyeballed.** Shots are cut out of half-second
 *    units, so the durations sum to the requested length exactly and the
 *    labels run from "0.0" to the last end with no gap and no overlap.
 *    Roughly one shot every 1.5 to 3 seconds: four shots in 7 seconds, ten in
 *    30. Shot counts stay inside 2 to 12 because a screen has to show them.
 *  - **A photo post is one frame.** One shot, zero duration, labelled
 *    "Frame", and no timing language anywhere in its copy — nothing here may
 *    ask a merchant to film or watch anything.
 *  - **The objective decides the framing.** A discount sells the offer and
 *    reads its number out of the notes; a new launch is a first look; content
 *    is the shop and its craft, with no price promise at all.
 *  - **Numbers are only ever quoted, never invented.** A percentage or an
 *    rupee amount reaches the copy only if the merchant typed it. If the notes
 *    say "30% off", the script says 30%; if they say nothing, the script talks
 *    about an offer without naming a figure.
 *  - **Notes are the merchant's words, not our instructions.** They are
 *    trimmed, stripped of anything link- or tag-shaped, capped, used in one
 *    voiceover line and the tail of the caption, and dropped first if the
 *    caption has to be shortened. A note that names a price is only quoted by
 *    the discount objective, so a storytelling script cannot promise money.
 *  - **Determinism is a property of the rng, not of the code.** Every random
 *    choice goes through the single supplied `rng`, so the same input plus the
 *    same rng produces a deeply-equal script, and the default `Math.random`
 *    path still varies.
 */

const NOTES_LIMIT = 240;
/** Notes are a garnish: a shorter cap than NOTES_LIMIT once they are in copy. */
const NOTES_IN_COPY = 96;
const CAPTION_LIMIT = 220;
const HASHTAG_MIN = 3;
const HASHTAG_MAX = 6;

/** Shots per offered length — chosen so each segment lands near 2 seconds. */
const SHOTS_BY_SECONDS: Record<ReelDuration, number> = { 7: 4, 15: 7, 30: 10 };

const KINDS: readonly ContentKind[] = ["reel", "image"];
const OBJECTIVES: readonly ContentObjective[] = ["discount", "new_launch", "content"];

/** A reel role: what the shot is for, which is what the copy banks are keyed by. */
type ReelRole = "open" | "detail" | "use" | "proof" | "close";

type Tokens = {
  product: string;
  brand: string;
  offer: string;
  deal: string;
  price: string;
  seconds: string;
  note: string;
};

/**
 * Trims, collapses every run of whitespace to one space, and caps the result.
 * The screen calls this on every keystroke count, so it is deliberately cheap
 * and total: any string in, a shorter plain string out.
 */
export function clampNotes(notes: string): string {
  return notes.replace(/\s+/g, " ").trim().slice(0, NOTES_LIMIT);
}

/** Anything that could become a link or a tag, so notes stay plain text. */
const LINKISH =
  /(?:https?|ftp|mailto|javascript|vbscript|data):[^\s]*|\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:com|net|org|in|uk|us|co|io|app|dev|shop|store)\b[^\s]*/gi;

/**
 * Notes travel into copy only as words. Schemes, bare domains and angle
 * brackets are removed rather than escaped, because nothing downstream is
 * guaranteed to escape again and this script is copied into other people's
 * tools.
 */
function plainNotes(notes: string): string {
  return clampNotes(notes)
    .replace(LINKISH, " ")
    .replace(/[<>"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shortest safe form of the notes for use inside a sentence. */
function notesInCopy(notes: string): string {
  const text = plainNotes(notes);
  if (text.length <= NOTES_IN_COPY) return text;
  const head = text.slice(0, NOTES_IN_COPY);
  const space = head.lastIndexOf(" ");
  return (space > 40 ? head.slice(0, space) : head).replace(/[\s,;:.]+$/, "");
}

/** Anything that reads as a money claim. */
const PRICE_CLAIM = /%|₹|\boff\b|\bdiscount\b|\bprice\b|\bcheap(?:er)?\b|\brs\.?\s*\d/i;

/**
 * The merchant's note is quoted in full only when the objective is the offer.
 * A "content only" script that repeats a stray "20% off" would promise a price
 * the shop never chose to promise, so a money-bearing note is left out of the
 * storytelling copy rather than paraphrased.
 */
function quotedNotes(notes: string, objective: ContentObjective): string {
  return objective === "discount" || !PRICE_CLAIM.test(notes) ? notes : "";
}

type Offer = { value: string; label: string };

const PERCENT_OFF = /(\d{1,3})\s*%/i;
const RUPEE_OFF = /(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d+)?)/i;
const AMOUNT_OFF = /(\d[\d,]*(?:\.\d+)?)\s*(?:rupees?|rs\.?)?\s*off\b/i;

/**
 * Reads the merchant's own number out of the notes: a percentage wins over an
 * amount, because "30% off, or ₹100 off" is a percentage sentence with an
 * example attached. Returns null when the notes name no figure — the caller
 * must then write about the offer without quoting one.
 */
function extractOffer(notes: string): Offer | null {
  const text = plainNotes(notes);
  if (!text) return null;
  const percent = PERCENT_OFF.exec(text);
  if (percent) {
    const value = `${percent[1]}%`;
    return { value, label: `${value} off` };
  }
  const rupee = RUPEE_OFF.exec(text);
  if (rupee) return { value: moneyAmount(rupee[1]), label: `${moneyAmount(rupee[1])} off` };
  const amount = AMOUNT_OFF.exec(text);
  if (amount) return { value: moneyAmount(amount[1]), label: `${moneyAmount(amount[1])} off` };
  return null;
}

/** Keeps the figure the merchant typed, grouped the way the till prints it. */
function moneyAmount(raw: string): string {
  if (raw.includes(".")) return `₹${raw}`;
  const grouped = formatRupees(Number(raw.replace(/,/g, "")));
  return grouped || `₹${raw}`;
}

/** Indian digit groups — 42,900 and 1,23,450 — without pulling in Intl here. */
function formatRupees(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const digits = String(Math.round(amount));
  const tail = digits.slice(-3);
  const head = digits.slice(0, -3);
  return `₹${head ? `${head.replace(/\B(?=(\d\d)+$)/g, ",")},${tail}` : tail}`;
}

/**
 * One gate in front of the caller's rng: a stray NaN or an out-of-range value
 * would otherwise become an undefined array slot and put "undefined" in a
 * merchant's headline.
 */
function bounded(rng: () => number): () => number {
  return () => {
    const value = rng();
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value >= 1 ? 0.999999 : value;
  };
}

function pick<T>(options: readonly T[], read: () => number): T {
  return options[Math.floor(read() * options.length)];
}

/**
 * A pick that also steps by shot index, so a 30 second reel cycling through
 * the same role twice does not repeat the same sentence verbatim.
 */
function pickAt<T>(options: readonly T[], index: number, read: () => number): T {
  return options[(Math.floor(read() * options.length) + index) % options.length];
}

function shuffled<T>(items: readonly T[], read: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(read() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

function upperFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Templates carry `{product}`-style holes. Substitution is a single pass over
 * the template, so text coming from the notes is never re-read for tokens and
 * never becomes part of the shape of the sentence.
 */
function fill(template: string, tokens: Tokens): string {
  const values: Record<string, string> = tokens;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "");
}

function tidy(text: string): string {
  return text.replace(/\s{2,}/g, " ").replace(/\s+([,.:;!?])/g, "$1").trim();
}

/**
 * Durations in half-second units, so the arithmetic is exact: 1.5 and 2.5 are
 * both representable, their sum equals the requested length, and no label
 * drifts by a tenth of a second.
 */
function shotDurations(seconds: number, read: () => number): number[] {
  const count = SHOTS_BY_SECONDS[seconds as ReelDuration] ?? Math.min(12, Math.max(2, Math.round(seconds / 3)));
  const units = seconds * 2;
  const base = Math.floor(units / count);
  const spare = units - base * count;
  const plan = new Array<number>(count).fill(base);
  const slots = shuffled(
    plan.map((_value, index) => index),
    read,
  );
  for (let i = 0; i < spare; i++) plan[slots[i]] += 1;
  return plan.map((unit) => unit / 2);
}

/** open, then a repeating middle, then close — the shape of any short edit. */
function shotRoles(count: number): ReelRole[] {
  const middle: ReelRole[] = ["detail", "use", "proof"];
  const roles: ReelRole[] = ["open"];
  for (let index = 1; index < count - 1; index++) roles.push(middle[(index - 1) % middle.length]);
  if (count > 1) roles.push("close");
  return roles;
}

function timingLabel(start: number, end: number): string {
  return `${start.toFixed(1)} – ${end.toFixed(1)}s`;
}

/**
 * Filming notes are shared across objectives: what changes with the objective
 * is what the shot says, not what it shows. Kept free of the word "off" so a
 * content-only script never reads as a price promise.
 */
const REEL_ACTIONS: Record<ReelRole, string[]> = {
  open: [
    "Carry the {product} into frame and set it down where {brand} is lit best.",
    "Hands bring the {product} towards the camera at {brand}, then hold it still.",
    "Start wide on {brand}, then walk the {product} into the centre of the frame.",
  ],
  detail: [
    "Tight on the {product}: one slow move across the surface, then hold.",
    "Close-up of the finishing work on the {product}, the part a customer rarely sees.",
    "Let the {product} fill the frame long enough to read its colour and edges.",
  ],
  use: [
    "Someone uses the {product} at {brand}, unposed, the room carrying on behind them.",
    "The {product} doing its job on an ordinary day, filmed over a shoulder.",
    "Hand the {product} across and keep the camera running; the reaction is the point.",
  ],
  proof: [
    "Two of the {product} side by side so the size and the finish speak for themselves.",
    "Another {product} leaving {brand} in the same hour as the first one.",
    "Both ends of the {product} shown in the same light, nothing hidden.",
  ],
  close: [
    "Back to the {product} on its own, held steady until the last second.",
    "Pull out to the room at {brand} with the {product} still in the middle of it.",
    "End on the {product} with {brand} behind it, nobody else moving.",
  ],
};

const REEL_HEADLINES: Record<ContentObjective, Record<ReelRole, string[]>> = {
  discount: {
    open: ["{offer} on the {product}", "{product}: {offer}", "{offer} at {brand}"],
    detail: ["Made the same as ever", "Same work, same {product}"],
    use: ["Still the {product}", "Everything the same but the price"],
    proof: ["No small print", "Worth the trip"],
    close: ["{offer} — ask at {brand}", "Get in for the {product}"],
  },
  new_launch: {
    open: ["The new {product}, at {brand}", "Meet the {product}", "First look: {product}"],
    detail: ["Decided on purpose", "Finished by hand at {brand}"],
    use: ["Here for the first time", "Made to be lived with"],
    proof: ["The same standard", "In the room it was made for"],
    close: ["Ask for the {product} at {brand}", "New at {brand}"],
  },
  content: {
    open: ["How the {product} gets made", "A day with the {product}", "The {product}, the {brand} way"],
    detail: ["The slow part", "Finished where you can see it"],
    use: ["Why people come back", "The bit that matters"],
    proof: ["Same hands, every time", "Nothing to prove but the {product}"],
    close: ["Come and see at {brand}", "That is the {product}"],
  },
};

const REEL_VOICEOVERS: Record<ContentObjective, Record<ReelRole, string[]>> = {
  discount: {
    open: [
      "You already know this one: {deal} at {brand}.",
      "Here at {brand}: {deal}.",
    ],
    detail: [
      "None of the work has changed, and none of it will.",
      "Same hands, same finish, same care as every other {product}.",
    ],
    use: ["Order it the way you always do.", "It still leaves the same way it always did."],
    proof: ["Nothing taken away, nothing watered down.", "Look at it and judge for yourself."],
    close: ["{deal} at {brand} — come and ask.", "Ask for the {product} at {brand} before it is gone."],
  },
  new_launch: {
    open: [
      "First look at the {product}, straight from {brand}.",
      "The {product} has just joined the range at {brand}.",
    ],
    detail: [
      "Every detail here was argued for before it was made.",
      "This is the part we spent the longest on.",
    ],
    use: ["Made to be used, not just admired.", "We have one in daily use before we show anyone else."],
    proof: ["Built the way everything at {brand} is built.", "The same standard as the pieces already in your home."],
    close: ["Ask for the {product} at {brand}.", "Come and see the {product} before it settles into the range."],
  },  content: {
    open: ["This is how the {product} is made at {brand}.", "A short look at the {product}, start to finish."],
    detail: ["The slow part is the part that shows.", "Nobody watches this bit, so we filmed it."],
    use: ["This is the reason people come back.", "It works best when it is being used."],
    proof: ["We make it the same way every single time.", "No shortcuts in the {product}."],
    close: ["Come to {brand} and ask about the {product}.", "That is the {product}, as it leaves {brand}."],
  },
};

/** A photo post is one still: no timing language anywhere in these banks. */
const IMAGE_HEADLINES: Record<ContentObjective, string[]> = {
  discount: ["{offer} on the {product}", "{product}: {offer}", "{offer} at {brand}"],
  new_launch: ["The new {product}", "{product}, now at {brand}", "Meet the {product} at {brand}"],
  content: ["{product}, the {brand} way", "The {product} at {brand}", "Made at {brand}: the {product}"],
};

const IMAGE_ACTIONS: Record<ContentObjective, string[]> = {
  discount: [
    "One framed photo of the {product} in the light at {brand}, nothing else in the picture.",
    "The {product} photographed straight on with the {brand} sign readable behind it.",
  ],
  new_launch: [
    "The {product} shown whole, placed in a corner of {brand} where someone would actually use it.",
    "A clean front-on photo of the {product}, with {brand} softly in the background.",
  ],
  content: [
    "A still of the {product} where it is made, with the room at {brand} around it.",
    "One honest photo of the {product}, unstyled but for the light.",
  ],
};

const IMAGE_READOUTS: Record<ContentObjective, string[]> = {
  discount: [
    "{deal}, at {brand} — ask in person.",
    "Plain and simple: {deal}, at {brand}.",
  ],
  new_launch: [
    "The {product} has joined the range at {brand}.",
    "New at {brand}: the {product}, photographed in the room.",
  ],
  content: [
    "The {product}, as it leaves {brand}.",
    "A note on the {product} from the people who make it at {brand}.",
  ],
};

const HOOKS: Record<ContentObjective, Record<ContentKind, string[]>> = {
  discount: {
    reel: [
      "You already know this one: {deal} at {brand}.",
      "Stop for a second — {deal} at {brand}.",
      "One more reason to like the {product}: {deal} at {brand}.",
    ],
    image: [
      "{deal}, at {brand}.",
      "The {product}, photographed as it sits at {brand} — {offer}.",
    ],
  },
  new_launch: {
    reel: [
      "This is the first time you are seeing the {product} from {brand}.",
      "New in at {brand}: the {product}.",
      "{brand} has been keeping the {product} to itself until now.",
    ],
    image: [
      "New at {brand}: the {product}.",
      "The {product}, fresh into the {brand} range.",
    ],
  },
  content: {
    reel: [
      "The {product} at {brand}, start to finish.",
      "What it takes to make the {product} properly at {brand}.",
      "One ordinary hour at {brand}, and the {product} is the reason.",
    ],
    image: [
      "The {product}, as it leaves {brand}.",
      "A single photo of the {product} at {brand}.",
      "The {product} at {brand}, standing still.",
    ],
  },
};

const CTAS: Record<ContentObjective, Record<ContentKind, string[]>> = {
  discount: {
    reel: [
      "Come to {brand} and ask for the {product}.",
      "Bring this to {brand} and ask for the {product}.",
    ],
    image: [
      "Save this post, then ask at {brand} for the {product}.",
      "Come to {brand} and ask for the {product}.",
    ],
  },
  new_launch: {
    reel: [
      "Ask for the {product} at {brand} and see it in person.",
      "Come to {brand} before the {product} is a normal part of the range.",
    ],
    image: [
      "Save this and come to {brand} to see the {product}.",
      "Ask about the {product} at {brand}.",
    ],
  },
  content: {
    reel: [
      "Come to {brand} and ask how the {product} is made.",
      "If the {product} looked easy, come to {brand} and watch us fail at it first.",
    ],
    image: [
      "Come to {brand} and see the {product} for yourself.",
      "Ask at {brand} about the {product} next time you are past.",
    ],
  },
};

const TITLE_TEMPLATES: Record<ContentKind, string[]> = {
  reel: [
    "{product} — {seconds}-second reel for {brand}",
    "{brand}: the {product} in {seconds} seconds",
    "The {product} at {brand}, {seconds} seconds of it",
  ],
  image: [
    "{product} — photo post for {brand}",
    "{brand}: the {product}, one photo",
    "The {product} at {brand} — a photo for the feed",
  ],
};

const CAPTION_LEADS: Record<ContentObjective, string[]> = {
  discount: [
    "{offer} on the {product} at {brand}",
    "{deal} at {brand}",
  ],
  new_launch: [
    "The {product} has just joined us at {brand}",
    "New in: the {product}, from {brand}",
  ],
  content: [
    "A look at the {product} and the hands that make it at {brand}",
    "The {product}, photographed where it is made at {brand}",
  ],
};

const CAPTION_TAILS: Record<ContentObjective, string[]> = {
  discount: ["No code and no minimum — just ask in person.", "Ask us in person and we will sort it out."],
  new_launch: ["Come and look at it before it becomes an ordinary part of the range.", "Tell us what you think when you see it in person."],
  content: ["Same hands, same place, week after week.", "Made here, which is the whole point."],
};

const OBJECTIVE_HASHTAGS: Record<ContentObjective, string[]> = {
  discount: ["offer", "worththevisit"],
  new_launch: ["new", "justlanded"],
  content: ["workshop", "madehere"],
};

const HASHTAG_STOP = new Set(["the", "a", "an", "and", "with", "for", "of", "at", "in", "on", "to", "our", "no", "not", "its"]);

/**
 * Lowercase, accent-free, alphanumeric slugs in the order brand → product →
 * category → objective, deduplicated, capped at six. Digits are dropped: a
 * hashtag is how someone finds the shop, not a price.
 */
function slugWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 2 && !HASHTAG_STOP.has(word));
}

function hashtagsFor(
  source: { brandName: string; productName: string; category?: string | null },
  objective: ContentObjective,
): string[] {
  const words = [
    ...slugWords(source.brandName),
    ...slugWords(source.productName),
    ...slugWords(source.category ?? ""),
    ...OBJECTIVE_HASHTAGS[objective],
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(`#${word}`);
    if (out.length === HASHTAG_MAX) break;
  }
  // A one-word brand and a one-word product can still leave us short of three.
  for (const word of ["small", "local"]) {
    if (out.length >= HASHTAG_MIN) break;
    if (!seen.has(word)) {
      seen.add(word);
      out.push(`#${word}`);
    }
  }
  return out;
}

/** Long captions lose their tail, which is always the notes and then price. */
function fitCaption(text: string): string {
  if (text.length <= CAPTION_LIMIT) return text;
  const head = text.slice(0, CAPTION_LIMIT);
  const space = head.lastIndexOf(" ");
  const cut = space > 40 ? head.slice(0, space) : head;
  return cut.replace(/[\s,;:.]+$/, "");
}

function isKind(value: ContentKind): boolean {
  return KINDS.indexOf(value) !== -1;
}

function isObjective(value: ContentObjective): boolean {
  return OBJECTIVES.indexOf(value) !== -1;
}

function isReelDuration(seconds: number): boolean {
  return REEL_DURATIONS.some((duration) => duration === seconds);
}

/**
 * The reel's shots, tiled from the first tenth of a second to the last. Notes
 * get one voiceover line — the second shot, where a viewer is already
 * interested — and nothing else, so a merchant's sentence never becomes the
 * whole script.
 */
function reelShots(seconds: number, objective: ContentObjective, tokens: Tokens, read: () => number): ScriptShot[] {
  const durations = shotDurations(seconds, read);
  const roles = shotRoles(durations.length);
  const shots: ScriptShot[] = [];
  let elapsed = 0;
  durations.forEach((duration, index) => {
    const role = roles[index];
    const start = elapsed;
    elapsed += duration;
    const note = index === 1 && tokens.note ? ` ${tokens.note}` : "";
    shots.push({
      at: timingLabel(start, elapsed),
      duration,
      headline: upperFirst(tidy(fill(pickAt(REEL_HEADLINES[objective][role], index, read), tokens))),
      action: tidy(fill(pickAt(REEL_ACTIONS[role], index, read), tokens)),
      voiceover: tidy(upperFirst(fill(pickAt(REEL_VOICEOVERS[objective][role], index, read), tokens)) + note),
    });
  });
  return shots;
}

/** One frame, one line of each kind, labelled "Frame" — there is no timing in it. */
function imageShot(objective: ContentObjective, tokens: Tokens, read: () => number): ScriptShot[] {
  return [
    {
      at: "Frame",
      duration: 0,
      headline: upperFirst(tidy(fill(pick(IMAGE_HEADLINES[objective], read), tokens))),
      action: tidy(fill(pick(IMAGE_ACTIONS[objective], read), tokens)),
      voiceover: tidy(
        upperFirst(fill(pick(IMAGE_READOUTS[objective], read), tokens)) +
          (tokens.note ? ` ${tokens.note}` : ""),
      ),
    },
  ];
}

/**
 * Builds the script. Throws `RangeError` on anything the screen should not
 * have let through: an unknown objective or kind, a reel length that is not on
 * the offered list, or a product with no name — there is nothing to film.
 */
export function generateScript(input: ScriptInput, rng: () => number = Math.random): GeneratedScript {
  if (!isKind(input.kind)) {
    throw new RangeError(`Unknown content kind: ${String(input.kind)}. Use ${KINDS.join(" or ")}.`);
  }
  if (!isObjective(input.objective)) {
    throw new RangeError(`Unknown objective: ${String(input.objective)}. Use ${OBJECTIVES.join(" or ")}.`);
  }
  const product = input.productName.trim();
  if (!product) {
    throw new RangeError("A script needs a product with a name.");
  }
  const reel = input.kind === "reel";
  if (reel && !isReelDuration(input.seconds)) {
    throw new RangeError(`A ${CONTENT_KIND_LABELS.reel.toLowerCase()} runs ${REEL_DURATIONS.join(", ")} seconds, not ${String(input.seconds)}.`);
  }

  const read = bounded(rng);
  // The seed is the run's fingerprint: the first draw, so a fixed rng always
  // reports the same seed and a real one never pretends to be reproducible.
  const seed = Math.floor(read() * 1000000);
  const brand = input.brandName.trim() || "the shop";
  const notes = quotedNotes(notesInCopy(input.notes), input.objective);
  // Only a discount reads a number out of the notes; the other objectives
  // deliberately leave it alone so a story never turns into a price promise.
  const offer = input.objective === "discount" ? extractOffer(input.notes) : null;
  const priceText = input.objective === "discount" ? formatRupees(input.price ?? 0) : "";
  const tokens: Tokens = {
    product,
    brand,
    offer: offer ? offer.label : "a reduced price",
    deal: offer ? `the ${product} is ${offer.label}` : `there is an offer on the ${product}`,
    price: priceText,
    seconds: reel ? String(input.seconds) : "",
    note: notes ? `${upperFirst(notes)}.` : "",
  };

  const shots = reel
    ? reelShots(input.seconds, input.objective, tokens, read)
    : imageShot(input.objective, tokens, read);

  const captionParts = [
    `${upperFirst(fill(pick(CAPTION_LEADS[input.objective], read), tokens))}.`,
    tidy(fill(pick(CAPTION_TAILS[input.objective], read), tokens)),
  ];
  if (input.objective === "discount" && priceText) captionParts.push(`Priced at ${priceText}.`);
  if (tokens.note) captionParts.push(tokens.note);

  return {
    title: upperFirst(tidy(fill(pick(TITLE_TEMPLATES[input.kind], read), tokens))),
    kind: input.kind,
    objective: input.objective,
    seconds: reel ? input.seconds : 0,
    hook: upperFirst(tidy(fill(pick(HOOKS[input.objective][input.kind], read), tokens))),
    shots,
    cta: upperFirst(tidy(fill(pick(CTAS[input.objective][input.kind], read), tokens))),
    caption: fitCaption(tidy(captionParts.filter(Boolean).join(" "))),
    hashtags: hashtagsFor({ brandName: brand, productName: product, category: input.category }, input.objective),
    meta: { seed, generator: "local-stub" },
  };
}

const SHOT_LABELS: Record<ContentKind, { action: string; voiceover: string }> = {
  reel: { action: "Film", voiceover: "Say" },
  image: { action: "Photo", voiceover: "Read" },
};

/**
 * The clipboard block. Structured for a human to paste into a phone note, so
 * it says what to film and what to say rather than shipping JSON, and signs
 * off as a local draft a person still has to approve.
 */
export function scriptToPlainText(script: GeneratedScript): string {
  const labels = SHOT_LABELS[script.kind];
  const heading = [
    CONTENT_KIND_LABELS[script.kind],
    CONTENT_OBJECTIVE_LABELS[script.objective],
    script.kind === "reel" ? `${script.seconds} seconds` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const lines: string[] = [script.title, heading, "", `Hook — ${script.hook}`, ""];
  for (const shot of script.shots) {
    lines.push(`${shot.at} — ${shot.headline}`);
    lines.push(`   ${labels.action}: ${shot.action}`);
    lines.push(`   ${labels.voiceover}: ${shot.voiceover}`);
    lines.push("");
  }
  lines.push(`Call to action — ${script.cta}`);
  lines.push("");
  lines.push(`Caption — ${script.caption}`);
  lines.push(`Hashtags — ${script.hashtags.join(" ")}`);
  lines.push("");
  lines.push(`Local draft ${script.meta.generator} · seed ${script.meta.seed}. Read it once before posting.`);
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
