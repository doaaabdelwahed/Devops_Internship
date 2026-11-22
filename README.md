Week1 # NestJS + Angular Microservices (Docker)

This repository contains two independently built and deployed services:

- **`services/backend`**: A NestJS HTTP API exposing `GET /health` and `GET /info`.
- **`services/frontend`**: An Angular application served by Nginx. Nginx also exposes `GET /health` and `GET /info` and acts as a reverse proxy, forwarding requests under `/api/` to the backend.

Each service has its own Docker image and container. Both services can be built and run independently and communicate over a shared Docker network.

Both Docker images use lightweight Alpine-based images and run as a non-root user with UID `1001`.

The frontend uses Nginx for its HTTP endpoints and Angular static files; it does not require a separate Node.js HTTP server.

## Architecture

```text
                    Browser / Client
                           |
                           |
                     localhost:4200
                           |
                           v
                 +--------------------+
                 |  Frontend Service  |
                 |   Nginx + Angular  |
                 |                    |
                 | GET /health        |
                 | GET /info          |
                 | GET /              |
                 | GET /api/*         |
                 +--------------------+
                           |
                           | /api/*
                           | Reverse Proxy
                           v
                 +--------------------+
                 |   Backend Service  |
                 |       NestJS       |
                 |                    |
                 | GET /health        |
                 | GET /info          |
                 +--------------------+
                           |
                           |
                     localhost:3000
```

### Request routing

| Request | Destination | Purpose |
|---|---|---|
| `/` | Angular static files served by Nginx | Display the frontend UI |
| `/health` | Nginx | Check frontend service health |
| `/info` | Nginx | Retrieve frontend service information |
| `/api/health` | NestJS backend | Access the backend health endpoint through Nginx |
| `/api/info` | NestJS backend | Access the backend info endpoint through Nginx |

The Nginx configuration uses:

```nginx
location /api/ {
    proxy_pass http://backend:3000/;
}
```

The trailing slash in `proxy_pass` means Nginx removes the `/api/` prefix before forwarding the request.

For example:

- `/api/health` is forwarded to `http://backend:3000/health`.
- `/api/info` is forwarded to `http://backend:3000/info`.

The frontend and backend communicate using the Docker network and the backend service/container name.

## Prerequisites

- Docker Engine or Docker Desktop.
- Docker Compose v2.
- Internet access during the first image build so npm can download dependencies.

## 1. Build the backend image

From the repository root:

```bash
docker build -t microservices-backend:1.0 ./services/backend
```

## 2. Build the frontend image

```bash
docker build -t microservices-frontend:1.0 ./services/frontend
```

## 3. Run the services using Docker Compose (Recommended)

The repository root contains `compose.yaml`.

Build the images and start both services:

```bash
docker compose up -d --build
```

Check the running containers:

```bash
docker compose ps
```

View the logs:

```bash
docker compose logs -f
```

View logs for a specific service:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

Stop the services:

```bash
docker compose down
```

Rebuild and restart after changing the Dockerfiles or application code:

```bash
docker compose up -d --build
```

To rebuild only the frontend:

```bash
docker compose up -d --build frontend
```

### Expected port mappings

The examples assume the following configuration in `compose.yaml`:

```yaml
services:
  backend:
    build:
      context: ./services/backend
    container_name: backend
    ports:
      - "3000:3000"
    networks:
      - microservices-net

  frontend:
    build:
      context: ./services/frontend
    container_name: frontend
    ports:
      - "4200:8080"
    networks:
      - microservices-net

networks:
  microservices-net:
    driver: bridge
```

Keep any existing environment variables, database services, volumes, and other backend configuration required by your application.

The important settings are:

- Backend listens on port `3000`.
- Nginx listens on port `8080` inside the frontend container.
- Frontend port mapping is `4200:8080`.
- Both services share the `microservices-net` network.
- Nginx resolves `backend` through Docker's internal DNS.

**Note:** Docker Compose creates the declared network automatically. You do not need to run `docker network create` when using this Compose configuration.

## 4. Run the services independently using Docker

You can also build and run each service manually without Docker Compose.

### Create the network

