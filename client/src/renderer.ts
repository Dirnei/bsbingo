import type { BingoState } from './bingo.ts';
import { isFreeSpace, getMarkedCount } from './bingo.ts';
import { createWordEditor } from './word-editor.ts';
import type { WordEditor } from './word-editor.ts';
import type { UserInfo } from './api.ts';

export interface MultiplayerPlayerInfo {
  playerId: string;
  displayName: string;
  isHost: boolean;
  markedCount: number;
  bingoCount: number;
  gravatarHash?: string | null;
}

export interface ChatMessageInfo {
  playerId: string;
  displayName: string;
  gravatarHash?: string | null;
  text: string;
  timestamp: number;
}

export interface LobbySettings {
  allowMultipleBingos: boolean;
  autoSelect: boolean;
}

export interface MarkHistoryEntry {
  playerId: string;
  displayName: string;
  word: string;
  timestamp: number;
}

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
let headerUserMenuEl: HTMLDivElement;
let groupListAbortController: AbortController | null = null;

export function mountApp(container: HTMLElement, callbacks: RenderCallbacks): void {
  container.innerHTML = `
    <header>
      <div class="header-top">
        <div class="badge">⚠ LEBERKAS ORG EDITION ⚠</div>
        <div class="header-user-menu" id="header-user-menu"></div>
      </div>
      <h1>BULLSHIT<br><span>BINGO</span></h1>
      <div class="subtitle">// Bullshit Edition · Klick auf ein Feld wenn du es hörst</div>
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
      <div class="footer-links">
        <a href="https://github.com/Dirnei/bsbingo" target="_blank" rel="noopener noreferrer" class="github-badge">
          <img src="https://img.shields.io/github/stars/Dirnei/bsbingo?style=social" alt="GitHub">
        </a>
        <span class="footer-sep">·</span>
        <a href="#/impressum">Impressum</a>
        <span class="footer-sep">·</span>
        <a href="#/datenschutz">Datenschutzerklärung</a>
      </div>
    </footer>
  `;

  headerUserMenuEl = container.querySelector<HTMLDivElement>('#header-user-menu')!;
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

  // Group card clicks are handled by showGroupList's action buttons
}

export interface HeaderAuthCallbacks {
  onSignIn: () => void;
  onSignOut: () => void;
}

export async function updateHeaderAuth(user: UserInfo | null, callbacks: HeaderAuthCallbacks): Promise<void> {
  if (!user) {
    headerUserMenuEl.innerHTML = `
      <button class="header-signin-btn" id="header-signin">Sign In</button>
    `;
    headerUserMenuEl.querySelector<HTMLButtonElement>('#header-signin')!.addEventListener('click', callbacks.onSignIn);
    return;
  }

  const avatarUrl = user.avatar || await gravatarUrl(user.email);
  const avatarHtml = avatarUrl
    ? `<img class="header-avatar" src="${escapeHtml(avatarUrl)}" alt="" />`
    : `<div class="header-avatar header-avatar-placeholder">${escapeHtml(user.name.charAt(0).toUpperCase())}</div>`;

  headerUserMenuEl.innerHTML = `
    <button class="header-user-btn" id="header-user-btn">
      ${avatarHtml}
      <span class="header-username">${escapeHtml(user.name)}</span>
      <span class="header-caret">▾</span>
    </button>
    <div class="header-dropdown hidden" id="header-dropdown">
      <button class="header-dropdown-item header-dropdown-signout" id="header-signout">Abmelden</button>
    </div>
  `;

  const userBtn = headerUserMenuEl.querySelector<HTMLButtonElement>('#header-user-btn')!;
  const dropdown = headerUserMenuEl.querySelector<HTMLDivElement>('#header-dropdown')!;

  userBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    dropdown.classList.add('hidden');
  }, { once: false });

  headerUserMenuEl.querySelector<HTMLButtonElement>('#header-signout')!.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    callbacks.onSignOut();
  });
}

export function renderBoard(state: BingoState): void {
  boardEl.innerHTML = '';
  boardEl.classList.toggle('locked', state.locked);

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
  boardEl.classList.toggle('locked', state.locked);

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
  createdBy: string | null;
  createdByName: string | null;
  visibility: string;
  inviteToken: string | null;
  sharedWith: string[] | null;
  starCount: number;
  isStarred: boolean;
}

