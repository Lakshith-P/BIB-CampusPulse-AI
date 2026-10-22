# Orbit roadmap

## Current deliverable

- [x] Create a project walkthrough video with spoken narration covering the supplied challenge, features, scoring, risk patterns, requirements and technology stack; v2 timing, all scenes and audio levels checked. Delivered for review: voice clarity/pronunciation not verified by listening; screenshot fine print is small.

## Done

- [x] Public website, benefits, solution, privacy, contact and sign-in
- [x] 300-student BIB dataset as the seed; score, risk flags and bands verified against the reference answer key (`src/test/dataset.test.js`)
- [x] Dual Academic and Placement Risk flags with sorted drivers; a High flag blocks On Track
- [x] Student segmentation with suggested actions, shown on student profiles and in the portal (home chart, table column and filter)
- [x] Guided website assistant (server-side prompt and provider calls)
- [x] Move to JavaScript, PostgreSQL, bcrypt and JWT auth with role-based portal workspaces
- [x] Live student records, teacher assignment, feedback notes and persisted interventions with outcomes and audit log
- [x] Publish to Vercel
- [x] Documentation: `README.md` and `docs/` (architecture, data model, server functions, development guide, score note)

## Planned

- [ ] Email verification and self-service password recovery
- [ ] Automated import from campus systems
- [ ] Configurable scoring weights and thresholds
- [ ] Notification delivery to students and mentors
- [ ] Evidence review and approval workflow for engagement activities
- [ ] Peer comparison with fairness safeguards
- [ ] Database-backed tests for the authorization SQL

Do not claim every item in the original challenge brief is complete; track follow-on work explicitly.

- [x] Role-aware login with captcha, landing choice, role sign-up with approval, and password reset by email
- [x] Space and Dust themes, announcement strip, drop-down menus, icon rail and full-screen search
- [x] Results and Placement dashboards, campus updates, CSV import and export
- [x] Teachers update marks and attendance for their own students; administrators can delete accounts
