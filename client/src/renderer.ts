import type { BingoState } from './bingo.ts';
import { isFreeSpace, getMarkedCount } from './bingo.ts';
import { createWordEditor } from './word-editor.ts';
import type { WordEditor } from './word-editor.ts';

export interface RenderCallbacks {
  onCellClick: (index: number) => void;
  onNewGame: () => void;
  onReset: () => void;
  onGroupSelect: (groupId: string) => void;
}

let boardEl: HTMLDivElement;
let statusEl: HTMLDivElement;
let countEl: HTMLSpanElement;
let bingosEl: HTMLSpanElement;
let bannerEl: HTMLDivElement;
let bannerSubEl: HTMLDivElement;
let groupSelectorEl: HTMLDivElement;
let gameViewEl: HTMLDivElement;

export function mountApp(container: HTMLElement, callbacks: RenderCallbacks): void {
  container.innerHTML = `
    <header>
      <div class="badge">⚠ DiIT / Komax Group ⚠</div>
      <h1>BULLSHIT<br><span>BINGO</span></h1>
      <div class="subtitle">// Smart Factory Edition · Klick auf ein Feld wenn du es hörst</div>
    </header>

    <div id="group-selector" class="group-selector"></div>

    <div id="game-view" class="game-view hidden">
      <div class="controls">
        <button class="primary" id="btn-new">⟳ Neues Spiel</button>
        <button id="btn-reset">✕ Reset</button>
        <button id="btn-groups">☰ Gruppen</button>
      </div>

      <div class="counter">Markiert: <span id="count">0</span> / 24 &nbsp;|&nbsp; Bingos: <span id="bingos">0</span></div>

      <div class="bingo-banner" id="bingo-banner">🎉 BINGO! 🎉</div>
      <div class="bingo-sub" id="bingo-sub">Jetzt kannst du aufhören zuzuhören.</div>

      <div class="board-status" id="board-status"></div>
      <div class="board" id="board"></div>
    </div>

    <footer>
      Dieses Spiel ist rein satirisch und dient der psychischen Selbstverteidigung.<br>
      Alle Buzzwords basieren auf wahren Begebenheiten. Keine Haftung für unkontrolliertes Augenrollen.
    </footer>
  `;

  groupSelectorEl = container.querySelector<HTMLDivElement>('#group-selector')!;
  gameViewEl = container.querySelector<HTMLDivElement>('#game-view')!;
  boardEl = container.querySelector<HTMLDivElement>('#board')!;
  statusEl = container.querySelector<HTMLDivElement>('#board-status')!;
  countEl = container.querySelector<HTMLSpanElement>('#count')!;
  bingosEl = container.querySelector<HTMLSpanElement>('#bingos')!;
  bannerEl = container.querySelector<HTMLDivElement>('#bingo-banner')!;
  bannerSubEl = container.querySelector<HTMLDivElement>('#bingo-sub')!;

  container.querySelector<HTMLButtonElement>('#btn-new')!.addEventListener('click', callbacks.onNewGame);
  container.querySelector<HTMLButtonElement>('#btn-reset')!.addEventListener('click', callbacks.onReset);

  // Store callback for cell clicks
  boardEl.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
    if (!cell) return;
    const index = Number(cell.dataset.index);
    if (!isFreeSpace(index)) {
      callbacks.onCellClick(index);
    }
  });

  // Delegate group card clicks
  groupSelectorEl.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.group-card');
    if (!card) return;
    const groupId = card.dataset.groupId;
    if (groupId) callbacks.onGroupSelect(groupId);
  });
}