```bash
docker network create microservices-net
```

If the network already exists, reuse it.

### Run the backend

```bash
docker run -d \
  --name backend \
  --network microservices-net \
  -p 3000:3000 \
  microservices-backend:1.0
```

### Run the frontend

Start the backend first because Nginx forwards `/api/` requests to the backend container.

```bash
docker run -d \
  --name frontend \
  --network microservices-net \
  -p 4200:8080 \
  microservices-frontend:1.0
```

The frontend can now serve Angular and expose its own HTTP endpoints independently of the backend. Requests to `/api/` require the backend to be reachable.

To stop and remove the containers:

```bash
docker rm -f frontend backend
```

Remove the network when it is no longer needed:

```bash
docker network rm microservices-net
```

**Important:** Do not run the manual containers and the Compose containers with the same container names simultaneously. Choose one approach at a time.

## 5. Verify the health endpoints

The endpoints can be tested using `curl`.

### Backend health

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "backend",
  "timestamp": "<current timestamp>"
}
```

The timestamp is generated by the backend at request time.

### Backend information

```bash
curl http://localhost:3000/info
```

The response contains information about the backend service, as implemented by the NestJS application.

### Frontend health

```bash
curl http://localhost:4200/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "frontend"
}
```

### Frontend information

```bash
curl http://localhost:4200/info
```

Expected response:

```json
{
  "service": "frontend",
  "framework": "Angular",
  "server": "Nginx"
}
```

The exact response bodies must match the implementation in the backend and Nginx configuration.

## 6. Verify the Angular application

Open the frontend in your browser:

```text
http://localhost:4200
```

Angular should be served by Nginx.

The frontend should call backend APIs using relative URLs under `/api/`, rather than hardcoding the backend host and port into browser requests.

For example:

```text
/api/health
/api/info
```

This allows Nginx to forward the requests to the backend over the internal Docker network.

### Test the reverse proxy

Backend health through Nginx:

```bash
curl http://localhost:4200/api/health
```

Backend information through Nginx:

```bash
curl http://localhost:4200/api/info
```

These requests should return the backend responses, not the frontend responses.

## 7. Verify non-root execution

Both images are intended to run as UID `1001`.

Check the configured user for the backend container:

```bash
docker inspect --format='{{.Config.User}}' backend
```

Check the configured user for the frontend container:

```bash
docker inspect --format='{{.Config.User}}' frontend
```

Expected output for both:

```text
1001
```

When using Docker Compose, use the same commands with the actual container names configured in `compose.yaml`.

If the output is empty or different, inspect the corresponding Dockerfile and the `USER` instruction.

## 8. Useful Docker commands

List running containers:

```bash
docker ps
```

List all containers, including stopped containers:

```bash
docker ps -a
```

View backend logs:

```bash
docker logs backend
```

View frontend logs:

```bash
docker logs frontend
```

Inspect the frontend container:

```bash
docker inspect frontend
```

Check the frontend health-check status:

```bash
docker inspect --format='{{json .State.Health}}' frontend
```

This health-check command requires a `HEALTHCHECK` instruction in the frontend Dockerfile.

Inspect Docker networks:

```bash
docker network ls
docker network inspect microservices-net
```

## 9. Troubleshooting

### Port already in use

If port `4200` is already occupied, change the host-side port mapping.

For example:

```yaml
ports:
  - "4201:8080"
```

The frontend will then be available at:

```text
http://localhost:4201
```

The internal Nginx port remains `8080`.

### Frontend cannot reach backend

Check that:

- Both containers are attached to the same Docker network.
- The backend is running and listening on port `3000`.
- The Nginx configuration uses `proxy_pass http://backend:3000/;`.
- The backend container/service is resolvable by the name `backend`.
- The backend's `/health` endpoint responds successfully.

Remember that `localhost` inside a container refers to that same container, not another container. Use the backend service name to communicate between containers.

### Frontend returns a connection error

Check the port mapping:

```yaml
ports:
  - "4200:8080"
```

The left-hand side is the host port; the right-hand side is the port inside the container.

Then rebuild and recreate the frontend:

