import { Link } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  MessageCircle, BarChart3, Bell, Shield, Zap, TrendingUp,
  TrendingDown, ChevronRight, Check, Star, Menu, X,
  Smartphone, Lock, RefreshCw, Globe, ArrowRight, Play
} from 'lucide-react'

// ─── Animação de entrada ao rolar ─────────────────────────────────────────────
function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.15 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])
  const navLinks = [
    { href: '#funcionalidades', label: 'Funcionalidades' },
    { href: '#como-funciona', label: 'Como funciona' },
    { href: '#precos', label: 'Preços' },
    { href: '#faq', label: 'FAQ' },
  ]
  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm' : 'bg-transparent'}`}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-500 rounded-xl flex items-center justify-center shadow-sm">
            <MessageCircle size={18} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">FinanceBot</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map(l => (
            <a key={l.href} href={l.href} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">{l.label}</a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">Entrar</Link>
          <Link to="/register" className="bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm">
            Começar grátis
          </Link>
        </div>
        <button className="md:hidden text-gray-700" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3">
          {navLinks.map(l => (
            <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
              className="block text-sm text-gray-600 py-2">{l.label}</a>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <Link to="/login" className="text-sm font-medium text-center py-2 border border-gray-200 rounded-xl text-gray-700">Entrar</Link>
            <Link to="/register" className="bg-green-500 text-white text-sm font-medium text-center py-2 rounded-xl">Começar grátis</Link>
          </div>
        </div>
      )}
    </header>
  )
}

// ─── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-green-950 pt-20">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-green-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-green-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-16 items-center">
        {/* Left */}
        <div>
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-400 text-sm font-medium">7 dias grátis, sem cartão</span>
          </div>
          <h1 className="text-4xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Controle suas finanças pelo{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
              WhatsApp
            </span>
          </h1>
          <p className="text-gray-300 text-lg leading-relaxed mb-8">
            Registre gastos, receitas e lembretes enviando uma mensagem. A IA interpreta o que você escreveu e organiza tudo automaticamente. Sem apps extras, sem planilhas.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mb-10">
            <Link to="/register"
              className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold px-7 py-3.5 rounded-2xl transition-all shadow-lg shadow-green-900/30 hover:shadow-green-900/50 text-sm">
              Começar 7 dias grátis
              <ArrowRight size={16} />
            </Link>
            <a href="#como-funciona"
              className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium px-7 py-3.5 rounded-2xl transition-all border border-white/10 text-sm">
              <Play size={14} />
              Ver como funciona
            </a>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            {['Sem cartão de crédito', 'Cancel quando quiser', 'Suporte via WhatsApp'].map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <Check size={13} className="text-green-400" />
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Right — mock de conversa WhatsApp */}
        <div className="relative">
          <div className="bg-gray-800/60 backdrop-blur-sm border border-white/10 rounded-3xl p-6 shadow-2xl">
            {/* WA header */}
            <div className="flex items-center gap-3 pb-4 border-b border-white/10 mb-4">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                <MessageCircle size={20} className="text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">FinanceBot</p>
                <p className="text-green-400 text-xs">online agora</p>
              </div>
            </div>
            {/* Messages */}
            <div className="space-y-3">
              <ChatBubble from="user" text="gastei 45 reais no almoço hoje" time="12:34" />
              <ChatBubble from="bot" text="✅ Gasto registrado!\n💸 R$ 45,00 em Alimentação\n📅 hoje" time="12:34" />
              <ChatBubble from="user" text="me lembra de pagar o aluguel dia 5 às 9h" time="14:20" />
              <ChatBubble from="bot" text="🔔 Lembrete criado!\nPagar aluguel\n📅 Dia 5 às 09:00" time="14:20" />
              <ChatBubble from="user" text="quanto gastei esse mês?" time="18:05" />
              <ChatBubble from="bot" text="📊 Resumo de março\n\n💰 Receitas: R$ 5.000\n💸 Gastos: R$ 1.840\n📈 Saldo: R$ 3.160" time="18:05" />
            </div>
          </div>
          {/* Floating cards */}
          <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-xl p-3 flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingDown size={16} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Saldo do mês</p>
              <p className="text-sm font-bold text-gray-900">R$ 3.160</p>
            </div>
          </div>
          <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-xl p-3 flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <Bell size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Lembretes ativos</p>
              <p className="text-sm font-bold text-gray-900">3 esta semana</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ChatBubble({ from, text, time }: { from: 'user' | 'bot'; text: string; time: string }) {
  return (
    <div className={`flex ${from === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
        from === 'user'
          ? 'bg-green-500/20 text-green-100 rounded-tr-sm'
          : 'bg-white/10 text-gray-100 rounded-tl-sm'
      }`}>
        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{text}</pre>
        <p className="text-right text-[10px] opacity-50 mt-1">{time}</p>
      </div>
    </div>
  )
}

