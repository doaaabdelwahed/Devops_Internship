#!/usr/bin/env bash
# Run while this is active in another terminal:
#   kubectl port-forward -n kong svc/kong-gateway-proxy 8080:80
GW=${GW:-http://localhost:8080}
KEY=${KEY:-my-secret-key-123}

echo "== Frontend through Kong (public) =="
curl -s -o /dev/null -w "GET /            -> %{http_code}\n" "$GW/"

echo; echo "== API key auth on /api =="
curl -s -o /dev/null -w "no key           -> %{http_code} (expect 401)\n" "$GW/api/health"
curl -s -o /dev/null -w "wrong key        -> %{http_code} (expect 401)\n" -H "apikey: wrong" "$GW/api/health"
curl -s -w "\nvalid key        -> %{http_code} (expect 200)\n" -H "apikey: $KEY" "$GW/api/health"

echo; echo "Waiting 60s so the rate-limit window resets..."; sleep 60

echo "== Rate limit: 5 requests/minute on /api =="
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "request $i -> %{http_code}\n" -H "apikey: $KEY" "$GW/api/health"
done
echo "(expect 200 x5, then 429)"

echo; echo "== Rate-limit headers =="
curl -s -D - -o /dev/null -H "apikey: $KEY" "$GW/api/info" | grep -i ratelimit
