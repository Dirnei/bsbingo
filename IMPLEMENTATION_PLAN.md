# PRD: Phase 4 — Multiplayer Lobbies

## Introduction

Add real-time multiplayer support so players in the same lobby see each other's progress and get notified when someone achieves BINGO. This phase leverages Akka.NET's actor model — each lobby is a stateful actor managing players, boards, and game lifecycle. Communication happens over WebSockets.

## Goals

- Enable creating and joining multiplayer lobbies with short lobby codes
- Give each player their own randomized board from the same word pool
- Show real-time player list and progress indicators in the lobby
- Broadcast BINGO alerts to all players when someone wins
- Support host controls (start game, restart round)
- Auto-expire inactive lobbies via Akka ReceiveTimeout

## User Stories

### US-001: Implement LobbyManagerActor
**Description:** As a developer, I need a LobbyManagerActor that creates and finds lobbies so the multiplayer system can manage active games.

**Acceptance Criteria:**
- [x] LobbyManagerActor handles `CreateLobby` message — creates a new LobbyActor, returns lobby code
- [x] LobbyManagerActor handles `FindLobby` message — looks up a lobby by code
- [x] Generates short, unique, URL-safe lobby codes (e.g., 6 alphanumeric characters like `ABCD12`)
- [x] Tracks active lobbies in memory
- [x] Removes lobby references when a LobbyActor terminates
- [x] Registered via Servus.Akka
- [x] Typecheck passes

### US-002: Implement LobbyActor
**Description:** As a developer, I need a LobbyActor (one per lobby) that manages lobby state, player boards, and game lifecycle.

**Acceptance Criteria:**
- [x] LobbyActor holds: lobby code, group ID, player list, each player's board and marked cells
- [x] Handles `JoinLobby` message — adds player, generates their unique board, broadcasts player joined
- [x] Handles `LeaveLobby` message — removes player, broadcasts player left
- [x] Handles `StartGame` message (host only) — broadcasts game start to all players
- [x] Handles `MarkCell` message — records mark, broadcasts progress update
- [x] Handles `RestartGame` message (host only) — regenerates all boards, resets marks, broadcasts restart
- [x] Validates bingo claims server-side using the same 12-line detection logic
- [x] Broadcasts `PlayerBingo` when a player completes a line
- [x] Self-destructs after configurable inactivity period (Akka ReceiveTimeout)
- [x] Typecheck passes

### US-003: Implement PlayerSessionActor
**Description:** As a developer, I need a PlayerSessionActor (one per WebSocket connection) that bridges WebSocket messages to/from the LobbyActor.

**Acceptance Criteria:**
- [ ] PlayerSessionActor created for each WebSocket connection
- [ ] Forwards client messages (join, mark cell) to the LobbyActor
- [ ] Forwards LobbyActor broadcasts (player joined, progress, bingo) to the WebSocket client
- [ ] Handles WebSocket disconnect — notifies LobbyActor of player departure
- [ ] Serializes/deserializes messages to/from JSON for WebSocket transport
- [ ] Typecheck passes

### US-004: WebSocket endpoint
**Description:** As a frontend developer, I need a WebSocket endpoint so the client can establish a real-time connection to a lobby.

**Acceptance Criteria:**
- [ ] WebSocket endpoint at `/ws/lobby`
- [ ] Accepts connection and creates a PlayerSessionActor
- [ ] Handles the full message protocol (see US-008)
- [ ] Graceful disconnect handling
- [ ] Typecheck passes

### US-005: Lobby creation API and UI
**Description:** As a host, I want to create a multiplayer lobby by selecting a word group so I can invite others to play.

**Acceptance Criteria:**
- [ ] "Create Lobby" button on the group selector / game page
- [ ] Host selects a word group for the lobby
- [ ] API creates the lobby and returns the lobby code
- [ ] Host sees a waiting room with the lobby code prominently displayed
- [ ] Lobby code is copyable / shareable
- [ ] Typecheck passes

### US-006: Join lobby UI
**Description:** As a player, I want to join a lobby by entering a code so I can play with others.

**Acceptance Criteria:**
- [ ] "Join Lobby" input field on the home page
- [ ] Player enters the 6-character lobby code
- [ ] Player enters a display name
- [ ] On join, WebSocket connection established and player added to lobby
- [ ] Error message if lobby code is invalid or lobby is full/expired
- [ ] Typecheck passes

### US-007: Lobby waiting room and player list
**Description:** As a player in a lobby, I want to see who else is in the lobby while waiting for the game to start.

**Acceptance Criteria:**
- [ ] Waiting room shows lobby code, group name, and player list
- [ ] Player list updates in real-time as players join/leave
- [ ] Each player shows display name (and avatar if authenticated)
- [ ] Host has a "Start Game" button
- [ ] Non-host players see "Waiting for host to start..."
- [ ] Typecheck passes

### US-008: Real-time game play with WebSocket messages
**Description:** As a player, I want to play bingo in real-time where my marks are tracked and other players' progress is visible.

