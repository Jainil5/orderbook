"use client";

import { motion, useReducedMotion } from "motion/react";
import { Card } from "@/components/ui/card";
import { FEATURES } from "@/components/showcase/content";
import {
  SHOWCASE_CHILD,
  SHOWCASE_CONTAINER,
} from "@/components/showcase/motion";

/**
 * The capability grid, shared by the marketing page and the demo entry page so
 * the two surfaces tell the same story.
 */
export function FeatureGrid({
  id = "features",
  title = "Everything the counter and the back office need",
  intro,
}: {
  id?: string;
  title?: string;
  intro?: string;
}) {
  const reduceMotion = useReducedMotion();
  const reveal = { once: true, margin: "-60px" } as const;

  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <motion.h2
        variants={SHOWCASE_CHILD}
        initial={reduceMotion ? "show" : "hidden"}
        whileInView="show"
        viewport={reveal}
        className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        {title}
      </motion.h2>
      {intro ? (
        <motion.p
          variants={SHOWCASE_CHILD}
          initial={reduceMotion ? "show" : "hidden"}
          whileInView="show"
          viewport={reveal}
          className="mt-2 max-w-2xl text-sm text-[var(--ob-text-secondary)]"
        >
          {intro}
        </motion.p>
      ) : null}
      <motion.div
        variants={SHOWCASE_CONTAINER}
        initial={reduceMotion ? "show" : "hidden"}
        whileInView="show"
        viewport={reveal}
        className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {FEATURES.map((feature) => (
          <motion.div key={feature.title} variants={SHOWCASE_CHILD}>
            <Card className="flex h-full flex-col p-6 transition-shadow hover:shadow-[var(--ob-shadow-md)]">
              <span className="inline-grid size-11 place-items-center rounded-[var(--ob-radius-md)] bg-[color-mix(in_srgb,var(--ob-primary)_14%,transparent)] text-[var(--ob-primary)]">
                <feature.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ob-text-secondary)]">
                {feature.body}
              </p>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
