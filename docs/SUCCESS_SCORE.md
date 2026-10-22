# Student Success Score: method note

The Success Score (0–100) combines six indicators built from the integrated student data.
Code: `src/lib/scoring.js` (score), `src/lib/risk-flags.js` (risk flags), `src/lib/types.js` (weights, bands).

## Indicators and how each is turned into 0–100

| Indicator  | Weight | Source fields                             | Formula                                                                           |
| ---------- | ------ | ----------------------------------------- | --------------------------------------------------------------------------------- |
| Academics  | 30%    | CGPA, marks, backlogs                     | CGPA × 10                                                                         |
| Attendance | 20%    | classes held / attended per subject       | total attended ÷ total held × 100                                                 |
| LMS        | 15%    | lessons, assignments, logins              | mean of lesson-completion % and assignment-submission %                           |
| Engagement | 10%    | events, clubs, hackathons, certifications | min(100, clubs×8 + events×4 + hackathons×12 + certifications×10)                  |
| Skills     | 10%    | coding, aptitude, verbal, communication   | mean of the recorded scores                                                       |
| Placement  | 15%    | resume, assessments, mock interviews      | 40% resume completeness + 30% assessments done % + 30% mock interviews (3 = 100%) |

## Combining them

`score = Σ (indicator × weight) ÷ Σ weights of the indicators that have data`

A missing indicator is **never counted as zero**. Its weight is removed and the rest are re-scaled, and
the profile shows which indicators were missing. A student with no data at all has no score.

## Bands

| Score    | Band            |
| -------- | --------------- |
| 80+      | On Track        |
| 65–79    | Monitor         |
| 50–64    | Needs Attention |
| below 50 | High Priority   |

A student with a High academic or placement risk flag cannot be "On Track"; the band drops to Monitor.

## Explainability

- **Success Score:** each indicator's contribution is its value × weight, in points. The student profile
  ranks them, lists what helps and what hurts, and the student table shows each student's _top score driver_.
- **Risk flags:** two points-based flags. Each fired signal adds points and is listed with its value and threshold.
  - Academic risk (Medium ≥ 2, High ≥ 5): backlogs (3), CGPA < 6 (3), SGPA drop ≥ 1 (2), attendance < 75% (3),
    subjects under 75% (1 each, max 3), lessons < 50% (2), assignments < 60% (1).
  - Placement risk (Medium ≥ 3, High ≥ 6): readiness < 60% (3), aptitude < 50 (2), coding < 50 (2), resume < 70% (1),
    no mock interviews (2), assessments < 50% (1), no certifications or hackathons (1).
  - The student table shows each student's _main risk driver_ (the signal adding the most points).

## Where to see it

- Left sidebar: Academic, Attendance, LMS, Engagement, Placement, Skills, Feedback. Staff see these across all
  their students, split by year, course, section and gender. Students see their own.
- Students page: year tabs, filters, CSV import and export.
- A student's profile (Students → name): "Explainable score" and "Why you are flagged".

## Limits

- Weights and thresholds are configured defaults, not fitted to outcomes. They should be reviewed with faculty.
- CSV imports store LMS progress to the nearest 10%.
- Company drives and resume keyword matching are not connected.