// ─── Logos / Credibilidade ────────────────────────────────────────────────────
function SocialProof() {
  return (
    <section className="py-10 bg-gray-50 border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-center text-sm text-gray-400 mb-6">Tecnologia de ponta integrada</p>
        <div className="flex flex-wrap items-center justify-center gap-8 opacity-50 grayscale">
          {['WhatsApp Business', 'Stripe', 'OpenAI', 'PostgreSQL', 'Redis'].map(name => (
            <div key={name} className="flex items-center gap-2">
              <Globe size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-600">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Funcionalidades ─────────────────────────────────────────────────────────
function Features() {
  const features = [
    {
      icon: MessageCircle,
      color: 'bg-green-100 text-green-600',
      title: 'Tudo pelo WhatsApp',
      desc: 'Registre gastos, receitas e lembretes enviando uma mensagem de texto simples. A IA entende linguagem natural.'
    },
    {
      icon: BarChart3,
      color: 'bg-blue-100 text-blue-600',
      title: 'Dashboard completo',
      desc: 'Visualize gráficos, relatórios mensais, histórico de transações e análise por categoria em tempo real.'
    },
    {
      icon: Bell,
      color: 'bg-purple-100 text-purple-600',
      title: 'Lembretes automáticos',
      desc: 'Agende lembretes recorrentes — diário, semanal ou mensal. Receba notificações direto no WhatsApp.'
    },
    {
      icon: Shield,
      color: 'bg-red-100 text-red-600',
      title: 'Segurança total',
      desc: 'Dados criptografados com AES-256, autenticação JWT, sem dados de cartão no servidor.'
    },
    {
      icon: Zap,
      color: 'bg-yellow-100 text-yellow-600',
      title: 'IA que aprende',
      desc: 'O assistente mantém contexto da conversa e aprende suas categorias preferidas ao longo do tempo.'
    },
    {
      icon: RefreshCw,
      color: 'bg-teal-100 text-teal-600',
      title: 'Relatórios automáticos',
      desc: 'Resumo semanal e mensal enviado direto no WhatsApp. Saiba sempre onde seu dinheiro está indo.'
    },
  ]
  return (
    <section id="funcionalidades" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <span className="text-green-600 text-sm font-semibold uppercase tracking-wider">Funcionalidades</span>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mt-3 mb-4">
            Tudo que você precisa, em um lugar só
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Do registro de gastos à análise completa das suas finanças — sem sair do WhatsApp.
          </p>
        </FadeIn>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <FadeIn key={f.title} delay={i * 80}>
              <div className="p-6 rounded-2xl border border-gray-100 hover:border-green-200 hover:shadow-md transition-all group">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${f.color} group-hover:scale-110 transition-transform`}>
                  <f.icon size={22} />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Como funciona ────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: '01', title: 'Crie sua conta', desc: 'Cadastre-se em segundos com email, senha e número do WhatsApp. Sem cartão de crédito.', icon: Smartphone },
    { n: '02', title: 'Adicione o assistente', desc: 'Salve o número do FinanceBot no seu celular e envie uma primeira mensagem para ativar.', icon: MessageCircle },
    { n: '03', title: 'Registre tudo', desc: 'Mande mensagens como "gastei 50 no mercado" ou "recebi salário". A IA cuida do resto.', icon: Zap },
    { n: '04', title: 'Analise seus dados', desc: 'Acesse o dashboard para ver gráficos, relatórios e insights sobre suas finanças.', icon: BarChart3 },
  ]
  return (
    <section id="como-funciona" className="py-24 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <span className="text-green-600 text-sm font-semibold uppercase tracking-wider">Como funciona</span>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mt-3 mb-4">Simples de usar em 4 passos</h2>
          <p className="text-gray-500 max-w-xl mx-auto">Você começa a registrar suas finanças em menos de 2 minutos.</p>
        </FadeIn>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <FadeIn key={s.n} delay={i * 100}>
              <div className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-full w-full h-0.5 bg-gradient-to-r from-green-200 to-transparent z-0 -translate-x-4" />
                )}
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center mb-4 shadow-sm shadow-green-200">
                    <s.icon size={22} className="text-white" />
                  </div>
                  <span className="text-green-500 text-xs font-bold">{s.n}</span>
                  <h3 className="font-semibold text-gray-900 mt-1 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Exemplos de mensagens ────────────────────────────────────────────────────
function Examples() {
  const examples = [
    { msg: '"gastei 89 reais no supermercado"', result: '✅ R$ 89,00 em Alimentação registrado' },
    { msg: '"recebi freelance de 2500"', result: '✅ R$ 2.500,00 em Freelance registrado' },
    { msg: '"me lembra de pagar o cartão dia 10 às 8h"', result: '✅ Lembrete criado para dia 10 às 08:00' },
    { msg: '"quanto gastei essa semana?"', result: '📊 Resumo: R$ 450 em 8 transações' },
    { msg: '"paguei 120 de gasolina"', result: '✅ R$ 120,00 em Transporte registrado' },
    { msg: '"meu saldo do mês"', result: '💰 Saldo: R$ 3.160 — 68% da renda guardada' },
  ]
  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <span className="text-green-600 text-sm font-semibold uppercase tracking-wider">Exemplos reais</span>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mt-3 mb-4">Fale naturalmente, a IA entende</h2>
          <p className="text-gray-500 max-w-xl mx-auto">Não precisa decorar comandos. Escreva como falaria com um amigo.</p>
        </FadeIn>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {examples.map((e, i) => (
            <FadeIn key={i} delay={i * 60}>
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 hover:border-green-200 transition-colors">
                <div className="bg-white rounded-xl p-3 mb-3 border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-700 font-medium">{e.msg}</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageCircle size={12} className="text-white" />
                  </div>
                  <p className="text-sm text-gray-600">{e.result}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Dashboard preview ────────────────────────────────────────────────────────
function DashboardPreview() {
  return (
    <section className="py-24 bg-gray-950 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <span className="text-green-400 text-sm font-semibold uppercase tracking-wider">Dashboard</span>
          <h2 className="text-3xl lg:text-4xl font-bold text-white mt-3 mb-4">
            Visualize tudo em um só lugar
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Gráficos, relatórios, agenda e controle financeiro completo no navegador.
          </p>
        </FadeIn>
        <FadeIn>
          {/* Mock dashboard */}
          <div className="bg-gray-800 rounded-3xl p-6 border border-gray-700 shadow-2xl">
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Saldo do mês', value: 'R$ 3.160', up: true },
                { label: 'Receitas', value: 'R$ 5.000', up: true },
                { label: 'Gastos', value: 'R$ 1.840', up: false },
                { label: 'Poupança', value: '63%', up: true },
              ].map(k => (
                <div key={k.label} className="bg-gray-700/50 rounded-2xl p-4">
                  <p className="text-xs text-gray-400 mb-1">{k.label}</p>
                  <p className="text-lg font-bold text-white">{k.value}</p>
                  <div className={`flex items-center gap-1 mt-1 ${k.up ? 'text-green-400' : 'text-red-400'}`}>
                    {k.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    <span className="text-xs">{k.up ? '+12%' : '-3%'}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 bg-gray-700/50 rounded-2xl p-4">
                <p className="text-sm text-gray-300 font-medium mb-3">Receitas vs Gastos</p>
                <div className="flex items-end gap-3 h-20">
                  {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col gap-1 items-center">
                      <div className="w-full bg-green-500/30 rounded-t" style={{ height: h * 0.8 + 'px' }} />
                      <div className="w-full bg-red-500/30 rounded-t" style={{ height: (100 - h) * 0.4 + 'px' }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-700/50 rounded-2xl p-4">
                <p className="text-sm text-gray-300 font-medium mb-3">Top categorias</p>
                <div className="space-y-2">
                  {[
                    { name: 'Alimentação', pct: 35, color: 'bg-green-400' },
                    { name: 'Transporte', pct: 22, color: 'bg-blue-400' },
                    { name: 'Moradia', pct: 28, color: 'bg-purple-400' },
                    { name: 'Lazer', pct: 15, color: 'bg-yellow-400' },
                  ].map(c => (
                    <div key={c.name}>
                      <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                        <span>{c.name}</span><span>{c.pct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-600 rounded-full">
                        <div className={`h-full rounded-full ${c.color}`} style={{ width: c.pct + '%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

// ─── Preços ───────────────────────────────────────────────────────────────────
function Pricing() {
  const features = [
    'Registros ilimitados pelo WhatsApp',
    'Dashboard com gráficos e relatórios',
    'Lembretes automáticos recorrentes',
    'Histórico completo de transações',
    'Relatórios por categoria e período',
    'Tema claro e escuro no dashboard',
    'Suporte via WhatsApp',
    'Acesso de qualquer dispositivo',
  ]
  return (
    <section id="precos" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <span className="text-green-600 text-sm font-semibold uppercase tracking-wider">Preços</span>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mt-3 mb-4">Simples e transparente</h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Um único plano com tudo incluído. Sem surpresas na fatura.
          </p>
        </FadeIn>
        <FadeIn className="max-w-md mx-auto">
          <div className="relative bg-gray-950 rounded-3xl p-8 border border-gray-800 shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">
              7 dias grátis
            </div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
                <MessageCircle size={20} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold">Plano Mensal</p>
                <p className="text-gray-400 text-sm">Tudo incluído</p>
              </div>
            </div>
            <div className="mb-8">
              <span className="text-gray-400 text-sm">R$</span>
              <span className="text-5xl font-bold text-white mx-1">29</span>
              <span className="text-gray-400">,90/mês</span>
              <p className="text-gray-500 text-sm mt-1">após 7 dias gratuitos</p>
            </div>
            <div className="space-y-3 mb-8">
              {features.map(f => (
                <div key={f} className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check size={11} className="text-green-400" />
                  </div>
                  <span className="text-sm text-gray-300">{f}</span>
                </div>
              ))}
            </div>
            <Link to="/register"
              className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold py-3.5 rounded-2xl transition-colors text-sm">
              Começar 7 dias grátis
              <ChevronRight size={16} />
            </Link>
            <p className="text-center text-xs text-gray-500 mt-3">Cancele quando quiser, sem multa</p>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

// ─── Depoimentos ─────────────────────────────────────────────────────────────
function Testimonials() {
  const items = [
    { name: 'Ana Lima', role: 'Freelancer', stars: 5, text: 'Finalmente consigo controlar meus gastos sem esforço. Só mando uma mensagem e está registrado. Uso todo dia!' },
    { name: 'Carlos Mendes', role: 'Empreendedor', stars: 5, text: 'Os lembretes me salvaram de pagar juros no cartão. A IA entende exatamente o que eu escrevo, sem decorar comandos.' },
    { name: 'Beatriz Costa', role: 'CLT + Freelance', stars: 5, text: 'O relatório mensal me mostrou que gastava 40% da renda em comida. Mudei meus hábitos e hoje pouco mais de 20%.' },
  ]
  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <span className="text-green-600 text-sm font-semibold uppercase tracking-wider">Depoimentos</span>
          <h2 className="text-3xl font-bold text-gray-900 mt-3 mb-4">Quem usa, recomenda</h2>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((t, i) => (
            <FadeIn key={t.name} delay={i * 100}>
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useState<number | null>(null)
  const items = [
    { q: 'Preciso instalar algum aplicativo?', a: 'Não. Você usa o WhatsApp que já tem no celular. O dashboard é acessado pelo navegador, sem downloads.' },
    { q: 'Meus dados financeiros são seguros?', a: 'Sim. Todos os dados são criptografados com AES-256. Nunca armazenamos dados de cartão de crédito — pagamento é gerenciado pelo Stripe.' },
    { q: 'A IA entende qualquer forma de escrever?', a: 'Sim. Você pode escrever "gastei 50 no mercado", "paguei 50 reais de mercado" ou "mercado 50" — ela interpreta corretamente em todos os casos.' },
    { q: 'Posso cancelar quando quiser?', a: 'Sim, cancele pelo dashboard a qualquer momento. Sem multa, sem burocracia. O acesso continua até o fim do período pago.' },
    { q: 'Funciona para pessoa jurídica também?', a: 'O sistema foi projetado para controle pessoal, mas funciona bem para MEIs e freelancers que querem separar receitas e despesas.' },
    { q: 'Quantas transações posso registrar?', a: 'Ilimitadas. Não existe limite de registros no plano mensal.' },
  ]
  return (
    <section id="faq" className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <span className="text-green-600 text-sm font-semibold uppercase tracking-wider">FAQ</span>
          <h2 className="text-3xl font-bold text-gray-900 mt-3">Perguntas frequentes</h2>
        </FadeIn>
        <div className="space-y-3">
          {items.map((item, i) => (
            <FadeIn key={i} delay={i * 50}>
              <div className="border border-gray-100 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 text-sm">{item.q}</span>
                  <ChevronRight size={16} className={`text-gray-400 transition-transform shrink-0 ml-4 ${open === i ? 'rotate-90' : ''}`} />
                </button>
                {open === i && (
                  <div className="px-5 pb-5">
                    <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CTA Final ────────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section className="py-24 bg-gradient-to-br from-gray-950 via-gray-900 to-green-950 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-green-500/10 rounded-full blur-3xl" />
      </div>
      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <FadeIn>
          <h2 className="text-3xl lg:text-5xl font-bold text-white mb-6 leading-tight">
            Comece a controlar suas finanças hoje
          </h2>
          <p className="text-gray-300 text-lg mb-8">
            7 dias grátis, sem cartão de crédito. Cancele quando quiser.
          </p>
          <Link to="/register"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold px-8 py-4 rounded-2xl transition-all shadow-lg shadow-green-900/40 text-base">
            Criar conta grátis
            <ArrowRight size={18} />
          </Link>
          <p className="text-gray-500 text-sm mt-4">Leva menos de 2 minutos para começar</p>
        </FadeIn>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-gray-950 border-t border-gray-800 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center">
            <MessageCircle size={15} className="text-white" />
          </div>
          <span className="text-white font-bold">FinanceBot</span>
        </div>
        <p className="text-gray-500 text-sm text-center">
          © {new Date().getFullYear()} FinanceBot. Todos os direitos reservados.
        </p>
        <div className="flex gap-6 text-sm text-gray-500">
          <Link to="/login" className="hover:text-gray-300 transition-colors">Entrar</Link>
          <Link to="/register" className="hover:text-gray-300 transition-colors">Cadastrar</Link>
        </div>
      </div>
    </footer>
  )
}

// ─── Page principal ───────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <div className="bg-white">
      <Header />
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <Examples />
      <DashboardPreview />
      <Pricing />
      <Testimonials />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  )
}
