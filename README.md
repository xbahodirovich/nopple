# Nopple

A local-first home-design studio with reviewed requirements, synchronized floor plans and editable 3D, finish comparisons, saved versions, and share/export tools. The homepage and Editor follow the dark Air reference in `design.md`, with self-hosted Inter, condensed headlines and cloud/glass atmosphere. The advanced editor retains its detailed tools.

## Run

Use Node 24 or later:

```sh
npm install
npm run dev
```

Open `/editor` for Editor, `/advanced` for the full Studio tools, `/homes` for your library, and `/` for architectural inspiration and Editor entry. Legacy `.html` links redirect automatically. No credentials are needed for the local workflow. Design commands are interpreted locally and always previewed before you apply them. Hosted AI is an explicit per-deployment opt-in (see *Hosted AI* below); with it off, the editors never call AI endpoints.

## Editor

Switch between architectural and furnished plans, or explore the 3D house. Select a room, wall or object to open its focused edit prompt. Preview supported local changes before applying, with undo and local saving. Architectural dimensions start enabled; interior dimensions are optional. Expand **Dimensions & schedules** to filter model measurements by level, category or search, export the filtered CSV, or download the current visible plan as SVG. Canvas labels prioritize overall dimensions and the selected wall/opening; the schedule supplies the complete measurements. Wall/room lengths use centerlines, overall extents use outer faces, and furniture dimensions exclude working clearances.

See [AI_SETUP.md](docs/AI_SETUP.md) for the hosted-AI environment variables and deployment steps. No API key is ever entered, stored or sent from the browser.

## Advanced Studio: design → compare → share

1. Choose **New home**, start with a compact, family, or courtyard brief, and review the requirements. You can also revise the existing home's brief. Approving a new home creates a separate project; undo returns to the previous design.
2. Use **Plan / Split / 3D**, level controls, layers, and properties to edit. Local generation supports 1–5 floors, the requested bedroom/bathroom counts, offices, courtyard concepts, shared walls/openings, and aligned stair positions. Unsupported compact combinations fail before changing your design.
3. Enter a supported command such as `remove the sofa` or `change living room floor to dark oak`. Review the actual before/after model captures, then choose **Apply change** or **Keep current**. Unsupported language produces guidance instead of guessing.

   Select a room, wall or furniture item in either view (or Layers) to open its contextual change prompt. Examples: `make it blue`, `move it 0.2m left`, `rotate 45 degrees`, `remove it`, or `change this floor to oak`. Preview images frame the selected room. The selection interpreter isolates the target and rejects whole-house lighting or another item's changes. Colors/finishes work on walls and furniture; wall geometry is edited through Properties. AI remains disconnected, so arbitrary conversational requests are not supported yet.
4. **Compare finishes** renders Warm oak, Light stone, and Evening light from the same camera. Apply to the whole home or a selected room. Finishes preserve geometry, and applying them is undoable.
5. **Render gallery** captures room views and street/facade perspectives at 1280, 1920, or 2560 px. Captures persist locally in IndexedDB for the matching project revision; design changes invalidate them. These are deterministic 3D scene images, not AI photographs.
6. **Versions** restores a previous local design without losing undo. **My homes** shows plan previews, search, rename, duplication, deletion, and local/cloud histories.
7. **Export home** downloads labelled PNG plans, a multipage raster PDF, a 3D screenshot, or the editable `.mopple` project. The ZIP home package includes all floor plans, dimensions, local room/exterior captures when WebGL is available, and a future render handoff. Share links open a read-only 3D viewer with a plan fallback.

Local snapshots and ten previous versions are saved on this browser/device. Download a project/package to keep an independent backup. Portable share links contain the project snapshot and cannot be revoked. Local captures are bounded to the twelve most recently captured projects and do not travel with cloud projects or `.mopple` files.

## Hosted AI (opt-in)

Local rules handle common edits offline. When they cannot handle a command, the editor can fall back to a hosted model — but only when both the server and the client flags are on, and only for the selected room, wall or object. Requests carry the user's text plus a selection-scoped context (never the full project), the server validates every returned operation, and the result is always a reviewable preview that you apply or discard. No key is entered, stored or sent from the browser.

