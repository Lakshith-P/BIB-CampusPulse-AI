import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/backend/auth-middleware";
import { limitByIp } from "@/backend/auth.server";
import { withTransaction } from "@/backend/db.server";
import * as registration from "@/backend/registration.server";

// Administrators only: registering students and teachers (the system emails each their login) and
// deciding password requests. The role check is in the server module, not here.
const run = (user, work) => withTransaction((db) => work(db, user));
const text = (max, min = 0) => z.string().trim().min(min).max(max);

const person = z.object({
  name: text(100, 2),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["student", "faculty"]),
  studentId: text(40).optional(),
  course: text(60).optional(),
  branch: text(60).optional(),
  section: text(20).optional(),
  semester: z.number().int().min(1).max(8).optional(),
  gradYear: z.number().int().min(2020).max(2040).optional(),
  teacherEmail: z.string().trim().toLowerCase().email().max(254).optional(),
});

export const registerAccounts = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ people: z.array(person).min(1).max(500) }))
  .handler(async ({ data, context }) => {
    limitByIp("register", 30, 60 * 60 * 1000);
    const mailer = await registration.defaultMailer();
    return run(context.user, (db, user) =>
      registration.registerMany(db, user, data.people, mailer),
    );
  });

export const loadPasswordRequests = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(({ context }) =>
    run(context.user, (db, user) => registration.listPasswordRequests(db, user)),
  );

export const decidePasswordRequest = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ id: z.string().uuid(), decision: z.enum(["approve", "reject"]) }))
  .handler(async ({ data, context }) => {
    limitByIp("password-decision", 120, 60 * 60 * 1000);
    const mailer = await registration.defaultMailer();
    return run(context.user, (db, user) =>
      registration.decidePasswordRequest(db, user, data, mailer),
    );
  });

/** Whether email can be sent, so the page can say what will happen to the passwords. */
export const loadMailStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    if (!context.user.roles.includes("admin")) throw new Error("Only administrators can do this.");
    return { ready: (await registration.defaultMailer()).ready };
  });