export function renderBoard(state: BingoState): void {
  boardEl.innerHTML = '';

  for (let i = 0; i < state.board.length; i++) {
    const phrase = state.board[i];
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = String(i);

    if (isFreeSpace(i)) cell.classList.add('free');
    if (state.marked.has(i)) cell.classList.add('marked');
    if (state.bingoIndexes.has(i)) cell.classList.add('bingo-line');

    const text = document.createElement('div');
    text.className = 'cell-text';
    text.textContent = phrase;

    const check = document.createElement('span');
    check.className = 'check';
    check.textContent = '✓';

    cell.appendChild(text);
    cell.appendChild(check);
    boardEl.appendChild(cell);
  }

  updateStatus(state);
}

export function updateCell(state: BingoState, index: number): void {
  const cell = boardEl.querySelector<HTMLElement>(`[data-index="${index}"]`);
  if (!cell) return;
  cell.classList.toggle('marked', state.marked.has(index));
  cell.classList.toggle('bingo-line', state.bingoIndexes.has(index));

  // Also update any other cells that might be part of a bingo line
  for (let i = 0; i < state.board.length; i++) {
    if (i === index) continue;
    const otherCell = boardEl.querySelector<HTMLElement>(`[data-index="${i}"]`);
    if (!otherCell) continue;
    otherCell.classList.toggle('bingo-line', state.bingoIndexes.has(i));
  }

  updateStatus(state);
}

function updateStatus(state: BingoState): void {
  countEl.textContent = String(getMarkedCount(state));
  bingosEl.textContent = String(state.bingoCount);

  const hasBingo = state.bingoCount > 0;
  bannerEl.classList.toggle('visible', hasBingo);
  bannerSubEl.classList.toggle('visible', hasBingo);
}

export function showLoading(): void {
  boardEl.innerHTML = '';
  statusEl.textContent = 'Lade Spielfeld…';
  statusEl.className = 'board-status loading';
}

export function showError(message: string): void {
  boardEl.innerHTML = '';
  statusEl.textContent = message;
  statusEl.className = 'board-status error';
}

export function clearStatus(): void {
  statusEl.textContent = '';
  statusEl.className = 'board-status';
}

export interface GroupDisplayInfo {
  id: string;
  name: string;
  description: string;
  wordCount: number;
}

export function showGroupList(
  groups: GroupDisplayInfo[],
  callbacks: { onPlay: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string, name: string) => void; onCreate: () => void },
): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');

  if (groups.length === 0) {
    groupSelectorEl.innerHTML = `
      <div class="group-list-header">
        <div class="group-selector-title">Wortgruppen</div>
        <button class="primary group-create-btn" id="btn-create-group">+ Neue Gruppe</button>
      </div>
      <div class="group-selector-status">Keine Wortgruppen gefunden.</div>
    `;
    groupSelectorEl.querySelector<HTMLButtonElement>('#btn-create-group')!.addEventListener('click', callbacks.onCreate);
    return;
  }

  groupSelectorEl.innerHTML = `
    <div class="group-list-header">
      <div class="group-selector-title">Wortgruppen</div>
      <button class="primary group-create-btn" id="btn-create-group">+ Neue Gruppe</button>
    </div>
    <div class="group-cards">
      ${groups.map(g => `
        <div class="group-card" data-group-id="${escapeHtml(g.id)}">
          <div class="group-card-name">${escapeHtml(g.name)}</div>
          <div class="group-card-desc">${escapeHtml(g.description || 'Keine Beschreibung')}</div>
          <div class="group-card-count">${g.wordCount} Wörter</div>
          <div class="group-card-actions">
            <button class="group-action-btn group-action-play" data-action="play">▶ Spielen</button>
            <button class="group-action-btn group-action-edit" data-action="edit">✎ Bearbeiten</button>
            <button class="group-action-btn group-action-delete" data-action="delete">✕ Löschen</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-create-group')!.addEventListener('click', callbacks.onCreate);

  groupSelectorEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const card = btn.closest<HTMLElement>('.group-card');
    if (!card) return;
    const groupId = card.dataset.groupId;
    if (!groupId) return;

    const action = btn.dataset.action;
    if (action === 'play') callbacks.onPlay(groupId);
    else if (action === 'edit') callbacks.onEdit(groupId);
    else if (action === 'delete') {
      const name = card.querySelector('.group-card-name')?.textContent ?? '';
      callbacks.onDelete(groupId, name);
    }
  });
}

