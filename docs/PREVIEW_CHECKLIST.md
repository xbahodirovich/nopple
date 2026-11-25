# Vercel Preview — Manual Checklist

For each Nopple Pro preview deployment. With every environment variable unset,
AI must stay off, the waitlist must fall back to local storage, and the whole
app must work from the preview origin. Assumes a clean browser profile (or
incognito window).

## 1. Landing (`/`) in three languages
- [ ] Hero shows "The home, before it exists." with the demo-video placeholder (poster + "Demo video coming soon.") — no play button.
- [ ] Language selector switches every visible string to Русский and O‘zbekcha; no English leftovers in the hero, steps, closing or footer.
- [ ] Waitlist consent line ("We'll email you about Nopple Pro. No spam.") is translated in all three.
- [ ] No horizontal overflow at 390 px width in any language.

## 2. Waitlist
- [ ] With `VITE_WAITLIST_ENDPOINT` unset: submitting a valid email shows "Interest saved on this device. The online waitlist is not available yet."
- [ ] Invalid email (e.g. `foo@bar`) shows the validation error and does not POST anywhere (check DevTools → Network).
- [ ] If an endpoint IS configured for this preview: submitting shows "You joined the Nopple Pro waitlist." and exactly one POST with JSON `{email}` leaves the browser.

## 3. Templates and brief flow (`/advanced`)
- [ ] **New home** opens the brief dialog with six starters: Compact · 50 m², 2-bedroom apartment · 68 m², Small house · 110 m², Compact home · 90 m², Family home · 220 m², Your home · 240 m².
- [ ] Each starter fills the form; approving generates a furnished, valid home (walk through the 3D view).
- [ ] With a room selected, a local prompt like `make this floor marble` previews and applies; undo restores it.

## 4. Exports (advanced editor toolbar)
- [ ] Plan PNG and Plan PDF download and open (PDF has one page per floor, text readable).
- [ ] 3D image downloads (WebGL present) and Export GLB downloads a valid `.glb` (opens in a glTF viewer).
- [ ] Materials CSV opens with Rooms / Finishes / Furniture sections; Materials PDF paginates and shows the same rows.

## 5. Studio branding
- [ ] **Studio branding** panel: set a name (≤ 60 chars) and a PNG/JPEG/WebP logo ≤ 256 px; "Save studio profile" shows the saved state.
- [ ] With a logo set, the hint "The logo will not appear in offline share links." is visible.

## 6. Share links
- [ ] **Share** copies a `…/share#gz=…` link; in a fresh incognito window it opens the read-only 3D viewer with the studio name shown (no logo).
- [ ] Old uncompressed links (`#home=…`) created before this release still open, without branding.
- [ ] Corrupting the `#gz=` value shows a clean "Invalid share link." message, not a crash.

## 7. AI must be off
- [ ] With `AI_FALLBACK_ENABLED` and `NVIDIA_API_KEY` unset: any prompt the local rules cannot handle shows the offline guidance state; no request to `/api/ai/*` leaves the browser for locally-supported commands.
- [ ] `curl -s -o /dev/null -w "%{http_code}" -X POST <preview-origin>/api/ai/operations` returns **503** (not 200, not 500).
- [ ] The AI settings dialog states hosted AI is off; no API key is requested or stored in the browser.

## 8. Local-first sanity
- [ ] Reload `/advanced` after designing: the home is still there (localStorage).
- [ ] **My homes** lists, renames and deletes locally; no sign-in prompt appears.
- [ ] The demo project still opens after re-deploying the preview (data keyed by project id, not deployment).
