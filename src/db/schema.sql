-- Bardo App — PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  password    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- NextAuth sessions
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires       TIMESTAMPTZ NOT NULL
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  creator_id   UUID NOT NULL REFERENCES users(id),
  invite_code  TEXT UNIQUE NOT NULL DEFAULT substr(gen_random_uuid()::text, 1, 8),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign members
-- role: 'creator' | 'master' | 'player'
-- can_invite y can_edit son relevantes solo para players (creator/master los tienen implícitos)
CREATE TABLE IF NOT EXISTS campaign_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('creator', 'master', 'player')),
  can_invite  BOOLEAN NOT NULL DEFAULT false,
  can_edit    BOOLEAN NOT NULL DEFAULT false,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, user_id)
);

-- Campaign documents (los MDs de la campaña)
CREATE TABLE IF NOT EXISTS campaign_docs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  file_path    TEXT NOT NULL, -- e.g. "personajes.md", "elegidos/lira.md"
  content      TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_by   UUID REFERENCES users(id),
  UNIQUE(campaign_id, file_path)
);

-- Uploaded notes (notas crudas de jugadores antes/después de procesar)
CREATE TABLE IF NOT EXISTS uploads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  raw_text     TEXT NOT NULL,
  filename     TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Conflicts (discrepancias entre versiones, con autoría — sin resolución)
CREATE TABLE IF NOT EXISTS conflicts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  file_path      TEXT NOT NULL,
  description    TEXT NOT NULL, -- resumen de la contradicción
  version_a      TEXT NOT NULL, -- contenido versión A
  version_a_user UUID REFERENCES users(id),
  version_a_date TIMESTAMPTZ,
  version_b      TEXT NOT NULL, -- contenido versión B
  version_b_user UUID REFERENCES users(id),
  version_b_date TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Usage logs (para límites por plan)
CREATE TABLE IF NOT EXISTS usage_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  operation   TEXT NOT NULL CHECK (operation IN ('query', 'ingest')),
  token_count INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (hilos de chat por usuario y campaña — máximo 5 por usuario/campaña)
CREATE TABLE IF NOT EXISTS conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages (mensajes dentro de una conversación)
CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_campaign_members_user ON campaign_members(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign ON campaign_members(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_docs_campaign ON campaign_docs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_uploads_campaign ON uploads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_campaign ON conflicts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_month ON usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_campaign ON conversations(campaign_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at ASC);
