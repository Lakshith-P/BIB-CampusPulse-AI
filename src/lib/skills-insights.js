// Turns a student's assessment history into what the Skills page shows: score per skill, topic
// averages, weak areas and practice suggestions. All of it comes from the recorded scores.

export const SKILLS = ["coding", "aptitude", "analytical", "verbal", "communication"];
export const WEAK_BELOW = 50;

const PRACTICE = {
  coding: "Solve 3 problems a week on this topic, then re-take a short test.",
  aptitude: "Do a 20-minute timed practice set twice a week.",
  analytical: "Work through logic and data-interpretation puzzles, with a weekly test.",
  verbal: "Read one article daily and note 5 new words; practise comprehension sets.",
  communication: "Record a 2-minute talk weekly and review it with your mentor.",
};

const mean = (v) => (v.length ? v.reduce((a, c) => a + c, 0) / v.length : null);

export function summarizeSkills(history) {
  const byCategory = {};
  for (const skill of SKILLS) {
    const rows = history.filter((h) => h.category === skill);
    const scores = rows.map((r) => r.score);
    const last3 = scores.slice(-3);
    const prev3 = scores.slice(-6, -3);
    byCategory[skill] = {
      count: rows.length,
      latest: scores.at(-1) ?? null,
      current: mean(last3),
      trend: prev3.length && last3.length ? mean(last3) - mean(prev3) : null,
      series: rows.map((r) => ({ date: r.taken_on, score: r.score, topic: r.topic })),
    };
  }
  const groups = new Map();
  for (const h of history) {
    const topic = h.topic.trim() || "General";
    const key = `${h.category}|${topic}`;
    groups.set(key, [...(groups.get(key) ?? []), h.score]);
  }
  const topics = [...groups.entries()]
    .map(([key, scores]) => {
      const [category, topic] = key.split("|");
      return { category, topic, avg: mean(scores), count: scores.length };
    })
    .sort((a, b) => a.avg - b.avg);
  const weak = topics.filter((t) => t.avg < WEAK_BELOW);
  const recommendations = weak.map(
    (t) => `${cap(t.category)}: ${t.topic} averages ${Math.round(t.avg)}. ${PRACTICE[t.category]}`,
  );
  for (const skill of SKILLS)
    if (byCategory[skill].count === 0)
      recommendations.push(
        `${cap(skill)}: no assessment recorded yet. Ask your teacher to schedule one.`,
      );
  return { byCategory, topics, weak, recommendations };
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