function bindJoinLobbyListeners(container: HTMLElement, onJoinLobby?: (code: string, displayName: string) => void, loggedInName?: string): void {
  const joinBtn = container.querySelector<HTMLButtonElement>('#btn-join-lobby');
  const joinCodeInput = container.querySelector<HTMLInputElement>('#lobby-join-code');
  const joinNameInput = container.querySelector<HTMLInputElement>('#lobby-join-name');
  const joinError = container.querySelector<HTMLDivElement>('#lobby-join-error');

  joinCodeInput?.addEventListener('input', () => {
    joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  function attemptJoinLobby(): void {
    if (!joinCodeInput || !joinError || !onJoinLobby) return;

    const code = joinCodeInput.value.trim().toUpperCase();
    const displayName = loggedInName ?? joinNameInput?.value.trim() ?? '';

    joinError.classList.add('hidden');

    if (!code || code.length < 4) {
      joinError.textContent = 'Bitte gib einen gültigen Lobby-Code ein.';
      joinError.classList.remove('hidden');
      return;
    }
    if (!displayName) {
      joinError.textContent = 'Bitte gib deinen Namen ein.';
      joinError.classList.remove('hidden');
      return;
    }

    onJoinLobby(code, displayName);
  }

  joinBtn?.addEventListener('click', attemptJoinLobby);
  joinCodeInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptJoinLobby(); });
  joinNameInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptJoinLobby(); });
}

export function showGroupList(
  groups: GroupDisplayInfo[],
  callbacks: { onPlay: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string, name: string) => void; onCreate: () => void; onShare?: (id: string) => void; onStar?: (id: string) => void; onJoinLobby?: (code: string, displayName: string) => void },
  currentUserId?: string | null,
  currentUserName?: string | null,
): void {
  const loggedInName = currentUserId && currentUserName ? currentUserName : undefined;
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');

  if (groups.length === 0) {
    groupSelectorEl.innerHTML = `
      <div class="group-list-header">
        <div class="group-selector-title">Wortgruppen</div>
        ${currentUserId ? '<button class="primary group-create-btn" id="btn-create-group">+ Neue Gruppe</button>' : ''}
      </div>
      <div class="lobby-join-card">
        <div class="lobby-join-title">Lobby beitreten</div>
        <div class="lobby-join-form">
          <input class="lobby-join-input" type="text" id="lobby-join-code" placeholder="Lobby-Code (z.B. ABCD12)" maxlength="6" autocomplete="off" />
          ${!currentUserId ? '<input class="lobby-join-input" type="text" id="lobby-join-name" placeholder="Dein Name" maxlength="30" autocomplete="off" />' : ''}
          <button class="lobby-join-btn" id="btn-join-lobby">Beitreten</button>
        </div>
        <div class="lobby-join-error hidden" id="lobby-join-error"></div>
      </div>
      <div class="group-selector-status">Keine Wortgruppen gefunden.</div>
    `;
    groupSelectorEl.querySelector<HTMLButtonElement>('#btn-create-group')?.addEventListener('click', callbacks.onCreate);
    bindJoinLobbyListeners(groupSelectorEl, callbacks.onJoinLobby, loggedInName);
    return;
  }

  const builtinGroups = groups.filter(g => g.createdBy === null);
  const myGroups = groups.filter(g => g.createdBy !== null && g.visibility === 'private' && g.createdBy === currentUserId);
  const ownPublicGroups = groups.filter(g => g.createdBy !== null && g.visibility !== 'private' && g.createdBy === currentUserId);
  const otherGroups = groups.filter(g => g.createdBy !== null && g.createdBy !== currentUserId);
  const communityGroups = [...ownPublicGroups, ...otherGroups];

  function renderCard(g: GroupDisplayInfo, showOwnerActions: boolean): string {
    const isOwner = showOwnerActions && !!currentUserId && g.createdBy === currentUserId;
    const starIcon = g.isStarred ? '★' : '☆';
    const starClass = g.isStarred ? 'group-action-star starred' : 'group-action-star';
    return `
      <div class="group-card" data-group-id="${escapeHtml(g.id)}">
        <div class="group-card-header">
          <div class="group-card-name">${escapeHtml(g.name)}${g.visibility === 'private' ? ' <span class="visibility-badge visibility-private">Privat</span>' : ''}</div>
          ${currentUserId
            ? `<button class="group-card-star-count ${starClass}" data-action="star">${starIcon} ${g.starCount}</button>`
            : `<div class="group-card-star-count">${starIcon} ${g.starCount}</div>`}
        </div>
        <div class="group-card-desc">${escapeHtml(g.description || 'Keine Beschreibung')}</div>
        <div class="group-card-meta">
          <span>${g.wordCount} Wörter</span>
          <span>${g.createdByName ? escapeHtml(g.createdByName) : 'Kein Besitzer'}</span>
        </div>
        <div class="group-card-actions">
          ${g.wordCount >= 24 ? `<button class="group-action-btn group-action-play" data-action="play">▶ Spielen</button>` : ''}
          ${isOwner && g.visibility === 'private' ? `<button class="group-action-btn group-action-share" data-action="share">🔗 Teilen</button>` : ''}
          ${isOwner ? `<button class="group-action-btn group-action-edit" data-action="edit">✎ Bearbeiten</button>` : ''}
          ${isOwner ? `<button class="group-action-btn group-action-delete" data-action="delete">✕ Löschen</button>` : ''}
        </div>
        ${isOwner && g.sharedWith && g.sharedWith.length > 0 ? `<div class="group-card-shared">${g.sharedWith.length} Nutzer haben Zugriff</div>` : ''}
      </div>
    `;
  }

  groupSelectorEl.innerHTML = `
    <div class="group-list-header">
      <div class="group-selector-title">Wortgruppen</div>
      ${currentUserId ? '<button class="primary group-create-btn" id="btn-create-group">+ Neue Gruppe</button>' : ''}
    </div>
    <div class="lobby-join-card">
      <div class="lobby-join-title">Lobby beitreten</div>
      <div class="lobby-join-form">
        <input class="lobby-join-input" type="text" id="lobby-join-code" placeholder="Lobby-Code (z.B. ABCD12)" maxlength="6" autocomplete="off" />
        ${!currentUserId ? '<input class="lobby-join-input" type="text" id="lobby-join-name" placeholder="Dein Name" maxlength="30" autocomplete="off" />' : ''}
        <button class="lobby-join-btn" id="btn-join-lobby">Beitreten</button>
      </div>
      <div class="lobby-join-error hidden" id="lobby-join-error"></div>
    </div>
    ${builtinGroups.length > 0 ? `
      <div class="group-cards">
        ${builtinGroups.map(g => renderCard(g, false)).join('')}
      </div>
    ` : ''}
    ${myGroups.length > 0 ? `
      <div class="group-section-title">Meine Gruppen</div>
      <div class="group-cards">
        ${myGroups.map(g => renderCard(g, true)).join('')}
      </div>
    ` : ''}
    ${communityGroups.length > 0 ? `
      <div class="group-section-title">Community</div>
      <div class="group-cards">
        ${communityGroups.map(g => renderCard(g, true)).join('')}
      </div>
    ` : ''}
  `;

  // Abort previous listener to prevent accumulation
  if (groupListAbortController) groupListAbortController.abort();
  groupListAbortController = new AbortController();
  const signal = groupListAbortController.signal;

  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-create-group')?.addEventListener('click', callbacks.onCreate, { signal });

  bindJoinLobbyListeners(groupSelectorEl, callbacks.onJoinLobby, loggedInName);

  groupSelectorEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const card = btn.closest<HTMLElement>('.group-card');
    if (!card) return;
    const groupId = card.dataset.groupId;
    if (!groupId) return;

    const action = btn.dataset.action;
    if (action === 'play') callbacks.onPlay(groupId);
    else if (action === 'star' && callbacks.onStar) callbacks.onStar(groupId);
    else if (action === 'share' && callbacks.onShare) callbacks.onShare(groupId);
    else if (action === 'edit') callbacks.onEdit(groupId);
    else if (action === 'delete') {
      const name = card.querySelector('.group-card-name')?.textContent ?? '';
      callbacks.onDelete(groupId, name);
    }
  }, { signal });
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
  onSubmit: (data: { name: string; description: string; words: string[]; visibility: string }) => Promise<void>;
  onCancel: () => void;
}

