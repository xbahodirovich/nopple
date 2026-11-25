# Nopple Pro Pilot — Progress Log

Read this file first in every new session. After every task, append: date, task,
commit hash, result of build and tests, open questions.

| Date | Task | Commit | Build | Tests | Open questions |
|---|---|---|---|---|---|
| 2026-11-25 | 1. Landing rewritten for professionals (EN/RU/UZ) + demo video placeholder in hero | 1865bc4 | pass | 110/110 pass | Demo video uses the existing AI-generated image as poster; real video to be supplied later. Waitlist copy intentionally left for task 2. |
| 2026-11-25 | 2. Waitlist posts to VITE_WAITLIST_ENDPOINT with busy/ok/local/error states, localStorage fallback kept | 7f223cc | pass | 110/110 pass | Kept VITE_WAITLIST_URL as deprecated alias so an already-configured destination keeps working; no endpoint is configured by default (human chooses later). No automated browser test added for the form (unit test suite has no DOM harness for it). |
| 2026-11-25 | Gate 1 follow-up: removed demo play button (poster + caption kept); waitlist consent line, JS email validation + 254 cap, hidden honeypot that silently succeeds without posting | 7e8b15b | pass | 110/110 pass | — |
| 2026-11-25 | 3. Materials list export (CSV + PDF) from current project: rooms, finishes, furniture | 15f12a6 | pass | 115/115 pass | PDF written by hand (rasterized canvas pages, same technique as plan PDF) — no PDF dependency added. Browser check in scripts/check-materials.mjs (not part of npm test); it also covers the GLB export from task 4, so it lands with the task 4 commit. |
| 2026-11-25 | 4. GLB export of the 3D home via Three.js GLTFExporter (building + furniture groups; no sky/sun/helper objects) | 3ecd155 | pass | 115/115 pass | Browser check passed: CSV 963 B, PDF 231 KB, GLB 2.9 MB with valid 'glTF' magic, zero page errors (scripts/check-materials.mjs). GLB excludes lights and environment by design; can be revisited if clients ask. |
