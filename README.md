Week1 # NestJS + Angular Microservices (Docker)

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