export function showGroupCreateForm(callbacks: GroupFormCallbacks): void {
  showGroupForm({ title: 'Neue Gruppe', callbacks });
}

export interface GroupEditFormOptions {
  initialName: string;
  initialDescription: string;
  initialWords: string[];
  initialVisibility?: string;
  callbacks: GroupFormCallbacks;
}

export function showGroupEditForm(options: GroupEditFormOptions): void {
  showGroupForm({
    title: 'Gruppe bearbeiten',
    initialName: options.initialName,
    initialDescription: options.initialDescription,
    initialWords: options.initialWords,
    initialVisibility: options.initialVisibility,
    callbacks: options.callbacks,
  });
}

function showGroupForm(options: {
  title: string;
  initialName?: string;
  initialDescription?: string;
  initialWords?: string[];
  initialVisibility?: string;
  callbacks: GroupFormCallbacks;
}): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');

  const { title, initialName = '', initialDescription = '', initialWords = [], initialVisibility = 'public', callbacks } = options;
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
          <label class="form-label">Sichtbarkeit</label>
          <div class="visibility-toggle" id="visibility-toggle">
            <button type="button" class="visibility-option ${cachedVisibility === 'public' ? 'active' : ''}" data-visibility="public">Öffentlich</button>
            <button type="button" class="visibility-option ${cachedVisibility === 'private' ? 'active' : ''}" data-visibility="private">Privat</button>
          </div>
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
  let cachedVisibility = initialVisibility;

  function attachFormEvents(): void {
    // Cancel buttons
    groupSelectorEl.querySelector('#form-cancel')!.addEventListener('click', callbacks.onCancel);
    groupSelectorEl.querySelector('#form-cancel-btn')!.addEventListener('click', callbacks.onCancel);

    // Visibility toggle
    groupSelectorEl.querySelector('#visibility-toggle')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-visibility]');
      if (!btn) return;
      cachedVisibility = btn.dataset.visibility!;
      groupSelectorEl.querySelectorAll('.visibility-option').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
    });

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
        await callbacks.onSubmit({ name, description, words: wordEditor!.getWords(), visibility: cachedVisibility });
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

