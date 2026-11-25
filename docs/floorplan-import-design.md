# Floorplan Import — Design Document

Status: design only, no implementation. Target release: Nopple Pro pilot follow-up.

## Problem

Professionals already have floor plans: PDFs from architects, scans, photos of
printed sheets. Today a Nopple project starts from a brief or manual drawing.
Importing an existing plan removes the most expensive first step for designers
and agents who want to show a client an existing home before renovation.

## Goals

- Turn a rasterized floor plan into walls, rooms and openings in the current
  `.mopple` model, confirmed by the user before anything is applied.
- Stay local-first: the image never leaves the device, no new accounts, no paid
  services, no server round-trip.
- Keep the saved `.mopple` format unchanged; import produces ordinary projects.

## Non-goals

- Construction-document accuracy. Import is a concept starting point; dimensions
  remain model dimensions per the existing measurement disclaimers.
- Automatic furniture placement from plan symbols (phase 3+).
- Multi-page PDFs, DWG/DXF (phase 3+, would need an approved dependency).
- Photogrammetry or 3D scans.

## Inputs

| Format | Support | Notes |
|---|---|---|
| PNG / JPEG / WebP raster | Phase 1 | Scans, screenshots, photos of plans |
| PDF | Phase 2 | Rasterize page 1 with the browser's PDF render path; vector extraction later |
| DWG / DXF | Not planned | Requires a paid or heavy dependency; out of scope |

Size guard: reuse the `MAX_FILE_BYTES` concept from `src/project/validation.ts`
(5 MB) and downscale to a working resolution (≤ 4096 px long edge) before processing.

## Pipeline

All stages are pure functions over typed intermediates in a new
`src/project/floorplan-import.ts` (DOM glue lives beside the editor that hosts it),
so every stage is unit-testable without a browser.

1. **Load & preprocess** — decode to `ImageData`; grayscale, contrast normalize,
   optional deskew (dominant line angle via a one-dimensional projection profile).
2. **Scale calibration** (user-assisted, phase 1) — the user drags along a known
   dimension and types the real length, or picks from detected candidates
   (e.g. a dimension string like `6 400`). Pixels-per-meter is stored only in
   the in-memory import session, never in the project.
3. **Wall tracing** — phase 1 is *assisted tracing*: the raster sits as a locked
   underlay in the existing 2D plan canvas; the user clicks corners, the tool
   snaps to detected dark lines (short-range edge search, max ~8 px pull) and
   chains them into closed polylines. Phase 2 adds auto-detection: binarize →
   run-length scan for axis-aligned segments → merge collinear runs →
   prune < 0.4 m segments; non-axis-aligned walls stay manual.
4. **Rooms & topology** — closed wall chains become room candidates; the user
   names each room and picks a type from the existing
   `roomSchema.type` enum. Boundary edges reference wall ids exactly like
   manually drawn rooms (`boundary: { wallId, reversed }`).
5. **Openings** — doors/windows are placed by clicking a wall; the tool computes
   `position` (0–1 along the wall) and default `width`/`height`
   (0.9 × 2.1 m doors, 1.2 × 1.4 m windows, sill 0.9 m), all editable inline
   with the existing properties panel.
6. **Review & apply** — the import session builds a batch of
   `MoppleOperations` (`add_floor`, `add_wall`, `add_room`, `add_door`,
   `add_window`) and shows the standard preview → apply flow used by prompt
   edits (`src/project/preview.ts`), so undo/apply semantics stay identical.
   `validateProject` runs before apply; nothing is applied when validation fails.

## User flow

`Import floor plan` lives next to `New home` in the editor tools and as a card
on the homes page. The dialog mirrors the brief dialog: pick file → calibrate →
trace → review → the generated home opens in the normal editor, then the normal
prompt-edit flow takes over ("make this floor oak" etc.).

## Data rules

- Imported walls reuse `wallSchema` (centerline + thickness). Traced double
  lines collapse to one centerline; thickness is user-set per wall (default 0.2 m).
- Materials: every import creates a small default material set (same ids across
  imports: `imported_wall`, `imported_floor`) so projects stay predictable.
- Levels: a plan imports as one floor; multiple sheets can be appended as
  additional floors with user-set elevation.
- Georeference, north angle: optional manual entry into existing
  `metadata.geo.northAngle`; no EXIF/GPS parsing.

## Failure modes

| Failure | Behavior |
|---|---|
| Unreadable image | Clear error, nothing applied |
| Uncalibrated scale | Import blocked until calibration; estimated scale shown as "unverified" |
| Open wall chain | Room creation blocked; chains highlighted in red |
| Overlapping openings | `validateProject` rejects the batch; offending openings highlighted |
| User cancels | Session dropped; no project mutation |

## Testing

- Synthetic fixtures: render known `.mopple` projects to raster (the plan canvas
  from `src/alpha/exporters.ts`), re-import, and assert round-trip tolerance
  (±2 % on lengths).
- Stage-level unit tests in `src/project/floorplan-import.test.ts` with crafted
  `ImageData` arrays (no browser needed).
- Validation: every import batch must pass `validateProject` in tests.

## Privacy

Images and traces stay in memory (never `localStorage`, never network). Only the
resulting project, which the user can already export and share, persists.

## Dependencies

None for phases 1–2. If phase 2's auto-detection later wants a computer-vision
library, that requires explicit approval per the no-new-dependencies rule; the
fallback is shipping auto-detection as a WebAssembly-free hand-rolled scanner or
keeping assisted tracing.