/** @deprecated Use showGroupList instead — kept for game flow compatibility */
export function showGroupSelector(groups: GroupDisplayInfo[]): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');

  if (groups.length === 0) {
    groupSelectorEl.innerHTML = `
      <div class="group-selector-status">Keine Wortgruppen gefunden.</div>
    `;
    return;
  }

  groupSelectorEl.innerHTML = `
    <div class="group-selector-title">Wähle eine Wortgruppe</div>
    <div class="group-cards">
      ${groups.map(g => `
        <div class="group-card" data-group-id="${g.id}">
          <div class="group-card-name">${g.name}</div>
          <div class="group-card-desc">${g.description || 'Keine Beschreibung'}</div>
          <div class="group-card-count">${g.wordCount} Wörter</div>
        </div>
      `).join('')}
    </div>
  `;
}

export function showDeleteConfirmDialog(
  groupName: string,
  onConfirm: () => void,
  onCancel: () => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog">
      <div class="dialog-title">Gruppe löschen</div>
      <div class="dialog-message">
        Bist du sicher, dass du <strong>${escapeHtml(groupName)}</strong> löschen möchtest?<br>
        Dies kann nicht rückgängig gemacht werden.
      </div>
      <div class="dialog-actions">
        <button class="dialog-btn-cancel" id="dialog-cancel">Abbrechen</button>
        <button class="dialog-btn-confirm" id="dialog-confirm">Löschen</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cleanup = () => {
    overlay.remove();
  };

  overlay.querySelector('#dialog-cancel')!.addEventListener('click', () => {
    cleanup();
    onCancel();
  });

  overlay.querySelector('#dialog-confirm')!.addEventListener('click', () => {
    cleanup();
    onConfirm();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cleanup();
      onCancel();
    }
  });
}

export interface GroupFormCallbacks {
  onSubmit: (data: { name: string; description: string; words: string[] }) => Promise<void>;
  onCancel: () => void;
}

export function showGroupCreateForm(callbacks: GroupFormCallbacks): void {
  showGroupForm({ title: 'Neue Gruppe', callbacks });
}

export interface GroupEditFormOptions {
  initialName: string;
  initialDescription: string;
  initialWords: string[];
  callbacks: GroupFormCallbacks;
}

export function showGroupEditForm(options: GroupEditFormOptions): void {
  showGroupForm({
    title: 'Gruppe bearbeiten',
    initialName: options.initialName,
    initialDescription: options.initialDescription,
    initialWords: options.initialWords,
    callbacks: options.callbacks,
  });
}

