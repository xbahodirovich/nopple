import type { MoppleProjectEngine } from '../project/engine.ts';
import type { MoppleInteriorObject, MoppleProject } from '../project/schema.ts';
import type { SelectedEntity } from './canvas2d.ts';

export interface LayersPanelOptions {
  engine: MoppleProjectEngine;
  onSelect: (entity: SelectedEntity | null) => void;
  onAddFurniture: (kind: MoppleInteriorObject['kind']) => void;
  onDeleteSelected: () => void;
}

export class LayersPanel {
  private container: HTMLElement;
  private engine: MoppleProjectEngine;
  private project: MoppleProject;
  private selected: SelectedEntity | null = null;
  private onSelect: (entity: SelectedEntity | null) => void;
  private onAddFurniture: (kind: MoppleInteriorObject['kind']) => void;
  private onDeleteSelected: () => void;
  private filterQuery = '';
  private unsubscribe: () => void;

  constructor(container: HTMLElement, options: LayersPanelOptions) {
    this.container = container;
    this.engine = options.engine;
    this.project = options.engine.getSnapshot();
    this.onSelect = options.onSelect;
    this.onAddFurniture = options.onAddFurniture;
    this.onDeleteSelected = options.onDeleteSelected;

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
    this.container.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">Layers</div>
        <div class="panel-actions">
          <div class="dropdown">
            <button class="icon-button" id="btn-add-entity" title="Add Object">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <div class="dropdown-menu" id="add-entity-menu">
              <div class="menu-label">Add Furniture</div>
              <button class="menu-item" data-add="sofa">🛋️ Sofa</button>
              <button class="menu-item" data-add="bed">🛏️ Bed</button>
              <button class="menu-item" data-add="table">🪵 Dining Table</button>
              <button class="menu-item" data-add="chair">🪑 Accent Chair</button>
              <button class="menu-item" data-add="cabinet">🗄️ Cabinet / Sideboard</button>
              <button class="menu-item" data-add="lamp">💡 Floor Lamp</button>
              <button class="menu-item" data-add="decoration">🪴 Indoor Plant</button>
              <button class="menu-item" data-add="appliance">🍳 Kitchen Appliance</button>
            </div>
          </div>
          <button class="icon-button ${this.selected ? '' : 'disabled'}" id="btn-delete-entity" title="Delete Selected" ${this.selected ? '' : 'disabled'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      <div class="panel-search">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="layers-filter" placeholder="Filter layers..." value="${this.filterQuery}" />
      </div>

      <div class="layers-tree">
        <!-- Rooms Section -->
        <div class="layer-group">
          <div class="layer-group-header">
            <span class="group-toggle">▼</span>
            <span class="group-title">Rooms</span>
            <span class="group-badge">${this.project.building.rooms.length}</span>
          </div>
          <div class="layer-items">
            ${this.renderRooms()}
          </div>
        </div>

        <!-- Furniture Objects Section -->
        <div class="layer-group">
          <div class="layer-group-header">
            <span class="group-toggle">▼</span>
            <span class="group-title">Furniture & Objects</span>
            <span class="group-badge">${this.project.interior.objects.length}</span>
          </div>
          <div class="layer-items">
            ${this.renderObjects()}
          </div>
        </div>

        <!-- Walls Section -->
        <div class="layer-group">
          <div class="layer-group-header">
            <span class="group-toggle">▼</span>
            <span class="group-title">Walls</span>
            <span class="group-badge">${this.project.building.walls.length}</span>
          </div>
          <div class="layer-items">
            ${this.renderWalls()}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderRooms(): string {
    return this.project.building.rooms
      .filter(r => !this.filterQuery || r.name.toLowerCase().includes(this.filterQuery) || r.type.includes(this.filterQuery))
      .map(room => {
        const isSelected = this.selected?.type === 'room' && this.selected.id === room.id;
        return `
          <div class="layer-item ${isSelected ? 'selected' : ''}" data-type="room" data-id="${room.id}">
            <span class="layer-icon">⬚</span>
            <span class="layer-label">${room.name}</span>
            <span class="layer-sub">${room.type}</span>
          </div>
        `;
      }).join('');
  }

  private renderObjects(): string {
    const icons: Record<string, string> = {
      sofa: '🛋️',
      bed: '🛏️',
      table: '🪵',
      chair: '🪑',
      cabinet: '🗄️',
      lamp: '💡',
      appliance: '🍳',
      decoration: '🪴',
    };

    return this.project.interior.objects
      .filter(o => !this.filterQuery || o.assetId.toLowerCase().includes(this.filterQuery) || o.kind.includes(this.filterQuery))
      .map(obj => {
        const isSelected = this.selected?.type === 'object' && this.selected.id === obj.id;
        const icon = icons[obj.kind] || '📦';
        return `
          <div class="layer-item ${isSelected ? 'selected' : ''}" data-type="object" data-id="${obj.id}">
            <span class="layer-icon">${icon}</span>
            <span class="layer-label">${obj.assetId || obj.kind}</span>
            <span class="layer-sub">${obj.roomId ? obj.roomId.replace('room_', '') : ''}</span>
          </div>
        `;
      }).join('');
  }

  private renderWalls(): string {
    return this.project.building.walls
      .filter(w => !this.filterQuery || w.id.toLowerCase().includes(this.filterQuery))
      .map(wall => {
        const isSelected = this.selected?.type === 'wall' && this.selected.id === wall.id;
        return `
          <div class="layer-item ${isSelected ? 'selected' : ''}" data-type="wall" data-id="${wall.id}">
            <span class="layer-icon">━</span>
            <span class="layer-label">${wall.id}</span>
            <span class="layer-sub">${wall.height}m</span>
          </div>
        `;
      }).join('');
  }

  private bindEvents() {
    // Search input
    const filterInput = this.container.querySelector('#layers-filter') as HTMLInputElement | null;
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        this.filterQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
        this.render();
        // keep focus
        const nextInput = this.container.querySelector('#layers-filter') as HTMLInputElement | null;
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
    }

    // Add entity menu toggle
    const addBtn = this.container.querySelector('#btn-add-entity');
    const menu = this.container.querySelector('#add-entity-menu') as HTMLElement | null;
    if (addBtn && menu) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
      });
      document.addEventListener('click', () => menu.classList.remove('show'), { once: true });
    }

    // Add item buttons
    this.container.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const kind = (btn as HTMLElement).dataset.add as MoppleInteriorObject['kind'];
        if (kind) {
          this.onAddFurniture(kind);
          if (menu) menu.classList.remove('show');
        }
      });
    });

    // Delete button
    const deleteBtn = this.container.querySelector('#btn-delete-entity');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.onDeleteSelected();
      });
    }

    // Click item to select
    this.container.querySelectorAll('.layer-item').forEach(el => {
      el.addEventListener('click', () => {
        const type = (el as HTMLElement).dataset.type as 'object' | 'wall' | 'room';
        const id = (el as HTMLElement).dataset.id!;
        this.selected = { type, id };
        this.onSelect(this.selected);
        this.render();
      });
    });
  }
}
