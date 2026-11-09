-- Carry-over de cuota al cambiar TZ (P1, sesión 2026-05-14).
--
-- Sin estas columnas, cambiar de Madrid (UTC+2) a Tegucigalpa (UTC-6) a
-- media tarde "resetea" el contador del día porque la ventana de cálculo
-- ("hoy en mi TZ") se desplaza y los logs previos caen fuera. Para evitar
-- que el cambio sea game-able, snapshotteamos el consumo en el momento
-- del cambio y lo arrastramos hasta el siguiente 00:00 hora local con la
-- TZ nueva.
--
-- Mientras tz_carry_resets_at IS NOT NULL AND NOW() < tz_carry_resets_at:
--   used = tz_carry_used
--          + SUM(usage_logs.gold_cost WHERE created_at >= tz_carry_from)
-- En caso contrario (carry expirado o nunca usado):
--   comportamiento estándar (ventana "hoy" en la TZ actual).
--
-- Los campos no se limpian activamente al expirar; un siguiente cambio
-- los sobrescribe y mientras tanto getDailyUsage los ignora.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tz_carry_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tz_carry_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tz_carry_resets_at TIMESTAMPTZ;

-- DOWN:
-- ALTER TABLE users
--   DROP COLUMN IF EXISTS tz_carry_used,
--   DROP COLUMN IF EXISTS tz_carry_from,
--   DROP COLUMN IF EXISTS tz_carry_resets_at;
