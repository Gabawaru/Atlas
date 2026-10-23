-- Ne PAS faire ALTER ROLE atlas : sur Postgres service GHA le bootstrap user
-- ne peut pas perdre SUPERUSER (« permission denied to alter role »).
-- Rôle applicatif non-superuser : RLS s'applique (tests + runtime recommandé).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    CREATE ROLE atlas_app LOGIN PASSWORD 'atlas_dev_only'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSE
    BEGIN
      ALTER ROLE atlas_app WITH NOSUPERUSER NOBYPASSRLS LOGIN PASSWORD 'atlas_dev_only';
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END IF;
END $$;

GRANT CONNECT ON DATABASE atlas TO atlas_app;
GRANT USAGE ON SCHEMA public TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atlas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO atlas_app;
