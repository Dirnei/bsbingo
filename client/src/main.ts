import './style.css';
import { createBoardFromCells, toggleCell, resetMarks } from './bingo.ts';
import type { BingoState } from './bingo.ts';
import {
  mountApp, renderBoard, updateCell, showLoading, showError, clearStatus,
  showGroupList, showGroupSelectorLoading, showGroupSelectorError, showGameView,
  showDeleteConfirmDialog, showGroupCreateForm, showGroupEditForm, showToast,
  showStaticPage, showLoginPage, updateHeaderAuth, showInvitePage, showShareDialog,
} from './renderer.ts';
import type { GroupDisplayInfo } from './renderer.ts';
import { fetchGroups, fetchBoard, deleteGroup, createGroup, fetchGroup, updateGroup, getLoginUrl, setToken, clearToken, fetchMe, generateInviteLink, fetchInviteInfo, acceptInvite, isLoggedIn } from './api.ts';
import type { UserInfo } from './api.ts';
import { registerRoutes, navigate, resolve } from './router.ts';

let state: BingoState;
let currentGroupId: string | null = null;
let cachedGroups: GroupDisplayInfo[] = [];
let currentUser: UserInfo | null = null;

function refreshHeaderAuth(): void {
  updateHeaderAuth(currentUser, {
    onSignIn: () => navigate('/login'),
    onSignOut: () => {
      clearToken();
      currentUser = null;
      refreshHeaderAuth();
      navigate('/groups');
    },
    onMyGroups: () => navigate('/my-groups'),
  });
}

async function loadCurrentUser(): Promise<void> {
  currentUser = await fetchMe();
  refreshHeaderAuth();
}

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
          showToast(`„${name}" wurde gelöscht`);
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
    onShare: async (id) => {
      try {
        const inviteToken = await generateInviteLink(id);
        const inviteUrl = `${window.location.origin}/#/invite/${inviteToken}`;
        showShareDialog(inviteUrl, () => {
          // Refresh to update invite token in cached data
          loadGroups();
        });
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Fehler beim Erstellen des Einladungslinks');
      }
    },
  }, currentUser?.id);
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
          await createGroup({ name: data.name, description: data.description, words: data.words, visibility: data.visibility });
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
          initialVisibility: group.visibility ?? 'public',
          callbacks: {
            onSubmit: async (data) => {
              await updateGroup(params.id, { name: data.name, description: data.description, words: data.words, visibility: data.visibility });
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
  {
    pattern: '/invite/:token',
    handler: async (params) => {
      showGroupSelectorLoading();
      try {
        const info = await fetchInviteInfo(params.token);
        showInvitePage(info, {
          onAccept: async () => {
            if (!isLoggedIn()) {
              navigate('/login');
              return;
            }
            try {
              const result = await acceptInvite(params.token);
              showToast(`Du hast jetzt Zugriff auf „${result.name}"`);
              navigate('/groups');
            } catch (err) {
              showGroupSelectorError(err instanceof Error ? err.message : 'Fehler beim Annehmen der Einladung');
            }
          },
          onBack: () => navigate('/groups'),
        }, isLoggedIn());
      } catch (err) {
        showGroupSelectorError(err instanceof Error ? err.message : 'Ungültiger Einladungslink');
      }
    },
  },
  {
    pattern: '/my-groups',
    handler: async () => {
      if (!isLoggedIn()) {
        navigate('/login');
        return;
      }
      await loadGroups();
    },
  },
  {
    pattern: '/login',
    handler: () => {
      showLoginPage({
        onGitHub: () => { window.location.href = getLoginUrl('github'); },
        onGoogle: () => { window.location.href = getLoginUrl('google'); },
        onBack: () => navigate('/groups'),
      });
    },
  },
  {
    pattern: '/auth/callback',
    handler: async () => {
      // Extract token from query string (the backend redirects to /#/auth/callback?token=...)
      const hashPart = window.location.hash.slice(1); // remove #
      const qIndex = hashPart.indexOf('?');
      if (qIndex !== -1) {
        const params = new URLSearchParams(hashPart.slice(qIndex));
        const token = params.get('token');
        if (token) {
          setToken(token);
          await loadCurrentUser();
          navigate('/groups');
          return;
        }
      }
      navigate('/login');
    },
  },
  {
    pattern: '/impressum',
    handler: () => {
      showStaticPage('Impressum', `
        <p><strong>Angaben gemäß § 5 TMG</strong></p>
        <p>
          Max Mustermann<br>
          Musterstraße 1<br>
          12345 Musterstadt
        </p>
        <p><strong>Kontakt</strong></p>
        <p>
          E-Mail: max@example.com
        </p>
        <p><strong>Haftungsausschluss</strong></p>
        <p>
          Dieses Projekt ist ein satirisches Spaßprojekt. Die Inhalte wurden mit Sorgfalt erstellt,
          jedoch wird keine Gewähr für Richtigkeit, Vollständigkeit und Aktualität übernommen.
        </p>
      `, () => navigate('/groups'));
    },
  },
  {
    pattern: '/datenschutz',
    handler: () => {
      showStaticPage('Datenschutzerklärung', `
        <p><strong>1. Datenschutz auf einen Blick</strong></p>
        <p>
          Diese Website erhebt und speichert grundsätzlich keine personenbezogenen Daten.
          Es werden keine Cookies gesetzt und kein Tracking eingesetzt.
        </p>
        <p><strong>2. Hosting</strong></p>
        <p>
          Die Website wird extern gehostet. Die Serverlogfiles können IP-Adressen,
          Browsertyp, Betriebssystem, Referrer-URL, Zeitpunkt des Zugriffs und die abgerufene Seite enthalten.
          Die Erfassung dieser Daten erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO.
        </p>
        <p><strong>3. Keine Cookies</strong></p>
        <p>
          Diese Website verwendet keine Cookies.
        </p>
        <p><strong>4. Keine Analyse-Tools</strong></p>
        <p>
          Es werden keine Analyse- oder Tracking-Tools eingesetzt.
        </p>
        <p><strong>5. Kontakt</strong></p>
        <p>
          Bei Fragen zum Datenschutz wenden Sie sich bitte an die im Impressum genannte Person.
        </p>
      `, () => navigate('/groups'));
    },
  },
]);

// Load current user on startup (non-blocking for route resolution)
loadCurrentUser();
resolve();
