# NestJS + Angular Microservices (Docker)

Two independently built and deployed services, orchestrated with Docker Compose:

- **Backend** (`services/backend`): NestJS 11 API on port `3000`, exposing `/health` and `/info`.
- **Frontend** (`services/frontend`): Angular 20 app served by Nginx on port `4200`. Nginx also has its own `/health` and `/info` and reverse-proxies `/api/*` to the backend.

Both images use multi-stage Alpine builds, run as a **non-root user (UID `1001`)**, and include a Docker `HEALTHCHECK`.

## Architecture

```text
Browser ──► localhost:4200 ──► angular-frontend (Nginx :8080)
                                  ├─ /          → Angular app
                                  ├─ /health    → Nginx JSON
                                  ├─ /info      → Nginx JSON
                                  └─ /api/*  ──► nestjs-backend (NestJS :3000)
```

Nginx strips the `/api/` prefix before forwarding (`/api/health` → `http://backend:3000/health`):

```nginx
location /api/ {
    proxy_pass http://backend:3000/;
}
```

The containers share the `app-network` bridge network and reach each other by service name (`backend`), not `localhost`.

## Project Structure

```text
.
├── compose.yaml
└── services/
    ├── backend/      # NestJS API + Dockerfile
    └── frontend/     # Angular app + nginx.conf + Dockerfile
```

## Run with Docker Compose

```bash
docker compose up -d --build   # build and start
docker compose ps              # check status (wait for "healthy")
docker compose logs -f         # follow logs
docker compose down            # stop and remove
```

Open **http://localhost:4200**.

Rebuild one service after changes: `docker compose up -d --build backend` (or `frontend`).

<details>
<summary>Run without Compose</summary>

```bash
docker build -t backend-image  ./services/backend
docker build -t frontend-image ./services/frontend

docker network create app-network
docker run -d --name nestjs-backend   --network app-network --network-alias backend -p 3000:3000 backend-image
docker run -d --name angular-frontend --network app-network -p 4200:8080 frontend-image
```

`--network-alias backend` is required because Nginx proxies to `http://backend:3000`.
</details>

<details>
<summary>Local development (without Docker)</summary>

```bash
cd services/backend  && npm install && npm run start:dev   # http://localhost:3000
cd services/frontend && npm install && npm start           # http://localhost:4200
```

`proxy.conf.json` forwards `/api/*` to the backend during `ng serve`.
</details>

## Endpoints

| URL | Served by | Response |
|---|---|---|
| http://localhost:4200 | Nginx | Angular status dashboard |
| http://localhost:4200/health | Nginx | `{"status":"ok","service":"frontend","framework":"Angular"}` |
| http://localhost:4200/info | Nginx | `{"service":"frontend","framework":"Angular","version":"1.0.0"}` |
| http://localhost:4200/api/health | NestJS via proxy | Backend `/health` |
| http://localhost:4200/api/info | NestJS via proxy | Backend `/info` |
| http://localhost:3000/health | NestJS | `{"status":"ok","service":"backend","timestamp":"…"}` |
| http://localhost:3000/info | NestJS | `{"service":"backend","framework":"NestJS","runtime":"v22.x","timestamp":"…"}` |

## Verify

```bash
curl http://localhost:4200/api/health   # must return the backend response

docker inspect --format='{{.Config.User}}' nestjs-backend            # 1001
docker inspect --format='{{.State.Health.Status}}' angular-frontend  # healthy
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Port already in use | Change the host port in `compose.yaml`, e.g. `"4201:8080"` |
| `/api/*` returns 502 | Backend is down: check `docker compose logs backend` |
| `host not found in upstream "backend"` | Start the backend first; without Compose, add `--network-alias backend` |
| Changes not applied | Rebuild: `docker compose up -d --build <service>` |

## Tech Stack

NestJS 11 · Angular 20 · Node.js 22 · Nginx 1.28 · Docker Compose · Alpine Linux
