import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { DEMO_BRAND_CODES } from "@/lib/workspace/constants";
import {
  CONTENT_KIND_LABELS,
  CONTENT_OBJECTIVE_LABELS,
  REEL_DURATIONS,
  clampNotes,
  generateScript,
  scriptToPlainText,
  type ContentKind,
  type ContentObjective,
  type GeneratedScript,
  type ScriptInput,
} from "./script";

/** mulberry32 — small, total and identical on every machine this suite runs on. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A rng that cannot vary: proves nothing but the input reaches the copy. */
function counter(): () => number {
  let drawn = 0;
  return () => (drawn = (drawn + 1) % 97) / 97;
}

const CAFE = {
  brandName: "Brewery Cafe",
  productName: "Flat White",
  category: "Coffee",
  price: 220,
};

const WORKSHOP = {
  brandName: "Cubig Furniture",
  productName: "Oslo Dining Table",
  category: "Dining",
  price: 42900,
};

function input(over: Partial<ScriptInput> = {}, base = CAFE): ScriptInput {
  return {
    objective: "discount",
    kind: "reel",
    seconds: 7,
    notes: "30% off on pizza before noon",
    ...base,
    ...over,
  };
}

const KINDS: ContentKind[] = ["reel", "image"];
const OBJECTIVES: ContentObjective[] = ["discount", "new_launch", "content"];

/** Everything a customer would read or hear — the title is structural, not copy. */
function copyFields(script: GeneratedScript): string[] {
  return [
    script.hook,
    script.cta,
    script.caption,
    ...script.shots.flatMap((shot) => [shot.headline, shot.action, shot.voiceover]),
  ];
}

function copyOf(script: GeneratedScript): string {
  return copyFields(script).join(" ");
}

/** Anything that talks about running time, cuts or watching — none of it belongs to a photo. */
const TIMING_LANGUAGE =
  /\b(?:reel|clip|cut|cuts|second|seconds|sec|timeline|duration|beat|beats|watch|frames per second)\b|\d+(?:\.\d+)?\s*(?:s\b|secs?\b|seconds?\b)|0\.0/i;

const PRICE_LANGUAGE = /%|₹|\boff\b|\boffer\b|\bprice\b|\bdiscount\b|\breduced\b/i;

describe("the labels the screen renders", () => {
  it("names the two shapes and the three objectives", () => {
    expect(CONTENT_KIND_LABELS).toEqual({ reel: "Reel", image: "Photo post" });
    expect(CONTENT_OBJECTIVE_LABELS).toEqual({
      discount: "Discount offer",
      new_launch: "New launch",
      content: "Content only",
    });
    expect(REEL_DURATIONS).toEqual([7, 15, 30]);
  });
});

describe("reel tiling", () => {
  it("lays shots end to end across the whole length, exactly", () => {
    for (const seconds of REEL_DURATIONS) {
      for (const seed of [1, 2, 3, 7, 11, 42]) {
        const script = generateScript(input({ seconds }, seed % 2 ? CAFE : WORKSHOP), mulberry32(seed));
        const labelled = `${seconds}s seed ${seed}`;
        expect(script.seconds, labelled).toBe(seconds);
        expect(script.shots.length, labelled).toBeGreaterThanOrEqual(2);
        expect(script.shots.length, labelled).toBeLessThanOrEqual(12);
        expect(script.shots.reduce((sum, shot) => sum + shot.duration, 0), labelled).toBe(seconds);

        let cursor = 0;
        for (const [index, shot] of script.shots.entries()) {
          const [start, end] = shot.at.split(" – ");
          expect(start, `${labelled} shot ${index}`).toBe(cursor.toFixed(1));
          cursor += shot.duration;
          expect(end, `${labelled} shot ${index}`).toBe(`${cursor.toFixed(1)}s`);
          expect(shot.duration, labelled).toBeGreaterThanOrEqual(1.5);
          expect(shot.duration, labelled).toBeLessThanOrEqual(3.5);
          expect(shot.headline, labelled).not.toBe("");
          expect(shot.action, labelled).not.toBe("");
          expect(shot.voiceover, labelled).not.toBe("");
        }
        expect(cursor, labelled).toBe(seconds);
      }
    }
  });

  it("keeps a 7 second reel short and a 30 second reel broken up", () => {
    const shotsAt = (seconds: number) => {
      const counts: number[] = [];
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        counts.push(generateScript(input({ seconds }), mulberry32(seed)).shots.length);
      }
      return counts;
    };
    for (const count of shotsAt(7)) expect(count).toBeGreaterThanOrEqual(3);
    for (const count of shotsAt(7)) expect(count).toBeLessThanOrEqual(6);
    for (const count of shotsAt(30)) expect(count).toBeGreaterThanOrEqual(8);
    for (const count of shotsAt(30)) expect(count).toBeLessThanOrEqual(12);
  });

  it("labels the first shot from zero and the last one to the length", () => {
    const script = generateScript(input({ seconds: 15 }), mulberry32(9));
    expect(script.shots[0].at).toMatch(/^0\.0 – \d\.\ds$/);
    expect(script.shots[script.shots.length - 1].at).toMatch(/ – 15\.0s$/);
  });

  it("varies the copy inside a long reel instead of repeating a line", () => {
    for (const objective of OBJECTIVES) {
      for (const seed of Array.from({ length: 20 }, (_unused, index) => index + 1)) {
        const script = generateScript(
          input({ objective, seconds: 30, notes: "" }, WORKSHOP),
          mulberry32(seed),
        );
        for (const field of ["headline", "action", "voiceover"] as const) {
          const lines = script.shots.map((shot) => shot[field]);
          expect(new Set(lines).size, `${objective} seed ${seed} ${field}`).toBeGreaterThanOrEqual(4);
        }
        for (let index = 1; index < script.shots.length; index++) {
          expect(script.shots[index].headline, `${objective} seed ${seed}`).not.toBe(
            script.shots[index - 1].headline,
          );
        }
      }
    }
  });
});

