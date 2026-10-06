# Mopple Studio

`editor.html` is a separate entry point. `src/editor/main.ts` initializes one project engine from validated local autosave or `examples/modern-house.mopple`, then shares it with both canvases and both side panels. Selection, active plan floor, panel visibility, camera and drag previews are ephemeral UI state. Committed design edits always pass through the engine. Preview failure/cancellation restores the canonical snapshot.

## Editing and persistence

The 2D canvas supports pan/zoom, selection, furniture movement/yaw and wall endpoint handles. The 3D canvas supports orbit/pan/zoom and furniture movement. The inspector provides numeric positions, rotation, scale, room names/types/styles/dimensions and wall dimensions/endpoints. Layers are keyboard-accessible buttons; the settings dialog traps focus and restores its trigger. Mobile uses toggleable Layers/Properties panels so the viewport retains its width.

Undo/redo stores up to 50 complete project revisions. Rename and scale are ordinary operations. Invalid operations and reentrant history calls do not change state/history. Non-mutating operations do not add history. Imports are undoable; explicit `loadProject()` initializes a new session and clears history.

Autosave uses `mopple_editor_project` in localStorage after 600ms, with synchronous flush on pagehide, beforeunload and document backgrounding. A storage failure displays “Not saved” and offers export through existing controls; navigation prompts while changes remain unsaved. This is local browser storage, not cloud synchronization. File import validates suffix, size, JSON, version and relationships before replacing state.

## AI path

Browser → same-origin `/api/ai/operations` → NVIDIA NIM → strict operations/geometry validation → browser engine.

The service is in `server/ai.ts`, mounted by Vite for development/preview and by `server/main.ts` for production. It accepts a caller-owned NVIDIA bearer credential, checks origin when supplied, caps incoming JSON at 1 MiB and prompts at 4,000 characters, allows only the listed models, uses a fixed NVIDIA upstream and times out after 90 seconds. It sends the full current project and selection plus the generated operation JSON Schema. No model-authored code is executed. No credentials are logged or persisted by the server.

