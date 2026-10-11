# Mopple alpha upgrade

> Current Studio workflow (7 October 2026): reviewed multi-floor briefs, local command previews, finish comparisons, persistent local gallery captures, version recovery and complete ZIP delivery are implemented. Studio makes no AI requests. See [STUDIO_RELEASE.md](STUDIO_RELEASE.md) for the current feature/validation report and [README.md](../README.md) for current usage. The original alpha steps below are historical; later updates supersede their single-floor limits and test counts.

## Built by step

1. Audited the existing Vite/TypeScript/Three.js/Zod application; preserved the editor, design, offline engine and undo/redo. See AUDIT.md, DECISIONS.md and BLOCKERS.md.
2. Extended the existing meter-based version 1.0 JSON model rather than introducing competing state. Levels are `building.floors`; room polygons derive from ordered wall references. Walls, openings, room finish references, furniture physical dimensions/materials/transforms and lights feed both editor views. Added strict minimum room areas and polygon overlap checks, retaining enclosure/reference/opening validation. Demo and generated furniture now include physical `size` in meters. Older files without size use kind dimensions. `size` is the base physical dimension; scale remains an editing multiplier.
3. Added a Vercel `/api/ai/operations` function using the server NVIDIA key, optional per-tab personal override, explicit GENERATE/EDIT request mode, JSON-only schema contract and one validation retry. The engine validates operations and resulting geometry before applying. Failed/unconfigured hosted requests fall back to the offline engine with visible status. Added per-IP and daily quotas, optional atomic Redis quotas across instances, parsed serverless body support and bounded request size/timeouts. Offline prompt normalization covers common English/Russian/Uzbek generation and edit vocabulary.
4. Added optional Supabase Google OAuth, session refresh, RLS-protected projects, atomic save RPC and ten previous cloud versions. Local autosave always runs first. `/homes.html` lists, opens, renames, duplicates, deletes and restores homes. A browser project library retains ten previous local versions. Editor use does not require login.
5. Added `/share.html`, a read-only orbit scene with badge and plan fallback if WebGL is unavailable. Signed-in cloud shares use opaque UUIDs and a model-only read RPC; local shares carry a validated snapshot in the URL fragment. Added viewport-independent labelled PNG plans per level, a multipage raster PDF preserving multilingual labels and dimensions, and immediate-render 3D PNG capture. Exporters are separate from UI for future CAD/BIM adapters.
6. Added optional analytics/error HTTP sinks, all six requested events, touch pinch zoom and responsive panel controls. Kept the landing design while adding OG metadata, no-JavaScript content, a concrete before/after example, audience line and configurable Pro waitlist. Added ten multilingual prompts and browser alpha acceptance checks.

## Run locally

Use Node 24 or later (native TypeScript stripping is used by the server/tests).

```sh
npm install
cp .env.example .env
npm run dev
```

Open `/` for the landing page, `/editor` for Courtyard, `/advanced` for detailed editing and `/homes` for saved homes. All local/offline features work with an empty `.env`. Vite loads server credentials from `.env`; only `VITE_` variables enter the browser bundle.

```sh
npm run build
npm run lint
npm test
npm run test:prompts
npm run test:editor
npm run test:alpha
```

Browser tests require Playwright Chromium (`npx playwright install chromium` if absent). They start their own local servers. Browser acceptance scripts start their own local Vite server. Responsive checks cover phone through wide desktop sizes in English, Russian, and Uzbek.

To serve a production build locally, run `npm run build`, then export server variables into the shell and run `npm start`. Unlike Vite, the standalone Node server does not load `.env` automatically; use Node's `--env-file=.env` with `node --env-file=.env --experimental-strip-types server/main.ts` when desired.

## Environment variables

Every variable is listed in `.env.example`. Credentials are optional for local operation.

| Variable | Purpose/default |
| --- | --- |
| `NVIDIA_API_KEY` | Secret server NVIDIA NIM credential; absent means offline fallback. Never prefix with VITE. |
| `AI_PER_IP_PER_MINUTE` | Requests per IP per minute; default 10. |
| `AI_DAILY_CAP` | Total AI requests per UTC day; default 500. Zero disables hosted requests. |
| `UPSTASH_REDIS_REST_URL` | Server Redis REST endpoint for shared atomic quotas. |
| `UPSTASH_REDIS_REST_TOKEN` | Secret Redis token; use with URL. |
| `VITE_SUPABASE_URL` | Public Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Public anon key, protected by RLS. Never use a service-role key here. |
| `VITE_ANALYTICS_PROVIDER` | `plausible` sends Plausible event payloads; another nonempty value sends generic `{event,properties}` JSON. Empty disables analytics. |
| `VITE_ANALYTICS_URL` | Public event ingestion endpoint; must accept browser CORS. |
| `VITE_ERROR_TRACKING_URL` | Public JSON error ingestion endpoint; empty disables reporting. Must accept browser CORS. |
| `VITE_WAITLIST_URL` | Public JSON `{email}` subscription endpoint; must accept browser CORS. Missing: interest is saved on this device and explicitly labelled as local. |
| `VITE_SITE_URL` | Canonical deployed origin, e.g. your actual HTTPS domain. Makes OG image and URL metadata absolute at build time. Missing: relative OG image metadata remains. |
| `PORT` | Standalone server port; default 3000. |
| `HOST` | Standalone server bind address; default 127.0.0.1. |

