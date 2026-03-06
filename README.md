![Bullshit Bingo](docs/header.png)

# Bullshit Bingo

A web-based Bullshit Bingo app — create custom word groups, share them with friends, and play together in real time.

## Features

- **Custom word groups** — create and manage your own bingo word lists
- **Shareable boards** — invite others to play with your word groups via link
- **Public & private groups** — control who can see and use your lists
- **OAuth login** — sign in with GitHub or Google
- **Gravatar support** — profile avatars pulled from your email
- **Responsive UI** — works on desktop and mobile

![Bullshit Bingo Overview](docs/groups.png)

## Self-hosting with Docker Compose

The easiest way to run Bullshit Bingo is with the pre-built images from GitHub Container Registry.

**1. Download the compose file**

```bash
curl -O https://raw.githubusercontent.com/Dirnei/bsbingo/main/docker-compose.ghcr.yml
```

**2. Start the stack**

```bash
docker compose -f docker-compose.ghcr.yml up -d
```

**3. Open the app**

Go to **http://localhost:8080** and start playing.

### Configuration

All settings are configured via environment variables in `docker-compose.ghcr.yml`.

| Variable | Description | Default |
|---|---|---|
| `MongoDB__ConnectionString` | MongoDB connection string | `mongodb://root:example@mongodb:27017/?authSource=admin` |
| `MongoDB__Database` | Database name | `bsbingo` |

#### OAuth (optional)

To enable GitHub / Google login, uncomment and fill in the OAuth variables in the compose file:

| Variable | Description |
|---|---|
| `OAuth__GitHub__ClientId` | GitHub OAuth App client ID |
| `OAuth__GitHub__ClientSecret` | GitHub OAuth App client secret |
| `OAuth__Google__ClientId` | Google OAuth client ID |
| `OAuth__Google__ClientSecret` | Google OAuth client secret |

### Updating

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and project structure.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + TypeScript |
| Backend | C# / ASP.NET Core (.NET 10) + Akka.NET |
| Database | MongoDB 7 |
| Containerization | Docker |
