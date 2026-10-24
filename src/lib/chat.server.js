import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  validateUIMessages,
} from "ai";
import { createAssistant } from "@/backend/assistant.server";
import { currentUser } from "@/backend/auth.server";
import { query } from "@/backend/db.server";
import { generateWithFallback } from "@/backend/llm.server";
import { clientIp, rateLimit } from "@/backend/rate-limit.server";
import { systemPrompt } from "@/lib/assistant-prompts";
import { MODEL_DOWN_NOTE, answerFromData, visitorFallback } from "@/lib/assistant-fallback";
import { planLookups } from "@/lib/assistant-router";

// Pluto. Nobody signed in gets the public product guide; a signed-in student, teacher or
// administrator gets answers from the records that role may see. The role comes from the session
// cookie, never from anything the browser sends. For each question the server decides which
// lookups answer it, runs them, and asks the model once to put the result into words; if no
// model is reachable the answer is written straight from the same data.

const textOf = (m) =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();

const textOnly = (messages) =>
  messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && Array.isArray(m.parts))
    .map((m) => ({
      id: String(m.id ?? crypto.randomUUID()),
      role: m.role,
      parts: m.parts.filter((p) => p?.type === "text" && typeof p.text === "string"),
    }))
    .filter((m) => m.parts.length);

/** The lookup results as compact JSON for the model, with long lists trimmed to fit. */
function dataBlock(results, limit = 9000) {
  const body = results.map((r) => ({
    lookup: r.tool,
    ...(r.error ? { error: r.error } : { result: r.output }),
  }));
  let json = JSON.stringify(body);
  if (json.length > limit)
    json = JSON.stringify(body, (_, v) => (Array.isArray(v) && v.length > 6 ? v.slice(0, 6) : v));
  return json.slice(0, limit);
}

/** A finished answer sent in the chat format, with a note of which records it came from. */
function respond(messages, text, lookups) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages: messages,
      execute: ({ writer }) => {
        if (lookups.length) writer.write({ type: "data-lookups", data: { tools: lookups } });
        writer.write({ type: "text-start", id: "reply" });
        for (const piece of text.match(/\S+\s*/g) ?? [text])
          writer.write({ type: "text-delta", id: "reply", delta: piece });
        writer.write({ type: "text-end", id: "reply" });
      },
    }),
  });
}

export async function handleChat(request, deps = {}) {
  if (
    request.headers.get("content-length") &&
    Number(request.headers.get("content-length")) > 60000
  )
    return Response.json({ error: "Conversation is too large." }, { status: 413 });
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    return Response.json({ error: "This request must come from the website." }, { status: 403 });

  const user = await (deps.currentUser ?? currentUser)().catch(() => null);
  const limiterKey = user ? `chat-user:${user.id}` : `chat:${clientIp(request)}`;
  if (!rateLimit(limiterKey, user ? 60 : 20, 10 * 60 * 1000))
    return Response.json(
      { error: "Too many messages. Please wait a few minutes." },
      { status: 429 },
    );

  try {
    const body = await request.json();
    if (!Array.isArray(body.messages) || body.messages.length > 100)
      return Response.json(
        { error: "A valid conversation of up to 100 messages is required." },
        { status: 400 },
      );
    // Only the text of earlier turns is sent back to the model, so old lookups are never replayed.
    const messages = await validateUIMessages({ messages: textOnly(body.messages) });
    if (JSON.stringify(messages).length > 60000)
      return Response.json(
        { error: "Conversation is too large. Start a fresh visit." },
        { status: 400 },
      );
    if (!messages.length || messages.at(-1).role !== "user")
      return Response.json({ error: "Ask a question first." }, { status: 400 });

    const question = textOf(messages.at(-1));
    const history = messages.slice(0, -1).map((m) => ({ role: m.role, text: textOf(m) }));
    const assistant = createAssistant({ db: deps.db ?? { query }, user });

    // 1. look up what this question needs, from what this person may see
    let results = [];
    if (assistant.role !== "visitor") {
      const { students, branches } = await assistant.roster();
      const plan = planLookups({
        role: assistant.role,
        text: question,
        history,
        roster: students,
        branches,
      });
      results = await Promise.all(
        plan.map(async ({ tool, input }) => {
          try {
            return { tool, input, output: await assistant.tools[tool].execute(input, {}) };
          } catch (error) {
            return {
              tool,
              input,
              error: error instanceof Error ? error.message : "Lookup failed.",
            };
          }
        }),
      );
    }
    const lookups = [...new Set(results.filter((r) => !r.error).map((r) => r.tool))];

    // 2. one model request puts it into words; without a model the data speaks for itself
    const system = systemPrompt({
      role: assistant.role,
      name: user?.displayName || user?.email || "",
      date: new Date().toISOString().slice(0, 10),
      data: results.length ? dataBlock(results) : "",
    });
    let text;
    try {
      ({ text } = await (deps.generate ?? generateWithFallback)({
        system,
        messages: await convertToModelMessages(messages),
        temperature: 0.3,
        maxOutputTokens: 1500,
      }));
    } catch {
      text =
        assistant.role === "visitor"
          ? visitorFallback(question)
          : `${answerFromData(results)}\n\n${MODEL_DOWN_NOTE}`;
    }
    return respond(messages, text, lookups);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      return new Response(null, { status: 499 });
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to start the assistant." },
      { status: 400 },
    );
  }
}
