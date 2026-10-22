-- Personal details a user can edit themselves on the Profile page.
ALTER TABLE users
  ADD COLUMN phone text NOT NULL DEFAULT '',
  ADD COLUMN address text NOT NULL DEFAULT '',
  ADD COLUMN bio text NOT NULL DEFAULT '',
  ADD COLUMN linkedin_url text NOT NULL DEFAULT '',
  ADD COLUMN github_url text NOT NULL DEFAULT '';
