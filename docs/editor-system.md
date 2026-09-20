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

`create_house` produces a single-floor concept with requested bedroom/bathroom counts, living/kitchen spaces, an optional dining room and a central hall. It uses the requested total centerline polygon area and includes shared walls, doors, windows, basic furniture/materials/lights. Too many rooms for the area are rejected. This operation replaces the design and can be undone; it is accepted from AI only for explicit house-creation requests. Ordinary edits use targeted operations.

## Rendering

`scene-design.ts` builds a renderer adapter from shared projections. It triangulates individual room floors, places walls/openings at their floor elevation, resolves material IDs, handles stacked/non-overlapping wall openings and builds all supported project light types. Furniture uses procedural stand-ins by kind with material slots; an external asset catalog is future work.

`disposeTree()` recursively disposes shared geometry/materials and light shadow resources when rebuilding. The 3D viewport renders on invalidation and stops while idle or hidden. Camera fitting uses house bounds. If WebGL fails, the editor keeps its 2D canvas and reports the failure. The 2D view uses the selected floor; room fills reflect floor materials, and device-pixel-ratio handling is consistent across drawing and zoom.

## Running and verification

- `npm run dev`: landing/editor and AI middleware.
- `npm run build && npm start`: production assets plus Node API/static server (Node 24+).
- `npm test`: project, AI, server contract, geometry/material/light/disposal and timeline tests.
- `npm run test:editor`: isolated Chromium tests for desktop/mobile, scale, rename/history, generation, autosave, safe imports, simulated AI errors and idle rendering. Screenshots go to ignored `.impeccable/review/`.

There is no authentication, cloud storage, unrestricted CAD toolset or construction-ready output. A static host must route `/api/ai/operations` to the Node service for connected AI; offline commands continue to work without it. Unit/browser tests use mocked provider responses and do not establish that a particular live account/key/model combination is working.
