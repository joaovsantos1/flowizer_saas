# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY knexfile.js   ./

RUN npm ci --frozen-lockfile

COPY src/        ./src/
COPY migrations/ ./migrations/

RUN npm run build

# ─── Stage 2: Produção ────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/migrations  ./migrations
COPY --from=builder /app/knexfile.js ./knexfile.js
COPY package*.json ./

RUN npm ci --frozen-lockfile --omit=dev && \
    npm cache clean --force

RUN mkdir -p logs && chown nodejs:nodejs logs

# Script de entrada: roda migrate e depois inicia o servidor
COPY --chown=nodejs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nodejs

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
