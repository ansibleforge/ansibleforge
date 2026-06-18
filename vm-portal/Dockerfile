# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
FROM docker.io/library/node:22-alpine AS builder
WORKDIR /app

# Install deps based on lockfile only — better cache hits.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest and build.
COPY . .

# Build-time AAP wiring. Vite inlines VITE_* into the bundle at build time, so
# these must be set before `npm run build`. CI supplies them per-deployment
# (.github/workflows/container-build.yml). Without them the image is
# unconfigured — an empty value still overrides the app's sandbox default, so
# always build via CI / with these args.
ARG VITE_AAP_CLIENT_ID=
ARG VITE_AAP_AUTHORIZE_URL=
ARG VITE_AAP_REDIRECT_URI=
ARG VITE_AAP_INVENTORY_ID=
ARG VITE_AAP_PROVISION_EC2_WORKFLOW_ID=
ARG VITE_AAP_DELETE_WORKFLOW_ID=
ARG VITE_AAP_TERMINATE_EC2_WORKFLOW_ID=
ARG VITE_AAP_TERMINATION_PROTECTION_WORKFLOW_ID=
ARG VITE_AAP_MANAGED_BY_TAG_WORKFLOW_ID=
ARG VITE_AAP_INSTANCE_STATE_WORKFLOW_ID=
ARG VITE_AAP_AWS_DESCRIBE_OPTIONS_JT_ID=
ARG VITE_AAP_AWS_INVENTORY_ID=
ARG VITE_AAP_AWS_SOURCE_ID=
ENV VITE_AAP_CLIENT_ID=$VITE_AAP_CLIENT_ID \
    VITE_AAP_AUTHORIZE_URL=$VITE_AAP_AUTHORIZE_URL \
    VITE_AAP_REDIRECT_URI=$VITE_AAP_REDIRECT_URI \
    VITE_AAP_INVENTORY_ID=$VITE_AAP_INVENTORY_ID \
    VITE_AAP_PROVISION_EC2_WORKFLOW_ID=$VITE_AAP_PROVISION_EC2_WORKFLOW_ID \
    VITE_AAP_DELETE_WORKFLOW_ID=$VITE_AAP_DELETE_WORKFLOW_ID \
    VITE_AAP_TERMINATE_EC2_WORKFLOW_ID=$VITE_AAP_TERMINATE_EC2_WORKFLOW_ID \
    VITE_AAP_TERMINATION_PROTECTION_WORKFLOW_ID=$VITE_AAP_TERMINATION_PROTECTION_WORKFLOW_ID \
    VITE_AAP_MANAGED_BY_TAG_WORKFLOW_ID=$VITE_AAP_MANAGED_BY_TAG_WORKFLOW_ID \
    VITE_AAP_INSTANCE_STATE_WORKFLOW_ID=$VITE_AAP_INSTANCE_STATE_WORKFLOW_ID \
    VITE_AAP_AWS_DESCRIBE_OPTIONS_JT_ID=$VITE_AAP_AWS_DESCRIBE_OPTIONS_JT_ID \
    VITE_AAP_AWS_INVENTORY_ID=$VITE_AAP_AWS_INVENTORY_ID \
    VITE_AAP_AWS_SOURCE_ID=$VITE_AAP_AWS_SOURCE_ID
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
