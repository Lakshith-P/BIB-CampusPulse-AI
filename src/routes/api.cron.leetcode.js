import { createFileRoute } from "@tanstack/react-router";
import { withTransaction } from "@/backend/db.server";
import { runDailySync } from "@/backend/leetcode.server";

// Triggered daily by Vercel Cron (see vercel.json). Protected by a shared secret since it runs
// with no signed-in user and touches every linked LeetCode account.
async function handleCron(request) {
  const secret = process.env["CRON_SECRET"];
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  await withTransaction((db) => runDailySync(db));
  return new Response("ok");
}

export const Route = createFileRoute("/api/cron/leetcode")({
  server: { handlers: { GET: ({ request }) => handleCron(request) } },
});
