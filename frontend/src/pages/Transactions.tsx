import { useEffect, useState, useCallback } from 'react'
import api from '../api/client'
import type { Transaction, PaginatedTransactions } from '../types'
import toast from 'react-hot-toast'
import { Plus, Search, Trash2, Filter, TrendingUp, TrendingDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CATEGORIES_EXPENSE = ['Alimentação','Transporte','Moradia','Saúde','Lazer','Educação','Vestuário','Outros']
const CATEGORIES_INCOME  = ['Salário','Freelance','Investimentos','Presente','Outros']

export default function Transactions() {
  const [data, setData] = useState<PaginatedTransactions | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filters, setFilters] = useState({ type: 'all', page: 1, category: '', startDate: '', endDate: '' })
  const [form, setForm] = useState({ type: 'expense', amount: '', category: '', description: '', date: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: filters.page, limit: 15 }
      if (filters.type !== 'all') params.type = filters.type
      if (filters.category) params.category = filters.category
      if (filters.startDate) params.startDate = filters.startDate
      if (filters.endDate) params.endDate = filters.endDate
      const { data: res } = await api.get<PaginatedTransactions>('/transactions', { params })
      setData(res)
    } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/transactions', {
        ...form,
        amount: parseFloat(form.amount),
        date: form.date || undefined,
      })
      toast.success('Transação registrada!')
      setShowForm(false)
      setForm({ type: 'expense', amount: '', category: '', description: '', date: '' })
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta transação?')) return
    setDeleting(id)
    try {
      await api.delete(`/transactions/${id}`)
      toast.success('Transação removida')
      load()
    } catch {
      toast.error('Erro ao remover')
    } finally { setDeleting(null) }
  }

  const categories = form.type === 'income' ? CATEGORIES_INCOME : CATEGORIES_EXPENSE

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transações</h1>
          <p className="text-gray-500 text-sm mt-1">
            {data?.pagination.total ?? 0} transações encontradas
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nova transação
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <select
            className="input w-auto"
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
          >
            <option value="all">Todos os tipos</option>
            <option value="income">Receitas</option>
            <option value="expense">Gastos</option>
          </select>
          <input
            type="date" className="input w-auto"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value, page: 1 })}
          />
          <input
            type="date" className="input w-auto"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value, page: 1 })}
          />
          <input
            type="text" className="input w-auto" placeholder="Categoria..."
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })}
          />
          <button onClick={() => setFilters({ type: 'all', page: 1, category: '', startDate: '', endDate: '' })}
            className="btn-secondary text-sm">
            Limpar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Search size={32} className="mx-auto mb-2 opacity-40" />
            <p>Nenhuma transação encontrada</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Tipo', 'Categoria', 'Data', 'Origem', 'Valor', ''].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.data.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        tx.type === 'income' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {tx.type === 'income'
                          ? <TrendingUp size={14} className="text-green-600" />
                          : <TrendingDown size={14} className="text-red-600" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{tx.category}</p>
                      {tx.description && <p className="text-xs text-gray-400">{tx.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {format(parseISO(tx.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge-blue capitalize">{tx.source}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold text-sm ${
                        tx.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {tx.type === 'income' ? '+' : '-'}{currency(tx.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(tx.id)}
                        disabled={deleting === tx.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {(data?.pagination.pages ?? 1) > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Página {filters.page} de {data?.pagination.pages}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                    disabled={filters.page <= 1} className="btn-secondary text-sm px-3 py-1 disabled:opacity-40">
                    Anterior
                  </button>
                  <button onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                    disabled={filters.page >= (data?.pagination.pages ?? 1)}
                    className="btn-secondary text-sm px-3 py-1 disabled:opacity-40">
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal nova transação */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Nova transação</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(['expense', 'income'] as const).map((t) => (
                  <button
                    key={t} type="button"
                    onClick={() => { setForm({ ...form, type: t, category: '' }) }}
                    className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.type === t
                        ? t === 'income' ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'income' ? '↑ Receita' : '↓ Gasto'}
                  </button>
                ))}
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input type="number" className="input" step="0.01" min="0.01" placeholder="0,00"
                  value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                  <option value="">Selecionar...</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Descrição (opcional)</label>
                <input type="text" className="input" placeholder="Ex: Almoço no restaurante"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="label">Data (opcional)</label>
                <input type="date" className="input" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