describe("a photo post", () => {
  it("is one frame with no length", () => {
    for (const objective of OBJECTIVES) {
      const script = generateScript(input({ kind: "image", objective, seconds: 7 }), mulberry32(5));
      expect(script.kind).toBe("image");
      expect(script.seconds).toBe(0);
      expect(script.shots).toHaveLength(1);
      expect(script.shots[0].at).toBe("Frame");
      expect(script.shots[0].duration).toBe(0);
      for (const field of copyFields(script)) expect(field).not.toBe("");
    }
  });

  it("never asks anyone to film or watch something", () => {
    for (const objective of OBJECTIVES) {
      for (const seed of [2, 8, 21]) {
        const script = generateScript(input({ kind: "image", objective }, WORKSHOP), mulberry32(seed));
        for (const field of copyFields(script)) {
          expect(field, `${objective} seed ${seed}`).not.toMatch(TIMING_LANGUAGE);
        }
        expect(script.title).not.toMatch(TIMING_LANGUAGE);
      }
    }
  });

  it("ignores the seconds field entirely when the shape is a photo", () => {
    const script = generateScript(input({ kind: "image", seconds: 1080 }));
    expect(script.seconds).toBe(0);
    expect(script.shots[0].duration).toBe(0);
  });
});

describe("generateScript refuses input the screen should not have offered", () => {
  it("rejects an objective or a kind outside the union", () => {
    expect(() => generateScript(input({ objective: "blast" as ContentObjective }))).toThrow(RangeError);
    expect(() => generateScript(input({ kind: "story" as ContentKind }))).toThrow(RangeError);
  });

  it("rejects a reel length that is not on the list", () => {
    for (const seconds of [0, 5, 8, 12, 15.5, 60, -7, Number.NaN]) {
      expect(() => generateScript(input({ kind: "reel", seconds }))).toThrow(RangeError);
    }
    for (const seconds of REEL_DURATIONS) {
      expect(() => generateScript(input({ kind: "reel", seconds }))).not.toThrow();
    }
  });

  it("rejects a product with no name, and says so", () => {
    expect(() => generateScript(input({ productName: "   " }))).toThrow(/product/i);
    expect(() => generateScript(input({ productName: "" }))).toThrow(RangeError);
    expect(() => generateScript(input({ objective: "blast" as ContentObjective }))).toThrow(/objective/i);
    expect(() => generateScript(input({ kind: "reel", seconds: 9 }))).toThrow(/7, 15, 30/);
  });

  it("still needs a named product for a photo post", () => {
    expect(() => generateScript(input({ kind: "image", productName: " " }))).toThrow(RangeError);
  });
});

