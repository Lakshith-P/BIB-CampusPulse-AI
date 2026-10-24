-- Files shared in dashboard chats. A message can carry one file (kept in PostgreSQL like other uploads),
-- and a message with a file may have no text. Existing messages are unchanged.

ALTER TABLE chat_section_messages
  ADD COLUMN file_name text NOT NULL DEFAULT '',
  ADD COLUMN file_type text NOT NULL DEFAULT '',
  ADD COLUMN file_data bytea,
  ALTER COLUMN body SET DEFAULT '',
  DROP CONSTRAINT chat_section_messages_body_check,
  ADD CONSTRAINT chat_section_messages_body_check
    CHECK (length(body) <= 2000 AND (length(body) >= 1 OR file_data IS NOT NULL));

ALTER TABLE private_chat_messages
  ADD COLUMN file_name text NOT NULL DEFAULT '',
  ADD COLUMN file_type text NOT NULL DEFAULT '',
  ADD COLUMN file_data bytea,
  ALTER COLUMN body SET DEFAULT '',
  DROP CONSTRAINT private_chat_messages_body_check,
  ADD CONSTRAINT private_chat_messages_body_check
    CHECK (length(body) <= 2000 AND (length(body) >= 1 OR file_data IS NOT NULL));
