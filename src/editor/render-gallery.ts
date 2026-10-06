import type { MoppleProjectEngine } from '../project/engine.ts';
import type { Canvas3D } from './canvas3d.ts';
import type { MoppleProject, MoppleRoom } from '../project/schema.ts';
import { roomPolygon, polygonArea } from '../project/geometry.ts';
import { buildingBounds, exteriorCamera, exteriorViews, exteriorViewNames, type ExteriorView } from '../project/measurements.ts';
import { createGenerationPlan } from '../project/generation.ts';
import { getStoredApiKey } from './ai.ts';
import { escapeHtml } from './ui.ts';

export interface RenderCardState {
  roomId: string;
  exteriorView?: ExteriorView;
  roomName: string;
  roomType: string;
  floorName: string;
  area: number;
  dimensions: { width: number; depth: number; height: number };
  camera: { x: number; y: number; z: number; fov: number };
  target: { x: number; y: number; z: number };
  sunAzimuth: number;
  sunElevation: number;
  prompt: string;
  status: 'queued' | 'rendering' | 'complete' | 'preserved';
  imageUrl?: string;
  error?: string;
}

export function createRenderGalleryDialog(
  engine: MoppleProjectEngine,
  getCanvas3d: () => Canvas3D | undefined
) {
  const dialog = document.createElement('dialog');
  dialog.className = 'gallery-dialog';
  dialog.id = 'modal-gallery';
  dialog.setAttribute('aria-labelledby', 'gallery-title');

  dialog.innerHTML = `
    <div class="gallery-titlebar">
      <div>
        <h2 id="gallery-title">Views of your home</h2>
        <span class="gallery-subtitle" id="gallery-status-badge">Room and exterior views from your current design</span>
      </div>
      <div class="gallery-header-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="gallery-btn-export-plan">Export view details</button>
        <button type="button" class="btn btn-primary btn-sm" id="gallery-btn-capture-all">Capture all views</button>
        <button type="button" class="btn btn-secondary" id="gallery-btn-close" aria-label="Close render gallery">Close</button>
      </div>
    </div>

    <div class="gallery-provider-notice" id="gallery-provider-notice">

      <div class="notice-content">
        <strong>Capture your current design</strong>
        <p>Save views of each room and every side of the home, using your current materials and sunlight. These are 3D scene captures.</p>
      </div>
    </div>

    <div class="gallery-view-tabs" aria-label="View category"><button type="button" class="btn btn-secondary btn-sm" id="gallery-tab-interior" aria-pressed="true">Interiors</button><button type="button" class="btn btn-secondary btn-sm" id="gallery-tab-exterior" aria-pressed="false">Exterior & street</button></div>
    <div class="gallery-grid" id="gallery-cards-grid" role="region" aria-label="Interior and exterior viewpoints"></div>

    <div class="gallery-actions-footer">
      <button type="button" class="btn btn-secondary" id="gallery-btn-cancel">Done</button>
    </div>

    <!-- Lightbox preview -->
    <div class="gallery-lightbox" id="gallery-lightbox" hidden>
      <div class="lightbox-content">
        <div id="lightbox-image-slot"></div>
        <div class="lightbox-caption" id="lightbox-caption"></div>
        <button type="button" class="btn btn-secondary btn-sm" id="lightbox-close">Close preview</button>
      </div>
    </div>
  `;

  document.body.append(dialog);

  const get = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const grid = get<HTMLElement>('gallery-cards-grid');
  const lightbox = get<HTMLElement>('gallery-lightbox');
  const lightboxImg = new Image();
  lightboxImg.id = 'lightbox-img'; lightboxImg.alt = 'Full resolution house visualization';
  get('lightbox-image-slot').append(lightboxImg);
  const lightboxCaption = get<HTMLElement>('lightbox-caption');

  const cardStates = new Map<string, RenderCardState>();
  let trigger: HTMLElement | null = null;
  let category: 'interior' | 'exterior' = 'interior';
  let revision = '';
  dialog.addEventListener('close', () => { lightbox.hidden = true; trigger?.focus(); });

  function computeRoomData(project: MoppleProject, room: MoppleRoom): RenderCardState {
    const floor = project.building.floors.find(f => f.id === room.floorId);
    const floorElev = floor?.elevation ?? 0;
    const poly = roomPolygon(project, room);
    const area = Math.round(polygonArea(poly) * 10) / 10;

    let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
    if (poly.length > 0) {
      const xs = poly.map(p => p.x), zs = poly.map(p => p.z);
      minX = Math.min(...xs); maxX = Math.max(...xs);
      minZ = Math.min(...zs); maxZ = Math.max(...zs);
    }

    const width = Math.round((maxX - minX) * 10) / 10;
    const depth = Math.round((maxZ - minZ) * 10) / 10;
    const sun = project.metadata.sun ?? { azimuth: 225, elevation: 40 };
    const brief = project.metadata.designBrief;

    const eyeX = minX + (maxX - minX) * 0.25;
    const eyeZ = minZ + (maxZ - minZ) * 0.3;
    const eyeHeight = floorElev + 1.6;

    const prompt = `Photorealistic architectural visualization of ${room.name} (${room.type.replaceAll('_', ' ')}). ` +
      `Preserve room dimensions: ${width}m width × ${depth}m depth, ${room.height}m ceiling height. ` +
      `Style: ${brief?.style || 'Modern'}. Materials: ${brief?.materials || 'Oak flooring and limewash walls'}. ` +
      `Daylight aligned with sun azimuth ${sun.azimuth}° and elevation ${sun.elevation}°. ` +
      `Soft contact shadows, realistic glass transmission, ambient interior indirect bounce. No invented openings.`;

    const existing = cardStates.get(room.id);
    return {
      roomId: room.id,
      roomName: room.name,
      roomType: room.type,
      floorName: floor?.name || 'Ground floor',
      area,
      dimensions: { width, depth, height: room.height },
      camera: { x: eyeX, y: eyeHeight, z: eyeZ, fov: 65 },
      target: { x: (minX + maxX) / 2, y: floorElev + 1.3, z: (minZ + maxZ) / 2 },
      sunAzimuth: sun.azimuth,
      sunElevation: sun.elevation,
      prompt,
      status: existing?.imageUrl ? 'complete' : 'preserved',
      imageUrl: existing?.imageUrl,
    };
  }

  function computeExteriorData(project: MoppleProject, view: ExteriorView): RenderCardState {
    const bounds = buildingBounds(project), pose = exteriorCamera(project, view);
    const sun = project.metadata.sun ?? { azimuth: 225, elevation: 40 };
    return {
      roomId: `exterior_${view}`, exteriorView: view, roomName: exteriorViewNames[view], roomType: 'exterior', floorName: `${project.building.floors.length} ${project.building.floors.length === 1 ? 'floor' : 'floors'}`, area: 0,
      dimensions: { width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ, height: bounds.top - bounds.base },
      camera: { ...pose.position, fov: pose.fov }, target: pose.target, sunAzimuth: sun.azimuth, sunElevation: sun.elevation,
      prompt: `Exterior architectural visualization: ${exteriorViewNames[view]}. Preserve the attached model's footprint, floor levels, roof, facade materials, doors and windows. Style: ${project.metadata.designBrief?.style || 'As modeled'}. Materials: ${project.metadata.designBrief?.materials || 'As modeled'}. Sun azimuth ${sun.azimuth}°, elevation ${sun.elevation}°. Front is +Z. Do not invent openings, additional floors, adjacent buildings or site boundaries.`,
      status: 'preserved',
    };
  }

  function renderGrid() {
    const project = engine.getSnapshot();
    const nextRevision = JSON.stringify(project);
    if (revision !== nextRevision) { cardStates.clear(); revision = nextRevision; }
    for (const room of project.building.rooms.filter(r => r.type !== 'hallway')) {
      if (!cardStates.has(room.id)) cardStates.set(room.id, computeRoomData(project, room));
    }
    for (const view of exteriorViews) {
      if (!cardStates.has(`exterior_${view}`)) cardStates.set(`exterior_${view}`, computeExteriorData(project, view));
    }
    const states = [...cardStates.values()].filter(state => category === 'exterior' ? Boolean(state.exteriorView) : !state.exteriorView);
    grid.replaceChildren();

    for (const state of states) {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.dataset.roomId = state.roomId;

      card.innerHTML = `
        <div class="card-image-wrap">
          ${state.imageUrl
            ? `<img src="${state.imageUrl}" alt="${escapeHtml(state.roomName)} viewpoint" class="card-img" />`
            : `<div class="card-img-placeholder">

                 <span>Ready to capture</span>
               </div>`
          }
          <span class="card-badge ${state.status}">${state.status === 'complete' ? 'Rendered' : 'Scene view'}</span>
        </div>
        <div class="card-body">
          ${state.error ? `<p class="gallery-card-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          <div class="card-header">
            <strong>${escapeHtml(state.roomName)}</strong>
            <span class="card-meta">${escapeHtml(state.floorName)}${state.exteriorView ? "" : ` · ${state.area} m²`}</span>
          </div>
          <p class="card-dimensions">${state.dimensions.width.toFixed(2)}m × ${state.dimensions.depth.toFixed(2)}m × ${state.dimensions.height.toFixed(2)}m · ${state.exteriorView && state.exteriorView !== "street" ? "Facade perspective" : "Eye level 1.6m"} · Sun ${state.sunAzimuth}°/${state.sunElevation}°</p>
          <div class="card-prompt-preview" title="${escapeHtml(state.prompt)}">${escapeHtml(state.prompt)}</div>
          <div class="card-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-card-capture">Capture view</button>
            ${state.imageUrl ? `<button type="button" class="btn btn-secondary btn-sm btn-card-view">View Full</button>` : ''}
            ${state.imageUrl ? `<button type="button" class="btn btn-secondary btn-sm btn-card-download">Download</button>` : ''}
            <button type="button" class="btn btn-secondary btn-sm btn-card-copy">Copy render prompt</button>
          </div>
        </div>
      `;

      // Event listeners
      card.querySelector('.btn-card-capture')?.addEventListener('click', () => captureRoom(state.roomId));
      card.querySelector('.btn-card-view')?.addEventListener('click', () => {
        if (state?.imageUrl) {
          lightboxImg.src = state.imageUrl;
          lightboxCaption.textContent = `${state.roomName} — ${state.dimensions.width}m × ${state.dimensions.depth}m (Sun Azimuth ${state.sunAzimuth}°, Elevation ${state.sunElevation}°)`;
          lightbox.hidden = false;
        }
      });
      card.querySelector('.btn-card-download')?.addEventListener('click', () => {
        if (state?.imageUrl) {
          const a = document.createElement('a');
          a.href = state.imageUrl;
          a.download = `${state.roomName.toLowerCase().replace(/\s+/g, '_')}_render.png`;
          a.click();
        }
      });
      card.querySelector('.btn-card-copy')?.addEventListener('click', (e) => {
        navigator.clipboard?.writeText(state!.prompt);
        const btn = e.target as HTMLButtonElement;
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });

      grid.appendChild(card);
    }
  }

  function captureRoom(roomId: string) {
    const canvas3d = getCanvas3d();
    if (!canvas3d) {
      alert('3D viewport is unavailable in this environment.');
      return;
    }
    const state = cardStates.get(roomId);
    if (!state) return;

    state.status = 'rendering';
    renderGrid();

    try {
      const dataUrl = state.exteriorView ? canvas3d.captureExteriorView(state.exteriorView, 1280, 720) : canvas3d.captureRoomView(roomId, 1280, 720);
      state.error = undefined;
      state.imageUrl = dataUrl;
      state.status = 'complete';
    } catch (err) {
      state.status = 'preserved';
      state.error = err instanceof Error ? err.message : String(err);
    }
    renderGrid();
  }

  function captureAll() {
    renderGrid();
    for (const state of cardStates.values()) {
      if (category === 'exterior' ? state.exteriorView : !state.exteriorView) captureRoom(state.roomId);
    }
  }
  for (const tab of ['interior', 'exterior'] as const) {
    get(`gallery-tab-${tab}`).addEventListener('click', () => {
      category = tab;
      get('gallery-tab-interior').setAttribute('aria-pressed', String(tab === 'interior'));
      get('gallery-tab-exterior').setAttribute('aria-pressed', String(tab === 'exterior'));
      renderGrid();
    });
  }

  get('gallery-btn-capture-all').addEventListener('click', () => captureAll());

  get('gallery-btn-export-plan').addEventListener('click', () => {
    const project = engine.getSnapshot();
    const plan = { ...(project.metadata.designBrief ? createGenerationPlan(project) : { format: 'mopple-scene-previews', project }), viewpoints: [...cardStates.values()].map(({ imageUrl, ...state }) => ({ ...state, captured: Boolean(imageUrl) })) };
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mopple-generation-plan.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  get('gallery-btn-close').addEventListener('click', () => dialog.close());
  get('gallery-btn-cancel').addEventListener('click', () => dialog.close());
  get('lightbox-close').addEventListener('click', () => { lightbox.hidden = true; });

  return {
    dialog,
    open(targetRoomId?: string) {
      trigger = document.activeElement as HTMLElement | null;
      if (targetRoomId) { category = 'interior'; get('gallery-tab-interior').setAttribute('aria-pressed', 'true'); get('gallery-tab-exterior').setAttribute('aria-pressed', 'false'); }
      renderGrid();
      dialog.showModal();
      if (targetRoomId) {
        captureRoom(targetRoomId);
      }
    },
    captureAll,
    destroy() {
      dialog.remove();
    },
  };
}