describe("the objective decides the framing", () => {
  it("reads a percentage out of the notes instead of inventing one", () => {
    const script = generateScript(input({ notes: "30% off pizza this week" }), mulberry32(3));
    expect(copyOf(script)).toContain("30%");
    expect(copyOf(script)).toContain("30% off");
  });

  it("reads an amount the same way", () => {
    for (const notes of ["₹100 off the study desk", "rs. 100 off at the counter", "flat 100 off today"]) {
      const script = generateScript(input({ notes }, WORKSHOP), mulberry32(6));
      expect(copyOf(script), notes).toContain("₹100");
    }
  });

  it("names an offer without a number when the notes give none", () => {
    const script = generateScript(input({ notes: "wood fired, sourdough base", price: null }), mulberry32(4));
    const copy = copyOf(script);
    expect(copy).not.toContain("%");
    expect(copy).not.toContain("₹");
    expect(copy).not.toMatch(/\d+\s*off/i);
    expect(copy).toMatch(/offer|reduced/i);
    expect(copy).toContain(CAFE.productName);
  });

  it("quotes the listed price only when the merchant supplied one", () => {
    const withPrice = generateScript(input({ notes: "no numbers here", price: 320 }), mulberry32(4));
    expect(copyOf(withPrice)).toContain("₹320");
    const withoutPrice = generateScript(input({ notes: "no numbers here", price: null }), mulberry32(4));
    expect(copyOf(withoutPrice)).not.toContain("₹");
  });

  it("makes a new launch a reveal and says nothing about money", () => {
    const script = generateScript(
      input({ objective: "new_launch", notes: "30% off, and free delivery" }, WORKSHOP),
      mulberry32(12),
    );
    expect(copyOf(script)).not.toMatch(PRICE_LANGUAGE);
    expect(copyOf(script)).toMatch(/new|first|just|fresh|range/i);
    // The number in the notes stays out of a launch: only a discount reads it.
    expect(copyOf(script)).not.toContain("30%");
  });

  it("keeps a content-only script free of any price promise", () => {
    for (const kind of KINDS) {
      const script = generateScript(input({ objective: "content", kind, notes: "25% off" }), mulberry32(15));
      expect(copyOf(script)).not.toMatch(PRICE_LANGUAGE);
    }
  });

  it("sells the discount with the product named in the offer", () => {
    const script = generateScript(input({ objective: "discount" }), mulberry32(16));
    const copy = copyOf(script);
    expect(copy).toContain(CAFE.productName);
    expect(copy).toContain("30% off");
  });
});

describe("brand and product always survive", () => {
  it("names both in every objective and shape, whatever the rng draws", () => {
    for (const kind of KINDS) {
      for (const objective of OBJECTIVES) {
        for (const seed of [1, 5, 9]) {
          const script = generateScript(input({ kind, objective }, WORKSHOP), mulberry32(seed));
          const copy = copyOf(script);
          const label = `${kind}/${objective} seed ${seed}`;
          expect(copy, label).toContain(WORKSHOP.productName);
          expect(copy, label).toContain(WORKSHOP.brandName);
        }
      }
    }
  });

  it("stands on the product alone when the notes are blank", () => {
    const script = generateScript(input({ notes: "   " }), mulberry32(7));
    const copy = copyOf(script);
    expect(copy).toContain(CAFE.productName);
    expect(copy).toContain(CAFE.brandName);
    expect(script.shots.length).toBeGreaterThanOrEqual(3);
  });

  it("never sounds like a machine wrote it, and never uses emoji", () => {
    for (const kind of KINDS) {
      for (const objective of OBJECTIVES) {
        const script = generateScript(input({ kind, objective }), mulberry32(23));
        const copy = copyOf(script);
        expect(copy).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
        expect(copy).not.toMatch(/\bAI\b|artificial intelligence|generated|model/i);
      }
    }
  });
});

