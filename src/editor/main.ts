import { shareHome } from '../alpha/projects.ts';
import { exportPlan, download } from '../alpha/exporters.ts';
import { saveHome } from '../alpha/projects.ts';
import { errorMessage, labelControls, reportEditorError } from './ui.ts';
import '@fontsource-variable/inter';
import './editor.css';
import example from '../../examples/modern-house.mopple?raw';
import { downloadMoppleFile, importMoppleFile } from '../project/files.ts';
import { MoppleProjectEngine } from '../project/engine.ts';
import { roomPolygon } from '../project/geometry.ts';
import type { MoppleInteriorObject } from '../project/schema.ts';
import { parseProject } from '../project/validation.ts';
import { executeAiPrompt, isHouseRequest, getStoredApiKey, getStoredModel, setStoredApiKey, setStoredModel } from './ai.ts';
import { Canvas2D, type SelectedEntity } from './canvas2d.ts';
import { Canvas3D } from './canvas3d.ts';
import { LayersPanel } from './layers.ts';
import { PropertyPanel } from './properties.ts';

const AUTOSAVE_STORAGE_KEY = 'mopple_editor_project';

// Initialize Project Engine from local storage or fallback example
function initializeEngine(): MoppleProjectEngine {
  let saved: string | null = null;
  try { saved = localStorage.getItem(AUTOSAVE_STORAGE_KEY); } catch { /* Private browsing may disable storage. */ }
  if (saved) {
    try {
      return new MoppleProjectEngine(parseProject(saved));
    } catch (err) {
      console.warn('Failed to parse autosaved project, falling back to default example:', err);
    }
  }
  return new MoppleProjectEngine(parseProject(example));
}

