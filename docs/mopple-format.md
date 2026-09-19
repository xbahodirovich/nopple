# Mopple Project Format 1.0

`.mopple` is readable UTF-8 JSON describing a home independently of its renderer or AI provider. The project engine owns the active design. Architecture, interior and 3D consumers derive their views from that same revision. The file contains no React state, Three.js objects, generated geometry, camera settings, selections or animation state.

## Current implementation and scope

The repository originally contains a Vite/TypeScript landing page, a procedural Three.js demonstration, an SVG fallback and scroll animation tests. There is no React/R3F, editor, backend, asset service or existing state-management/validation library. `design.md` is a visual reference and remains unchanged.

This change implements the **core foundation only**, as requested: typed schemas, Zod validation, the engine, AI operations, shared projections, a session store, file helpers, tests and an example. The existing `HouseModel.ts`, `HeroScene.ts`, `fallback.ts` and landing UI are **not yet connected to this engine**. Their promotional demonstration remains procedural. Do not mistake the three data projections for finished editors or a general-purpose scene renderer.

## Files and public entry points

| File | Responsibility |
| --- | --- |
| `src/project/schema.ts` | Strict runtime schemas and inferred TypeScript models; centralized format/version constants |
| `src/project/geometry.ts` | Canonical room polygons and geometric checks |
| `src/project/validation.ts` | Project parsing, version dispatch and relationship validation |
| `src/project/operations.ts` | Provider-independent operation schemas |
| `src/project/engine.ts` | Controlled edits, atomic commits and subscriptions |
| `src/project/adapters.ts` | Architecture, interior and 3D data projections |
| `src/project/files.ts` | Import, export payload and browser download helpers |
| `src/project/index.ts` | Environment-independent public exports |
| `src/project/store.ts` | One application session seeded from the example; imports Vite `?raw` separately |
| `examples/modern-house.mopple` | Valid 80 m², four-room example with furniture, materials and lights |

## File envelope

All fields below are required; individual collections may be empty for a new project.

```json
{
  "format": "mopple",
  "version": "1.0",
  "project": {
    "id": "project_example",
    "name": "My home",
    "createdAt": "2026-09-19T00:00:00Z",
    "updatedAt": "2026-09-19T00:00:00Z",
    "units": "meters"
  },
  "building": { "floors": [], "rooms": [], "walls": [], "doors": [], "windows": [] },
  "interior": { "objects": [] },
  "materials": [],
  "lighting": [],
  "metadata": {}
}
```

The root version is the project format version; it is deliberately not duplicated inside `project`. Timestamps must be ISO 8601 UTC dates, and `updatedAt` cannot precede `createdAt`. Metadata permits optional `author` and `description` strings. Unknown fields are rejected throughout the format rather than silently discarded.

IDs match `[A-Za-z][A-Za-z0-9_-]{0,127}`. Entity IDs, including the project itself, are globally unique within a file, stable across edits and preserved by import/export. Asset IDs belong to an external catalog namespace; they need valid syntax but are not entities in this file. Renaming an entity is not an ordinary operation. Human-readable names may change without changing IDs.

## Coordinate system

- Right-handed world coordinates: **+X** right/east, **+Y** up, **+Z** down/south on a top-down plan. North is **−Z**. A 2D renderer projects `(x,z)` to its canvas and applies pan/zoom only in its adapter.
- One meter is one unit everywhere in version 1.0. Other unit values are rejected. Display conversions belong in the UI.
- The origin `(0,0,0)` is the project reference point at ground datum. The example centers its 10 × 8 m footprint around it. The origin never moves when changing modes.
- Wall endpoints and room polygons are world X/Z coordinates. Each wall starts vertically at its floor's `elevation`. Floor elevation is an absolute world Y; floor, room and wall heights are positive vertical distances.
- Interior positions and point/directional light positions are absolute world X/Y/Z, including on upper floors. Do **not** add floor elevation again to object Y. Object pivots are asset-defined, conventionally bottom-center.
- Object rotation uses right-handed Euler angles in **radians**, applied in `XYZ` order. Scale is a positive, dimensionless XYZ vector. Assets must use meters and Y-up at scale 1; asset-loader corrections belong in the adapter.
- Opening `position` is its horizontal **center**, normalized from wall start (`0`) to end (`1`). Window sill height is measured up from the floor; door sill is implicitly zero. Opening widths and heights use meters.