The GLM request uses low reasoning effort and explicit `clear_thinking`, following [NVIDIA's model reference](https://docs.api.nvidia.com/nim/reference/z-ai-glm-5-3-flash). Model availability and quotas depend on the user's NVIDIA account. Empty/truncated output, authentication, unavailable models, rate limits, network failures and invalid geometry are reported without committing a partial batch.

The frontend allows only one outstanding request. Its captured engine revision must still match when the response returns. An API error does not silently fall back to a different local edit. Unrecognized IDs, commands or extra schema fields are rejected rather than guessed. Malformed replies never move an object to a default position or redirect an edit to the first room.

API keys live in memory for the tab lifetime. A legacy NVIDIA localStorage key is moved into memory and removed from persistent storage; legacy Gemini keys are removed and are never sent to NVIDIA. Model selection is an optional local preference. User text and imported names are escaped in templates, or rendered through `textContent`, including error messages.

Without a key, the explicit offline interpreter handles house creation, resizing, furniture add/remove/replace/move/rotate, room finishes, styles and lighting presets. It is a command interpreter, not an unrestricted language model. Repeated room/object names require selection or a specific name. For example, “bedroom” is never treated as the furniture noun “bed.”

`create_house` calls `generateArchitecturalLayout` (`src/project/architecture-generator.ts`) to produce real multi-floor architectural designs (1–5 floors) with shared coincident wall vertices, room distribution (ground-floor living, dining, kitchen, office, accessible suite; upper-floor bedrooms and baths), non-overlapping doors and windows, and inter-floor procedural stairs with stringers, risers, treads, and handrails. This operation replaces the design and can be undone; the editor invokes it only after brief review and explicit scope acknowledgment. Ordinary AI edits use targeted operations.

## Rendering

`scene-design.ts` builds a renderer adapter from shared projections. It triangulates individual room floors, places walls/openings at their floor elevation, resolves material IDs, handles stacked/non-overlapping wall openings, builds all supported project light types, inserts realistic PBR window glazing with physical reflections, generates ceiling slabs between floors, and places roof geometry with `userData: { isRoof: true }`. Furniture uses procedural stand-ins by kind with material slots, including detailed 3D stairs and bathroom fixtures (vanity, basin, mirror).

`disposeTree()` recursively disposes shared geometry/materials and light shadow resources when rebuilding. The 3D viewport renders on invalidation and stops while idle or hidden. Camera fitting uses house bounds. Viewport HUD presets include Isometric, Top-Down, and Cutaway (which toggles roof and intermediate ceiling visibility for floor plan inspection). If WebGL fails, the editor keeps its 2D canvas and reports the failure. The 2D view uses the selected floor; room fills reflect floor materials, and device-pixel-ratio handling is consistent across drawing and zoom.

## Studio Render Gallery

`src/editor/render-gallery.ts` provides geometry-grounded architectural visualizations. The dialog renders a card for each room in the building with:
- Dedicated camera placement at human eye level (1.6m above floor elevation) aimed at the room center.
- Direct synchronization with the active project sun azimuth, elevation, warmth, and intensity.
- Conditioned prompt synthesis including room dimensions, surface materials, furniture inventory, window orientation, and sunlight characteristics.
- Interactive lightbox modal for inspecting full-resolution renderings.
- Full render package export as a portable `.json` specification.

## Running and verification

- `npm run dev`: landing/editor and AI middleware.
- `npm run build && npm start`: production assets plus Node API/static server (Node 24+).
- `npm test`: project, AI, server contract, generation API, geometry/material/light/disposal and timeline tests.
- `npm run test:editor`: isolated Chromium tests for desktop/mobile, scale, rename/history, generation, autosave, safe imports, simulated AI errors, idle rendering, cutaway preset, render gallery, and sun controls. Screenshots go to ignored `.impeccable/review/`.

There is no cloud database or user account system. A static host must route `/api/ai/operations` and `/api/ai/generate` to the Node service for connected AI; offline commands and client rendering continue to work without it. Unit/browser tests use mocked provider responses and do not establish that a particular live account/key/model combination is working.

## Conversational Brief Discovery and Manual Sun

`src/editor/brief.ts` owns the native dialog, conversational discovery assistant, natural language correction, reference attachment, auto-draft persistence under `mopple_brief_draft` in `localStorage`, and durable approval token creation (`approvalToken`). It commits `create_house` followed by `update_design_brief` as one undoable transaction. No geometry changes during intake or cancellation. New-house chat requests open this flow; the ordinary AI operations endpoint rejects house replacement and brief mutation.

`server/generation.ts` exposes `/api/ai/generate`, managing durable jobs (`queued`, `running`, `succeeded`, `failed`, `cancelled`, `stale`) with token verification, multi-stage progress (architecture → 3D scene → interior renders), and comprehensive requirement coverage reporting.

Manual sun direction, height, warmth, and intensity preview Three.js directional and ambient lighting without mutating the engine for every pointer event; releasing a slider commits persisted `metadata.sun`. Engine notifications resynchronize undo, import and reload. Automatic solar-time mode provides date, season, solar hour, golden hour status, and 3D Heliodon sun path arcs with memory-safe geometry disposal. Scene framing excludes the site ground. Map and underlay components are permanently removed.

## Dimensioned architecture and exterior views

The 3D viewport offers whole-house, cutaway, top, street-eye-level and four facade perspectives. The Level selector isolates a floor; Dimensions shows overall extents plus the selected room or wall. The measurement schedule lists every modeled wall length, height and thickness, opening width/height/sill, offset and wall pier, room X/Z extents and polygon area, and floor elevation/height. Filter or select rows, or export the filtered schedule as CSV. Labels avoid overlapping; the schedule retains every value.

Inspection controls extend the existing dark Studio surfaces and mint accents. A compact wrapping toolbar sits above a collapsed-by-default measurement schedule, with mint keyboard-focus outlines. The scrollable table keeps its header visible and uses tabular numerals; its height is reduced on mobile. Overlaid meter labels use light text on opaque dark plates with mint dimension lines and do not intercept viewport gestures.

Measurements are derived from canonical project geometry in meters. Wall lengths and room boundaries use centerlines; building extents use outer wall faces. Room X/Z extents are bounding extents, not clear widths for irregular rooms. Wall envelope height excludes the generated roof. These are design-model measurements, not a construction certification or a structural/MEP drawing set.

The Interior & Exterior Gallery includes a 1.6m street camera and front (+Z), rear (−Z), left (−X), and right (+X) facade perspectives. Front is a model convention, not a surveyed street location. Captures use the same geometry, openings, materials and sunlight as interiors. They restore the exact working camera, roof visibility, floor isolation and selection afterwards, including on errors. Saved-project changes invalidate cached captures. The gallery exports camera/prompt specifications even for projects without a brief; approved generation packages additionally include measurements and five exterior jobs. Cloud image enhancement remains a separate integration.

The same gallery uses “Interiors” and “Exterior & street” category buttons, with mint text and border indicating the active category. Captured-preview badges use opaque dark Studio surfaces to remain legible over bright images. Exported viewpoint specifications include both camera position and look-at target.

Run `node scripts/check-architecture.mjs` for browser coverage of measurements, CSV export, interior/exterior capture, camera restoration, stale preview invalidation and desktop/mobile layouts.