```bash
docker compose up -d --build frontend
```

Check the logs:

```bash
docker compose logs --tail=100 frontend
```

### Nginx fails to start

Check the Nginx configuration and its logs:

```bash
docker compose logs frontend
```

If needed, validate the configuration inside a running container:

```bash
docker exec frontend nginx -t
```

This validation command requires the container to be running.

Common causes include:

- Invalid Nginx syntax.
- A `server` block placed outside the `http` block in the main Nginx configuration.
- Missing configuration files.
- Permission problems when running as a non-root user.
- An incorrect listening port.

### Rebuild after changes

Rebuild and restart both services:

```bash
docker compose up -d --build
```

Rebuild only the backend:

```bash
docker compose up -d --build backend
```

Rebuild only the frontend:

```bash
docker compose up -d --build frontend
```

If you change the Nginx configuration or Dockerfile, rebuild the frontend image and recreate its container so the changes take effect.

## Endpoints Summary

| Service | URL | Purpose |
|---|---|---|
| Backend | `http://localhost:3000/health` | Backend health JSON |
| Backend | `http://localhost:3000/info` | Backend service information |
| Frontend | `http://localhost:4200/health` | Frontend health JSON |
| Frontend | `http://localhost:4200/info` | Frontend service information |
| Frontend UI | `http://localhost:4200` | Angular application |
| Frontend proxy | `http://localhost:4200/api/health` | Backend health through Nginx |
| Frontend proxy | `http://localhost:4200/api/info` | Backend information through Nginx |

## Summary

This project demonstrates:

- Independently built Docker images for the frontend and backend.
- A NestJS backend exposing health and information endpoints.
- An Angular application served by Nginx.
- Frontend health and information endpoints implemented in Nginx.
- Reverse proxying from Nginx to the backend through `/api/`.
- Docker networking and service-name-based communication.
- Non-root container execution.
- Docker Compose orchestration for local development and testing.


---

Week2 # NestJS + Angular Microservices — Kubernetes, Helm & Istio mTLS 

Two microservices from Week 1, deployed to a local Kubernetes cluster with a parameterized Helm chart, meshed with **Istio**, and secured with **strict mTLS**.

| Service | Tech | Container port | Kubernetes Service |
|---|---|---|---|
| Backend | NestJS 11 (Node 22) | `3000` | `backend:3000` |
| Frontend | Angular 20 + Nginx 1.28 | `8080` | `frontend-service:80` |

Nginx serves the Angular app and proxies `/api/*` to `http://backend:3000`. Both containers run as non-root (UID `1001`).

```text
Browser ─► port-forward :4200 ─► frontend-service ─► [frontend pod: nginx + istio-proxy]
                                                              │  mTLS (STRICT)
                                                              ▼
                                       backend ─► [backend pod: nestjs + istio-proxy]
```

## Project Structure

```text
.
├── compose.yaml                     # Week 1: run with Docker Compose
├── services/
│   ├── backend/                     # NestJS API + Dockerfile
│   └── frontend/                    # Angular + nginx.conf + Dockerfile
└── helm/microservices/
    ├── Chart.yaml
    ├── values.yaml                  # images, ports, replicas, resources, probes, Istio/mTLS
    └── templates/
        ├── backend-deployment.yaml
        ├── backend-service.yaml
        ├── frontend-deployment.yaml
        ├── frontend-service.yaml
        ├── peer-authentication.yaml # PeerAuthentication: mTLS mode (STRICT)
        ├── destination-rule.yaml    # ISTIO_MUTUAL for traffic to the backend
        └── NOTES.txt
```

## Prerequisites

Docker, `kubectl`, `helm` (v3), `minikube`, and optionally `istioctl`.

## 1. Start Minikube

Istio needs at least 6 GB of RAM and 3 CPUs:

```bash
minikube start --memory=6144 --cpus=3
kubectl get nodes
```

## 2. Build the images and load them into Minikube

```bash
docker build -t backend-image:1.0  ./services/backend
docker build -t frontend-image:1.0 ./services/frontend

minikube image load backend-image:1.0
minikube image load frontend-image:1.0
minikube image ls | grep -E "backend-image|frontend-image"
```

