# PRD: Phase 1 — Foundation & Core App

## Introduction

Transform the existing single-file Bullshit Bingo prototype (`bullshit-bingo.html`) into a full-stack web application with a C#/Akka.NET backend and Vite+TypeScript frontend. The game fetches words from MongoDB instead of a hardcoded array, and players can select from different word groups before starting a game.

The existing prototype is a fully working 5x5 bingo board with shuffle, mark, bingo detection, and a dark industrial UI — it serves as the design reference.

## Goals

- Scaffold a full-stack project with C#/ASP.NET Core backend and Vite+TypeScript frontend
- Set up Akka.NET actor system with Akka.Hosting and Servus.Akka for DI
- Store word groups in MongoDB and serve them via REST API
- Seed the existing 40 "Smart Factory Edition" buzzwords on first startup
- Extract the frontend from the HTML prototype into TypeScript components
- Provide a group selector so players can choose which word set to play
- Containerize the app with Docker Compose (app + MongoDB)

## User Stories

### Task-001: Scaffold solution and actor system
**Description:** As a developer, I need the project scaffolded with ASP.NET Core, Akka.NET (via Akka.Hosting + Servus.Akka), and MongoDB so I can build features on a solid foundation.

**Acceptance Criteria:**
- [x] Solution contains `src/BsBingo.Server` (C# backend) and `client/` (Vite + TypeScript frontend)
- [x] ASP.NET Core host starts with Akka.NET actor system via Akka.Hosting + Servus.Akka
- [x] MongoDB connection configured via `appsettings.json` / environment variables
- [x] `docker-compose.yml` runs the app + MongoDB together
- [x] Application starts and responds to health check

### Task-002: Create Group data model and MongoDB integration
**Description:** As a developer, I need a Group document model stored in MongoDB so word groups can be persisted and retrieved.

**Acceptance Criteria:**
- [x] Group document model with fields: `_id`, `name`, `description`, `words[]`, `visibility` ("public"), `createdBy` (nullable), `createdAt`, `updatedAt`
- [x] MongoDB collection `groups` is created automatically
- [x] Group requires `name` and at least 24 words
- [x] Typecheck passes

### Task-003: Implement GroupActor
**Description:** As a developer, I need a GroupActor that manages word groups via Akka.NET messages so CRUD operations go through the actor system.

**Acceptance Criteria:**
- [ ] GroupActor registered via Servus.Akka DI integration
- [ ] Handles `GetAllGroups` message — returns list of all groups
- [ ] Handles `GetGroupById` message — returns a single group with its words
- [ ] GroupActor reads from MongoDB
- [ ] Message types defined in `Messages/` folder
- [ ] Typecheck passes

### Task-004: Implement GameActor
**Description:** As a developer, I need a GameActor that generates a randomized 5x5 board from a group's word pool so each game is unique.

**Acceptance Criteria:**
- [ ] GameActor receives `NewGame { GroupId }` message
- [ ] Fetches the group's words, shuffles, picks 24, inserts FREE space at center (index 12)
- [ ] Returns a `Board` with 25 cells in randomized order
- [ ] Different calls produce different boards (random shuffle)
- [ ] Typecheck passes

### Task-005: Seed default buzzwords on first startup
**Description:** As a player, I want the "Smart Factory Edition" word group pre-loaded so I can play immediately without creating a group first.

**Acceptance Criteria:**
- [ ] On first startup, if no groups exist, seed a group named "Smart Factory Edition"
- [ ] Contains all 40 buzzwords from the existing HTML prototype (Smart Factory, Committed, Zukunftsorientiert, Transparency, Industry 4.0, Module, Roadmap, Quick Win, Synergien nutzen, Alignment, Low Hanging Fruit, Proof of Concept, MVP, Skalierbar, Cloud-native, Holistic, KPI, Platform Strategy, Future-proof, IoT, Edge, DevOps, Innovation, Workshop, Das klaren wir im nachsten Meeting, Ownership, To be defined, Wir sind noch in der Findungsphase, Ganzheitlich, Nachhaltigkeit, Lean, DSGVO-konform, Prozessoptimierung, Das ist nicht in Scope, P3 Replacement, Digital Twin, Connectivity, Predictive Maintenance, Digital Excellence, Pune)
- [ ] Seed runs only once (idempotent — skips if group already exists)
- [ ] Typecheck passes

### Task-006: Create REST API endpoints
**Description:** As a frontend developer, I need API endpoints to list groups, get group details, and generate new game boards.

**Acceptance Criteria:**
- [ ] `GET /api/groups` — returns list of groups (id, name, description, word count)
- [ ] `GET /api/groups/{id}` — returns group details including all words
- [ ] `POST /api/game/new?groupId={id}` — returns a randomized 25-cell board
- [ ] Endpoints use minimal API style (not controllers)
- [ ] Endpoints route through the actor system (GroupActor / GameActor)
- [ ] Returns proper HTTP status codes (200, 404)
- [ ] Typecheck passes

### Task-007: Extract frontend into Vite + TypeScript
**Description:** As a developer, I need the frontend extracted from the single HTML file into a proper Vite + TypeScript project while preserving the existing look and feel.

**Acceptance Criteria:**
- [ ] Vite + TypeScript project in `client/` directory
- [ ] CSS ported from `bullshit-bingo.html` (CSS variables, fonts, animations)
- [ ] Dark industrial aesthetic preserved (colors, grid background, fonts: Bebas Neue, IBM Plex Mono/Sans)
- [ ] Board component renders a 5x5 grid
- [ ] Cell component handles mark/unmark toggle
- [ ] FREE space at center (index 12) is auto-marked and not clickable
- [ ] Bingo detection works for all 12 lines (5 rows, 5 columns, 2 diagonals)
- [ ] Bingo banner and counter display correctly
- [ ] Typecheck passes

### Task-008: Fetch words from API instead of hardcoded array
**Description:** As a player, I want the game to load words from the server so different word groups can be used.

**Acceptance Criteria:**
- [ ] Frontend fetches board from `POST /api/game/new?groupId={id}`
- [ ] Board renders the 25 words returned by the API
- [ ] No hardcoded word arrays in the frontend
- [ ] Loading state shown while fetching
- [ ] Error state shown if API call fails
- [ ] Typecheck passes

### Task-009: Group selector UI
**Description:** As a player, I want to choose a word group before starting a game so I can play with different sets of buzzwords.

**Acceptance Criteria:**
- [ ] Group selector shown before the game board (home page or overlay)
- [ ] Fetches available groups from `GET /api/groups`
- [ ] Each group shows name, description, and word count
- [ ] Clicking a group starts a new game with that group's words
- [ ] Matches the existing dark industrial aesthetic
- [ ] Typecheck passes

### Task-010: Docker Compose setup
**Description:** As a developer, I need a Docker Compose configuration so the full stack (backend + MongoDB) can be started with a single command.

**Acceptance Criteria:**
- [ ] `docker-compose.yml` at project root
- [ ] MongoDB service with persistent volume
- [ ] Backend service with connection to MongoDB
- [ ] Frontend either served by backend or via Vite dev proxy
- [ ] `docker compose up` starts the full application
- [ ] Environment variables for MongoDB URI configurable

## Functional Requirements

- FR-1: ASP.NET Core host with Akka.NET actor system configured via Akka.Hosting + Servus.Akka
- FR-2: MongoDB connection using `MongoDB.Driver` with configurable connection string
- FR-3: GroupActor handles `GetAllGroups` and `GetGroupById` messages, reads from MongoDB
- FR-4: GameActor handles `NewGame` message, generates randomized 25-cell board (24 words + FREE center)
- FR-5: Seed 40 "Smart Factory Edition" buzzwords on first startup if no groups exist
- FR-6: `GET /api/groups` returns all groups with id, name, description, word count
- FR-7: `GET /api/groups/{id}` returns full group details including words
- FR-8: `POST /api/game/new?groupId={id}` returns a shuffled 25-cell board
- FR-9: Frontend renders a 5x5 bingo grid with mark/unmark toggle per cell
- FR-10: FREE space always at center (index 12), auto-marked, not clickable
- FR-11: Bingo detection for all 12 possible lines (5 rows, 5 columns, 2 diagonals)
- FR-12: Bingo banner displayed with green highlight on winning cells
- FR-13: Group selector fetches and displays available groups before game starts
- FR-14: "New Game" button reshuffles the board from the same group
- FR-15: "Reset" button clears all marks except FREE space

## Non-Goals

- No user authentication (Phase 3)
- No group creation/editing via UI (Phase 2)
- No multiplayer/lobby support (Phase 4)
- No private groups or sharing (Phase 3)
- No mobile-specific optimizations beyond basic responsiveness (Phase 5)
- No sound effects or confetti animations (Phase 5)

## Design Considerations

- Preserve the existing dark industrial UI from `bullshit-bingo.html`:
  - Background: `#0e0f11` with subtle grid pattern
  - Panel: `#16181c` with `#2a2d35` borders
  - Accent: `#f5820a` (orange), Win: `#00e5a0` (green)
  - Fonts: Bebas Neue (headings), IBM Plex Mono (labels/cells), IBM Plex Sans (body)
- CSS variables for theming (already defined in prototype)
- Cell animations: marked state with orange glow, bingo line with green pulse
- Responsive grid that works down to ~360px width

## Technical Considerations

- Akka.NET + Akka.Hosting for actor system lifecycle management
- Servus.Akka for DI integration and actor registration
- MongoDB.Driver for direct MongoDB access (no ORM)
- Vite dev server proxies API calls to backend during development
- Structured logging with Serilog
- Configuration via `appsettings.json` + environment variable overrides

## Success Metrics

- Application starts with `docker compose up` and is playable within 30 seconds
- Board loads words from MongoDB instead of hardcoded array
- All 12 bingo lines detected correctly
- Existing visual design faithfully preserved
- Seed data loads on first startup without manual intervention

## Open Questions

- Should the Vite frontend be served by the ASP.NET backend in production (SPA hosting) or as a separate container?
- Should we use SignalR from Phase 1 for future WebSocket readiness, or plain REST is fine for now?
- Should the backend use Aspire for local development orchestration?
