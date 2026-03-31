# Deploy na VPS Hostinger — Guia Completo

## Estrutura final na VPS

```
subdomínios existentes:
  portainer.seudominio.com   → já funcionando
  n8n.seudominio.com         → já funcionando
  evolution.seudominio.com   → já funcionando

subdomínios novos:
  api.seudominio.com         → backend Node.js (porta 3000)
  app.seudominio.com         → frontend React (porta 5173 build → nginx)
```

---

## PARTE 1 — Preparar a VPS

### 1.1 Conectar na VPS
```bash
ssh root@IP_DA_SUA_VPS
```

### 1.2 Atualizar o sistema
```bash
apt update && apt upgrade -y
```

### 1.3 Instalar Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # deve mostrar v20.x
```

### 1.4 Instalar PostgreSQL
```bash
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# Criar banco e usuário
sudo -u postgres psql << 'SQL'
CREATE DATABASE whatsapp_saas;
CREATE USER saas_user WITH ENCRYPTED PASSWORD 'SuaSenhaMuitoForte123!';
GRANT ALL PRIVILEGES ON DATABASE whatsapp_saas TO saas_user;
\c whatsapp_saas
GRANT ALL ON SCHEMA public TO saas_user;
SQL
```

### 1.5 Verificar Redis (provavelmente já está rodando via Docker)
```bash
# Se Redis já roda em container Docker para o n8n, use o mesmo
# Descobrir IP do container Redis:
docker ps | grep redis
docker inspect NOME_CONTAINER_REDIS | grep IPAddress

# Ou instalar Redis standalone se preferir:
apt install -y redis-server
systemctl enable redis-server
```

---

## PARTE 2 — Instalar o backend

### 2.1 Criar pasta e clonar/enviar arquivos
```bash
mkdir -p /opt/financebot/backend
cd /opt/financebot/backend

# Opção A: enviar arquivos via scp do Windows:
# scp -r C:\caminho\project\backend\* root@IP_VPS:/opt/financebot/backend/

# Opção B: subir no GitHub e clonar na VPS
```

### 2.2 Instalar dependências
```bash
cd /opt/financebot/backend
npm install --omit=dev
```

### 2.3 Criar o arquivo .env
```bash
nano /opt/financebot/backend/.env
```

Cole e preencha:
```env
NODE_ENV=production
PORT=3000
APP_URL=https://api.seudominio.com

JWT_SECRET=gere_com_openssl_rand_hex_32
JWT_REFRESH_SECRET=outro_valor_openssl_rand_hex_32
ENCRYPTION_KEY=gere_com_openssl_rand_hex_32_resultado_64_chars

DB_HOST=localhost
DB_PORT=5432
DB_NAME=whatsapp_saas
DB_USER=saas_user
DB_PASSWORD=SuaSenhaMuitoForte123!
DB_SSL=false

REDIS_URL=redis://localhost:6379

WA_PROVIDER=evolution
EVOLUTION_API_URL=https://evolution.seudominio.com
EVOLUTION_API_KEY=sua_chave_evolution
EVOLUTION_WEBHOOK_SECRET=string_aleatoria_segura

STRIPE_SECRET_KEY=sk_live_sua_chave
STRIPE_WEBHOOK_SECRET=whsec_sua_chave
STRIPE_PRICE_ID_MONTHLY=price_seu_id
STRIPE_TRIAL_DAYS=7

N8N_INTERNAL_SECRET=string_aleatoria_64_chars
N8N_ALLOWED_IPS=172.17.0.0/16,127.0.0.1

BACKUP_CRON=0 2 * * *
LOG_LEVEL=info
```

Gerar valores seguros:
```bash
openssl rand -hex 32    # para JWT_SECRET e JWT_REFRESH_SECRET
openssl rand -hex 32    # para ENCRYPTION_KEY (usa o resultado com 64 chars)
openssl rand -hex 48    # para N8N_INTERNAL_SECRET
```

### 2.4 Rodar as migrations
```bash
cd /opt/financebot/backend
npm run migrate
```

### 2.5 Instalar PM2 para manter o backend rodando
```bash
npm install -g pm2

# Iniciar o backend
pm2 start npm --name "financebot-api" -- run start

# Salvar para reiniciar após reboot
pm2 save
pm2 startup
# Copie e execute o comando que o PM2 mostrar
```

---

## PARTE 3 — Build e deploy do frontend

### 3.1 Build na sua máquina local (Windows)
```powershell
cd C:\caminho\project\frontend

# Criar .env.production com a URL real da API
echo "VITE_API_URL=https://api.seudominio.com" > .env.production

