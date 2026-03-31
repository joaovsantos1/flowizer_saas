// Linha 1 — este console.log aparece ANTES de qualquer import
console.log('[boot] Iniciando servidor...');

import express, { Request, Response, NextFunction } from 'express';

console.log('[boot] Express carregado');

import { applySecurityMiddleware } from './middleware/security.js';
import { router } from './routes/index.js';
import { testDatabaseConnection } from './config/database.js';
import { startReminderScheduler, startBackupScheduler } from './jobs/reminderJob.js';
import { logger, logError } from './utils/logger.js';
import { config } from './config/index.js';

console.log('[boot] Todos os módulos carregados. NODE_ENV =', config.NODE_ENV);

const app = express();

// ─── Captura raw body ANTES do JSON parser (necessário para webhooks) ─────────
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    req.path.startsWith('/webhooks/') &&
    req.headers['content-type']?.includes('application/json')
  ) {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      (req as Request & { rawBody: string }).rawBody = data;
      try { req.body = JSON.parse(data); } catch { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
applySecurityMiddleware(app);
app.use('/api/v1', router);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logError({ error: err, context: 'global_error_handler', operation: `${req.method} ${req.path}` });
  const isDev = config.NODE_ENV === 'development';
  res.status(500).json({
    error: 'Erro interno do servidor',
    ...(isDev && { message: err.message, stack: err.stack }),
  });
});

// ─── Inicialização ────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  console.log('[boot] Testando conexão com banco de dados...');
  try {
    await testDatabaseConnection();
    console.log('[boot] Banco conectado!');

    startReminderScheduler();
    startBackupScheduler();

    const server = app.listen(config.PORT, () => {
      console.log(`[boot] ✅ Servidor rodando em http://localhost:${config.PORT}`);
      logger.info(`Servidor iniciado na porta ${config.PORT}`, {
        env: config.NODE_ENV,
        port: config.PORT,
      });
    });

    const shutdown = (signal: string) => {
      console.log(`[boot] Recebido ${signal}. Encerrando...`);
      server.close(async () => {
        const { db } = await import('./config/database.js');
        await db.destroy();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
      console.error('[boot] uncaughtException:', err.message);
      logError({ error: err, context: 'uncaught_exception' });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('[boot] unhandledRejection:', reason);
      logError({ error: reason, context: 'unhandled_rejection' });
    });

  } catch (error) {
    console.error('[boot] ERRO NA INICIALIZAÇÃO:', error);
    logError({ error, context: 'bootstrap' });
    process.exit(1);
  }
}

bootstrap();

export { app };
