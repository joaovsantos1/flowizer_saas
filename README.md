# FinanceBot — WhatsApp AI SaaS

Repositório do projeto completo.

## Estrutura

```
/
├── backend/    → API Node.js + TypeScript
├── frontend/   → Dashboard React + Vite
└── docker-compose.portainer.yml  → Stack do Portainer
```

## Deploy via Portainer

1. No Portainer: **Stacks → Add stack → Repository**
2. Informar URL deste repositório
3. Compose path: `docker-compose.portainer.yml`
4. Adicionar variáveis de ambiente (ver `.env.example` do backend)
5. Deploy

## Desenvolvimento local

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (em outro terminal)
cd frontend && npm install && npm run dev
```

Ver `DEPLOY_VPS.md` para guia completo de produção.