Geometry comparisons use an absolute tolerance of `1e-7` meters. The adapter's `rotationY = -atan2(end.z-start.z, end.x-start.x)` aligns a wall cuboid's local +X axis with the wall.

## Architecture data

| Entity | Fields |
| --- | --- |
| Floor | `id`, `name`, `elevation`, `height` |
| Wall | `id`, `floorId`, `start: {x,z}`, `end: {x,z}`, `thickness`, `height`, optional `materialId` |
| Room | `id`, `name`, `type`, `floorId`, `boundary`, `height`, optional `materials`, optional `style` |
| Door | `id`, `wallId`, `position`, `width`, `height`, optional `materialId` |
| Window | Door fields plus required `sillHeight` |

Room types: `living_room`, `bedroom`, `kitchen`, `bathroom`, `hallway`, `office`, `dining_room`, `garage`, `custom`. `materials` can reference `floor`, `wall` and `ceiling` material IDs. Explicit wall material takes precedence over a room's default wall material. Opposite wall-face materials are outside this MVP.

### One source of room geometry

A room boundary is an ordered list of directed wall references, not a second polygon that could become stale:

```json
{
  "id": "room_kitchen",
  "name": "Kitchen",
  "type": "kitchen",
  "floorId": "floor_ground",
  "height": 2.8,
  "boundary": [
    { "wallId": "wall_nw", "reversed": false },
    { "wallId": "wall_center_n", "reversed": false },
    { "wallId": "wall_left", "reversed": true },
    { "wallId": "wall_wn", "reversed": false }
  ],
  "materials": { "floor": "mat_oak", "wall": "mat_plaster" }
}
```

`reversed: false` traverses start → end, and `true` traverses end → start. Every edge must join the next, with the last closing onto the first. Both winding directions are accepted. Boundaries cannot repeat walls, self-intersect, backtrack or have zero area. Every referenced wall must belong to the room's floor. Adjacent rooms share wall IDs and traverse them in opposite directions; the schema does not enforce global adjacency/manifold topology.

`roomPolygon(project, room)` derives the vertices from these edges. A wall shared by multiple rooms therefore has only one position. Wall joins must be authored with coincident endpoints; split a wall at a junction when needed. Automatic wall splitting/merging and implicit T-junction topology are not implemented.

```json
{ "id": "door_bedroom", "wallId": "wall_center_n", "position": 0.72, "width": 0.9, "height": 2.1, "materialId": "mat_oak" }
```

Openings must fit entirely within their wall and cannot overlap another opening on that wall. Doors and windows retain their normalized positions when walls move or change length; edits that make an opening stop fitting are rejected. Renderers must cut actual wall openings using the adapter's opening descriptors; those descriptors are not already triangulated meshes.

## Interior, materials and lighting

Interior objects contain `id`, `assetId`, `roomId`, `kind`, `position`, `rotation`, `scale`, and optional `materialOverrides: [{slot, materialId}]`. Kinds: `sofa`, `bed`, `table`, `chair`, `cabinet`, `lamp`, `decoration`, `appliance`. Override slot names must be unique per object. Asset resolution and checking that slots exist happen in a future asset registry; unresolved assets should render a placeholder. No model data or executable asset URLs are stored in the file.

```json
{
  "id": "object_sofa",
  "assetId": "sofa_sectional",
  "roomId": "room_living",
  "kind": "sofa",
  "position": { "x": -2.4, "y": 0, "z": 0.8 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "scale": { "x": 1, "y": 1, "z": 1 },
  "materialOverrides": [{ "slot": "upholstery", "materialId": "mat_linen" }]
}
```

