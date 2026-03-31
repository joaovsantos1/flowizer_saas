import { Router } from 'express';
import { internalAuth } from '../middleware/internalAuth.js';
import {
  checkAccess,
  internalCreateTransaction,
  internalCreateReminder,
  internalUserSummary,
} from '../controllers/internalController.js';

// ─── Roteador interno — exclusivo para comunicação n8n → backend ──────────────
//
// ATENÇÃO DE INFRAESTRUTURA:
// Estes endpoints NÃO devem ser expostos publicamente.
// Configurar no Nginx para aceitar APENAS tráfego da rede interna da VPS.
//
// Exemplo Nginx (adicionar ao bloco server):
//
//   location /api/v1/internal/ {
//     allow 172.20.0.0/16;   # rede Docker interna
//     allow 127.0.0.1;
//     deny all;
//     proxy_pass http://app:3000;
//   }

const internalRouter = Router();

// Aplica internalAuth em TODAS as rotas deste router
internalRouter.use(internalAuth);

// Verificação de acesso (chamada principal do n8n antes de acionar IA)
internalRouter.post('/check-access', checkAccess);

// Persistência de dados (chamadas do n8n após decisão da IA)
internalRouter.post('/transactions', internalCreateTransaction);
internalRouter.post('/reminders', internalCreateReminder);

// Resumo financeiro (n8n pode incluir no contexto da IA)
internalRouter.get('/user-summary/:userId', internalUserSummary);

export { internalRouter };
