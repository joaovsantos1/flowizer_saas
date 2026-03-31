export interface User {
  id: string
  name: string
  email?: string
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  trialDays?: number
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: User
}

export interface Transaction {
  id: string
  type: 'income' | 'expense'
  amount: number
  category: string
  description?: string
  transaction_date: string
  currency: string
  source: string
  created_at: string
}

export interface TransactionFilters {
  page?: number
  limit?: number
  type?: 'income' | 'expense' | 'all'
  startDate?: string
  endDate?: string
  category?: string
}

export interface PaginatedTransactions {
  data: Transaction[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

export interface DashboardSummary {
  period: { start: string; end: string }
  totalIncome: number
  totalExpense: number
  balance: number
  transactionCount: number
  topCategories: { category: string; total: number }[]
}

export interface Report {
  period: { start: string; end: string; type: string }
  summary: {
    totalIncome: number
    totalExpense: number
    balance: number
    transactionCount: number
    savingsRate: number
  }
  breakdown: Array<{
    category?: string
    type?: string
    transaction_date?: string
    week_start?: string
    total?: number
    income?: number
    expense?: number
  }>
}

export interface Reminder {
  id: string
  title: string
  scheduled_at: string
  recurrence: string | null
  status: 'pending' | 'sent' | 'failed' | 'canceled'
  next_run_at?: string
  recurrence_until?: string
}
