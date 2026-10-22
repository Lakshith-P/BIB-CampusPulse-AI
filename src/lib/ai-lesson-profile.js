// The 20-question learning-psychology assessment and the profile it produces. Shared by the
// browser (to render the questionnaire) and the server (to score it and shape the lesson).

// opt(id, label, "dimension:value[:weight]", ...) — each selected option casts weighted votes.
const opt = (id, label, ...votes) => ({
  id,
  label,
  votes: votes.map((v) => {
    const [dimension, value, weight] = v.split(":");
    return { dimension, value, weight: weight ? Number(weight) : 1 };
  }),
});

export const QUESTIONS = [
  {
    id: "q1",
    category: "Learning style",
    text: "You need to understand how a jet engine works. What would you reach for first?",
    options: [
      opt("a", "A labeled diagram or animation", "learningStyle:visual:2"),
      opt("b", "A podcast or someone explaining it aloud", "learningStyle:auditory:2"),
      opt("c", "A well-written article or book chapter", "learningStyle:reading:2"),
      opt(
        "d",
        "A model I can take apart or a simulation to play with",
        "learningStyle:kinesthetic:2",
      ),
    ],
  },
  {
    id: "q2",
    category: "Learning style",
    text: "Which classroom moments actually stuck with you over the years?",
    options: [
      opt("a", "Charts, maps and slides the teacher drew", "learningStyle:visual:2"),
      opt(
        "b",
        "Stories and explanations told out loud",
        "learningStyle:auditory:2",
        "memoryType:story",
      ),
      opt(
        "c",
        "Notes and textbook passages I read and re-read",
        "learningStyle:reading:2",
        "memoryType:repetition",
      ),
      opt("d", "Labs, experiments and hands-on projects", "learningStyle:kinesthetic:2"),
    ],
  },
  {
    id: "q3",
    category: "Learning style",
    text: "A friend gives you directions to a new place. You remember them best when…",
    options: [
      opt(
        "a",
        "I picture the route like a map in my head",
        "learningStyle:visual",
        "memoryType:association",
      ),
      opt(
        "b",
        "I repeat the directions back out loud",
        "learningStyle:auditory",
        "memoryType:repetition",
      ),
      opt(
        "c",
        "I write them down as a list of steps",
        "learningStyle:reading",
        "memoryType:structure",
      ),
      opt("d", "I just start walking — I learn the route by doing it", "learningStyle:kinesthetic"),
    ],
  },
  {
    id: "q4",
    category: "Attention span",
    text: "Honestly, how long can you stay deeply focused on studying before your mind starts to wander?",
    options: [
      opt("a", "Under 10 minutes — I need things short and punchy", "attentionSpan:low:2"),
      opt("b", "Around 20–30 minutes with small breaks", "attentionSpan:medium:2"),
      opt("c", "An hour or more once I'm in the zone", "attentionSpan:high:2"),
    ],
  },
  {
    id: "q5",
    category: "Attention span",
    text: "You open a 40-minute educational video. What usually happens?",
    options: [
      opt(
        "a",
        "I skip around or bump the speed to 2x within minutes",
        "attentionSpan:low",
        "pace:fast",
      ),
      opt("b", "I watch most of it but drift near the end", "attentionSpan:medium"),
      opt(
        "c",
        "I watch the whole thing and often look for a part two",
        "attentionSpan:high",
        "depth:deep",
      ),
    ],
  },
  {
    id: "q6",
    category: "Attention span",
    text: "Your ideal single lesson feels like…",
    options: [
      opt(
        "a",
        "An espresso shot — 3–5 minutes, straight to the point",
        "attentionSpan:low",
        "depth:overview",
      ),
      opt(
        "b",
        "A coffee break — about 10 minutes, focused but complete",
        "attentionSpan:medium",
        "depth:balanced",
      ),
      opt(
        "c",
        "A full documentary — as long as it needs to be",
        "attentionSpan:high",
        "depth:deep",
      ),
    ],
  },
  {
    id: "q7",
    category: "Pace",
    text: "When someone narrates or teaches, what speed feels right?",
    options: [
      opt("a", "Slow and deliberate — give me time to absorb each idea", "pace:slow:2"),
      opt("b", "A natural conversational speed", "pace:moderate:2"),
      opt("c", "Brisk — I get impatient when people talk slowly", "pace:fast:2"),
    ],
  },
  {
    id: "q8",
    category: "Pace",
    text: "A lesson spends five minutes on something you already understood. You…",
    options: [
      opt(
        "a",
        "Don't mind — the repetition helps it sink in",
        "pace:slow",
        "memoryType:repetition",
      ),
      opt("b", "Stay patient but wish it would move along", "pace:moderate"),
      opt("c", "Skip ahead immediately", "pace:fast", "attentionSpan:low"),
    ],
  },
  {
    id: "q9",
    category: "Knowledge level",
    text: "In the subjects you plan to learn here, where do you usually start?",
    options: [
      opt("a", "From zero — assume I know nothing", "knowledgeLevel:beginner:2"),
      opt("b", "I know the basics and want to go further", "knowledgeLevel:intermediate:2"),
      opt("c", "I'm experienced — skip the fundamentals", "knowledgeLevel:advanced:2"),
    ],
  },
  {
    id: "q10",
    category: "Knowledge level",
    text: "How do you feel about technical terminology and jargon?",
    options: [
      opt(
        "a",
        "Avoid it — everyday words work better for me",
        "knowledgeLevel:beginner",
        "tone:friendly",
      ),
      opt(
        "b",
        "Use it, but define it the first time",
        "knowledgeLevel:intermediate",
        "tone:professional",
      ),
      opt(
        "c",
        "Use precise terms freely — that's what I'm here for",
        "knowledgeLevel:advanced",
        "tone:academic",
      ),
    ],
  },
  {
    id: "q11",
    category: "Tone",
    text: "Pick the teacher you'd learn best from:",
    options: [
      opt("a", "The warm mentor who cracks jokes and cheers you on", "tone:friendly:2"),
      opt("b", "The sharp professional who respects your time", "tone:professional:2"),
      opt("c", "The rigorous professor who goes deep into theory", "tone:academic:2", "depth:deep"),
    ],
  },
  {
    id: "q12",
    category: "Depth",
    text: "You have one hour with a new topic. What's the better use of it?",
    options: [
      opt("a", "A broad map of the whole territory, details later", "depth:overview:2"),
      opt("b", "Key ideas with enough detail to actually use them", "depth:balanced:2"),
      opt("c", "One core concept, understood completely", "depth:deep:2"),
    ],
  },
  {
    id: "q13",
    category: "Visual preference",
    text: "How much do images, diagrams and color matter to your understanding?",
    options: [
      opt("a", "Not much — clean text is enough", "visualPreference:low:2"),
      opt("b", "Helpful as support for the main text", "visualPreference:medium:2"),
      opt("c", "Essential — I barely absorb walls of text", "visualPreference:high:2"),
    ],
  },
  {
    id: "q14",
    category: "Visual preference",
    text: "A slide packed edge-to-edge with text appears. Your honest reaction:",
    options: [
      opt(
        "a",
        "Great — more information per slide",
        "visualPreference:low",
        "learningStyle:reading",
      ),
      opt(
        "b",
        "Fine, as long as it's well organized",
        "visualPreference:medium",
        "memoryType:structure",
      ),
      opt("c", "My eyes glaze over instantly", "visualPreference:high", "attentionSpan:low"),
    ],
  },
  {
    id: "q15",
    category: "Examples",
    text: "When do abstract concepts finally click for you?",
    options: [
      opt("a", "When the definition itself is precise enough", "examplePreference:low:2"),
      opt("b", "After one solid real-world example", "examplePreference:medium:2"),
      opt(
        "c",
        "After several examples and comparisons to things I know",
        "examplePreference:high:2",
        "memoryType:association",
      ),
    ],
  },
  {
    id: "q16",
    category: "Examples",
    text: '"RAM is like a kitchen counter — bigger counter, more dishes at once." Analogies like this are…',
    options: [
      opt(
        "a",
        "Distracting — just tell me what RAM actually does",
        "examplePreference:low",
        "knowledgeLevel:advanced",
      ),
      opt("b", "A nice bonus when the idea is tricky", "examplePreference:medium"),
      opt("c", "Exactly how my brain works", "examplePreference:high", "memoryType:association"),
    ],
  },
  {
    id: "q17",
    category: "Motivation",
    text: "What's really driving you to learn right now?",
    options: [
      opt("a", "Pure curiosity — I love understanding things", "motivation:curiosity:2"),
      opt("b", "Career growth — skills that pay off at work", "motivation:career:2"),
      opt(
        "c",
        "An exam or certification I need to pass",
        "motivation:exam:2",
        "revisionFrequency:high",
      ),
      opt("d", "A personal hobby or project", "motivation:hobby:2"),
    ],
  },
  {
    id: "q18",
    category: "Memory",
    text: "A month from now, which version of today's lesson would you still remember?",
    options: [
      opt("a", "The one told as a story with characters and stakes", "memoryType:story:2"),
      opt(
        "b",
        "The one I reviewed three times with flashcards",
        "memoryType:repetition:2",
        "revisionFrequency:high",
      ),
      opt("c", "The one linked to things I already knew", "memoryType:association:2"),
      opt("d", "The one laid out as a clean numbered framework", "memoryType:structure:2"),
    ],
  },
  {
    id: "q19",
    category: "Revision",
    text: "After finishing a lesson, how often do you actually come back to review it?",
    options: [
      opt("a", "Rarely — once through is usually it", "revisionFrequency:low:2"),
      opt("b", "Sometimes, when the topic is important", "revisionFrequency:medium:2"),
      opt("c", "Regularly — spaced review is part of my routine", "revisionFrequency:high:2"),
    ],
  },
  {
    id: "q20",
    category: "Confidence",
    text: "Facing a genuinely hard topic alone, how do you feel?",
    options: [
      opt(
        "a",
        "Intimidated — I need lots of encouragement and small wins",
        "confidence:low:2",
        "tone:friendly",
      ),
      opt("b", "Cautious but capable with a clear path", "confidence:medium:2"),
      opt("c", "Energized — hard problems are the fun ones", "confidence:high:2", "depth:deep"),
    ],
  },
];

