# Bardo

Aplicación web para campañas de rol que convierte notas de sesión en documentación viva y permite consultarla por chat.

## Otari integration (Mozilla.ai hackathon)

Bardo runs on [Otari](https://otari.ai), the LLM gateway by Mozilla.ai, using open-weight models only:

- **Three open models, three roles:** Mistral Small 4 answers chat questions, gpt-oss-120b folds session notes into the wiki as strict JSON patches, and gpt-oss-20b picks the relevant docs and summarises chat history.
- **Routing policies with fallbacks** for each role. Bardo records the model that actually answered.
- **Workspace budget plus per-player budgets.** Each player is an Otari end user with a daily dollar cap, on top of Bardo's own monthly "gold coins". A budget refusal never charges coins and tells the player when they can continue.
- **Prompt-injection guardrail in monitor mode.** Uploaded notes are scored, and suspicious ones are flagged to the game master.
- **Real cost per operation** (`cost_usd`) stored next to its gold-coin price.

Details, configuration and measurements: [docs/otari.md](docs/otari.md). First commit with Otari: [`otari-first`](https://github.com/IPZer0-1/bardo-otari/commit/e5e4d1272df65c8c8678dde49cbe984438068c7d).

## Qué hace ahora mismo

- Registro por código de invitación (single-use) y login con email/contraseña.
- Creación de campañas con miembros y permisos (`creator`, `master`, `player`).
- Chat por campaña con historial de conversaciones.
- Ingesta de notas por texto libre o fichero (`.txt`, `.docx`, `.pdf`, `.md`).
- Documentación Markdown persistida en PostgreSQL y editable desde la app según permisos.
- Cuota mensual de uso por usuario en "monedas de oro", con reset el día 1 a las 00:00 hora local.
- Páginas legales (`/privacy`, `/legal`, `/terms`) con footer en pantallas de auth.
- Registro de conflictos cuando unas notas contradicen documentación previa.

## Stack

- Next.js App Router (16.x) + React 19
- PostgreSQL 16
- NextAuth Credentials (sesiones)
- Otari (gateway de Mozilla.ai, modelos abiertos) por defecto si hay `OTARI_API_KEY`; Anthropic y OpenAI directos como alternativa. Toggle dev por cookie. Modelos por env var.
- Docker Compose

## Flujo principal

1. Un usuario sube notas de sesión.
2. El backend extrae texto si hace falta y carga los documentos actuales de la campaña.
3. El LLM propone cambios sobre la documentación y posibles conflictos.
4. Los documentos actualizados se guardan en `campaign_docs`.
5. Los jugadores consultan la campaña desde el chat y reciben respuestas basadas en esos documentos.

## Estado actual del proyecto

Trabajo reciente:

- Ingesta basada en patches en lugar de documentos completos.
- Caché semántico de queries (clave incluye el provider activo).
- Soporte de batch ingest (Anthropic Batch API, fallback a sync con OpenAI).
- Resumen progresivo de historial.
- Ingesta determinista por hash + routing por tipo (`session`/`correction`/`entity`/`auto`) detrás de feature flags.
- Toggle dev anthropic/openai con cookie y abstracción `callLlm`.
- Modelos por tier (`haiku` / `sonnet` / `summary`) configurables por env var.
- Cuota mensual por usuario en monedas de oro con TZ propia (ADR-036, antes diaria en P0.6).
- Páginas legales (P0.7).

> Este repositorio es una copia pública del proyecto. La documentación interna,
> los planes y las notas de campaña de los jugadores se mantienen en el
> repositorio privado y no se incluyen aquí.

## Desarrollo local

Plantilla completa de variables en [.env.example](.env.example). Resumen:

**Obligatorias:**

- `DATABASE_URL` — postgres://...
- `NEXTAUTH_URL` — URL pública de la app
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `OPENAI_API_KEY` y/o `ANTHROPIC_API_KEY` — al menos la del provider activo

**Provider y modelos** (todas opcionales). Con `OTARI_API_KEY` el default es Otari con modelos abiertos; sin ella, Anthropic con `claude-haiku-5-5` en todos los tiers. Alternativa: OpenAI `gpt-5.6-luna`.

- `LLM_DEFAULT_PROVIDER` — `otari` | `anthropic` | `openai`. Si se omite: `otari` cuando hay `OTARI_API_KEY`, si no `anthropic`. Respaldo: si un admin elige provider en `/admin/models`, manda esa elección
- `LLM_MODEL_HAIKU_OPENAI`, `LLM_MODEL_SONNET_OPENAI`, `LLM_MODEL_SUMMARY_OPENAI` — IDs de modelo OpenAI por tier
- `LLM_MODEL_HAIKU_ANTHROPIC`, `LLM_MODEL_SONNET_ANTHROPIC`, `LLM_MODEL_SUMMARY_ANTHROPIC` — IDs de modelo Anthropic por tier
- `OTARI_*` y `LLM_MODEL_*_OTARI` — ver [docs/otari.md](docs/otari.md#configuration)

**Cuota mensual por usuario:**

- `LLM_QUOTA_MONTHLY_GOLD_PER_USER` — tope en monedas (default 300). Reset día 1 a las 00:00 hora local del propio user.

**Flags de ingesta determinista** (default `false`):

- `INGEST_DEDUP_ENABLED` — dedup por hash de contenido
- `INGEST_VALIDATION_ENABLED` — validación post-ingest
- `INGEST_METADATA_ENABLED` — pre-extracción de sesión/entidades
- `INGEST_ROUTING_ENABLED` — routing por tipo (session/correction/entity/auto)

Levantar con Docker:

```bash
docker compose up --build
```

Servidor de desarrollo:

```bash
npm install
npm run dev
```

## Estructura útil

- `src/app/` rutas y UI
- `src/app/api/` endpoints de auth, campañas, query e ingesta
- `src/lib/claude.ts` prompts y flujos LLM (consulta, ingesta, router)
- `src/lib/llm-call.ts` llamada única a los providers (Otari, Anthropic, OpenAI)
- `src/db/` schema, migraciones y helpers de acceso a datos
