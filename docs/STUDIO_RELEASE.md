# Local Studio release — 7 October 2026

## Contextual changes — 10 October 2026

Selecting a room, wall or item in 2D/3D or Layers opens a contextual input. Requests preview against an isolated selection before applying and remain undoable. Fresh material definitions prevent recoloring other objects using the original shared finish. Room previews use the corresponding interior camera. Unsupported/global requests show inline guidance. The local parser supports a bounded set of edits, not arbitrary AI conversation.

New generated homes include bedside cabinets, extra dining chairs, tall kitchen storage, and toilet/shower fixtures where the room's size permits. Existing saved homes keep their furniture inventory. This is an incremental furnishing upgrade, not an exact reconstruction of the illustrated reference or proof of photorealistic quality.

## Visual quality follow-up — 9 October 2026

The earlier generated concept image was an illustration of the intended direction, not a screenshot or proof of achieved rendering quality. The local workflow release did not meet its photorealistic visual bar. Functional completion and visual completion must be tracked separately.

The first renderer upgrade adds screen-space contact occlusion to both viewport and captures, reduced ambient washout, correctly colored wood textures, rounded upholstered furniture with separate timber/metal/fabric finishes, woven fabric bump maps, leaf-shaped plants, generated living-room rugs and wall skirting that respects door openings. Camera projection and postprocessing buffers restore correctly after captures. AI remains disconnected.

These changes improve the procedural preview; they do **not** achieve the reference's professional architectural imagery. Reaching that bar still needs a detailed architectural/furniture asset system, high-quality material/environment inputs, realistic indirect lighting (such as path tracing), and representative image comparisons as visual acceptance criteria. AI enhancement is optional and cannot substitute for the model's accuracy.

The subsequent house-detail pass adds window reveals/mullions/sills, reflective transparent glazing, framed doors with two-sided handles, exterior foundation trim and top-floor roof coping. Glass no longer casts an opaque shadow, allowing the directional sun through real window openings. Details follow the existing walls and openings; they do not replace the saved plan. The 3D view/level controls now share a compact styled dock with native accessible selectors, a dimension toggle and a separate measurement disclosure. Mobile keeps all three controls in one row.

The approved direction is implemented as a working local home-design workflow: brief, editable plan and scene, compare, review changes, recover versions, and deliver a home package. AI calls and image enhancement are deliberately disconnected. This report supersedes older single-floor and render-gallery claims in the historical upgrade/design review.

## Delivered

- **Studio workspace:** black/mint desktop split view, brief summary, layers, properties, local command composer, responsive mobile controls, and focused compare/export/version dialogs. Original logo, icon, typography and landing identity remain.
- **Reviewed generation:** compact, family and courtyard starters; separate new-home projects; full-field confirmation fingerprints; requested floors, bedroom/bathroom counts, office/courtyard concepts and material/lighting preferences reach the generator. Shared footprints and aligned stairs connect 1–5 levels. Impossible small layouts reject before replacing the current model.
- **Real previews:** supported local commands run against an isolated model. Before/after images, apply/discard, stale-revision checks and undo protect the current design. No Studio action calls an AI endpoint.
- **Finish comparison:** Warm oak, Light stone and Evening light are actual model variants captured from the same camera. Room or whole-home application changes finishes/lighting while preserving geometry. Furniture physical dimensions are applied before rotation; stair slab openings, courtyard roof exclusions and room framing improve scene accuracy.
- **Capture gallery:** local room and exterior views at standard, Full HD and large resolution. IndexedDB retains captures for the matching model revision, bounded to twelve recently captured projects. Files can be downloaded; older captures are invalidated when the design changes.
- **Library and recovery:** searchable plan thumbnails, distinct new projects, duplication, rename/delete, ten previous local versions, undoable version restore, serialized optional cloud saves and visible cloud failure feedback.
- **Delivery:** editable `.mopple`, labelled PNG plans, multipage PDF, 3D screenshot, read-only share links, and ZIP with all floor plans, measurements CSV, room/exterior captures and a future render handoff. CSV labels escape spreadsheet formulas.
- **Existing API hardening:** no generation-job enumeration; a random per-job capability is required for status/cancellation; bounded process-local retention; idempotency includes the brief, target model and revision. Confirmation fingerprints detect changed requirements and are not authentication signatures. The endpoint does not claim to have generated AI images.

## Verification

Strict TypeScript/production build, project/server/renderer unit tests and the multilingual prompt suite pass. The Studio browser check exercises reviewed generation, three distinct captures, geometry preservation, local preview/apply/discard, undo, versions, capture recovery after reload, ZIP contents, sharing, search and mobile dialogs. It verifies zero AI requests and no uncaught page errors.

Editor, alpha and architecture regression checks all pass, covering imports, escaping, lighting, save/restore, sharing, exports, levels, measurements and gallery cameras. Landing browser and lifecycle checks also pass, including idle rendering, resume and context loss. Desktop/mobile confirmation screenshots are local review artifacts under `.impeccable/review/studio/`.

The design hook identified image placeholders without sources during implementation. These were replaced with populated image slots before the dialog opens; no hook rule was suppressed.

## External work and deliberate limits

AI photorealistic enhancement and walkable navigation remain deferred. Current images are procedural local 3D captures, so they will not match the generated concept's professional photography until an image provider and better assets are connected. The export handoff prepares the model/camera context for that later work.

Cloud credentials, authentication providers, production hosting and live cloud verification were not provisioned. Cloud projects still need cross-device conflict handling. Browser captures do not sync to cloud projects. Portable local share links embed a snapshot and cannot be revoked.

The layout generator produces schematic concepts, not a construction-ready architectural service. Site constraints, reference-file contents, arbitrary requested custom spaces, structural/code checks, accessibility certification, budgets and furniture/circulation collision checks are not fully solved. Engineering review and production service setup remain necessary before claiming a production-complete product. The existing Three.js bundle-size advisory remains.

## Courtyard reference workspace (2026-10-10)

`/courtyard.html` is a separate, persistent reference workspace reached from the editor's Courtyard studio link. It follows the supplied three-section composition: design, finish comparison, and delivery. The reference is a visual target, not an imported 3D asset; the current procedural rendering is not a photorealistic match.

The curated project contains 180 m² of enclosed floor area across two levels, three bedrooms, two bathrooms, furnished living/dining/kitchen, a planted courtyard, exterior stair and timber screen. Floor area excludes outdoor custom rooms. The furnished plan and cutaway both use the editable scene. Upper front/partition walls are clipped only for cutaway presentation; exported model geometry retains full heights.

Selection requests use the local validated edit interpreter with preview/apply/undo. Finish comparisons use real alternative projects, with no AI calls. Drafts use `mopple_courtyard_studio_v1`, separate from existing editor autosave. The full-editor link uses `?source=courtyard` to continue this draft. Project, floor-plan and room-view exports and snapshot sharing are available. Browser verification is `npm run test:courtyard`.

Verification after the furnishings rebuild: production build and 85 unit tests pass. Courtyard browser checks pass for real captures, preview/apply/undo, local persistence, floor controls, export, mobile layout and no AI requests. Shared architecture browser checks pass for dimensions, CSV, five exterior cameras, interior capture, camera restoration and mobile. Both independent visual reviews still return **REBUILD** against the supplied photorealistic reference.
