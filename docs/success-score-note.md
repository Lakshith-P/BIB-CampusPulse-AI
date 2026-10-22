# Student Success Score: Method Note

Orbit combines seven data sources into one score from 0 to 100. The score is a prototype decision aid for faculty, not institutional policy. Weights and thresholds are defined in `src/lib/types.js`, and the calculations in `src/lib/scoring.js`.

## Indicators and weights

| Component           | Weight | Built from                                                     |
| ------------------- | ------ | -------------------------------------------------------------- |
| Academics           | 30%    | CGPA × 10                                                      |
| Attendance          | 20%    | Overall attendance percentage across subjects                  |
| LMS                 | 15%    | Lesson completion and assignment completion                    |
| Placement readiness | 15%    | Aptitude, coding and mock-interview results                    |
| Engagement          | 10%    | Verified events, clubs, hackathons and certifications only     |
| Skills              | 10%    | Average of technical and soft-skill assessments                |
| Feedback            | 0%     | Stored and shown to faculty, but not scored (it is subjective) |

## How they combine

`Score = Σ(weight × component) ÷ Σ(weights of components that have data)`

Each component is a percentage from 0 to 100. A component with **no data is left out** and the remaining weights are rescaled, so missing data never counts as zero. The completeness of the underlying data is shown next to the score. A real zero (for example, no engagement activities recorded) stays zero.

## Bands

| Score        | Band            |
| ------------ | --------------- |
| 80 and above | On Track        |
| 65 to 79     | Monitor         |
| 50 to 64     | Needs Attention |
| below 50     | High Priority   |

A **High** Academic or Placement Risk flag stops a student from being shown as On Track (`effectiveBand` in `src/lib/risk-flags.js`).

## Risk identification

Two separate flags, each a points table whose fired signals are listed as the "drivers":

- **Academic Risk**: active backlogs, low CGPA, a drop in SGPA against the previous semester, subjects below 75% attendance, and similar signals.
- **Placement Risk**: weak aptitude, coding or mock-interview results, and missing eligibility criteria.

Levels are Low, Medium (2 or more points) and High (5 or more points). Every flag shows which signals fired and their values, so a faculty member can see **why** a student is flagged.

## Segments

Rule-based groups, first match wins, each with a suggested action (`segmentOf` in `src/lib/student-extras.js`):

| Segment                                 | Suggested action                                  |
| --------------------------------------- | ------------------------------------------------- |
| High academics, low placement readiness | Resume clinic, mock interviews, aptitude practice |
| Strong grades, poor attendance          | Attendance contract and class-wise reminders      |
| Good attendance, declining academics    | Doubt sessions and a revision plan                |
| Strong coder, aptitude gap              | Daily aptitude practice sets                      |
| Disengaged, multiple risks              | Weekly mentoring plus one club or event           |
| On track                                | Stretch goals: hackathons, research, leadership   |
| Steady, no standout pattern             | Maintain performance; finish pending LMS work     |

## Validation

The 300-student dataset (`src/test/fixtures/students_unified_clean.csv`) carries a reference answer key. `src/test/dataset.test.js` checks that scores, risk levels and bands match it. A tolerance of ±1.5 points allows for LMS unit rounding.
