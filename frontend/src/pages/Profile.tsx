import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import toast from 'react-hot-toast'
import { User, Lock, CreditCard, Smartphone, Eye, EyeOff, Shield } from 'lucide-react'

export default function Profile() {
  const { user, updateUser, logout } = useAuth()
  const [tab, setTab] = useState<'profile'|'password'|'subscription'>('profile')

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Perfil</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Gerencie sua conta e configurações</p>
      </div>

      <div className="card flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-2xl">
          {user?.name?.[0]?.toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-lg">{user?.name}</p>
          <span className={`badge-${user?.subscriptionStatus==='active'?'green':user?.subscriptionStatus==='trialing'?'blue':'red'} mt-1 inline-block`}>
            {user?.subscriptionStatus==='active'?'Plano ativo':user?.subscriptionStatus==='trialing'?'Trial gratuito':user?.subscriptionStatus==='past_due'?'Pagamento pendente':'Cancelado'}
          </span>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl w-fit">
        {([
          {key:'profile',label:'Dados',icon:User},
          {key:'password',label:'Senha',icon:Lock},
          {key:'subscription',label:'Assinatura',icon:CreditCard},
        ] as const).map(({key,label,icon:Icon})=>(
          <button key={key} onClick={()=>setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab===key?'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm':'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            <Icon size={15}/>{label}
          </button>
        ))}
      </div>

      {tab==='profile'      && <ProfileForm user={user} onUpdate={updateUser}/>}
      {tab==='password'     && <PasswordForm/>}
      {tab==='subscription' && <SubscriptionInfo user={user} logout={logout}/>}
    </div>
  )
}

// ─── Aba: Dados + alterar telefone ───────────────────────────────────────────

function ProfileForm({ user, onUpdate }: { user: any; onUpdate: (u: any) => void }) {
  const [name, setName] = useState(user?.name ?? '')
  const [savingName, setSavingName] = useState(false)

  // Phone change state
  const [phoneForm, setPhoneForm] = useState({ phone:'', password:'' })
  const [showPhonePwd, setShowPhonePwd] = useState(false)
  const [savingPhone, setSavingPhone] = useState(false)

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingName(true)
    try {
      await api.patch('/profile', { name })
      onUpdate({ name })
      toast.success('Nome atualizado!')
    } catch { toast.error('Erro ao atualizar') } finally { setSavingName(false) }
  }

  const handleChangePhone = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPhone(true)
    try {
      await api.patch('/profile/phone', phoneForm)
      toast.success('Número de WhatsApp atualizado!')
      setPhoneForm({ phone:'', password:'' })
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Erro ao atualizar número')
    } finally { setSavingPhone(false) }
  }

  return (
    <div className="space-y-5">
      {/* Nome */}
      <div className="card space-y-4">
        <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <User size={18} className="text-brand-600"/>Dados pessoais
        </p>
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className="label">Nome completo</label>
            <input type="text" className="input" value={name} onChange={e=>setName(e.target.value)} required minLength={2}/>
          </div>
          <div>
            <label className="label">Status da conta</label>
            <div className="input bg-gray-50 dark:bg-gray-700/50 flex items-center gap-2 cursor-not-allowed">
              <Shield size={14} className="text-brand-600"/>
              <span className="text-sm capitalize text-gray-500 dark:text-gray-400">{user?.subscriptionStatus}</span>
            </div>
          </div>
          <button type="submit" disabled={savingName} className="btn-primary">
            {savingName?'Salvando...':'Salvar nome'}
          </button>
        </form>
      </div>

      {/* Alterar número WhatsApp */}
      <div className="card space-y-4">
        <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Smartphone size={18} className="text-brand-600"/>Alterar número WhatsApp
        </p>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>Atenção:</strong> ao alterar o número, apenas o novo número poderá usar o assistente via WhatsApp. Confirme sua senha para continuar.
          </p>
        </div>
        <form onSubmit={handleChangePhone} className="space-y-4">
          <div>
            <label className="label">Novo número (formato internacional)</label>
            <input type="tel" className="input" placeholder="+5511999999999"
              value={phoneForm.phone} onChange={e=>setPhoneForm({...phoneForm,phone:e.target.value})}
              pattern="^\+[1-9]\d{7,14}$" required/>
            <p className="text-xs text-gray-400 mt-1">Ex: +5511999999999 — com código do país</p>
          </div>
          <div>
            <label className="label">Confirme sua senha</label>
            <div className="relative">
              <input type={showPhonePwd?'text':'password'} className="input pr-10" placeholder="Sua senha atual"
                value={phoneForm.password} onChange={e=>setPhoneForm({...phoneForm,password:e.target.value})} required/>
              <button type="button" onClick={()=>setShowPhonePwd(!showPhonePwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPhonePwd?<EyeOff size={16}/>:<Eye size={16}/>}
              </button>
            </div>
          </div>
          <button type="submit" disabled={savingPhone} className="btn-secondary w-full">
            {savingPhone?'Alterando...':'Alterar número WhatsApp'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Aba: Senha ───────────────────────────────────────────────────────────────

function PasswordForm() {
  const [form, setForm] = useState({ current:'', newPass:'', confirm:'' })
  const [show, setShow] = useState({ current:false, newPass:false, confirm:false })
  const [saving, setSaving] = useState(false)

  const checks = [
    {ok:form.newPass.length>=8, text:'Mínimo 8 caracteres'},
    {ok:/[A-Z]/.test(form.newPass), text:'Uma maiúscula'},
    {ok:/[a-z]/.test(form.newPass), text:'Uma minúscula'},
    {ok:/[0-9]/.test(form.newPass), text:'Um número'},
    {ok:/[^A-Za-z0-9]/.test(form.newPass), text:'Um símbolo'},
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.newPass!==form.confirm) { toast.error('As senhas não conferem'); return }
    setSaving(true)
    try {
      await api.patch('/auth/change-password', { currentPassword:form.current, newPassword:form.newPass })
      toast.success('Senha alterada!')
      setForm({ current:'', newPass:'', confirm:'' })
    } catch (err: any) { toast.error(err?.response?.data?.error??'Senha atual incorreta') }
    finally { setSaving(false) }
  }

  return (
    <div className="card space-y-5">
      <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Lock size={18} className="text-brand-600"/>Alterar senha</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {(['current','newPass','confirm'] as const).map(f=>(
          <div key={f}>
            <label className="label">{f==='current'?'Senha atual':f==='newPass'?'Nova senha':'Confirmar nova senha'}</label>
            <div className="relative">
              <input type={show[f]?'text':'password'} className="input pr-10"
                placeholder={f==='current'?'Senha atual':f==='newPass'?'Mínimo 8 caracteres':'Repita a nova senha'}
                value={form[f]} onChange={e=>setForm({...form,[f]:e.target.value})} required/>
              <button type="button" onClick={()=>setShow({...show,[f]:!show[f]})}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show[f]?<EyeOff size={16}/>:<Eye size={16}/>}
              </button>
            </div>
          </div>
        ))}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 grid grid-cols-2 gap-1">
          {checks.map(({ok,text})=>(
            <span key={text} className={`text-xs flex items-center gap-1 ${ok?'text-green-600':'text-gray-400 dark:text-gray-500'}`}>
              <span>{ok?'✓':'○'}</span>{text}
            </span>
          ))}
        </div>
        <button type="submit" disabled={saving} className="btn-primary">{saving?'Alterando...':'Alterar senha'}</button>
      </form>
    </div>
  )
}

// ─── Aba: Assinatura ──────────────────────────────────────────────────────────

function SubscriptionInfo({ user, logout }: { user: any; logout: () => void }) {
  const [loadingPortal, setLoadingPortal] = useState(false)

  const openPortal = async () => {
    setLoadingPortal(true)
    try {
      const { data } = await api.post('/billing/portal', { returnUrl: window.location.href })
      if (data.devMode) {
        toast.error('Portal Stripe indisponível em desenvolvimento. Configure a chave real no .env')
        return
      }
      window.location.href = data.url
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Erro ao abrir portal'
      if (err?.response?.data?.devMode) {
        toast('⚙️ ' + msg, { icon: '⚙️', duration: 5000 })
      } else {
        toast.error(msg)
      }
    } finally { setLoadingPortal(false) }
  }

  const statusMap: Record<string,{label:string;cls:string}> = {
    trialing: {label:'Trial gratuito', cls:'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200'},
    active:   {label:'Plano ativo',    cls:'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200'},
    past_due: {label:'Pagamento pendente', cls:'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200'},
    canceled: {label:'Cancelado', cls:'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'},
  }
  const s = statusMap[user?.subscriptionStatus] ?? statusMap['canceled']!

  return (
    <div className="card space-y-5">
      <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><CreditCard size={18} className="text-brand-600"/>Assinatura</p>
      <div className={`rounded-xl p-4 border ${s.cls}`}>
        <p className="font-semibold text-sm">{s.label}</p>
      </div>
      <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-4">
        <p className="font-semibold text-gray-900 dark:text-white">Plano Mensal</p>
        <ul className="mt-3 space-y-1.5">
          {['Registros ilimitados pelo WhatsApp','Dashboard com gráficos','Lembretes automáticos','Histórico completo'].map(f=>(
            <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <span className="text-green-500">✓</span>{f}
            </li>
          ))}
        </ul>
      </div>
      <button onClick={openPortal} disabled={loadingPortal} className="btn-primary w-full">
        {loadingPortal?'Abrindo...':'Gerenciar pagamento e assinatura'}
      </button>
      <p className="text-xs text-gray-400 text-center">Gerenciado com segurança pelo Stripe.</p>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Zona de perigo</p>
        <button
          onClick={async()=>{if(confirm('Sair de todas as sessões?')){await logout();window.location.href='/login'}}}
          className="text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 px-3 py-2 rounded-lg transition-colors">
          Sair de todas as sessões
        </button>
      </div>
    </div>
  )
}
