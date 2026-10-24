import { planningWeeks, sameStep, weekRanges } from "@/lib/agent-plan";

// Deterministic plan builders. They are used when no language model is configured or the model's
// answer is unusable, so the agents always produce a plan from real data: the live roadmap for
// the role and the student's own numbers.

const join = (list, max = 5) => list.slice(0, max).join(", ");

export function careerSnapshot(student, gaps) {
  return {
    skills: Object.fromEntries(gaps.filter((g) => g.value !== null).map((g) => [g.skill, g.value])),
    resume: student.resumeCompleteness >= 0 ? student.resumeCompleteness : null,
    mockInterviews: student.mockInterviews >= 0 ? student.mockInterviews : null,
    verifiedActivities: (student.engagement ?? []).filter((a) => a.verified).length,
  };
}

export function careerChanges(before, after) {
  if (!before) return [];
  const out = [];
  for (const [skill, value] of Object.entries(after.skills)) {
    const prev = before.skills?.[skill];
    if (typeof prev === "number" && prev !== value)
      out.push(`${skill} moved from ${prev} to ${value}.`);
    if (prev === undefined) out.push(`${skill} has now been assessed at ${value}.`);
  }
  if (before.resume !== after.resume && after.resume !== null)
    out.push(`Resume completeness is now ${after.resume}%.`);
  if (before.mockInterviews !== after.mockInterviews && after.mockInterviews !== null)
    out.push(`Mock interviews completed: ${after.mockInterviews}.`);
  if (after.verifiedActivities > (before.verifiedActivities ?? 0))
    out.push(
      `${after.verifiedActivities - before.verifiedActivities} more activity(ies) verified.`,
    );
  return out;
}

export function buildCareerPlanFallback({ role, research, student, gaps, finished = [] }) {
  const weeks = planningWeeks(student.gradYear);
  const roadmap = research.sources.find((source) => source.kind === "roadmap");
  const learnText = (stage) =>
    `${/^learn/i.test(stage.name) ? "" : "Learn "}${stage.name}: ${join(stage.items) || "the core concepts"}.`;
  // Stages already finished are skipped so that each run moves further along the roadmap.
  const stages = (roadmap?.stages ?? []).filter(
    (stage) => !finished.some((text) => sameStep(text, learnText(stage))),
  );
  const source = roadmap?.id;
  const ENTRY = /(security\+|a\+|network\+|linux\+|ccna|ceh|cka)/i;
  const certs = [...(roadmap?.certifications ?? [])]
    .sort((a, b) => Number(ENTRY.test(b)) - Number(ENTRY.test(a)))
    .slice(0, 4);

  const prep = gaps
    .filter((gap) => gap.status !== "met")
    .slice(0, 3)
    .map((gap) =>
      gap.status === "not assessed"
        ? {
            text: `Ask your teacher to assess your ${gap.skill} skill; ${role} roles look for about ${gap.needed}/100 and it has no recorded score yet.`,
            type: "review",
          }
        : {
            text: `Raise ${gap.skill} from ${gap.value} to about ${gap.needed}/100, which ${role} roles look for: do three timed ${gap.skill} practice sets a week and get re-assessed in 4 weeks.`,
            type: "practice",
          },
    );

  // At most three stages per phase and five phases, so a long roadmap is worked through over several runs.
  const window = stages.slice(0, 15);
  const learn = Array.from({ length: Math.ceil(window.length / 3) }, (_, g) =>
    window.slice(g * 3, g * 3 + 3),
  );
  const phases = learn.map((group, g) => ({
    title: group.map((s) => s.name).join(" + "),
    goal: `Cover ${join(
      group.map((s) => s.name),
      3,
    )} from the published ${role} roadmap.`,
    items: [
      ...group.map((stage) => ({
        text: learnText(stage),
        type: "learn",
        sourceId: source,
      })),
      ...group
        .filter((s) => s.items.length >= 2)
        .map((stage) => ({
          text: `Hands-on: finish one exercise on ${stage.items[0]} and one on ${stage.items[1]}, and write what you learned in two lines.`,
          type: "practice",
        })),
      {
        text: `Build a small ${role} mini-project that uses ${join(
          group.map((s) => s.name),
          2,
        )}, and publish it with a README.`,
        type: "project",
      },
      ...(g === 0 ? prep : []),
    ],
  }));

  if (!phases.length)
    phases.push({
      title: `Understand the ${role} path`,
      goal: "No published roadmap exists for this role, so start by learning how employers describe it.",
      items: [
        {
          text: `Read three current ${role} job postings and list the skills and tools each one asks for.`,
          type: "learn",
        },
        {
          text: `Choose the five most repeated skills from those postings and learn the first one this week.`,
          type: "learn",
        },
        {
          text: `Build one small project that demonstrates a skill from your list and publish it.`,
          type: "project",
        },
        ...prep,
      ],
    });

  phases.push({
    title: "Get job-ready",
    goal: `Turn what you built into interview-ready evidence for ${role}.`,
    items: [
      ...certs.slice(0, 2).map((cert) => ({
        text: `Plan the ${cert} certification: read its exam objectives and book a date.`,
        type: "certification",
        sourceId: source,
      })),
      {
        text: `Rewrite your resume headline and projects section for a ${role} role, with one measurable result per project.`,
        type: "review",
      },
      {
        text:
          student.mockInterviews >= 3
            ? `Repeat the weakest mock interview type; you have completed ${student.mockInterviews}.`
            : `Complete ${student.mockInterviews >= 0 ? 3 - student.mockInterviews : 3} mock interview(s) and write down one improvement from each.`,
        type: "interview",
      },
      {
        text: `Ask a teacher to verify your finished project or certificate so it counts as verified evidence.`,
        type: "review",
      },
    ],
  });

  const ranges = weekRanges(weeks, phases.length);
  phases.forEach((phase, i) => (phase.weeks = ranges[i]));
  return {
    summary: `A ${weeks}-week roadmap for ${role}, built from ${stages.length ? `the published ${role} roadmap (${stages.length} stages)` : "general job-posting research"} and your own skill record. ${prep.length ? `${prep.length} gap(s) in your current skills are addressed first.` : "Your assessed skills meet the typical bar, so the plan focuses on depth and evidence."}`,
    requirements: stages.slice(0, 8).map((stage) => ({
      name: stage.name,
      why: `Stage of the published ${role} roadmap: ${join(stage.items, 4)}.`,
      sourceId: source,
    })),
    certifications: certs.map((name) => ({ name, note: "Listed on the published roadmap." })),
    phases,
    checkpoint:
      "Re-run the agent after your next skill assessment or when you finish a phase; completed steps will not be repeated.",
  };
}