export function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger reflow so the transition plays
  toast.offsetWidth;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 2500);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function gravatarFromHash(hash: string | null | undefined, size = 80): string {
  if (!hash) return '';
  return `https://gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
}

async function gravatarUrl(email: string): Promise<string> {
  if (!email) return '';
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `https://gravatar.com/avatar/${hash}?d=identicon&s=80`;
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

export function showLoginPage(callbacks: { onGitHub: () => void; onGoogle: () => void; onBack: () => void }): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');
  groupSelectorEl.innerHTML = `
    <div class="login-page">
      <button class="back-link" id="btn-back">← Zurück</button>
      <div class="login-title">Anmelden</div>
      <div class="login-subtitle">Melde dich an, um eigene Wortgruppen zu erstellen und zu verwalten.</div>
      <div class="login-buttons">
        <button class="login-btn login-btn-github" id="btn-github">
          <svg class="login-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          Mit GitHub anmelden
        </button>
        <button class="login-btn login-btn-google" id="btn-google">
          <svg class="login-icon" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.96h3.86c2.26-2.09 3.56-5.17 3.56-8.78z"/><path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.96c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.06C3.515 21.27 7.565 24 12.255 24z"/><path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.65h-3.98a11.86 11.86 0 000 10.7l3.98-3.06z"/><path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.73-10.73 6.65l3.98 3.06c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
          Mit Google anmelden
        </button>
      </div>
    </div>
  `;
  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-back')!.addEventListener('click', callbacks.onBack);
  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-github')!.addEventListener('click', callbacks.onGitHub);
  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-google')!.addEventListener('click', callbacks.onGoogle);
}

export function showInvitePage(
  info: { name: string; description: string | null; wordCount: number },
  callbacks: { onAccept: () => void; onBack: () => void },
  isLoggedIn: boolean,
): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');
  groupSelectorEl.innerHTML = `
    <div class="invite-page">
      <button class="back-link" id="btn-back">← Zurück</button>
      <div class="invite-title">Einladung</div>
      <div class="invite-info">
        <div class="invite-group-name">${escapeHtml(info.name)}</div>
        ${info.description ? `<div class="invite-group-desc">${escapeHtml(info.description)}</div>` : ''}
        <div class="invite-group-count">${info.wordCount} Wörter</div>
      </div>
      ${isLoggedIn
        ? `<button class="primary invite-accept-btn" id="btn-accept">Einladung annehmen</button>`
        : `<div class="invite-login-hint">Bitte melde dich an, um die Einladung anzunehmen.</div>`
      }
    </div>
  `;
  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-back')!.addEventListener('click', callbacks.onBack);
  const acceptBtn = groupSelectorEl.querySelector<HTMLButtonElement>('#btn-accept');
  if (acceptBtn) acceptBtn.addEventListener('click', callbacks.onAccept);
}

export function showShareDialog(inviteUrl: string, onClose: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog">
      <div class="dialog-title">Einladungslink</div>
      <div class="dialog-message">
        Teile diesen Link, um anderen Zugriff auf deine private Gruppe zu geben:
      </div>
      <div class="invite-url-container">
        <input type="text" class="invite-url-input" id="invite-url" readonly value="${escapeHtml(inviteUrl)}" />
        <button class="invite-copy-btn" id="invite-copy">Kopieren</button>
      </div>
      <div class="invite-copied hidden" id="invite-copied">Link kopiert!</div>
      <div class="dialog-actions">
        <button class="dialog-btn-cancel" id="dialog-close">Schließen</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cleanup = () => { overlay.remove(); };

  overlay.querySelector<HTMLButtonElement>('#invite-copy')!.addEventListener('click', () => {
    const input = overlay.querySelector<HTMLInputElement>('#invite-url')!;
    navigator.clipboard.writeText(input.value).then(() => {
      overlay.querySelector('#invite-copied')!.classList.remove('hidden');
      setTimeout(() => overlay.querySelector('#invite-copied')?.classList.add('hidden'), 2000);
    });
  });

  overlay.querySelector('#dialog-close')!.addEventListener('click', () => { cleanup(); onClose(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); onClose(); } });
}