Materials have `id`, `name`, `kind`, a six-digit hex `color`, and required `roughness`, `metalness`, `opacity` values from 0–1. Kinds: `paint`, `wood`, `stone`, `glass`, `metal`, `flooring`, `fabric`, `custom`. These are reusable design descriptions, not Three.js materials. References are validated for walls, rooms, openings and object overrides.

Lights have `id`, `type`, `color` and nonnegative `intensity`. Types:

- `ambient`: no extra fields.
- `directional`: world `position` and `target`, which must differ.
- `point`: world `position` and positive `range` in meters.

MVP intensity is a relative multiplier; renderer adapters own its mapping to their lighting model. Photometric units, shadows and exposure are outside the file format.

## Project engine and synchronization

```ts
import { projectEngine } from '../project/store';
import { subscribeProjectViews } from '../project';

const unsubscribe = subscribeProjectViews(projectEngine, views => {
  architectureRenderer.update(views.architecture);
  interiorRenderer.update(views.interior);
  sceneRenderer.update(views.scene);
});

projectEngine.moveWall('wall_center_n', { x: 1.6, z: -4 }, { x: 1.6, z: 0 });
// Dispose subscriptions when the editor unmounts:
unsubscribe();
```

The renderer names above are integration placeholders, not existing implementations. Every mode must import the same session from `store.ts`. A new project can replace it with `projectEngine.loadProject(createProject('New home'))`; do not create a separate engine for each tab.

`getSnapshot()` and notifications provide detached copies. Mutating them cannot edit the project. An edit validates commands, clones the current state, applies the batch sequentially, validates the resulting project, advances its update timestamp and commits once. Invalid operations preserve state, timestamps and subscribers. Successful batches notify each subscriber once. Subscriber exceptions are reported separately and cannot undo committed data or interrupt other subscribers. Reentrant edits from notification callbacks are rejected; schedule a later operation instead. `subscribe()` only reports changes; `subscribeProjectViews()` also delivers the initial projection.

The engine exposes `addFloor`, `addRoom`, `updateRoom`, `addWall`, `updateWall`, `moveWall`, `removeWall`, `addDoor`, `addWindow`, `addInteriorObject`, `moveInteriorObject`, `removeInteriorObject`, `changeMaterial`, `updateLighting`, `applyOperations`, `loadProject`, `importProject` and `saveProject`. `createProject` and `validateProject` are separate exports. `updateWall` changes dimensions/material; endpoint edits use `moveWall`.

## AI operations

An AI provider submits structured data to `applyOperations(unknown)`. Ordinary edits never replace the complete file. Parse the provider's response as JSON at the integration boundary, then pass the resulting unknown value to this method. No code evaluation, scripting or arbitrary command dispatch exists.

```json
{
  "operations": [
    { "type": "move_wall", "targetId": "wall_center_n", "start": { "x": 1.6, "z": -4 }, "end": { "x": 1.6, "z": 0 } },
    { "type": "change_room_style", "targetId": "room_kitchen", "style": "warm minimal" }
  ]
}
```

| Operation | Payload beyond `type` |
| --- | --- |
| `add_floor` | `floor`: full floor entity |
| `add_wall` | `wall`: full wall entity |
| `create_room` | `room`: full room entity |
| `update_room` | `targetId`, `changes`: subset of name/type/height/materials/style |
| `resize_room` | `targetId`, positive `width` (X extent), positive `depth` (Z extent) |
| `move_wall` | `targetId`, new `start`, new `end` |
| `update_wall` | `targetId`, `changes`: subset of thickness/height/materialId |
| `remove_wall` | `targetId` |
| `add_door` / `add_window` | `door` / `window`: full entity |
| `add_object` | `object`: full interior entity |
| `move_object` | `targetId`, `position`, optional `rotation`, optional new `roomId` |
| `remove_object` | `targetId` |
| `change_material` | `material`: full definition, inserted or replaced by its ID |
| `change_room_style` | `targetId`, descriptive `style` string |
| `update_lighting` | `lights`: complete array, possibly empty |

