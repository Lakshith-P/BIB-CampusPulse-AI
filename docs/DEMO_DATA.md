# Synthetic demo data

`npm run db:seed-demo` adds 20 teachers and 150 students with data in every section of the
dashboard. All of it is synthetic. Every demo account uses an `@insightiq.demo` email and the
password `Demo@12345`.

| Command                            | Effect                                                |
| ---------------------------------- | ----------------------------------------------------- |
| `npm run db:seed-demo`             | Adds the data. Refuses to run if it is already there. |
| `npm run db:seed-demo -- --reset`  | Removes the demo data, then adds it again.            |
| `npm run db:seed-demo -- --remove` | Removes the demo data only.                           |

Removal deletes only demo accounts, `SYN-` student records and content created by demo teachers.
Real accounts and records are left alone. The whole run is one transaction: it either completes or
changes nothing.

## What it contains

- **People:** 20 teachers (5 per branch: CSE, IT, ECE, MECH) and 150 students across years 1 to 4,
  sections A and B, both genders. Each student is linked to a teacher of their branch. Three
  students have an account but no data, to show the "no data yet" states.
- **Student profiles:** five shapes (strong, steady, low attendance, academic risk, placement gap)
  so every band, risk flag and segment appears. Year 1 students have no CGPA yet, as in real life.
- **Academics and attendance:** five subjects per branch and year, marks, subject-wise attendance,
  SGPA history, backlogs.
- **LMS:** six units for each of 69 subjects with syllabus topics, notes, video links and a course
  outline file; assignments with past and upcoming due dates; lesson progress; submissions, marks
  and remarks. Student records are rebuilt from these rows so the Success Score uses them.
- **Skills and placement:** about 1,300 assessments, mock interviews, six placement drives with
  criteria and applications at every stage.
- **Engagement:** ten events, clubs, hackathons and certifications with participation; verified
  activities are added to the students' records.
- **Feedback and support:** satisfaction ratings, teacher notes, interventions with outcomes, four
  confidential complaints, six campus updates, and a month of sign-ins.

Dates are relative to the day you run it, so deadlines are always a mix of past, soon and later.
The generator is deterministic (`scripts/demo-data/generate.js`), and its tests run on an in-memory
PostgreSQL (`src/test/db/demo-seed.test.js`).