const DEFAULT_TRAITS = {
  learningStyle: "visual",
  attentionSpan: "medium",
  pace: "moderate",
  knowledgeLevel: "beginner",
  tone: "friendly",
  depth: "balanced",
  visualPreference: "medium",
  examplePreference: "medium",
  motivation: "curiosity",
  memoryType: "structure",
  confidence: "medium",
  revisionFrequency: "medium",
};

/**
 * Tallies the weighted votes of every selected option and picks the dominant value per
 * dimension. Several options may be chosen per question, so mixed preferences blend. Ties go
 * to the value voted on most recently, which favours the later, more specific questions.
 */
export function buildLearnerProfile(answers) {
  if (!Array.isArray(answers) || answers.length !== QUESTIONS.length)
    throw new Error(`Answer all ${QUESTIONS.length} questions.`);
  const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
  const tally = {};
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question) throw new Error("Unknown question in the answers.");
    if (!answer.optionIds?.length)
      throw new Error("Choose at least one option for every question.");
    for (const optionId of new Set(answer.optionIds)) {
      const option = question.options.find((o) => o.id === optionId);
      if (!option) throw new Error("Unknown option in the answers.");
      for (const { dimension, value, weight } of option.votes) {
        tally[dimension] ??= new Map();
        tally[dimension].set(value, (tally[dimension].get(value) ?? 0) + weight);
      }
    }
  }
  const traits = { ...DEFAULT_TRAITS };
  for (const [dimension, counts] of Object.entries(tally)) {
    let best = "";
    let bestScore = -1;
    for (const [value, score] of counts)
      if (score >= bestScore) {
        best = value;
        bestScore = score;
      }
    traits[dimension] = best;
  }
  return traits;
}

