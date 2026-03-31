# ─── Stage 1: Build React ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

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

RUN cat > /etc/nginx/conf.d/app.conf << 'NGINX'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|ico|woff2|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
NGINX

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
