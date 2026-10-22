# Orbit Documentation

Orbit is a student success intelligence platform built by TEAM BIB (Biryani Intelligence Bureau) for the HacXLerate Smart Campus Analytics challenge. It brings seven student data sources (academics, attendance, LMS activity, skills, engagement, placement readiness and feedback) under one student identifier, computes an explainable **Student Success Score**, and lets mentors record and track interventions.

For every student, the platform answers three questions: who needs support, why, and what the faculty member should do next.

## Where to start

| I want to…                                           | Read                                        |
| ---------------------------------------------------- | ------------------------------------------- |
| Install, configure, run or deploy the app            | [Project README](../README.md)              |
| Understand how the system is put together            | [Architecture](architecture.md)             |
| Explain the score and segments (judges' note)        | [Success Score note](success-score-note.md) |
| Understand the database and the student record       | [Data model](data-model.md)                 |
| Find out what the server exposes and who may call it | [Server functions](server-functions.md)     |
| Work on the code, add a feature, run the tests       | [Development guide](development.md)         |

## The product in brief

The app has three separate surfaces:

| Surface           | Routes                                                | Data                       | Authentication |
| ----------------- | ----------------------------------------------------- | -------------------------- | -------------- |
| Public website    | `/`, `/solution`, `/benefits`, `/privacy`, `/contact` | None                       | None           |
| Role-based portal | `/portal/*`                                           | Live records in PostgreSQL | Required       |

The website assistant ("Pluto") appears on the public pages. It has no access to student records.

### Roles

| Role      | Can see                                        | Can change                                                        |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `student` | Their own record and interventions             | Their own profile fields; feedback about their own record         |
| `faculty` | Records of students assigned to them           | Interventions for those students; feedback notes on those records |
| `admin`   | Every record, account, message and audit entry | Student records, role grants, teacher assignments                 |

New accounts are always created as `student`. Staff roles are granted by an administrator (or by the `db:set-role` script for the first one).

### Scoring in one table

| Component                             | Weight |
| ------------------------------------- | ------ |
| Academics (CGPA × 10)                 | 30%    |
| Attendance                            | 20%    |
| LMS completion                        | 15%    |
| Engagement (verified activities only) | 10%    |
| Skills (average)                      | 10%    |
| Placement readiness                   | 15%    |

Bands: 80 and above **On Track**, 65 to 79 **Monitor**, 50 to 64 **Needs Attention**, below 50 **High Priority**. Missing data is never treated as zero: components without data are left out and the remaining weights are rescaled. The weights live in `src/lib/types.js` and the calculations in `src/lib/scoring.js`. Dual Academic Risk and Placement Risk flags, built from a points table, live in `src/lib/risk-flags.js`.

## Design principles

These come from the project's `AGENTS.md` and shape most of the code.

3. **The server decides.** Record access is enforced in authenticated server functions with SQL that checks the caller's roles. Navigation hiding is cosmetic.
4. **Roles come from the database.** The JWT identifies the user; roles are re-read on every request.
5. **Writes are confirmed.** Mutations return success only after the database write, then invalidate the shared campus query so derived scores refresh.
6. **Missing is not zero.** Pages state when data has not been recorded.
7. **Plain JavaScript.** `src/routeTree.gen.ts` is the only TypeScript file and is generated.