const LABELS = {
  learningStyle: {
    visual: "Visual",
    auditory: "Auditory",
    reading: "Reading / writing",
    kinesthetic: "Hands-on",
  },
  attentionSpan: { low: "Short bursts", medium: "Steady focus", high: "Long focus" },
  pace: { slow: "Slow and deliberate", moderate: "Conversational pace", fast: "Brisk" },
  knowledgeLevel: {
    beginner: "Starting fresh",
    intermediate: "Knows the basics",
    advanced: "Experienced",
  },
  tone: {
    friendly: "Warm mentor",
    professional: "Sharp professional",
    academic: "Rigorous professor",
  },
  depth: { overview: "Big picture", balanced: "Balanced", deep: "Deep dive" },
  memoryType: {
    story: "Stories",
    repetition: "Repetition",
    association: "Associations",
    structure: "Frameworks",
  },
  motivation: { curiosity: "Curiosity", career: "Career", exam: "Exams", hobby: "Hobby" },
};

/** Short, human summary chips for the profile card. */
export function describeProfile(traits) {
  return Object.keys(LABELS)
    .map((k) => LABELS[k][traits[k]])
    .filter(Boolean);
}

/**
 * Turns traits into the concrete knobs the prompt and the player read, so the same topic
 * genuinely comes out differently for different learners.
 */
