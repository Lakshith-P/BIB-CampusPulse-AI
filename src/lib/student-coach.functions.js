import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/backend/auth-middleware";
import { withTransaction } from "@/backend/db.server";
import { rateLimit } from "@/backend/rate-limit.server";
import * as coach from "@/backend/student-coach.server";

const today = () => new Date().toISOString().slice(0, 10);
const students = (user) => {
  if (
    !user.roles.includes("student") ||
    user.roles.includes("admin") ||
    user.roles.includes("faculty")
  )
    throw new Error("The coach is for students.");
};

// The model, its prompt and the provider key stay on the server. A student reaches only their own
// record and anonymous comparisons over everyone.
export const askStudentCoach = createServerFn({ method: "POST" })
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
    students(context.user);
    if (!rateLimit(`coach:${context.user.id}`, 20, 10 * 60 * 1000))
      throw new Error("Too many questions. Please wait a few minutes.");
    return withTransaction((db) => coach.askCoach(db, context.user, data, today()));
  });

export const loadMyRanking = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => {
    students(context.user);
    return withTransaction((db) => coach.myRanking(db, context.user));
  });

export const loadCoachSuggestions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => {
    students(context.user);
    return withTransaction((db) => coach.coachSuggestions(db, context.user));
  });