## 3. Install Istio with Helm

```bash
helm repo add istio https://istio-release.storage.googleapis.com/charts
helm repo update

kubectl create namespace istio-system
helm install istio-base istio/base -n istio-system --set defaultRevision=default
helm install istiod istio/istiod -n istio-system --wait

kubectl get pods -n istio-system
```

## 4. Enable automatic sidecar injection

```bash
kubectl create namespace microservices
kubectl label namespace microservices istio-injection=enabled
kubectl get namespace microservices --show-labels
```

## 5. Deploy the Helm chart

```bash
helm lint helm/microservices
helm install microservices helm/microservices -n microservices

kubectl get pods,svc -n microservices
```

Each pod should show **`2/2` READY**: the app container plus the `istio-proxy` sidecar.

Open the app:

```bash
kubectl port-forward -n microservices svc/frontend-service 4200:80
# http://localhost:4200
```

## 6. Strict mTLS

The chart creates:

- **`PeerAuthentication`** (`mode: STRICT`): pods in the namespace accept only mTLS traffic.
- **`DestinationRule`** (`ISTIO_MUTUAL`): the frontend's sidecar always calls the backend over mTLS.

```bash
kubectl get peerauthentication,destinationrule -n microservices
```

Change the mode through values:

```bash
helm upgrade microservices helm/microservices -n microservices --set istio.mtls.mode=PERMISSIVE
helm upgrade microservices helm/microservices -n microservices --set istio.mtls.mode=STRICT
```

## 7. Verify mTLS

**Inside the mesh it works** (frontend → backend, encrypted by the sidecars):

```bash
kubectl exec -n microservices deploy/frontend -c frontend -- wget -qO- http://backend:3000/health
```

**Plain-text traffic from outside the mesh is rejected:**

```bash
kubectl create namespace legacy                      # no injection label, so no sidecar
kubectl run curl -n legacy --image=curlimages/curl --restart=Never --command -- sleep 3600
kubectl wait -n legacy --for=condition=Ready pod/curl

kubectl exec -n legacy curl -- curl -sS -m 5 http://backend.microservices:3000/health
# STRICT     → "Connection reset by peer" (rejected)
# PERMISSIVE → returns the health JSON
```

**Check the workload certificates** (requires `istioctl`):

```bash
istioctl proxy-config secret deploy/backend -n microservices
```

## Configuration (`values.yaml`)

| Key | Default | Description |
|---|---|---|
| `backend.image.repository` / `.tag` | `backend-image` / `1.0` | Backend image |
| `frontend.image.repository` / `.tag` | `frontend-image` / `1.0` | Frontend image |
| `*.replicaCount` | `1` | Pods per service |
| `backend.port` / `frontend.port` | `3000` / `8080` | Container ports |
| `frontend.service.port` | `80` | Frontend Service port |
| `*.resources` | 100m / 128Mi request | CPU and memory |
| `*.healthCheck.path` | `/health` | Readiness and liveness probe path |
| `istio.enabled` | `true` | Adds the sidecar-injection label to pods |
| `istio.mtls.mode` | `STRICT` | `STRICT` or `PERMISSIVE` |

## Clean Up

```bash
helm uninstall microservices -n microservices
kubectl delete namespace microservices legacy
helm uninstall istiod istio-base -n istio-system
minikube delete
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `ErrImagePull` / `ImagePullBackOff` | The image isn't loaded into Minikube. Re-run step 2 and keep `pullPolicy: IfNotPresent` |
| Pods `1/1` instead of `2/2` | Label the namespace (step 4), then run `kubectl rollout restart deploy -n microservices` |
| Frontend `CrashLoopBackOff`: `host not found in upstream "backend"` | The backend Service must be named exactly `backend` |
| `no matches for kind "PeerAuthentication"` | Install Istio (step 3) before the chart |
| Istio pods `Pending` | Not enough resources: restart Minikube with `--memory=6144 --cpus=3` |

## Run with Docker Compose (Week 1)

```bash
docker compose up -d --build   # http://localhost:4200
docker compose down
```




