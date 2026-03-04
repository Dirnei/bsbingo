# Bullshit Bingo — Project Plan

## Vision

Transform the existing single-page Bullshit Bingo prototype (`bullshit-bingo.html`) into a full-stack web application with a C#/Akka.NET backend, MongoDB persistence, customizable word groups, user accounts, and real-time multiplayer support.

The existing `bullshit-bingo.html` is a fully working single-file game (5x5 board, shuffle, mark, bingo detection, dark industrial UI) and serves as the design reference and starting point for the frontend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vite + TypeScript (evolve from existing `bullshit-bingo.html`) |
| **Backend** | C# / ASP.NET Core minimal API |
| **Actor System** | Akka.NET + Akka.Hosting |
| **Framework Extensions** | Servus.Core, Servus.Akka (DI integration, actor registration) |
| **Database** | MongoDB (MongoDB.Driver) |
| **Real-time** | ASP.NET Core WebSockets (or SignalR) |
| **Auth** | OAuth 2.0 (GitHub + Google) via ASP.NET Core Authentication |
| **Containerization** | Docker Compose (app + MongoDB) |

---

## Phase 1 — Foundation & Core App

**Goal:** Scaffold the full-stack project, connect to MongoDB, and serve the bingo game with words from the database instead of hardcoded in HTML.

### Backend (C# / Akka.NET)

- ASP.NET Core host with Akka.NET actor system (via Akka.Hosting + Servus.Akka)
- **GroupActor** — manages word groups, handles CRUD messages
- **GameActor** — generates a randomized 5x5 board from a group's word pool
- MongoDB connection via `MongoDB.Driver`
- Seed the existing 40 "Smart Factory Edition" buzzwords on first startup
- Minimal API endpoints:
  - `GET /api/groups` — list available word groups
  - `GET /api/groups/{id}` — get group details + words
  - `POST /api/game/new?groupId={id}` — get a new randomized board (25 words)

### Frontend (Vite + TypeScript)

- Extract the board logic from `bullshit-bingo.html` into TypeScript components
- Keep the existing dark industrial aesthetic (CSS variables, fonts, animations)
- Fetch words from the API instead of a hardcoded array
- Group selector (dropdown/card list) before starting a game
- All existing functionality preserved: mark cells, bingo detection, reset, shuffle

### Data Model

```
Group {
  _id: ObjectId
  name: string              // e.g. "Smart Factory Edition"
  description?: string
  words: string[]           // the buzzword list (>= 24 entries)
  visibility: "public"      // Phase 1: all public
  createdBy?: ObjectId      // null for seed data
  createdAt: DateTime
  updatedAt: DateTime
}
```

### Deliverables

- [ ] Solution scaffolding (`/src/BsBingo.Server`, `/client`)
- [ ] Akka.NET actor system setup with Servus.Akka for DI + actor registration
- [ ] GroupActor + GameActor with message protocols
- [ ] MongoDB integration + Group collection
- [ ] Seed data (40 Smart Factory buzzwords from existing HTML)
- [ ] Minimal API endpoints (groups, new game)
- [ ] Vite + TypeScript frontend extracted from `bullshit-bingo.html`
- [ ] Group selector UI
- [ ] Docker Compose (app + MongoDB)

---

## Phase 2 — Group Management (CRUD)

**Goal:** Allow anyone (anonymous for now) to create and manage word groups via the UI.

### Backend

- Extend GroupActor with Create, Update, Delete message handlers
- Validation: group must have >= 24 words, name required
- API endpoints:
  - `POST /api/groups` — create group
  - `PUT /api/groups/{id}` — update group
  - `DELETE /api/groups/{id}` — delete group

### Frontend

- Group management pages (list, create, edit)
- Word list editor component (add, remove, drag-reorder)
- Confirmation dialogs for destructive actions
- Form validation (min 24 words, required fields)

### Deliverables

- [ ] Full CRUD on GroupActor
- [ ] Group management API endpoints
- [ ] Group list / create / edit pages
- [ ] Word list editor component
- [ ] Server-side + client-side validation

---

## Phase 3 — User Authentication & Ownership

**Goal:** Add user accounts so groups can be owned, with private/public sharing.

### Backend

- OAuth 2.0 login via **GitHub** and **Google** (ASP.NET Core external auth providers)
- No custom registration/password flow — users sign in with their existing accounts
- On first login, a User document is created from the OAuth profile (name, email, avatar)
- JWT issued after OAuth callback for API authentication (cookie or Bearer token)
- **UserActor** — manages user state, linked OAuth identities
- Groups tied to their creator
- Visibility: `public` (anyone can play) or `private` (owner + invited)
- Share link for private groups (token-based invite URL)
- Anonymous users can still play public groups (read-only)

### Data Model Updates

```
User {
  _id: ObjectId
  displayName: string
  email: string             // from OAuth profile
  avatarUrl?: string        // from OAuth profile
  oauthProviders: [{
    provider: "github" | "google"
    providerId: string      // external user ID
  }]
  createdAt: DateTime
}

Group (updated) {
  ...
  visibility: "public" | "private"
  createdBy: ObjectId       // required, ref -> User
  sharedWith: ObjectId[]    // users with access to private groups
  inviteToken?: string      // for share links
}
```

### Frontend

- Login page with "Sign in with GitHub" / "Sign in with Google" buttons
- OAuth redirect flow (no forms, no password fields)
- "My Groups" dashboard
- Public/private toggle on group creation
- Share link generation + accept invite flow
- User avatar + name in header (from OAuth profile)

### Deliverables

