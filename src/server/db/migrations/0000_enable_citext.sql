-- Case-insensitive text, required by users.email (T010).
--
-- Storing emails as plain text lets "Santiago@x.com" and "santiago@x.com"
-- become two accounts, and a UNIQUE constraint won't stop it. citext makes the
-- database enforce what the product actually means by "the same email".
CREATE EXTENSION IF NOT EXISTS citext;