export function initEditor() {
  const engine = initializeEngine();
  const events = new AbortController();
  const cleanups: (() => void)[] = [];
  let selectedEntity: SelectedEntity | null = null;
  let viewMode: '2d' | 'split' | '3d' = 'split';

  // DOM elements
  const pane2D = document.getElementById('pane-2d') as HTMLElement;
  const pane3D = document.getElementById('pane-3d') as HTMLElement;
  const layersContainer = document.getElementById('layers-container') as HTMLElement;
  const propertiesContainer = document.getElementById('properties-container') as HTMLElement;

  const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
  const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
  const saveText = document.getElementById('save-text') as HTMLElement;
  const projectTitle = document.getElementById('project-title') as HTMLInputElement;

  // AI Prompt elements
  const aiInput = document.getElementById('ai-prompt-input') as HTMLInputElement;
  const aiSubmit = document.getElementById('btn-ai-submit') as HTMLButtonElement;
  const aiStatus = document.getElementById('ai-status') as HTMLElement;
  let statusTimeout: ReturnType<typeof setTimeout> | null = null;
  function showStatus(message: string, type: 'error' | 'success' | 'loading') {
    if (statusTimeout) clearTimeout(statusTimeout);
    aiStatus.className = `ai-status visible ${type}`; aiStatus.textContent = message;
  }
  window.addEventListener('mopple-error', event => showStatus(String((event as CustomEvent).detail), 'error'), { signal: events.signal });
  const aiEngineBadge = document.getElementById('ai-engine-badge') as HTMLElement | null;
  const engineBadgeText = document.getElementById('engine-badge-text') as HTMLElement | null;

  // Modals
  const apiKeyModal = document.getElementById('modal-apikey') as HTMLElement;
  const apiKeyInput = document.getElementById('apikey-input') as HTMLInputElement;
  const geminiModelSelect = document.getElementById('gemini-model-select') as HTMLSelectElement | null;
  const btnSaveApiKey = document.getElementById('btn-save-apikey') as HTMLButtonElement;
  const btnCloseApiKey = document.getElementById('btn-close-apikey') as HTMLButtonElement;

  // 1. Instantiate 2D & 3D Renderers
  const canvas2d = new Canvas2D(pane2D, {
    engine,
    onSelect: (entity) => handleSelect(entity),
  });

  let canvas3d: Canvas3D | undefined;
  try { canvas3d = new Canvas3D(pane3D, { engine, onSelect: entity => handleSelect(entity), onError: reportEditorError }); }
  catch { pane3D.textContent = '3D is unavailable in this browser. You can continue editing in 2D.'; showStatus('WebGL is unavailable; 2D editing is still available.', 'error'); }

  for (const format of ['png','pdf'] as const) document.getElementById(`export-${format}`)?.addEventListener('click',()=>{ void exportPlan(engine.getSnapshot(),format).catch(e=>showStatus(errorMessage(e),'error')); });
  document.getElementById('export-3d')?.addEventListener('click',()=>{if(!canvas3d){showStatus('3D is unavailable in this browser.','error');return;}void canvas3d.screenshot().then(blob=>download(blob,'mopple-3d.png')).catch(e=>showStatus(errorMessage(e),'error'));});
  document.getElementById('share-home')?.addEventListener('click',()=>{void shareHome(engine.getSnapshot()).then(async url=>{try{await navigator.clipboard.writeText(url);showStatus('Read-only share link copied.','success');}catch{const link=document.createElement('a');link.href=url;link.textContent='Open your share link';link.target='_blank';link.rel='noopener';document.querySelector('.workspace-tools')?.append(link);showStatus('Share link ready. Open it to copy the address.','success');}}).catch(e=>showStatus(errorMessage(e),'error'));});

  // 2. Instantiate Panels
  const layersPanel = new LayersPanel(layersContainer, {
    engine,
    onSelect: (entity) => handleSelect(entity),
    onAddFurniture: (kind) => handleAddFurniture(kind),
    onDeleteSelected: () => handleDeleteSelected(),
  });

  const propertyPanel = new PropertyPanel(propertiesContainer, {
    engine,
    onExport: () => handleExport(),
    onImport: () => triggerFileInput(),
    onDeleteSelected: () => handleDeleteSelected(),
    onOpenApiKeyModal: () => openApiKeyModal(),
  });

  // Synchronized Selection Handler
  function handleSelect(entity: SelectedEntity | null) {
    selectedEntity = entity;
    canvas2d.setSelection(entity);
    canvas3d?.setSelection(entity);
    layersPanel.setSelection(entity);
    propertyPanel.setSelection(entity);
  }

  // Add Furniture Helper
  function handleAddFurniture(kind: MoppleInteriorObject['kind']) {
    const p = engine.getSnapshot();
    const rooms = p.building.rooms;
    let targetRoom = rooms[0];
    let posX = 0, posZ = 0;

    if (selectedEntity?.type === 'room') {
      const found = rooms.find(r => r.id === selectedEntity?.id);
      if (found) targetRoom = found;
    }

    if (targetRoom) {
      const poly = roomPolygon(p, targetRoom);
      if (poly.length > 0) {
        const xs = poly.map(v => v.x), zs = poly.map(v => v.z);
        posX = (Math.min(...xs) + Math.max(...xs)) / 2;
        posZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      }
    }

    if (!targetRoom) throw new Error('Create a house before adding furniture.');

    const newObj: MoppleInteriorObject = {
      id: `object_${kind}_${crypto.randomUUID()}`,
      assetId: `${kind}_item`,
      kind,
      roomId: targetRoom.id,
      position: { x: Math.round(posX * 10) / 10, y: p.building.floors.find(f => f.id === targetRoom.floorId)!.elevation, z: Math.round(posZ * 10) / 10 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };

    engine.addInteriorObject(newObj);
    handleSelect({ type: 'object', id: newObj.id });
  }

  // Delete Selected Entity Helper
  function handleDeleteSelected() {
    if (!selectedEntity) return;
    try {
      if (selectedEntity.type === 'object') {
        engine.removeInteriorObject(selectedEntity.id);
      } else if (selectedEntity.type === 'room') {
        engine.removeRoom(selectedEntity.id);
      } else if (selectedEntity.type === 'wall') {
        engine.removeWall(selectedEntity.id);
      }
      handleSelect(null);
    } catch (err) {
      reportEditorError(err);
    }
  }

  // View Switcher Handler
  function setViewMode(mode: '2d' | 'split' | '3d') {
    viewMode = mode;
    document.querySelectorAll('.view-tab').forEach(tab => {
      const active = (tab as HTMLElement).dataset.view === mode;
      tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active));
      (tab as HTMLElement).tabIndex = active ? 0 : -1;
    });

    if (mode === '2d') {
      pane2D.classList.remove('hidden', 'split-left');
      pane3D.classList.add('hidden');
    } else if (mode === '3d') {
      pane2D.classList.add('hidden');
      pane3D.classList.remove('hidden');
    } else {
      pane2D.classList.remove('hidden');
      pane2D.classList.add('split-left');
      pane3D.classList.remove('hidden');
    }
  }

  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = (tab as HTMLElement).dataset.view as '2d' | 'split' | '3d';
      if (mode) setViewMode(mode);
    });
  });

  // History Undo / Redo
  function syncHistoryState() {
    btnUndo.disabled = !engine.canUndo;
    btnUndo.classList.toggle('disabled', !engine.canUndo);
    btnRedo.disabled = !engine.canRedo;
    btnRedo.classList.toggle('disabled', !engine.canRedo);
  }

  btnUndo.addEventListener('click', () => {
    if (engine.undo()) {
      handleSelect(null);
    }
  });

  btnRedo.addEventListener('click', () => {
    if (engine.redo()) {
      handleSelect(null);
    }
  });

  cleanups.push(engine.subscribeHistory(() => syncHistoryState()));
  syncHistoryState();

  // Debounced autosave, with synchronous flush at navigation/background boundaries.
  let saveDebounceTimer: number | null = null;
  let pendingSave = false;
  function flushSave() {
    if (saveDebounceTimer !== null) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
    if (!pendingSave) return;
    try { localStorage.setItem(AUTOSAVE_STORAGE_KEY, engine.saveProject()); pendingSave = false; saveText.textContent = 'Saved locally'; void saveHome(engine.getSnapshot()).then(() => { saveText.textContent = 'Saved'; }).catch(() => { saveText.textContent = 'Saved locally'; }); }
    catch { saveText.textContent = 'Not saved'; showStatus('Browser storage is unavailable or full. Export your project to keep your changes.', 'error'); }
  }
  projectTitle.value = engine.getSnapshot().project.name;
  cleanups.push(engine.subscribe(p => {
    projectTitle.value = p.project.name; syncFloorPicker();
    pendingSave = true; saveText.textContent = 'Saving…';
    if (saveDebounceTimer !== null) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = window.setTimeout(flushSave, 600);
  }));
  window.addEventListener('pagehide', flushSave, { signal: events.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); }, { signal: events.signal });
  window.addEventListener('beforeunload', event => { flushSave(); if (pendingSave) { event.preventDefault(); event.returnValue = ''; } }, { signal: events.signal });
  projectTitle.addEventListener('change', () => {
    try { engine.renameProject(projectTitle.value.trim() || 'Untitled project'); }
    catch (error) { reportEditorError(error); projectTitle.value = engine.getSnapshot().project.name; }
  });
  function handleExport() { downloadMoppleFile(engine); }

  document.getElementById('btn-export')?.addEventListener('click', handleExport);

  // Import File
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.mopple';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  function triggerFileInput() {
    fileInput.click();
  }

  document.getElementById('btn-import')?.addEventListener('click', triggerFileInput);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      await importMoppleFile(engine, file);
      handleSelect(null); canvas2d.resetView(); canvas3d?.resetCamera();
    } catch (err) {
      reportEditorError(err);
    } finally {
      fileInput.value = '';
    }
  });

  // Drag and drop .mopple file onto window
  window.addEventListener('dragover', e => e.preventDefault(), { signal: events.signal });
  window.addEventListener('drop', async e => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && (/\.mopple$/i.test(file.name))) {
      try {
        await importMoppleFile(engine, file);
        handleSelect(null); canvas2d.resetView(); canvas3d?.resetCamera();
      } catch (err) {
        reportEditorError(err);
      }
    }
  }, { signal: events.signal });

  // AI Engine Badge Synchronization
  function updateEngineBadge() {
    const hasKey = Boolean(getStoredApiKey());
    const model = getStoredModel();
    if (!aiEngineBadge || !engineBadgeText) return;

    if (hasKey) {
      aiEngineBadge.classList.add('active-gemini', 'active-nim');
      const isGlm = model.includes('glm');
      const label = isGlm ? 'GLM 5.3 Flash' : (model.includes('llama') ? 'Llama 3.3 70B' : (model.includes('deepseek') ? 'DeepSeek R1' : 'NVIDIA NIM'));
      engineBadgeText.textContent = `⚡ ${label}`;
      aiEngineBadge.title = `Using ${model} via NVIDIA NIM. Click to configure model or API key.`;
    } else {
      aiEngineBadge.classList.remove('active-gemini', 'active-nim');
      engineBadgeText.textContent = 'Offline Engine';
      aiEngineBadge.title = 'Running local semantic engine. Click to connect NVIDIA NIM (GLM 5.3 Flash).';
    }
  }

  aiEngineBadge?.addEventListener('click', () => openApiKeyModal());
  updateEngineBadge();

  // One outstanding request; errors preserve input and never guess a fallback edit.
  let aiBusy = false;
  async function runAiPrompt(promptText: string) {
    if (aiBusy) return;
    const text = promptText.trim();
    if (!text) { showStatus('Enter a house description or a change to make.', 'error'); aiInput.focus(); return; }
    aiBusy = true; aiSubmit.disabled = true;
    document.querySelectorAll<HTMLButtonElement>('.ai-chip').forEach(b => b.disabled = true);
    showStatus(getStoredApiKey() ? `Asking ${getStoredModel()}…` : 'Applying offline design command…', 'loading');
    try {
      const result = await executeAiPrompt(text, engine, selectedEntity?.id);
      showStatus(result.message, 'success'); aiInput.value = ''; handleSelect(null);
      if (isHouseRequest(text)) { canvas2d.resetView(); canvas3d?.resetCamera(); }
    } catch (error) { showStatus(errorMessage(error), 'error'); }
    finally { aiBusy = false; aiSubmit.disabled = false; document.querySelectorAll<HTMLButtonElement>('.ai-chip').forEach(b => b.disabled = false); }
  }
  aiSubmit.addEventListener('click', () => void runAiPrompt(aiInput.value));
  aiInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void runAiPrompt(aiInput.value); } });
  document.querySelectorAll<HTMLButtonElement>('.ai-chip').forEach(chip => chip.addEventListener('click', () => {
    aiInput.value = chip.dataset.prompt || ''; void runAiPrompt(aiInput.value);
  }));

  // API Key & Model Modal
  let modalTrigger: HTMLElement | null = null;
  function openApiKeyModal() {
    modalTrigger = document.activeElement as HTMLElement | null;
    apiKeyInput.value = getStoredApiKey();
    if (geminiModelSelect) {
      geminiModelSelect.value = getStoredModel();
    }
    apiKeyModal.classList.add('show'); document.getElementById('editor-app')!.inert = true; apiKeyInput.focus();
  }

  function closeApiKeyModal() {
    apiKeyModal.classList.remove('show'); document.getElementById('editor-app')!.inert = false; modalTrigger?.focus();
  }

  document.getElementById('btn-apikey')?.addEventListener('click', openApiKeyModal);
  btnCloseApiKey.addEventListener('click', closeApiKeyModal);
  apiKeyModal.addEventListener('click', e => {
    if (e.target === apiKeyModal) closeApiKeyModal();
  });

  apiKeyModal.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); closeApiKeyModal(); }
    if (event.key === 'Tab') {
      const controls = [...apiKeyModal.querySelectorAll<HTMLElement>('input, select, button, a')];
      const first = controls[0], last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  btnSaveApiKey.addEventListener('click', () => {
    setStoredApiKey(apiKeyInput.value);
    if (geminiModelSelect) {
      setStoredModel(geminiModelSelect.value);
    }
    closeApiKeyModal();
    updateEngineBadge();
    const hasKey = Boolean(getStoredApiKey());
    if (hasKey) {
      aiStatus.className = 'ai-status visible success';
      aiStatus.textContent = `${getStoredModel()} configured. The key is kept only until this tab reloads.`;
      if (statusTimeout) clearTimeout(statusTimeout);
      statusTimeout = setTimeout(() => aiStatus.classList.remove('visible'), 4000);
    }
  });

  // Viewport HUD controls
  document.getElementById('hud-zoom-in')?.addEventListener('click', () => canvas2d.zoomIn());
  document.getElementById('hud-zoom-out')?.addEventListener('click', () => canvas2d.zoomOut());
  document.getElementById('hud-reset')?.addEventListener('click', () => {
    canvas2d.resetView();
    canvas3d?.resetCamera();
  });
  document.getElementById('hud-view-iso')?.addEventListener('click', () => canvas3d?.setViewPreset('isometric'));
  document.getElementById('hud-view-top')?.addEventListener('click', () => canvas3d?.setViewPreset('top'));

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', e => {
    const target = e.target as HTMLElement;
    if (apiKeyModal.classList.contains('show')) return;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }

    // Undo: Cmd+Z or Ctrl+Z
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (engine.undo()) handleSelect(null);
      return;
    }

    // Redo: Cmd+Shift+Z or Ctrl+Shift+Z or Ctrl+Y
    if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.shiftKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      if (engine.redo()) handleSelect(null);
      return;
    }

    // Delete / Backspace: Delete selected entity
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (selectedEntity) {
        e.preventDefault();
        handleDeleteSelected();
      }
      return;
    }

    // Escape: clear selection
    if (e.key === 'Escape') {
      handleSelect(null);
      return;
    }

    // View numbers: 1 = 2D, 2 = Split, 3 = 3D
    if (e.key === '1') setViewMode('2d');
    else if (e.key === '2') setViewMode('split');
    else if (e.key === '3') setViewMode('3d');
  }, { signal: events.signal });

  const floorPicker = document.getElementById('floor-picker') as HTMLSelectElement;
  function syncFloorPicker() {
    const floors = engine.getSnapshot().building.floors;
    const selected = floorPicker?.value;
    if (!floorPicker) return;
    floorPicker.replaceChildren(...floors.map(f => { const option = document.createElement('option'); option.value = f.id; option.textContent = f.name; return option; }));
    floorPicker.value = floors.some(f => f.id === selected) ? selected : floors[0]?.id ?? '';
    if (floorPicker.value) canvas2d.setFloor(floorPicker.value);
  }
  floorPicker.addEventListener('change', () => canvas2d.setFloor(floorPicker.value)); syncFloorPicker();
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-panel]')) button.addEventListener('click', () => {
    const panel = button.dataset.panel!;
    document.querySelectorAll<HTMLElement>('.panel-sidebar, .panel-properties').forEach(p => p.classList.toggle('mobile-open', p.id === panel && !p.classList.contains('mobile-open')));
    document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b => b.setAttribute('aria-expanded', String(document.getElementById(b.dataset.panel!)!.classList.contains('mobile-open'))));
  });
  document.querySelector('.view-switcher')?.addEventListener('keydown', event => {
    const e = event as KeyboardEvent; if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); const tabs = [...document.querySelectorAll<HTMLButtonElement>('.view-tab')];
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement), next = tabs[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
    next.click(); next.focus();
  });
  labelControls(document.body);
  setViewMode(matchMedia('(max-width: 760px)').matches || !canvas3d ? '2d' : 'split');
  function dispose() { flushSave(); events.abort(); cleanups.forEach(stop => stop()); canvas2d.destroy(); canvas3d?.destroy(); layersPanel.destroy(); propertyPanel.destroy(); fileInput.remove(); }
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  window.addEventListener('pagehide', e => { if (!e.persisted) dispose(); }, { signal: events.signal });
}

// Auto-run when loaded as module
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initEditor());
  } else {
    initEditor();
  }
}