npm install
npm run build
# Vai criar a pasta dist/
```

### 3.2 Enviar o build para a VPS
```powershell
# No PowerShell do Windows:
scp -r dist\* root@IP_VPS:/opt/financebot/frontend/
```

---

## PARTE 4 — Configurar Nginx

### 4.1 Instalar Nginx
```bash
apt install -y nginx
```

### 4.2 Criar configuração para o backend (api.seudominio.com)
```bash
nano /etc/nginx/sites-available/financebot-api
```

```nginx
server {
    listen 80;
    server_name api.seudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.seudominio.com;

    ssl_certificate     /etc/letsencrypt/live/api.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.seudominio.com/privkey.pem;

    # Bloquear acesso externo às rotas internas (apenas rede Docker/local)
    location /api/v1/internal/ {
        allow 127.0.0.1;
        allow 172.0.0.0/8;   # rede Docker
        deny all;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 2m;
    }
}
```

### 4.3 Criar configuração para o frontend (app.seudominio.com)
```bash
nano /etc/nginx/sites-available/financebot-app
```

```nginx
server {
    listen 80;
    server_name app.seudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.seudominio.com;

    ssl_certificate     /etc/letsencrypt/live/app.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.seudominio.com/privkey.pem;

    root /opt/financebot/frontend;
    index index.html;

    # React Router — todas as rotas vão para index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache de assets estáticos
    location ~* \.(js|css|png|jpg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4.4 Ativar os sites
```bash
ln -s /etc/nginx/sites-available/financebot-api /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/financebot-app /etc/nginx/sites-enabled/
nginx -t   # testar configuração
```

---

## PARTE 5 — SSL com Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx

# Gerar certificados (substituir pelo seu domínio real)
certbot --nginx -d api.seudominio.com -d app.seudominio.com

# Renovação automática (já configurada pelo certbot, verificar):
certbot renew --dry-run
```

Reiniciar Nginx:
```bash
systemctl restart nginx
systemctl enable nginx
```

---

## PARTE 6 — Criar subdomínios no painel Hostinger

1. Acesse o **hPanel** da Hostinger
2. Vá em **Domínios → Gerenciar → DNS / Nameservers**
3. Adicione registros tipo **A** apontando para o IP da sua VPS:

| Subdomínio | Tipo | Valor |
|---|---|---|
| `api` | A | IP_DA_VPS |
| `app` | A | IP_DA_VPS |

> Os subdomínios `portainer`, `n8n` e `evolution` que você já tem continuam iguais.

Aguarde a propagação DNS (5 a 30 minutos).

---

## PARTE 7 — Configurar o n8n para chamar o backend

No Portainer, edite as variáveis de ambiente do container do n8n e adicione:

```env
N8N_BACKEND_URL=http://IP_PRIVADO_VPS:3000
N8N_BACKEND_SECRET=mesmo_valor_do_N8N_INTERNAL_SECRET_no_.env
```

No workflow do n8n, altere a URL do `check-access`:
```
http://IP_PRIVADO_VPS:3000/api/v1/internal/check-access
```

> Use o IP privado da VPS (não o domínio) para comunicação interna — mais rápido e sem passar pelo Nginx.

---

## PARTE 8 — Configurar o webhook do Stripe

No dashboard do Stripe:
- URL do endpoint: `https://api.seudominio.com/api/v1/webhooks/stripe`

---

## PARTE 9 — Testar tudo

```bash
# Backend respondendo
curl https://api.seudominio.com/api/v1/health

# Frontend carregando
# Abrir no navegador: https://app.seudominio.com

# Logs do backend
pm2 logs financebot-api

# Status do PM2
pm2 status
```

---

## PARTE 10 — Atualizar o frontend (deploy futuro)

Sempre que fizer mudanças:

```powershell
# Na sua máquina:
cd frontend
npm run build
scp -r dist\* root@IP_VPS:/opt/financebot/frontend/
```

Para o backend:
```bash
# Na VPS:
cd /opt/financebot/backend
git pull  # ou enviar arquivos novos via scp
npm install --omit=dev
pm2 restart financebot-api
```

---

## Resumo do que você precisa instalar

| Software | Status |
|---|---|
| Node.js 20 | Instalar (passo 1.3) |
| PostgreSQL | Instalar (passo 1.4) |
| Redis | Verificar se já existe via Docker para o n8n |
| PM2 | Instalar (passo 2.5) |
| Nginx | Instalar (passo 4.1) |
| Certbot (SSL) | Instalar (passo 5) |
| Portainer | Já instalado ✅ |
| n8n | Já instalado ✅ |
| Evolution API | Já instalada ✅ |

---

## Problemas comuns

**Backend não inicia:**
```bash
pm2 logs financebot-api --lines 50
```

**Erro de conexão com banco:**
```bash
sudo -u postgres psql -c "\l"   # listar bancos
sudo -u postgres psql -c "\du"  # listar usuários
```

**SSL não renova:**
```bash
certbot certificates   # ver status
certbot renew          # renovar manualmente
```

**n8n não consegue chamar o backend:**
```bash
# Testar conexão interna da VPS:
curl http://localhost:3000/api/v1/health
```
