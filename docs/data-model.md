# Data model

The schema is defined by the files in `db/migrations/` and applied in order by `npm run db:migrate`. Add a new numbered file for every schema change; never edit one that has already been applied.

## Entity overview

```
users 1───* user_roles
  │
  ├──* student_records (owner_id)      a student account owns its record
  ├──* student_records (faculty_id)    a teacher account is assigned to many records
  ├──* campus_interventions (created_by)
  ├──* contact_messages (user_id, optional)
  ├──* campus_updates (created_by)
  └──* password_resets (user_id)

student_records 1───* campus_interventions (student_id)
campus_audit  → loose reference (record_id, actor_id), no foreign keys
```

## Tables

### `users`

| Column                                                  | Type           | Notes                                         |
| ------------------------------------------------------- | -------------- | --------------------------------------------- |
| `id`                                                    | uuid, PK       | `gen_random_uuid()`                           |
| `email`                                                 | citext, unique | Case-insensitive                              |
| `password_hash`                                         | text           | bcrypt                                        |
| `display_name`                                          | text           | Default `''`                                  |
| `phone`, `address`, `bio`, `linkedin_url`, `github_url` | text           | Added in `0002`; user-editable profile fields |
| `created_at`                                            | timestamptz    |                                               |

### `user_roles`

Composite primary key `(user_id, role)`. `role` is the enum `app_role` (`student`, `faculty`, `admin`). A user may hold several roles. This table is the **only** source of permissions. Rows are deleted with the user.

### `student_records`

| Column       | Type           | Notes                                                                                             |
| ------------ | -------------- | ------------------------------------------------------------------------------------------------- |
| `id`         | text, PK       | Student identifier, e.g. `BIB-2026-001`, or `ACC-XXXXXXXX` for placeholders created on assignment |
| `owner_id`   | uuid → `users` | The student account the record belongs to. `ON DELETE SET NULL`                                   |
| `faculty_id` | uuid → `users` | The assigned teacher. `ON DELETE SET NULL`                                                        |
| `record`     | jsonb          | The full student profile (see below)                                                              |
| `updated_at` | timestamptz    |                                                                                                   |

Indexed on `owner_id` and `faculty_id`, the two columns every access check filters on.

The `record` document is validated by the Zod `studentSchema` in `src/lib/student-validation.js`; `src/lib/student-defaults.js` supplies `emptyStudent`. It carries academics (CGPA, semester grades, backlogs), per-subject attendance, LMS units, skills, engagement activities, placement criteria and feedback notes. Scores, bands and risk flags are **not stored**. They are derived from the record on read by `src/lib/campus-derive.js`, `scoring.js` and `risk-flags.js`, so a scoring change needs no data migration.

### `campus_interventions`

A mentor's recorded support action for one student.

| Column             | Notes                                                         |
| ------------------ | ------------------------------------------------------------- |
| `student_id`       | → `student_records(id)`, `ON DELETE CASCADE`                  |
| `created_by`       | → `users(id)`                                                 |
| `reason`, `action` | Free text (5 to 1000 characters, enforced by Zod)             |
| `priority`         | `low` \| `medium` \| `high` (CHECK), default `medium`         |
| `owner`            | Name of the responsible person                                |
| `follow_up_date`   | date                                                          |
| `status`           | `open` \| `in-progress` \| `resolved` (CHECK), default `open` |
| `outcome`          | Text, default `''`                                            |

### `contact_messages`

Messages from the contact form: `user_id`, `name`, `email`, `message`, `created_at`. `user_id` is empty when the sender was not logged in (the form is open to visitors, behind a captcha). Teacher-access requests and password-reset requests are also left here for the administrators. Visible to administrators on the Messages page.

### `campus_updates`

University announcements shown on the Campus updates page, the overview and the Placement page.

| Column                  | Notes                                                    |
| ----------------------- | -------------------------------------------------------- |
| `category`              | `placement` \| `event` \| `notice` \| `poster` (CHECK)   |
| `title`, `body`         | Required title (3 to 150), optional details (up to 2000) |
| `company`               | For placement drives                                     |
| `event_date`            | Optional date of the drive or event                      |
| `image_url`, `link_url` | Optional, `https://` only (checked by Zod)               |
| `created_by`            | → `users(id)`, `ON DELETE SET NULL`                      |

### `password_resets`

One-time links for "Forgot your password?". `token_hash` (primary key) is the SHA-256 of the token, so a copy of the table cannot be used to reset anyone; `user_id`, `expires_at` (30 minutes), `used_at`. Rows are removed when the password changes.

### `campus_audit`

Append-only log of changes to student records: `actor_id`, `record_id`, `operation`, `created_at`. Operations written by the code are `INSERT`, `UPDATE`, `LINK`, `NOTE`, `PASSWORD` and `DELETE`. It has no foreign keys on purpose, so history survives deletion of a user or record.

## Who may read or write what

| Data                   | Student             | Faculty                                                          | Admin                  |
| ---------------------- | ------------------- | ---------------------------------------------------------------- | ---------------------- |
| Own `users` row        | read, edit profile  | read, edit profile                                               | same                   |
| `student_records`      | own (`owner_id`)    | assigned (`faculty_id`); may update marks, attendance and skills | all, read and write    |
| `campus_interventions` | read for own record | create and update for assigned students                          | all                    |
| `contact_messages`     | create              | create                                                           | read all               |
| `campus_updates`       | read                | read, post, delete own                                           | read, post, delete any |
| `campus_audit`         | none                | none                                                             | read                   |

Feedback notes are written into the student's record JSON by `addStudentNote`: teachers only for assigned students, students only on their own record.

## Operational scripts

| Command                                 | What it does                                                  |
| --------------------------------------- | ------------------------------------------------------------- |
| `npm run db:migrate`                    | Applies pending files from `db/migrations`                    |
| `npm run db:check`                      | Confirms the connection and schema (prints `Schema OK`)       |
| `npm run db:set-role -- <email> <role>` | Grants `student`, `faculty` or `admin`; `--revoke` removes it |

`docker-compose.yml` starts a local PostgreSQL for development.
