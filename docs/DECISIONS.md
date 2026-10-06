# Decisions

- Preserve the existing version 1.0 model: room polygons derive from directed wall boundaries, avoiding duplicated geometry. Floors represent levels; furniture dimensions derive from asset footprint and scale.
- Keep offline generation deterministic and explicitly describe results as concepts, not construction drawings.
- Use Supabase REST/Auth endpoints without adding an SDK; cloud features are optional.
- Lint is the strict TypeScript static check.