export function deriveGenerationParams(traits, { detailLevel = "standard", durationMin } = {}) {
  let slideCount = traits.attentionSpan === "low" ? 5 : traits.attentionSpan === "medium" ? 6 : 8;
  if (traits.depth === "deep") slideCount += 1;
  if (traits.depth === "overview") slideCount -= 1;
  slideCount = Math.min(10, Math.max(4, slideCount));

  let maxPointsPerSlide =
    traits.attentionSpan === "low" ? 4 : traits.attentionSpan === "medium" ? 5 : 6;
  if (traits.learningStyle === "reading") maxPointsPerSlide = Math.min(7, maxPointsPerSlide + 1);
  if (traits.visualPreference === "high") maxPointsPerSlide = Math.max(4, maxPointsPerSlide - 1);

  let scriptWordsPerSlide =
    traits.attentionSpan === "low" ? 60 : traits.attentionSpan === "medium" ? 90 : 110;
  if (traits.depth === "deep") scriptWordsPerSlide += 20;
  if (traits.depth === "overview") scriptWordsPerSlide -= 15;
  if (detailLevel === "detailed") scriptWordsPerSlide = Math.round(scriptWordsPerSlide * 1.2);
  if (detailLevel === "quick") scriptWordsPerSlide = Math.round(scriptWordsPerSlide * 0.8);

  const ttsSpeed = traits.pace === "slow" ? 0.9 : traits.pace === "fast" ? 1.1 : 1;

  // A chosen length is hit by slide count: models write ~100 words per slide reliably.
  if (durationMin) {
    const totalWords = Math.round(Math.min(12, Math.max(2, durationMin)) * 150 * ttsSpeed);
    slideCount = Math.min(12, Math.max(4, Math.round(totalWords / 100)));
    scriptWordsPerSlide = Math.min(180, Math.max(60, Math.round(totalWords / slideCount)));
  }

  const quizCount = Math.min(
    16,
    Math.max(6, Math.round(slideCount * (traits.revisionFrequency === "high" ? 2 : 1.5))),
  );

  const terminology =
    traits.knowledgeLevel === "beginner"
      ? "Use plain everyday language. Introduce at most one technical term per slide and immediately explain it in simple words."
      : traits.knowledgeLevel === "intermediate"
        ? "Use standard terminology but briefly define specialised terms on first use."
        : "Use precise technical terminology freely; do not water down concepts or over-explain fundamentals.";

  const analogyRule =
    traits.examplePreference === "high"
      ? "Every key concept must include a vivid real-world analogy or example tied to daily life."
      : traits.examplePreference === "medium"
        ? "Include a concrete example for the harder concepts only."
        : "Prefer precise definitions over analogies; use an example only when strictly necessary.";

  const narrationStyle = [
    traits.tone === "friendly"
      ? "Narration is warm and conversational, like a supportive mentor speaking directly to the learner."
      : traits.tone === "professional"
        ? "Narration is crisp, confident and efficient, like a top-tier industry instructor."
        : "Narration is measured and rigorous, like a university lecture, with careful logical progression.",
    traits.pace === "slow"
      ? "Use short sentences with natural pauses; repeat the key idea of each slide once in different words."
      : traits.pace === "fast"
        ? "Keep momentum high; no filler phrases, no recaps of what was just said."
        : "Maintain a steady, natural rhythm.",
    traits.memoryType === "story"
      ? "Weave the explanation into a light narrative thread that continues across slides."
      : traits.memoryType === "repetition"
        ? "End each slide's narration by restating its single most important takeaway."
        : traits.memoryType === "association"
          ? "Anchor new ideas to familiar concepts the learner likely already knows."
          : "Signal structure verbally: first, second, the key point here, and so on.",
  ].join(" ");

  const structureRule =
    traits.memoryType === "structure"
      ? "Organise slides as a clear numbered progression where each slide builds on the previous one."
      : traits.memoryType === "story"
        ? "Open with a hook slide framing a real problem, and resolve that problem by the final slide."
        : "Order slides from most familiar ideas to least familiar.";

  const encouragement =
    traits.confidence === "low"
      ? "Sprinkle brief encouraging remarks into the narration (never condescending), and frame mistakes as normal."
      : "Do not add motivational filler; let the material speak for itself.";

  const deliveryStyle = [
    "Write the script the way a real teacher TALKS out loud at a whiteboard, not the way an article is written.",
    "Use contractions (it's, you'll, let's), address the learner directly as 'you', and open the very first slide with a hook: a question, a surprising fact, or a tiny story.",
    "Use real teacher moves: ask a rhetorical question and answer it yourself, think aloud, flag the good bits, call back to earlier slides by name, and occasionally restate a hard idea in totally different words.",
    "Vary the rhythm like real speech. Never open two slides with the same phrase, and never sound like you're reading a list.",
    traits.memoryType === "story"
      ? "Carry a single running story or scenario across all slides so it feels like one continuous tale."
      : "Connect each slide to the previous one with a spoken transition.",
    "Use commas and ellipses (...) where a speaker would breathe. Never use markdown, bullet symbols, headings, stage directions, or emoji in the script.",
  ].join(" ");

  const preferredDiagram =
    traits.memoryType === "story"
      ? "flow"
      : traits.memoryType === "structure"
        ? "hierarchy"
        : traits.examplePreference === "high"
          ? "compare"
          : "cycle";

  const boardNotesRule =
    detailLevel === "detailed"
      ? 'Every slide\'s "board.notes" must contain 3-5 written explanation lines (each up to 18 words) that actually teach: a real definition, the "why", a cause-and-effect link or a worked micro-example. Never a restatement of the title.'
      : detailLevel === "quick"
        ? 'Keep "board.notes" tight but substantive: 1-2 lines per slide (up to 14 words), each a real definition or fact.'
        : 'Every slide needs 2-3 "board.notes": written lines (up to 16 words each) that genuinely explain or define the key terms.';

  const explanationRule =
    detailLevel === "detailed"
      ? "Explain the WHY and HOW behind every concept, with one worked example per major concept, step by step."
      : detailLevel === "quick"
        ? "Keep explanations tight and high-level, but still say WHY each idea matters in one sentence."
        : "For every key idea explain not just what it is but why it matters, with at least one concrete example or consequence.";

  const boardGuidance = [
    traits.learningStyle === "visual" || traits.visualPreference === "high"
      ? "This learner is highly visual, so almost every slide's board should include a simple diagram."
      : traits.learningStyle === "kinesthetic"
        ? "This learner learns by doing, so frame boards as steps or a process they could follow along with."
        : traits.learningStyle === "reading"
          ? "This learner likes text, so lean on precise key terms; add a diagram only when it clarifies."
          : "Balance a few key terms with a diagram when the concept is a process or relationship.",
    `Prefer a "${preferredDiagram}" diagram when one fits, but choose the type that matches the concept ("flow", "cycle", "compare", "list", "timeline", "hierarchy") and vary it across the lesson.`,
    "keyTerms are the 2-5 short words the narrator 'writes' on the board as they say them, each under 6 words.",
  ].join(" ");

  return {
    slideCount,
    maxPointsPerSlide,
    scriptWordsPerSlide,
    quizCount,
    ttsSpeed,
    terminology,
    analogyRule,
    narrationStyle,
    structureRule,
    encouragement,
    deliveryStyle,
    boardGuidance,
    preferredDiagram,
    boardNotesRule,
    explanationRule,
  };
}
