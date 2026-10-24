// Selection rounds of a placement drive. `rounds` is the ordered list of round names and
// `results` maps a round name to "passed" or "failed"; a round with no result is still to come.

/** Where an application stands, worked out from its rounds; a drive with no rounds keeps its own status. */
export function statusFromRounds(rounds, results) {
  if (!rounds.length) return null;
  if (rounds.some((r) => results[r] === "failed")) return "rejected";
  const passed = rounds.filter((r) => results[r] === "passed").length;
  if (passed === rounds.length) return "selected";
  return passed > 0 ? "shortlisted" : "applied";
}

/** Each round with its state: passed, failed, current (the next one to take) or upcoming. */
export function roundStates(rounds, results) {
  let currentFound = false;
  const failed = rounds.some((r) => results[r] === "failed");
  return rounds.map((name) => {
    const result = results[name];
    if (result === "passed" || result === "failed") return { name, state: result };
    if (!failed && !currentFound) {
      currentFound = true;
      return { name, state: "current" };
    }
    return { name, state: "upcoming" };
  });
}

/** The round the student is in now, or null when there is none (finished, out, or no rounds). */
export const currentRound = (rounds, results) =>
  roundStates(rounds, results).find((r) => r.state === "current")?.name ?? null;

/** Round names typed as "Aptitude, Technical interview, HR": trimmed, no blanks or repeats. */
export function parseRounds(text) {
  const seen = new Set();
  return String(text ?? "")
    .split(/[,\n]/)
    .map((r) => r.trim())
    .filter((r) => {
      const key = r.toLowerCase();
      if (!r || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
