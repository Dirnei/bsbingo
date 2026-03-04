# Bullshit Bingo

A full-stack Bullshit Bingo web app with a C#/Akka.NET backend, MongoDB persistence, and a Vite + TypeScript frontend.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/)
- [Docker](https://www.docker.com/) (for MongoDB or full-stack deployment)

## Quick Start (Docker Compose)

Runs the backend, frontend, and MongoDB together:

```bash
docker compose up --build
```

The app is available at **http://localhost:5000**.

## Local Development

### 1. Start MongoDB

```bash
docker compose up mongodb -d
```

This starts MongoDB on `localhost:27017`.

### 2. Start the Backend

```bash
cd src/BsBingo.Server
dotnet run
```

The API runs at **http://localhost:5204**.

### 3. Start the Frontend

```bash
cd client
npm install
npm run dev
```

Vite dev server starts at **http://localhost:5173** (proxies API calls to the backend).

## Project Structure

```
bsbingo/
├── src/BsBingo.Server/     # C# ASP.NET Core + Akka.NET backend
│   ├── Actors/             # Akka.NET actors (GroupActor, GameActor)
│   ├── Endpoints/          # Minimal API routes
│   ├── Messages/           # Akka message types
│   ├── Models/             # MongoDB document models
│   └── Services/           # MongoDB services
├── client/                 # Vite + TypeScript frontend
│   └── src/
├── tasks/                  # PRD files per phase
├── docker-compose.yml
└── bullshit-bingo.html     # Original prototype (design reference)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + TypeScript |
| Backend | C# / ASP.NET Core (.NET 10) |
| Actor System | Akka.NET + Akka.Hosting + Servus.Akka |
| Database | MongoDB 7 |
| Containerization | Docker Compose |

## Configuration

The backend reads MongoDB settings from `appsettings.json` or environment variables:

| Setting | Default | Env Variable |
|---|---|---|
| Connection String | `mongodb://root:example@localhost:27017` | `MongoDB__ConnectionString` |
| Database Name | `bsbingo` | `MongoDB__Database` |

## RALPH (Autonomous Agent Loop)

This project includes `ralph.sh` for autonomous development iterations:

```bash
# Run 5 iterations (default)
./ralph.sh

# Run 10 iterations with a specific model
./ralph.sh --model claude-opus-4-6 10

# With adversarial review every 3 iterations
./ralph.sh --review-interval 3
```

See `IMPLEMENTATION_PLAN.md` for the task breakdown RALPH works from.
