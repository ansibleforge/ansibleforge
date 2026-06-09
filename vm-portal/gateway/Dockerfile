# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
FROM docker.io/library/node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune to production deps for the runtime copy.
RUN npm prune --omit=dev

# ---------- runtime stage ----------
FROM docker.io/library/node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Run as the built-in non-root node user.
USER node

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:8081/healthz || exit 1

CMD ["node", "dist/index.js"]
