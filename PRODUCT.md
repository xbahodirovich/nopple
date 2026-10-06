# Mopple

<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
An AI-powered home design platform combining architecture, interior design, and interactive 3D visualization.

## Capabilities and Constraints
The landing page presents one scroll-driven demonstration house. Mopple Studio is a separate editor with shared `.mopple` state, 2D/3D views, furniture and architectural edits, undo/redo, import/export, local autosave, conversational requirements discovery with durable approval tokens, real multi-floor architectural generation (1–5 floors) with stairs, ceiling slabs and roof geometry, dimensioned 3D inspection with floor isolation and CSV measurement schedules, Studio Render Gallery with geometry-grounded room, street and four facade viewpoints, and optional NVIDIA NIM operations through a same-origin Node service. Authentication, cloud project management, CAD/BIM and construction-ready output remain out of scope. House creation requires a complete reviewed brief with a cryptographic approval token; the full brief persists with the project. Manual sun controls (azimuth, elevation, warmth, intensity) replace the map workflow. An exportable generation plan captures pending architecture and interior rendering jobs; server generation API (`/api/ai/generate`) tracks multi-stage jobs and requirement coverage.

## Brand Commitments
Preserve the layout, typography, spacing, and black canvas of design.md. The explicit task overrides its Dala-specific violet branding and particle imagery with Mopple mint branding and a house. Do not modify design.md. Use the user-provided mopple-logo.png for the header/footer and mopple-icon.png for the tab icon. Preserve the source files.

## Accessibility & Inclusion
Responsive visualization including mobile, reduced-motion support, scroll-driven transformations with static stage controls for reduced motion, and a non-WebGL fallback.
