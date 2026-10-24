import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/backend/auth-middleware";
import { withTransaction } from "@/backend/db.server";
import * as meetings from "@/backend/meetings.server";

// Mentor meetings. Who may see or change a meeting is decided in meetings.server.js.
const run = (user, work) => withTransaction((db) => work(db, user));

export const loadMeetings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) => run(context.user, (db, user) => meetings.listMeetings(db, user)));

export const requestMeeting = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      slotAt: z.string().datetime(),
      durationMin: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
      mode: z.enum(["in-person", "online"]),
      topic: z.string().trim().min(3, "Say briefly what you want to discuss.").max(300),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => meetings.requestMeeting(db, user, data)),
  );

export const respondMeeting = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["confirmed", "declined", "completed"]),
      note: z.string().max(500).default(""),
    }),
  )
  .handler(({ data, context }) =>
    run(context.user, (db, user) => meetings.respondMeeting(db, user, data)),
  );

export const cancelMeeting = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(({ data, context }) =>
    run(context.user, (db, user) => meetings.cancelMeeting(db, user, data)),
  );
