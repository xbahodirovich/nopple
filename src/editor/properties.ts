import type { MoppleProjectEngine } from '../project/engine.ts';
import { distance, polygonArea, roomPolygon } from '../project/geometry.ts';
import type { MoppleInteriorObject, MoppleProject, MoppleRoom, MoppleWall } from '../project/schema.ts';
import type { SelectedEntity } from './canvas2d.ts';

export interface PropertyPanelOptions {
  engine: MoppleProjectEngine;
  onExport: () => void;
  onImport: () => void;
  onDeleteSelected: () => void;
  onOpenApiKeyModal: () => void;
}

export class PropertyPanel {
  private container: HTMLElement;
  private engine: MoppleProjectEngine;
  private project: MoppleProject;
  private selected: SelectedEntity | null = null;
  private onExport: () => void;
  private onImport: () => void;
  private onDeleteSelected: () => void;
  private onOpenApiKeyModal: () => void;
  private unsubscribe: () => void;

  constructor(container: HTMLElement, options: PropertyPanelOptions) {
    this.container = container;
    this.engine = options.engine;
    this.project = options.engine.getSnapshot();
    this.onExport = options.onExport;
    this.onImport = options.onImport;
    this.onDeleteSelected = options.onDeleteSelected;
    this.onOpenApiKeyModal = options.onOpenApiKeyModal;

    this.render();

    this.unsubscribe = this.engine.subscribe(p => {
      this.project = p;
      this.render();
    });
  }

  public destroy() {
    this.unsubscribe();
  }

  public setSelection(entity: SelectedEntity | null) {
    this.selected = entity;
    this.render();
  }

  private render() {
    if (!this.selected) {
      this.renderProjectProperties();
      return;
    }

    if (this.selected.type === 'object') {
      const obj = this.project.interior.objects.find(o => o.id === this.selected?.id);
      if (obj) this.renderObjectProperties(obj);
      else this.renderProjectProperties();
      return;
    }

    if (this.selected.type === 'room') {
      const room = this.project.building.rooms.find(r => r.id === this.selected?.id);
      if (room) this.renderRoomProperties(room);
      else this.renderProjectProperties();
      return;
    }

    if (this.selected.type === 'wall') {
      const wall = this.project.building.walls.find(w => w.id === this.selected?.id);
      if (wall) this.renderWallProperties(wall);
      else this.renderProjectProperties();
      return;
    }

    this.renderProjectProperties();
  }

