FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY angular.json tsconfig.json tsconfig.app.json ./
COPY src ./src

RUN npm run build


FROM nginx:1.28-alpine AS runner

RUN addgroup -S -g 1001 appgroup
RUN adduser -S -D -H -u 1001 -G appgroup appuser
RUN mkdir -p /tmp/nginx/client_temp /tmp/nginx/proxy_temp /tmp/nginx/fastcgi_temp /tmp/nginx/uwsgi_temp /tmp/nginx/scgi_temp
RUN chown -R 1001:1001 /tmp/nginx /usr/share/nginx/html /var/cache/nginx

COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=builder --chown=1001:1001 /app/dist/frontend/browser /usr/share/nginx/html

USER 1001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]