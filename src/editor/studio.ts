import type { MoppleProjectEngine } from '../project/engine.ts';
import type { Canvas3D } from './canvas3d.ts';
import { finishOptions, finishVariant, type FinishOptionId } from '../project/finishes.ts';
import { applyDesignPreview, type DesignPreview } from '../project/preview.ts';
import { localHomes, saveHome, shareHome } from '../alpha/projects.ts';
import { planCanvas, planPdf, download } from '../alpha/exporters.ts';
import { archiveFiles } from '../alpha/archive.ts';
import { architectureMeasurements } from '../project/measurements.ts';
import { createGenerationPlan } from '../project/generation.ts';
import { polygonArea, roomPolygon } from '../project/geometry.ts';
import { escapeHtml } from './ui.ts';

export function createStudio(engine: MoppleProjectEngine, getCanvas: () => Canvas3D | undefined, report: (message: string, type: 'success' | 'error' | 'loading') => void) {
  const compare = document.createElement('dialog'); compare.id = 'compare-dialog'; compare.className = 'studio-dialog compare-dialog';
  compare.setAttribute('aria-labelledby', 'compare-title');
  compare.innerHTML = `<header class="studio-dialog-header"><div><h2 id="compare-title">Compare your options</h2><p>Same home. Same camera. A different feeling.</p></div><button class="btn btn-secondary" data-close>Close</button></header>
    <div class="compare-tools"><label for="compare-room">View</label><select id="compare-room" class="input-select"></select><label for="compare-scope">Apply to</label><select id="compare-scope" class="input-select"><option value="home">Whole home</option><option value="room">Selected room</option></select><button class="btn btn-secondary" id="compare-capture">Capture options</button></div>
    <p class="studio-help">These are local 3D captures. AI image enhancement can be connected later.</p><div id="compare-options" class="compare-options"></div><p id="compare-status" role="status"></p>
    <footer class="studio-dialog-footer"><span>Your current design stays saved until you apply an option.</span><button class="btn btn-primary" id="compare-apply" disabled>Apply selected option</button></footer>`;
  const review = document.createElement('dialog'); review.id = 'change-review'; review.className = 'studio-dialog'; review.setAttribute('aria-labelledby', 'change-title');
  review.innerHTML = `<header class="studio-dialog-header"><div><h2 id="change-title">Review your change</h2><p id="change-request"></p></div><button class="btn btn-secondary" data-close>Close</button></header><div class="change-comparison"><figure><div id="change-before-slot"></div><figcaption>Current home</figcaption></figure><figure><div id="change-after-slot"></div><figcaption>Proposed change</figcaption></figure></div><p id="change-details" class="studio-help"></p><p id="change-error" role="alert"></p><footer class="studio-dialog-footer"><button class="btn btn-secondary" id="change-discard">Keep current</button><button class="btn btn-primary" id="change-apply">Apply change</button></footer>`;
  const delivery = document.createElement('dialog'); delivery.id = 'delivery-dialog'; delivery.className = 'studio-dialog delivery-dialog'; delivery.setAttribute('aria-labelledby', 'delivery-title');
  delivery.innerHTML = `<header class="studio-dialog-header"><div><h2 id="delivery-title">Your home, ready to share</h2><p>Keep an editable copy. Share the design you chose.</p></div><button class="btn btn-secondary" data-close>Close</button></header><div class="delivery-layout"><figure id="delivery-preview"></figure><div class="delivery-actions"><h3>Design files</h3><div id="delivery-formats"></div><button class="btn btn-primary" id="delivery-package">Download home package</button><p class="studio-help">ZIP with your project, every floor plan, dimensions and local room / exterior views.</p><h3>Read-only link</h3><button class="btn btn-secondary" id="delivery-share">Create share link</button><label for="delivery-link">Share address</label><input id="delivery-link" class="input-text" readonly placeholder="Create a link to copy it"><button class="btn btn-secondary" id="delivery-copy" disabled>Copy link</button><p id="delivery-status" role="status"></p></div></div><footer class="studio-dialog-footer"><span>Concept design · AI images are not connected.</span></footer>`;
  const history = document.createElement('dialog'); history.id = 'history-dialog'; history.className = 'studio-dialog'; history.setAttribute('aria-labelledby', 'history-title');
  history.innerHTML = `<header class="studio-dialog-header"><div><h2 id="history-title">Saved versions</h2><p>Restore a previous design. You can undo the restore.</p></div><button class="btn btn-secondary" data-close>Close</button></header><div id="history-list" class="history-list"></div><p id="history-status" role="status"></p>`;
  const beforeImage = new Image(); beforeImage.id = 'change-before'; beforeImage.alt = 'Current home'; review.querySelector('#change-before-slot')!.append(beforeImage);
  const afterImage = new Image(); afterImage.id = 'change-after'; afterImage.alt = 'Preview of proposed home'; review.querySelector('#change-after-slot')!.append(afterImage);
  const dialogs = [compare, review, delivery, history]; document.body.append(...dialogs);
  const trigger = new Map<HTMLDialogElement, HTMLElement | null>();
  for (const dialog of dialogs) {
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => trigger.get(dialog)?.focus());
  }
  const open = (dialog: HTMLDialogElement) => { trigger.set(dialog, document.activeElement as HTMLElement | null); dialog.showModal(); };
  for (const id of ['export-png', 'export-pdf', 'export-3d']) delivery.querySelector('#delivery-formats')!.append(document.getElementById(id)!);
  const fileButton = document.createElement('button'); fileButton.className = 'btn btn-secondary'; fileButton.id = 'delivery-project'; fileButton.textContent = 'Editable project'; fileButton.onclick = () => download(new Blob([engine.saveProject()], { type: 'application/json' }), 'home.mopple'); delivery.querySelector('#delivery-formats')!.append(fileButton);

  const roomSelect = compare.querySelector<HTMLSelectElement>('#compare-room')!;
  const scope = compare.querySelector<HTMLSelectElement>('#compare-scope')!;
  const apply = compare.querySelector<HTMLButtonElement>('#compare-apply')!;
  const status = compare.querySelector<HTMLElement>('#compare-status')!;
  let comparisonRevision = 0, selected: FinishOptionId | undefined, comparisonReady = false;
  let pending: DesignPreview | undefined;
  const paintOptions = () => {
    selected = undefined; apply.disabled = true; comparisonReady = false;
    comparisonRevision = engine.revision;
    compare.querySelector('#compare-options')!.innerHTML = finishOptions.map(option => `<button class="finish-option" data-finish="${option.id}" aria-pressed="false"><div class="finish-image"><span>Select Capture options to preview</span></div><div class="finish-description"><span class="finish-swatch" style="background:${option.color}"></span><strong>${option.name}</strong><p>${option.description}</p></div></button>`).join('');
    compare.querySelectorAll<HTMLButtonElement>('[data-finish]').forEach(button => button.onclick = () => {
      if (!comparisonReady) { status.textContent = 'Capture the options first so you can review the finishes.'; return; }
      selected = button.dataset.finish as FinishOptionId;
      compare.querySelectorAll('[data-finish]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      apply.disabled = false; status.textContent = `${finishOptions.find(option => option.id === selected)!.name} selected. Ready to apply.`;
    });
    status.textContent = '';
  };
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const captureOptions = async () => {
    const canvas = getCanvas(); if (!canvas) { status.textContent = '3D is unavailable. You can still edit the plan and materials in Properties.'; return; }
    paintOptions(); const snapshot = engine.getSnapshot(); const button = compare.querySelector<HTMLButtonElement>('#compare-capture')!; button.disabled = true;
    try {
      for (const option of finishOptions) {
        status.textContent = `Capturing ${option.name}…`; await frame();
        const variant = finishVariant(snapshot, option.id, scope.value === 'room' ? roomSelect.value || undefined : undefined);
        const img = new Image(); img.alt = `${option.name} preview`; img.src = canvas.captureAlternative(variant, roomSelect.value || undefined);
        compare.querySelector(`[data-finish="${option.id}"] .finish-image`)!.replaceChildren(img);
      }
      if (engine.revision !== comparisonRevision) throw new Error('Your home changed. Capture the options again.');
      comparisonReady = true; status.textContent = 'Choose an option to apply. Your geometry stays the same.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Capture failed.'; }
    finally { button.disabled = false; }
  };
  roomSelect.onchange = scope.onchange = paintOptions;
  compare.querySelector('#compare-capture')!.addEventListener('click', () => void captureOptions());
  apply.onclick = () => {
    if (!selected) return;
    try {
      applyDesignPreview(engine, { project: finishVariant(engine.getSnapshot(), selected, scope.value === 'room' ? roomSelect.value || undefined : undefined), revision: comparisonRevision, title: selected, changes: 1 });
      compare.close(); report('Finish applied. Undo returns to your previous design.', 'success');
    } catch (error) { status.textContent = String(error instanceof Error ? error.message : error); }
  };
  document.querySelector('#btn-compare')?.addEventListener('click', () => {
    const rooms = engine.getSnapshot().building.rooms.filter(room => room.type !== 'hallway');
    roomSelect.replaceChildren(new Option('Whole home · cutaway', ''), ...rooms.map(room => new Option(room.name, room.id)));
    roomSelect.value = rooms.find(room => room.type === 'living_room')?.id ?? '';
    scope.value = 'home'; paintOptions(); open(compare); void captureOptions();
  });
  review.querySelector('#change-discard')!.addEventListener('click', () => review.close());
  review.querySelector('#change-apply')!.addEventListener('click', () => {
    if (!pending) return;
    try { applyDesignPreview(engine, pending); review.close(); report('Change applied. Undo is available.', 'success'); }
    catch (error) { review.querySelector('#change-error')!.textContent = error instanceof Error ? error.message : String(error); }
  });
  review.addEventListener('close', () => pending = undefined);

  const link = delivery.querySelector<HTMLInputElement>('#delivery-link')!;
  const copy = delivery.querySelector<HTMLButtonElement>('#delivery-copy')!;
  const deliveryStatus = delivery.querySelector<HTMLElement>('#delivery-status')!;
  delivery.querySelector('#delivery-share')!.addEventListener('click', async () => {
    try { link.value = await shareHome(engine.getSnapshot()); copy.disabled = false; deliveryStatus.textContent = 'Anyone with this link can view this snapshot. Portable links cannot be revoked.'; }
    catch (error) { deliveryStatus.textContent = error instanceof Error ? error.message : String(error); }
  });
  copy.onclick = async () => { try { await navigator.clipboard.writeText(link.value); deliveryStatus.textContent = 'Link copied.'; } catch { link.select(); deliveryStatus.textContent = 'Select and copy the address above.'; } };
  document.querySelector('#btn-delivery')?.addEventListener('click', () => {
    const image = new Image(); image.alt = 'Your home';
    try { image.src = getCanvas()?.captureExteriorView('street', 960, 600) ?? planCanvas(engine.getSnapshot()).toDataURL(); }
    catch { image.src = planCanvas(engine.getSnapshot()).toDataURL(); }
    delivery.querySelector('#delivery-preview')!.replaceChildren(image); link.value = ''; copy.disabled = true; deliveryStatus.textContent = ''; open(delivery);
  });
  const packageButton = delivery.querySelector<HTMLButtonElement>('#delivery-package')!;
  packageButton.onclick = async () => {
    packageButton.disabled = true;
    try {
      const project = engine.getSnapshot();
      const files: { name: string; data: Blob | string }[] = [{ name: 'home.mopple', data: JSON.stringify(project, null, 2) }, { name: 'plans/floor-plans.pdf', data: planPdf(project) }];
      for (const floor of project.building.floors) {
        const blob = await new Promise<Blob>((resolve, reject) => planCanvas(project, floor.id).toBlob(value => value ? resolve(value) : reject(new Error('Plan export failed.'))));
        files.push({ name: `plans/${floor.id}.png`, data: blob });
      }
      const quote = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
      files.push({ name: 'measurements.csv', data: ['Element,Value,Unit', ...architectureMeasurements(project).map(row => `${quote(row.name)},${row.value},${row.unit}`)].join('\r\n') });
      if (project.metadata.designBrief) files.push({ name: 'render-handoff.json', data: JSON.stringify(createGenerationPlan(project), null, 2) });
      const canvas = getCanvas();
      if (canvas) {
        const rooms = project.building.rooms.filter(room => room.type !== 'hallway');
        for (const [index, room] of rooms.entries()) {
          deliveryStatus.textContent = `Capturing room ${index + 1} of ${rooms.length}…`; await frame();
          if (engine.revision !== packageRevision) throw new Error('Your home changed during export. Download the package again.');
          const data = canvas.captureRoomView(room.id); files.push({ name: `views/${room.id}.png`, data: await (await fetch(data)).blob() });
        }
        files.push({ name: 'views/exterior.png', data: await (await fetch(canvas.captureExteriorView('street', 1920, 1080))).blob() });
      }
      files.push({ name: 'README.txt', data: 'Nopple concept design. Plans and dimensions derive from the editable home.mopple model. Images are local 3D scene captures, not AI images. This package is not a construction drawing set. Open home.mopple in Nopple Studio to continue editing.' });
      deliveryStatus.textContent = 'Preparing your home package…'; download(await archiveFiles(files), 'mopple-home.zip'); deliveryStatus.textContent = 'Home package downloaded.';
    } catch (error) { deliveryStatus.textContent = error instanceof Error ? error.message : String(error); }
    finally { packageButton.disabled = false; }
  };
  let packageRevision = engine.revision;
  packageButton.addEventListener('click', () => packageRevision = engine.revision, { capture: true });
  document.querySelector('#btn-history')?.addEventListener('click', async () => {
    const root = history.querySelector('#history-list')!; root.replaceChildren(); history.querySelector('#history-status')!.textContent = '';
    try {
      await saveHome(engine.getSnapshot());
      const home = localHomes().find(home => home.id === engine.getSnapshot().project.id);
      const versions = home?.versions ?? [];
      for (const [index, model] of versions.entries()) {
        const row = document.createElement('article'); row.className = 'history-row';
        const image = new Image(); image.src = planCanvas(model).toDataURL(); image.alt = `Version ${index + 1} plan`;
        const description = document.createElement('div'); const title = document.createElement('strong'); title.textContent = model.project.name; const time = document.createElement('p'); time.textContent = new Date(model.project.updatedAt).toLocaleString(); description.append(title, time);
        const restore = document.createElement('button'); restore.className = 'btn btn-secondary'; restore.textContent = 'Restore'; restore.onclick = () => {
          try { applyDesignPreview(engine, { project: model, revision: engine.revision, title: 'Restore version', changes: 1 }); history.close(); report('Version restored. Undo is available.', 'success'); }
          catch (error) { history.querySelector('#history-status')!.textContent = String(error); }
        };
        row.append(image, description, restore); root.append(row);
      }
      if (!versions.length) root.textContent = 'Your first version is saved. Previous designs will appear here after you make changes.';
    } catch (error) { history.querySelector('#history-status')!.textContent = error instanceof Error ? error.message : String(error); }
    open(history);
  });

  const sync = () => {
    const project = engine.getSnapshot(), brief = project.metadata.designBrief;
    const area = project.building.rooms.reduce((sum, room) => sum + polygonArea(roomPolygon(project, room)), 0);
    const summary = document.querySelector('#studio-brief-summary');
    if (summary) summary.innerHTML = `<dl><div><dt>Floor area</dt><dd>${area.toFixed(0)} m²</dd></div><div><dt>Levels</dt><dd>${project.building.floors.length}</dd></div><div><dt>Bedrooms</dt><dd>${project.building.rooms.filter(room => room.type === 'bedroom').length}</dd></div><div><dt>Bathrooms</dt><dd>${project.building.rooms.filter(room => room.type === 'bathroom').length}</dd></div></dl><p>${escapeHtml(brief?.style ?? 'Explore this example, or create your own home.')}</p>`;
  };
  sync(); const unsubscribe = engine.subscribe(sync);
  return {
    review(preview: DesignPreview) {
      pending = preview;
      review.querySelector('#change-request')!.textContent = preview.title;
      review.querySelector('#change-error')!.textContent = '';
      const before = review.querySelector<HTMLImageElement>('#change-before')!, after = review.querySelector<HTMLImageElement>('#change-after')!;
      try { const canvas = getCanvas(); before.src = canvas?.captureAlternative(engine.getSnapshot(),preview.focusRoomId) ?? planCanvas(engine.getSnapshot()).toDataURL(); after.src = canvas?.captureAlternative(preview.project,preview.focusRoomId) ?? planCanvas(preview.project).toDataURL(); }
      catch { before.src = planCanvas(engine.getSnapshot()).toDataURL(); after.src = planCanvas(preview.project).toDataURL(); }
      review.querySelector('#change-details')!.textContent = `${preview.changes} ${preview.changes === 1 ? 'change' : 'changes'} proposed. Your saved design has not changed.`;
      open(review);
    },
    destroy() { unsubscribe(); dialogs.forEach(dialog => dialog.remove()); },
  };
}