  private renderProjectProperties() {
    let totalArea = 0;
    for (const room of this.project.building.rooms) {
      const poly = roomPolygon(this.project, room);
      totalArea += polygonArea(poly);
    }

    this.container.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">Project Inspector</div>
      </div>

      <div class="panel-content">
        <div class="prop-group">
          <div class="prop-label">Project Name</div>
          <div class="prop-value">
            <input type="text" id="prop-project-name" class="input-text" value="${this.project.project.name}" />
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-val">${Math.round(totalArea * 10) / 10} m²</div>
            <div class="stat-lbl">Floor Area</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${this.project.building.rooms.length}</div>
            <div class="stat-lbl">Rooms</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${this.project.building.walls.length}</div>
            <div class="stat-lbl">Walls</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${this.project.interior.objects.length}</div>
            <div class="stat-lbl">Furniture</div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="prop-section-title">Files & Persistence</div>
        <div class="actions-stack">
          <button class="btn btn-primary" id="btn-export-project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export .mopple file
          </button>
          <button class="btn btn-secondary" id="btn-import-project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import .mopple file
          </button>
        </div>

        <div class="divider"></div>

        <div class="prop-section-title">AI Engine Settings</div>
        <button class="btn btn-secondary" id="btn-open-apikey">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Configure Gemini API Key
        </button>
      </div>
    `;

    this.container.querySelector('#btn-export-project')?.addEventListener('click', this.onExport);
    this.container.querySelector('#btn-import-project')?.addEventListener('click', this.onImport);
    this.container.querySelector('#btn-open-apikey')?.addEventListener('click', this.onOpenApiKeyModal);
  }

  private renderObjectProperties(obj: MoppleInteriorObject) {
    const rotDeg = Math.round(((-obj.rotation.y * 180) / Math.PI) % 360);

    this.container.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">${obj.kind.toUpperCase()}</div>
        <button class="icon-button" id="btn-delete-prop" title="Delete Object">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>

      <div class="panel-content">
        <div class="prop-group">
          <div class="prop-label">Asset ID</div>
          <input type="text" class="input-text" value="${obj.assetId}" disabled />
        </div>

        <div class="prop-group">
          <div class="prop-label">Room</div>
          <select class="input-select" id="prop-obj-room">
            ${this.project.building.rooms.map(r => `
              <option value="${r.id}" ${r.id === obj.roomId ? 'selected' : ''}>${r.name}</option>
            `).join('')}
          </select>
        </div>

        <div class="prop-section-title">Position (meters)</div>
        <div class="prop-row-3">
          <div class="prop-field">
            <span class="field-lbl">X</span>
            <input type="number" step="0.1" class="input-number" id="prop-pos-x" value="${obj.position.x.toFixed(2)}" />
          </div>
          <div class="prop-field">
            <span class="field-lbl">Y</span>
            <input type="number" step="0.1" class="input-number" id="prop-pos-y" value="${obj.position.y.toFixed(2)}" />
          </div>
          <div class="prop-field">
            <span class="field-lbl">Z</span>
            <input type="number" step="0.1" class="input-number" id="prop-pos-z" value="${obj.position.z.toFixed(2)}" />
          </div>
        </div>

        <div class="prop-section-title">Rotation (degrees)</div>
        <div class="prop-field">
          <span class="field-lbl">Yaw</span>
          <input type="number" step="15" class="input-number" id="prop-rot-y" value="${rotDeg}" />
        </div>

        <div class="prop-section-title">Scale</div>
        <div class="prop-row-3">
          <div class="prop-field">
            <span class="field-lbl">X</span>
            <input type="number" step="0.1" min="0.1" class="input-number" id="prop-scale-x" value="${obj.scale.x}" />
          </div>
          <div class="prop-field">
            <span class="field-lbl">Y</span>
            <input type="number" step="0.1" min="0.1" class="input-number" id="prop-scale-y" value="${obj.scale.y}" />
          </div>
          <div class="prop-field">
            <span class="field-lbl">Z</span>
            <input type="number" step="0.1" min="0.1" class="input-number" id="prop-scale-z" value="${obj.scale.z}" />
          </div>
        </div>
      </div>
    `;

    // Bind inputs
    this.container.querySelector('#btn-delete-prop')?.addEventListener('click', this.onDeleteSelected);

    const roomSelect = this.container.querySelector('#prop-obj-room') as HTMLSelectElement | null;
    roomSelect?.addEventListener('change', () => {
      this.engine.moveInteriorObject(obj.id, obj.position, obj.rotation, roomSelect.value);
    });

    const updatePos = () => {
      const x = parseFloat((this.container.querySelector('#prop-pos-x') as HTMLInputElement).value) || 0;
      const y = parseFloat((this.container.querySelector('#prop-pos-y') as HTMLInputElement).value) || 0;
      const z = parseFloat((this.container.querySelector('#prop-pos-z') as HTMLInputElement).value) || 0;
      this.engine.moveInteriorObject(obj.id, { x, y, z }, obj.rotation, obj.roomId);
    };

    this.container.querySelector('#prop-pos-x')?.addEventListener('change', updatePos);
    this.container.querySelector('#prop-pos-y')?.addEventListener('change', updatePos);
    this.container.querySelector('#prop-pos-z')?.addEventListener('change', updatePos);

    this.container.querySelector('#prop-rot-y')?.addEventListener('change', (e) => {
      const deg = parseFloat((e.target as HTMLInputElement).value) || 0;
      const rad = (-deg * Math.PI) / 180;
      this.engine.moveInteriorObject(obj.id, obj.position, { x: 0, y: rad, z: 0 }, obj.roomId);
    });
  }

