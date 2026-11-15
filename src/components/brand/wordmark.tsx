import { cn } from "@/lib/cn";

const WAVE_STAGGER = 0.11;
const FOOTER_STAGGER = 0.16;

function Letters({
  word,
  offset,
  crest,
  stagger,
}: {
  word: string;
  offset: number;
  crest: boolean;
  stagger: number;
}) {
  return Array.from(word).map((letter, index) => (
    <span
      key={`${offset}-${index}`}
      className={cn("ch", crest && "ch-crest")}
      style={{ animationDelay: `${(offset + index) * stagger}s` }}
      aria-hidden
    >
      {letter === " " ? "\u00A0" : letter}
    </span>
  ));
}

/**
 * The waving wordmark. Each letter runs the same wave keyframe on an index
 * delay, and the crest half brightens leaf to white in phase. `tone="footer"`
 * repeats it at the scale that sinks through the bottom edge.
 */
export function Wordmark({
  lead = "Order",
  crest = "Book",
  size = 23,
  tone = "wave",
  className,
}: {
  lead?: string;
  crest?: string;
  /** Only used by the wave tone; the footer mark sizes itself from --mark-w. */
  size?: number;
  tone?: "wave" | "footer";
  className?: string;
}) {
  const stagger = tone === "footer" ? FOOTER_STAGGER : WAVE_STAGGER;
  const label = `${lead}${crest}`;

  return (
    <span
      className={cn(tone === "footer" ? "ob-foot-mark" : "ob-wave", className)}
      role="text"
      aria-label={label}
      style={
        tone === "footer" ? undefined : { fontSize: size, letterSpacing: "-0.03em" }
      }
    >
      {Letters({ word: lead, offset: 0, crest: false, stagger })}
      {Letters({ word: crest, offset: lead.length, crest: true, stagger })}
    </span>
  );
}
