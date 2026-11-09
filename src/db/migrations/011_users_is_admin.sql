-- Flag de administración global a nivel de usuario (sesión 2026-05-21).
--
-- Decisión D1 del plan panel admin (planes/panel_admin.md): preferimos una
-- columna en BD a un env var ADMIN_EMAILS por flexibilidad futura (si en
-- algún momento hay más de un admin, basta un UPDATE — no requiere redeploy).
--
-- El gate del panel se hace server-side leyendo este flag desde la sesión
-- del user; sin él, las rutas /admin y /api/admin/* devuelven 404 (no 403,
-- decisión D2: no revelar la existencia del panel).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- DOWN:
-- ALTER TABLE users
--   DROP COLUMN IF EXISTS is_admin;
