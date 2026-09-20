import '@fontsource-variable/inter';
import './editor.css';
import example from '../../examples/modern-house.mopple?raw';
import { exportMoppleFile, importMoppleFile } from '../project/files.ts';
import { MoppleProjectEngine } from '../project/engine.ts';
import { roomPolygon } from '../project/geometry.ts';
import type { MoppleInteriorObject } from '../project/schema.ts';
import { parseProject } from '../project/validation.ts';
import { executeAiPrompt, getStoredApiKey, getStoredModel, setStoredApiKey, setStoredModel } from './ai.ts';
import { Canvas2D, type SelectedEntity } from './canvas2d.ts';
import { Canvas3D } from './canvas3d.ts';
import { LayersPanel } from './layers.ts';
import { PropertyPanel } from './properties.ts';

const AUTOSAVE_STORAGE_KEY = 'mopple_editor_project';

// Initialize Project Engine from local storage or fallback example
function initializeEngine(): MoppleProjectEngine {
  const saved = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
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

  const canvas3d = new Canvas3D(pane3D, {
    engine,
    onSelect: (entity) => handleSelect(entity),
  });

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
    canvas3d.setSelection(entity);
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

    // Offset slightly
    posX += (Math.random() - 0.5) * 0.6;
    posZ += (Math.random() - 0.5) * 0.6;

    const newObj: MoppleInteriorObject = {
      id: `object_${kind}_${Date.now().toString(36).slice(-4)}`,
      assetId: `${kind}_item`,
      kind,
      roomId: targetRoom ? targetRoom.id : 'room_ground',
      position: { x: Math.round(posX * 10) / 10, y: 0, z: Math.round(posZ * 10) / 10 },
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
      } else if (selectedEntity.type === 'wall') {
        engine.removeWall(selectedEntity.id);
      }
      handleSelect(null);
    } catch (err) {
      console.warn('Could not delete entity:', err);
      alert('Cannot delete this item: other entities depend on it.');
    }
  }

  // View Switcher Handler
  function setViewMode(mode: '2d' | 'split' | '3d') {
    viewMode = mode;
    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.classList.toggle('active', (tab as HTMLElement).dataset.view === mode);
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

  engine.subscribeHistory(() => syncHistoryState());
  syncHistoryState();

  // Autosave to LocalStorage
  let saveDebounceTimer: number | null = null;
  engine.subscribe(p => {
    projectTitle.value = p.project.name;
    if (saveDebounceTimer !== null) clearTimeout(saveDebounceTimer);
    if (saveText) saveText.textContent = 'Saving...';

    saveDebounceTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_STORAGE_KEY, engine.saveProject());
        if (saveText) saveText.textContent = 'Saved';
      } catch (err) {
        console.error('Autosave error:', err);
      }
    }, 600);
  });

  // Project title edit
  projectTitle.addEventListener('change', () => {
    const snap = engine.getSnapshot();
    snap.project.name = projectTitle.value.trim() || 'Untitled project';
    engine.loadProject(snap);
  });

  // Export File
  function handleExport() {
    const snap = engine.getSnapshot();
    const json = engine.saveProject();
    const filename = `${snap.project.name.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'house'}.mopple`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById('btn-export')?.addEventListener('click', handleExport);

  // Import File
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.mopple,.json';
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
      const text = await file.text();
      engine.importProject(text);
      handleSelect(null);
    } catch (err: any) {
      alert(`Could not import project: ${err.message || 'Invalid format'}`);
    } finally {
      fileInput.value = '';
    }
  });

  // Drag and drop .mopple file onto window
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async e => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith('.mopple') || file.name.endsWith('.json'))) {
      try {
        const text = await file.text();
        engine.importProject(text);
        handleSelect(null);
      } catch (err: any) {
        alert(`Could not import dropped file: ${err.message || 'Invalid format'}`);
      }
    }
  });

  // AI Engine Badge Synchronization
  function updateEngineBadge() {
    const hasKey = Boolean(getStoredApiKey());
    const model = getStoredModel();
    if (!aiEngineBadge || !engineBadgeText) return;

    if (hasKey) {
      aiEngineBadge.classList.add('active-gemini');
      const is31 = model.includes('3.1-pro') || model.includes('3-pro');
      const label = is31 ? 'Gemini 3.1 Pro' : (model.includes('3.5-flash') ? 'Gemini 3.5 Flash' : 'Gemini Active');
      engineBadgeText.textContent = `⚡ ${label}`;
      aiEngineBadge.title = `Using ${model}. Click to configure model or API key.`;
    } else {
      aiEngineBadge.classList.remove('active-gemini');
      engineBadgeText.textContent = 'Offline Engine';
      aiEngineBadge.title = 'Running local semantic engine. Click to connect Gemini 3.1 Pro.';
    }
  }

  aiEngineBadge?.addEventListener('click', () => openApiKeyModal());
  updateEngineBadge();

  // AI Prompt Submission
  let statusTimeout: ReturnType<typeof setTimeout> | null = null;

  async function runAiPrompt(promptText: string) {
    const text = promptText.trim();
    if (!text) {
      aiStatus.className = 'ai-status visible error';
      aiStatus.innerHTML = '<span class="status-icon">⚠️</span><span>Please enter a prompt (e.g. "expand bedroom by 1m" or "add a sofa")</span>';
      if (statusTimeout) clearTimeout(statusTimeout);
      statusTimeout = setTimeout(() => {
        aiStatus.classList.remove('visible');
      }, 4000);
      return;
    }

    if (statusTimeout) clearTimeout(statusTimeout);
    const hasKey = Boolean(getStoredApiKey());

    aiStatus.className = 'ai-status visible loading';
    aiStatus.innerHTML = `<span class="ai-spinner"></span><span>${
      hasKey ? `Gemini 3.1 Pro is processing architecture changes...` : 'Analyzing prompt locally...'
    }</span>`;
    aiSubmit.disabled = true;

    try {
      const res = await executeAiPrompt(text, engine, selectedEntity?.id);
      aiStatus.className = 'ai-status visible success';
      aiStatus.innerHTML = `<span class="status-icon">✓</span><span>${res.message}</span>`;
      aiInput.value = '';
      statusTimeout = setTimeout(() => {
        aiStatus.classList.remove('visible');
      }, 6000);
    } catch (err: any) {
      aiStatus.className = 'ai-status visible error';
      const msg = err.message || 'Unknown error occurred';
      aiStatus.innerHTML = `<span class="status-icon">⚠️</span><span>${msg}</span>`;
      console.error('AI execution error:', err);
    } finally {
      aiSubmit.disabled = false;
    }
  }

  aiSubmit.addEventListener('click', () => runAiPrompt(aiInput.value));
  aiInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') runAiPrompt(aiInput.value);
  });
  aiInput.addEventListener('input', () => {
    if (aiStatus.classList.contains('error')) {
      aiStatus.classList.remove('visible');
    }
  });

  // AI Chip Buttons
  document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-prompt') || chip.textContent?.trim() || '';
      aiInput.value = text;
      runAiPrompt(text);
    });
  });

  // API Key & Model Modal
  function openApiKeyModal() {
    apiKeyInput.value = getStoredApiKey();
    if (geminiModelSelect) {
      geminiModelSelect.value = getStoredModel();
    }
    apiKeyModal.classList.add('show');
  }

  function closeApiKeyModal() {
    apiKeyModal.classList.remove('show');
  }

  document.getElementById('btn-apikey')?.addEventListener('click', openApiKeyModal);
  btnCloseApiKey.addEventListener('click', closeApiKeyModal);
  apiKeyModal.addEventListener('click', e => {
    if (e.target === apiKeyModal) closeApiKeyModal();
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
      aiStatus.innerHTML = '<span class="status-icon">✓</span><span>Gemini 3.1 Pro configured and active!</span>';
      if (statusTimeout) clearTimeout(statusTimeout);
      statusTimeout = setTimeout(() => aiStatus.classList.remove('visible'), 4000);
    }
  });

  // Viewport HUD controls
  document.getElementById('hud-zoom-in')?.addEventListener('click', () => canvas2d.zoomIn());
  document.getElementById('hud-zoom-out')?.addEventListener('click', () => canvas2d.zoomOut());
  document.getElementById('hud-reset')?.addEventListener('click', () => {
    canvas2d.resetView();
    canvas3d.resetCamera();
  });
  document.getElementById('hud-view-iso')?.addEventListener('click', () => canvas3d.setViewPreset('isometric'));
  document.getElementById('hud-view-top')?.addEventListener('click', () => canvas3d.setViewPreset('top'));

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', e => {
    const target = e.target as HTMLElement;
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
  });

  // Initial set view
  setViewMode('split');
}

// Auto-run when loaded as module
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initEditor());
  } else {
    initEditor();
  }
}
