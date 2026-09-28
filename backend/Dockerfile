# syntax=docker/dockerfile:1

FROM node:24.21.0-bookworm-slim AS node-base

ARG NPM_VERSION=11.12.1
RUN npm install --global "npm@${NPM_VERSION}" \
  && npm --version \
  && npm cache clean --force

WORKDIR /app

FROM node-base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node-base AS production-dependencies
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

FROM node-base AS runtime
ENV NODE_ENV=production \
  APP_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000 \
  MEDIA_ROOT=/app/media

# Build copies prompt/OpenAPI assets into dist; migrations stay explicit and
# are never executed by the API entrypoint.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /app/media && chown node:node /app/media

USER node
EXPOSE 3000

CMD ["node", "dist/src/bootstrap/api.js"]
