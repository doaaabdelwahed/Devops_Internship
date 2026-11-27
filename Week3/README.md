# Week 3 — Kong API Gateway + CI/CD with GitHub Actions

Builds on Week 2 (NestJS + Angular on Minikube, Helm chart, Istio strict mTLS) and adds:

- **Kong API Gateway** in front of the cluster, with routing rules for the frontend and the API
- **Rate limiting** (5 requests/minute) and **API key auth** on the API route
- **GitHub Actions CI**: lint + tests + build, then build and push Docker images to GHCR
- **Image tags based on Git commit SHAs**

```text
                                   ┌──────────── namespace: microservices (Istio STRICT mTLS) ─────────────┐
Client ─► :8080 ─► Kong gateway ──►│  /       → frontend-service:80 → [nginx + istio-proxy]                │
          (namespace kong,     mTLS│  /api/*  → backend:3000         → [nestjs + istio-proxy]               │
           with istio-proxy)       │            (key-auth + rate-limit 5/min, /api prefix stripped)         │
                                   └────────────────────────────────────────────────────────────────────────┘
```

## What's new compared with Week 2

| File | Purpose |
|---|---|
| `helm/microservices/templates/kong-ingress.yaml` | Two Kong routes: `/` → frontend (public), `/api` → backend (protected) |
| `helm/microservices/templates/kong-plugins.yaml` | `KongPlugin`s: `rate-limiting` (5/min) and `key-auth` |
| `helm/microservices/templates/*-service.yaml` | `ingress.kubernetes.io/service-upstream: "true"` so Kong calls the Service and Istio can apply mTLS |
| `helm/microservices/values.yaml` | New `kong:` section (paths, limit, toggles) |
| `kong/consumer.yaml` | `KongConsumer` + API key Secret (kept out of the chart) |
| `kong/test-gateway.sh` | Script that tests routing, auth and the rate limit |
| `services/*/eslint.config.mjs` | ESLint (typescript-eslint) for both services |
| `services/backend/src/app.controller.spec.ts` | Jest unit tests for `/health` and `/info` |
| `../.github/workflows/ci.yml` | CI pipeline (must live at the **repo root**) |

> Week 1/2 had `services/backend/.github/workflows/build.yaml`. GitHub only runs workflows from
> `.github/workflows/` at the **root of the repository**, so that file never ran. The new pipeline is at
> the root.

---

## Part A — Kong API Gateway

### 1. Start the Week 2 environment

Follow Week 2 steps 1–4 from this folder (`Week3/`): start Minikube, build and load the images, install Istio,
create and label the `microservices` namespace.

```bash
minikube start --memory=6144 --cpus=3
docker build -t backend-image:1.0  ./services/backend
docker build -t frontend-image:1.0 ./services/frontend
minikube image load backend-image:1.0
minikube image load frontend-image:1.0
```

### 2. Install Kong (with an Istio sidecar)

The `microservices` namespace only accepts mTLS (`STRICT`). Kong must be in the mesh, otherwise its
plain-HTTP calls are rejected with `connection reset` / `502`. Label the namespace **before** installing:

```bash
kubectl create namespace kong
kubectl label namespace kong istio-injection=enabled

helm repo add kong https://charts.konghq.com
helm repo update
helm install kong kong/ingress -n kong --wait

kubectl get pods -n kong      # each pod should be 2/2 (kong + istio-proxy)
```

### 3. Deploy the chart (now with Kong routes and plugins)

```bash
helm lint helm/microservices
helm upgrade --install microservices helm/microservices -n microservices
kubectl apply -f kong/consumer.yaml

kubectl get ingress,kongplugins,kongconsumers -n microservices
```

### 4. Open the gateway

```bash
kubectl port-forward -n kong svc/kong-gateway-proxy 8080:80
```

- UI through Kong: http://localhost:8080
- Protected API: `curl -H "apikey: my-secret-key-123" http://localhost:8080/api/health`

### 5. Test auth and rate limiting

In a second terminal:

```bash
./kong/test-gateway.sh
```

Expected:

| Test | Result |
|---|---|
| `GET /` | `200` (frontend HTML) |
| `GET /api/health` without key / wrong key | `401` |
| `GET /api/health` with key | `200` + backend JSON |
| 7 requests in a row with key | `200` ×5, then `429 Too Many Requests` |
| Response headers | `X-RateLimit-Limit-Minute: 5`, `X-RateLimit-Remaining-Minute: …` |

Manual versions:

