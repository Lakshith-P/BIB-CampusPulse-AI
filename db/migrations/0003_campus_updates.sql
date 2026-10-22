-- University-wide announcements: placement drives, events, notices and posters.
CREATE TABLE campus_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('placement','event','notice','poster')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  event_date date,
  image_url text NOT NULL DEFAULT '',
  link_url text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campus_updates_category_idx ON campus_updates(category, created_at DESC);