export interface LobbyPlayerDisplayInfo {
  playerId: string;
  displayName: string;
  isHost: boolean;
  gravatarHash?: string | null;
}

export function showNamePrompt(onSubmit: (name: string) => void, onCancel: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog">
      <div class="dialog-title">Dein Name</div>
      <div class="dialog-message">
        Gib deinen Namen ein, um der Lobby beizutreten.
      </div>
      <input class="form-input" type="text" id="name-prompt-input" placeholder="Name" maxlength="30" autocomplete="off" />
      <div class="form-error hidden" id="name-prompt-error"></div>
      <div class="dialog-actions">
        <button class="dialog-btn-cancel" id="name-prompt-cancel">Abbrechen</button>
        <button class="primary" id="name-prompt-submit">Weiter</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const input = overlay.querySelector<HTMLInputElement>('#name-prompt-input')!;
  const errorEl = overlay.querySelector<HTMLDivElement>('#name-prompt-error')!;
  input.focus();

  function submit(): void {
    const name = input.value.trim();
    if (!name) {
      errorEl.textContent = 'Bitte gib einen Namen ein.';
      errorEl.classList.remove('hidden');
      return;
    }
    overlay.remove();
    onSubmit(name);
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  overlay.querySelector('#name-prompt-submit')!.addEventListener('click', submit);
  overlay.querySelector('#name-prompt-cancel')!.addEventListener('click', () => { overlay.remove(); onCancel(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); onCancel(); } });
}

export function showLobbyWaitingRoom(
  lobbyCode: string,
  groupName: string,
  callbacks: { onBack: () => void; onStartGame: () => void },
): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');

  const shareUrl = `${window.location.origin}/#/lobby/${encodeURIComponent(lobbyCode)}`;

  groupSelectorEl.innerHTML = `
    <div class="lobby-waiting-room">
      <button class="back-link" id="btn-back">← Zurück</button>
      <div class="lobby-waiting-title">Lobby</div>
      <div class="lobby-waiting-subtitle">${escapeHtml(groupName)}</div>
      <div class="lobby-code-card">
        <div class="lobby-code-label">Lobby-Code</div>
        <div class="lobby-code-value" id="lobby-code">${escapeHtml(lobbyCode)}</div>
        <div class="lobby-code-actions">
          <button class="lobby-copy-btn" id="btn-copy-code">Code kopieren</button>
          <button class="lobby-copy-btn" id="btn-copy-link">Link kopieren</button>
        </div>
        <div class="lobby-copied hidden" id="lobby-copied">Kopiert!</div>
      </div>
      <div class="lobby-player-section">
        <div class="lobby-player-label">Spieler</div>
        <div class="lobby-player-list" id="lobby-player-list">
          <div class="lobby-player-empty">Verbinde...</div>
        </div>
      </div>
      <div class="lobby-settings" id="lobby-settings"></div>
      <div class="lobby-host-controls" id="lobby-host-controls"></div>
      ${chatHtml()}
      <div class="lobby-waiting-hint">
        Teile den Code mit anderen Spielern, damit sie beitreten können.
      </div>
    </div>
  `;

  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-back')!.addEventListener('click', callbacks.onBack);

  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-copy-code')!.addEventListener('click', () => {
    navigator.clipboard.writeText(lobbyCode).then(() => showCopiedFeedback());
  });

  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-copy-link')!.addEventListener('click', () => {
    navigator.clipboard.writeText(shareUrl).then(() => showCopiedFeedback());
  });

  function showCopiedFeedback(): void {
    const el = groupSelectorEl.querySelector<HTMLDivElement>('#lobby-copied')!;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2000);
  }
}

