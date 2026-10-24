# Predictions, risk levels and agents

Every student has two predictions, a risk level and a list of recommended actions. Students see
their own, a teacher sees those of assigned students, and an administrator sees everyone's.
Code: `src/lib/prediction.js` (the models), `src/backend/predictions.server.js` (data, agents,
alerts). For every formula, threshold, worked examples and the accuracy of the learned models see
[PREDICTIVE_RISK.md](PREDICTIVE_RISK.md).

## Placement prediction (0-100)

| Criterion       | Weight | How it is turned into 0-100                                                 |
| --------------- | ------ | --------------------------------------------------------------------------- |
| LeetCode        | 25     | easy x 1 + medium x 3 + hard x 6 points, divided by 4, capped at 100        |
| Aptitude        | 20     | the aptitude skill score                                                    |
| CGPA            | 20     | CGPA x 10                                                                   |
| Mock interviews | 20     | average of the latest 3 scores, discounted when fewer than 3 have been done |
| Resume          | 15     | resume completeness %                                                       |

A criterion with no data is left out and the others are scaled up; confidence drops instead of the
criterion counting as zero. The **projected** score extends the recent aptitude and mock-interview
trend over 12 weeks at half strength. Bands: 75+ Placement-ready, 60-74 On track, 45-59 Needs work,
below 45 At risk.

## Result prediction (per subject, then overall)

| Component              | Weight | Source                                                          |
| ---------------------- | ------ | --------------------------------------------------------------- |
| Mid exams              | 35     | mid 1 and mid 2 as %, with the later exam counting 60%          |
| Continuous assessments | 25     | quizzes and lab tests entered by teachers, plus graded LMS work |
| Attendance             | 25     | the subject's attendance %                                      |
| Teacher rating         | 15     | rating out of 5 for the subject, else the overall rating        |

A subject needs at least a mid exam or a continuous score to be predicted. Outlook: below 40 At
risk, 40-54 Watch, 55+ Safe; attendance under 75% lowers a Safe subject to Watch and is flagged as
an exam-eligibility risk. The predicted SGPA uses the same grade bands as the results page.

## Risk level and alerts

High: a subject predicted below 40, attendance under 75% in two or more subjects, or a placement
score under 45. Medium: a subject close to the pass mark, one low-attendance subject, or a
placement score of 45-59. Whenever the cohort agent or the student's coach runs, high-risk
students (and students who just moved up to Medium) trigger a notification to their teacher and
to every administrator, and the student gets their own top steps. Alerts are keyed by student,
level and week, so repeated runs do not repeat them.

## Agents

- **Prediction agent** (teachers and administrators, `Predictions` page): predicts every student in
  scope, stores the run (`student_predictions`), compares with the previous run, raises alerts,
  and returns a watchlist with reasons, actions and owners. A watchlist action can be turned into
  a support action in one click. A language model, when configured, writes a short briefing from
  the figures only.
- **Prediction coach** (students): re-predicts, researches the chosen role, ranks the five
  placement criteria by score gain x market importance and builds a plan that never repeats
  finished steps. With `HF_API_KEY` the importance values and trend notes are read from the
  researched sources; without it, general hiring priors are used and the page says so.

## Inputs

| Input                              | Entered by           | Table             |
| ---------------------------------- | -------------------- | ----------------- |
| LeetCode counts and contest rating | student (or teacher) | `coding_profiles` |
| Mid exams, continuous assessments  | teacher              | `exam_scores`     |
| Teacher rating                     | teacher              | `teacher_ratings` |

Students can also sync their LeetCode counts from their public profile. Run
`npm run db:seed-predictions` to fill these tables for the synthetic `SYN-` students
(`-- --remove` deletes them again).

## Learned models (linear regression)

Besides the fixed-weight scores above, three ridge-regression models are trained on the platform's
own records (`src/lib/linreg.js`, `src/backend/ml-models.server.js`). An administrator retrains them
from live data on the Predictions page (stored in `ml_models`, every run kept).

| Model     | Predicts                | Features                                                        |
| --------- | ----------------------- | --------------------------------------------------------------- |
| Result    | final marks per subject | mid exams, continuous assessments, attendance, teacher rating   |
| Next term | next semester's SGPA    | last SGPA, average of earlier SGPAs, trend, semesters completed |
| Interview | mock-interview score    | LeetCode points, aptitude, CGPA, resume                         |

**How accuracy is measured.** Every model is cross-validated (5 folds) with all rows of one student
kept in the same fold, so it is always scored on students it has not seen. A regression predicts a
number, so accuracy, precision, recall and F1 are measured on the decisions made from it, for
example "predicted marks below 40 means fail" or "predicted SGPA higher than the last one means
improving". Each model is also compared with simple baselines (the average, repeating the last
SGPA, the fixed-weight formula).

**Per-prediction confidence.** Each prediction carries a 90% range from the model's held-out error
and a confidence that the student is on the predicted side of the pass mark (or 6.0 SGPA, or the
interview readiness line of 60). The confidence assumes errors like those seen in cross-validation.

**What would improve it.** A linear model's effect per unit times a realistic change gives a ranked
list ("+10 continuous assessment: about +2.8 marks"). These are associations in past records, not
proof that a change will cause the result.

## What the numbers are not

The weights are fixed and published, not learned from historical outcomes, because the platform
has no record of past placement results or exam outcomes to learn from. Treat the scores as a
transparent, early-warning estimate. On the synthetic demo data the seeded mid-exam scores are
derived from each student's stored marks, so agreement between predicted and recorded marks there
is expected and is not independent validation.
