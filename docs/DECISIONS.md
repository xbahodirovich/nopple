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

- Local Studio release: defer AI connections. Interpret supported commands locally on a scratch engine, present model-derived before/after captures, and require Apply before committing one undoable change.
- Approved brief requirements are supplied before geometry generation; explicit floors/spaces/household fields prevent inheriting a previous brief. New-home approval creates a separate project ID.
- Compare actual material/sun variants from one camera. Never substitute generated photographs for model-derived previews. AI image enhancement remains a future provider integration.
- Keep captures in bounded IndexedDB storage keyed by project/revision, outside the core model and localStorage history. Save failures retain downloads and in-memory images.
- Export a dependency-free ZIP of editable geometry, raster plans, dimensions and available local scene captures; the user keeps an independent backup.
- Brief fingerprints cover all requirement fields and are consistency markers, not authentication. Generation job status/cancellation use separate random access tokens; process-local jobs are bounded and not publicly enumerated.
- Serialize cloud writes from one browser session and keep local files available when the remote library fails. Cross-device merges remain a separate feature.

- Courtyard reference workspace: keep the supplied visual target as the authority, but expose the live model honestly as a concept. Use a dedicated draft key and `/courtyard.html` to avoid replacing existing saved homes. All displayed views are generated from the same editable project; no reference-image slices are presented as live geometry. Cutaway clipping is a view effect, not a destructive wall edit.