| Variable | Meaning |
| --- | --- |
| `NVIDIA_API_KEY` | Server-side NVIDIA NIM key. Missing key → hosted requests return a generic 503. Never use a `VITE_` prefix; browser keys are not supported. |
| `AI_FALLBACK_ENABLED` | Server kill switch. Must be exactly `true`, otherwise `/api/ai/operations` and `/api/ai/generate` return 503. Default off. |
| `VITE_ENABLE_AI_FALLBACK` | Build-time client opt-in. Default off; with it off, the editors behave exactly like the local-only interpreter. |
| `AI_PER_IP_PER_MINUTE` | Requests per IP per minute (default 10). Exceeding it returns 429. |
| `AI_DAILY_CAP` | Deployment-wide daily cap across all callers (default 500). Reaching it returns 503. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Atomic cross-instance quotas. Required on Vercel. |

Quota policy: hosted mode is the default unless the environment is explicitly local development (`NODE_ENV=development`, or `VERCEL_ENV=development` from `vercel dev`). Vercel deployments (production and previews) require Upstash Redis; a standalone production server may instead set explicit `AI_PER_IP_PER_MINUTE` and `AI_DAILY_CAP`. Without a usable quota, hosted requests fail closed with 503 and the offline designer keeps working. Caller-supplied API keys are ignored in production and on Vercel — the server key is the only credential.

To test on a Vercel preview: set `NVIDIA_API_KEY`, `AI_FALLBACK_ENABLED=true`, and both Upstash variables in the project's environment (previews use the same server key), deploy a preview, open the preview URL with `VITE_ENABLE_AI_FALLBACK=true` in the build environment, select a room or item, and submit a command the local interpreter does not know (for example `nudge this item left`). The status line should show the hosted states (thinking with cancel, rate limit, or unconfigured) and never apply anything without review.

The free NVIDIA tier is intended for development only; put a paid key and enforced quotas behind any public deployment. `/api/ai/generate` remains a process-local concept-generation endpoint gated by the same flag, key and quota rules. Job status/cancellation require the random access token returned with the job; public job enumeration is disabled.

## Optional cloud setup

`.env.example` lists optional Supabase, telemetry, waitlist, canonical origin, and server settings. See [UPGRADE_SUMMARY.md](docs/UPGRADE_SUMMARY.md) and `supabase/001_alpha.sql` for setup. Cloud services were not provisioned or live-tested in this implementation. Cloud saves are serialized per editor session; concurrent writes from other devices still require conflict handling.

Future image enhancement should consume actual model captures plus camera/material/geometry context. AI images are not implemented. Walkthrough navigation is deferred.

## Validate

```sh
npm run build
npm test
npm run test:prompts
npm run test:studio
npm run test:selection
npm run test:editor
npm run test:alpha
npm run test:architecture
npm run test:courtyard
npm run test:languages
npm run test:warm
```

The build includes strict TypeScript checking. Browser scripts start their own local Vite servers and require Playwright Chromium (`npx playwright install chromium` if missing). The warm-design sweep checks six viewport widths and all three languages. Screenshots and reports are generated under the ignored `.impeccable/review/` directory.

For a local production server:

```sh
npm run build
npm start
```

The Node server defaults to `127.0.0.1:3000`. It does not automatically load `.env`; use Node's `--env-file=.env` if optional server variables are needed.

## Boundaries

Layouts are schematic concepts. Furniture is procedural; circulation/collision, engineering, building-code compliance, detailed site constraints, and budget feasibility are not certified. Reference attachments record filenames, not uploaded image/PDF contents. Room/exterior captures preserve the current model but do not provide ray-traced or AI photorealism. PDF plans are raster images, not CAD. WebGL is required for 3D; 2D and plan exports remain available without it. Three.js retains the existing large-bundle advisory.

The renderer-independent meter-based version 1.0 `.mopple` model lives in `src/project/`; the same validated engine drives both editor views. The landing uses labelled AI-generated inspiration photography with reduced-motion-aware scroll reveals and image parallax; it mounts no editable house. The homepage header displays the supplied `logo.png`; the supplied icon remains available for other Nopple surfaces. The pinned `design.md` remains preserved.

## Languages

Use the header language selector for English, Russian or Uzbek. The choice persists on this browser across the homepage, Editor, advanced tools, library and share page. It changes interface copy without rewriting saved project data. Supported localized edit examples are translated locally; this does not enable AI or general natural-language understanding.

### Warm design and motion
The October 2026 video reference now informs layered scroll movement, a growing photographic panel and staggered section reveals, with reduced-motion support. The user-approved warm direction uses ivory, walnut and clay; nopple-icon.png is the logo and favicon. Native language menus have matching options and touch targets. Responsive QA covers 320–1920px and all three languages (`node scripts/check-warm.mjs`). AI remains disconnected.
