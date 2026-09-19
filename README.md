# Mopple landing page

```sh
npm install
npm run dev
```

`npm run build` type-checks and builds into `dist/`. `npm run preview` serves that build. `npm test` checks the continuous animation timeline.

With the development server running, `npm run test:browser` checks four viewport widths, forward/reverse scrolling, pinned scene visibility, stage selection, reduced motion, CTA links, and WebGL fallback. `npm run test:lifecycle` checks pixel-identical scroll reversal, idle/offscreen rendering suspension, and context loss. Browser checks require Playwright Chromium (`npx playwright install chromium` if not already installed). Screenshots are written to `.impeccable/review/`.

Verified: production build, three timeline tests, responsive browser checks, and renderer lifecycle checks. The lazy-loaded renderer bundle is approximately 137 kB gzipped; initial application JavaScript is approximately 3.2 kB gzipped. Vite reports its standard 500 kB uncompressed chunk advisory for Three.js.

## Implementation

Vite + TypeScript, with a lazy-loaded Three.js scene. No backend, authentication, AI calls, or application editor. The primary CTA leads to an honest coming-soon section and the interactive demonstration.

- `src/scene/HouseModel.ts`: one procedural 10 × 8 m house; all stages share geometry and room boundaries.
- `src/scene/timeline.ts`: reversible scroll-position mapping from exterior → interior → floor plan, using sine easing and hold intervals.
- `src/scene/HeroScene.ts`: camera, lighting, scroll-driven updates, visibility suspension, adaptive rendering, and disposal.
- `src/fallback.ts`: matching SVG plan for loading and WebGL failures.
- `src/styles.css`: responsive visual system. Inter is bundled locally, as allowed by `design.md`.

The original `design.md` is unchanged. Its black canvas, typography, spacing, two-column composition, and minimal components are retained; the task's explicit Mopple direction supersedes the reference's Dala-specific violet and particles. The official `mopple-logo.png` appears in the header and footer, framed with CSS to remove its generous outer margins. `mopple-icon.png` supplies the tab favicon. Both original files remain unchanged.

Scrolling down transforms the pinned house from exterior to interior to floor plan; scrolling up restores the exact earlier representation. Stage buttons scroll to the matching viewpoint. There is no timer-based playback. Reduced-motion preference removes pinning and scroll scrubbing; stage selection shows static views immediately. Rendering stops while idle, offscreen, or in a hidden tab. Mobile uses a lower pixel ratio without shadows, and slow renderers reduce quality further. Context loss falls back to the static plan.

Three.js references: [renderer lifecycle](https://threejs.org/docs/pages/WebGLRenderer.html) and [orthographic projection](https://threejs.org/docs/pages/OrthographicCamera.html).
