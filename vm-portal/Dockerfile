# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
FROM docker.io/library/node:22-alpine AS builder
WORKDIR /app

# Install deps based on lockfile only — better cache hits.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest and build.
COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM docker.io/library/nginx:1.27-alpine AS runtime

# Drop the default config and replace with our SPA-friendly one.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/vm-portal.conf

# Static assets.
COPY --from=builder /app/dist /usr/share/nginx/html

# Rootless-friendly: nginx writes pid + temp under /tmp, and we expose 8080
# inside the container (host can publish whatever port it wants).
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:8080/ || exit 1
