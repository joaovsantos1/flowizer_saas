# Guia de Configuração n8n

## Pré-requisitos

O n8n já está rodando na VPS via Portainer. Este guia cobre apenas a integração com o backend.

---

## 1. Variáveis de ambiente no n8n

No Portainer, edite o container do n8n e adicione:

```env
N8N_BACKEND_SECRET=mesmo_valor_que_N8N_INTERNAL_SECRET_no_env_do_backend
EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=sua_chave_evolution
EVOLUTION_INSTANCE=nome_da_instancia
OPENAI_API_KEY=sk-sua_chave_openai
```

> **CRÍTICO**: `N8N_BACKEND_SECRET` deve ser idêntico ao `N8N_INTERNAL_SECRET` do `.env` do backend.

---

## 2. Credenciais Redis (para memória do agente)

No n8n → Settings → Credentials → New Credential → Redis:

```
Host: redis          (nome do container Docker)
Port: 6379
Password: <REDIS_PASSWORD do .env>
```

---

## 3. Configurar Evolution API para apontar para o n8n

No painel da Evolution API, configure o webhook da instância:

```
URL: https://seu-n8n.dominio.com/webhook/whatsapp-messages
Eventos: messages.upsert
```

---

## 4. Importar o workflow

1. No n8n, vá em **Settings → Import Workflow**
2. Selecione o arquivo `n8n/workflow-reference.json`
3. O workflow é uma **referência** — adapte os nós conforme necessário
4. Configure as credenciais em cada nó HTTP Request

---

## 5. Fluxo de comunicação n8n → backend

### Check-access (obrigatório antes de qualquer IA)

```
POST http://app:3000/api/v1/internal/check-access
Authorization: Bearer <N8N_BACKEND_SECRET>
Content-Type: application/json

{ "phone": "+5511999999999" }
```

**Resposta — usuário ativo:**
```json
{
  "found": true,
  "access": "allowed",
  "status": "active",
  "userId": "uuid-do-usuario",
  "name": "João Silva",
  "message": null
}
```

**Resposta — usuário bloqueado:**
```json
{
  "found": true,
  "access": "blocked",
  "status": "past_due",
  "userId": "uuid-do-usuario",
  "name": "João Silva",
  "message": "⚠️ Seu pagamento está pendente. Acesse o dashboard para regularizar."
}
```

> Se `access === "blocked"`, o n8n **NÃO aciona a IA** e envia `message` diretamente ao usuário.

---

### Salvar transação

```
POST http://app:3000/api/v1/internal/transactions
Authorization: Bearer <N8N_BACKEND_SECRET>
Content-Type: application/json

{
  "userId": "uuid-retornado-pelo-check-access",
  "type": "expense",
  "amount": 50.00,
  "category": "Alimentação",
  "description": "Almoço no restaurante",
  "date": "2024-03-15",
  "currency": "BRL"
}
```

**Resposta:**
```json
{
  "id": "uuid-da-transacao",
  "type": "expense",
  "amount": 50.00,
  "category": "Alimentação",
  "transaction_date": "2024-03-15",
  "currency": "BRL"
}
```

---

### Criar lembrete

```
POST http://app:3000/api/v1/internal/reminders
Authorization: Bearer <N8N_BACKEND_SECRET>
Content-Type: application/json

{
  "userId": "uuid-retornado-pelo-check-access",
  "title": "Pagar aluguel",
  "scheduledAt": "2024-03-20T09:00:00.000Z",
  "message": "Lembrar de pagar via PIX",
  "recurrence": "monthly"
}
```

---

### Consultar resumo financeiro

```
GET http://app:3000/api/v1/internal/user-summary/:userId
Authorization: Bearer <N8N_BACKEND_SECRET>
```

**Resposta:**
```json
{
  "userId": "uuid",
  "name": "João Silva",
  "period": { "start": "2024-03-01", "end": "2024-03-15" },
  "totalIncome": 5000.00,
  "totalExpense": 1850.50,
  "balance": 3149.50,
  "transactionCount": 12
}
```

---

## 6. Códigos de status HTTP

| Status | Significado |
|--------|-------------|
| `200` | Sucesso |
| `201` | Criado com sucesso |
| `400` | Dados inválidos (ver campo `details`) |
| `401` | Token `N8N_BACKEND_SECRET` inválido |
| `403` | IP bloqueado ou usuário sem acesso |
| `404` | Recurso não encontrado |
| `500` | Erro interno |

---

## 7. Segurança na VPS

### Verificar que /internal/ não está exposto:

```bash
# De fora da VPS — deve retornar 403 (bloqueado pelo Nginx)
curl -X POST https://seudominio.com/api/v1/internal/check-access \
  -H "Authorization: Bearer seu_secret" \
  -d '{"phone": "+5511999999999"}'

# De dentro da VPS / container n8n — deve funcionar
curl -X POST http://app:3000/api/v1/internal/check-access \
  -H "Authorization: Bearer seu_secret" \
  -d '{"phone": "+5511999999999"}'
```

---

## 8. Erros comuns

**`401 Token interno inválido`**
→ `N8N_BACKEND_SECRET` diferente do `N8N_INTERNAL_SECRET` no backend. Devem ser idênticos.

**`403 IP não autorizado`**
→ IP do container n8n não está em `N8N_ALLOWED_IPS`. Adicionar ou deixar vazio.

**`400 Formato de telefone inválido`**
→ Telefone não está em formato E.164. Verificar o nó de extração no workflow.

**n8n não consegue conectar ao backend**
→ Verificar se estão na mesma rede Docker. No `docker-compose.yml` ambos devem estar em `saas-network`.