**Acceptance Criteria:**
- [ ] WebSocket message protocol implemented:
  - `lobby:join` (Client -> Server): join with lobby code + display name
  - `lobby:state` (Server -> Client): full lobby state on join
  - `player:joined` (Server -> All): new player entered
  - `player:left` (Server -> All): player disconnected
  - `game:start` (Server -> All): host started the game
  - `cell:mark` (Client -> Server): player marked/unmarked a cell
  - `player:progress` (Server -> All): updated mark count for a player
  - `player:bingo` (Server -> All): a player got BINGO
  - `game:restart` (Server -> All): host restarted the round
- [ ] Each player's board rendered independently (same words, different layout)
- [ ] Mark count per player shown in real-time (e.g., "7/24 marked")
- [ ] Typecheck passes

### US-009: Server-side bingo validation
**Description:** As a system, I need to validate bingo claims on the server so players can't cheat.

**Acceptance Criteria:**
- [ ] Server checks all 12 lines (5 rows, 5 columns, 2 diagonals) after each mark
- [ ] Bingo detected automatically — no client claim needed
- [ ] Broadcasts `player:bingo` with winner's name and winning line
- [ ] Game continues after first BINGO (track multiple bingos)
- [ ] Typecheck passes

### US-010: BINGO notification and winner display
**Description:** As a player, I want to see a prominent notification when any player achieves BINGO so the game has an exciting climax.

**Acceptance Criteria:**
- [ ] When `player:bingo` received, show winner notification overlay
- [ ] Winner's name displayed prominently
- [ ] Notification visible to all players in the lobby
- [ ] Game board remains playable after BINGO (for multiple winners)
- [ ] Bingo count / leaderboard shown in lobby sidebar
- [ ] Typecheck passes

### US-011: Host controls (restart game)
**Description:** As a lobby host, I want to restart the game so everyone gets fresh boards for another round.

**Acceptance Criteria:**
- [ ] "Restart Game" button visible only to the host
- [ ] Restart regenerates all players' boards (new shuffle from same word pool)
- [ ] All marks cleared, bingo counts reset
- [ ] Broadcasts `game:restart` to all players
- [ ] All players see their new boards simultaneously
- [ ] Typecheck passes

### US-012: Lobby auto-expiration
**Description:** As a system, I want inactive lobbies to auto-close so server resources are freed.

**Acceptance Criteria:**
- [ ] LobbyActor uses Akka ReceiveTimeout (configurable, default 30 minutes)
- [ ] After timeout with no activity, lobby self-destructs
- [ ] Connected players receive a "lobby expired" message
- [ ] LobbyManagerActor removes the lobby reference
- [ ] Typecheck passes

## Functional Requirements

- FR-1: LobbyManagerActor creates lobbies and generates unique 6-character codes
- FR-2: LobbyActor manages per-lobby state: players, boards, marks, game lifecycle
- FR-3: PlayerSessionActor bridges WebSocket <-> LobbyActor messages
- FR-4: WebSocket endpoint at `/ws/lobby` for real-time communication
- FR-5: Each player gets their own randomized board from the same word pool
- FR-6: Real-time player list with join/leave updates
- FR-7: Live progress indicator per player (mark count out of 24)
- FR-8: Server-side bingo validation on every mark event
- FR-9: BINGO broadcast to all players with winner's name
- FR-10: Game continues after first BINGO (multiple winners tracked)
- FR-11: Host can start and restart the game
- FR-12: Lobby auto-expires after configurable inactivity period
- FR-13: Lobby code is short, unique, and URL-safe

## Non-Goals

- No persistent lobby history (lobbies are ephemeral)
- No spectator mode
- No chat within lobbies
- No team play
- No matchmaking or automatic lobby assignment
- No lobby password protection
- No player kick/ban functionality

## Design Considerations

- Lobby waiting room: centered card with lobby code in large monospace font, player list below
- Progress indicators: horizontal bars or fraction display per player in sidebar
- BINGO notification: overlay similar to existing bingo banner but with winner's name
- Host controls: subtle buttons below the board (only visible to host)
- Mobile-friendly layout: board takes full width, player list in collapsible sidebar

## Technical Considerations

- Akka.NET actor hierarchy: LobbyManagerActor -> LobbyActor -> PlayerSessionActor
- WebSocket connection managed by ASP.NET Core middleware, bridged to actor system
- JSON serialization for WebSocket message protocol
- ReceiveTimeout for automatic lobby cleanup
- Consider reconnection strategy if WebSocket disconnects mid-game
- Lobby state is in-memory only (no persistence needed for ephemeral lobbies)

## Success Metrics

- Lobby creation and joining works in under 5 seconds
- Player list updates in real-time (< 500ms latency)
- Bingo detection is accurate and server-validated
- Lobbies auto-expire without manual cleanup
- 10+ concurrent players per lobby without performance issues

## Open Questions

- Should lobbies have a maximum player count?
- Should disconnected players be able to reconnect and resume?
- Should the host role transfer if the host disconnects?
- Should lobby codes be reusable after expiration?
- WebSocket or SignalR for the transport layer?