Batches contain 1–100 operations. Types and fields are strict; unknown commands, extra fields and invalid targets are rejected. IDs for new entities come from the caller. Newly created dependencies should precede operations that use them. Cross-references are checked against the final batch result, allowing walls and their room to be created together.

`move_wall` moves the wall's endpoints **and every coincident wall endpoint on the same floor**. This keeps connected room rings closed. `resize_room` supports only four-edge axis-aligned rectangles, anchors the minimum X/Z corner and moves boundary vertices and their connected walls. Adjacent rooms may change shape. It does not automatically reposition furniture. If the resulting room, wall or opening becomes invalid, the entire batch is rejected. Referenced walls cannot be removed; there is no implicit destructive cascade. Changing a room's style records intent only—it does not generate furniture or materials.

## Validation and file handling

Validation covers strict required fields, enums, ID syntax/uniqueness, all in-project references, finite numeric values, positive dimensions/scales, floor-height bounds, ordered closed simple room polygons, wall lengths, fitting/non-overlapping openings and timestamps. Errors are `MoppleValidationError` instances with readable `issues: [{path, message}]`. Paths can be schema field paths or stable entity IDs.

`parseProject(text)` checks a 5 MiB UTF-8 limit, parses JSON, checks the format/version and validates all relationships. Malformed data never reaches the store. `importMoppleFile(engine, file)` also checks the `.mopple` suffix (case-insensitive) and size before reading. A failed import preserves the active project. Successful imports preserve source IDs/timestamps. Concurrent file-picker requests should be serialized by the future UI if selection order matters.

`exportMoppleFile(engine)` returns `{filename, contents, mimeType}`. Names are sanitized into `project-name.mopple`; content is indented JSON with a trailing newline and MIME type `application/json`. `downloadMoppleFile(engine)` creates and cleans up a browser download URL. The helpers are ready for file input/export buttons, but no buttons were added to the landing page. There is no automatic disk persistence yet.

## Versioning

`FORMAT` and `CURRENT_VERSION` live only in `schema.ts`. All load paths pass through `migrateProject()` in `validation.ts` before parsing the current schema. Version 1.0 is the only supported input today; unknown/missing versions fail explicitly. For a future version, validate the old schema, run a pure migration here, then validate the latest schema. Preserve stable IDs. Do not scatter version checks throughout editors or renderers.

## Next AI/developer handoff

1. Build editors around the single `projectEngine` session and its operations; connect all three renderers through `subscribeProjectViews`. Preserve the existing scroll/camera lifecycle when connecting the landing demonstration, if desired.
2. Implement mesh generation from wall/opening descriptors, floor polygons and asset instances. Honor floor elevation, material references and XYZ radians; triangulation and real opening geometry belong in that adapter. Update the SVG/2D fallback from the same data.
3. Supply an asset registry for the example's `assetId` values, with placeholders for missing assets. Add import/export controls using the existing file helpers.
4. Integrate Gemini or another provider by requesting the documented operations, parsing JSON, calling `applyOperations`, and displaying validation issues. No provider SDK or network call is included here.

Deliberate MVP limits: wall-bound closed room polygons without holes, no separate open-plan zones, no roof/site schema, no room-overlap or inter-floor collision solver, no furniture containment/collision enforcement, no wall-face material system, no undo/history, no UI editor or mesh builder. Room membership validates references, not spatial containment; object movement after a wall resize is explicit. No BIM, structural analysis, building services, CAD output, collaboration or compression is attempted.

Run `npm test` for format round trips, invalid imports/relationships, operation rejection, rollback, mutation isolation, shared projections, coordinate derivation and the existing timeline tests. Run `npm run build` for TypeScript and the production landing bundle.