export function updateLobbyPlayerList(players: LobbyPlayerDisplayInfo[], isCurrentPlayerHost: boolean, onStartGame: () => void): void {
  const listEl = groupSelectorEl.querySelector<HTMLDivElement>('#lobby-player-list');
  if (!listEl) return;

  if (players.length === 0) {
    listEl.innerHTML = `<div class="lobby-player-empty">Keine Spieler</div>`;
  } else {
    listEl.innerHTML = players.map(p => {
      const avatarSrc = gravatarFromHash(p.gravatarHash, 64);
      return `
        <div class="lobby-player-item">
          ${avatarSrc
            ? `<img class="lobby-player-avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
            : `<div class="lobby-player-avatar">${escapeHtml(p.displayName.charAt(0).toUpperCase())}</div>`}
          <div class="lobby-player-name">${escapeHtml(p.displayName)}</div>
          ${p.isHost ? '<div class="lobby-player-host-badge">Host</div>' : ''}
        </div>
      `;
    }).join('');
  }

  const controlsEl = groupSelectorEl.querySelector<HTMLDivElement>('#lobby-host-controls');
  if (!controlsEl) return;

  if (isCurrentPlayerHost) {
    controlsEl.innerHTML = `<button class="primary lobby-start-btn" id="btn-start-game">Spiel starten</button>`;
    controlsEl.querySelector<HTMLButtonElement>('#btn-start-game')!.addEventListener('click', onStartGame);
  } else {
    controlsEl.innerHTML = `<div class="lobby-waiting-for-host">Warte auf den Host...</div>`;
  }
}

export function updateLobbySettings(
  settings: LobbySettings,
  isHost: boolean,
  onSettingsChange: (settings: LobbySettings) => void,
): void {
  const el = groupSelectorEl.querySelector<HTMLDivElement>('#lobby-settings');
  if (!el) return;

  if (!isHost) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div class="lobby-settings-card">
      <div class="lobby-settings-title">Einstellungen</div>
      <label class="lobby-settings-option">
        <input type="checkbox" id="setting-multiple-bingos" ${settings.allowMultipleBingos ? 'checked' : ''} />
        <span>Mehrere Bingos erlauben</span>
      </label>
      <label class="lobby-settings-option">
        <input type="checkbox" id="setting-auto-select" ${settings.autoSelect ? 'checked' : ''} />
        <span>Wörter automatisch markieren</span>
      </label>
    </div>
  `;

  el.querySelector<HTMLInputElement>('#setting-multiple-bingos')!.addEventListener('change', (e) => {
    onSettingsChange({ ...settings, allowMultipleBingos: (e.target as HTMLInputElement).checked });
  });
  el.querySelector<HTMLInputElement>('#setting-auto-select')!.addEventListener('change', (e) => {
    onSettingsChange({ ...settings, autoSelect: (e.target as HTMLInputElement).checked });
  });
}

export function showSpectatorView(
  players: MultiplayerPlayerInfo[],
  currentPlayerId: string,
  lobbyCode: string,
  onBack: () => void,
): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');

  groupSelectorEl.innerHTML = `
    <div class="mp-game">
      <div class="mp-game-header">
        <button class="back-link" id="mp-btn-back">\u2190 Lobby verlassen</button>
        <div class="mp-lobby-code">Lobby: <span class="mp-lobby-code-value">${escapeHtml(lobbyCode)}</span></div>
      </div>
      <div class="spectator-notice">Du schaust dem Spiel zu. Bei der nächsten Runde bist du dabei!</div>
      <div class="mp-sidebar" style="max-width: 480px; margin: 0 auto;">
        <div class="mp-sidebar-title">Spieler</div>
        <div class="mp-player-list" id="mp-player-list"></div>
        ${markHistoryHtml()}
        ${chatHtml()}
      </div>
    </div>
  `;

  groupSelectorEl.querySelector<HTMLButtonElement>('#mp-btn-back')!.addEventListener('click', onBack);
  updateMultiplayerPlayers(players, currentPlayerId);
}

export interface MultiplayerGameCallbacks {
  onCellClick: (index: number) => void;
  onBack: () => void;
  onRestart: () => void;
}

export function showMultiplayerGameView(
  state: BingoState,
  players: MultiplayerPlayerInfo[],
  currentPlayerId: string,
  lobbyCode: string,
  callbacks: MultiplayerGameCallbacks,
): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');

  const isHost = players.some(p => p.playerId === currentPlayerId && p.isHost);

  groupSelectorEl.innerHTML = `
    <div class="mp-game">
      <div class="mp-game-header">
        <button class="back-link" id="mp-btn-back">\u2190 Lobby verlassen</button>
        <div class="mp-lobby-code">Lobby: <span class="mp-lobby-code-value">${escapeHtml(lobbyCode)}</span></div>
      </div>
      <div class="mp-layout">
        <div class="mp-board-area">
          <div class="counter">Markiert: <span id="mp-count">0</span> / 24 &nbsp;|&nbsp; Bingos: <span id="mp-bingos">0</span></div>
          <div class="bingo-banner" id="mp-bingo-banner">BINGO!</div>
          <div class="bingo-sub" id="mp-bingo-sub"></div>
          <div class="board" id="mp-board"></div>
          ${isHost ? '<div class="mp-host-controls"><button class="primary" id="mp-btn-restart">\u27f3 Neue Runde</button></div>' : ''}
        </div>
        <div class="mp-sidebar">
          <div class="mp-sidebar-title">Spieler</div>
          <div class="mp-player-list" id="mp-player-list"></div>
          ${markHistoryHtml()}
          ${chatHtml()}
        </div>
      </div>
    </div>
  `;

  const mpBoardEl = groupSelectorEl.querySelector<HTMLDivElement>('#mp-board')!;
  mpBoardEl.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
    if (!cell) return;
    const index = Number(cell.dataset.index);
    if (!isFreeSpace(index)) {
      callbacks.onCellClick(index);
    }
  });

  groupSelectorEl.querySelector<HTMLButtonElement>('#mp-btn-back')!.addEventListener('click', callbacks.onBack);
  groupSelectorEl.querySelector<HTMLButtonElement>('#mp-btn-restart')?.addEventListener('click', callbacks.onRestart);

  renderMultiplayerBoard(state);
  updateMultiplayerPlayers(players, currentPlayerId);
}

