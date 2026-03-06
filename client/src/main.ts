import './style.css';
import { createBoardFromCells, toggleCell, resetMarks, multiplayerToggleCell, createBoardFromLobbyState } from './bingo.ts';
import type { BingoState } from './bingo.ts';
import {
  mountApp, renderBoard, updateCell, showLoading, showError, clearStatus,
  showGroupList, showGroupSelectorLoading, showGroupSelectorError, showGameView,
  showDeleteConfirmDialog, showGroupCreateForm, showGroupEditForm, showToast,
  showStaticPage, showLoginPage, updateHeaderAuth, showInvitePage, showShareDialog,
  showLobbyWaitingRoom, updateLobbyPlayerList, showNamePrompt,
  showMultiplayerGameView, renderMultiplayerBoard, updateMultiplayerCell,
  updateMultiplayerPlayers, showMultiplayerBingoNotification,
  bindChatListeners, appendChatMessage, showSpectatorView,
} from './renderer.ts';
import type { GroupDisplayInfo, MultiplayerPlayerInfo, ChatMessageInfo } from './renderer.ts';
import { fetchGroups, fetchBoard, deleteGroup, createGroup, fetchGroup, updateGroup, getLoginUrl, setToken, clearToken, fetchMe, generateInviteLink, fetchInviteInfo, acceptInvite, isLoggedIn, starGroup, unstarGroup, createLobby } from './api.ts';
import type { UserInfo } from './api.ts';
import { registerRoutes, navigate, resolve } from './router.ts';

let state: BingoState;
let currentGroupId: string | null = null;
let cachedGroups: GroupDisplayInfo[] = [];
let currentUser: UserInfo | null = null;
let lobbyGroupName: string | null = null;
let lobbyDisplayName: string | null = null;
let lobbyWebSocket: WebSocket | null = null;
let lobbyPlayers: MultiplayerPlayerInfo[] = [];
let lobbyCurrentPlayerId: string | null = null;
let lobbyBoard: { index: number; text: string; isFreeSpace: boolean }[] | null = null;
let lobbyMarkedCells: number[] | null = null;
let lobbyGameStarted = false;
let lobbyIsSpectator = false;
let lobbyCode: string | null = null;
let multiplayerState: BingoState | null = null;

