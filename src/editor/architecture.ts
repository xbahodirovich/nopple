import * as THREE from 'three';
import { architectureMeasurements, exteriorViewNames, exteriorViews, type ArchitectureMeasurement } from '../project/measurements.ts';
import type { MoppleProjectEngine } from '../project/engine.ts';
import type { SelectedEntity } from './canvas2d.ts';
import type { Canvas3D } from './canvas3d.ts';

/** Projected annotations stay sharp at any zoom and never change saved geometry. */
export class ArchitectureOverlay {
  readonly element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  rows: ArchitectureMeasurement[] = [];
  enabled = false;
  constructor(container: HTMLElement) {
    this.element.classList.add('architecture-dimensions');
    this.element.setAttribute('aria-hidden', 'true');
    container.append(this.element);
  }
  render(camera: THREE.Camera, width: number, height: number) {
    this.element.replaceChildren();
    if (!this.enabled) return;
    this.element.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const boxes: { x: number; y: number; width: number }[] = [];
    for (const row of this.rows) {
      if (row.unit !== 'm' || row.value < .001) continue;
      const project = (p: typeof row.start) => new THREE.Vector3(p.x, p.y, p.z).project(camera);
      const a = project(row.start), b = project(row.end);
      if ([a, b].some(p => p.z < -1 || p.z > 1)) continue;
      const x1 = (a.x + 1) * width / 2, y1 = (1 - a.y) * height / 2;
      const x2 = (b.x + 1) * width / 2, y2 = (1 - b.y) * height / 2;
      const x = (x1 + x2) / 2, y = (y1 + y2) / 2;
      if (x < 35 || x > width - 35 || y < 110 || y > height - 30) continue;
      const label = `${row.value.toFixed(3)} m`, labelWidth = label.length * 6.5 + 12;
      // Dense selected-wall chains remain available in the full schedule.
      if (boxes.some(box => Math.abs(box.x - x) < (box.width + labelWidth) / 2 && Math.abs(box.y - y) < 23)) continue;
      boxes.push({ x, y, width: labelWidth });
      const group = document.createElementNS(this.element.namespaceURI, 'g');
      const line = document.createElementNS(this.element.namespaceURI, 'path');
      line.setAttribute('d', `M${x1},${y1} L${x2},${y2} M${x1 - 4},${y1 + 4} l8,-8 M${x2 - 4},${y2 + 4} l8,-8`);
      const rect = document.createElementNS(this.element.namespaceURI, 'rect');
      for (const [key, value] of Object.entries({ x: x - labelWidth / 2, y: y - 10, width: labelWidth, height: 20, rx: 3 })) rect.setAttribute(key, String(value));
      const text = document.createElementNS(this.element.namespaceURI, 'text');
      text.setAttribute('x', String(x)); text.setAttribute('y', String(y + 4)); text.textContent = label;
      const title = document.createElementNS(this.element.namespaceURI, 'title'); title.textContent = row.name;
      group.append(title, line, rect, text); this.element.append(group);
    }
  }
}

export function createArchitectureControls(container: HTMLElement, engine: MoppleProjectEngine, canvas: Canvas3D, onSelect: (entity: SelectedEntity) => void) {
  const panel = document.createElement('div'); panel.className = 'architecture-controls';
  panel.innerHTML = `<div class="architecture-toolbar">
    <label>3D view<select id="architecture-view" aria-label="3D architectural view"><option value="isometric">Whole house</option><option value="cutaway">Cutaway</option><option value="top">Top plan</option>${exteriorViews.map(v => `<option value="${v}">${exteriorViewNames[v]}</option>`).join('')}</select></label>
    <label>Level<select id="architecture-floor" aria-label="3D floor"><option value="">All floors</option></select></label>
    <label class="dimension-toggle"><input id="architecture-dimensions" type="checkbox">Dimensions</label>
  </div><details class="measurement-schedule"><summary>Measurement schedule <span id="measurement-count"></span></summary>
    <p>Model dimensions in meters. Rooms use wall centerlines; overall extents use outer wall faces. Front is +Z. Select a row to inspect in 3D.</p>
    <div class="measurement-actions"><label>Filter<input id="measurement-filter" type="search" placeholder="Room, wall or opening"></label><button type="button" class="btn btn-secondary btn-sm" id="measurement-export">Export CSV</button></div>
    <div class="measurement-table-wrap"><table><caption class="sr-only">Architectural model measurements</caption><thead><tr><th scope="col">Element / distance</th><th scope="col">Value</th></tr></thead><tbody id="measurement-rows"></tbody></table></div>
  </details>`;
  container.append(panel);
  const floor = panel.querySelector<HTMLSelectElement>('#architecture-floor')!;
  const view = panel.querySelector<HTMLSelectElement>('#architecture-view')!;
  const dimensions = panel.querySelector<HTMLInputElement>('#architecture-dimensions')!;
  const search = panel.querySelector<HTMLInputElement>('#measurement-filter')!;
  let rows: ArchitectureMeasurement[] = [];
  const visibleRows = () => rows.filter(row => (!floor.value || !row.floorId || row.floorId === floor.value) && row.name.toLowerCase().includes(search.value.toLowerCase()));
  function renderRows() {
    const body = panel.querySelector('#measurement-rows')!; body.replaceChildren();
    const filtered = visibleRows();
    panel.querySelector('#measurement-count')!.textContent = `(${filtered.length})`;
    for (const row of filtered) {
      const tr = document.createElement('tr'), name = document.createElement('td'), value = document.createElement('td');
      if (row.entityId && row.entityType) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = row.name;
        button.addEventListener('click', () => { dimensions.checked = true; canvas.setDimensionsVisible(true); onSelect({ id: row.entityId!, type: row.entityType! }); });
        name.append(button);
      } else name.textContent = row.name;
      value.textContent = `${row.value.toFixed(3)} ${row.unit}`; tr.append(name, value); body.append(tr);
    }
    if (!filtered.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 2; td.textContent = 'No matching measurements.'; tr.append(td); body.append(tr); }
  }
  function sync() {
    const project = engine.getSnapshot(), previous = floor.value;
    floor.replaceChildren(new Option('All floors', ''), ...project.building.floors.map(f => new Option(f.name, f.id)));
    floor.value = project.building.floors.some(f => f.id === previous) ? previous : '';
    canvas.setFloor(floor.value || null);
    rows = architectureMeasurements(project); renderRows();
  }
  view.addEventListener('change', () => canvas.setViewPreset(view.value as Parameters<Canvas3D['setViewPreset']>[0]));
  floor.addEventListener('change', () => { canvas.setFloor(floor.value || null); renderRows(); });
  dimensions.addEventListener('change', () => canvas.setDimensionsVisible(dimensions.checked));
  search.addEventListener('input', renderRows);
  panel.querySelector('#measurement-export')!.addEventListener('click', () => {
    const quote = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const csv = ['Element,Value,Unit,Floor', ...visibleRows().map(row => [quote(row.name), row.value.toFixed(6), row.unit, quote(row.floorId ?? '')].join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mopple-measurements.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  sync(); const unsubscribe = engine.subscribe(sync);
  return { setView(value: string) { view.value = value; }, destroy() { unsubscribe(); panel.remove(); } };
}
