# Development guide

Setup, environment variables and deployment are covered in the [project README](../README.md). This page covers day-to-day work on the code.

## Daily workflow

```bash
npm run dev          # dev server
npm test             # vitest run
npm run lint         # eslint
npm run format       # prettier --write
npm run build        # production build
```

Node.js 22.9 or later is required.

## Conventions

- **Plain JavaScript** (`.js`, `.jsx`). The only TypeScript file is `src/routeTree.gen.ts`, which TanStack Router generates. Never edit it by hand.
- **Imports** use the `@/` alias for `src/`.
- **Server-only code** lives in `src/backend` or in `*.server.js` files. Do not import it from components.
- **UI primitives** in `src/components/ui` are shadcn/ui components; `components.json` configures the generator.
- **Formatting** is enforced by Prettier and ESLint (`eslint.config.js`).

## Routing

Routes are files under `src/routes`; the file name is the URL (`portal.students.$id.jsx` is `/portal/students/:id`). The `_authenticated` prefix is a pathless layout whose `beforeLoad` redirects signed-out visitors to `/auth`.

To add a portal page:

1. Create `src/routes/_authenticated/portal.<name>.jsx` with `createFileRoute("/_authenticated/portal/<name>")`.
2. Build the page in `src/components/portal/` and read data through `useCampus` (`src/lib/use-campus.js`), which wraps the shared campus query.
3. Add it to the role's navigation in `src/components/portal/PortalShell.jsx`. Remember that hiding a link is not access control; the data is already filtered by the server.
4. Run `npm run dev` once so the router plugin regenerates `routeTree.gen.ts`.

## Changing the scoring rules

| Change                                         | File                       |
| ---------------------------------------------- | -------------------------- |
| Component weights, band thresholds             | `src/lib/types.js`         |
| Score, attendance marks, eligibility           | `src/lib/scoring.js`       |
| Academic and Placement risk signals and points | `src/lib/risk-flags.js`    |
| Per-student and campus summaries               | `src/lib/campus-derive.js` |
| Portal alerts and deadlines                    | `src/lib/live-profile.js`  |

Scores are derived on read and never stored, so no migration is needed. Update the assistant's prompt in `src/lib/chat.server.js` and the tables in the README and [docs](README.md#scoring-in-one-table) so the description stays in step, then update the tests.

## Changing the database

1. Add `db/migrations/000N_description.sql`. Do not edit applied migrations.
2. Run `npm run db:migrate` then `npm run db:check`.
3. Run the migration against production when deploying.

If a change affects the shape of the `record` JSON, update `studentSchema` and `emptyStudent`. Existing rows must still parse, so make new fields optional or defaulted.

## Tests

`npm test` runs Vitest with jsdom and Testing Library (`vitest.config.js`, `src/test/setup.js`).

| Suite                   | Covers                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `scoring.test.js`       | Attendance band boundaries, classes required, status bands, missing data, eligibility         |
| `risk-flags.test.js`    | Academic and Placement risk flags and band blocking                                           |
| `campus-derive.test.js` | Per-student and campus summaries                                                              |
| `live-profile.test.js`  | Student workspace alerts and deadlines                                                        |
| `dataset.test.js`       | The 300-student dataset (`fixtures/students_unified_clean.csv`) against the reference scoring |
| `app-routing.test.jsx`  | Public and guarded route behavior                                                             |
| `destinations.test.js`  | Every menu, shortcut, search and login destination points at a real page                      |
| `csv.test.js`           | Student CSV export (quoting, formula safety) and import checks                                |
| `results.test.js`       | Letter grades for marks                                                                       |
| `captcha.test.js`       | The captcha image and token, wrong answers and missing tokens                                 |

The tests exercise derivation and routing. They do not run against a real database, so authorization SQL in `campus.functions.js` is verified manually: sign in as a student, a teacher and an administrator and confirm each sees only the records described in the [data model](data-model.md#who-may-read-or-write-what).

## Security checklist for a change

- Does every new server function use `requireAuth` and a Zod validator?
- Is the access rule in the SQL, not only in the UI?
- Are secrets (`DATABASE_URL`, `JWT_SECRET`, `LLM_API_KEY`) kept out of the repository and the client bundle?
- Is a new write recorded in `campus_audit` when it touches a student record?

## Known gaps

From the project `roadmap.md` and README roadmap: email verification and password recovery, automated import from campus systems, configurable weights, notifications, an evidence review workflow for engagement, and peer comparison with fairness safeguards. `roadmap.md` also still refers to some files by their earlier TypeScript names (for example `risk-flags.ts`); the code is now JavaScript.
