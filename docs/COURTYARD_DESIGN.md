---
name: Nopple Editor
description: Flat haze editing surfaces on a black canvas, with connected concept views and local previews.
colors:
  black-void: "#000000"
  haze: "#f5f5f5"
  whiteout: "#ffffff"
  ink: "#1b1b1b"
  muted: "#666666"
  divider: "#d0d0d0"
  focus: "#426188"
typography:
  body:
    fontFamily: "'Inter Variable', sans-serif"
  heading:
    fontSize: "23px"
    fontWeight: 500
    letterSpacing: "-.035em"
rounded:
  panel: "9px"
  button: "8px"
  input: "4px"
  prompt: "12px"
---

# Nopple Editor design record

## Overview

**Creative North Star: Air — midnight sky through glass sculpture.**

Editor at `/editor` follows the user-pinned [root design.md](../design.md): black canvas, haze surfaces, white/ink controls and flat borders. Root `design.md` remains unchanged. The filename `COURTYARD_DESIGN.md` and internal courtyard implementation names are retained for compatibility; Courtyard is no longer the public workspace name. [WEBSITE_DIRECTION.md](WEBSITE_DIRECTION.md) records the replacement of the former blue/paper direction.

This record describes the primary residence editor, especially `src/editor/courtyard-theme.css`, and its shared language behavior. `src/reference-theme.css` extends the monochrome treatment to related product surfaces, but their complete behavior is outside the homepage/Editor review scope.

The editable 180 m², two-floor concept has three bedrooms and two bathrooms. Design, finish comparison and delivery remain the primary sections. Previews use local commands. AI integration remains deferred, and adding a service key does not connect AI editing or produce photorealistic house assets.

## Colors

Haze panels and white fields carry Ink text with neutral gray dividers and supporting labels. Ink primary controls sit on light surfaces; dark view controls use Haze for the selected tab. The contextual prompt is Ink with a Haze submit action. Existing `#426188` focus/status accents are subordinate to the monochrome interface. Actual house materials retain their own colors.

## Typography

Inter Variable supplies controls, headings and labels. The desktop Nopple wordmark is 34px at weight 500; the stage heading is 23px at weight 500. Brief and properties surfaces have a 14px base, while technical labels include 10–13px exceptions. Mobile contextual input uses 16px text. These compact product labels document current density rather than overriding the root reference's body-copy guidance.

## Layout

Desktop uses a 238px brief rail, flexible model/plan viewport and 232px properties rail in a 565px workspace. Rails narrow below 1250px. Below 950px, properties disappear and the lower comparison/delivery sections stack.

Below 600px, the 470px model area precedes the brief, Split is hidden, and view, level and plan-style controls occupy separate rows. Level controls can scroll horizontally. Finish cards scroll with snap alignment and delivery actions stack. The contextual prompt becomes a fixed bottom panel with stacked field/action. Header controls wrap for translated labels; the language selector remains visible. View and level controls have 40px minimum targets. Camera refitting responds to meaningful viewport-aspect changes.

## Elevation & Depth

Borders and contrasting neutral surfaces establish interface depth. The contextual prompt and dialogs have no shadow; dialogs dim their backdrop. Runtime scene lighting, glass and modeled furniture provide architectural depth but remain schematic. Finish, room and exterior captures come from the project model. The homepage's decorative cloud/glass image is not substituted for Editor output.

## Shapes

Stage and lower panels use 9px radii, buttons use 8px, fields use 4px and the contextual prompt uses 12px. Circular finish indicators express selection. Measured plan linework and inline SVG icons remain functional rather than decorative.

## Components

- **Architectural plan:** selectable SVG rooms, walls and furniture, door swings, windows, room areas and dimensions in meters. It redraws from project state while preserving keyboard focus. Architectural/Furnished tabs switch drawing presentation. Output is a concept, not a construction plan.
- **Measurement schedule:** architectural dimensions start enabled; interior dimensions are optional. The canvas prioritizes overall dimensions and the selected wall/opening with offset label lanes. The expandable schedule lists wall, room, opening, floor, overall and furniture model measurements with level/category/search filters. CSV exports the filtered schedule; SVG downloads the current visible plan and its active dimension settings. Wall and room lengths use centerlines, overall extents use outer faces, and room extents are bounding sizes. Furniture dimensions exclude working clearances. These are model measurements, not construction documents.
- **Connected views:** Plan, Split and 3D share selection and project state. Floor controls filter levels; camera reset restores framing. Room thumbnails follow selection. Editor view links choose the starting plan or model view.
- **Contextual prompt:** selection opens a named prompt with relevant examples. Changing targets clears stale text; Close/Escape dismisses. Enter previews, Shift+Enter adds a line, and selection does not force text focus. A target picker provides a non-canvas selection path.
- **Review and editing:** local commands generate previews requiring Apply change or Keep current. Undo and local-save feedback remain available. Known Russian/Uzbek command examples map to supported local operations; this is not general multilingual AI understanding. Preview titles preserve user text.
- **Finishes and delivery:** three project-rendered variants use swatches and pressed indicators. Larger screens expose sunlight adjustment. Temporary captures preserve the live scene. Floor-plan PNGs, selected-room PNGs, `.mopple` export and snapshot-link sharing remain available; `/advanced` opens detailed tools with the current draft/home.
- **Language and state:** English, Russian and Uzbek are selected in the header and persisted locally under `nopple_language`. Visible UI, common rendering/storage/clipboard errors, size labels and relevant accessibility attributes translate. Language changes preserve input values and model state. User project labels and unmapped technical errors may remain original. Visible focus, pressed states, disabled controls and live status text communicate state.

## Do's and Don'ts

- Do retain selection consistency, explicit preview confirmation, draft persistence, undo and usable mobile controls.
- Do use project-derived captures and truthful concept/local-editing labels.
- Do retain old storage keys and `.mopple` import/export compatibility despite public naming changes.
- Don't restore the former blue/green workspace identity or imply that language selection rewrites user data.
- Don't present AI setup as connected editing or claim the visual redesign closes the photorealistic house-rendering gap.

Evidence, 2026-10-10: `.impeccable/review/nopple/editor-{en,ru,uz}-{desktop,mobile}.png` records six Editor combinations, alongside six homepage captures. `checks.json` reports passing language selection, overflow, cross-page persistence, reversible translation, Russian local preview and preserved draft-text checks. The implementation handoff reports a passing production build and 85 unit tests. These validate the reviewed core flow; they do not establish exhaustive translation coverage, advanced-tool review or photorealistic output quality.

Current update, 2026-10-11: architectural measurement controls, optional interior dimensions, filterable schedules and CSV/current-plan SVG downloads supplement the earlier reviewed Editor. The 2026-10-10 evidence above predates this update.

## Warm interface update, 11 October 2026
The user’s later warm/cozy request overrides the earlier black interface specification. Editor backgrounds now use #f5eee4 and #fff9f0, walnut text/actions and clay focus rings; project materials and 3D rendering are unchanged. Header uses the supplied nopple-icon.png. Language controls use a warm native picker with base-select enhancement and native fallback. Responsive checks at 320, 390, 768, 1024 and 1440px pass in English, Russian and Uzbek. The earlier architectural schedule, optional interior dimensions and measurement limitations remain unchanged.
