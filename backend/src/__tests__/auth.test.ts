import request from 'supertest';
import { app } from '../server.js';
import { db } from '../config/database.js';
import { encrypt, hashPassword } from '../services/encryption/EncryptionService.js';
import crypto from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTestUser(overrides: Partial<{
  email: string;
  subscription_status: string;
  status: string;
}> = {}) {
  const email = overrides.email ?? `test-${Date.now()}@example.com`;
  const phone = `+551199${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
  const emailHash = crypto.createHash('sha256').update(email).digest('hex');
  const phoneHash = crypto.createHash('sha256').update(phone).digest('hex');

  const [user] = await db('users').insert({
    name: 'Test User',
    email_encrypted: encrypt(email),
    email_hash: emailHash,
    phone_encrypted: encrypt(phone),
    phone_hash: phoneHash,
    password_hash: await hashPassword('Test@1234'),
    subscription_status: overrides.subscription_status ?? 'active',
    status: overrides.status ?? 'active',
  }).returning(['id', 'name', 'role', 'subscription_status']);

  return { user: user!, email, phone, password: 'Test@1234' };
}

// ─── Suite: Registro ──────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('registra usuário válido', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'João Silva',
        email: `joao-${Date.now()}@test.com`,
        phone: '+5511987654321',
        password: 'Senha@123',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('phone');
    expect(res.body.user).not.toHaveProperty('email');
  });

  it('rejeita senha fraca', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test',
        email: 'test@test.com',
        phone: '+5511987654321',
        password: '123456', // fraca
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejeita email duplicado sem vazar qual campo já existe', async () => {
    const email = `dup-${Date.now()}@test.com`;

    // Criar usuário primeiro
    await createTestUser({ email });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Outro User',
        email,
        phone: '+5511999999998',
        password: 'Senha@123',
      });

    expect(res.status).toBe(409);
    // Mensagem genérica — não revelar qual campo é duplicado
    expect(res.body.error).toBe('Usuário já cadastrado');
  });

  it('rejeita telefone em formato inválido', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test',
        email: 'test2@test.com',
        phone: '11987654321', // sem +55
        password: 'Senha@123',
      });

    expect(res.status).toBe(400);
  });
});

// ─── Suite: Login ─────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('retorna tokens para credenciais válidas', async () => {
    const { email, password } = await createTestUser();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('retorna 401 para senha incorreta (sem vazar existência do email)', async () => {
    const { email } = await createTestUser();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'SenhaErrada@123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Email ou senha inválidos');
  });

  it('retorna 401 para email inexistente (mesma mensagem)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'naoexiste@test.com', password: 'Senha@123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Email ou senha inválidos'); // mesmo erro — não vazar existência
  });

  it('bloqueia usuário suspenso', async () => {
    const { email, password } = await createTestUser({ status: 'suspended' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    expect(res.status).toBe(403);
  });
});

// ─── Suite: Proteção de rotas ─────────────────────────────────────────────────

describe('Rotas protegidas', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).get('/api/v1/transactions');
    expect(res.status).toBe(401);
  });

  it('retorna 401 com token inválido', async () => {
    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', 'Bearer token_invalido');
    expect(res.status).toBe(401);
  });

  it('bloqueia usuário com assinatura cancelada', async () => {
    const { email, password } = await createTestUser({ subscription_status: 'canceled' });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });
});

// ─── Suite: Isolamento de dados ───────────────────────────────────────────────

describe('Isolamento de dados entre usuários', () => {
  it('usuário A não acessa transações do usuário B', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    // Login como A
    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: userA.password });

    // Criar transação como A
    const txRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${loginA.body.accessToken}`)
      .send({ type: 'expense', amount: 100, category: 'Teste' });

    const txId = txRes.body.id;

    // Login como B
    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userB.email, password: userB.password });

    // Tentar acessar transação de A com token de B
    const res = await request(app)
      .get(`/api/v1/transactions/${txId}`)
      .set('Authorization', `Bearer ${loginB.body.accessToken}`);

    expect(res.status).toBe(404); // não encontrada — não vazar que existe
  });

  it('usuário B não consegue deletar transação do usuário A', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: userA.password });

    const txRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${loginA.body.accessToken}`)
      .send({ type: 'expense', amount: 50, category: 'Teste' });

    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userB.email, password: userB.password });

    const res = await request(app)
      .delete(`/api/v1/transactions/${txRes.body.id}`)
      .set('Authorization', `Bearer ${loginB.body.accessToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── Suite: Segurança de dados ────────────────────────────────────────────────

describe('Segurança de dados', () => {
  it('não retorna campos criptografados nas respostas', async () => {
    const { email, password } = await createTestUser();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    const txRes = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ type: 'expense', amount: 75.50, category: 'Teste', description: 'Dado sensível' });

    // Verificar que campos _encrypted não aparecem na resposta
    expect(txRes.body).not.toHaveProperty('amount_encrypted');
    expect(txRes.body).not.toHaveProperty('description_encrypted');
    expect(txRes.body).not.toHaveProperty('password_hash');
    // Verificar que o valor está em reais (não centavos)
    expect(txRes.body.amount).toBe(75.50);
  });

  it('saneia inputs com XSS', async () => {
    const { email, password } = await createTestUser();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({
        type: 'expense',
        amount: 10,
        category: '<script>alert("xss")</script>Teste',
      });

    // Deve rejeitar categoria com caracteres inválidos
    expect(res.status).toBe(400);
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  await db.destroy();
});
