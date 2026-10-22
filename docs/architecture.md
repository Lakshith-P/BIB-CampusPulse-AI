# Architecture

## Stack

| Layer         | Technology                                                                        |
| ------------- | --------------------------------------------------------------------------------- |
| Framework     | TanStack Start (React 19, file-based routing, server functions), Vite 8           |
| UI            | Tailwind CSS 4, shadcn/ui (Radix), Recharts, AI Elements for the assistant        |
| Data fetching | TanStack Query                                                                    |
| Database      | PostgreSQL via `pg`; SQL migrations in `db/migrations`                            |
| Auth          | bcrypt password hashes, HS256 JWT (`jose`) in an httpOnly cookie                  |
| Validation    | Zod, on every server function input                                               |
| Assistant     | Vercel AI SDK (`ai`, `@ai-sdk/openai-compatible`), any OpenAI-compatible provider |
| Build / host  | Nitro; Vercel or a plain Node.js server (`npm start`)                             |

## Code layout

```
db/migrations/        SQL schema (0001_init, 0002_profile_fields)
scripts/              migrate.js, db-check.js, set-role.js
src/backend/          Server-only: db pool, sessions, auth middleware, rate limiting
src/lib/              Shared logic + server functions (*.functions.js)
src/components/       UI: portal/, student-profile/, ai-elements/, ui/ (shadcn)
src/routes/           File-based routes; _authenticated/portal.* is the live portal
src/test/             Vitest suites
```

Files named `*.server.js` and everything under `src/backend` run only on the server. `*.functions.js` files define TanStack server functions, which the browser calls like ordinary async functions while the code stays on the server.

## The two data systems

### Live (server)

- Student records, interventions, contact messages and the audit log are in PostgreSQL.
- The browser loads everything the caller may see in **one** query, `loadCampus`, and derives scores client-side with `src/lib/campus-derive.js` and `src/lib/scoring.js`. After any mutation the shared campus query is invalidated, so every page recomputes from fresh data.

## Request flow for a protected action

```
Browser component
  └─ calls server function (e.g. saveCampusIntervention)
       ├─ requireAuth middleware     → currentUser(): verify JWT, re-read roles from user_roles
       ├─ Zod validator              → reject malformed input
       ├─ handler                    → SQL whose WHERE clause encodes the caller's access
       └─ result                     → rowCount 0 means "not authorized", thrown as an error
  └─ on success: invalidate campus query → UI re-derives scores
```

Access rules are written into the SQL itself. For reads, `loadCampus` filters `student_records` with:

```sql
(sr.owner_id = $1 OR ($2::boolean AND sr.faculty_id = $1) OR $3::boolean)
```

(`$1` user id, `$2` is faculty, `$3` is admin.) For writes such as creating an intervention, the `INSERT … SELECT … WHERE` only inserts a row when the caller is an admin or the faculty member assigned to that student. A zero row count is treated as a refusal, so there is no separate check that could drift from the query.

## Authentication and sessions

1. **Sign-up** (`signUp`): validates input, hashes the password with bcrypt (cost 12), inserts the user and a `student` role in one transaction, then starts a session.
2. **Sign-in** (`signIn`): looks up the hash and verifies it. The same message is returned for an unknown email and a wrong password.
3. **Session**: a signed JWT (HS256, 12 hours) in an httpOnly browser-session, SameSite=Lax cookie, Secure in production. No token is kept in browser storage.
4. **Every request**: `currentUser()` verifies the token and loads the user's roles from `user_roles`. Roles in the token are never trusted, so a role change applies immediately.
5. **Route guard**: `src/routes/_authenticated/route.jsx` calls `getSession` and redirects to `/auth` when there is no user. This is a convenience; the server functions are the real gate.

A single `AccountProvider` (`src/lib/account.jsx`) holds account state for the whole app, and `PublicLayout` carries the shared website navigation, so sign-in affordances track the session without duplicate listeners.

## Website assistant

- Endpoint: `POST /api/public/chat` (`src/routes/api.public.chat.js`) → `handleChat` in `src/lib/chat.server.js`.
- The system prompt, the provider call and the full conversation handling are all server-side. The browser only sends UI messages and renders the AI SDK UI-message stream with AI Elements components.
- Guards: same-origin check, 60 KB body limit, at most 100 messages, 20 requests per IP per 10 minutes, and non-text message parts stripped before the model call.
- The prompt tells the assistant it has no access to private records and restricts it to internal links.
- Configure it with `LLM_API_KEY`, `LLM_MODEL` and `LLM_BASE_URL`. Without a key it answers that it is not configured.

## Rate limiting

`src/backend/rate-limit.server.js` is an in-memory counter keyed by IP. It limits sign-up (10/hour), sign-in (20/15 min), password change (10/15 min), the assistant and feedback. Because it lives in process memory, on a serverless host each instance counts separately; use platform-level limits (for example Vercel Firewall) for stronger protection.

## Database connection

`src/backend/db.server.js` creates one `pg` pool per server instance. `src/backend/db-config.js` enables TLS automatically for non-local hosts (override with `DATABASE_SSL=false`) and defaults the pool to 3 connections on Vercel, 10 elsewhere (`DATABASE_POOL_MAX`). On serverless hosting, use the provider's pooled connection string. `withTransaction` wraps multi-statement writes.

A sign-in also ends when the page is loaded or reloaded: a freshly loaded page first clears the session cookie (`freshLoad` in `src/lib/account.jsx`), and every session check waits for that. Moving between pages inside the app does not reload, so it keeps the session.

"Forgot your password?" sends a single-use link by email (only a SHA-256 hash of the token is stored, valid for 30 minutes, cleared once used). The reply is identical for unknown emails. Without `SMTP_URL` and `APP_URL`, the request becomes a note in the administrators' Messages instead, and an administrator can issue a temporary password under People & roles.
