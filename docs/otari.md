# Bardo × Otari

Bardo is a web app for tabletop role-playing campaigns. Players upload their
session notes and an LLM folds them into a living Markdown wiki of the
campaign (characters, places, plot threads, session log). Anyone in the
campaign can then ask questions about it in a chat.

This repository is the version of Bardo that runs through
[Otari](https://otari.ai), the LLM gateway by Mozilla.ai. It was built for
the "Developers Wilding: Online" hackathon. Otari is the default provider
whenever `OTARI_API_KEY` is set. The direct Anthropic and OpenAI
integrations are still there as alternatives.

- First commit using Otari: tag [`otari-first`](https://github.com/IPZer0-1/bardo-otari/commit/e5e4d1272df65c8c8678dde49cbe984438068c7d)
- Branch: `main`

## Otari features used in the app

| Feature | What Bardo does with it | Where |
|---|---|---|
| Open-weight models, distinct roles | Three models, each picked for one job: chat answers, ingestion and routing | [`llm-provider.ts`](../src/lib/llm-provider.ts), [`claude.ts`](../src/lib/claude.ts) |
| Routing policies and fallbacks | Each role goes through a workspace policy with a fallback model. Bardo logs which model actually answered | [`llm-call.ts`](../src/lib/llm-call.ts) |
| Workspace budget and ceiling | Hard monthly spend cap for the whole app. A refusal becomes a friendly 429 and no gold coins are charged | [`llm-call.ts`](../src/lib/llm-call.ts), [`quota.ts`](../src/lib/quota.ts) |
| Per-end-user budgets | Every player is an Otari end user with a daily dollar cap, on top of Bardo's own monthly "gold coin" allowance | [`llm-call.ts`](../src/lib/llm-call.ts), [`quota.ts`](../src/lib/quota.ts) |
| Guardrails (monitor mode) | A prompt-injection check scores every uploaded note. Suspicious notes are flagged to the game master | [`guardrails.ts`](../src/lib/guardrails.ts), [`upload-guardrail.ts`](../src/db/upload-guardrail.ts) |
| Usage and cost reporting | Calls are tagged by operation. The real `cost_usd` of each operation is stored next to its gold-coin price | [`llm-call.ts`](../src/lib/llm-call.ts), [`usage-logs.ts`](../src/db/usage-logs.ts) |

### 1. Open-weight models with distinct roles

| Role (internal tier) | Used for | Model | Why |
|---|---|---|---|
| `haiku` | Chat answers | `mistralai/mistral-small-4` | Fast (2–7 s) and good enough for questions over the wiki |
| `sonnet` | All ingestion: session notes and corrections | `openai/gpt-oss-120b` | Must return strict JSON patches without dropping sections of the wiki (see the evaluation below) |
| `summary` | Picking relevant docs, summarising chat history | `openai/gpt-oss-20b` | Cheap classifier; the output is a short JSON list |

The defaults live in `MODEL_IDS`, and `LLM_MODEL_{HAIKU,SONNET,SUMMARY}_OTARI`
overrides them. Each one accepts a catalogue model (`vendor/model`), a
routing policy name, or `anthropic:<model>` (bring your own key; this goes
through the Messages API).

**Reasoning control.** Some open models reason by default, and that
reasoning counts against `max_tokens`. With a low cap they can return an
empty answer. Bardo always sends `reasoning_effort: "none"` (override with
`OTARI_REASONING_EFFORT`). Measured on 9 Nov 2026:

- Qwen 3.5 only stops reasoning with `none`.
- gpt-oss drops from ~250 to ~65 output tokens with `none`.
- With Mistral Small 4, `low` actually *turns reasoning on*, so a generic
  `low` is not safe.

### 2. Routing policies and fallbacks

The workspace has three policies, one per role. In production the
`LLM_MODEL_*_OTARI` variables point at them:

| Policy | Primary | Fallback |
|---|---|---|
| `bardo-query` | `mistralai/mistral-small-4` | `deepseek/deepseek-v4.1-flash` |
| `bardo-ingest` | `openai/gpt-oss-120b` | `deepseek/deepseek-v4.1-flash` |
| `bardo-router` | `openai/gpt-oss-20b` | `google/gemma-4-26b-a4b-it` |

Bardo reads `Otari-Provider` / `Otari-Model` to record the model that
really answered. That value is stored in `usage_logs.model` and printed in
the server log (`pedido=bardo-query servido=mistral:mistral-small-2603`).
It also reads `Otari-Fallback`, and marks the log line with `FALLBACK` when
a fallback candidate served the request.

### 3. Workspace budget and ceiling

The workspace has a monthly budget (`bardo-workspace`), which is also the
ceiling of the API key. When it runs out, Otari answers `403` with
`Otari-Error-Code: budget_exceeded`. Bardo turns that into
`LlmBudgetExceededError`. `/api/query` and `/api/ingest` then return a
`429` with a message in Spanish, and **the player is not charged any gold
coins**, because the usage row is only written after a successful call.

### 4. Per-end-user budgets, tied to gold coins

Bardo already had its own player-facing allowance: 300 "gold coins" a month
per user (a query costs 1, a short ingestion 2, a long one 10). Otari now
adds a dollar limit on each player:

- The app uses a **service key** (`OTARI_SERVICE_KEY=true`) and sends the
  Bardo user id as `user` (Chat Completions) or `metadata.user_id`
  (Messages). Each player becomes an Otari end user.
- The key's **end-user budget** (`bardo-player`, a daily cap) is the default
  for new end users, so every new player gets it automatically.
- When a player hits it, Otari answers `403` with `Otari-Budget-Scope: user`
  and a `Retry-After`. Bardo tells the player that *their* daily limit is
  used up and when it comes back ("podrás seguir en unas 3 horas"). The
  message is different from the app-wide limit, and the 429 forwards
  `Retry-After`.

The two limits do different jobs. Coins are predictable for players and
are what the UI shows. The Otari budget is a dollar safety net: it stops
abuse within a single day, and it still holds if a fallback model or a
price change makes a coin more expensive than planned. To calibrate one
against the other, `usage_logs.cost_usd` stores the real cost of every
operation (router, history summary and answer added together):

```sql
SELECT operation, AVG(cost_usd / NULLIF(gold_cost, 0)) AS usd_per_coin
  FROM usage_logs WHERE cost_usd IS NOT NULL GROUP BY operation;
```

### 5. Guardrails: prompt-injection monitoring on uploaded notes

Notes written by one player end up in the wiki, and the wiki goes into the
prompt of *every* player's questions. A note that says "ignore your
instructions and…" is therefore the main risk in this app.

- **Setup:** a Lakera Guard prompt-injection guardrail, enforced through an
  organization **mandate** on the workspace in **monitor** mode ("serve
  unchecked"). Nothing is ever blocked.
- **In the app:** Bardo reads `Otari-Guardrails` on the router call and the
  ingestion call. It stores the highest score in `uploads.guardrail_score`.
  At or above `OTARI_GUARDRAIL_ALERT_SCORE` (default `0.9`):
  - the player who uploaded the note sees a warning;
  - the creator and game masters see it under **Settings → Notas a
    revisar**, with author, date, score and an excerpt.
- **Why a score threshold, and not Lakera's `valid` flag:** inside the full
  ingestion prompt, a normal note already scores `0.4` and comes back
  `valid: false`, probably because the prompt itself is full of
  instructions. A real injection scores `1.0`. In blocking mode every
  ingestion would fail.

What we saw in a test (10 Nov 2026): the injected note asked the model to
overwrite the character sheet. gpt-oss-120b recorded it as a *conflict*
instead of obeying, and the game master got the flag. The check adds about
150–200 ms per call.

### 6. Usage tagging and idempotency

Every call carries `Otari-Tags: app=bardo,tier=…,op=…`, where `op` is one
of `query`, `query_router`, `history_summary`, `ingest_router`,
`ingest_short`, `ingest_long` or `ingest_correction`. Spend can therefore
be split by feature in Otari's Usage view. Every call also carries an
`Idempotency-Key`, so an SDK retry is not billed twice.

## How the integration is wired

All LLM traffic goes through `callLlm()` in
[`src/lib/llm-call.ts`](../src/lib/llm-call.ts). For the `otari` provider,
`callOtari()` takes one of two paths:

- `anthropic:*` models go through the Anthropic SDK (Messages API) pointed
  at Otari. This keeps prompt caching (`cache_control`) and thinking control.
- Everything else (open models and policy names) goes through the OpenAI
  SDK (`chat.completions`) pointed at Otari.

Both paths return the same `LlmCallResult`: text, tokens, the model that
really answered, `costUsd`, `fallback` and `guardrails`. The rest of the
app does not know which provider served the call.

Not routed through Otari: **batch ingestion** (the Anthropic Message
Batches API, used for very long notes) stays a direct Anthropic call,
because Otari does not offer a batch API.

## Configuration

| Variable | Meaning |
|---|---|
| `OTARI_API_KEY` | Workspace key (`otk_…`). If it is empty, the `otari` provider does not exist and the app behaves as before. |
| `OTARI_BASE_URL` | Default `https://api.otari.ai/api`. EU accounts: `https://eu.api.otari.ai/api` (the global host answers 421). |
| `OTARI_SERVICE_KEY` | `true` if the key is a service key. Only then is the player id sent; with a normal key Otari rejects any `user` other than the key owner with a 403. |
| `OTARI_REASONING_EFFORT` | Default `none`. `omit` does not send the parameter. |
| `OTARI_GUARDRAIL_ALERT_SCORE` | Score from which a note is flagged to the GM. Default `0.9`. |
| `LLM_MODEL_HAIKU_OTARI`, `LLM_MODEL_SONNET_OTARI`, `LLM_MODEL_SUMMARY_OTARI` | Model or policy per role (see above). |
| `LLM_DEFAULT_PROVIDER` | `otari` / `anthropic` / `openai`. If unset: `otari` when there is a key, otherwise `anthropic`. An admin can also switch provider at `/admin/models`. |

Database migrations used by the Otari features (apply them in order with
`psql`):

- [`013_usage_logs_cost_usd.sql`](../src/db/migrations/013_usage_logs_cost_usd.sql)
- [`014_uploads_guardrail_score.sql`](../src/db/migrations/014_uploads_guardrail_score.sql)

If either is missing, the app keeps working: it just skips that column.

### Otari dashboard checklist

1. **Routing:** create the three policies above.
2. **Budgets:** create a workspace budget and set it as the API key's
   ceiling. Create an end-user budget (daily) and mark it as the default.
3. **API keys → Create key → Advanced:** a service key, with the end-user
   budget selected as its *End-user budget* and the workspace budget as its
   *budget*. These are two separate fields. Putting the per-player budget in
   the key's own budget field makes it a shared ceiling for all players.
4. **Organization → Guardrails:** configure the prompt-injection guardrail
   (Lakera Guard needs a Lakera API key), then add a **mandate** on the
   workspace in monitor mode. Do *not* attach it to a routing policy as
   well (see the next section).

## Measurements (verified, Nov 2026)

Ingestion quality. Same note, Odyssey of the Dragonlords campaign, 9 Nov
2026. A run counts as correct when the JSON is valid and no wiki section is
lost or duplicated:

| Model | Correct runs | Time | Cost per ingestion |
|---|---|---|---|
| `openai/gpt-oss-120b` | 10/10 | 14–27 s | ~$0.0003–0.0005 |
| `deepseek/deepseek-v4.1-flash` | 7/8 | — | — |
| `mistralai/mistral-small-4` | 3/6 (loses or duplicates sections of the session log) | — | — |
| Claude Haiku (direct, reference) | 3/3 | 4–5 s | ~$0.0024 |

Typical costs through Otari:

| Operation | Cost |
|---|---|
| Chat query (router + answer, 5–13k input tokens) | $0.0017–0.003 |
| Short ingestion with gpt-oss-120b | $0.0003–0.0005 |

Otari's own overhead (`server-timing`) is about 45–70 ms per call, and about
150–200 ms more with the guardrail mandate.

## Things to know (gotchas we hit)

- **Policy guardrails vs. organization guardrails.** On hosted Otari, a
  guardrail attached to a routing policy looks for a self-hosted guardrails
  service. It always reports `status: unavailable, reason: not_configured`,
  and it also hides the organization mandate for the same profile on that
  policy. Use the mandate only.
- **End-user budgets reserve ahead.** A player with a $0.01 cap was cut off
  at about $0.008. It looks like Otari reserves the maximum possible cost
  of the request (based on `max_tokens`) before calling the model. Leave
  headroom.
- **End users are managed by `external_id`.** `DELETE /v1/end-users/{user_id}`
  returns 404; use `DELETE /v1/end-users?external_id=…`. Deleting an end
  user does not reset its spend.
- **`usage.cost_usd` is a string** (`"0.000135"`). Bardo accepts both forms.
- **A new routing policy can take about a minute to work.** Until then,
  calls return `400 invalid_model`.
- **Streaming responses** do not include `Otari-Guardrails`. Bardo does not
  stream, so this does not affect it.
