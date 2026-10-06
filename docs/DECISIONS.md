# Decisions

- Preserve the existing version 1.0 model: room polygons derive from directed wall boundaries, avoiding duplicated geometry. Floors represent levels; furniture dimensions derive from asset footprint and scale.
- Keep offline generation deterministic and explicitly describe results as concepts, not construction drawings.
- Use Supabase REST/Auth endpoints without adding an SDK; cloud features are optional.
- Lint is the strict TypeScript static check.
- Preserve version 1.0 backward compatibility with optional explicit furniture size/material fields. Generated and demo furniture use meter dimensions; older files resolve kind defaults.
- Use Supabase implicit OAuth and refresh with sessionStorage so credentials do not persist after the tab closes.
- Public unauthenticated sharing uses a URL-fragment snapshot; cloud sharing uses a random UUID and a model-only security-definer RPC.
- Room/door/window geometric invariants reject invalid changes. Furniture collision and building-code analysis remain documented alpha limitations.
- Require optional Redis configuration for deployment-wide caps; otherwise limits are explicitly per process. Failed Redis checks fail closed for hosted requests.
- No configured waitlist sink means local interest capture with honest status, not a claim that an email was submitted.
- Keep static generic share metadata; canonical absolute OG URLs are configured through VITE_SITE_URL at build time.

- Merge develop_v1: preserve cloud saving, sharing, exports, hosted edit credentials/retry/quotas and multilingual prompt recognition while adopting reviewed briefs, multi-floor architectural generation, render gallery and solar/geolocation controls. New editor house prompts enter the reviewed brief workflow; ordinary edit prompts keep hosted AI with offline fallback.
- Design review: preserve the incumbent black/mint palette, Inter, and reversible pinned house demonstration. Apply Taste to marketing and Impeccable to product workflows. Treat the requested unavailable Humanizer and 21st MCP as documented tool gaps and edit copy directly. Prefer immediate studio interactions and explicit, optional sun animation over decorative transitions.
