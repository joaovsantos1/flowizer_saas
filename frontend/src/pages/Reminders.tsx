import { useEffect, useState, useCallback } from 'react'
import api from '../api/client'
import type { Reminder } from '../types'
import toast from 'react-hot-toast'
import {
  Plus, Bell, Clock, RefreshCw, ChevronLeft, ChevronRight,
  Trash2, Pencil, X, LayoutGrid, List
} from 'lucide-react'
import {
  format, parseISO, isPast, isToday, isSameDay, isSameMonth,
  startOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  addMonths as addM,
  setHours, setMinutes, isBefore, isAfter, startOfDay
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

const RECURRENCE_LABELS: Record<string, string> = {
  once: 'Uma vez', daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal'
}
const HOURS = Array.from({ length: 24 }, (_, i) => i)
type ViewMode = 'month' | 'week' | 'day'

// ─── Expandir lembretes recorrentes em ocorrências ─────────────────────────
// Gera instâncias virtuais de cada lembrete recorrente para o período visível
interface ReminderOccurrence extends Reminder {
  occurrenceDate: Date
  isVirtual: boolean
}

function expandReminders(reminders: Reminder[], windowStart: Date, windowEnd: Date): ReminderOccurrence[] {
  const result: ReminderOccurrence[] = []

  for (const r of reminders) {
    if (r.status === 'canceled') continue

    const base = parseISO(r.scheduled_at)
    const until = r.recurrence_until ? parseISO(r.recurrence_until) : addMonths(base, 12)

    if (!r.recurrence || r.recurrence === 'once') {
      if (base >= windowStart && base <= windowEnd) {
        result.push({ ...r, occurrenceDate: base, isVirtual: false })
      }
      continue
    }

    // Gerar ocorrências no intervalo da janela
    let cursor = new Date(base)
    let iterations = 0
    const maxIterations = 500 // proteção contra loop infinito

    while (isBefore(cursor, windowEnd) && isBefore(cursor, until) && iterations < maxIterations) {
      iterations++
      if (!isBefore(cursor, windowStart)) {
        result.push({
          ...r,
          occurrenceDate: new Date(cursor),
          isVirtual: !isSameDay(cursor, base),
        })
      }
      // Avançar para próxima ocorrência
      if (r.recurrence === 'daily') {
        cursor = addDays(cursor, 1)
      } else if (r.recurrence === 'weekly') {
        cursor = addDays(cursor, 7)
      } else if (r.recurrence === 'monthly') {
        cursor = addM(cursor, 1)
      } else {
        break
      }
    }
  }

  return result
}

// ─── Modal criar / editar ─────────────────────────────────────────────────────
interface ReminderModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Reminder | null
  defaultDate?: Date
}

