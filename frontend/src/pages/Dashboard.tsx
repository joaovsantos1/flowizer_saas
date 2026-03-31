import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import type { DashboardSummary, Transaction } from '../types'
import { TrendingUp, TrendingDown, Wallet, ArrowLeftRight, Bell, BarChart3, MessageCircle } from 'lucide-react'
import { Doughnut, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale,
  LinearScale, BarElement, Title
} from 'chart.js'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title)

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b','#06b6d4']

// Número do WhatsApp do bot — altere aqui para o número real
const WA_BOT_NUMBER = '+5511999999999'
const WA_LINK = `https://wa.me/${WA_BOT_NUMBER.replace(/\D/g, '')}`

export default function Dashboard() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [recent, setRecent] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      api.get('/transactions', { params: { limit: 5, page: 1 } }),
    ]).then(([s, t]) => {
      setSummary(s.data)
      setRecent(t.data.data)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const doughnutData = {
    labels: summary?.topCategories.map(c => c.category) ?? [],
    datasets: [{ data: summary?.topCategories.map(c => c.total) ?? [], backgroundColor: COLORS, borderWidth: 0 }]
  }
  const barData = {
    labels: ['Receitas', 'Gastos'],
    datasets: [{ data: [summary?.totalIncome ?? 0, summary?.totalExpense ?? 0], backgroundColor: ['#22c55e','#ef4444'], borderRadius: 8, borderWidth: 0 }]
  }

  return (
    <div className="space-y-6">
      {/* Saudação + número do bot */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Olá, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Resumo de{' '}
            {summary ? format(parseISO(summary.period.start), "MMMM 'de' yyyy", { locale: ptBR }) : '—'}
          </p>
        </div>
        {/* Card do número do WhatsApp */}
        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors group"
        >
          <div className="w-9 h-9 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <MessageCircle size={18} className="text-white" />
          </div>
          <div>
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">Seu assistente WhatsApp</p>
            <p className="text-sm font-bold text-green-800 dark:text-green-200">{WA_BOT_NUMBER}</p>
          </div>
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Saldo do mês" value={currency(summary?.balance ?? 0)} icon={<Wallet size={20}/>} color={(summary?.balance??0)>=0?'green':'red'} sub={`${summary?.transactionCount??0} transações`}/>
        <KPICard label="Receitas" value={currency(summary?.totalIncome??0)} icon={<TrendingUp size={20}/>} color="green" sub="no mês atual"/>
        <KPICard label="Gastos" value={currency(summary?.totalExpense??0)} icon={<TrendingDown size={20}/>} color="red" sub="no mês atual"/>
        <KPICard label="Taxa de poupança" value={`${summary?.totalIncome?Math.round(((summary.totalIncome-summary.totalExpense)/summary.totalIncome)*100):0}%`} icon={<BarChart3 size={20}/>} color="blue" sub="da renda guardada"/>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Receitas vs Gastos</h2>
          <div className="h-48">
            <Bar data={barData} options={{
              responsive:true, maintainAspectRatio:false,
              plugins:{legend:{display:false}},
              scales:{
                y:{grid:{color:'rgba(156,163,175,0.1)'},ticks:{color:'#9ca3af',callback:(v)=>'R$'+Number(v).toLocaleString('pt-BR')}},
                x:{grid:{display:false},ticks:{color:'#9ca3af'}},
              }
            }}/>
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Por categoria</h2>
          {(summary?.topCategories.length??0)>0 ? (
            <>
              <div className="h-36"><Doughnut data={doughnutData} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'70%'}}/></div>
              <div className="mt-3 space-y-1">
                {summary?.topCategories.slice(0,4).map((c,i)=>(
                  <div key={c.category} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:COLORS[i]}}/>
                      <span className="text-gray-600 dark:text-gray-300 truncate max-w-[100px]">{c.category}</span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">{currency(c.total)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400"><BarChart3 size={32} className="mb-2 opacity-40"/><p className="text-sm">Sem gastos ainda</p></div>
          )}
        </div>
      </div>

      {/* Recentes + Quick links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Últimas transações</h2>
            <Link to="/transactions" className="text-sm text-brand-600 hover:underline">Ver todas</Link>
          </div>
          {recent.length===0?(
            <div className="text-center py-8 text-gray-400">
              <ArrowLeftRight size={32} className="mx-auto mb-2 opacity-40"/>
              <p className="text-sm">Nenhuma transação ainda</p>
              <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="text-xs mt-1 text-brand-600 hover:underline block">
                Envie uma mensagem no WhatsApp para registrar →
              </a>
            </div>
          ):(
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {recent.map(tx=>(
                <div key={tx.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${tx.type==='income'?'bg-green-100 dark:bg-green-900/40 text-green-700':'bg-red-100 dark:bg-red-900/40 text-red-700'}`}>
                      {tx.type==='income'?'↑':'↓'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{tx.category}</p>
                      <p className="text-xs text-gray-400">{format(parseISO(tx.transaction_date),'dd MMM',{locale:ptBR})}</p>
                    </div>
                  </div>
                  <span className={`font-semibold text-sm ${tx.type==='income'?'text-green-600':'text-red-600'}`}>
                    {tx.type==='income'?'+':'-'}{currency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Acesso rápido</h2>
          <div className="space-y-2">
            {[
              {to:'/transactions',icon:ArrowLeftRight,label:'Nova transação',sub:'Registrar manualmente'},
              {to:'/reminders',icon:Bell,label:'Criar lembrete',sub:'Agendar notificação'},
              {to:'/reports',icon:BarChart3,label:'Ver relatórios',sub:'Análises detalhadas'},
            ].map(({to,icon:Icon,label,sub})=>(
              <Link key={to} to={to} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="w-9 h-9 bg-brand-50 dark:bg-brand-900/30 rounded-lg flex items-center justify-center text-brand-600 dark:text-brand-400">
                  <Icon size={18}/>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                  <p className="text-xs text-gray-400">{sub}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function KPICard({label,value,icon,color,sub}:{label:string;value:string;icon:React.ReactNode;color:'green'|'red'|'blue';sub:string}) {
  const c = {green:'bg-green-50 dark:bg-green-900/30 text-green-600',red:'bg-red-50 dark:bg-red-900/30 text-red-600',blue:'bg-blue-50 dark:bg-blue-900/30 text-blue-600'}
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c[color]}`}>{icon}</div>
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  )
}
