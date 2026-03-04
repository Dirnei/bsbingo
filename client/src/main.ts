import './style.css';
import { createBoardFromCells, toggleCell, resetMarks } from './bingo.ts';
import type { BingoState } from './bingo.ts';
import {
  mountApp, renderBoard, updateCell, showLoading, showError, clearStatus,
  showGroupSelector, showGroupSelectorLoading, showGroupSelectorError, showGameView,
} from './renderer.ts';
import type { GroupDisplayInfo } from './renderer.ts';
import { fetchGroups, fetchBoard } from './api.ts';

let state: BingoState;
let currentGroupId: string | null = null;
let cachedGroups: GroupDisplayInfo[] = [];

async function loadGroups(): Promise<void> {
  showGroupSelectorLoading();
  try {
    cachedGroups = await fetchGroups();
    showGroupSelector(cachedGroups);
  } catch (err) {
    showGroupSelectorError(`Fehler beim Laden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
  }
}

async function startGame(groupId: string): Promise<void> {
  currentGroupId = groupId;
  showGameView(loadGroups);
  showLoading();

  try {
    const board = await fetchBoard(groupId);
    state = createBoardFromCells(board.cells);
    clearStatus();
    renderBoard(state);
  } catch (err) {
    showError(`Fehler beim Laden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
  }
}

async function newGame(): Promise<void> {
  if (!currentGroupId) {
    await loadGroups();
    return;
  }
  await startGame(currentGroupId);
}

function onGroupSelect(groupId: string): void {
  startGame(groupId);
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
mountApp(app, { onCellClick, onNewGame: newGame, onReset, onGroupSelect });
loadGroups();
