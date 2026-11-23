# Hosted AI configuration

Design commands are interpreted locally and always previewed before they are applied. Hosted AI is an explicit opt-in that only handles commands the local rules cannot: it receives the user's text plus a selection-scoped context (never the full project), and every returned operation is validated server-side, previewed on a scratch engine, and applied only after explicit user review.

No API key is ever entered, stored or sent from the browser. The server key is the only credential; caller-supplied keys are ignored in production and on Vercel.

## Server variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `NVIDIA_API_KEY` | Yes for hosted AI | Server-side NVIDIA NIM key. Missing → hosted requests return a generic 503 and the offline designer keeps working. Never prefix with `VITE_`. |
| `AI_FALLBACK_ENABLED` | Yes for hosted AI | Kill switch. Must be exactly `true`; otherwise `/api/ai/operations` and `/api/ai/generate` return 503. Default off. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Required on Vercel | Atomic cross-instance quotas. |
| `AI_PER_IP_PER_MINUTE` | Standalone production | Requests per IP per minute (default 10; 429 when exceeded). |
| `AI_DAILY_CAP` | Standalone production | Deployment-wide daily cap across all callers (default 500; 503 when reached). |

## Client variable

| Variable | Meaning |
| --- | --- |
| `VITE_ENABLE_AI_FALLBACK` | Build-time opt-in for the editors. Default off; with it off, the UI behaves exactly like the local-only interpreter and never calls AI endpoints. |

## Environments

- **Local dev (`npm run dev`)**: Vite runs as `NODE_ENV=development`, so no quota configuration is required. Enable with `AI_FALLBACK_ENABLED=true` and `VITE_ENABLE_AI_FALLBACK=true` in `.env.local` plus a dev `NVIDIA_API_KEY`.
- **Standalone production (`npm start`)**: hosted mode is the default and fails closed without a quota — set `AI_PER_IP_PER_MINUTE` and `AI_DAILY_CAP` explicitly (or the Upstash pair). The `npm start` script loads `.env.local` when present.
- **Vercel (production and previews)**: hosted mode is always on; Upstash Redis is required. Caller keys are never accepted.

To test on a Vercel preview: set `NVIDIA_API_KEY`, `AI_FALLBACK_ENABLED=true`, `VITE_ENABLE_AI_FALLBACK=true`, and both Upstash variables, deploy the preview, select a room or item, and submit a command the local interpreter does not know (for example `nudge this item left`). Watch for the hosted states: thinking with a cancel option, "AI off", "not configured", rate-limit/unavailable, invalid result, and `Select a room, wall, or object first`.

The free NVIDIA tier is intended for development only. Put a paid key and enforced quotas behind any public deployment.

## Safety model

- House creation and design-brief changes are refused on this endpoint; they require the reviewed brief workflow.
- Requests without a selection are refused: `Select a room, wall, or object first`.
- Operations affecting anything outside the selection (including whole-house lighting) are rejected before preview.
- `/api/ai/generate` is a process-local concept-generation endpoint gated by the same flag, key and quota rules; job status/cancel require the job's random access token.