export function renderMultiplayerBoard(state: BingoState): void {
  const mpBoardEl = groupSelectorEl.querySelector<HTMLDivElement>('#mp-board');
  if (!mpBoardEl) return;

  mpBoardEl.innerHTML = '';

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
    check.textContent = '\u2713';

    cell.appendChild(text);
    cell.appendChild(check);
    mpBoardEl.appendChild(cell);
  }

  updateMultiplayerStatus(state);
}

export function updateMultiplayerCell(state: BingoState, index: number): void {
  const mpBoardEl = groupSelectorEl.querySelector<HTMLDivElement>('#mp-board');
  if (!mpBoardEl) return;

  const cell = mpBoardEl.querySelector<HTMLElement>(`[data-index="${index}"]`);
  if (!cell) return;
  cell.classList.toggle('marked', state.marked.has(index));
  cell.classList.toggle('bingo-line', state.bingoIndexes.has(index));

  for (let i = 0; i < state.board.length; i++) {
    if (i === index) continue;
    const otherCell = mpBoardEl.querySelector<HTMLElement>(`[data-index="${i}"]`);
    if (!otherCell) continue;
    otherCell.classList.toggle('bingo-line', state.bingoIndexes.has(i));
  }

  updateMultiplayerStatus(state);
}

function updateMultiplayerStatus(state: BingoState): void {
  const countEl = groupSelectorEl.querySelector<HTMLSpanElement>('#mp-count');
  const bingosEl = groupSelectorEl.querySelector<HTMLSpanElement>('#mp-bingos');
  if (countEl) countEl.textContent = String(getMarkedCount(state));
  if (bingosEl) bingosEl.textContent = String(state.bingoCount);

  const bannerEl = groupSelectorEl.querySelector<HTMLDivElement>('#mp-bingo-banner');
  const bannerSubEl = groupSelectorEl.querySelector<HTMLDivElement>('#mp-bingo-sub');
  const hasBingo = state.bingoCount > 0;
  if (bannerEl) bannerEl.classList.toggle('visible', hasBingo);
  if (bannerSubEl) bannerSubEl.classList.toggle('visible', hasBingo);
}

export function updateMultiplayerPlayers(players: MultiplayerPlayerInfo[], currentPlayerId: string): void {
  const listEl = groupSelectorEl.querySelector<HTMLDivElement>('#mp-player-list');
  if (!listEl) return;

  const sorted = [...players].sort((a, b) => b.bingoCount - a.bingoCount || b.markedCount - a.markedCount);

  listEl.innerHTML = sorted.map(p => {
    const isSelf = p.playerId === currentPlayerId;
    const bingoLabel = p.bingoCount > 0 ? `<span class="mp-player-bingo-count">${p.bingoCount} Bingo${p.bingoCount > 1 ? 's' : ''}</span>` : '';
    const avatarSrc = gravatarFromHash(p.gravatarHash, 56);
    return `
      <div class="mp-player-card ${isSelf ? 'mp-player-self' : ''}">
        <div class="mp-player-info">
          ${avatarSrc
            ? `<img class="mp-player-avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
            : `<div class="mp-player-avatar">${escapeHtml(p.displayName.charAt(0).toUpperCase())}</div>`}
          <div class="mp-player-details">
            <div class="mp-player-name">${escapeHtml(p.displayName)}${p.isHost ? ' <span class="lobby-player-host-badge">Host</span>' : ''}</div>
            <div class="mp-player-progress-text">${p.markedCount} / 24 ${bingoLabel}</div>
          </div>
        </div>
        <div class="mp-player-bar">
          <div class="mp-player-bar-fill ${p.bingoCount > 0 ? 'mp-player-bar-bingo' : ''}" style="width: ${Math.round((p.markedCount / 24) * 100)}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

export function showMultiplayerBingoNotification(winnerName: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'mp-bingo-overlay';
  overlay.innerHTML = `
    <div class="mp-bingo-notification">
      <div class="mp-bingo-icon">BINGO!</div>
      <div class="mp-bingo-winner">${escapeHtml(winnerName)}</div>
      <div class="mp-bingo-message">hat eine Reihe geschafft!</div>
    </div>
  `;
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.classList.add('mp-bingo-fade');
    overlay.addEventListener('transitionend', () => overlay.remove());
  }, 2500);

  overlay.addEventListener('click', () => {
    overlay.classList.add('mp-bingo-fade');
    overlay.addEventListener('transitionend', () => overlay.remove());
  });
}

