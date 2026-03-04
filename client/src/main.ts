import './style.css';
import { createBoardFromCells, toggleCell, resetMarks } from './bingo.ts';
import type { BingoState } from './bingo.ts';
import {
  mountApp, renderBoard, updateCell, showLoading, showError, clearStatus,
  showGroupList, showGroupSelectorLoading, showGroupSelectorError, showGameView,
  showDeleteConfirmDialog, showGroupCreateForm, showGroupEditForm,
} from './renderer.ts';
import type { GroupDisplayInfo } from './renderer.ts';
import { fetchGroups, fetchBoard, deleteGroup, createGroup, fetchGroup, updateGroup } from './api.ts';
import { registerRoutes, navigate, resolve } from './router.ts';

let state: BingoState;
let currentGroupId: string | null = null;
let cachedGroups: GroupDisplayInfo[] = [];

async function loadGroups(): Promise<void> {
  showGroupSelectorLoading();
  try {
    cachedGroups = await fetchGroups();
    showGroupListWithActions();
  } catch (err) {
    showGroupSelectorError(`Fehler beim Laden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
  }
}

function showGroupListWithActions(): void {
  showGroupList(cachedGroups, {
    onPlay: (id) => {
      navigate(`/game/${id}`);
    },
    onEdit: (id) => {
      navigate(`/groups/${id}/edit`);
    },
    onDelete: (id, name) => {
      showDeleteConfirmDialog(name, async () => {
        try {
          await deleteGroup(id);
          cachedGroups = cachedGroups.filter(g => g.id !== id);
          showGroupListWithActions();
        } catch (err) {
          showGroupSelectorError(`Fehler beim Löschen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
        }
      }, () => {
        // cancelled — do nothing
      });
    },
    onCreate: () => {
      navigate('/groups/new');
    },
  });
}

async function startGame(groupId: string): Promise<void> {
  currentGroupId = groupId;
  showGameView(() => navigate('/groups'));
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
    navigate('/groups');
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

registerRoutes([
  {
    pattern: '/groups',
    handler: () => loadGroups(),
  },
  {
    pattern: '/groups/new',
    handler: () => {
      showGroupCreateForm({
        onSubmit: async (data) => {
          await createGroup({ name: data.name, description: data.description, words: data.words });
          cachedGroups = await fetchGroups();
          navigate('/groups');
        },
        onCancel: () => navigate('/groups'),
      });
    },
  },
  {
    pattern: '/groups/:id/edit',
    handler: async (params) => {
      showGroupSelectorLoading();
      try {
        const group = await fetchGroup(params.id);
        showGroupEditForm({
          initialName: group.name,
          initialDescription: group.description ?? '',
          initialWords: group.words,
          callbacks: {
            onSubmit: async (data) => {
              await updateGroup(params.id, { name: data.name, description: data.description, words: data.words });
              cachedGroups = await fetchGroups();
              navigate('/groups');
            },
            onCancel: () => navigate('/groups'),
          },
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'Gruppe nicht gefunden') {
          showGroupSelectorError('Gruppe nicht gefunden (404)');
        } else {
          showGroupSelectorError(`Fehler beim Laden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
        }
      }
    },
  },
  {
    pattern: '/game/:id',
    handler: (params) => {
      startGame(params.id);
    },
  },
]);

resolve();
