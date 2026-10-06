# Alpha audit
Existing: Vite/TypeScript, Three.js, Zod, synchronized model-driven editor, undo/redo, local autosave, import/export and tested operations. Version 1.0 stores meter-based floors, directed wall boundaries (canonical room polygons), openings, furniture transforms, materials and lights. Demo already uses this model.

Missing: managed AI credentials/retry/limits; accounts/project library/version history; public views and image/PDF exports; telemetry and multilingual offline coverage.

Top five blockers:
1. AI requires a visitor NVIDIA key.
2. Offline natural-language recognition is English-centric.
3. Browser autosave has only one project and no recovery history.
4. No remote persistence or public viewing workflow.
5. No deployment credential/configuration guide or alpha acceptance suite.
