# Nopple Pro Pilot — Goal Status

## Completed
1. Landing page rewritten for professionals (EN/RU/UZ) with demo video placeholder.
2. Pro waitlist form: `VITE_WAITLIST_ENDPOINT`, consent, validation, honeypot, local fallback.
3. Materials list export (CSV and PDF) from the current project.
4. GLB export of the 3D home (Three.js GLTFExporter).
5. Share view branding: studio name + logo, stored on-device, carried in the share
   link payload only. Saved .mopple format unchanged.

## Paused
6. Share link with up to 3 design options the client can switch between —
   **paused 2026-11-25**. Measured offline links run 9,000–50,000 characters
   (studio branding adds up to ~27,000 more), too long to paste into chat apps.
   Plan: replace with stored short links later, which need Supabase — the human
   is setting it up. Revisit when Supabase is ready.

## To do
7. Starting templates (studio, 2-bedroom apartment, small house).
8. docs/floorplan-import-design.md (design document only).
9. README updates: exports, studio branding, waitlist variable, share link limits.