function showGroupForm(options: {
  title: string;
  initialName?: string;
  initialDescription?: string;
  initialWords?: string[];
  callbacks: GroupFormCallbacks;
}): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');

  const { title, initialName = '', initialDescription = '', initialWords = [], callbacks } = options;
  let submitting = false;
  let wordEditor: WordEditor | null = null;

  function render(): void {
    groupSelectorEl.innerHTML = `
      <div class="form-container">
        <div class="form-header">
          <div class="group-selector-title">${escapeHtml(title)}</div>
          <button class="form-cancel-btn" id="form-cancel">← Zurück</button>
        </div>

        <div class="form-field">
          <label class="form-label" for="group-name">Name *</label>
          <input class="form-input" type="text" id="group-name" placeholder="z.B. Smart Factory Buzzwords" maxlength="100" />
          <div class="form-error hidden" id="name-error"></div>
        </div>

        <div class="form-field">
          <label class="form-label" for="group-desc">Beschreibung</label>
          <input class="form-input" type="text" id="group-desc" placeholder="Optionale Beschreibung" maxlength="200" />
        </div>

        <div class="form-field">
          <label class="form-label">Wörter</label>
          <div id="word-editor-mount"></div>
        </div>

        <div class="form-error hidden" id="submit-error"></div>

        <div class="form-actions">
          <button id="form-cancel-btn">Abbrechen</button>
          <button class="primary" id="form-submit" ${submitting ? 'disabled' : ''}>
            ${submitting ? 'Speichern…' : '✓ Speichern'}
          </button>
        </div>
      </div>
    `;

    // Restore form values
    const nameEl = groupSelectorEl.querySelector<HTMLInputElement>('#group-name')!;
    const descEl = groupSelectorEl.querySelector<HTMLInputElement>('#group-desc')!;
    nameEl.value = cachedName;
    descEl.value = cachedDesc;

    // Mount word editor
    const mountPoint = groupSelectorEl.querySelector<HTMLDivElement>('#word-editor-mount')!;
    const currentWords = wordEditor ? wordEditor.getWords() : initialWords;
    wordEditor = createWordEditor({
      container: mountPoint,
      initialWords: currentWords,
    });

    attachFormEvents();
  }

  let cachedName = initialName;
  let cachedDesc = initialDescription;

  function attachFormEvents(): void {
    // Cancel buttons
    groupSelectorEl.querySelector('#form-cancel')!.addEventListener('click', callbacks.onCancel);
    groupSelectorEl.querySelector('#form-cancel-btn')!.addEventListener('click', callbacks.onCancel);

    // Submit
    groupSelectorEl.querySelector('#form-submit')!.addEventListener('click', async () => {
      const nameEl = groupSelectorEl.querySelector<HTMLInputElement>('#group-name')!;
      const descEl = groupSelectorEl.querySelector<HTMLInputElement>('#group-desc')!;
      const nameError = groupSelectorEl.querySelector<HTMLDivElement>('#name-error')!;
      const submitError = groupSelectorEl.querySelector<HTMLDivElement>('#submit-error')!;

      // Clear errors
      nameError.classList.add('hidden');
      submitError.classList.add('hidden');
      wordEditor!.clearError();

      const name = nameEl.value.trim();
      const description = descEl.value.trim();

      // Client-side validation
      let valid = true;
      if (!name) {
        nameError.textContent = 'Name ist erforderlich';
        nameError.classList.remove('hidden');
        valid = false;
      }
      if (!wordEditor!.isValid()) {
        wordEditor!.showError(`Mindestens 24 Wörter erforderlich (aktuell: ${wordEditor!.getCount()})`);
        valid = false;
      }
      if (!valid) return;

      submitting = true;
      cachedName = name;
      cachedDesc = description;
      render();

      try {
        await callbacks.onSubmit({ name, description, words: wordEditor!.getWords() });
      } catch (err) {
        submitting = false;
        cachedName = name;
        cachedDesc = description;
        render();
        const submitErr = groupSelectorEl.querySelector<HTMLDivElement>('#submit-error')!;
        submitErr.textContent = err instanceof Error ? err.message : 'Unbekannter Fehler';
        submitErr.classList.remove('hidden');
      }
    });
  }

  render();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function showGroupSelectorLoading(): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');
  groupSelectorEl.innerHTML = `
    <div class="group-selector-status loading">Lade Gruppen…</div>
  `;
}

export function showGroupSelectorError(message: string): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');
  groupSelectorEl.innerHTML = `
    <div class="group-selector-status error">${message}</div>
  `;
}

export function showGameView(onBackToGroups: () => void): void {
  groupSelectorEl.classList.add('hidden');
  gameViewEl.classList.remove('hidden');

  const btnGroups = gameViewEl.querySelector<HTMLButtonElement>('#btn-groups')!;
  // Replace to remove old listeners
  const newBtn = btnGroups.cloneNode(true) as HTMLButtonElement;
  btnGroups.parentNode!.replaceChild(newBtn, btnGroups);
  newBtn.addEventListener('click', onBackToGroups);
}
