import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/backend/auth-middleware";
import { limitByIp } from "@/backend/auth.server";
import { query } from "@/backend/db.server";

export const UPDATE_CATEGORIES = ["placement", "event", "notice", "poster"];

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Links must start with https://");

// Every signed-in person can read campus updates.
export const listUpdates = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async () => {
    const { rows } = await query(
      `SELECT cu.id, cu.category, cu.title, cu.body, cu.company, cu.event_date::text AS event_date,
              cu.image_url, cu.link_url, cu.created_at, cu.created_by, u.display_name AS author
         FROM campus_updates cu LEFT JOIN users u ON u.id = cu.created_by
        ORDER BY cu.created_at DESC LIMIT 200`,
    );
    return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
  });

// Teachers and administrators publish; students only read.
export const saveUpdate = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    z.object({
      category: z.enum(UPDATE_CATEGORIES),
      title: z.string().trim().min(3, "Add a title.").max(150),
      body: z.string().trim().max(2000),
      company: z.string().trim().max(100),
      eventDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .or(z.literal("")),
      imageUrl: httpsUrl,
      linkUrl: httpsUrl,
    }),
  )
  .handler(async ({ data, context }) => {
    const { user } = context;
    if (!user.roles.includes("admin") && !user.roles.includes("faculty"))
      throw new Error("Only teachers and administrators can post updates.");
    limitByIp("update", 60, 60 * 60 * 1000);
    await query(
      `INSERT INTO campus_updates(category, title, body, company, event_date, image_url, link_url, created_by)
       VALUES($1,$2,$3,$4,NULLIF($5,'')::date,$6,$7,$8)`,
      [
        data.category,
        data.title,
        data.body,
        data.company,
        data.eventDate,
        data.imageUrl,
        data.linkUrl,
        user.id,
      ],
    );
    return { saved: true };
  });

// Administrators remove anything; teachers only what they posted.
export const deleteUpdate = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { user } = context;
    const result = await query(
      "DELETE FROM campus_updates WHERE id = $1 AND ($2::boolean OR created_by = $3)",
      [data.id, user.roles.includes("admin"), user.id],
    );
    if (!result.rowCount) throw new Error("You cannot remove this update.");
    return { saved: true };
  });
