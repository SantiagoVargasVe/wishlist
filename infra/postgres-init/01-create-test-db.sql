-- Runs once, on a fresh volume only (docker-entrypoint-initdb.d).
-- Integration tests must never touch the development database: they drop and
-- recreate the public schema, which would wipe local data mid-session.
CREATE DATABASE wishlist_test;