describe("the notes are the merchant's words, not instructions", () => {
  it("strips anything link- or tag-shaped before it reaches the copy", () => {
    const script = generateScript(
      input({
        notes: 'click <b>here</b> https://evil.test/x now www.spur.in and javascript:alert(1) or data:text/html,x',
      }),
      mulberry32(31),
    );
    const copy = copyOf(script) + script.title + script.hashtags.join(" ");
    expect(copy).not.toMatch(/[<>"`]/);
    expect(copy).not.toMatch(/https?:|javascript:|data:text|www\./i);
  });

  it("keeps notes in the tail of the caption rather than the front", () => {
    const notes = "slow roasted, single origin, and the cup is bigger than it looks";
    const quoted = `${notes.charAt(0).toUpperCase()}${notes.slice(1)}`;
    const script = generateScript(input({ notes, price: null }), mulberry32(18));
    const at = script.caption.indexOf(quoted);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(Math.floor(script.caption.length / 2));
    expect(script.caption).not.toMatch(/\.\./);
  });

  it("leaves a money-bearing note out of a script that promised no money", () => {
    for (const objective of ["new_launch", "content"] as ContentObjective[]) {
      const script = generateScript(input({ objective, notes: "20% off all week" }), mulberry32(41));
      expect(copyOf(script), objective).not.toMatch(PRICE_LANGUAGE);
      expect(copyOf(script), objective).not.toContain("20%");
    }
    const discount = generateScript(input({ notes: "20% off all week" }), mulberry32(41));
    expect(copyOf(discount)).toContain("20%");
  });

  it("lets a very long note be cut while the script still reads properly", () => {
    const script = generateScript(
      input({ notes: "hand thrown and fired twice ".repeat(30), price: null }),
      mulberry32(19),
    );
    expect(script.caption.length).toBeLessThanOrEqual(220);
    expect(copyOf(script)).toContain(CAFE.productName);
    expect(script.shots.length).toBeGreaterThanOrEqual(3);
  });

  it("never lets notes push the caption over the limit, for any shape", () => {
    for (const kind of KINDS) {
      for (const objective of OBJECTIVES) {
        const script = generateScript(
          input({
            kind,
            objective,
            notes: "we grind to order, the oven is loud, and nobody has ever regretted it",
          }, WORKSHOP),
          mulberry32(27),
        );
        expect(script.caption.length, `${kind}/${objective}`).toBeLessThanOrEqual(220);
      }
    }
  });
});

describe("clampNotes", () => {
  it("trims and collapses whitespace runs", () => {
    expect(clampNotes("  30%\n\toff   on\t pizza  ")).toBe("30% off on pizza");
    expect(clampNotes("")).toBe("");
    expect(clampNotes(" \u00a0 \n ")).toBe("");
  });

  it("caps at 240 characters", () => {
    const long = clampNotes("word ".repeat(120));
    expect(long.length).toBeLessThanOrEqual(240);
    expect(long.startsWith("word word")).toBe(true);
    expect(clampNotes("a".repeat(500)).length).toBe(240);
  });
});

describe("hashtags and caption shape", () => {
  it("gives between three and six lowercase slugs, without duplicates", () => {
    for (const objective of OBJECTIVES) {
      for (const base of [CAFE, WORKSHOP]) {
        const script = generateScript(input({ objective }, base), mulberry32(33));
        expect(script.hashtags.length, base.brandName).toBeGreaterThanOrEqual(3);
        expect(script.hashtags.length, base.brandName).toBeLessThanOrEqual(6);
        expect(new Set(script.hashtags).size, base.brandName).toBe(script.hashtags.length);
        for (const tag of script.hashtags) {
          expect(tag, base.brandName).toMatch(/^#[a-z0-9]{3,}$/);
          expect(tag).not.toMatch(/\d/);
        }
      }
    }
  });

  it("drops accents, spaces and digits from the slugs", () => {
    const script = generateScript(
      input({ productName: "Crème Brûlée No. 2 Toast", category: "Desserts" }),
      mulberry32(35),
    );
    for (const tag of script.hashtags) expect(tag).toMatch(/^#[a-z0-9]+$/);
    expect(script.hashtags).toContain("#creme");
    expect(script.hashtags).toContain("#brulee");
    expect(script.hashtags).toContain("#toast");
    expect(script.hashtags).not.toContain("#the");
    expect(script.hashtags).not.toContain("#no");
  });

  it("still reaches three when brand and product are single short words", () => {
    const script = generateScript(
      input({ brandName: "Cup", productName: "Egg", category: null }),
      mulberry32(37),
    );
    expect(script.hashtags.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the caption within 220 characters across many seeds", () => {
    for (const seed of Array.from({ length: 20 }, (_unused, index) => index + 1)) {
      for (const kind of KINDS) {
        const script = generateScript(input({ kind }, seed % 2 ? CAFE : WORKSHOP), mulberry32(seed));
        expect(script.caption.length).toBeLessThanOrEqual(220);
        expect(script.caption.trim().length).toBeGreaterThan(20);
      }
    }
  });
});

describe("determinism", () => {
  it("replays exactly the same script from the same input and rng", () => {
    for (const kind of KINDS) {
      for (const objective of OBJECTIVES) {
        const case1 = generateScript(input({ kind, objective }, WORKSHOP), mulberry32(101));
        const case2 = generateScript(input({ kind, objective }, WORKSHOP), mulberry32(101));
        expect(case2).toEqual(case1);
        expect(case2.meta.seed).toBe(case1.meta.seed);
      }
    }
  });

  it("replays exactly the same script from a counter rng too", () => {
    expect(generateScript(input(), counter())).toEqual(generateScript(input(), counter()));
  });

  it("reports itself as the local stub with a usable seed", () => {
    const script = generateScript(input(), mulberry32(404));
    expect(Number.isInteger(script.meta.seed)).toBe(true);
    expect(script.meta.seed).toBeGreaterThanOrEqual(0);
    expect(script.meta.generator).toBe("local-stub");
  });

  it("varies when no rng is supplied", () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 30; attempt++) {
      seen.add(JSON.stringify(generateScript(input({ seconds: 30 }))));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("varies between seeds on the same input", () => {
    const scripts = [1, 2, 3, 4, 5].map((seed) =>
      JSON.stringify(generateScript(input({ seconds: 30 }), mulberry32(seed))),
    );
    expect(new Set(scripts).size).toBeGreaterThan(1);
  });

  it("survives an rng that returns nonsense", () => {
    const script = generateScript(input(), () => Number.NaN);
    expect(copyOf(script)).not.toMatch(/undefined|null|NaN|\{|\}/);
    expect(script.shots.length).toBeGreaterThanOrEqual(2);
  });
});

describe("scriptToPlainText", () => {
  it("sends no doubled punctuation or loose token anywhere", () => {
    for (const kind of KINDS) {
      for (const objective of OBJECTIVES) {
        const script = generateScript(input({ kind, objective }), mulberry32(18));
        expect(copyOf(script)).not.toMatch(/\.\.|,\.| \./);
        expect(scriptToPlainText(script)).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it("lays out every shot for a human to paste", () => {
    const script = generateScript(input({ seconds: 7 }), mulberry32(2));
    const text = scriptToPlainText(script);
    expect(text).toContain(script.title);
    expect(text).toContain("Reel · Discount offer · 7 seconds");
    expect(text).toContain(script.hook);
    expect(text).toContain(script.cta);
    expect(text).toContain(script.caption);
    expect(text).toContain(script.hashtags.join(" "));
    for (const shot of script.shots) {
      expect(text).toContain(shot.at);
      expect(text).toContain(shot.headline);
      expect(text).toContain(shot.action);
      expect(text).toContain(shot.voiceover);
    }
    expect(text).not.toMatch(/undefined|\{product\}/);
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it("says Frame, not a timing row, for a photo post", () => {
    const text = scriptToPlainText(generateScript(input({ kind: "image" }), mulberry32(2)));
    expect(text).toContain("Photo post");
    expect(text).toContain("Frame");
    expect(text).not.toMatch(/seconds/);
  });

  it("round-trips every combination without a token left unfilled", () => {
    for (const kind of KINDS) {
      for (const objective of OBJECTIVES) {
        const text = scriptToPlainText(generateScript(input({ kind, objective }, WORKSHOP), mulberry32(88)));
        expect(text).not.toMatch(/\{\w+\}|undefined/);
        expect(text).not.toMatch(/\bAI\b|artificial intelligence/i);
      }
    }
  });
});

describe("the two demo shops", () => {
  it("write a usable script for every product in the shipped packs", () => {
    for (const code of DEMO_BRAND_CODES) {
      const pack = getDemoBrandPack(code);
      for (const product of pack.products) {
        for (const objective of OBJECTIVES) {
          const script = generateScript(
            {
              brandName: pack.brand.name,
              productName: product.name,
              category: product.category,
              price: product.price,
              objective,
              kind: "reel",
              seconds: 7,
              notes: objective === "discount" ? "30% off this week" : "",
            },
            mulberry32(product.name.length),
          );
          const label = `${code} ${product.name} / ${objective}`;
          const copy = copyOf(script);
          expect(copy, label).toContain(product.name);
          expect(copy, label).toContain(pack.brand.name);
          expect(script.shots.reduce((sum, shot) => sum + shot.duration, 0), label).toBe(7);
          expect(script.caption.length, label).toBeLessThanOrEqual(220);
          if (objective !== "discount") expect(copy, label).not.toMatch(PRICE_LANGUAGE);
        }
      }
    }
  });

  it("keeps furniture copy in British English", () => {
    const american = /color|flavor|organize|favorite|center|labeled|realize|traveling/i;
    let british = 0;
    for (const kind of KINDS) {
      for (const objective of OBJECTIVES) {
        for (const seed of [4, 17, 29, 64]) {
          const copy = copyOf(generateScript(input({ kind, objective }, WORKSHOP), mulberry32(seed)));
          expect(copy, `${kind}/${objective} seed ${seed}`).not.toMatch(american);
          if (/colour|centre|favourite|behaviour|unposed|lit best/.test(copy)) british++;
        }
      }
    }
    expect(british).toBeGreaterThan(0);
  });
});
