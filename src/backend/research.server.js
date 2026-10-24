import { cleanRole, resolveTrack } from "../lib/career-tracks.js";

// Gathers information about a career from the web for the placement agent. Sources, in order:
//  1. roadmap.sh - the published roadmap for the role (no key needed)
//  2. Tavily web search - current skills, tools and certifications (needs TAVILY_API_KEY)
//  3. Wikipedia - a neutral description of the role (no key needed)
// Results are cached for a week so the same role is not fetched on every run.

const TTL_MS = 7 * 24 * 3600 * 1000;
const HEADERS = { "User-Agent": "SLQG-agent/1.0 (+student career research)" };
const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

async function getJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: { ...HEADERS, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return response.json();
}

// Exam-style credentials; they sit in side columns of the roadmap rather than under one stage.
const CERT =
  /(certified|comptia|ccna|ccnp|ceh|cissp|cism|cisa|giac|gsec|gpen|crest|oscp|security\+|\ba\+|network\+|linux\+|\bcka\b|\bckad\b)/i;

/**
 * Stages of a roadmap.sh roadmap with the topics under each, in learning order, plus its
 * certifications. Topics sit in columns beside each stage, so each goes to the stage nearest to it
 * vertically; stages that end up with no topics are dropped.
 */
export function parseRoadmap(data, slug) {
  const nodes = data?.nodes ?? [];
  const label = (node) => String(node.data?.label ?? "").trim();
  const centre = (node) => node.position.y + (node.height ?? node.measured?.height ?? 40) / 2;
  const stages = nodes
    .filter((node) => node.type === "topic" && label(node))
    .map((topic) => ({ name: label(topic), y: centre(topic), items: [] }))
    .sort((a, b) => a.y - b.y);
  const certifications = [];
  for (const sub of nodes.filter((node) => node.type === "subtopic" && label(node))) {
    const name = label(sub);
    if (name.length >= 70) continue;
    if (CERT.test(name)) {
      if (!certifications.includes(name)) certifications.push(name);
      continue;
    }
    const y = centre(sub);
    const stage = stages.reduce(
      (best, s) => (Math.abs(s.y - y) < Math.abs(best.y - y) ? s : best),
      stages[0],
    );
    if (stage && !stage.items.includes(name)) stage.items.push(name);
  }
  return {
    title: data?.title?.page ?? slug,
    stages: stages
      .filter((s) => s.items.length)
      .map(({ name, items }) => ({ name, items: items.slice(0, 10) })),
    certifications: certifications.slice(0, 10),
    url: `https://roadmap.sh/${slug}`,
  };
}

const digestRoadmap = (roadmap) =>
  roadmap.stages.map((s, i) => `${i + 1}. ${s.name}: ${s.items.join(", ")}`).join("\n") +
  (roadmap.certifications.length ? `\nCertifications: ${roadmap.certifications.join(", ")}` : "");

async function wikipedia(fetchImpl, role) {
  const search = await getJson(
    fetchImpl,
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(role)}&format=json&srlimit=1`,
  );
  const title = search?.query?.search?.[0]?.title;
  if (!title) return null;
  const page = await getJson(
    fetchImpl,
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
  );
  return page?.extract
    ? {
        title: page.title,
        url: page.content_urls?.desktop?.page ?? "https://en.wikipedia.org",
        content: clip(page.extract, 900),
      }
    : null;
}

async function tavily(fetchImpl, key, query) {
  const body = await getJson(fetchImpl, "https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 4 }),
  });
  return (body.results ?? [])
    .filter((r) => r.url && r.content)
    .map((r) => ({
      title: String(r.title ?? r.url).slice(0, 120),
      url: r.url,
      content: clip(String(r.content), 700),
    }));
}

/** Everything the planner may use about `role`: numbered sources plus a trace of what was done. */
export async function gatherRoleResearch(role, { fetchImpl = fetch, env = process.env } = {}) {
  const name = cleanRole(role);
  const slug = resolveTrack(name);
  const sources = [];
  const trace = [];
  const add = (kind, item) => sources.push({ id: `S${sources.length + 1}`, kind, ...item });

  if (slug) {
    try {
      const roadmap = parseRoadmap(
        await getJson(fetchImpl, `https://roadmap.sh/${slug}.json`),
        slug,
      );
      if (roadmap.stages.length) {
        add("roadmap", {
          title: `${roadmap.title} roadmap (roadmap.sh)`,
          url: roadmap.url,
          content: clip(digestRoadmap(roadmap), 5000),
          stages: roadmap.stages,
          certifications: roadmap.certifications,
        });
        trace.push({
          step: "Published roadmap",
          note: `Read ${roadmap.stages.length} stages for ${roadmap.title} on roadmap.sh.`,
        });
      }
    } catch (error) {
      trace.push({ step: "Published roadmap", note: `Unavailable (${error.message}).` });
    }
  } else
    trace.push({
      step: "Published roadmap",
      note: `No published roadmap matches "${name}"; relying on search and reference sources.`,
    });

  if (env["TAVILY_API_KEY"]) {
    for (const query of [
      `${name} entry level skills tools required`,
      `${name} certifications and projects for freshers`,
    ]) {
      try {
        const found = await tavily(fetchImpl, env["TAVILY_API_KEY"], query);
        found.forEach((item) => add("web", item));
        trace.push({ step: "Web search", note: `"${query}" returned ${found.length} result(s).` });
      } catch (error) {
        trace.push({ step: "Web search", note: `"${query}" failed (${error.message}).` });
      }
    }
  } else trace.push({ step: "Web search", note: "Skipped: no TAVILY_API_KEY is configured." });

  try {
    const reference = await wikipedia(fetchImpl, name);
    if (reference) {
      add("reference", reference);
      trace.push({ step: "Reference", note: `Read the Wikipedia article "${reference.title}".` });
    }
  } catch (error) {
    trace.push({ step: "Reference", note: `Unavailable (${error.message}).` });
  }

  if (!sources.length)
    throw new Error(
      "Could not gather information online right now. Please try again in a few minutes.",
    );
  return { role: name, slug, sources, trace };
}

/** Cached wrapper around gatherRoleResearch. */
export async function researchRole(db, role, options = {}) {
  const key = cleanRole(role).toLowerCase();
  const { rows } = await db.query(
    "SELECT sources, trace, slug, fetched_at FROM agent_research_cache WHERE key = $1",
    [key],
  );
  const hit = rows[0];
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < TTL_MS)
    return {
      role: cleanRole(role),
      slug: hit.slug,
      sources: hit.sources,
      trace: [
        {
          step: "Cache",
          note: `Reused research fetched on ${new Date(hit.fetched_at).toDateString()}.`,
        },
        ...hit.trace,
      ],
      cached: true,
    };
  const fresh = await gatherRoleResearch(role, options);
  await db.query(
    `INSERT INTO agent_research_cache (key, slug, sources, trace, fetched_at) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (key) DO UPDATE SET slug = $2, sources = $3, trace = $4, fetched_at = now()`,
    [key, fresh.slug, JSON.stringify(fresh.sources), JSON.stringify(fresh.trace)],
  );
  return { ...fresh, cached: false };
}
