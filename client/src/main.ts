import './style.css';
import { createBoard, toggleCell, resetMarks, DEFAULT_WORDS } from './bingo.ts';
import type { BingoState } from './bingo.ts';
import { mountApp, renderBoard, updateCell } from './renderer.ts';

let state: BingoState;

function newGame(): void {
  state = createBoard(DEFAULT_WORDS);
  renderBoard(state);
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
