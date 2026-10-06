-- Optional hardening: run the app as a role that cannot alter or drop the audit log.
-- psql -d notify -f deploy/db-roles.sql   (as the database owner / superuser)
-- Then put notify_app in DATABASE_URL, set SKIP_MIGRATIONS=true, and run
-- `DATABASE_URL=<owner url> npm run migrate` yourself after each upgrade.
CREATE ROLE notify_app LOGIN PASSWORD 'CHANGE_ME';
GRANT CONNECT ON DATABASE notify TO notify_app;
GRANT USAGE ON SCHEMA public TO notify_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO notify_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO notify_app;
-- The audit log is insert + read only for the app (on top of the blocking trigger)
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM notify_app;