- [ ] ASP.NET Core OAuth setup (GitHub + Google providers)
- [ ] OAuth callback → JWT issuance
- [ ] UserActor + user upsert on first login
- [ ] Auth middleware for protected routes
- [ ] `GET /api/auth/me` — current user info
- [ ] Login UI with OAuth buttons
- [ ] "My Groups" dashboard
- [ ] Public/private toggle + share links
- [ ] Permission checks on group edit/delete

---

## Phase 4 — Multiplayer Lobbies

**Goal:** Real-time multiplayer — players in the same lobby see each other's progress and get notified on BINGO.

### Architecture (Actor Model)

This is where Akka.NET really shines. Each lobby is a stateful actor:

- **LobbyManagerActor** — creates/finds lobbies, generates lobby codes
- **LobbyActor** (one per lobby) — manages lobby state, players, game lifecycle
  - Holds player list, each player's board and marked cells
  - Validates bingo claims server-side
  - Broadcasts events to all connected players via WebSocket
  - Self-destructs after inactivity (ReceiveTimeout)
- **PlayerSessionActor** (one per WebSocket connection) — bridges WebSocket <-> LobbyActor messages

### Features

- **Create lobby:** host picks a group, gets a lobby code (e.g. `ABCD12`)
- **Join lobby:** enter code or use share link
- Players each get their own randomized board (same word pool, different layout)
- Real-time player list (who's in the lobby)
- Live progress indicator per player (e.g. "7/24 marked")
- **BINGO alert:** when any player completes a line, all players get notified with the winner's name
- Game continues after first BINGO (track multiple bingos / leaderboard)
- Host can restart the game for everyone
- Lobby auto-closes after inactivity (Akka ReceiveTimeout)

### WebSocket Messages

| Message | Direction | Description |
|---|---|---|
| `lobby:join` | Client -> Server | Join with lobby code + display name |
| `lobby:state` | Server -> Client | Full lobby state on join |
| `player:joined` | Server -> All | New player entered |
| `player:left` | Server -> All | Player disconnected |
| `game:start` | Server -> All | Host started the game |
| `cell:mark` | Client -> Server | Player marked/unmarked a cell |
| `player:progress` | Server -> All | Updated mark count for a player |
| `player:bingo` | Server -> All | A player got BINGO! |
| `game:restart` | Server -> All | Host restarted the round |

### Deliverables

- [ ] LobbyManagerActor + LobbyActor + PlayerSessionActor
- [ ] WebSocket endpoint (`/ws/lobby`)
- [ ] Lobby creation + join API
- [ ] Lobby code generation (short, unique, URL-safe)
- [ ] Server-side bingo validation
- [ ] Lobby UI (waiting room, player list, progress indicators)
- [ ] Real-time board sync (mark events)
- [ ] BINGO broadcast + winner notification
- [ ] Host controls (start, restart)
- [ ] Lobby expiration via ReceiveTimeout

---

## Phase 5 — Polish & Nice-to-Haves

- **Responsive design** — mobile-first, works well on phones during meetings
- **Sound effects** — optional BINGO sound / cell click feedback
- **Animations** — confetti on BINGO (keep the current green glow + add particles)
- **Dark/light theme** toggle
- **Localization** — German / English (current prototype is German)
- **PWA** — installable on phone home screen, works offline for single-player
- **Analytics** — most-clicked words, average game duration
- **Rate limiting & abuse protection** on public APIs

---

## Non-Functional Requirements

| Concern | Approach |
|---|---|
| **Hosting** | Docker Compose for self-hosting |
| **CI/CD** | GitHub Actions — lint, test, build, Docker image |
| **Testing Backend** | xUnit + Akka.NET TestKit |
| **Testing Frontend** | Vitest + Playwright (E2E) |
| **Configuration** | `appsettings.json` + environment variables (DB URI, JWT secret) |
| **Logging** | Serilog (structured JSON) |
| **Security** | CORS, rate limiting, input validation, JWT |

---

## Project Structure (Target)

```
bsbingo/
├── src/
│   └── BsBingo.Server/            # C# ASP.NET Core + Akka.NET backend
│       ├── Actors/
│       │   ├── GroupActor.cs       # Word group CRUD
│       │   ├── GameActor.cs        # Board generation
│       │   ├── UserActor.cs        # Auth & user state
│       │   ├── LobbyManagerActor.cs
│       │   ├── LobbyActor.cs       # Per-lobby game state
│       │   └── PlayerSessionActor.cs
│       ├── Models/                 # MongoDB document models
│       ├── Messages/               # Akka message types
│       ├── Services/               # MongoDB repos, auth services
│       ├── Endpoints/              # Minimal API route definitions
│       ├── Middleware/             # Auth, error handling
│       ├── Seed/                   # Default buzzword data
│       └── Program.cs
├── client/                         # Vite + TypeScript frontend
│   ├── src/
│   │   ├── components/             # Board, Cell, Lobby, GroupEditor
│   │   ├── pages/                  # Home, Game, Lobby, Groups, Auth
│   │   ├── hooks/                  # useWebSocket, useGame, useAuth
│   │   ├── api/                    # API client functions
│   │   └── styles/                 # CSS (ported from bullshit-bingo.html)
│   └── ...
├── bullshit-bingo.html             # Original prototype (reference)
├── docker-compose.yml
├── PLAN.md
└── README.md
```

---

## Milestones

| # | Milestone | Phase | Key Outcome |
|---|---|---|---|
| M1 | Playable with DB | Phase 1 | Words from MongoDB, group selector, actor system running |
| M2 | Self-service groups | Phase 2 | Anyone can create/edit word groups |
| M3 | User accounts | Phase 3 | Login, private groups, sharing |
| M4 | Multiplayer | Phase 4 | Real-time lobbies with BINGO alerts via Akka actors |
| M5 | Production-ready | Phase 5 | Polished, mobile-friendly, deployable |
