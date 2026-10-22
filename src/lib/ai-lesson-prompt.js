import { z } from "zod";
import { deriveGenerationParams } from "@/lib/ai-lesson-profile";

// What the model must return. Anything else is rejected and retried once.
export const lessonSchema = z.object({
  title: z.string().min(3).max(140),
  summary: z.string().min(20).max(1500),
  slides: z
    .array(
      z.object({
        title: z.string().min(2).max(140),
        points: z.array(z.string().min(2).max(260)).min(2).max(8),
        script: z.string().min(30).max(3000),
        board: z
          .object({
            keyTerms: z.array(z.string().min(1).max(60)).max(6).optional(),
            notes: z.array(z.string().min(2).max(200)).max(6).optional(),
            diagram: z
              .object({
                type: z.enum(["flow", "cycle", "compare", "list", "timeline", "hierarchy", "none"]),
                nodes: z.array(z.string().min(1).max(60)).max(7).default([]),
              })
              .optional(),
          })
          .optional(),
      }),
    )
    .min(3)
    .max(14),
  quiz: z
    .array(
      z.object({
        question: z.string().min(5).max(320),
        options: z.array(z.string().min(1).max(180)).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().min(5).max(600),
      }),
    )
    .min(4)
    .max(20),
});

const STYLE = {
  visual:
    "a VISUAL learner: they think in images. Boards should be diagram-forward with minimal text.",
  auditory:
    "an AUDITORY learner: they absorb through listening. The narration is the primary channel, so make it rich and self-contained; the board is just an anchor.",
  reading:
    "a READING/WRITING learner: they learn from well-structured text. Boards may carry fuller, precise sentences.",
  kinesthetic:
    "a KINESTHETIC learner: they learn by doing. Frame concepts as actions, mini-exercises and 'try this' moments.",
};

/** The profile-adaptive generation prompt: the same topic reads differently for each learner. */
export function buildLessonPrompt({
  subject,
  unitTitle,
  unitTopics,
  topic,
  focus,
  traits,
  options,
}) {
  const params = deriveGenerationParams(traits, options);
  const syllabus =
    unitTitle || unitTopics
      ? `\nThis topic belongs to the course unit "${unitTitle || "unit"}"${unitTopics ? ` whose syllabus covers: ${unitTopics}` : ""}. Stay inside what a university course unit would cover.`
      : "";
  const prompt = `You are an expert instructional designer who adapts lessons to the psychology of each individual learner.

## THE LEARNER
This lesson is for ${STYLE[traits.learningStyle] ?? STYLE.visual}
- Attention span: ${traits.attentionSpan}
- Preferred pace: ${traits.pace}
- Knowledge level in this area: ${traits.knowledgeLevel}
- Preferred tone: ${traits.tone}
- Desired depth: ${traits.depth}
- Motivation for learning: ${traits.motivation}
- Memory strategy that works for them: ${traits.memoryType}

## THE TASK
Write a complete lesson delivered as a VIDEO: a human-sounding narrator stands at a digital board, speaks the "script" out loud, and writes the "board" content as they go. Course subject: "${subject}". Topic: "${topic}"${focus ? `\nThe learner specifically wants to focus on: "${focus}"` : ""}${syllabus}

## HOW THE NARRATOR SHOULD SPEAK (this matters most)
${params.deliveryStyle}
${params.narrationStyle}

## HARD REQUIREMENTS
1. Produce EXACTLY ${params.slideCount} slides. Slide 1 opens with a hook; the final slide wraps up with the key takeaways.
2. Each slide's "script" is the spoken narration: roughly ${params.scriptWordsPerSlide} words (±20%), natural speech per the rules above.
3. ${params.explanationRule}
4. Each slide's "board.keyTerms" are the 2-5 short words or phrases the narrator writes on the board (each under 6 words), exactly the terms the script emphasises.
5. ${params.boardNotesRule}
6. ${params.boardGuidance}
7. When a slide's concept is a process, relationship, cycle or comparison, include "board.diagram" with a fitting "type" and 2-7 short "nodes". Use "none" only for a pure intro/outro slide.
8. Each slide has 2 to ${params.maxPointsPerSlide} "points": complete, self-contained statements the learner can revise from without the narration.
9. ${params.terminology}
10. ${params.analogyRule}
11. ${params.structureRule}
12. ${params.encouragement}
13. Include EXACTLY ${params.quizCount} quiz questions, each with exactly 4 options and one correct answer. Cover every slide, mix recall, why/how reasoning and applied scenarios, make wrong options plausible, and vary which index is correct. Each explanation says why the answer is right.
14. "summary" is a ${traits.attentionSpan === "low" ? "3-sentence" : "short-paragraph"} recap in the narrator's spoken voice.
15. ACCURACY OUTRANKS EVERY OTHER RULE. Definitions, formulas, figures and quiz answers must be factually correct. If unsure of a specific number, describe the relationship qualitatively; never invent sources or studies.

## OUTPUT FORMAT
Return ONLY a valid JSON object, no markdown fences, no commentary:
{
  "title": "<accurate lesson title>",
  "summary": "<recap in the narrator's voice>",
  "slides": [
    {
      "title": "<slide title>",
      "points": ["<standalone statement>"],
      "script": "<spoken narration>",
      "board": {
        "keyTerms": ["<term>"],
        "notes": ["<short written explanation line>"],
        "diagram": { "type": "flow", "nodes": ["<step 1>", "<step 2>"] }
      }
    }
  ],
  "quiz": [
    { "question": "<question>", "options": ["<A>", "<B>", "<C>", "<D>"], "correctIndex": 0, "explanation": "<why>" }
  ]
}`;
  return { prompt, params };
}

/** Strips markdown fences and chatter models occasionally emit despite instructions. */
export function extractJson(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in the model output.");
  return candidate.slice(start, end + 1);
}

const parseLesson = (raw) => lessonSchema.parse(JSON.parse(extractJson(raw)));

/** Fills any board field the model left out, so the player never renders an empty board. */
export function normaliseLesson(lesson) {
  return {
    ...lesson,
    slides: lesson.slides.map((s) => {
      const board = s.board ?? {};
      const diagram = board.diagram && board.diagram.nodes.length > 1 ? board.diagram : null;
      return {
        ...s,
        board: {
          keyTerms: board.keyTerms?.length
            ? board.keyTerms
            : s.points.slice(0, 3).map((p) => p.split(/\s+/).slice(0, 4).join(" ")),
          notes: board.notes ?? [],
          diagram: diagram ?? { type: "none", nodes: [] },
        },
      };
    }),
  };
}

/** Ask, validate against the schema, and repair once if the first answer is unusable. */
export async function generateLesson(callModel, input) {
  const { prompt, params } = buildLessonPrompt(input);
  const first = await callModel(prompt);
  try {
    return { lesson: normaliseLesson(parseLesson(first)), params };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const retry = await callModel(
      `${prompt}\n\nYour previous response failed validation:\n${reason.slice(0, 1200)}\n\nPrevious response (possibly truncated):\n${first.slice(0, 3000)}\n\nRegenerate the FULL response as ONLY a valid JSON object matching the required structure.`,
    );
    try {
      return { lesson: normaliseLesson(parseLesson(retry)), params };
    } catch {
      throw new Error("The lesson generator returned an unusable lesson. Please try again.");
    }
  }
}
