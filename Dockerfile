# syntax=docker/dockerfile:1

# ---- builder: install deps, compile native modules, build Next ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL="file:/tmp/build.db" npx prisma generate \
  && DATABASE_URL="file:/tmp/build.db" npx prisma migrate deploy \
  && DATABASE_URL="file:/tmp/build.db" npm run build \
  && chmod +x docker-entrypoint.sh

# ---- runtime: carry the whole built app (incl. node_modules) ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends gosu openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app /app
# Allow the node user to write to node_modules (Prisma engine downloads at first run)
RUN chown -R node:node /app/node_modules
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
