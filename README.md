# Mopple landing page

```sh
npm install
npm run dev
```

`npm run build` type-checks and builds into `dist/`. `npm run preview` serves that build. `npm test` checks the continuous animation timeline and the Mopple project engine.

## Mopple Studio

Open `/editor.html` (or `/editor` on the production server) for the shared 2D/3D editor. It supports furniture movement/rotation/scaling, room dimensions, wall endpoints, undo/redo, browser autosave and `.mopple` import/export. Mobile Layers and Properties buttons expose the same controls.

New-house requests open a conversational requirements discovery dialog with an AI discovery assistant, interactive requirements form, reference attachment, draft persistence (`mopple_brief_draft`), and durable approval token verification. The architectural engine generates real multi-floor layouts (1–5 floors) with shared walls, doors, windows, ceiling slabs between floors, procedural stairs, and bathroom fixtures. Common edits still run offline:

- `Create a modern 150m² house with 3 bedrooms and 2 bathrooms`
- `Move the sofa 1m left`
- `Add a chair to the bedroom`
- `Change living room floor to dark oak`

Generated houses feature shared coincident wall vertices, accurate room distributions, inter-floor vertical connections, and PBR 3D materials. A creation request replaces the design as one undoable operation. Use names or selection to distinguish repeated bedrooms/furniture. Arbitrary existing-design edits require the connected AI model.

For NVIDIA NIM, open AI Settings and supply a personal `nvapi-` key. Keys are kept in tab memory, not persisted; re-enter after reload. The client calls the same-origin `/api/ai/operations` endpoint for interactive edits and `/api/ai/generate` for durable generation jobs. The server sends the design to NVIDIA, bounds requests, validates returned operations and geometry, and reports errors without silently applying a different offline action. Concurrent/stale replies cannot overwrite edits.

`npm run dev` and `npm run preview` include the API middleware. For production:

```sh
npm run build
npm start
```

The Node server (Node 24+) serves `dist` plus the AI endpoint on `127.0.0.1:3000`; `PORT` and `HOST` configure binding. A static-only host supports offline editing but needs this API service for connected AI. Never put provider keys in `VITE_*` variables. The service requires a caller-supplied key; it has no shared server credential or account database.

## Project format

The renderer-independent `.mopple` format, runtime validation, atomic project engine, operations and file helpers live in `src/project/`. See [format documentation](docs/mopple-format.md), [editor implementation](docs/editor-system.md), and [example house](examples/modern-house.mopple). The editor creates one engine shared by its views; the landing demonstration remains independent promotional geometry.

With the development server running, `npm run test:browser` checks four viewport widths, forward/reverse scrolling, pinned scene visibility, stage selection, reduced motion, CTA links, and WebGL fallback. `npm run test:lifecycle` checks pixel-identical scroll reversal, idle/offscreen rendering suspension, and context loss. Browser checks require Playwright Chromium (`npx playwright install chromium` if not already installed). Screenshots are written to `.impeccable/review/`.

Run `npm test` for engine, AI, scene and timeline unit tests; `npm run test:editor` starts an isolated Vite server and checks the editor in Chromium, including mobile, unsafe imported names, save-on-exit and simulated provider failures. `npm run build` checks TypeScript and both page bundles. Vite reports its standard large-chunk advisory for Three.js. Live provider calls require a valid NVIDIA key; automated tests mock upstream responses.

## Implementation

The landing page uses Vite + TypeScript with a lazy-loaded Three.js demonstration and links to Mopple Studio. The editor has a separate entry bundle; its Node AI proxy is included in development, preview, and the production server. Authentication and cloud project storage are not implemented.

- `src/scene/HouseModel.ts`: one procedural 10 × 8 m house; all stages share geometry and room boundaries.
- `src/scene/timeline.ts`: reversible scroll-position mapping from exterior → interior → floor plan, using sine easing and hold intervals.
- `src/scene/HeroScene.ts`: camera, lighting, scroll-driven updates, visibility suspension, adaptive rendering, and disposal.
- `src/fallback.ts`: matching SVG plan for loading and WebGL failures.
- `src/styles.css`: responsive visual system. Inter is bundled locally, as allowed by `design.md`.

The original `design.md` is unchanged. Its black canvas, typography, spacing, two-column composition, and minimal components are retained; the task's explicit Mopple direction supersedes the reference's Dala-specific violet and particles. The official `mopple-logo.png` appears in the header and footer, framed with CSS to remove its generous outer margins. `mopple-icon.png` supplies the tab favicon. Both original files remain unchanged.

Scrolling down transforms the pinned house from exterior to interior to floor plan; scrolling up restores the exact earlier representation. Stage buttons scroll to the matching viewpoint. There is no timer-based playback. Reduced-motion preference removes pinning and scroll scrubbing; stage selection shows static views immediately. Rendering stops while idle, offscreen, or in a hidden tab. Mobile uses a lower pixel ratio without shadows, and slow renderers reduce quality further. Context loss falls back to the static plan.

Three.js references: [renderer lifecycle](https://threejs.org/docs/pages/WebGLRenderer.html) and [orthographic projection](https://threejs.org/docs/pages/OrthographicCamera.html).

## Architecture, Render Gallery, and Solar Study

Use **House brief** to collect requirements conversationally, review structured questions, attach references, and generate a durable approval token. **Render gallery** opens the Studio Interior Render Gallery with room viewpoints captured at physical eye level (1.6m), locked to project sun coordinates, with geometry-grounded visual prompts and high-resolution export. **Render plan** exports the complete generation plan and brief.

Sun controls provide manual azimuth (0–360°), elevation (1–90°), warmth (0–100%), and intensity (0.5–5.0), with live Three.js directional lighting, golden hour simulation, persistent `metadata.sun`, autosave, and undo/redo. The Cutaway HUD button toggles upper roof/ceiling visibility for plan inspection. Map and underlay components are permanently removed. Legacy geolocation metadata remains accepted for file compatibility.

### 3D architecture and exterior review

Open Studio → **3D Scene**. Use the viewport’s **3D view**, **Level**, and **Dimensions** controls; expand **Measurement schedule** to inspect model distances or export CSV. **Render gallery → Exterior & street** captures the street perspective and four facades from the same house used for interiors. Model dimensions distinguish centerlines from outer faces; front is the +Z side.
