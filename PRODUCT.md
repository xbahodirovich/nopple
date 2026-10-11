# Nopple

<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
A local-first home design platform combining architecture, interior design, and interactive 3D visualization, with future AI integration deferred.

## Capabilities and Constraints
The landing page presents labelled architectural inspiration photography with reduced-motion-aware scroll animation and direct entry into Editor at `/editor`; `/advanced` preserves the detailed Studio tools. Editor supports architectural/furnished plans and contextual local edit previews. Architectural measurements start enabled, interior dimensions are optional, and a level/category/search-filtered schedule exposes model dimensions with CSV export and a current-plan SVG download. Wall and room lengths use centerlines; room bounds and furniture sizes are not finished clearances. Nopple Studio is a separate editor with shared `.mopple` state, 2D/3D views, furniture and architectural edits, undo/redo, import/export, local autosave, offline concept-house generation and optional NVIDIA NIM operations through a same-origin Node service. Alpha adds optional Supabase Google accounts and project history, read-only sharing, labelled PNG/PDF plans and 3D screenshots. CAD/BIM and construction-ready output remain out of scope. Generated layouts are schematic concepts. The studio includes reviewed design briefs, multi-floor concepts, local command preview/apply, finish comparisons, persistent local render galleries, version recovery, manual/solar sunlight and ZIP delivery. AI is deferred: the Studio UI makes no AI requests. Geolocation metadata is accepted for imported solar studies; map UI is removed.

## Brand Commitments
The user's latest request pins `design.md` (Air) as the visual authority: black photographic canvas, white ghost/haze controls, flat surfaces, Inter interface type, condensed display headlines and cursive accents. Replace the previous blue/green website identity. The public product name is Nopple and the main workspace is Editor at `/editor`. Preserve old storage keys and `.mopple` import/export compatibility. English, Russian and Uzbek are selectable UI languages with a persistent local preference. The decorative cloud/glass photograph is an atmosphere asset, not a house rendering.

## Accessibility & Inclusion
Responsive layouts, reduced-motion support, keyboard-operable architectural selection, visible focus, and a directly usable SVG plan before WebGL loads. The Editor plan remains usable when 3D is unavailable; homepage inspiration and navigation do not require WebGL.

### Warm design and motion
The October 2026 video reference now informs layered scroll movement, a growing photographic panel and staggered section reveals, with reduced-motion support. The user-approved warm direction uses ivory, walnut and clay; nopple-icon.png is the logo and favicon. Native language menus have matching options and touch targets. Responsive QA covers 320–1920px and all three languages (`node scripts/check-warm.mjs`). AI remains disconnected.