export function buildAcademicPlanFallback(analysis) {
  const { weakest, lowAttendance, subjects, projection, targetPlan, backlogs, latestSgpa } =
    analysis;
  const failing = subjects.filter((s) => s.band === "failing");
  const weak = subjects.filter((s) => s.band === "weak");
  const stabilise = [
    ...failing.map((s) => ({
      text: `Prioritise ${s.subject} (marks ${s.marks}, below the pass mark of 40): book a doubt session with the subject teacher this week and revise three units before the next test.`,
      type: "learn",
    })),
    ...lowAttendance.slice(0, 3).map((s) => ({
      text: `Attend the next ${s.classesToReach75} class(es) of ${s.subject} to bring attendance from ${s.attendance}% to 75%.`,
      type: "review",
    })),
    ...(backlogs > 0
      ? [
          {
            text: `Plan clearance of your ${backlogs} backlog(s): list the papers, the next exam dates and one revision slot per week for each.`,
            type: "learn",
          },
        ]
      : []),
  ];
  const build = [
    ...weak.map((s) => ({
      text: `Lift ${s.subject} from ${s.marks} to at least 55: two problem sets a week and one faculty doubt session.`,
      type: "practice",
    })),
    ...(targetPlan
      ? [
          {
            text: `Set a target of CGPA ${targetPlan.target}: you need an average SGPA of ${targetPlan.requiredAverageSgpa} over the next ${targetPlan.remainingSemesters} semester(s)${targetPlan.comparedWithLatest !== null ? `, which is ${Math.abs(targetPlan.comparedWithLatest)} ${targetPlan.comparedWithLatest > 0 ? "above" : "below"} your latest ${latestSgpa}` : ""}.`,
            type: "review",
          },
        ]
      : []),
    ...(analysis.strongest.length
      ? [
          {
            text: `Use your strongest subject${analysis.strongest.length > 1 ? "s" : ""} (${join(analysis.strongest.map((s) => `${s.subject} ${s.marks}`))}) to keep your average up while you work on the weaker ones.`,
            type: "review",
          },
        ]
      : []),
  ];
  const review = [
    {
      text: `After your next results, compare your SGPA with the projection${projection ? ` (${projection.low}-${projection.high}, centred on ${projection.nextSgpa})` : ""} and re-run this agent.`,
      type: "review",
    },
    { text: "Ask your mentor to review this plan and agree one checkpoint date.", type: "review" },
  ];
  const phases = [
    stabilise.length && {
      title: "Stabilise",
      goal: "Remove the biggest risks first: failing subjects, attendance below 75% and backlogs.",
      items: stabilise,
    },
    build.length && {
      title: "Build",
      goal: "Raise weak subjects and aim at a CGPA target.",
      items: build,
    },
    { title: "Review", goal: "Check progress against the projection.", items: review },
  ].filter(Boolean);
  const ranges = weekRanges(12, phases.length);
  phases.forEach((phase, i) => (phase.weeks = ranges[i]));

  const outlook = projection
    ? `Your SGPA trend is ${projection.direction} (${projection.perSemester >= 0 ? "+" : ""}${projection.perSemester} per semester); if it continues, the next SGPA lands around ${projection.nextSgpa} (${projection.low}-${projection.high})${projection.projectedCgpa ? " and CGPA about " + projection.projectedCgpa : ""}.`
    : "There are not yet two semester grades to project a trend.";
  return {
    summary:
      `${outlook} ${failing.length ? `${failing.length} subject(s) are below the pass mark.` : ""} ${lowAttendance.length ? `${lowAttendance.length} subject(s) are below 75% attendance.` : ""}`.trim(),
    focus: weakest.slice(0, 3).map((s) => ({
      subject: s.subject,
      why: `Lowest recorded marks: ${s.marks}${s.attendance !== null ? ` with ${s.attendance}% attendance` : ""}.`,
    })),
    phases,
    checkpoint:
      "Re-run after your next marks or attendance update; finished steps will not be repeated.",
  };
}
