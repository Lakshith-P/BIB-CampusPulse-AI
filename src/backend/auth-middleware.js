import { createMiddleware } from "@tanstack/react-start";
import { requireUser } from "./auth.server";
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const user = await requireUser();
  return next({ context: { user } });
});
