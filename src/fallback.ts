// A lightweight, dimensionally matching floor plan remains available without WebGL.
export const fallbackPlan = `<svg viewBox="0 0 440 370" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-linecap="square">
    <path d="M60 55H380V311H60Z M66 61H374V305H66Z"/>
    <path d="M255 55V164M255 192V220M255 249V311M260 55V164M260 192V220M260 249V311M255 183H380M255 188H380M60 162H131M60 166H131"/>
    <g stroke-width=".6" opacity=".65"><path d="M255 164h28a28 28 0 0 1-28 28M255 220h28a28 28 0 0 1-28 28M269 311v-28a28 28 0 0 1 28 28"/>
    <path d="M60 35H380M60 29v15M380 29v15M401 55v256M394 55h14M394 311h14"/>
    <path d="M100 55v6M173 55v6M97 305v6M152 305v6M206 305v6M374 97h6M374 143h6M374 226h6M374 274h6"/></g>
  </g>
  <g class="fallback-label" text-anchor="middle"><text x="155" y="112">KITCHEN</text><text x="155" y="240">LIVING</text><text x="315" y="122">BEDROOM</text><text x="315" y="247">BATH</text><text x="220" y="25" class="fallback-small">10.00 m</text><text x="414" y="186" transform="rotate(90 414 186)" class="fallback-small">8.00 m</text><text x="220" y="345" class="fallback-small">THE MOPPLE HOUSE · FLOOR PLAN</text></g>
</svg>`;