function ReminderModal({ open, onClose, onSaved, editing, defaultDate }: ReminderModalProps) {
  const getDefaultDT = () => {
    if (editing?.scheduled_at) return format(parseISO(editing.scheduled_at), "yyyy-MM-dd'T'HH:mm")
    if (defaultDate) return format(defaultDate, "yyyy-MM-dd'T'HH:mm")
    return ''
  }
  const [form, setForm] = useState({
    title: '', scheduledAt: '', message: '',
    recurrence: 'once', recurrenceUntil: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({
        title: editing?.title ?? '',
        scheduledAt: getDefaultDT(),
        message: '',
        recurrence: editing?.recurrence ?? 'once',
        recurrenceUntil: editing?.recurrence_until
          ? format(parseISO(editing.recurrence_until), 'yyyy-MM-dd')
          : '',
      })
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        message: form.message || undefined,
        recurrence: form.recurrence,
      }
      if (form.recurrence !== 'once' && form.recurrenceUntil) {
        payload.recurrenceUntil = new Date(form.recurrenceUntil + 'T23:59:59').toISOString()
      }
      if (editing) {
        await api.delete(`/reminders/${editing.id}`)
        await api.post('/reminders', payload)
        toast.success('Lembrete atualizado!')
      } else {
        await api.post('/reminders', payload)
        toast.success('Lembrete criado!')
      }
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const showUntil = form.recurrence !== 'once'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {editing ? 'Editar lembrete' : 'Novo lembrete'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Título</label>
            <input type="text" className="input" placeholder="Ex: Reunião semanal"
              value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="label">Data e hora</label>
            <input type="datetime-local" className="input"
              value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} required />
          </div>
          <div>
            <label className="label">Recorrência</label>
            <select className="input" value={form.recurrence}
              onChange={e => setForm({ ...form, recurrence: e.target.value, recurrenceUntil: '' })}>
              {Object.entries(RECURRENCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Campo "até quando" — só aparece quando tem recorrência */}
          {showUntil && (
            <div>
              <label className="label">Repetir até (opcional)</label>
              <input type="date" className="input"
                value={form.recurrenceUntil}
                onChange={e => setForm({ ...form, recurrenceUntil: e.target.value })} />
              <p className="text-xs text-gray-400 mt-1">
                Se vazio, repete por 12 meses a partir da data inicial.
              </p>
            </div>
          )}

          {showUntil && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {form.recurrence === 'daily' && '📅 O lembrete aparecerá todos os dias no calendário até a data final.'}
                {form.recurrence === 'weekly' && '📅 O lembrete aparecerá toda semana no mesmo dia e horário.'}
                {form.recurrence === 'monthly' && '📅 O lembrete aparecerá uma vez por mês na mesma data e horário.'}
              </p>
            </div>
          )}

          <div>
            <label className="label">Mensagem adicional (opcional)</label>
            <textarea className="input resize-none" rows={2}
              value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Pill de lembrete ─────────────────────────────────────────────────────────
function ReminderPill({ reminder, onClick }: { reminder: ReminderOccurrence; onClick: () => void }) {
  const past = isPast(reminder.occurrenceDate) && reminder.status === 'pending'
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }}
      className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium transition-opacity hover:opacity-80 ${
        reminder.status === 'sent'   ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200' :
        reminder.status === 'failed' ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200' :
        past                         ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200' :
        reminder.isVirtual           ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200' :
                                       'bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-200'
      }`}
      title={reminder.title}>
      {format(reminder.occurrenceDate, 'HH:mm')} {reminder.isVirtual && '↻'}{reminder.title}
    </button>
  )
}

// ─── Popup de detalhe ─────────────────────────────────────────────────────────
function ReminderDetailPopup({ reminder, onClose, onEdit, onDelete }: {
  reminder: ReminderOccurrence; onClose: () => void; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              reminder.recurrence && reminder.recurrence !== 'once'
                ? 'bg-purple-100 text-purple-600' : 'bg-brand-100 text-brand-600'
            }`}><Bell size={16} /></div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{reminder.title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-gray-400" />
            <span>{format(reminder.occurrenceDate, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</span>
          </div>
          {reminder.recurrence && reminder.recurrence !== 'once' && (
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-gray-400" />
              <span>{RECURRENCE_LABELS[reminder.recurrence]} {reminder.recurrence_until ? `até ${format(parseISO(reminder.recurrence_until), 'dd/MM/yyyy')}` : '(12 meses)'}</span>
            </div>
          )}
          {reminder.isVirtual && (
            <p className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded-lg px-2 py-1">
              Ocorrência recorrente — editar altera a série inteira
            </p>
          )}
          <span className={`badge-${
            reminder.status === 'sent' ? 'green' :
            reminder.status === 'failed' ? 'red' :
            isPast(reminder.occurrenceDate) && reminder.status === 'pending' ? 'yellow' : 'blue'
          } inline-block`}>
            {reminder.status === 'sent' ? 'Enviado' :
             reminder.status === 'failed' ? 'Falhou' :
             isPast(reminder.occurrenceDate) && reminder.status === 'pending' ? 'Atrasado' : 'Pendente'}
          </span>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-2 btn-secondary text-sm py-2">
            <Pencil size={14} /> Editar
          </button>
          <button onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-2 text-sm py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-700 font-medium transition-colors">
            <Trash2 size={14} /> Excluir série
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── View Mês ─────────────────────────────────────────────────────────────────
function MonthView({ current, occurrences, onDayClick, onReminderClick }: {
  current: Date; occurrences: ReminderOccurrence[]
  onDayClick: (d: Date) => void; onReminderClick: (r: ReminderOccurrence) => void
}) {
  const monthStart = startOfMonth(current)
  const start = startOfWeek(monthStart, { locale: ptBR })
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i))
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700 shrink-0">
        {weekDays.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{d}</div>
        ))}
      </div>
      {/* Grid com 5 linhas de altura igual, overflow garantido */}
      <div className="flex-1 min-h-0" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(5, 1fr)' }}>
        {days.map(day => {
          const dayOccs = occurrences
            .filter(o => isSameDay(o.occurrenceDate, day))
            .sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime())
          const inMonth = isSameMonth(day, current)
          const todayDay = isToday(day)

          return (
            <div key={day.toISOString()} onClick={() => onDayClick(day)}
              className={`border-b border-r border-gray-100 dark:border-gray-700 p-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex flex-col overflow-hidden ${
                !inMonth ? 'bg-gray-50/50 dark:bg-gray-800/50' : ''
              }`}>
              {/* Número do dia — tamanho fixo, nunca cresce */}
              <div className="shrink-0 mb-0.5">
                <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold ${
                  todayDay ? 'bg-brand-600 text-white' :
                  inMonth  ? 'text-gray-900 dark:text-white' :
                             'text-gray-300 dark:text-gray-600'
                }`}>{format(day, 'd')}</span>
              </div>
              {/* Pills — área flexível que NUNCA empurra o número */}
              <div className="flex-1 overflow-hidden flex flex-col gap-px min-h-0">
                {dayOccs.slice(0, 2).map(o => (
                  <ReminderPill key={`${o.id}-${o.occurrenceDate.getTime()}`} reminder={o} onClick={() => onReminderClick(o)} />
                ))}
                {dayOccs.length > 2 && (
                  <button
                    onClick={e => { e.stopPropagation(); onDayClick(day) }}
                    className="shrink-0 text-left text-[10px] px-1 text-brand-600 dark:text-brand-400 hover:underline font-semibold leading-tight"
                  >
                    +{dayOccs.length - 2} mais
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── View Semana ──────────────────────────────────────────────────────────────
function WeekView({ current, occurrences, onSlotClick, onReminderClick }: {
  current: Date; occurrences: ReminderOccurrence[]
  onSlotClick: (d: Date) => void; onReminderClick: (r: ReminderOccurrence) => void
}) {
  const start = startOfWeek(current, { locale: ptBR })
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="flex-1 flex flex-col overflow-auto min-h-0">
      <div className="grid grid-cols-8 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10 shrink-0">
        <div className="py-2 border-r border-gray-100 dark:border-gray-700" />
        {days.map(d => (
          <div key={d.toISOString()} className={`py-2 text-center border-r border-gray-100 dark:border-gray-700 last:border-0 ${isToday(d) ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{format(d, 'EEE', { locale: ptBR })}</p>
            <div className={`w-7 h-7 mx-auto flex items-center justify-center rounded-full text-sm font-bold ${isToday(d) ? 'bg-brand-600 text-white' : 'text-gray-900 dark:text-white'}`}>
              {format(d, 'd')}
            </div>
          </div>
        ))}
      </div>
      {HOURS.map(h => (
        <div key={h} className="grid grid-cols-8 border-b border-gray-100 dark:border-gray-700" style={{ minHeight: 56 }}>
          <div className="text-xs text-gray-400 px-2 pt-1 border-r border-gray-100 dark:border-gray-700 text-right shrink-0">{String(h).padStart(2, '0')}:00</div>
          {days.map(d => {
            const slotDate = setMinutes(setHours(d, h), 0)
            const slotOccs = occurrences.filter(o => isSameDay(o.occurrenceDate, d) && o.occurrenceDate.getHours() === h)
            return (
              <div key={d.toISOString()} onClick={() => onSlotClick(slotDate)}
                className={`border-r border-gray-100 dark:border-gray-700 last:border-0 p-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${isToday(d) ? 'bg-brand-50/30 dark:bg-brand-900/10' : ''}`}>
                {slotOccs.map(o => (
                  <ReminderPill key={`${o.id}-${o.occurrenceDate.getTime()}`} reminder={o} onClick={() => onReminderClick(o)} />
                ))}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── View Dia ─────────────────────────────────────────────────────────────────
function DayView({ current, occurrences, onSlotClick, onReminderClick }: {
  current: Date; occurrences: ReminderOccurrence[]
  onSlotClick: (d: Date) => void; onReminderClick: (r: ReminderOccurrence) => void
}) {
  return (
    <div className="flex-1 overflow-auto min-h-0">
      {HOURS.map(h => {
        const slotDate = setMinutes(setHours(current, h), 0)
        const slotOccs = occurrences.filter(o => isSameDay(o.occurrenceDate, current) && o.occurrenceDate.getHours() === h)
        return (
          <div key={h} className="flex border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/20 cursor-pointer transition-colors" style={{ minHeight: 56 }}
            onClick={() => onSlotClick(slotDate)}>
            <div className="w-16 shrink-0 text-xs text-gray-400 px-3 pt-1 text-right border-r border-gray-100 dark:border-gray-700">
              {String(h).padStart(2, '0')}:00
            </div>
            <div className="flex-1 p-1 space-y-0.5">
              {slotOccs.map(o => (
                <ReminderPill key={`${o.id}-${o.occurrenceDate.getTime()}`} reminder={o} onClick={() => onReminderClick(o)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('month')
  const [current, setCurrent] = useState(new Date())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null)
  const [defaultModalDate, setDefaultModalDate] = useState<Date | undefined>()
  const [detailOcc, setDetailOcc] = useState<ReminderOccurrence | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/reminders')
      setReminders(data.data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Calcular janela visível e expandir ocorrências
  const windowStart = view === 'month'
    ? startOfWeek(startOfMonth(current), { locale: ptBR })
    : view === 'week'
      ? startOfWeek(current, { locale: ptBR })
      : startOfDay(current)

  const windowEnd = view === 'month'
    ? addDays(windowStart, 35)
    : view === 'week'
      ? endOfWeek(current, { locale: ptBR })
      : addDays(startOfDay(current), 1)

  const occurrences = expandReminders(reminders, windowStart, windowEnd)

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lembrete e todas suas recorrências?')) return
    try {
      await api.delete(`/reminders/${id}`)
      toast.success('Lembrete excluído')
      setDetailOcc(null)
      load()
    } catch { toast.error('Erro ao excluir') }
  }

  const openNew = (date?: Date) => {
    setEditingReminder(null)
    setDefaultModalDate(date)
    setModalOpen(true)
  }

  const openEdit = (r: Reminder) => {
    setDetailOcc(null)
    setEditingReminder(r)
    setDefaultModalDate(undefined)
    setModalOpen(true)
  }

  const goBack = () => {
    if (view === 'month') setCurrent(subMonths(current, 1))
    else if (view === 'week') setCurrent(subWeeks(current, 1))
    else setCurrent(subDays(current, 1))
  }
  const goForward = () => {
    if (view === 'month') setCurrent(addMonths(current, 1))
    else if (view === 'week') setCurrent(addWeeks(current, 1))
    else setCurrent(addDays(current, 1))
  }

  const titleLabel = () => {
    if (view === 'month') return format(current, 'MMMM yyyy', { locale: ptBR })
    if (view === 'week') {
      const s = startOfWeek(current, { locale: ptBR })
      const e = endOfWeek(current, { locale: ptBR })
      return `${format(s, 'dd MMM', { locale: ptBR })} – ${format(e, 'dd MMM yyyy', { locale: ptBR })}`
    }
    return format(current, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agenda</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{reminders.filter(r => r.status === 'pending').length} lembretes ativos</p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="btn-secondary p-2"><ChevronLeft size={16} /></button>
          <button onClick={() => setCurrent(new Date())} className="btn-secondary text-sm px-3 py-2">Hoje</button>
          <button onClick={goForward} className="btn-secondary p-2"><ChevronRight size={16} /></button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[200px] text-center capitalize">{titleLabel()}</span>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
          {([
            { v: 'day' as ViewMode,   label: 'Dia',    icon: Clock },
            { v: 'week' as ViewMode,  label: 'Semana', icon: List },
            { v: 'month' as ViewMode, label: 'Mês',    icon: LayoutGrid },
          ]).map(({ v, label, icon: Icon }) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                view === v ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>
        <button onClick={() => openNew()} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Novo
        </button>
      </div>

      {/* Calendário */}
      <div className="flex-1 card p-0 overflow-hidden flex flex-col min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {view === 'month' && (
              <MonthView
                current={current}
                occurrences={occurrences}
                onDayClick={d => { setCurrent(d); setView('day') }}
                onReminderClick={setDetailOcc}
              />
            )}
            {view === 'week' && (
              <WeekView current={current} occurrences={occurrences} onSlotClick={openNew} onReminderClick={setDetailOcc} />
            )}
            {view === 'day' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className={`px-4 py-2 text-sm font-semibold border-b border-gray-100 dark:border-gray-700 shrink-0 ${isToday(current) ? 'text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {format(current, "EEEE, dd 'de' MMMM", { locale: ptBR })}{isToday(current) && ' — Hoje'}
                </div>
                <DayView current={current} occurrences={occurrences} onSlotClick={openNew} onReminderClick={setDetailOcc} />
              </div>
            )}
          </>
        )}
      </div>

      <ReminderModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load}
        editing={editingReminder} defaultDate={defaultModalDate} />

      {detailOcc && (
        <ReminderDetailPopup
          reminder={detailOcc}
          onClose={() => setDetailOcc(null)}
          onEdit={() => openEdit(detailOcc)}
          onDelete={() => handleDelete(detailOcc.id)}
        />
      )}
    </div>
  )
}
