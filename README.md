# Orbit — Student Success Intelligence Platform

Developed by **TEAM BIB (Biryani Intelligence Bureau)** for the **HacXLerate Smart Campus Analytics** challenge.

![BIB InsightIQ home page](docs/screenshots/landing.png)

*Turning campus data into student success.*

## Contents

1. [Overview](#overview)
2. [The challenge](#the-challenge)
3. [How it works](#how-it-works)
4. [Features](#features)
5. [Roles and workspaces](#roles-and-workspaces)
6. [Scoring methodology](#scoring-methodology)
7. [Architecture and technology](#architecture-and-technology)
8. [Getting started](#getting-started)
9. [Configuration](#configuration)
10. [Deployment on Vercel](#deployment-on-vercel)
11. [Security](#security)
12. [Testing](#testing)
13. [Project structure](#project-structure)
14. [Command reference](#command-reference)
15. [Roadmap](#roadmap)

Further documentation is in [`docs/`](docs/README.md): architecture, data model, server functions, the Success Score note and a demo script.

## Overview

Orbit consolidates seven student data sources — academics, attendance, learning management system (LMS) activity, skills, engagement, placement readiness and feedback — under a single student identifier. From these sources it computes an explainable **Student Success Score**, identifies students who may require support together with the reasons, and enables mentors to record and track interventions.

The platform addresses three questions for every student:

1. Who requires support?
2. Why do they require it?
3. What action should the faculty member take next?

---

## The challenge

orbit
Further documentation is in [`docs/`](docs/README.md): architecture, data model, server functions and the Success Score note.
Student data lives in silos — grades in one system, attendance in another, LMS activity, skill assessments, and placement records scattered everywhere. By the time anyone connects the dots, a struggling student has already fallen behind.

**BIB InsightIQ** unifies **seven campus data sources** under a single student identity and answers three questions instantly:

1. **Who needs help?** — an explainable 0–100 Success Score with clear risk bands
2. **Why are they at risk?** — dual, points-based **Academic Risk** and **Placement Risk** flags, each with a sorted driver list (signal → value → threshold → points)
3. **What should faculty do next?** — concrete next steps and mentor interventions with an owner and follow-up date

---

## How it works

### 1. Public website & guided entry

A professional landing site explains the product, privacy stance, and benefits per role, with an "Ask IQ" assistant for guided navigation. Visitors can explore a **password-free demo** — no credentials needed.

![Login and demo access](docs/screenshots/login.png)

### 2. Student dashboard — the whole student story

Each student gets an 8-tab workspace: **Overview, Academics, Attendance, LMS, Skills, Placement, Engagement, Feedback**.

- **Explainable score** — every component shows its weight and exact point contribution
- **Risk badges** — Academic and Placement risk levels with points, plus "Why you are flagged" drivers
- **Actionable notifications** — e.g. *"attend the next 8 classes to reach 85%"*, assignment deadlines, drive eligibility
- Attendance planner, unit-wise LMS content, weekly skill tests, resume check, mock interviews, and placement drive eligibility

![Student dashboard](docs/screenshots/student.png)

### 3. Faculty / Mentor dashboard — triage at a glance

Mentors see their assigned cohort with **filterable Academic-risk and Placement-risk columns**, band filters, search, up-to-3-student comparison, and one-click **Intervene** actions that record owner, action, and follow-up date.

![Faculty dashboard](docs/screenshots/faculty.png)

### 4. Administrator dashboard — institution-level insight

Campus-wide KPIs, risk-band distribution, academic trends, department comparison, **flag-level counts and a branch × flag heatmap**, plus a data-quality panel — missing data is flagged, never silently treated as zero.

![Admin dashboard](docs/screenshots/admin.png)

### 5. Data & Import

CSV import with validation and a cleaning report, so messy real-world exports (duplicates, missing values, bad formats) become one unified, trustworthy student record.

![Data import](docs/screenshots/data.png)


main

## Features

| Area                  | Description                                                                                                                                                                                                              | Route                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Public website        | Introduction, solution, benefits, privacy statement, contact and sign-in pages.                                                                                                                                          | `/`                                   |
| Role-based workspaces | Separate student, teacher and administrator workspaces, each with its own colours, menus and overview, backed by a PostgreSQL database.                                                                                  | `/portal`                             |
| Login and sign-up     | One login page for all three workspaces with a captcha, a choice of where to land, sign-up for each role (teachers and administrators need approval or a listed email), and a working "Forgot your password?".           | `/auth`                               |
| Results               | Students see CGPA, SGPA, marks, letter grades and backlogs (printable); teachers and administrators see class results, toppers and who needs support.                                                                    | `/portal/results`                     |
| Placement             | Students see current drives and their readiness; teachers and administrators see readiness across students, risk levels and students to watch, and can post drives.                                                      | `/portal/placement`                   |
| Campus updates        | Placements, events, notices and posters posted by teachers and administrators, shown on a spotlight carousel, a "Happening" panel, the announcement strip and the updates page.                                          | `/portal/updates`                     |
| Search                | A full-screen search (Ctrl or Cmd + K) that lists every section of the workspace and finds students by name or ID.                                                                                                       | Top bar                               |
| Student records       | Teachers keep marks, attendance and skills of their students up to date; administrators also import students from CSV, assign teachers, manage roles and passwords, and read the audit log. Student lists export to CSV. | `/portal/students`, `/portal/records` |
| Website assistant     | A conversational guide that answers only questions about Orbit. It has no access to private student records.                                                                                                             | All public pages                      |

---

## Roles and workspaces

Each role has its own navigation and pages under `/portal`.

### Student

Home · Profile · Dashboard · Learning path · Attendance · LMS · Skills · Placement · Engagement · Feedback

- **Home** summarizes the score, key indicators, alerts, mentor and upcoming deadlines.
- **Profile** presents account and academic details. Students may update their name, contact details, biography, professional links and target roles. Marks, attendance, branch, semester and mentor are maintained by staff.
- **Dashboard** presents academic status: success score, contributing factors, risk signals, recommended next steps, CGPA trend and subject performance.
- **Learning path** lists the courses of the current semester with unit progress and the next recommended step for each.
- Remaining pages present attendance planning, LMS progress, skill assessments, placement readiness, engagement activities and feedback.

Every page presents only recorded data. Where data has not yet been recorded, the page states this explicitly, and missing data is never treated as zero.

### Teacher

Home · My students · Interventions · Attendance & risk · Profile

- Access is limited to students assigned to the teacher.
- Teachers review each student's complete profile, record feedback, and create and update interventions.
- **Attendance & risk** lists students with low attendance, academic concerns, LMS delays and missing data.

### Administrator

Home · All students · Teachers · Assign students · People & roles · Student records · Interventions · Attendance & risk · Messages · Audit log · Profile

- **Home** provides a campus overview: student counts, average score, distribution by status, branch summary and outstanding set-up tasks.
- **Assign students** connects students to teachers individually or in bulk.
- **People & roles** grants and revokes teacher and administrator access.
- **Student records** captures marks, attendance and skills through a form or a JSON import.
- **Messages** and **Audit log** provide the contact-form inbox and a record of changes to student records.

---

## Scoring methodology

The following rules apply to the prototype and do not constitute institutional policy. The weights are defined in `src/lib/types.js`.

| Component                             | Weight |
| ------------------------------------- | ------ |
| Academics (CGPA × 10)                 | 30%    |
| Attendance                            | 20%    |
| LMS completion                        | 15%    |
| Engagement (verified activities only) | 10%    |
| Skills (average)                      | 10%    |
| Placement readiness                   | 15%    |

**Status bands:** 80 and above, On Track · 65 to 79, Monitor · 50 to 64, Needs Attention · below 50, High Priority.

**Missing data** is never treated as zero. Components without data are excluded and the remaining weights are rescaled, with a visible indication of completeness.

**Attendance marks:** 90% or more, 5 · 85% to below 90%, 4 · 80% to below 85%, 3 · 75% to below 80%, 2 · below 75%, 0. The attendance page also reports the number of classes required to reach 75%, 80%, 85% and 90%, and the number that may still be missed.

**Placement eligibility** evaluates each criterion as Pass, Fail or Unknown. A student is not reported as eligible while any required criterion is Unknown.

### Academic and placement risk

**Dual risk flags** — a points-based rule table in one config file (`src/lib/risk-flags.js`): each rule is *signal, threshold, points*. Missing inputs add no points and appear as **"Insufficient data"**.

- **Academic Risk** — backlogs, low CGPA, SGPA drop, low attendance, subjects below 75, low LMS lessons/assignments → High ≥ 5 pts, Medium ≥ 2
- **Placement Risk** — low readiness, weak aptitude/coding, weak resume, no mock interviews, incomplete assessments, no certifications/hackathons → High ≥ 6 pts, Medium ≥ 3

If either risk flag is **High**, the overall band cannot be **On Track**.

---

## Architecture and technology

| Layer                 | Technology                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Application framework | TanStack Start (React 19, file-based routing), Vite 8                                                                   |
| User interface        | Tailwind CSS, a small set of shadcn/ui components, Recharts                                                             |
| Language              | JavaScript                                                                                                              |
| Database              | PostgreSQL through `node-postgres`; versioned SQL migrations in `db/migrations`                                         |
| Authentication        | Email and password; passwords hashed with bcrypt; sessions issued as signed JSON Web Tokens (JWT) in an httpOnly cookie |
| Assistant             | Vercel AI SDK with any OpenAI-compatible provider (Google Gemini by default), limited to Orbit topics                   |
| Build and hosting     | Nitro; deployable to Vercel without additional configuration, or runnable as a Node.js server                           |

Authorization is enforced on the server for every request. Navigation shown in the interface is a convenience only and is never relied upon for access control.

---

## Getting started

### Prerequisites

- Node.js 22.9 or later
- A PostgreSQL database: a local instance (Docker Compose configuration provided) or a hosted service such as [Neon](https://neon.tech)

### Installation

```bash
git clone https://github.com/Ramcharan0600/insight-score-dash.git
cd insight-score-dash
git checkout bib
npm install
```

Create the environment file and complete it as described in [Configuration](#configuration):

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

### Database setup

```bash
docker compose up -d          # optional: starts a local PostgreSQL instance
npm run db:migrate            # applies the schema
npm run db:check              # verifies the connection; expected output: "Schema OK"
```

### Running the application

```bash
npm run dev                   # development server; the address is printed in the terminal
```

### Creating the first administrator

New accounts are created with student access. Register through the sign-in page, then grant administrator access:

```bash
npm run db:set-role -- user@example.com admin
```

On the next page load, the administrator workspace is available. Teacher access is granted from **People & roles**, and students are connected to teachers from **Assign students**.

---

## Configuration

Environment variables are read from `.env` for local use. The file is excluded from version control and must not be committed. On a hosting platform, define the same variables in its environment settings.

| Variable                           | Required          | Description                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | Yes               | PostgreSQL connection string. For Neon, use the pooled connection string (the host name contains `-pooler`).                                                                                                                                                                                                      |
| `JWT_SECRET`                       | Yes               | Secret used to sign sessions. A random value of at least 32 characters. Changing it ends all active sessions.                                                                                                                                                                                                     |
| `ADMIN_EMAILS`                     | Recommended       | Comma-separated emails that become administrators when they sign up in the Administrator workspace. If the site has no administrator yet, the first Administrator sign-up is also accepted.                                                                                                                       |
| `TEACHER_EMAILS`                   | Optional          | Comma-separated emails that become teachers as soon as they sign up in the Teacher workspace. Other teacher sign-ups wait for an administrator to approve them.                                                                                                                                                   |
| `SMTP_URL`, `APP_URL`, `MAIL_FROM` | Optional          | Turn on password-reset emails. `SMTP_URL` is your mail server (for Gmail: `smtps://you%40gmail.com:app-password@smtp.gmail.com`), `APP_URL` is this site's public address. Without them, "Forgot your password?" sends a note to the administrators' Messages, who give a temporary password from People & roles. |
| `LLM_API_KEY`                      | For the assistant | API key for the language-model provider. The default provider is Google AI Studio.                                                                                                                                                                                                                                |
| `LLM_MODEL`                        | No                | Model identifier. Default: `gemini-2.5-flash`.                                                                                                                                                                                                                                                                    |
| `LLM_BASE_URL`                     | No                | OpenAI-compatible endpoint. Default: `https://generativelanguage.googleapis.com/v1beta/openai/`.                                                                                                                                                                                                                  |
| `DATABASE_SSL`                     | No                | TLS is enabled automatically for non-local hosts. Set to `false` to disable.                                                                                                                                                                                                                                      |
| `DATABASE_POOL_MAX`                | No                | Maximum connections per server instance. Default: 3 on Vercel, 10 elsewhere.                                                                                                                                                                                                                                      |

A suitable `JWT_SECRET` can be generated with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Deployment on Vercel

### Requirements

Accounts with GitHub, Vercel and a PostgreSQL provider (Neon is used below), and an API key for the language-model provider. The repository must be available on GitHub.

### Procedure

**1. Provision the database**

1. Create a project in Neon in the region nearest the intended users (for Vercel's default region, AWS US East, N. Virginia).
2. Select **Connect**, enable **Connection pooling**, and copy the connection string. Its host name contains `-pooler`.

**2. Create the schema**

1. Set `DATABASE_URL` in the local `.env` file to the copied string.
2. Run `npm run db:migrate`, followed by `npm run db:check`. The expected result is `Schema OK`.

This step is repeated whenever a new file is added to `db/migrations`.

**3. Obtain the API key**

Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Usage is subject to the provider's rate limits.

**4. Generate the session secret**

Run the command shown in [Configuration](#configuration) and retain the output as `JWT_SECRET`.

**5. Import the project into Vercel**

1. Open [vercel.com/new](https://vercel.com/new) and import the `insight-score-dash` repository.
2. Apply the following settings:

   | Setting          | Value                    |
   | ---------------- | ------------------------ |
   | Framework preset | TanStack Start, or Other |
   | Root directory   | `./`                     |
   | Build command    | `npm run build`          |
   | Install command  | `npm install`            |
   | Output directory | Leave unchanged          |
   | Node.js version  | 22.x or later            |

3. Under **Environment Variables**, add the following for the Production, Preview and Development environments:

   | Name           | Value                        |
   | -------------- | ---------------------------- |
   | `DATABASE_URL` | The pooled connection string |
   | `JWT_SECRET`   | The session secret           |
   | `LLM_API_KEY`  | The provider API key         |

   Vercel does not read the local `.env` file; the values must be entered in the project settings.

**6. Select the production branch**

The production branch defaults to `main`. Either set **Settings → Git → Production Branch** to `bib`, or merge `bib` into `main` through a pull request. Pushes to any other branch produce a Preview deployment.

**7. Deploy**

Select **Deploy**, or push a commit to the production branch. When the build completes, open the deployment URL.

**8. Verify the deployment**

1. The home page loads without signing in.
2. An account can be registered at `/auth`, after which the student **Home** page is displayed.
3. The assistant answers a question such as "What are the score bands?".

**9. Grant administrator access**

With `DATABASE_URL` in the local `.env` pointing to the production database, run:

```bash
npm run db:set-role -- user@example.com admin
```

### Maintenance

| Task                  | Procedure                                                          |
| --------------------- | ------------------------------------------------------------------ |
| Release an update     | Push to the production branch; Vercel redeploys automatically.     |
| Apply a schema change | Run `npm run db:migrate` against the production database.          |
| Change a variable     | Edit it under **Settings → Environment Variables**, then redeploy. |
| Add a custom domain   | **Settings → Domains → Add**.                                      |
| Review logs           | **Deployments →** select a deployment **→ Logs**.                  |

### Troubleshooting

| Symptom                                                  | Likely cause and resolution                                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| The build fails                                          | Review the build log and confirm the Node.js version is 22 or later.                                                                     |
| `DATABASE_URL is not set`                                | The variable is missing, or was added after the deployment. Add it and redeploy.                                                         |
| `JWT_SECRET must be set…`                                | The secret is missing or shorter than 32 characters.                                                                                     |
| Registration or sign-in fails                            | Run `npm run db:check` with the same `DATABASE_URL`. Confirm that migrations were applied and that the pooled connection string is used. |
| Too many connections                                     | Use the pooled connection string, or reduce `DATABASE_POOL_MAX`.                                                                         |
| The assistant reports it is not configured               | `LLM_API_KEY` is not set.                                                                                                                |
| The assistant reports an error or delay                  | The provider's rate limit may have been reached. Retry later, or configure a different provider with `LLM_BASE_URL` and `LLM_MODEL`.     |
| The first request after a period of inactivity is slower | The database and serverless function resume on demand. Subsequent requests are not affected.                                             |

---

## Security

- Passwords are hashed with bcrypt (cost factor 12). Sessions are signed JWTs (HS256, seven-day lifetime) stored in an httpOnly, SameSite=Lax cookie, marked Secure in production. No token is stored in browser storage.
- Roles are read from the database on every request and are not taken from the token. A change to a user's role takes effect immediately.
- Server functions are protected against cross-site request forgery. The assistant accepts requests only from the site's own origin.
- Sign-in, registration, assistant requests and feedback submissions are rate limited per IP address. These limits are held in server memory; on a serverless host, platform-level rate limiting (for example, Vercel Firewall) is recommended for stronger protection.
- Credentials (`DATABASE_URL`, `JWT_SECRET`, `LLM_API_KEY`) must be kept in the hosting environment's settings and never committed to the repository.

---

## Testing

```bash
npm test
```

The automated test suite covers attendance band boundaries, classes-required calculations, status band boundaries, missing-data handling, eligibility rules, CSV validation, risk flags, the derivation of per-student and campus summaries, and the alert and deadline logic of the student workspace.

---

## Project structure

```
db/migrations/          SQL schema, applied with npm run db:migrate
scripts/                Database utilities: migrate, check, set-role
src/backend/            Server-only modules: connection pool, sessions, rate limiting
src/lib/
  auth.functions.js       Registration, sign-in, sign-out, password change, contact form
  campus.functions.js     Records, assignments, interventions, feedback, profile, audit
  campus-derive.js        Scores, status bands and summaries
  live-profile.js         Alerts and deadlines derived from recorded data
  scoring.js              Score, attendance and eligibility rules
  chat.server.js          Website assistant
src/components/
  portal/                 Workspace shell, role-specific pages, interventions, tables
  student-profile/        Student dashboard components
  AdminTools.jsx          Assignment, roles, records and messages
src/routes/             Application pages; /portal/* are the role-based workspaces
src/test/               Automated tests
```

`src/routeTree.gen.ts` is generated by TanStack Router and should not be edited manually.

---

## Command reference

| Command                                 | Purpose                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                           | Start the development server                                                |
| `npm run build`                         | Create a production build (Vercel output format when built on Vercel)       |
| `npm start`                             | Run a production build as a Node.js server, loading `.env`                  |
| `npm test`                              | Run the automated tests                                                     |
| `npm run lint`                          | Run the linter                                                              |
| `npm run db:migrate`                    | Apply pending database migrations                                           |
| `npm run db:check`                      | Verify the database connection and schema                                   |
| `npm run db:set-role -- <email> <role>` | Grant a role (`student`, `faculty` or `admin`); add `--revoke` to remove it |

---

## Roadmap

Planned enhancements:

- Email-based address verification and self-service password recovery
- Integration with campus systems for automated data import
- Configurable scoring weights and thresholds
- Notification delivery to students and mentors
- Evidence review and approval workflows for engagement activities
- Peer comparison with fairness safeguards
orbit
*Explainable insights. Human-led support. Fictional demo data.*
main
