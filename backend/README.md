# WhatsApp AI SaaS — Documentação Técnica

## Visão Geral

Plataforma SaaS de assistente financeiro pessoal via WhatsApp com IA, construída com Node.js + TypeScript. Usuários interagem em linguagem natural e o sistema registra gastos, receitas, lembretes e gera relatórios financeiros.

---

## Estrutura de Pastas

```
src/
├── config/
│   ├── index.ts              # Carregamento e validação de variáveis de ambiente
│   └── database.ts           # Pool de conexão PostgreSQL com SSL
├── middleware/
│   ├── auth.ts               # JWT, refresh tokens, controle de assinatura
│   └── security.ts           # Helmet, CORS, rate limit, sanitização de input
├── services/
│   ├── encryption/
│   │   └── EncryptionService.ts  # AES-256-GCM, bcrypt, HMAC
│   ├── ai/
│   │   └── AIService.ts      # Interpretação de mensagens + validação Zod
│   ├── whatsapp/
│   │   └── MessageProvider.ts    # Abstração: Evolution API + Meta API
│   └── stripe/
│       └── StripeService.ts  # Subscriptions, trial, webhooks idempotentes
├── controllers/
│   ├── authController.ts     # Registro, login, refresh, logout
│   ├── webhookController.ts  # Webhooks WA + Stripe com validação de assinatura
│   └── financeController.ts  # CRUD financeiro com isolamento por user_id
├── jobs/
│   └── reminderJob.ts        # Bull queue + cron para lembretes e backup
├── routes/
│   └── index.ts              # Todas as rotas com middlewares aplicados
├── utils/
│   └── logger.ts             # Winston com sanitização automática de dados sensíveis
├── __tests__/
│   └── auth.test.ts          # Testes de autenticação, isolamento e segurança
└── server.ts                 # Bootstrap com graceful shutdown
migrations/
└── 001_initial_schema.ts     # Schema completo com RLS e criptografia
```

---

## Checklist de Segurança Implementado

### ✅ Autenticação e Autorização
- [x] JWT com expiração curta (15 minutos)
- [x] Refresh tokens com rotação automática
- [x] Detecção de reutilização de refresh token (Token Family)
- [x] Revogação de tokens (blacklist + revogação de família)
- [x] Verificação de status do usuário em cada requisição
- [x] Controle de acesso por role (user/admin)

### ✅ Proteção de Dados Sensíveis
- [x] AES-256-GCM para campos sensíveis no banco (email, telefone, valores, descrições)
- [x] IV aleatório único por criptografia (nunca reutilizado)
- [x] Authentication tag (GCM) para verificar integridade dos dados
- [x] SHA-256 para lookup de email/telefone (sem armazenar em texto puro)
- [x] Nunca retornar campos `_encrypted` nas respostas da API

### ✅ Senhas
- [x] bcrypt com 12 rounds
- [x] Nunca armazenar ou logar senhas
- [x] Dummy hash comparison para timing-safe quando usuário não existe

### ✅ Comunicação Segura
- [x] HTTPS obrigatório (redirect 80 → 443)
- [x] TLS 1.2+ apenas (TLS 1.0 e 1.1 desabilitados)
- [x] HSTS com preload e includeSubDomains
- [x] OCSP Stapling configurado

### ✅ Validação de Webhooks
- [x] Evolution API: HMAC-SHA256 com timing-safe comparison
- [x] Meta API: X-Hub-Signature-256 com timing-safe comparison
- [x] Stripe: `stripe.webhooks.constructEvent()` com secret validation
- [x] Raw body preservado para validação de assinatura

### ✅ Rate Limiting (3 camadas)
- [x] Nginx: rate limit por rota antes de chegar na aplicação
- [x] Express: `express-rate-limit` geral + específico para auth
- [x] Aplicação: limites no Bull queue para jobs

### ✅ Logs e Monitoramento
- [x] Winston com rotação automática de arquivos
- [x] Sanitização automática de campos sensíveis em todos os logs
- [x] Log de auditoria para ações críticas (login, transações, assinaturas)
- [x] Log de segurança para eventos suspeitos
- [x] Stack traces apenas em ambiente de desenvolvimento

