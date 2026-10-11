import { normalizePrompt } from './ai.ts';
import {
  BRIEF_TOPICS,
  conceptScope,
  createApprovalToken,
  designBriefSchema,
  extractBriefFromPrompt,
  generateDiscoveryQuestions,
  applyConversationalCorrection,
  type DesignBrief,
  type BriefTopicKey,
} from '../project/brief.ts';
import { createProject, MoppleProjectEngine } from '../project/engine.ts';
import { errorMessage } from './ui.ts';

const DRAFT_KEY = 'mopple_brief_draft';

interface BriefDraft {
  fields: Partial<DesignBrief>;
  conversation: Array<{ sender: 'assistant' | 'user'; text: string }>;
  references?: string[];
  updatedAt: string;
}

export function createBriefDialog(engine: MoppleProjectEngine, onCreated: () => void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'brief-dialog';
  dialog.setAttribute('aria-labelledby', 'brief-title');
  dialog.innerHTML = `
    <div class="brief-titlebar">
      <div>
        <h2 id="brief-title">Describe your home</h2>
        <span class="brief-subtitle" id="brief-status-badge">Review your layout before generating</span>
      </div>
      <button type="button" class="btn btn-secondary" id="brief-close" aria-label="Close house brief">Close</button>
    </div>

    <div id="brief-resume-banner" class="brief-resume-banner" hidden>
      <span>Found an in-progress draft from your previous session.</span>
      <div class="brief-resume-actions">
        <button type="button" class="btn btn-primary btn-sm" id="brief-btn-resume">Resume draft</button>
        <button type="button" class="btn btn-secondary btn-sm" id="brief-btn-discard">Start fresh</button>
      </div>
    </div>

    <p class="brief-intro">Describe the home you need. Fill in the details or use the guided chat. Enter “No preference” for anything you want to leave open.</p>

    <div class="brief-starters" aria-label="Starter briefs"><button type="button" class="btn btn-secondary" data-starter="compact">Compact home · 90 m²</button><button type="button" class="btn btn-secondary" data-starter="family">Family home · 220 m²</button><button type="button" class="btn btn-secondary" data-starter="courtyard">Your home · 240 m²</button></div>

    <div class="brief-view-tabs" role="tablist">
      <button type="button" class="brief-tab active" id="brief-tab-form" role="tab" aria-selected="true">Your requirements</button>
      <button type="button" class="brief-tab" id="brief-tab-chat" role="tab" aria-selected="false">Guided chat</button>
    </div>

    <!-- Guided chat Panel -->
    <div id="brief-assistant-panel" class="brief-assistant-panel" hidden>
      <div id="brief-chat-thread" class="brief-chat-thread" aria-live="polite"></div>
      <div class="brief-chat-bar">
        <input type="text" id="brief-chat-input" class="brief-chat-input" placeholder="Type a requirement, e.g. 'Add a ground-floor accessible suite and high ceilings'…" />
        <button type="button" class="btn btn-primary" id="brief-chat-submit">Send</button>
      </div>
      <div class="brief-references-section">
        <label for="brief-ref-input">Record a reference filename (files stay on your device)</label>
        <input type="file" id="brief-ref-input" accept="image/*,.pdf,.txt" class="brief-ref-file" />
        <div id="brief-ref-list" class="brief-ref-list"></div>
      </div>
    </div>

    <form id="brief-form">
      <div id="brief-questions">
        <label for="brief-request">Your original request</label>
        <textarea id="brief-request" name="request" required maxlength="4000" rows="3"></textarea>

        <div class="brief-numbers">
          <label>Area (m²)<input name="area" type="number" min="40" max="600" step="0.1" required></label>
          <label>Bedrooms<input name="bedrooms" type="number" min="1" max="8" required></label>
          <label>Bathrooms<input name="bathrooms" type="number" min="1" max="5" required></label>
          <label>Floors<input name="floors" type="number" min="1" max="5" required></label>
        </div>

        ${BRIEF_TOPICS.map(({ key, label, hint }) => `
          <label for="brief-${key}">${label}</label>
          <textarea id="brief-${key}" name="${key}" required maxlength="1000" rows="2" placeholder="${hint}"></textarea>
        `).join('')}
      </div>

      <section id="brief-review" hidden aria-labelledby="brief-review-title">
        <h3 id="brief-review-title" tabindex="-1">Review your house brief</h3>
        <dl id="brief-summary"></dl>

        <div class="brief-approval-box">
          <div class="brief-approval-header">

            <strong>Your reviewed brief</strong>
          </div>
          <p id="brief-token-preview" class="brief-token-text">The reviewed requirements will be saved with your home.</p>
        </div>

        <h3>What the layout will include</h3>
        <ul id="brief-scope"></ul>
        <p>Your requirements stay with the home. You can undo the generated layout if you want to return to your previous design.</p>
        <label class="brief-confirm">
          <input id="brief-confirm" type="checkbox"> I reviewed the brief and approve generating the architecture.
        </label>
      </section>

      <p id="brief-error" role="alert"></p>

      <div class="brief-actions">
        <button type="button" class="btn btn-secondary" id="brief-cancel">Cancel</button>
        <button type="button" class="btn btn-secondary" id="brief-back" hidden>Edit answers</button>
        <button class="btn btn-primary" id="brief-next" type="submit">Review brief</button>
      </div>
    </form>`;

  document.body.append(dialog);

  const get = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const form = get<HTMLFormElement>('brief-form');
  const review = get<HTMLElement>('brief-review');
  const confirmation = get<HTMLInputElement>('brief-confirm');
  const tabForm = get<HTMLButtonElement>('brief-tab-form');
  const tabChat = get<HTMLButtonElement>('brief-tab-chat');
  const assistantPanel = get<HTMLElement>('brief-assistant-panel');
  const chatThread = get<HTMLElement>('brief-chat-thread');
  const chatInput = get<HTMLInputElement>('brief-chat-input');
  const chatSubmit = get<HTMLButtonElement>('brief-chat-submit');
  const refInput = get<HTMLInputElement>('brief-ref-input');
  const refList = get<HTMLElement>('brief-ref-list');
  const resumeBanner = get<HTMLElement>('brief-resume-banner');

  let approved: DesignBrief | null = null;
  let revision = engine.revision;
  let createNew = false;
  let trigger: HTMLElement | null = null;
  let conversation: Array<{ sender: 'assistant' | 'user'; text: string }> = [];
  let attachedRefs: string[] = [];

  function saveDraft() {
    try {
      const formData = new FormData(form);
      const fields: Record<string, string | number> = {};
      for (const [k, v] of formData.entries()) {
        fields[k] = ['area', 'bedrooms', 'bathrooms', 'floors'].includes(k) ? Number(v) : String(v);
      }
      const draft: BriefDraft = {
        fields,
        conversation,
        references: attachedRefs,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage unavailable or quota exceeded
    }
  }

  function loadDraft(): BriefDraft | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  function appendChatMessage(sender: 'assistant' | 'user', text: string) {
    conversation.push({ sender, text });
    const msg = document.createElement('div');
    msg.className = `brief-chat-msg ${sender}`;
    msg.textContent = text;
    chatThread.appendChild(msg);
    chatThread.scrollTop = chatThread.scrollHeight;
    saveDraft();
  }

  function updateStatusBadge() {
    const fields = new FormData(form);
    let filledCount = 0;
    for (const topic of BRIEF_TOPICS) {
      const val = fields.get(topic.key);
      if (val && String(val).trim()) filledCount++;
    }
    const badge = get('brief-status-badge');
    badge.textContent = `${filledCount} of ${BRIEF_TOPICS.length} requirement areas defined`;
  }

  function edit() {
    approved = null;
    confirmation.checked = false;
    get('brief-questions').hidden = false;
    review.hidden = true;
    get('brief-back').hidden = true;
    get('brief-next').textContent = 'Review brief';
    get('brief-error').textContent = '';
    tabForm.classList.add('active');
    tabChat.classList.remove('active');
    assistantPanel.hidden = true;
  }

  tabForm.addEventListener('click', () => {
    tabForm.classList.add('active');
    tabChat.classList.remove('active');
    tabForm.setAttribute('aria-selected', 'true');
    tabChat.setAttribute('aria-selected', 'false');
    get('brief-questions').hidden = false;
    assistantPanel.hidden = true;
  });

  tabChat.addEventListener('click', () => {
    tabChat.classList.add('active');
    tabForm.classList.remove('active');
    tabChat.setAttribute('aria-selected', 'true');
    tabForm.setAttribute('aria-selected', 'false');
    get('brief-questions').hidden = true;
    assistantPanel.hidden = false;
    chatInput.focus();
  });

  // Handle conversational replies
  function handleChatSubmit() {
    const text = chatInput.value.trim();
    if (!text) return;
    appendChatMessage('user', text);
    chatInput.value = '';

    const current: Partial<DesignBrief> = {};
    const formData = new FormData(form);
    for (const [k, v] of formData.entries()) {
      (current as Record<string, unknown>)[k] = ['area', 'bedrooms', 'bathrooms', 'floors'].includes(k) ? Number(v) : String(v);
    }

    const { updated, notes } = applyConversationalCorrection(current, text);

    // Sync back to form inputs
    for (const [k, v] of Object.entries(updated)) {
      const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${k}"]`);
      if (el && v !== undefined && v !== null) {
        el.value = String(v);
      }
    }
    updateStatusBadge();

    // Check what is still missing
    const { missing, conflicts } = extractBriefFromPrompt(updated.request || '', updated);
    const questions = generateDiscoveryQuestions(missing, conflicts);

    const reply = notes.length > 0
      ? `Understood: ${notes.join(', ')}.\n\n${questions.length > 0 ? `Next question: ${questions[0]}` : 'All major requirements are now captured! Switch to Your requirements or click Review Brief to proceed.'}`
      : (questions[0] ?? 'Got it. Is there anything else you would like to include?');

    appendChatMessage('assistant', reply);
  }

  chatSubmit.addEventListener('click', handleChatSubmit);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleChatSubmit();
    }
  });

  // File Reference Handling
  refInput.addEventListener('change', () => {
    const file = refInput.files?.[0];
    if (!file) return;
    const item = document.createElement('div');
    item.className = 'brief-ref-item';
    item.textContent = `Reference note: ${file.name} (${Math.round(file.size / 1024)} KB)`;
    refList.appendChild(item);
    attachedRefs.push(file.name);
    appendChatMessage('user', `Attached reference: ${file.name}`);
    refInput.value = '';
    saveDraft();
  });

  form.addEventListener('input', () => {
    updateStatusBadge();
    saveDraft();
  });

  dialog.querySelectorAll<HTMLButtonElement>('[data-starter]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.starter;
    const fields = {
      request: id === 'compact' ? 'A compact 90 m² home with 2 bedrooms and 1 bathroom' : id === 'family' ? 'A two-floor 220 m² family home with 4 bedrooms and 2 bathrooms' : 'A two-floor 240 m² home with 3 bedrooms, 2 bathrooms, an office and courtyard',
      area: id === 'compact' ? 90 : id === 'family' ? 220 : 240,
      bedrooms: id === 'family' ? 4 : id === 'compact' ? 2 : 3,
      bathrooms: id === 'compact' ? 1 : 2,
      floors: id === 'compact' ? 1 : 2,
      style: 'Warm modern', site: 'No preference', household: 'No preference',
      spaces: id === 'courtyard' ? 'Home office and courtyard garden' : 'No preference',
      materials: 'Natural oak and warm plaster', budget: 'No preference', lighting: 'Natural daylight', interiorViews: 'Living room, bedrooms and exterior',
    };
    edit();
    for (const [name, value] of Object.entries(fields)) { const element = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`); if(element)element.value = String(value); }
    attachedRefs = []; refList.replaceChildren(); saveDraft(); updateStatusBadge();
  }));

  get('brief-close').addEventListener('click', () => dialog.close());
  get('brief-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => trigger?.focus());
  get('brief-back').addEventListener('click', () => { edit(); get('brief-request').focus(); });

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      if (!approved) {
        const fields = Object.fromEntries(new FormData(form));
        const parsed = designBriefSchema.parse({
          ...fields,
          ...Object.fromEntries(['area', 'bedrooms', 'bathrooms', 'floors'].map(key => [key, Number(fields[key])])),
          references: attachedRefs.length > 0 ? attachedRefs : undefined,
        });

        const token = createApprovalToken(parsed);
        approved = {
          ...parsed,
          approvalToken: token,
          approvedAt: new Date().toISOString(),
        };

        const summary = get('brief-summary');
        summary.replaceChildren();
        const rows: [string, string][] = [
          ['Request', approved.request],
          ['Size & rooms', `${approved.area} m² · ${approved.bedrooms} bedrooms · ${approved.bathrooms} bathrooms · ${approved.floors} floors`],
          ['Approval Token', approved.approvalToken!],
          ...BRIEF_TOPICS.map(({ key, label }): [string, string] => [label, (approved as Record<string, any>)[key]]),
        ];
        if (approved.references?.length) {
          rows.push(['References', approved.references.join(', ')]);
        }

        for (const [label, answer] of rows) {
          const dt = document.createElement('dt'), dd = document.createElement('dd');
          dt.textContent = label;
          dd.textContent = answer;
          summary.append(dt, dd);
        }

        get('brief-token-preview').textContent = `Requirements reviewed at ${new Date().toLocaleTimeString()}. Saved with this home.`;

        get('brief-scope').replaceChildren(...conceptScope(approved).map(message => {
          const li = document.createElement('li');
          li.textContent = message;
          return li;
        }));

        get('brief-questions').hidden = true;
        assistantPanel.hidden = true;
        review.hidden = false;
        get('brief-back').hidden = false;
        get('brief-next').textContent = 'Create architecture';
        dialog.scrollTop = 0;
        get('brief-review-title').focus();
        return;
      }

      if (!confirmation.checked) throw new Error('Review the brief and check the confirmation before creating the concept.');
      if (engine.revision !== revision) throw new Error('The project changed. Close and reopen the brief before replacing the current design.');

      // Atomic commit: creates house geometry and saves verified brief with approval token
      const target = createNew ? new MoppleProjectEngine(createProject(approved.spaces.toLowerCase().includes('courtyard') ? 'Your home' : 'My new home')) : engine;
      target.applyOperations({
        operations: [
          { type: 'update_design_brief', brief: approved },
          {
            type: 'create_house',
            area: approved.area,
            bedrooms: approved.bedrooms,
            bathrooms: approved.bathrooms,
            style: approved.style.slice(0, 200),
            floors: approved.floors,
            spaces: approved.spaces,
            household: approved.household,
          },
        ],
      });

      if (createNew) engine.importProject(target.saveProject());
      clearDraft();
      dialog.close();
      onCreated();
    } catch (error) {
      get('brief-error').textContent = errorMessage(error);
    }
  });

  return {
    dialog,
    open(request?: string, newHome = false) {
      createNew = newHome;
      edit();
      revision = engine.revision;
      trigger = document.activeElement as HTMLElement | null;

      const savedProject = createNew ? undefined : engine.getSnapshot().metadata.designBrief;
      const existingDraft = loadDraft();

      if (existingDraft && (!request || request === existingDraft.fields.request)) {
        resumeBanner.hidden = false;
        get('brief-btn-resume').onclick = () => {
          resumeBanner.hidden = true;
          for (const [k, v] of Object.entries(existingDraft.fields)) {
            const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${k}"]`);
            if (el && v !== undefined) el.value = String(v);
          }
          conversation = existingDraft.conversation || [];
          chatThread.replaceChildren();
          for (const m of conversation) {
            const el = document.createElement('div');
            el.className = `brief-chat-msg ${m.sender}`;
            el.textContent = m.text;
            chatThread.appendChild(el);
          }
          attachedRefs = existingDraft.references || [];
          updateStatusBadge();
        };
        get('brief-btn-discard').onclick = () => {
          clearDraft();
          resumeBanner.hidden = true;
        };
      } else {
        resumeBanner.hidden = true;
      }

      const text = request ?? savedProject?.request ?? '';
      const extracted = extractBriefFromPrompt(normalizePrompt(text), savedProject ?? {});

      const values: Record<string, unknown> = {
        area: extracted.brief.area ?? 150,
        bedrooms: extracted.brief.bedrooms ?? 3,
        bathrooms: extracted.brief.bathrooms ?? 2,
        floors: extracted.brief.floors ?? 1,
        ...extracted.brief,
        request: text,
      };

      for (const element of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[name]')) {
        element.value = String(values[element.name] ?? '');
      }

      // Initial conversational thread greeting
      chatThread.replaceChildren();
      conversation = [];
      const questions = generateDiscoveryQuestions(extracted.missing, extracted.conflicts);
      appendChatMessage(
        'assistant',
        `Your starting brief: ${values.area} m², ${values.bedrooms} bedrooms and ${values.bathrooms} bathrooms.\n\n` +
        (questions.length > 0
          ? `To make sure the design fits your vision, could you answer: ${questions[0]}`
          : 'The main details are filled in. Add any other requirements, or review your brief.')
      );

      updateStatusBadge();
      dialog.showModal();
      get('brief-request').focus();
    },
    destroy() {
      dialog.remove();
    },
  };
}
