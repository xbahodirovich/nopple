# Connecting AI later

AI is not connected in Courtyard. Its selection prompts currently use a local command interpreter, with preview, apply and undo. They support specific material, furniture and placement edits, not arbitrary architectural requests.

The existing backend supports **NVIDIA API keys**, not interchangeable OpenAI or Anthropic keys.

For development, create `.env.local` in the project root:

```dotenv
NVIDIA_API_KEY=your_nvidia_key
```

Restart `npm run dev`. For the Node production server, `npm start` also loads `.env.local`. On Vercel, add `NVIDIA_API_KEY` to the project's server environment variables and redeploy. Never put a secret in browser code or a `VITE_` variable.

This configures the existing `/api/ai/operations` service. Courtyard's contextual editor deliberately remains local; a later integration must route requests through that service and retain validation, selection scope, preview and explicit apply. Adding a key alone does not enable AI in Courtyard or produce photorealistic 3D models.

## Routes

`/editor` is Courtyard. `/advanced` retains the detailed editor. `/homes` and `/share` use clean URLs. Legacy `.html` URLs redirect, preserving query parameters. Vite development/preview, the Node server and Vercel configuration all support these routes. Other static hosts need equivalent rewrites.
