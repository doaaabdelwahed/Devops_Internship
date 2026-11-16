# NestJS + Angular Microservices (Docker)

- **Backend** — NestJS API on port `3000` (`/health`, `/info`)
- **Frontend** — Angular served by Nginx on port `4200`; proxies `/api/*` to the backend

Both images are Alpine-based and run as non-root (UID `1001`).

## Run

```bash
docker compose up -d --build
```

Open http://localhost:4200

Stop: `docker compose down`

## Endpoints

| URL | Description |
|---|---|
| http://localhost:4200 | Angular app |
| http://localhost:4200/health | Frontend health |
| http://localhost:4200/info | Frontend info |
| http://localhost:4200/api/health | Backend health (via Nginx) |
| http://localhost:4200/api/info | Backend info (via Nginx) |
| http://localhost:3000/health | Backend health (direct) |
| http://localhost:3000/info | Backend info (direct) |

## Tech Stack

NestJS · Angular · Nginx · Docker Compose
