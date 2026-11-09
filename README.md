# Bardo

Aplicación web para campañas de rol que convierte notas de sesión en documentación viva y permite consultarla por chat.

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
- OpenAI API (default en prod) y Anthropic Claude API (alternativo). Toggle dev por cookie. Modelos por env var.
- Docker Compose

## Flujo principal

1. Un usuario sube notas de sesión.
2. El backend extrae texto si hace falta y carga los documentos actuales de la campaña.
3. Claude propone cambios sobre la documentación y posibles conflictos.
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

**Provider y modelos** (todas opcionales, default Anthropic con `claude-haiku-5-5` en todos los tiers; alternativa OpenAI `gpt-5.6-luna`):

- `LLM_DEFAULT_PROVIDER` — `anthropic` (default) | `openai`. Respaldo: si un admin elige provider en `/admin/models`, manda esa elección
- `LLM_MODEL_HAIKU_OPENAI`, `LLM_MODEL_SONNET_OPENAI`, `LLM_MODEL_SUMMARY_OPENAI` — IDs de modelo OpenAI por tier
- `LLM_MODEL_HAIKU_ANTHROPIC`, `LLM_MODEL_SONNET_ANTHROPIC`, `LLM_MODEL_SUMMARY_ANTHROPIC` — IDs de modelo Anthropic por tier

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
- `src/lib/claude.ts` integración con Claude
- `src/db/` schema, migraciones y helpers de acceso a datos
