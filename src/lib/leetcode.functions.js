import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/backend/auth-middleware";
import { limitByIp } from "@/backend/auth.server";
import { withTransaction } from "@/backend/db.server";
import * as leetcode from "@/backend/leetcode.server";

export const saveMyLeetcodeUsername = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ username: z.string().trim().min(1, "Username is required.").max(50) }))
  .handler(({ data, context }) => {
    limitByIp("leetcode-save", 10, 60 * 60 * 1000);
    return withTransaction((db) =>
      leetcode.saveMyLeetcodeUsername(db, context.user, data.username),
    );
  });

export const loadLeetcodeProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ studentId: z.string().trim().min(1).max(50) }))
  .handler(({ data, context }) =>
    withTransaction((db) => leetcode.getLeetcodeProfile(db, context.user, data.studentId)),
  );
