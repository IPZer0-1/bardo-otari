-- P0.5 — Cierre de registro por código de invitación.
-- Cada código es de un solo uso (single-use). Para el piloto se siembran
-- 5 códigos individuales. Códigos adicionales se insertan vía SQL hasta
-- que se construya una UI de gestión (no en esta sesión).

CREATE TABLE IF NOT EXISTS invite_codes (
  code        TEXT PRIMARY KEY,
  used_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

INSERT INTO invite_codes (code) VALUES
  ('BARDO-PILOTO-2026-A'),
  ('BARDO-PILOTO-2026-B'),
  ('BARDO-PILOTO-2026-C'),
  ('BARDO-PILOTO-2026-D'),
  ('BARDO-PILOTO-2026-E')
ON CONFLICT (code) DO NOTHING;

-- DOWN:
-- DROP TABLE invite_codes;