```bash
curl -i http://localhost:8080/api/health                                    # 401
curl -i -H "apikey: my-secret-key-123" http://localhost:8080/api/health     # 200
for i in $(seq 1 7); do curl -s -o /dev/null -w "$i -> %{http_code}\n" -H "apikey: my-secret-key-123" http://localhost:8080/api/health; done
```

> The dashboard page calls `/api/*` from the browser without a key, so through Kong its **backend card shows
> "Unavailable"**. That's expected: the API is protected. To compare, run
> `helm upgrade microservices helm/microservices -n microservices --set kong.api.keyAuth.enabled=false`.

Change the limit without editing files:

```bash
helm upgrade microservices helm/microservices -n microservices --set kong.api.rateLimit.minute=10
```

---

## Part B — CI pipeline (GitHub Actions)

`.github/workflows/ci.yml` (repo root) runs on every push to `master` that touches `Week3/services/**`
(and can be started manually from the Actions tab).

| Job | Steps |
|---|---|
| `lint-test` (backend, frontend) | `npm ci` → `npm run lint` → backend `npm test` / frontend `npm run typecheck` → `npm run build` |
| `build-push` (backend, frontend) | Runs only if `lint-test` passes. Logs in to GHCR with `GITHUB_TOKEN`, builds the Dockerfile and pushes the tags |

Run the same checks locally:

```bash
cd services/backend  && npm ci && npm run lint && npm test && npm run build
cd services/frontend && npm ci && npm run lint && npm run typecheck && npm run build
```

### Image tagging strategy

Images: `ghcr.io/doaaabdelwahed/devops-internship-backend` and `…-frontend`.

| Tag | Example | Use |
|---|---|---|
| `sha-<short>` | `sha-3f9c2ab` | Deploy with this: immutable and readable |
| `<full sha>` | `3f9c2ab7e1d0…` | Exact link to the commit |
| `latest` | `latest` | Moving pointer to the newest `master` build. Don't deploy with it |

Every image maps to exactly one commit, so you always know what is running, and rollback means redeploying
an older `sha-` tag.

### Verify the pipeline

1. Push to `master` and open **Actions**: all 4 jobs should be green; the run summary lists the pushed tags.
2. Open your GitHub profile → **Packages**: both images, tagged `sha-…`, full SHA and `latest`.
3. Check the tag matches the commit:
   ```bash
   git rev-parse --short HEAD      # e.g. 3f9c2ab → tag sha-3f9c2ab
   docker pull ghcr.io/doaaabdelwahed/devops-internship-backend:sha-3f9c2ab
   ```
4. Negative test: add an unused variable (e.g. `const x = 1;`) to `app.controller.ts`, push, and confirm
   `Lint` fails and nothing is pushed. Revert it afterwards.

> New GHCR packages are **private**. To pull without `docker login ghcr.io`, open the package →
> **Package settings** → **Change visibility** → Public.

### Optional: deploy the CI image instead of the local one

After making the packages public:

```bash
helm upgrade microservices helm/microservices -n microservices \
  --set backend.image.repository=ghcr.io/doaaabdelwahed/devops-internship-backend \
  --set backend.image.tag=sha-3f9c2ab \
  --set frontend.image.repository=ghcr.io/doaaabdelwahed/devops-internship-frontend \
  --set frontend.image.tag=sha-3f9c2ab
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Kong returns `502` / `upstream connect error … connection reset` | Kong isn't in the mesh. `kubectl label ns kong istio-injection=enabled` then `kubectl rollout restart deploy -n kong` (pods must be 2/2) |
| Kong returns `404 no Route matched` | Check `kubectl get ingress -n microservices` (class must be `kong`) and `kubectl logs -n kong deploy/kong-controller` |
| `no matches for kind "KongPlugin"` | Install Kong (step 2) before the chart |
| `401` even with the key | Apply `kong/consumer.yaml`; the Secret needs the label `konghq.com/credential: key-auth` |
| Never get `429` | You may have waited past the 1-minute window. Send the requests back-to-back |
| Workflow doesn't start | It must be at `<repo root>/.github/workflows/ci.yml`, and the push must touch `Week3/services/**` (or use **Run workflow**) |
| `denied: permission_denied` on push | Repo **Settings → Actions → General → Workflow permissions** → *Read and write* |
| `npm ci` fails in CI | Commit the updated `package-lock.json` files |

## Clean up

```bash
helm uninstall microservices -n microservices
helm uninstall kong -n kong
kubectl delete namespace microservices kong
helm uninstall istiod istio-base -n istio-system
minikube delete
```
