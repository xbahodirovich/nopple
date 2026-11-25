# Nopple Pro Pilot — Progress Log

Read this file first in every new session. After every task, append: date, task,
commit hash, result of build and tests, open questions.

| Date | Task | Commit | Build | Tests | Open questions |
|---|---|---|---|---|---|
| 2026-11-25 | 1. Landing rewritten for professionals (EN/RU/UZ) + demo video placeholder in hero | 1865bc4 | pass | 110/110 pass | Demo video uses the existing AI-generated image as poster; real video to be supplied later. Waitlist copy intentionally left for task 2. |
| 2026-11-25 | 2. Waitlist posts to VITE_WAITLIST_ENDPOINT with busy/ok/local/error states, localStorage fallback kept | 7f223cc | pass | 110/110 pass | Kept VITE_WAITLIST_URL as deprecated alias so an already-configured destination keeps working; no endpoint is configured by default (human chooses later). No automated browser test added for the form (unit test suite has no DOM harness for it). |
| 2026-11-25 | Gate 1 follow-up: removed demo play button (poster + caption kept); waitlist consent line, JS email validation + 254 cap, hidden honeypot that silently succeeds without posting | 7e8b15b | pass | 110/110 pass | — |
