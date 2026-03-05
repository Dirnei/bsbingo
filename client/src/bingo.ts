/** All 12 possible bingo lines: 5 rows, 5 columns, 2 diagonals */
const LINES: readonly number[][] = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
];

const FREE_INDEX = 12;

export interface BingoState {
  board: string[];
  marked: Set<number>;
  bingoCount: number;
  bingoIndexes: Set<number>;
  locked: boolean;
}

export function createBoardFromCells(cells: { index: number; text: string; isFreeSpace: boolean }[]): BingoState {
  const board = cells
    .sort((a, b) => a.index - b.index)
    .map(c => c.isFreeSpace ? "FREE\n☕" : c.text);

  const marked = new Set<number>([FREE_INDEX]);

  return {
    board,
    marked,
    bingoCount: 0,
    bingoIndexes: new Set(),
    locked: false,
  };
}

export function toggleCell(state: BingoState, index: number): BingoState {
  if (index === FREE_INDEX) return state;
  if (state.locked) return state;

  const marked = new Set(state.marked);
  if (marked.has(index)) {
    marked.delete(index);
  } else {
    marked.add(index);
  }

  const { bingoCount, bingoIndexes } = detectBingo(marked);

  return { ...state, marked, bingoCount, bingoIndexes, locked: bingoCount > 0 };
}

export function resetMarks(state: BingoState): BingoState {
  return {
    ...state,
    marked: new Set([FREE_INDEX]),
    bingoCount: 0,
    bingoIndexes: new Set(),
    locked: false,
  };
}

export function getMarkedCount(state: BingoState): number {
  return state.marked.size - 1; // exclude FREE space
}

export function isFreeSpace(index: number): boolean {
  return index === FREE_INDEX;
}

function detectBingo(marked: Set<number>): { bingoCount: number; bingoIndexes: Set<number> } {
  let bingoCount = 0;
  const bingoIndexes = new Set<number>();

  for (const line of LINES) {
    if (line.every(i => marked.has(i))) {
      bingoCount++;
      for (const i of line) {
        bingoIndexes.add(i);
      }
    }
  }

  return { bingoCount, bingoIndexes };
}

