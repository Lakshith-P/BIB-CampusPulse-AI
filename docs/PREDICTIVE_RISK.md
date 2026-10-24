# Predictive Risk & AI: every metric explained

This is the reference for everything behind the **Predictive Risk & AI** page (students), the
**Predictions** page (teachers and administrators) and the alerts they raise. It explains what each
number means, the exact formula, the thresholds, how accurate the learned models are and where the
numbers should not be trusted.

Source files: `src/lib/types.js`, `src/lib/scoring.js`, `src/lib/risk-flags.js`,
`src/lib/prediction.js`, `src/lib/linreg.js`, `src/lib/classify.js`,
`src/backend/predictions.server.js`, `src/backend/ml-models.server.js`.

## Contents

1. [The layers, from simplest to most advanced](#1-the-layers-from-simplest-to-most-advanced)
2. [Student Success Score and bands](#2-student-success-score-and-bands)
3. [Risk flags (rule-counted)](#3-risk-flags-rule-counted)
4. [Placement prediction](#4-placement-prediction)
5. [Result prediction](#5-result-prediction)
6. [The overall risk level](#6-the-overall-risk-level)
7. [Recommended actions](#7-recommended-actions)
8. [Learned models (linear regression)](#8-learned-models-linear-regression)
9. [How the learned models are measured](#9-how-the-learned-models-are-measured)
10. [Results of the latest training run](#10-results-of-the-latest-training-run)
11. [Per-prediction confidence and ranges](#11-per-prediction-confidence-and-ranges)
12. [Agents and alerts](#12-agents-and-alerts)
13. [Inputs and who enters them](#13-inputs-and-who-enters-them)
14. [Glossary of metrics](#14-glossary-of-metrics)
15. [Limits and honest caveats](#15-limits-and-honest-caveats)

## 1. The layers, from simplest to most advanced

| Layer                | What it produces                                                           | How                                                    | Learned from data? |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------ |
| Success Score        | One 0-100 number and a band (On Track ... High Priority)                   | Six weighted components                                | No (fixed weights) |
| Risk flags           | Academic risk and Placement risk: Low / Medium / High                      | Points from a published list of signals                | No (rules)         |
| Placement prediction | 0-100 placement score, a 12-week projection, a band                        | Five weighted criteria                                 | No (fixed weights) |
| Result prediction    | Predicted marks per subject, predicted SGPA, outlook                       | Four weighted components per subject                   | No (fixed weights) |
| Overall risk level   | High / Medium / Low with reasons                                           | Rules over the two predictions                         | No (rules)         |
| Learned models       | Marks, next-term SGPA, interview score, each with a range and a confidence | Ridge linear regression, cross-validated               | **Yes**            |
| Agents               | Watchlist, alerts, a personal improvement plan                             | The layers above plus optional language model/research | Mixed              |

Everything is explainable: each prediction lists the inputs that drove it, and **missing data is
never treated as zero**. A component with no data is left out, the remaining weights are scaled up,
and the confidence drops instead.

## 2. Student Success Score and bands

The Success Score is a weighted average of six components, each on a 0-100 scale.

| Component  | Weight | How the 0-100 value is made                                                                                    |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Academics  | 30%    | CGPA x 10                                                                                                      |
| Attendance | 20%    | Classes attended / classes held, over all subjects                                                             |
| LMS        | 15%    | Mean of lesson completion % and assignment completion % (whichever exist)                                      |
| Engagement | 10%    | `min(100, clubs x 8 + events x 4 + hackathons x 12 + certifications x 10)`; only verified activities count     |
| Skills     | 10%    | Mean of coding, aptitude, verbal and communication scores that are recorded                                    |
| Placement  | 15%    | Resume completeness (40%), assessments completed % (30%), mock interviews as `min(100, count / 3 x 100)` (30%) |

Missing components are removed and the other weights are re-normalised: for example, with no LMS
data the score is computed from the other five, each weight divided by 85 instead of 100. The page
shows the **data completeness** (how many of the six components exist).

| Band            | Score        |
| --------------- | ------------ |
| On Track        | 80 and above |
| Monitor         | 65 to 79     |
| Needs Attention | 50 to 64     |
| High Priority   | below 50     |

**Band override.** A student whose score says _On Track_ but who has a **High** academic or
placement risk flag is shown as **Monitor**. A good average must not hide a serious problem.

**Attendance marks** (a separate figure on the Attendance page): 90% and above = 5, 85-89.9 = 4,
80-84.9 = 3, 75-79.9 = 2, below 75% = 0 and a warning.

**Segments.** Each student is also placed in one pattern with a suggested action, for example _High
academics, low placement readiness_ (resume clinic, mock interviews), _Strong grades, poor
attendance_ (attendance contract), _Good attendance, declining academics_ (doubt sessions), _Strong
coder, aptitude gap_, _Disengaged, multiple risks_ (weekly mentoring), _On track_ or _Steady_.

## 3. Risk flags (rule-counted)

Two flags are counted from fixed signals. Each signal that fires adds points. These are **not
predictions**: they only report which published rule fired and by how much.

### Academic risk: High at 5 points or more, Medium at 2 or more

| Signal                        | Fires when          | Points               |
| ----------------------------- | ------------------- | -------------------- |
| Active backlogs               | Backlogs 1 or more  | 3                    |
| CGPA                          | CGPA below 6.0      | 3                    |
| SGPA drop since last term     | Drop of 1.0 or more | 2                    |
| Overall attendance            | Below 75%           | 3                    |
| Subjects under 75% attendance | 1 or more subjects  | 1 per subject, max 3 |
| LMS lesson completion         | Below 50%           | 2                    |
| Assignment completion         | Below 60%           | 1                    |

### Placement risk: High at 6 points or more, Medium at 3 or more

| Signal                      | Fires when     | Points |
| --------------------------- | -------------- | ------ |
| Placement readiness         | Below 60%      | 3      |
| Aptitude score              | Below 50       | 2      |
| Coding score                | Below 50       | 2      |
| Resume completeness         | Below 70%      | 1      |
| Mock interviews             | None completed | 2      |
| Assessments completed       | Below 50%      | 1      |
| Certifications + hackathons | None           | 1      |

A signal with no data is listed as _insufficient data_ and adds nothing. If **every** signal of a
flag lacks data the level is _Insufficient data_, not Low.

## 4. Placement prediction

A transparent weighted model of how ready a student is for campus placement.

| Criterion       | Weight | How it becomes 0-100                                                                                               |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| LeetCode        | 25     | `points = easy + 3 x medium + 6 x hard`; value = `min(100, points / 4)`                                            |
| Aptitude        | 20     | The aptitude skill score                                                                                           |
| CGPA            | 20     | CGPA x 10                                                                                                          |
| Mock interviews | 20     | Mean of the **latest 3** scores, multiplied by `0.5 + 0.5 x min(1, interviews / 3)` (a discount when fewer than 3) |
| Resume          | 15     | Resume completeness %                                                                                              |

**Score** = sum of `weight x value` over the criteria that have data, divided by the sum of their
weights.

**Projection (12 weeks).** For criteria with a trend (aptitude and mock interviews, from dated
history), the value is extended by **half** the weekly slope over the horizon:
`value + 0.5 x slope x 12`, clamped to 0-100. Half strength is deliberate: trends rarely continue
in a straight line.

**Confidence** depends on how much of the total weight (100) had data: **High** at 85% coverage or
more, **Medium** at 60% or more, otherwise **Low**.

**Bands:** 75 and above _Placement-ready_ ; 60-74 _On track_ ; 45-59 _Needs work_ ; below 45 _At risk_.

**Drivers** show what pushed the score up or down: `weight / total x (value - 60)`. 60 is the
benchmark: a criterion at 60 neither helps nor hurts.

**Sections to improve** rank each criterion by the points the score would gain if it rose to 75:
`weight / total x max(0, 75 - value)`.

### Worked example

A student with CGPA 7.4, resume 70%, aptitude 62 (up from 55 two months ago), 40 easy / 25 medium /
5 hard LeetCode problems and mock scores 55, 60, 68:

| Criterion       | Value | Weight | Why                                                    |
| --------------- | ----- | ------ | ------------------------------------------------------ |
| LeetCode        | 36.3  | 25     | 40 + 3 x 25 + 6 x 5 = 145 points; 145 / 4 = 36.25      |
| Aptitude        | 62    | 20     |                                                        |
| CGPA            | 74    | 20     |                                                        |
| Mock interviews | 61    | 20     | mean of 55, 60, 68 = 61; three interviews, no discount |
| Resume          | 70    | 15     |                                                        |

Score = (25 x 36.25 + 20 x 62 + 20 x 74 + 20 x 61 + 15 x 70) / 100 = **59.0**, band **Needs work**,
confidence **High** (all criteria present). With the aptitude and mock trends the 12-week
projection is **61.7** (_On track_). The biggest gain is LeetCode: raising it to 75 adds about 9.7
points; mock interviews add 2.8.

## 5. Result prediction

Predicts each subject's final marks from four components. It needs **at least a mid-exam or a
continuous score** for a subject; otherwise the subject says _Insufficient data_.

| Component              | Weight | Source                                                                                         |
| ---------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Mid exams              | 35     | Mid 1 and mid 2 as %: `0.4 x mid1 + 0.6 x mid2` (a single mid counts alone)                    |
| Continuous assessments | 25     | Mean % of quizzes/lab tests entered by teachers **and** graded LMS assignments of that subject |
| Attendance             | 25     | The subject's attended / held %                                                                |
| Teacher rating         | 15     | Rating out of 5 for the subject (else the student's overall rating), as `rating / 5 x 100`     |

**Predicted marks** = weighted average over the components that exist (weights re-scaled).

**Outlook:** below 40 _At risk_ ; 40-54 _Watch_ ; 55 and above _Safe_. Attendance **below 75%**
lowers a _Safe_ subject to _Watch_ and flags **exam-eligibility risk**; the page then shows how many
classes in a row bring the subject back to 75%.

**Predicted SGPA** applies the same grade bands as the Results page to each predicted mark and
averages them by credits: 90+ = 10 points (O), 80+ = 9 (A+), 70+ = 8 (A), 60+ = 7 (B+), 50+ = 6 (B),
40+ = 5 (C), below 40 = 0 (F, fail; the pass mark is 40).

**Overall result band** is the worst subject outlook (_At risk_ > _Watch_ > _Safe_). The overall
score is the mean of the predicted subject marks.

### Worked example (same student)

| Subject | Mid exams          | Continuous | Attendance   | Rating     | Predicted | Outlook                      |
| ------- | ------------------ | ---------- | ------------ | ---------- | --------- | ---------------------------- |
| Maths   | 61.6 (64% and 60%) | 60         | 72.5 (29/40) | 80 (4/5)   | **66.7**  | Watch (attendance below 75%) |
| DBMS    | 38.4 (42% and 36%) | 45         | 90 (36/40)   | 50 (2.5/5) | **54.7**  | Watch                        |

Maths: (35 x 61.6 + 25 x 60 + 25 x 72.5 + 15 x 80) / 100 = 66.7. It would be _Safe_, but attendance
72.5% is under 75%, so it is _Watch_ with a note that 4 more classes in a row are needed. Predicted
SGPA: Maths 66.7 is B+ (7), DBMS 54.7 is B (6), equal credits, so **6.5**.

## 6. The overall risk level

One level per student, with the reasons shown to the student, teacher and administrator.

| Level             | When                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High**          | A subject is predicted to fail (below 40); **or** attendance is below 75% in **two or more** subjects; **or** the placement prediction is _At risk_ (below 45)   |
| **Medium**        | A subject is predicted close to the pass mark (below 55); **or** attendance is below 75% in one subject; **or** the placement prediction is _Needs work_ (45-59) |
| **Low**           | None of the above                                                                                                                                                |
| Insufficient data | Neither prediction can be made from what is recorded                                                                                                             |

In the worked example the level is **Medium**: attendance under 75% in Maths, DBMS (54.7) close to
the pass mark and a placement score of 59.

## 7. Recommended actions

Actions are generated, not typed. Each names the number it is based on, who owns it and a priority.

- **Placement actions** come from the sections-to-improve list (any gain of 1 point or more), for
  example "Solve about 52 more medium problems (or 26 hard) to reach a LeetCode score of 75" or
  "Complete 1 more mock interview and aim for an average of 75". Owner: the training and placement
  cell (CGPA actions: the faculty mentor).
- **Result actions**: an attendance action when a subject is under 75% ("Attend the next 4 classes of
  Maths to bring attendance from 72.5% to 75%") and an action on the subject's weakest component
  (revise mid-exam topics, finish pending assignments, meet the teacher for feedback).
- **Priority:** _high_ for placement _At risk_ with a gain of 5 or more, for attendance actions and
  for failing subjects; _medium_ for gains of 6 or more or _Watch_ subjects; otherwise _low_.

## 8. Learned models (linear regression)

The fixed-weight predictions above are transparent but their weights are chosen by people. Three
**ridge linear regressions** are also trained on the platform's own records, so the platform can say
how well numbers like these predict real outcomes. An administrator retrains them from live data on
the **Predictions** page; every run is kept in `ml_models`.

| Model           | Predicts                         | Features                                                                          | Training rows come from                                                                              |
| --------------- | -------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Result model    | Final marks of a subject (0-100) | Mid exams %, continuous %, attendance %, teacher rating (of 100)                  | Each subject that has mid, continuous and attendance data and recorded marks                         |
| Next-term model | Next semester's SGPA (0-10)      | Last SGPA, average of earlier SGPAs, SGPA trend per semester, semesters completed | Each past semester that has earlier history                                                          |
| Interview model | Mock-interview score (0-100)     | LeetCode points, aptitude, CGPA x 10, resume %                                    | One row per student with all four features and at least one mock interview (the mean of their mocks) |

**How a ridge regression works here.** Each feature is standardised (mean 0, standard deviation 1).
The model finds one weight per feature plus an intercept that minimise squared error, with an L2
penalty (`lambda = 3`) that shrinks the weights so correlated features (attendance and marks tend to
move together) do not produce wild values. The equations are solved exactly (no iterative
training); the same inputs always give the same model. A model needs **at least 30 rows**.

A missing teacher rating in the result model is replaced by the average rating (or a neutral 60 if
no teacher has rated anyone), so those subjects can still be used.

**What each feature is worth.** The page shows the model's **effect per unit** (for example, +10
continuous-assessment points moves predicted marks by about +2.8) and a ranked list of "what would
raise this most". These are associations in past records, **not proof that a change will cause the
result**.

## 9. How the learned models are measured

A student's rows are **never in both training and testing**. Models are scored with **5-fold
cross-validation grouped by student**: students are split into five groups; each group is predicted
by a model trained on the other four. So every number below describes students the model had never
seen.

### Error of the number itself

| Metric    | Meaning                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| MAE       | Mean absolute error: how far off the prediction is on average, in the model's own unit (marks, SGPA)                          |
| RMSE      | Root mean squared error: like MAE but large misses count more; used for ranges and confidence                                 |
| R-squared | Share of the differences between students that the model explains (1 = all; 0 = no better than the average; negative = worse) |

### Accuracy, precision, recall and F1 (of the decisions)

A regression predicts a number, so these four are measured on the **decision made from the number**
("predicted marks below 40 means fail"), compared with what happened:

| Term      | Question it answers                                        | Formula                   |
| --------- | ---------------------------------------------------------- | ------------------------- |
| Accuracy  | Of all students, how many did it call correctly?           | (TP + TN) / all           |
| Precision | Of those flagged, how many really were that case?          | TP / (TP + FP)            |
| Recall    | Of those who really were that case, how many were flagged? | TP / (TP + FN)            |
| F1        | One number balancing precision and recall                  | 2 x P x R / (P + R)       |
| Macro F1  | F1 averaged over both classes (flagged and not flagged)    | mean of the two F1 values |
| Support   | How many students really were that case                    | TP + FN                   |

TP = flagged and really so, FP = flagged but not so, FN = missed, TN = correctly left alone. The page
shows the full confusion counts.

### Baselines

Every model is compared with simple competitors, so a good-looking number means something:

| Model           | Baselines                                                                |
| --------------- | ------------------------------------------------------------------------ |
| Result model    | "Always predict the average" and the fixed-weight formula from section 5 |
| Next-term model | "Always predict the average" and "repeat the last SGPA"                  |
| Interview model | "Always predict the average"                                             |

### Decisions scored for each model

| Model           | Decision 1 (headline)                   | Decision 2                              |
| --------------- | --------------------------------------- | --------------------------------------- |
| Result model    | **Fail**: final marks below 40          | Needs attention: final marks below 55   |
| Next-term model | **Weak semester**: SGPA below 6.0       | Improves: SGPA higher than the last one |
| Interview model | **Not interview-ready**: score below 60 | Strong: score of 75 or more             |

## 10. Results of the latest training run

Trained on the platform's current records on **24 October 2026**. These are the numbers from the
database (`ml_models`); they change whenever an administrator retrains.

| Model           | Rows (students) | MAE         | RMSE | R-squared | Best baseline for comparison                                        |
| --------------- | --------------- | ----------- | ---- | --------- | ------------------------------------------------------------------- |
| Result model    | 735 (147)       | 4.56 marks  | 5.58 | 0.859     | Fixed-weight formula: MAE 5.83, R-squared 0.767; average: MAE 12.03 |
| Next-term model | 434 (109)       | 0.41 SGPA   | 0.54 | 0.835     | Repeat last SGPA: MAE 0.42, R-squared 0.823; average: MAE 1.06      |
| Interview model | 102 (102)       | 7.14 points | 8.70 | 0.573     | Average: MAE 11.01, R-squared -0.012                                |

| Model / decision                     | Accuracy | Precision | Recall | F1    | Students who really were that case (support) |
| ------------------------------------ | -------- | --------- | ------ | ----- | -------------------------------------------- |
| Result: **Fail** (below 40)          | 0.978    | 0.833     | 0.536  | 0.652 | 28 of 735                                    |
| Result: Needs attention (below 55)   | 0.955    | 0.863     | 0.804  | 0.832 | 102                                          |
| Next-term: **Weak semester** (< 6.0) | 0.977    | 0.935     | 0.860  | 0.896 | 50 of 434                                    |
| Next-term: Improves                  | 0.592    | 0.533     | 0.387  | 0.449 | 186                                          |
| Interview: **Not interview-ready**   | 0.824    | 0.833     | 0.385  | 0.526 | 26 of 102                                    |
| Interview: Strong (75+)              | 0.784    | 0.744     | 0.707  | 0.725 | 41                                           |

**How to read this honestly**

- The **result model** predicts marks to within about 4.6 marks on average, clearly better than the
  fixed-weight formula (5.8) and far better than guessing the average (12.0). Its **Fail**
  decision is cautious: when it says fail it is right 83% of the time (precision), but it finds only
  54% of the students who really fail (recall). Treat "predicted to fail" as a reliable alarm and
  "not predicted to fail" as not a guarantee.
- The **next-term model** is only marginally better than repeating the last SGPA (0.41 vs 0.42),
  which is normal: a student's last result is already a strong predictor. It is good at spotting a
  weak semester (F1 0.90) and poor at telling whether a student will _improve_ (accuracy 0.59, close
  to a coin flip), so the page does not lean on that decision.
- The **interview model** explains 57% of the variation in mock-interview scores from only 102
  students. It is the weakest of the three and misses most students who are not ready (recall 0.39).
  With more mock interviews recorded it will improve.
- On the **synthetic demo data** the seeded mid-exam scores are derived from each student's stored
  marks, so agreement between predicted and recorded marks there is expected and is **not**
  independent validation. Real data from your campus is what makes these numbers meaningful.

## 11. Per-prediction confidence and ranges

Besides the model's overall quality, each individual prediction carries:

| Figure                    | How it is calculated                                                                                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **90% range**             | `prediction +/- 1.645 x RMSE`, where RMSE is the cross-validated error. Clamped to the unit's limits (0-100 marks, 0-10 SGPA)                                                                                                                                               |
| **Headline decision**     | Whether the prediction is on the flagged side of the headline line (marks < 40, SGPA < 6.0, interview < 60)                                                                                                                                                                 |
| **Confidence**            | How sure the model is that the student is on that side of the line. With `z = (prediction - line) / RMSE`, confidence = `max(Phi(z), 1 - Phi(z))`, where Phi is the standard normal curve. 0.50 means the prediction sits exactly on the line; 0.99 means it is far from it |
| **Drivers**               | Each feature's contribution: its weight times how far this student's value is from the average student's                                                                                                                                                                    |
| **What would improve it** | Effect per unit times a realistic change, ranked                                                                                                                                                                                                                            |

Example: the result model has RMSE 5.58. A subject predicted at 46 marks has `z = (46 - 40) / 5.58 =
1.08`, so the model is about 86% sure the student passes, and the 90% range is 36.8 to 55.2. A subject
predicted at 41 is only about 57% sure.

The confidence assumes errors like those seen in cross-validation (roughly bell-shaped with the
held-out RMSE). It is a guide, not a guarantee.

## 12. Agents and alerts

### Prediction agent (teachers and administrators)

On the **Predictions** page, _Run the agent_ does the following for every student in scope (a
teacher's assigned students, or the whole campus, optionally filtered by branch and graduation year):

1. Predicts each student (sections 4-7).
2. Stores the run in `student_predictions` and compares it with each student's previous run.
3. Raises alerts (below).
4. Returns: counts by risk level, students who **newly** became High, average placement and result
   scores, a per-branch table, the **weakest criteria across the cohort**, and a **watchlist** of up
   to 15 High/Medium students sorted by level then lowest predicted result, each with reasons,
   suggested actions and owners. One click turns a watchlist action into a support intervention.
5. If a language model is configured, writes a short briefing **from these figures only** (it is not
   allowed to add numbers).

### Prediction coach (students)

A student picks a target role (a preset or typed). The coach re-predicts, researches the role
(roadmap.sh, optional Tavily web search, Wikipedia; cached for a week), ranks the five placement
criteria by **score gain x market importance**, and builds a checklist plan that never repeats
finished steps and cites its sources. With a Hugging Face key, importance and trend notes are read
from the researched sources; without one, general hiring priors per role are used, and the page says
so.

### Alerts

When the agent or the coach runs:

- A student who is **High** risk, or who just moved up to **Medium**, triggers a notification to
  their **teacher** and to **every administrator**, with the top reasons and a link to the student.
- The **student** gets their own notification with their top three next steps.
- Notifications are keyed by student, level and **ISO week**, so running the agent again in the same
  week does not repeat an alert.

## 13. Inputs and who enters them

| Input                                                          | Entered by                                                     | Table                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| CGPA, backlogs, SGPA history, subject marks, attendance counts | Teacher / administrator                                        | `student_records` (JSON record)        |
| LeetCode counts and contest rating                             | Student (synced from their public LeetCode profile) or teacher | `leetcode_accounts`, `coding_profiles` |
| Mid exams and continuous assessments                           | Teacher                                                        | `exam_scores`                          |
| Teacher rating (overall or per subject)                        | Teacher                                                        | `teacher_ratings`                      |
| Graded LMS assignments                                         | Teacher                                                        | LMS tables                             |
| Skills (coding, aptitude, verbal, communication)               | Teacher (assessments)                                          | `skill_assessments`                    |
| Mock interviews                                                | Teacher, or the student's AI mock interview                    | `mock_interviews`                      |
| Resume completeness                                            | Student (resume upload / checker)                              | student record                         |
| Engagement                                                     | Student records it, teacher verifies                           | `opportunity_participation`            |

`npm run db:seed-predictions` fills the exam, rating and coding tables for the synthetic `SYN-`
students (`-- --remove` deletes them).

## 14. Glossary of metrics

| Term                            | Meaning                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CGPA / SGPA                     | Cumulative / semester grade point average on a ten-point scale                                                                            |
| Success Score                   | Weighted 0-100 summary of six components (section 2)                                                                                      |
| Band                            | On Track, Monitor, Needs Attention, High Priority (Success Score); Placement-ready ... At risk (placement); Safe, Watch, At risk (result) |
| Risk level                      | High, Medium, Low from the two predictions (section 6)                                                                                    |
| Risk flag                       | Academic or Placement risk counted from published signals and points (section 3)                                                          |
| Driver                          | An input and how much it moved a score above or below the benchmark of 60                                                                 |
| Coverage                        | Share of the model's weight that had data; sets the confidence label (High, Medium, Low)                                                  |
| Projection                      | The placement score extended 12 weeks by half the recent trend                                                                            |
| Exam eligibility risk           | Attendance below 75% in a subject, which may bar a student from the exam                                                                  |
| Cross-validation                | Scoring a model only on students it was not trained on                                                                                    |
| MAE, RMSE, R-squared            | Size of the typical error, error that punishes big misses, and share of variation explained                                               |
| Accuracy, precision, recall, F1 | How good a yes/no decision made from a prediction is (section 9)                                                                          |
| Support                         | Number of students who really were the flagged case                                                                                       |
| 90% range                       | Interval expected to contain the true value 9 times in 10                                                                                 |
| Baseline                        | A simple rival (the average, the last value, the fixed formula) the model must beat                                                       |
| Ridge                           | Linear regression with a penalty that keeps weights small and stable                                                                      |

## 15. Limits and honest caveats

- **Weights are published, not learned.** The placement weights (25/20/20/20/15) and result weights
  (35/25/25/15) are fixed choices. The platform has no history of real placement outcomes to learn
  them from. Treat the placement score as a transparent early-warning estimate, not a probability of
  getting a job.
- **The learned models see only what is recorded.** They know nothing about health, family
  circumstances, teaching quality or an exam being unusually hard.
- **Associations, not causes.** "+10 continuous assessment: about +2.8 marks" describes past
  records, not what is guaranteed to happen if one student improves.
- **Small samples.** The interview model learned from 102 students and the "Improves" decision is
  close to chance. Read the accuracy tables before relying on a decision.
- **A prediction is not a decision about a student.** It is meant to start a conversation: a teacher
  looks at the reasons, and a human decides what support is right. Nothing is changed in a student's
  record automatically.
- **Privacy.** Students see only their own predictions; a teacher sees only assigned students; the
  cohort comparison on the dashboard returns only aggregates and nothing for a group smaller than 5.
