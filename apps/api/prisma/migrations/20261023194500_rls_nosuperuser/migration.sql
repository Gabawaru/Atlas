-- Docker POSTGRES_USER est superuser → contourne RLS même avec FORCE.
-- On retire SUPERUSER/BYPASSRLS pour que les politiques s'appliquent.
-- Seed / API : SET app.bypass_rls = 'on' (politique atlas_tenant_isolation).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas') THEN
    ALTER ROLE atlas WITH NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