### ✅ Isolamento de Usuários (Multi-tenant)
- [x] Todas as queries filtradas por `user_id` do token JWT
- [x] Row Level Security (RLS) no PostgreSQL como segunda linha de defesa
- [x] user_id nunca vem do body — sempre do token JWT decodificado
- [x] 404 em vez de 403 ao acessar recurso de outro usuário (não vazar existência)

### ✅ Backup e Recuperação
- [x] Cron diário configurável (`BACKUP_CRON`)
- [x] Soft delete em transações (nunca deleção física de dados financeiros)
- [x] Pool de conexões com retry automático

### ✅ Validação de Input
- [x] Zod para validação de schema em todos os endpoints
- [x] XSS sanitization via `xss` package
- [x] HPP (HTTP Parameter Pollution) protection
- [x] `Content-Type` e tamanho de body limitados
- [x] SQL Injection prevenido por parameterized queries (knex)

### ✅ Segurança na IA
- [x] IA retorna apenas JSON interpretado
- [x] Validação Zod do output da IA antes de qualquer ação
- [x] Validações de negócio adicionais (datas, valores) após validação de schema
- [x] Prompt injection mitigado por limite de tamanho e sanitização
- [x] IA nunca executa ações diretamente — backend sempre valida e executa

### ✅ Controle de Assinatura
- [x] Verificação de status em cada requisição protegida
- [x] Trial de 7 dias com Stripe
- [x] Webhook idempotente (reprocessar evento é seguro)
- [x] Bloqueio automático ao cancelar/atrasar pagamento
- [x] Dados de cartão nunca tocam nosso servidor (Stripe Elements/Checkout)

---

## Setup de Desenvolvimento

```bash
# 1. Clonar e instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas chaves

# 3. Subir infraestrutura local
docker-compose up -d postgres redis

# 4. Rodar migrations
npm run migrate

# 5. Iniciar em modo desenvolvimento
npm run dev
```

## Variáveis de Ambiente Críticas

| Variável | Descrição | Formato |
|---|---|---|
| `JWT_SECRET` | Segredo para assinar JWTs | Min 32 chars aleatórios |
| `ENCRYPTION_KEY` | Chave AES-256 | 64 hex chars (32 bytes) |
| `DB_PASSWORD` | Senha do PostgreSQL | Min 16 chars |
| `STRIPE_WEBHOOK_SECRET` | Secret para validar webhooks | `whsec_...` |
| `EVOLUTION_WEBHOOK_SECRET` | HMAC secret para Evolution API | String aleatória |

### Gerar chaves seguras:
```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key (32 bytes = 64 hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Arquitetura de Segurança

```
Internet
    │
    ▼
[Nginx] ← Rate limit, SSL termination, HSTS
    │
    ▼
[Express] ← Helmet, CORS, HPP, sanitização
    │
    ▼
[Auth Middleware] ← JWT validation, subscription check
    │
    ▼
[Controllers] ← Zod validation, user_id isolation
    │
    ▼
[Services] ← Business logic, AES-256, bcrypt
    │
    ▼
[PostgreSQL] ← RLS, encrypted columns, parameterized queries
```

---

## Fluxo de Mensagem WhatsApp

```
WhatsApp → Webhook → Validar assinatura HMAC
    → Responder 200 imediatamente (evitar timeout)
    → [Assíncrono] Identificar usuário por phone_hash
    → Verificar status de assinatura
    → IA interpreta mensagem → JSON validado com Zod
    → Backend executa ação (nunca a IA diretamente)
    → Gerar resposta em português
    → Enviar via WhatsApp
```

---

## Compliance e Regulamentações

- **LGPD**: dados pessoais criptografados, usuário pode solicitar deleção (soft delete disponível)
- **PCI DSS**: dados de cartão nunca passam pelo sistema (Stripe Checkout/Portal)
- **Meta Policy**: janela de 24h respeitada no sistema de lembretes
- **Backup**: retenção configurável, dados criptografados em repouso

---

## Monitoramento Recomendado

- **APM**: Datadog ou New Relic para métricas de performance
- **Logs**: exportar para CloudWatch, Datadog Logs ou Elastic
- **Alertas**: configurar alertas para eventos de segurança no log
- **Uptime**: Pingdom ou StatusCake para monitoramento externo
