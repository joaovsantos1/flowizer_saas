import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { MessageCircle, Eye, EyeOff } from 'lucide-react'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await register(form)
      toast.success('Conta criada! Trial de 7 dias ativo 🎉')
      navigate('/app/dashboard')
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Erro ao criar conta'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <MessageCircle size={18} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">FinanceBot</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Criar conta grátis</h1>
        <p className="text-gray-500 mb-8">7 dias de trial, sem cartão de crédito</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nome completo</label>
            <input type="text" className="input" placeholder="João Silva" value={form.name} onChange={set('name')} required minLength={2} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" placeholder="seu@email.com" value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className="label">WhatsApp (com código do país)</label>
            <input type="tel" className="input" placeholder="+5511999999999" value={form.phone} onChange={set('phone')} required />
            <p className="text-xs text-gray-400 mt-1">Exemplo: +5511999999999</p>
          </div>
          <div>
            <label className="label">Senha</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                className="input pr-10"
                placeholder="Mínimo 8 caracteres"
                value={form.password}
                onChange={set('password')}
                required minLength={8}
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Use letras maiúsculas, minúsculas, números e símbolos</p>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? 'Criando conta...' : 'Criar conta grátis'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Já tem conta?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  )
}