function markHistoryHtml(): string {
  return `
    <div class="mark-history-panel" id="mark-history-panel">
      <div class="mark-history-title">Verlauf</div>
      <div class="mark-history-list" id="mark-history-list">
        <div class="mark-history-empty">Noch keine Wörter markiert.</div>
      </div>
    </div>
  `;
}

function renderHistoryItem(e: MarkHistoryEntry, isLatest: boolean): string {
  return `
    <div class="mark-history-item ${isLatest ? 'mark-history-latest' : ''}">
      <span class="mark-history-word">${escapeHtml(e.word)}</span>
      <span class="mark-history-player">${escapeHtml(e.displayName)}</span>
    </div>
  `;
}

export function renderMarkHistory(entries: MarkHistoryEntry[]): void {
  const listEl = document.querySelector<HTMLDivElement>('#mark-history-list');
  if (!listEl) return;

  if (entries.length === 0) {
    listEl.innerHTML = '<div class="mark-history-empty">Noch keine Wörter markiert.</div>';
    return;
  }

  listEl.innerHTML = [...entries].reverse().map((e, i) => renderHistoryItem(e, i === 0)).join('');
}

export function appendMarkHistory(entry: MarkHistoryEntry): void {
  const listEl = document.querySelector<HTMLDivElement>('#mark-history-list');
  if (!listEl) return;

  const emptyEl = listEl.querySelector('.mark-history-empty');
  if (emptyEl) emptyEl.remove();

  // Demote previous latest
  const prev = listEl.querySelector('.mark-history-latest');
  if (prev) prev.classList.remove('mark-history-latest');

  const el = document.createElement('div');
  el.className = 'mark-history-item mark-history-latest';
  el.innerHTML = `
    <span class="mark-history-word">${escapeHtml(entry.word)}</span>
    <span class="mark-history-player">${escapeHtml(entry.displayName)}</span>
  `;
  listEl.prepend(el);
}

export function showCellSelectedToast(displayName: string, word: string): void {
  showToast(`${displayName}: "${word}"`);
}

function chatHtml(): string {
  return `
    <div class="chat-panel" id="chat-panel">
      <div class="chat-title">Chat</div>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-row">
        <input class="chat-input" type="text" id="chat-input" placeholder="Nachricht..." maxlength="500" autocomplete="off" />
        <button class="chat-send-btn" id="chat-send-btn">➤</button>
      </div>
    </div>
  `;
}

export function bindChatListeners(container: HTMLElement, onSend: (text: string) => void): void {
  const input = container.querySelector<HTMLInputElement>('#chat-input');
  const sendBtn = container.querySelector<HTMLButtonElement>('#chat-send-btn');

  function send(): void {
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    onSend(text);
    input.value = '';
  }

  sendBtn?.addEventListener('click', send);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}

export function appendChatMessage(msg: ChatMessageInfo, currentPlayerId: string): void {
  const container = document.querySelector<HTMLDivElement>('#chat-messages');
  if (!container) return;

  const isSelf = msg.playerId === currentPlayerId;
  const avatarSrc = gravatarFromHash(msg.gravatarHash, 40);
  const avatarHtml = avatarSrc
    ? `<img class="chat-avatar" src="${escapeHtml(avatarSrc)}" alt="" />`
    : `<div class="chat-avatar chat-avatar-letter">${escapeHtml(msg.displayName.charAt(0).toUpperCase())}</div>`;

  const el = document.createElement('div');
  el.className = `chat-msg ${isSelf ? 'chat-msg-self' : ''}`;
  el.innerHTML = `
    ${avatarHtml}
    <div class="chat-msg-body">
      <div class="chat-msg-name">${escapeHtml(msg.displayName)}</div>
      <div class="chat-msg-text">${escapeHtml(msg.text)}</div>
    </div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

export function showStaticPage(title: string, html: string, onBack: () => void): void {
  groupSelectorEl.classList.remove('hidden');
  gameViewEl.classList.add('hidden');
  groupSelectorEl.innerHTML = `
    <div class="static-page">
      <button class="back-link" id="btn-back">← Zurück</button>
      <h2>${title}</h2>
      <div class="static-page-content">${html}</div>
    </div>
  `;
  groupSelectorEl.querySelector<HTMLButtonElement>('#btn-back')!.addEventListener('click', onBack);
}
