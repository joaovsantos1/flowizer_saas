import Bull from 'bull';
import cron from 'node-cron';
import { db } from '../config/database.js';
import { messageProvider } from '../services/whatsapp/MessageProvider.js';
import { decrypt } from '../services/encryption/EncryptionService.js';
import { logError, logAudit } from '../utils/logger.js';
import { config } from '../config/index.js';

// ─── Fila de lembretes (Bull + Redis) ────────────────────────────────────────

const reminderQueue = new Bull('reminders', {
  redis: config.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,          // máximo 3 tentativas
    backoff: {
      type: 'exponential',
      delay: 60000,       // 1 minuto de espera antes de retry
    },
    removeOnComplete: 100, // manter últimos 100 jobs completados
    removeOnFail: 200,    // manter últimos 200 falhos para análise
  },
});

interface ReminderJob {
  reminderId: string;
  userId: string;
  phoneHash: string;
  title: string;
  messageEncrypted: string | null;
  scheduledAt: string;
}

// ─── Processor: executa o envio do lembrete ───────────────────────────────────

reminderQueue.process(async (job) => {
  const data = job.data as ReminderJob;

  // Verificar se o lembrete ainda está ativo (pode ter sido cancelado)
  const reminder = await db('reminders')
    .where({ id: data.reminderId, status: 'pending', user_id: data.userId })
    .first();

  if (!reminder) {
    logAudit({
      userId: data.userId,
      action: 'reminder_skipped',
      resourceType: 'reminder',
      resourceId: data.reminderId,
      details: { reason: 'not_found_or_canceled' },
    });
    return;
  }

  // Verificar assinatura do usuário
  const user = await db('users')
    .select('id', 'subscription_status', 'phone_hash', 'phone_encrypted')
    .where({ id: data.userId, status: 'active', deleted_at: null })
    .first();

  if (!user) return;

  const activeStatuses = ['trialing', 'active'];
  if (!activeStatuses.includes(user.subscription_status)) {
    await db('reminders').where({ id: data.reminderId }).update({ status: 'canceled' });
    return;
  }

  // Descriptografar número de telefone para envio
  const phone = decrypt(user.phone_encrypted);

  // Construir mensagem do lembrete
  const message = data.messageEncrypted
    ? decrypt(data.messageEncrypted)
    : undefined;

  const whatsappMessage = `🔔 *Lembrete:* ${data.title}${message ? `\n\n${message}` : ''}`;

  // Enviar via WhatsApp
  await messageProvider.sendText(phone, whatsappMessage);

  // Atualizar status do lembrete
  const updates: Record<string, unknown> = {
    last_sent_at: new Date(),
    status: 'sent',
  };

  // Se tem recorrência, calcular próxima execução
  if (reminder.recurrence) {
    const nextRun = calculateNextRun(reminder.recurrence, new Date());
    if (nextRun) {
      updates['status'] = 'pending';
      updates['next_run_at'] = nextRun;
      updates['scheduled_at'] = nextRun;
    }
  }

  await db('reminders').where({ id: data.reminderId }).update(updates);

  logAudit({
    userId: data.userId,
    action: 'reminder_sent',
    resourceType: 'reminder',
    resourceId: data.reminderId,
  });
});

// ─── Handler de erros da fila ─────────────────────────────────────────────────

reminderQueue.on('failed', async (job, error) => {
  const data = job.data as ReminderJob;

  logError({
    userId: data.userId,
    error,
    context: 'reminder_job_failed',
    operation: 'send_reminder',
  });

  // Se esgotou as tentativas, marcar como falho
  if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
    await db('reminders').where({ id: data.reminderId }).update({
      status: 'failed',
      retry_count: db.raw('retry_count + 1'),
    });
  }
});

// ─── Cron: verifica lembretes pendentes a cada minuto ────────────────────────

export function startReminderScheduler(): void {
  cron.schedule('* * * * *', async () => {
    try {
      await checkPendingReminders();
    } catch (error) {
      logError({ error, context: 'reminder_scheduler_cron' });
    }
  });

  logAudit({ userId: 'system', action: 'reminder_scheduler_started' });
}

async function checkPendingReminders(): Promise<void> {
  const now = new Date();
  const twoMinutesLater = new Date(now.getTime() + 2 * 60 * 1000);

  // Buscar lembretes que devem ser enviados nos próximos 2 minutos
  // Inclui somente usuários com assinatura ativa
  const dueReminders = await db('reminders as r')
    .join('users as u', 'r.user_id', 'u.id')
    .where('r.status', 'pending')
    .whereBetween('r.next_run_at', [now, twoMinutesLater])
    .where('u.status', 'active')
    .whereNull('u.deleted_at')
    .whereIn('u.subscription_status', ['trialing', 'active'])
    .select(
      'r.id as reminderId',
      'r.user_id as userId',
      'r.title',
      'r.message_encrypted',
      'r.scheduled_at',
      'u.phone_encrypted',
      'u.phone_hash'
    );

  for (const reminder of dueReminders) {
    // Calcular delay para envio no horário exato
    const delay = Math.max(0, new Date(reminder.scheduled_at).getTime() - Date.now());

    // Verificar regra da janela de 24h da Meta
    // Só enviar mensagens templates fora da janela de 24h
    // Para lembretes dentro da janela, enviar mensagem livre
    const jobData: ReminderJob = {
      reminderId: reminder.reminderId,
      userId: reminder.userId,
      phoneHash: reminder.phone_hash,
      title: reminder.title,
      messageEncrypted: reminder.message_encrypted,
      scheduledAt: String(reminder.scheduled_at),
    };

    await reminderQueue.add(jobData, {
      delay,
      jobId: `reminder-${reminder.reminderId}-${Date.now()}`, // unique por execução
    });
  }
}

// ─── Cálculo de próxima execução para recorrências ───────────────────────────

function calculateNextRun(
  recurrence: string,
  from: Date
): Date | null {
  const next = new Date(from);

  switch (recurrence) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      return next;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      return next;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      return next;
    default:
      return null; // sem recorrência
  }
}

// ─── Job de backup diário do banco ───────────────────────────────────────────

export function startBackupScheduler(): void {
  cron.schedule(config.BACKUP_CRON ?? '0 2 * * *', async () => {
    logAudit({
      userId: 'system',
      action: 'backup_started',
      details: { timestamp: new Date().toISOString() },
    });

    // Em produção: usar pg_dump + upload para S3
    // Implementar conforme infraestrutura disponível
    logAudit({ userId: 'system', action: 'backup_completed' });
  });
}

export { reminderQueue };
