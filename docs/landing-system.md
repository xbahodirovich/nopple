# Mopple landing implementation

## Overview

This is an implementation supplement to the preserved [design.md](../design.md), not a replacement design reference. [PRODUCT.md](../PRODUCT.md) defines the scope: a landing page and one demonstration house, with no editor, authentication, AI service, or backend. The reference supplies the black canvas, generous spacing, asymmetric geometry, and light typography. The explicit Mopple brief replaces Dala violet and particles with mint and a transforming house.

Source of truth: [styles.css](../src/styles.css), [index.html](../index.html), and [scene](../src/scene/). The header/footer use the official `mopple-logo.png`, with its built-in margins framed by CSS. The original background and artwork are retained. `mopple-icon.png` supplies the tab favicon; Vite bundles both assets.

## Colors

| Source value | Use |
| --- | --- |
| `#000000` / `#ffffff` | Continuous canvas / headings |
| `--mint: #a8e8d2` | Primary action, emphasis, active stages, focus, plan linework |
| `--muted: #9a9a9a` | Navigation and secondary labels |
| `--silver: #bdbdbd` | Body copy and captions |
| `#10241d` / `#c4f3e2` | Button text / button hover fill |
| `#303431` | Inactive stage underline |

House materials are scene-specific: plaster `#e4dfd3`, timber `#967253`, dark framing `#293531`, flooring `#c8b493`, linen `#e8ded0`, and muted planting. They do not define new UI surfaces.

## Typography

Locally bundled Inter Variable, with Inter/sans-serif fallback and `ss01` enabled. Headings use weight 400; body copy uses weight 200 at 18px/1.5. Small labels use regular weight. The official raster wordmark is displayed at 144 × 48px in the desktop header, 126 × 42px on mobile, and 114 × 38px in the footer.

| Role | Desktop specification |
| --- | --- |
| Hero heading | `clamp(78px, 7.8vw, 113px)`, line-height `.98`, tracking `-.04em` |
| Section heading | `clamp(48px, 5.5vw, 78px)`, line-height `1.1`, tracking `-.04em` |
| Capability heading | 27px/1.2, tracking `-.025em` |
| Button | 14px/20px, weight 500 |
| Navigation | 12px, uppercase, tracking `.025em` |
| Scene labels | 9–12px; tabular stage numbers |

## Layout

`--max-width: 1280px`; desktop wrapper subtracts 96px from viewport width. The header is 114px high. Hero columns are `.88fr 1.12fr`, with a 12px gap, 740px minimum height, and 36px/114px top/bottom padding. The scene is 450px high. Subsequent sections use two columns, 60–96px gaps, and 96–120px vertical spacing. The working rhythm follows the reference's 6px multiples.

| Breakpoint | Implemented adjustment |
| --- | --- |
| `min-width: 1550px` | Hero minimum height 790px; scene 500px |
| `max-width: 1050px` | Wrapper subtracts 60px; hero `.9fr 1.1fr`, 660px minimum; title 78px; scene 380px; some scene labels hidden |
| `max-width: 760px` | Wrapper subtracts 48px; header 90px; hero stacks; title `clamp(64px, 12.5vw, 94px)` with responsive wrapping; scene 400px; other sections stack; scroll cue hidden |
| `max-width: 420px` | First nav link hidden; scene 310px; section headings 48px; capability headings 24px; controls tighten |

## Elevation & Depth

Content floats directly on black without panel fills, card borders, UI shadows, or gradients. Depth comes from the house geometry, orthographic camera, lighting, and desktop shadows. The transparent WebGL canvas shares the page background.

## Shapes

Primary buttons have a 24px radius and 14px × 22px padding. Stage controls are unboxed text with a 1px underline. The status dot is a 5px circle. Thin stroke arrows provide direction without additional containers.

## Components

**Navigation and actions.** Navigation uses local anchors. The primary “Design your first home” CTA links to `#start`, whose copy explicitly says the tools are coming soon; its next action opens the demonstration. Capability links select the corresponding view. This is a demo funnel, not an implemented home-design workflow.

**Interaction feedback.** On fine pointers, buttons brighten and rise 2px; active buttons scale to `.98`. Background transitions take 180ms; transforms take 160ms with `--ease-out: cubic-bezier(.23,1,.32,1)`. Focus-visible outlines are 2px mint with a 7px offset. A skip link precedes the header.

**House study.** [HouseModel.ts](../src/scene/HouseModel.ts) builds one shared 10 × 8m footprint. The exterior roof lifts and fades to reveal furnished rooms; wall heights lower, furnishings and landscaping fade, the camera moves overhead, and mint dimensions and room labels appear for architecture view. Shared boundaries preserve the same home throughout.

**Scroll sequence and controls.** [timeline.ts](../src/scene/timeline.ts) maps normalized scroll progress to one house: exterior hold 0–10%, roof/interior transition 10–44%, interior hold 44–56%, floor-plan transition 56–90%, architecture hold 90–100%. Sine easing bridges stages. Scrolling upward retraces the exact same states, with no timer or autoplay. Stage buttons expose `aria-pressed` and scroll to 0%, 50%, or 100%; capability links also navigate to the matching viewpoint.

**Pinning.** The hero sits inside a story wrapper whose minimum height is the measured hero height plus 160svh on desktop or 130svh on mobile. The hero uses CSS sticky positioning; on smaller/shorter screens its top offset allows the heading to leave the viewport while the house stays centered. ResizeObserver updates layout measurements. Native scrolling remains uninterrupted; no wheel or touch events are captured.

**Reduced motion and fallback.** Reduced-motion preference removes the extra scroll distance, pinning, and scroll-driven motion. Visitors select static stages directly. CSS transitions, hover transforms, and smooth scrolling are also removed. A matching SVG floor plan appears while loading and on renderer failure/context loss; failure disables stage controls and removes the extra scroll distance. JavaScript-disabled visitors receive a text notice.

**Performance and lifecycle.** [main.ts](../src/main.ts) lazy-loads Three.js when the scene approaches within 200px, after fonts are ready. Passive scroll listeners batch position reads with requestAnimationFrame. [HeroScene.ts](../src/scene/HeroScene.ts) draws only when invalidated by scroll, resize, stage selection, or visibility, capped at 30fps. No frames are rendered while idle, offscreen, or in hidden tabs. Pixel ratio is capped at 1.75 desktop or 1.35 mobile; mobile omits shadows. Slow initial rendering triggers a ratio of 1, no shadows, and a 24fps cap. Shared primitive geometry avoids model downloads. Disposal releases event listeners, observers, renderer, geometries, materials, textures, and shadows.

## Do's and Don'ts

- Do preserve the authoritative reference and the explicit Mopple overrides; document implementation details here.
- Do retain black negative space, restrained mint accents, light type weights, shared house geometry, and usable stage controls.
- Do keep coming-soon language accurate until product tools exist; the current primary CTA wording is aspirational.
- Don't introduce an invented logo, backend/editor claims, particle imagery, or a replacement visual system through routine landing changes.
