# SLQG — Complete Project Documentation

**SLQG (Student Learning, Quality & Growth)**, also shown in the app as **BIB InsightIQ**, is a student success intelligence platform built by TEAM BIB (Biryani Intelligence Bureau) for the HacXLerate Smart Campus Analytics challenge. It brings seven campus data sources under one student identity, turns them into an explainable Success Score and risk flags, predicts outcomes, and gives students, teachers and administrators the tools to act.

This document explains **every feature, who uses it, and how it works**. It complements the focused notes in this folder ([architecture](architecture.md), [data model](data-model.md), [server functions](server-functions.md), [Success Score](SUCCESS_SCORE.md), [predictions](PREDICTIONS.md), [WhatsApp](WHATSAPP.md)) and the install guide in the [project README](../README.md).

> More detail: [Portal guide](PORTAL_GUIDE.md) (every section, role by role) and [Predictive risk reference](PREDICTIVE_RISK.md) (every metric, formula and accuracy figure).

## Contents

1. [The product at a glance](#1-the-product-at-a-glance)
2. [Architecture and security model](#2-architecture-and-security-model)
3. [Public website](#3-public-website)
4. [Accounts, sign-in and roles](#4-accounts-sign-in-and-roles)
5. [Student workspace](#5-student-workspace)
6. [Teacher workspace](#6-teacher-workspace)
7. [Administrator workspace](#7-administrator-workspace)
8. [Shared engines](#8-shared-engines)
9. [AI features and the model chain](#9-ai-features-and-the-model-chain)
10. [Integrations](#10-integrations)
11. [Database overview](#11-database-overview)
12. [Configuration, scripts and deployment](#12-configuration-scripts-and-deployment)
13. [Testing](#13-testing)
14. [Limits and honest caveats](#14-limits-and-honest-caveats)

---

## 1. The product at a glance

For every student the platform answers three questions: **Who needs help? Why? What should the mentor do next?**

| Surface           | Routes                                                | Data                    | Sign-in  |
| ----------------- | ----------------------------------------------------- | ----------------------- | -------- |
| Public website    | `/`, `/solution`, `/benefits`, `/privacy`, `/contact` | none                    | no       |
| Role-based portal | `/portal/*`                                           | live PostgreSQL records | required |

There is **no demo mode** in the portal: every page runs on real accounts and real database rows. There is no public sign-up: the first administrator comes from `npm run db:create-admin`, and an administrator registers everyone else under **Login credentials**.

### The seven data sources

Academics, attendance, LMS activity, skills, engagement, placement readiness and feedback. Each is stored against one student record and feeds the score.

### Roles

| Role                | Sees                                          | Can change                                                                       |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| `student`           | their own record, results, predictions, chats | own profile, attendance plans, submissions, feedback, applications               |
| `faculty` (teacher) | students assigned to them                     | marks, attendance, LMS, drives, interventions, announcements for those students  |
| `admin`             | everything                                    | records, roles, assignments, teacher approval, model training, complaints, audit |

A teacher or administrator is **not also a student**: migrations `0019` and `0021` and `accounts.server.js` remove the empty auto-created student record when a role changes.

---

## 2. Architecture and security model

| Layer         | Technology                                                               |
| ------------- | ------------------------------------------------------------------------ |
| Framework     | TanStack Start (React 19, file-based routes, server functions), Vite     |
| UI            | Tailwind CSS 4, shadcn/ui (Radix), Recharts, AI Elements, Lucide icons   |
| Data fetching | TanStack Query                                                           |
| Database      | PostgreSQL via `pg`; SQL migrations in `db/migrations` (PGlite in tests) |
| Auth          | bcrypt hashes + HS256 JWT (`jose`) in an httpOnly cookie                 |
| Validation    | Zod on every server function                                             |
| AI            | Vercel AI SDK (`ai`) with OpenAI-compatible providers                    |
| Hosting       | Nitro; Vercel or plain Node (`npm start`)                                |

### Code layout

```
db/migrations/      numbered SQL schema (0001 … 0023)
scripts/            migrate, set-role, seed-demo, db-check, whatsapp-chat
src/backend/        server-only modules (*.server.js): db, auth, every feature's SQL
src/lib/            shared logic (scoring, risk, prediction) + *.functions.js server functions
src/components/     portal/, landing/, ai-elements/, ui/
src/routes/         file routes; _authenticated/portal.* is the live portal
src/test/           Vitest suites (db/ runs real migrations on PGlite)
```

### How a protected action runs

```
component → server function
   ├─ requireAuth middleware   verify JWT, RE-READ roles from user_roles
   ├─ Zod validator            reject malformed input
   ├─ handler                  SQL whose WHERE clause encodes the caller's access
   └─ result                   rowCount 0 = refused; success only after a confirmed write
→ the shared ["private-campus"] query is invalidated so every derived score refreshes
```

Key rules (from `AGENTS.md`):

- **The server decides.** Hiding a menu item is cosmetic; every function checks roles in SQL.
- **Roles are never trusted from the token.** They are re-read on each request, so removing access applies immediately.
- **Writes are confirmed** before success is returned.
- **Missing is not zero.** Components without data are left out and weights re-scaled.
- **Plain JavaScript.** `src/routeTree.gen.ts` is the only TypeScript file and is generated — never hand-edit it.

Cross-cutting protections: bcrypt cost 12, httpOnly + SameSite cookie (Secure in production), in-memory rate limits on sign-in/registration/password/chat/feedback/Copilot, same-origin and size checks on public endpoints, uploaded files stored in PostgreSQL (documents/images only, ≤3 MB, never served inline).

---

## 3. Public website

| Page                     | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` — **SLQG landing**   | A full interactive page: cinematic hero, auto-playing phone showcase (scenes every 3.5 s with play/pause, paused off-screen and for reduced-motion), seven-domain connection band, a **Studio** with four illustrative student scenarios whose score is computed live from the real weights, a formula toggle, a "support plan" dialog, role tabs (keyboard Left/Right/Home/End), journey, trust, FAQ, final call to action and footer. Header shows **Log in** or **My account** from the shared account state. |
| `/solution`, `/benefits` | Product story and per-role benefits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/privacy`               | Privacy and data handling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/contact`               | Public contact form → stored for administrators (rate-limited, captcha-protected).                                                                                                                                                                                                                                                                                                                                                                                                                               |

The landing page's stylesheet is scoped under `.slqg` (`src/components/landing/slqg.css`) so it cannot leak into the portal. Smooth scrolling is on site-wide and respects `prefers-reduced-motion`. All links open in the **same tab**.

The public **Pluto** assistant (floating button) answers questions about the product only; it has **no access to student records**. See [section 9](#9-ai-features-and-the-model-chain).

---

## 4. Accounts, sign-in and roles

- **No self sign-up.** An administrator registers each student and teacher under **Login credentials** (one by one, or a CSV of up to 500; the email is optional). The login is made from the first name: **Bharath** becomes `bharath@insightiq.com` (then `bharath2@...` if taken) with the password `bharath@b` (the name, an `@`, and its first letter; if that is under 8 characters, numbers are added: `ram@r123`). It is shown on screen right after registering, with a CSV download. The domain is `LOGIN_EMAIL_DOMAIN` (default `insightiq.com`). If an email is typed instead, that is the login and the credentials are emailed when `SMTP_URL` is set. A student also gets a student record; a teacher gets no student role or record. A **self-hosted text captcha** (`captcha.server.js`, case-sensitive, 6 characters, single-use signed token holding only a keyed hash, 5-minute life) protects sign-in and forgot-password.
- **The first administrator** is created with `npm run db:create-admin -- email "Name"` (the password is printed once). More administrators and teachers are granted under **People & roles** or registered under **Login credentials**.
- **Sign-in** returns the same message for unknown email and wrong password. The session is a 12-hour JWT in an httpOnly cookie; a freshly loaded page clears the cookie first, so sessions do not silently outlive a reload.
- **Forgot password** is an administrator-approved request, with no email needed: the person asks on the login page; every administrator is notified; the administrator approves under **Login credentials, Password requests**; the person returns to the same screen, enters their email and sets a new password, which is saved to the database. The approval works once and for 24 hours, and the reply is identical for emails with no account. **Changing a password** while signed in is also a request that takes effect when an administrator approves.
- **Login frequency** is recorded in `login_events` and shown on the LMS page.
- **Animated login page** with a product showcase; role is chosen by workspace but **selecting a role never grants access** — the database does.

---

## 5. Student workspace

The student shell is a white, labelled sidebar plus header (Inter body text, Manrope headings, blue `#00338D` accents). Sidebar order: **Overview, Academics, Attendance Planner, Predictive Risk & AI, Learning & LMS, Placement & Careers, Skills & Coding, Personalised AI Lessons**, then a "More" group (Notifications, Announcements, Learning path, Chats, Engagement, Feedback, Profile). A global search jumps to any feature.

### 5.1 Overview (dashboard)

- **Greeting card** with semester, graduation year, band and the top alert.
- **KPI row:** Success Score ring with band, CGPA, attendance, LMS completion, alerts.
- **SGPA velocity chart** (Recharts) of semester-by-semester grade points.
- **Cohort Competency Vector:** how you compare with classmates in the same branch and semester on six competencies, shown as percentiles. Only **aggregates** leave the server and nothing is returned for a cohort under `MIN_COHORT = 5`, so no classmate can be identified (`cohortStanding` in `student-record.server.js`).
- **Directives** (what to do next) and a tabbed workspace (score breakdown, risk, attendance, LMS, skills, placement, engagement, feedback).

### 5.2 Academics (`/portal/results`)

Subject marks, SGPA/CGPA computed **from the marks already on the record** (`results.server.js`, credits from the published syllabus, default 4), backlogs and re-exam status, semester history, and a printable/PDF result. A student with no marks is left untouched rather than given a made-up grade.

### 5.3 Attendance Planner (`/portal/attendance`)

Targets of 75/80/85/90%, **classes still to attend** and **classes you can miss**, an **Attend or skip** table with advice per subject (attend every class, attend with little room, safe to skip some) plus this week's classes from the timetable and the effect of skipping the next class, what-if projections with red/amber warnings (each gives a reason and an action), and a timetable-aware plan (`attendance-planner.js`, `timetable-plan.js`). Teachers mark attendance class by class for their assigned students; each save updates the subject's held/attended totals.

### 5.4 Predictive Risk & AI (`/portal/insights`)

**Ask your coach** (the first tab) is a chat like the Analytics Copilot: ask how you compare with your class, your branch or the whole university, who is ahead of you and what they do differently, and what to improve first. Answers are computed by fixed tools over the platform's records and come with the tables they used. **Other students are never named**: comparisons are group figures (typical student, top quarter, top 10%, your rank and the share you are ahead of; groups under 5 are not compared), and "who is ahead" is a list of anonymous profiles (Student A, B ...) with every figure rounded to the nearest 5, only from groups of 10 or more. The improvement plan ranks the gaps to the top quarter by how many Success Score points closing each would add. Without an AI model the same numbers are given as a plain summary. The second tab holds your predictions and risk.

| Block                        | How it works                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Needs your attention**     | Live alerts from `live-profile.js`: low attendance, overdue/near-due assignments, marks, backlogs, drive deadlines; coloured by severity.                                                                                                                                                                   |
| **Risk level banner**        | High / Medium / Low with the top reasons ([predictions](PREDICTIONS.md)).                                                                                                                                                                                                                                   |
| **Placement prediction**     | 0–100 from LeetCode 25, Aptitude 20, CGPA 20, Mock interviews 20, Resume 15; missing criteria lower _confidence_, not the score; a 12-week projection extends the recent trend at half strength; ranked "sections to improve first".                                                                        |
| **Result prediction**        | Per-subject and overall from mid exams 35, continuous assessments 25, attendance 25, teacher rating 15, giving a predicted SGPA and Safe/Watch/At-risk outlook.                                                                                                                                             |
| **Learned forecasts**        | Ridge-regression models trained on platform data (per-subject marks, next-semester SGPA, mock-interview score) with a 90% range, a confidence, and "what would raise it most". Appear once an admin trains them.                                                                                            |
| **Recommended actions**      | Prioritised list with reasons.                                                                                                                                                                                                                                                                              |
| **Prediction coach (agent)** | Pick a target role (preset or typed). The agent re-predicts, researches the role (roadmap.sh, optional Tavily search, Wikipedia; cached a week), ranks criteria by gain × market importance, builds a checklist plan that never repeats finished steps, cites sources, and alerts the teacher on high risk. |
| **Risk identification**      | Academic and Placement flags with the signals that fired, the rule and the points (rule-counted, not predicted).                                                                                                                                                                                            |
| **What makes up your score** | Six animated bars with weight and value.                                                                                                                                                                                                                                                                    |

### 5.5 Learning & LMS (`/portal/lms`)

Six units per subject with syllabus topics, teacher-uploaded files and links, lesson completion, **one assignment per unit** with due date, text/file submissions, grading, marks and remarks. Progress feeds the Success Score. A syllabus panel and subject reviews are included.

### 5.6 Placement & Careers (`/portal/placement`)

- **Drives** posted by teachers with criteria (CGPA, backlogs, branches, batch, assessments). Each student sees a **Passed / Not met / Unknown** checklist; **applying re-checks eligibility on the server** (unknown is never eligible).
- **Selection rounds** (e.g. Aptitude → Technical → HR): each application stores a result per round; status is derived (`applied → shortlisted → selected`, or `rejected`) and the current round is highlighted. List filters: open, awaiting action, in rounds, shortlisted, selected, rejected.
- **Role match:** compares recorded skills with typical levels per role and lists gaps (rule-based, not a prediction).
- **ATS resume checker** and resume completeness (feeds the placement prediction).

### 5.7 Skills & Coding (`/portal/skills`)

Teacher-recorded assessments by category (coding, aptitude, analytical, verbal, communication); the level in the score is the **mean of the latest three**. Students see history, topic averages, weak areas (<50) and practice suggestions.

**LeetCode integration** — a student saves their LeetCode username (validated against LeetCode's GraphQL). The platform stores total/easy/medium/hard solved, ranking, contest rating and contest history. Teachers/admins see it in a **LeetCode tab** on the student profile. A **daily cron** (`/api/cron/leetcode`, Bearer `CRON_SECRET`, 03:00 UTC via `vercel.json`) refreshes stats, records contest results, and **notifies students about contests starting within 24 hours** (once per contest).

### 5.8 Personalised AI Lessons (`/portal/ai-lessons`)

1. **Learning-style questionnaire** (20 questions) builds a profile (pace, depth, tone, examples); retake any time.
2. **Generate a lesson** for any topic in your subjects (optional unit, depth, focus). The prompt, the model call and the key stay on the server; output is validated against a schema and retried once.
3. **Watch:** a narrated **board lesson** with timed terms, notes and diagram nodes, speech playback and speed control.
4. **Quiz** (best score saved) and **Boss Battle** game built from the lesson.
5. Lessons are listed, reopenable and deletable.

### 5.9 AI Mock Interview (`/portal/interview`)

Questions (and what a strong answer covers) are written **server-side from the student's resume**; hidden answers stay in the database until grading. Code answers are **reviewed by the model, never executed**. **Exam mode / proctoring:** every time the student leaves the interview screen it is counted; the **third violation ends the interview** (`terminated`, with a violation log). Each session produces a scored report (`interview-report.js`); the latest scores feed the placement prediction.

### 5.10 Engagement, Feedback, Chats, Notifications, Announcements, Profile

- **Engagement:** events, clubs, hackathons and certifications with eligibility, how to apply and deadline; the student records status and a **teacher verifies** completion — only verified activities count towards the score.
- **Feedback centre:** weekly satisfaction ratings, notes to the mentor, **confidential complaints** readable only by the author and administrators (notifications never include complaint text). Complaints have severity, assignment and a **tamper-evident audit trail** ([8.4](#84-tamper-evident-complaint-audit-chain)).
- **Chats:** auto-created **section rooms** (branch|semester|section|year) and **private chats** with a teacher that the teacher must approve; teachers and administrators can attach files, and can **message all their students at once, or chosen students**, from "Message students" (each student gets it in their own private chat and can answer).
- **Notifications:** a bell with unread count; rules for attendance, deadlines, marks, backlogs, risk band, follow-ups, contests; each situation stored **once** by a stable key.
- **Announcements:** placement, event, notice and poster posts with an auto-advancing strip at the top of staff workspaces.
- **Profile:** contact fields, bio, LinkedIn/GitHub, resume and target roles, **LeetCode username**.

---

## 6. Teacher workspace

Teachers see **only students assigned to them**. Shell: top menus (Academics, Support, Placement, Quick Links), a gradient icon rail with shortcuts, announcements strip, global search and the notification bell. It shares the student palette (blue-to-navy gradients, Inter/Manrope).

| Area                    | What a teacher does                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**            | Banner with headline numbers; cohort triage by risk band.                                                                                                                           |
| **My students**         | Filterable list, comparison of up to three students, and a **live student profile** (score breakdown, risk, attendance, LMS, skills, placement, engagement, LeetCode, predictions). |
| **Results**             | Class results and marks entry.                                                                                                                                                      |
| **Attendance & risk**   | Mark attendance per class; monitor lists of low attendance, academic risk and low LMS.                                                                                              |
| **LMS**                 | Configure units/topics, upload material, set assignments, grade submissions.                                                                                                        |
| **Skills**              | Record assessments.                                                                                                                                                                 |
| **Placement**           | Post drives with criteria and **rounds**, move applicants through stages and log mock interviews.                                                                                   |
| **Engagement**          | Post events/certifications and verify completion.                                                                                                                                   |
| **Interventions**       | Create support actions (reason, action, priority, owner, follow-up date); update status and outcome. Only for assigned students.                                                    |
| **Predictions (agent)** | Predicts every student in scope, compares with the previous run, raises alerts, returns a watchlist with reasons/actions/owners; one click turns an action into an intervention.    |
| **Analytics Copilot**   | See [8.5](#85-analytics-copilot).                                                                                                                                                   |
| **Chats / Feedback**    | Section rooms, approve private-chat requests, read notes on assigned records.                                                                                                       |
| **Announcements**       | Post updates to students.                                                                                                                                                           |

---

## 7. Administrator workspace

Everything a teacher has, across **all** students, plus:

| Area                               | Purpose                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All students / Student records** | Full list, create/edit records, **CSV import**, data-quality checks.                                                                                                                                                                                                                                        |
| **Teachers / Assign students**     | See teacher load and link each student to a mentor.                                                                                                                                                                                                                                                         |
| **Login credentials**              | Register students and teachers (manual form from the name alone, or a CSV with preview); the login ID and password are shown at once with a CSV download; **Password requests** tab to approve or reject forgot-password and password-change requests (pending count on the tab, notification in the bell). |
| **People & roles**                 | Grant or remove `faculty`/`admin`, delete accounts, reset passwords (temporary password shown once). Lists teachers and administrators, not students. The last administrator cannot be removed and you cannot remove your own admin role.                                                                   |
| **Admin analytics**                | Branch/year/cohort/band filters drive every chart; click a band or risk count to list students; coverage per source and data-quality alerts; intervention progress.                                                                                                                                         |
| **Messages**                       | Contact-form messages and password-reset requests.                                                                                                                                                                                                                                                          |
| **Complaints**                     | Review confidential complaints, set severity, assign, resolve with evidence; verify chain integrity.                                                                                                                                                                                                        |
| **Audit log**                      | Every insert/update of a student record with actor and time.                                                                                                                                                                                                                                                |
| **Predictions**                    | Train the learned models from live data (every run kept in `ml_models`).                                                                                                                                                                                                                                    |

---

## 8. Shared engines

### 8.1 Student Success Score

Weights (`src/lib/types.js`): Academics 30, Attendance 20, LMS 15, Engagement 10, Skills 10, Placement 15. Bands: **≥80 On Track, 65–79 Monitor, 50–64 Needs Attention, <50 High Priority**. Missing components are excluded and the rest re-scaled; attendance maps to marks (≥90→5 … <75→0). Feedback adds context but is not scored. Details: [SUCCESS_SCORE.md](SUCCESS_SCORE.md).

### 8.2 Risk flags

`risk-flags.js` evaluates two points-based tables — **Academic** and **Placement** — producing a level (High/Medium/Low/Insufficient data) and a sorted driver list (signal → value → threshold → points). Any High flag stops a student being shown as On Track.

### 8.3 Predictions and learned models

Fixed, published weights for placement/result predictions plus three cross-validated ridge regressions (student-grouped 5-fold). Accuracy, precision, recall and F1 are measured on the _decisions_ made from each number and compared with simple baselines. Full detail and caveats: [PREDICTIVE_RISK.md](PREDICTIVE_RISK.md) (every formula, threshold and accuracy figure) and [PREDICTIONS.md](PREDICTIONS.md).

### 8.4 Tamper-evident complaint audit chain

Every complaint event — `CREATED`, `ASSIGNED`, `SEVERITY_OVERRIDE`, `STATUS_CHANGED`, `REOPENED`, `RESOLUTION_EVIDENCE` — becomes a block in `chain_blocks` (`0014_complaint_chain.sql`, `chain.server.js`). Each block stores the previous block's hash; its own hash is **SHA-256** over the previous hash, event type, actor and a **canonical sorted-key JSON** payload (needed because `jsonb` reorders keys). Editing any past block breaks every later hash.

- The complaint page shows the **Audit trail** of blocks.
- **Verify integrity** recomputes every hash and reports the chain intact or names the first broken block.
- Demo: file a complaint, act on it as admin, verify, then `UPDATE chain_blocks SET payload = …` in SQL and verify again.
- It is a tamper-**evident** ledger in one database, not a distributed blockchain; an owner who rewrites the whole chain is not detected (that is what distribution adds).

### 8.5 Analytics Copilot

For teachers and administrators (`/portal/copilot`, in the rail just below **Academic**). Ask a question in plain language and get a **data-grounded answer, recommended actions and the evidence behind it**.

- **Scope:** the model can reach only the records the caller may see (admin: all; teacher: assigned). Students are refused. Rate limit: 20 questions per 10 minutes.
- **Tools** (fixed, read-only, Zod-validated — the model never writes SQL): `cohort_summary` (group by branch/semester/section/mentor/band), `find_students` (filter, sort, limit), `score_drivers` (component averages and how often each risk signal fires), `student_profile`, `support_actions`.
- **Evidence:** each tool call records the **exact rows it used** as an evidence table (id `E1`, `E2`, …) returned _beside_ the answer. The tables come from the server, not from the model's text.
- **Citations:** the answer cites `[E1, E3]`; clicking a citation opens and highlights its table. Cited tables are shown first; others are under "Also consulted". A reply with no data behind it shows a warning.
- **Models:** the main model (`LLM_*`), then **Grok** (`GROK_*`) as automatic fallback. Failures show the provider's real status/reason (never the key).
- **Honest limits:** it advises only and never changes data; student names/scores are sent to the AI provider as tool results.

### 8.6 Notifications

`notifications.server.js` turns rules into stored notifications per user. A stable key per situation stores each once; read state persists. They are generated when someone opens the app (and every minute while it is open), not by a background job — except LeetCode contest alerts, which the daily cron creates.

---

## 9. AI features and the model chain

| Feature                      | Who                 | Model path                             | Grounding                                                                                                                                                                                            |
| ---------------------------- | ------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pluto (public)**           | visitors            | `chat.server.js`, `LLM_*`              | product knowledge only; no records                                                                                                                                                                   |
| **Pluto (role-aware)**       | signed-in users     | `assistant.server.js`, `llm.server.js` | tools limited in SQL to the caller's role; a plain-code router (`assistant-router.js`) fetches data first so one question = one model call, with a plain-wording fallback when no model is reachable |
| **Analytics Copilot**        | teachers, admins    | `copilot.server.js`                    | tool results + evidence tables                                                                                                                                                                       |
| **AI lessons / interviews**  | students            | `modelCaller()`                        | schema-validated output, prompts server-side                                                                                                                                                         |
| **Prediction agent / coach** | teachers / students | `llm.server.js`                        | figures only; model just words the briefing                                                                                                                                                          |

`llm.server.js` tries configured providers in order (Hugging Face with `HF_API_KEY`, then Gemini with `LLM_API_KEY`) and skips one whose quota or key fails for a while. The Copilot uses its own chain (`LLM_*` → `GROK_*`). Keys and prompts never reach the browser.

---

## 10. Integrations

- **WhatsApp (Twilio):** signed webhook `/api/public/whatsapp`; `login` flow in chat (5 wrong passwords lock a number for 15 minutes; chat lasts 8 hours); commands `score`, `attendance`, `marks`, `timetable`, `assignments` (students) and `students`, `risk`, `low`, `student S-101` (staff). Same data and permissions as the site. See [WHATSAPP.md](WHATSAPP.md).
- **LeetCode:** public GraphQL, stored per student, refreshed daily.
- **Email (SMTP):** the login emailed to each newly registered person (optional).
- **Web research (roadmap.sh, Tavily, Wikipedia):** for the prediction coach.
- **Vercel Cron:** `vercel.json` daily job for LeetCode.

---

## 11. Database overview

PostgreSQL, migrations applied in order by `npm run db:migrate` (`0013` has two files with the same prefix; this is harmless).

| Migration  | Adds                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0001–0006  | users, roles, student records, interventions, audit, profile fields, campus updates, password resets, public contact, sessions |
| 0007       | notifications, LMS, login events, placement drives/applications, engagement, skills, feedback/complaints                       |
| 0008       | AI lessons and learning profiles                                                                                               |
| 0009       | attendance and timetable                                                                                                       |
| 0010       | resume and interviews                                                                                                          |
| 0011       | WhatsApp sessions                                                                                                              |
| 0012       | syllabus and subject reviews                                                                                                   |
| 0013       | dashboard chat (section rooms, private chats) · **LeetCode** accounts/contests/results                                         |
| 0014       | **complaint severity/assignment and `chain_blocks`** · student agent submissions                                               |
| 0016–0018  | agent plans, prediction inputs, ML models                                                                                      |
| 0019, 0021 | teachers/admins are not students                                                                                               |
| 0020       | chat attachments                                                                                                               |
| 0022       | interview integrity (violations, terminated state)                                                                             |
| 0023       | placement drive rounds and per-round results                                                                                   |

Student data is a validated `jsonb` document (`student_records.record`, schema in `src/lib/student-validation.js`) owned by a user and optionally assigned to a teacher. See [data-model.md](data-model.md).

---

## 12. Configuration, scripts and deployment

### Environment variables

| Variable                                               | Purpose                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `DATABASE_URL` (+ `DATABASE_SSL`, `DATABASE_POOL_MAX`) | PostgreSQL (use the pooled string on serverless)                          |
| `JWT_SECRET`                                           | 32+ random characters for session tokens                                  |
| `SMTP_URL`-free sign-up                                | no sign-up: create the first administrator with `npm run db:create-admin` |
| `SMTP_URL`, `APP_URL`, `MAIL_FROM`                     | email each new person their login (optional)                              |
| `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`             | main AI model (default Gemini via OpenAI-compatible API)                  |
| `GROK_API_KEY`, `GROK_MODEL`, `GROK_BASE_URL`          | Copilot fallback (defaults `grok-4`, `https://api.x.ai/v1`)               |
| `HF_API_KEY`, `TAVILY_API_KEY`                         | optional model provider / web research                                    |
| `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_URL`              | WhatsApp webhook                                                          |
| `CRON_SECRET`                                          | authorises the LeetCode cron route                                        |

`.env.example` documents each. **Never commit real values.** Environment variables must also be set on the host (e.g. Vercel) — a local `.env` is not deployed.

### Commands

| Command                       | Does                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                 | dev server                                                                        |
| `npm run build` / `npm start` | production build / run                                                            |
| `npm run db:migrate`          | apply SQL migrations                                                              |
| `npm run db:set-role`         | grant a role to an email                                                          |
| `npm run db:seed-demo`        | development sample data (accounts like `student001@insightiq.demo`, **dev only**) |
| `npm run db:check`            | verify the connection                                                             |
| `npm test` / `npm run lint`   | tests / ESLint                                                                    |

### Deploying on Vercel

Set the environment variables, run migrations against the production database, and keep `vercel.json` (daily LeetCode cron). Cron requests must carry `Authorization: Bearer $CRON_SECRET`.

---

## 13. Testing

Vitest. `src/test/db/*.test.js` run the **real migrations on in-memory PostgreSQL (PGlite)** and exercise permissions and behaviour: platform rules, LeetCode, the complaint chain (including tamper detection), cohort standing (privacy threshold), Copilot scope/evidence/model chain. `src/test/*.test.jsx` render components (score breakdown, planner, dashboard, login showcase, interview proctoring, prediction UI, landing loader). Pure logic (analytics, attendance maths, role match, linear regression, drive filters/rounds, interview reports) has unit tests.

---

## 14. Limits and honest caveats

- **Weights are published, not learned from outcomes** — there is no history of past placements/exam outcomes. Treat scores as a transparent early-warning estimate, not a verdict. The learned models report cross-validated accuracy and show baselines.
- **Notifications** are generated on app use rather than by a background job (except LeetCode contest alerts).
- **Rate limiting** is in-memory per instance; add platform-level limits for stronger protection.
- **Files** live in PostgreSQL (≤3 MB, documents/images only).
- **AI answers** can be wrong; the Copilot shows evidence so a human can check, and student data is sent to the configured AI provider — review this against your privacy policy.
- **WhatsApp** passwords stay in chat history and Twilio logs; treat the channel as lower security than the website.
- **The audit chain** detects tampering but is not distributed.
