# Nopple

A local-first home-design studio with reviewed requirements, synchronized floor plans and editable 3D, finish comparisons, saved versions, and share/export tools. The homepage and Editor follow the dark Air reference in `design.md`, with self-hosted Inter, condensed headlines and cloud/glass atmosphere. The advanced editor retains its detailed tools.

## Run

Use Node 24 or later:

```sh
npm install
npm run dev
```

Open `/editor` for Editor, `/advanced` for the full Studio tools, `/homes` for your library, and `/` for architectural inspiration and Editor entry. Legacy `.html` links redirect automatically. No credentials are needed for the local workflow. The editor does not call AI endpoints: design commands are interpreted locally and always previewed before you apply them. AI integration is deferred.

## Editor

Switch between architectural and furnished plans, or explore the 3D house. Select a room, wall or object to open its focused edit prompt. Preview supported local changes before applying, with undo and local saving. Architectural dimensions start enabled; interior dimensions are optional. Expand **Dimensions & schedules** to filter model measurements by level, category or search, export the filtered CSV, or download the current visible plan as SVG. Canvas labels prioritize overall dimensions and the selected wall/opening; the schedule supplies the complete measurements. Wall/room lengths use centerlines, overall extents use outer faces, and furniture dimensions exclude working clearances.

See [AI_SETUP.md](docs/AI_SETUP.md) for where to configure a future NVIDIA key; adding a key does not yet enable AI in Editor.

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

## Optional cloud and future AI setup

`.env.example` lists optional Supabase, telemetry, waitlist, canonical origin, and server settings. See [UPGRADE_SUMMARY.md](docs/UPGRADE_SUMMARY.md) and `supabase/001_alpha.sql` for setup. Cloud services were not provisioned or live-tested in this implementation. Cloud saves are serialized per editor session; concurrent writes from other devices still require conflict handling.

The existing NVIDIA operations handler and Vercel adapters remain available for a later integration, but the Studio UI does not invoke them. `/api/ai/generate` is a process-local concept-generation endpoint, not durable storage or an image provider. Job status/cancellation require the random access token returned with the job; public job enumeration is disabled. Approval fingerprints include all brief requirement fields and detect changed inputs; they are not authentication or a server signature.

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
