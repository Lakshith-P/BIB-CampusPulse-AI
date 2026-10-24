import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/backend/auth-middleware";
import { withTransaction } from "@/backend/db.server";
import { rateLimit } from "@/backend/rate-limit.server";
import * as copilot from "@/backend/copilot.server";

const today = () => new Date().toISOString().slice(0, 10);
const staff = (user) => {
  if (!user.roles.includes("faculty") && !user.roles.includes("admin"))
    throw new Error("The Analytics Copilot is for teachers and deans.");
};

// Questions are answered from the records the caller may see; the model, its prompt and the
// provider key all stay on the server.
export const askAnalyticsCopilot = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      question: z.string().trim().min(3, "Ask a full question.").max(600),
      messages: z
        .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
        .max(12)
        .default([]),
    }),
  )
  .handler(({ data, context }) => {
    staff(context.user);
    if (!rateLimit(`copilot:${context.user.id}`, 20, 10 * 60 * 1000))
      throw new Error("Too many questions. Please wait a few minutes.");
    return withTransaction((db) => copilot.askCopilot(db, context.user, data, today()));
  });

export const loadCopilotSuggestions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => {
    staff(context.user);
    return withTransaction((db) => copilot.suggestions(db, context.user, today()));
  });