function refreshHeaderAuth(): void {
  updateHeaderAuth(currentUser, {
    onSignIn: () => navigate('/login'),
    onSignOut: () => {
      clearToken();
      currentUser = null;
      refreshHeaderAuth();
      navigate('/groups');
    },
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
    onMultiplayer: async (id) => {
      const group = cachedGroups.find(g => g.id === id);
      lobbyGroupName = group?.name ?? null;

      if (!currentUser) {
        // Anonymous user — need a name before creating lobby
        showNamePrompt(async (name) => {
          lobbyDisplayName = name;
          try {
            showGroupSelectorLoading();
            const result = await createLobby(id, name);
            navigate(`/lobby/${result.lobbyCode}`);
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Fehler beim Erstellen der Lobby');
            showGroupListWithActions();
          }
        }, () => showGroupListWithActions());
        return;
      }

      try {
        showGroupSelectorLoading();
        const result = await createLobby(id, currentUser.name);
        navigate(`/lobby/${result.lobbyCode}`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Fehler beim Erstellen der Lobby');
        showGroupListWithActions();
      }
    },
    onJoinLobby: (code, displayName) => {
      lobbyDisplayName = displayName;
      navigate(`/lobby/${code}`);
    },
    onStar: async (id) => {
      const group = cachedGroups.find(g => g.id === id);
      if (!group) return;
      try {
        const result = group.isStarred
          ? await unstarGroup(id)
          : await starGroup(id);
        group.isStarred = !group.isStarred;
        group.starCount = result.starCount;
        showGroupListWithActions();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Fehler');
      }
    },
  }, currentUser?.id, currentUser?.name);
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

function closeLobbyWebSocket(): void {
  if (lobbyWebSocket) {
    lobbyWebSocket.close();
    lobbyWebSocket = null;
  }
  lobbyPlayers = [];
  lobbyCurrentPlayerId = null;
  lobbyBoard = null;
  lobbyMarkedCells = null;
  lobbyGameStarted = false;
  lobbyIsSpectator = false;
  lobbyCode = null;
  multiplayerState = null;
}

function sendLobbyMessage(type: string, payload?: Record<string, unknown>): void {
  if (lobbyWebSocket?.readyState === WebSocket.OPEN) {
    lobbyWebSocket.send(JSON.stringify({ type, payload }));
  }
}

function bindChat(): void {
  bindChatListeners(document.body, (text) => sendLobbyMessage('chat:message', { text }));
}

function refreshLobbyUI(): void {
  if (lobbyGameStarted && multiplayerState) {
    updateMultiplayerPlayers(lobbyPlayers, lobbyCurrentPlayerId ?? '');
    return;
  }
  const isHost = lobbyPlayers.some(p => p.playerId === lobbyCurrentPlayerId && p.isHost);
  updateLobbyPlayerList(lobbyPlayers, isHost, () => sendLobbyMessage('game:start'));
}

function startMultiplayerGame(): void {
  if (!lobbyBoard || !lobbyCurrentPlayerId || !lobbyCode) return;

  multiplayerState = createBoardFromLobbyState(lobbyBoard, lobbyMarkedCells ?? []);
  lobbyGameStarted = true;

  showMultiplayerGameView(multiplayerState, lobbyPlayers, lobbyCurrentPlayerId, lobbyCode, {
    onCellClick: (index) => {
      if (!multiplayerState) return;
      multiplayerState = multiplayerToggleCell(multiplayerState, index);
      updateMultiplayerCell(multiplayerState, index);
      sendLobbyMessage('cell:mark', { cellIndex: index });
    },
    onBack: () => {
      closeLobbyWebSocket();
      navigate('/groups');
    },
    onRestart: () => sendLobbyMessage('game:restart'),
  });
  bindChat();
}

function handleLobbyMessage(msg: { type: string; payload?: Record<string, unknown> }): void {
  switch (msg.type) {
    case 'lobby:state': {
      const payload = msg.payload as {
        currentPlayerId: string;
        players: MultiplayerPlayerInfo[];
        gameStarted: boolean;
        isSpectator: boolean;
        board?: { index: number; text: string; isFreeSpace: boolean }[];
        markedCells?: number[];
      } | undefined;
      if (!payload) break;
      lobbyCurrentPlayerId = payload.currentPlayerId;
      lobbyPlayers = payload.players;
      lobbyIsSpectator = payload.isSpectator;
      if (payload.board) lobbyBoard = payload.board;
      if (payload.markedCells) lobbyMarkedCells = payload.markedCells;

      if (payload.gameStarted && lobbyIsSpectator) {
        // Joined after game started — spectator mode
        if (lobbyCode) {
          showSpectatorView(lobbyPlayers, lobbyCurrentPlayerId, lobbyCode, () => {
            closeLobbyWebSocket();
            navigate('/groups');
          });
          bindChat();
        }
      } else if (payload.gameStarted && !lobbyGameStarted) {
        startMultiplayerGame();
      } else if (!payload.gameStarted && lobbyGameStarted) {
        // Game was restarted — back to waiting room, new board will come
        lobbyGameStarted = false;
        multiplayerState = null;
        if (lobbyCode) {
          showLobbyWaitingRoom(lobbyCode, lobbyGroupName ?? 'Multiplayer Lobby', {
            onBack: () => { closeLobbyWebSocket(); navigate('/groups'); },
            onStartGame: () => sendLobbyMessage('game:start'),
          });
          bindChat();
        }
        refreshLobbyUI();
      } else if (lobbyGameStarted && lobbyBoard) {
        // Re-render with updated state (e.g. after restart with new board)
        multiplayerState = createBoardFromLobbyState(lobbyBoard, lobbyMarkedCells ?? []);
        renderMultiplayerBoard(multiplayerState);
        updateMultiplayerPlayers(lobbyPlayers, lobbyCurrentPlayerId ?? '');
      } else {
        refreshLobbyUI();
      }
      break;
    }
    case 'player:joined': {
      const payload = msg.payload as { playerId: string; displayName: string; gravatarHash?: string | null } | undefined;
      if (!payload) break;
      if (!lobbyPlayers.some(p => p.playerId === payload.playerId)) {
        lobbyPlayers.push({ playerId: payload.playerId, displayName: payload.displayName, isHost: false, markedCount: 0, bingoCount: 0, gravatarHash: payload.gravatarHash });
      }
      refreshLobbyUI();
      break;
    }
    case 'player:left': {
      const payload = msg.payload as { playerId: string; displayName: string } | undefined;
      if (!payload) break;
      lobbyPlayers = lobbyPlayers.filter(p => p.playerId !== payload.playerId);
      refreshLobbyUI();
      break;
    }
    case 'game:start': {
      if (!lobbyGameStarted) {
        startMultiplayerGame();
      }
      break;
    }
    case 'player:progress': {
      const payload = msg.payload as { playerId: string; markedCount: number } | undefined;
      if (!payload) break;
      const player = lobbyPlayers.find(p => p.playerId === payload.playerId);
      if (player) player.markedCount = payload.markedCount;
      if (lobbyGameStarted || lobbyIsSpectator) {
        updateMultiplayerPlayers(lobbyPlayers, lobbyCurrentPlayerId ?? '');
      }
      break;
    }
    case 'player:bingo': {
      const payload = msg.payload as { playerId: string; displayName: string; winningLine: number[] } | undefined;
      if (!payload) break;
      const bingoPlayer = lobbyPlayers.find(p => p.playerId === payload.playerId);
      if (bingoPlayer) bingoPlayer.bingoCount++;
      if (lobbyGameStarted || lobbyIsSpectator) {
        updateMultiplayerPlayers(lobbyPlayers, lobbyCurrentPlayerId ?? '');
      }
      showMultiplayerBingoNotification(payload.displayName);
      break;
    }
    case 'game:restart': {
      // Server will follow up with individual lobby:state for each player.
      // Don't reset lobbyGameStarted here — let the lobby:state handler
      // detect the transition (gameStarted=false && lobbyGameStarted=true).
      multiplayerState = null;
      break;
    }
    case 'chat:message': {
      const payload = msg.payload as ChatMessageInfo | undefined;
      if (!payload) break;
      appendChatMessage(payload, lobbyCurrentPlayerId ?? '');
      break;
    }
    case 'lobby:expired': {
      showToast('Die Lobby ist abgelaufen.');
      closeLobbyWebSocket();
      navigate('/groups');
      break;
    }
    case 'lobby:closed': {
      showToast('Der Host hat die Lobby geschlossen.');
      closeLobbyWebSocket();
      navigate('/groups');
      break;
    }
    case 'error': {
      const errorMsg = (msg.payload?.message as string) ?? 'Unbekannter Fehler';
      showToast(errorMsg);
      break;
    }
  }
}

function connectToLobby(code: string, displayName: string): void {
  closeLobbyWebSocket();
  lobbyCode = code;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/lobby?code=${encodeURIComponent(code)}`;

  const ws = new WebSocket(wsUrl);
  lobbyWebSocket = ws;

  ws.addEventListener('open', () => {
    const payload: { displayName: string; email?: string } = { displayName };
    if (currentUser?.email) payload.email = currentUser.email;
    ws.send(JSON.stringify({ type: 'lobby:join', payload }));
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data) as { type: string; payload?: Record<string, unknown> };
      handleLobbyMessage(msg);
    } catch {
      // Ignore malformed messages
    }
  });

  ws.addEventListener('close', () => {
    if (lobbyWebSocket === ws) lobbyWebSocket = null;
    showToast('Verbindung zum Server verloren.');
    closeLobbyWebSocket();
    navigate('/groups');
  });

  ws.addEventListener('error', () => {
    // The close event will fire after error, which handles navigation
  });
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
      if (!isLoggedIn()) {
        navigate('/login');
        return;
      }
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
    pattern: '/lobby/:code',
    handler: (params) => {
      const code = params.code.toUpperCase();
      lobbyCode = code;
      const displayName = lobbyDisplayName ?? currentUser?.name;

      function enterLobby(name: string): void {
        showLobbyWaitingRoom(code, lobbyGroupName ?? 'Multiplayer Lobby', {
          onBack: () => {
            closeLobbyWebSocket();
            navigate('/groups');
          },
          onStartGame: () => sendLobbyMessage('game:start'),
        });
        bindChat();
        connectToLobby(code, name);
      }

      if (displayName) {
        enterLobby(displayName);
      } else {
        showNamePrompt(
          (name) => { lobbyDisplayName = name; enterLobby(name); },
          () => navigate('/groups'),
        );
      }
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

// Load current user before resolving routes so currentUser.id is available
loadCurrentUser().then(() => resolve());
