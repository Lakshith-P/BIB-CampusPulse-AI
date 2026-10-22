# Platform features added in migration 0007

Run `npm run db:migrate` once before using any of these. Until then the new pages show an error
state and the rest of the app keeps working.

| Area                    | What it does                                                                                                                                                                                                                                                  | Who                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Notifications           | Rules (attendance, deadlines, marks, backlogs, risk band, overdue follow-ups) store notifications once each, with read/unread, priority, timestamp and a link. A bell in the header shows the unread count.                                                   | Everyone                                             |
| LMS                     | Six units per subject with syllabus topics, uploaded files, video/web links, lesson completion, one assignment per unit with due date, student submissions (text or file), grading, marks and remarks. Lesson and assignment progress feed the Success Score. | Teachers manage and grade; students learn and submit |
| Login frequency         | Every sign-in is stored in `login_events`; the LMS page shows logins this week and per week.                                                                                                                                                                  | Students                                             |
| Placement               | Teachers post drives with criteria (CGPA, backlogs, branches, batch, assessments). Each student sees a Passed / Not met / Unknown checklist. Applying re-checks eligibility on the server. Teachers move applicants through stages and log mock interviews.   | Teachers post; students apply                        |
| Role match              | Compares recorded skills with typical levels per role and lists skill gaps. Rule-based, not a prediction.                                                                                                                                                     | Students                                             |
| Engagement              | Events, clubs, hackathons and certifications with purpose, benefits, requirements, eligibility, how to apply and deadline. Students record their status; a teacher verifies completion, which then counts towards the score.                                  | Teachers post and verify                             |
| Skills                  | Teachers record assessments; the skill level used in the score is the mean of the latest three. Students see history, topic averages, weak areas (below 50) and practice suggestions.                                                                         | Teachers record                                      |
| Feedback centre         | Weekly satisfaction ratings (feed `record.satisfaction`), teacher notes, and confidential complaints readable only by the author and administrators. Notifications about complaints never contain their text.                                                 | Students; admins review                              |
| Attendance planner      | Targets of 75, 80, 85 and 90%, classes still to attend, classes that can be missed, and what-if projections with red/amber warnings that give a reason and an action.                                                                                         | Students                                             |
| Success Score breakdown | Select a component to see its supporting data; weights, effective weights when data is missing, positive and negative contributors, and the academic and placement rules that fired.                                                                          | Students, teachers                                   |
| Admin analytics         | Branch, year, cohort and band filters drive every chart; click a band to filter, click a risk count to list the students; coverage per source and data-quality alerts; intervention progress.                                                                 | Administrators                                       |

## Verification

- `src/test/db/platform.test.js` runs the real migrations on an in-memory PostgreSQL (PGlite) and
  exercises permissions: a teacher cannot manage another teacher's subject, a student cannot
  download another subject's file, complaints are hidden from teachers, ineligible students cannot
  apply, and verified activities change the stored record.
- `src/test/components.test.jsx` renders and clicks the score breakdown, attendance planner and
  dashboard cards.
- Pure logic (analytics, attendance maths, role match, skills insights) has its own tests.

## Known limits

- Skills are recorded by teachers. There is no built-in question bank, so "practice tests" are not
  conducted inside the app.
- Uploaded files are stored in PostgreSQL, limited to 3 MB, and only document and image types.
- Notifications are generated when someone opens the app (and every minute while it is open), not by a
  background job.
