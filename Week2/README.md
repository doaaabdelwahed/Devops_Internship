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
