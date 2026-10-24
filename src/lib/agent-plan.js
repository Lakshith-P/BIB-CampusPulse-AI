import { z } from "zod";

import { cleanRole } from "@/lib/career-tracks";

// Shared shape and memory rules for the placement and academic agents. A plan is a list of phases
// holding checkable items. Re-running an agent never repeats a finished or earlier step: finished
// items are dropped, unfinished ones are carried over, and only new steps are added.

export const ITEM_TYPES = ["learn", "practice", "project", "certification", "interview", "review"];

const tokens = (text) =>
  new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );

export function itemId(text) {
  let hash = 5381;
  for (const ch of [...tokens(text)].sort().join(" "))
    hash = ((hash << 5) + hash + ch.charCodeAt(0)) >>> 0;
  return `i${hash.toString(36)}`;
}

/** True when two step descriptions are, for practical purposes, the same step. */
export function sameStep(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const word of ta) if (tb.has(word)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.8;
}

const itemSchema = z.object({
  text: z.string().trim().min(8).max(400),
  type: z.enum(ITEM_TYPES).catch("learn"),
  resource: z.string().trim().max(200).optional().catch(undefined),
  sourceId: z.string().trim().max(10).optional().catch(undefined),
});
const phaseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  weeks: z.string().trim().max(40).catch(""),
  goal: z.string().trim().max(300).catch(""),
  items: z.array(itemSchema).min(1).max(8),
});

export const placementPlanSchema = z.object({
  summary: z.string().trim().min(20).max(900),
  requirements: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        why: z.string().trim().max(300).catch(""),
        sourceId: z.string().trim().max(10).optional().catch(undefined),
      }),
    )
    .min(3)
    .max(12),
  certifications: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        note: z.string().trim().max(200).catch(""),
      }),
    )
    .max(6)
    .catch([]),
  phases: z.array(phaseSchema).min(2).max(6),
  checkpoint: z.string().trim().max(300).catch(""),
});

export const academicPlanSchema = z.object({
  summary: z.string().trim().min(20).max(900),
  focus: z
    .array(
      z.object({
        subject: z.string().trim().min(1).max(80),
        why: z.string().trim().min(5).max(300),
      }),
    )
    .max(6)
    .catch([]),
  phases: z.array(phaseSchema).min(2).max(5),
  checkpoint: z.string().trim().max(300).catch(""),
});

/** Pulls the first JSON object out of a model reply (models often wrap it in prose or fences). */
export function parseJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return a plan.");
  return JSON.parse(text.slice(start, end + 1));
}

/** Gives every item a stable id and a not-done state. */
export function withIds(phases) {
  return phases.map((phase, p) => ({
    ...phase,
    id: `p${p + 1}`,
    items: phase.items.map((item) => ({ ...item, id: itemId(item.text), done: false })),
  }));
}

const allItems = (plan) => (plan?.phases ?? []).flatMap((phase) => phase.items);

/**
 * Applies the previous plan's memory to a freshly produced one: completed steps are never shown
 * again, unfinished ones are kept (and marked as carried over), and new steps are the only
 * additions. Returns the merged phases and a short account of what happened.
 */
export function applyMemory(phases, previous) {
  if (!previous) return { phases, notes: [] };
  const before = allItems(previous);
  const finished = before.filter((item) => item.done);
  const open = before.filter((item) => !item.done);
  let dropped = 0;
  let carried = 0;

  const merged = phases
    .map((phase) => ({
      ...phase,
      items: phase.items
        .filter((item) => {
          if (finished.some((done) => sameStep(done.text, item.text))) {
            dropped++;
            return false;
          }
          return true;
        })
        .map((item) => {
          const earlier = open.find((o) => sameStep(o.text, item.text));
          if (!earlier) return item;
          carried++;
          return { ...item, id: earlier.id, carried: true };
        }),
    }))
    .filter((phase) => phase.items.length);

  // Unfinished steps the new plan forgot are kept so nothing is silently abandoned.
  const kept = open.filter(
    (o) => !merged.some((p) => p.items.some((i) => sameStep(i.text, o.text))),
  );
  if (kept.length)
    merged.unshift({
      id: "carried",
      title: "Still open from your last plan",
      weeks: "",
      goal: "Finish these before moving on.",
      items: kept.map((item) => ({ ...item, carried: true, done: false })),
    });

  const notes = [];
  if (finished.length)
    notes.push(`${finished.length} step(s) you completed last time are done and are not repeated.`);
  if (kept.length + carried)
    notes.push(`${kept.length + carried} unfinished step(s) were carried over.`);
  const added = merged.flatMap((p) => p.items).filter((i) => !i.carried).length;
  if (added) notes.push(`${added} new step(s) were added for this run.`);
  if (dropped && !finished.length) notes.push(`${dropped} repeated step(s) were removed.`);
  return { phases: merged, notes };
}

export const progressOf = (plan) => {
  const items = allItems(plan);
  return { done: items.filter((item) => item.done).length, total: items.length };
};

/** Weeks to plan for: until the expected graduation, kept between 8 and 24. */
export function planningWeeks(gradYear, now = new Date()) {
  const end = new Date(Number(gradYear) || now.getFullYear() + 1, 4, 31);
  const weeks = Math.round((end - now) / (7 * 24 * 3600 * 1000));
  return Math.min(24, Math.max(8, weeks));
}

/** Splits `weeks` across `count` phases, e.g. 12 weeks over 3 phases -> "1-4", "5-8", "9-12". */
export function weekRanges(weeks, count) {
  const size = Math.max(1, Math.ceil(weeks / count));
  return Array.from({ length: count }, (_, i) => {
    const from = i * size + 1;
    const to = Math.min(weeks, (i + 1) * size);
    return from >= to ? `Week ${from}` : `Weeks ${from}-${to}`;
  });
}

export { cleanRole };
