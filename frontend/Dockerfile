# ─── Stage 1: Build React ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY . .
RUN npm run build

# ─── Stage 2: Nginx serve ─────────────────────────────────────────────────────
FROM nginx:alpine AS production

# Remove config padrão
RUN rm /etc/nginx/conf.d/default.conf

# Config para React Router (todas as rotas → index.html)
COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/app.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
