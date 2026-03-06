# Contributing

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/)
- [Docker](https://www.docker.com/) (for MongoDB)

## Local Development

### 1. Start MongoDB

```bash
docker compose up mongodb -d
```

### 2. Start the Backend

```bash
cd src/BsBingo.Server
dotnet run
```

The API runs at **http://localhost:8080**.

### 3. Start the Frontend

```bash
cd client
npm install
npm run dev
```

Vite dev server starts at **http://localhost:5173** (proxies API calls to the backend).

## Building with Docker Compose

To build and run everything locally from source:

```bash
docker compose up --build
```

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
├── docker-compose.yml      # Local dev / build-from-source
└── docker-compose.ghcr.yml # Pre-built images from GHCR
```
