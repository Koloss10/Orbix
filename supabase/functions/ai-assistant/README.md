# Orbix AI Assistant

Read-only AI assistant for the authenticated Orbix user.

## Required Supabase Edge Function secrets

- `OPENAI_API_KEY` — OpenAI API key, stored only as an Edge Function secret.
- `AI_DEFAULT_MODEL` — model identifier enabled for the API project.
- Optional: `AI_DAILY_LIMIT` — per-user daily user-message limit (default 40, maximum 200).

Existing Supabase runtime variables are used for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

## Deploy

1. Apply migration `20261123120000_orbix_ai_core.sql`.
2. Set secrets with the Supabase CLI or Dashboard. Never commit secrets.
3. Set the model and key as server-side secrets (run locally; do not commit the key):\n   `supabase secrets set OPENAI_API_KEY=... AI_DEFAULT_MODEL=...`\n4. Deploy function `ai-assistant`: `supabase functions deploy ai-assistant`.\n5. Confirm the project is linked to the intended Supabase project before running `supabase db push` to apply the migration.
6. Test with an authenticated user who satisfies the existing Orbix MFA policy.

The function reads only user-scoped `bots`, `bot_state`, `bot_events`, and `backtests` rows. It never reads exchange credentials and exposes no trading tools.

## Current scope

The first iteration is chat + a fresh read-only account snapshot. Market-data analytics, proactive monitoring, and strategy recommendations are subsequent stages.