Do not include private credentials in any public ingestion URL. Public analytics requests include event metadata and page paths, never prompts or project JSON. Error messages may contain object names; configure the receiving endpoint's retention policy accordingly.

## Cloud setup and deployment

1. Create a Supabase project and execute `supabase/001_alpha.sql` once. The table uses `(owner_id,id)` as its primary key so the shared demo ID does not collide across accounts. Owner RLS applies to all direct project access. Anonymous visitors can read only models deliberately shared via the UUID RPC.
2. Enable Google in Supabase Auth, configure its Google client credentials there, and allow your exact `/homes.html` callback URL for localhost and the deployed domain. Set the Supabase Site URL too.
3. Add the public Supabase variables, server NVIDIA key, canonical site origin and optionally telemetry/waitlist endpoints in the hosting environment. Public VITE variables require rebuilding after changes.
4. Import the repository into Vercel using its Vite preset (`npm run build`, output `dist`). `vercel.json` retains `/editor` routing and configures the AI function's duration. No deployment was executed because hosting/account credentials were not supplied.
5. Set both Upstash variables for deployment-wide quotas. Without them, limits are in-process and reset on cold starts; they are not a global spending guarantee on multiple serverless instances. Redis failure denies hosted AI and lets the client use offline generation.
6. Verify Google login, save/version restore across devices, cloud sharing, provider requests and ingestion in the configured environment before inviting alpha users.

Implementation references: [Vercel Node function bodies](https://vercel.com/docs/functions/runtimes/node-js), [Supabase implicit sessions](https://supabase.com/docs/guides/auth/sessions/implicit-flow), [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Validation and known limitations

Build and strict TypeScript lint pass. All 57 unit tests pass. Unit tests cover model invariants, atomic operations, scene behavior, hosted credentials, parsed Vercel bodies, validation retry, quota rejection and offline fallback. All ten prompt-generation checks pass. Browser checks cover generation, safe import, undo, local autosave/history, project management, PNG/PDF/3D downloads, read-only sharing, mobile panels and a no-JavaScript landing. Screenshots are in ignored `.impeccable/review/`.

- No real provider/account/deployed-domain tests were possible without credentials. SQL is supplied but has not been executed against a live database.
- Offline generation produces a single-floor schematic with rectangular room wings and a corridor. Unrecognized/ambiguous edits give guidance; this is not unrestricted multilingual AI. Unsupported small briefs fail clearly instead of producing invalid geometry.
- Furniture uses procedural assets. Room and opening overlaps are validated; furniture collision, wall collisions, circulation, structural engineering and code compliance are not verified. Complex footprints use overall room bounding dimensions on exports.
- PDF output is a labelled raster plan, not editable CAD; DXF/IFC/glTF are future adapters. 3D rendering requires WebGL; sharing provides a static plan fallback.
- Local storage is device/browser-specific and can fill up. Portable shares can be long and cannot be revoked; cloud shares need a configured account. Public shares use generic static link-preview metadata, not personalized per-home thumbnails.
- OAuth uses Supabase's implicit browser flow with tab-scoped tokens and refresh; closing the tab requires signing in again. Local and cloud writes are not a collaborative editing system and concurrent cross-device edits have no merge UI.
- Waitlist and telemetry ingestion need configured endpoints; no account/collection service was provisioned. Missing settings produce local interest storage/no-op telemetry.
- Three.js still produces Vite's existing large-chunk advisory; it does not fail the build.

## Three best next tasks

1. Provision the cloud services, execute the migration and run a deployed acceptance pass with real Google/NVIDIA/Redis credentials.
2. Improve compact-apartment layouts and furnishing placement, including collision/egress checks and richer Uzbek/Russian language coverage.
3. Add account-scoped sync/conflict handling, revocable share controls with generated thumbnails, and vector CAD export adapters.

## develop_v1 merge update

The merged editor now uses reviewed briefs for house creation and supports multi-floor architectural generation, measurement overlays/CSV, exterior/interior scene captures, a render gallery, geolocation and sun-path controls. New house prompts preserve English/Russian/Uzbek recognition and open the brief workflow; hosted edit retry/quotas, cloud/local saving, portable shares and image/PDF exports remain integrated. A Vercel adapter also exposes `/api/ai/generate` for the generation job workflow. Add `npm run test:architecture` to the validation commands. In-memory generation jobs are process-local, not durable across serverless restarts; externally generated photorealistic images remain unconfigured. Earlier single-floor-only limitations describe the pre-merge alpha.

### Courtyard reference studio

Added `/courtyard.html` with the supplied design/compare/share composition, a curated 180 m² courtyard residence, selection-based local edit previews, persistent undoable changes, real finish captures, and exports. Enter through **Courtyard studio** in the editor. This is an editable procedural concept, not yet a photorealistic reproduction of the target image.


## Website and clean routes — October 2026

The homepage now opens on an interactive architectural plan with a same-home 3D toggle and selection handoff. Courtyard is the canonical `/editor`; prior detailed tools are retained at `/advanced`. Legacy HTML routes redirect with query parameters preserved. Courtyard adds architectural/furnished plan switching and contextual local edit prompts. See `AI_SETUP.md` for server key configuration and its current integration limits. Photorealistic reference parity remains unachieved.