  private renderRoomProperties(room: MoppleRoom) {
    const poly = roomPolygon(this.project, room);
    const area = Math.round(polygonArea(poly) * 10) / 10;
    const xs = poly.map(v => v.x), zs = poly.map(v => v.z);
    const curW = Math.max(...xs) - Math.min(...xs);
    const curD = Math.max(...zs) - Math.min(...zs);

    this.container.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">ROOM: ${room.name}</div>
        <button class="icon-button" id="btn-delete-prop" title="Delete Room">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>

      <div class="panel-content">
        <div class="prop-group">
          <div class="prop-label">Room Name</div>
          <input type="text" class="input-text" id="prop-room-name" value="${room.name}" />
        </div>

        <div class="prop-group">
          <div class="prop-label">Type</div>
          <select class="input-select" id="prop-room-type">
            <option value="living_room" ${room.type === 'living_room' ? 'selected' : ''}>Living Room</option>
            <option value="bedroom" ${room.type === 'bedroom' ? 'selected' : ''}>Bedroom</option>
            <option value="kitchen" ${room.type === 'kitchen' ? 'selected' : ''}>Kitchen</option>
            <option value="bathroom" ${room.type === 'bathroom' ? 'selected' : ''}>Bathroom</option>
            <option value="office" ${room.type === 'office' ? 'selected' : ''}>Office</option>
            <option value="dining_room" ${room.type === 'dining_room' ? 'selected' : ''}>Dining Room</option>
            <option value="hallway" ${room.type === 'hallway' ? 'selected' : ''}>Hallway</option>
            <option value="custom" ${room.type === 'custom' ? 'selected' : ''}>Custom</option>
          </select>
        </div>

        <div class="prop-group">
          <div class="prop-label">Area</div>
          <div class="readonly-badge">${area.toFixed(1)} m²</div>
        </div>

        <div class="prop-group">
          <div class="prop-label">Height (m)</div>
          <input type="number" step="0.1" class="input-number" id="prop-room-height" value="${room.height}" />
        </div>

        <div class="prop-group">
          <div class="prop-label">Style</div>
          <input type="text" class="input-text" id="prop-room-style" value="${room.style || 'modern'}" />
        </div>

        <div class="divider"></div>

        <div class="prop-section-title">Resize Room (meters)</div>
        <div class="prop-row-2">
          <div class="prop-field">
            <span class="field-lbl">Width</span>
            <input type="number" step="0.5" class="input-number" id="prop-resize-w" value="${curW.toFixed(1)}" />
          </div>
          <div class="prop-field">
            <span class="field-lbl">Depth</span>
            <input type="number" step="0.5" class="input-number" id="prop-resize-d" value="${curD.toFixed(1)}" />
          </div>
        </div>
        <button class="btn btn-secondary mt-2" id="btn-apply-resize">Apply Dimension Change</button>
      </div>
    `;

    this.container.querySelector('#btn-delete-prop')?.addEventListener('click', this.onDeleteSelected);

    this.container.querySelector('#prop-room-name')?.addEventListener('change', (e) => {
      this.engine.updateRoom(room.id, { name: (e.target as HTMLInputElement).value });
    });

    this.container.querySelector('#prop-room-type')?.addEventListener('change', (e) => {
      this.engine.updateRoom(room.id, { type: (e.target as HTMLSelectElement).value as MoppleRoom['type'] });
    });

    this.container.querySelector('#prop-room-height')?.addEventListener('change', (e) => {
      const height = parseFloat((e.target as HTMLInputElement).value) || 2.8;
      this.engine.updateRoom(room.id, { height });
    });

    this.container.querySelector('#prop-room-style')?.addEventListener('change', (e) => {
      this.engine.changeRoomStyle(room.id, (e.target as HTMLInputElement).value);
    });

    this.container.querySelector('#btn-apply-resize')?.addEventListener('click', () => {
      const w = parseFloat((this.container.querySelector('#prop-resize-w') as HTMLInputElement).value);
      const d = parseFloat((this.container.querySelector('#prop-resize-d') as HTMLInputElement).value);
      if (w > 0 && d > 0) {
        try {
          this.engine.resizeRoom(room.id, w, d);
        } catch (err) {
          alert('Could not resize room: MVP resize requires rectangular shape.');
        }
      }
    });
  }

  private renderWallProperties(wall: MoppleWall) {
    const len = distance(wall.start, wall.end);

    this.container.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">WALL: ${wall.id}</div>
        <button class="icon-button" id="btn-delete-prop" title="Delete Wall">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>

      <div class="panel-content">
        <div class="prop-group">
          <div class="prop-label">Length</div>
          <div class="readonly-badge">${len.toFixed(2)} meters</div>
        </div>

        <div class="prop-group">
          <div class="prop-label">Thickness (m)</div>
          <input type="number" step="0.02" class="input-number" id="prop-wall-thick" value="${wall.thickness}" />
        </div>

        <div class="prop-group">
          <div class="prop-label">Height (m)</div>
          <input type="number" step="0.1" class="input-number" id="prop-wall-height" value="${wall.height}" />
        </div>

        <div class="prop-section-title">Endpoints</div>
        <div class="prop-row-2">
          <div class="prop-field">
            <span class="field-lbl">Start X</span>
            <input type="number" step="0.1" class="input-number" id="prop-wall-sx" value="${wall.start.x}" />
          </div>
          <div class="prop-field">
            <span class="field-lbl">Start Z</span>
            <input type="number" step="0.1" class="input-number" id="prop-wall-sz" value="${wall.start.z}" />
          </div>
        </div>
        <div class="prop-row-2 mt-2">
          <div class="prop-field">
            <span class="field-lbl">End X</span>
            <input type="number" step="0.1" class="input-number" id="prop-wall-ex" value="${wall.end.x}" />
          </div>
          <div class="prop-field">
            <span class="field-lbl">End Z</span>
            <input type="number" step="0.1" class="input-number" id="prop-wall-ez" value="${wall.end.z}" />
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-delete-prop')?.addEventListener('click', this.onDeleteSelected);

    this.container.querySelector('#prop-wall-thick')?.addEventListener('change', (e) => {
      const thickness = parseFloat((e.target as HTMLInputElement).value) || 0.2;
      this.engine.updateWall(wall.id, { thickness });
    });

    this.container.querySelector('#prop-wall-height')?.addEventListener('change', (e) => {
      const height = parseFloat((e.target as HTMLInputElement).value) || 2.8;
      this.engine.updateWall(wall.id, { height });
    });

    const updatePoints = () => {
      const sx = parseFloat((this.container.querySelector('#prop-wall-sx') as HTMLInputElement).value) || 0;
      const sz = parseFloat((this.container.querySelector('#prop-wall-sz') as HTMLInputElement).value) || 0;
      const ex = parseFloat((this.container.querySelector('#prop-wall-ex') as HTMLInputElement).value) || 0;
      const ez = parseFloat((this.container.querySelector('#prop-wall-ez') as HTMLInputElement).value) || 0;
      try {
        this.engine.moveWall(wall.id, { x: sx, z: sz }, { x: ex, z: ez });
      } catch (err) {
        console.error('Failed to move wall', err);
      }
    };

    this.container.querySelector('#prop-wall-sx')?.addEventListener('change', updatePoints);
    this.container.querySelector('#prop-wall-sz')?.addEventListener('change', updatePoints);
    this.container.querySelector('#prop-wall-ex')?.addEventListener('change', updatePoints);
    this.container.querySelector('#prop-wall-ez')?.addEventListener('change', updatePoints);
  }
}
