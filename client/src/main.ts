import './style.css';
import { createBoardFromCells, toggleCell, resetMarks } from './bingo.ts';
import type { BingoState } from './bingo.ts';
import { mountApp, renderBoard, updateCell, showLoading, showError, clearStatus } from './renderer.ts';
import { fetchGroups, fetchBoard } from './api.ts';

let state: BingoState;
let currentGroupId: string | null = null;

async function newGame(): Promise<void> {
  showLoading();

  try {
    if (!currentGroupId) {
      const groups = await fetchGroups();
      if (groups.length === 0) {
        showError('Keine Wortgruppen gefunden.');
        return;
      }
      currentGroupId = groups[0].id;
    }

    const board = await fetchBoard(currentGroupId);
    state = createBoardFromCells(board.cells);
    clearStatus();
    renderBoard(state);
  } catch (err) {
    showError(`Fehler beim Laden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
  }
}

function onCellClick(index: number): void {
  state = toggleCell(state, index);
  updateCell(state, index);
}

function onReset(): void {
  state = resetMarks(state);
  renderBoard(state);
}

const app = document.querySelector<HTMLDivElement>('#app')!;
mountApp(app, { onCellClick, onNewGame: newGame, onReset });
newGame();
