import type { BingoState } from './bingo.ts';
import { isFreeSpace, getMarkedCount } from './bingo.ts';

export interface RenderCallbacks {
  onCellClick: (index: number) => void;
  onNewGame: () => void;
  onReset: () => void;
}

let boardEl: HTMLDivElement;
let countEl: HTMLSpanElement;
let bingosEl: HTMLSpanElement;
let bannerEl: HTMLDivElement;
let bannerSubEl: HTMLDivElement;

export function mountApp(container: HTMLElement, callbacks: RenderCallbacks): void {
  container.innerHTML = `
    <header>
      <div class="badge">⚠ DiIT / Komax Group ⚠</div>
      <h1>BULLSHIT<br><span>BINGO</span></h1>
      <div class="subtitle">// Smart Factory Edition · Klick auf ein Feld wenn du es hörst</div>
    </header>

    <div class="controls">
      <button class="primary" id="btn-new">⟳ Neues Spiel</button>
      <button id="btn-reset">✕ Reset</button>
    </div>

    <div class="counter">Markiert: <span id="count">0</span> / 24 &nbsp;|&nbsp; Bingos: <span id="bingos">0</span></div>

    <div class="bingo-banner" id="bingo-banner">🎉 BINGO! 🎉</div>
    <div class="bingo-sub" id="bingo-sub">Jetzt kannst du aufhören zuzuhören.</div>

    <div class="board" id="board"></div>

    <footer>
      Dieses Spiel ist rein satirisch und dient der psychischen Selbstverteidigung.<br>
      Alle Buzzwords basieren auf wahren Begebenheiten. Keine Haftung für unkontrolliertes Augenrollen.
    </footer>
  `;

  boardEl = container.querySelector<HTMLDivElement>('#board')!;
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
