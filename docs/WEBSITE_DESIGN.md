---
name: Nopple website
description: Warm architectural invitation with layered, video-inspired scroll motion.
colors:
  paper: "#f5eee4"
  ink: "#392b24"
  clay: "#995b40"
  sand: "#e4d3bb"
  surface: "#fff8ee"
  muted: "#725f52"
---

# Website design

The user’s 11 October video and warm/cozy request supersede the earlier black palette in the pinned reference. Root design.md remains the original reference. Source of truth: index.html, src/landing.css, src/landing.ts, src/i18n/language.css.

## Composition and identity
Warm ivory and sand sections, walnut text, clay headline emphasis, and a walnut closing section. Anton supplies English/Uzbek display type; Oswald supports Russian; Inter handles body and controls; Caveat retains handwritten emphasis. Content stays in centered 1150–1280px bounds. The supplied nopple-icon.png appears beside the Nopple wordmark, in browser favicons, and as a low-opacity decorative desktop layer. Image content remains architectural inspiration, never a claim about rendered project quality.

## Motion
Native scroll remains uninterrupted. A requestAnimationFrame coalesces passive scroll updates: photograph parallax ±42px at 1.16 scale; its container grows from .88 to 1 and settles from 5° tilt, simplified to .95 scale and no tilt on phones. Hero copy and decorative logo travel at different rates; a later headline enters laterally. IntersectionObserver triggers 650ms lower-content reveals with a 60ms stagger and cubic-bezier(.23,1,.32,1). Reduced motion removes movement, cancels animations and keeps every section visible. Fine-pointer hover lifts primary actions 2px; touch has no hover lift.

## Controls and responsive behavior
Native language select has minimum 44px height, warm option backgrounds, selected checkmarks and focus rings. Browser support for base-select enables a rounded custom picker; unsupported browsers retain their native picker. There is no custom focus-trapping dropdown. Main controls use 10px corners and image containers 12–16px corners. At 1023px navigation simplifies; at 640px sections stack and decorative logo disappears. At very narrow widths navigation may wrap rather than overflow.

## Evidence
scripts/check-warm.mjs passed three languages, all six homepage widths (320–1920px), five Editor widths (320–1440px), scroll changes, reduced motion, loaded PNG logo, and browser error checks. Captures: .impeccable/review/warm. AI is still disconnected.
