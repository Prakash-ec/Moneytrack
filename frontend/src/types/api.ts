export type PaymentMethod =
  | 'UPI'
  | 'Cash'
  | 'Debit Card'
  | 'Credit Card'
  | 'Bank Transfer'
  | 'Other'

export type Category =
  | 'Food'
  | 'Travel'
  | 'Utilities'
  | 'Education'
  | 'Shopping'
  | 'Health'
  | 'Entertainment'
  | 'Housing'
  | 'Other'

export type Direction = 'up' | 'down' | 'flat' | 'new' | 'none'
export type Granularity = 'daily' | 'weekly' | 'monthly'
export type SortOrder =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'created_desc'
  | 'created_asc'
export type ArchivedFilter = 'exclude' | 'include' | 'only'

export interface ExpenseTypeRef {
  id: number
  name: string
  icon: string
  color: string
  category: string | null
  is_archived: boolean
}

export interface ExpenseType extends ExpenseTypeRef {
  description: string | null
  created_at: string
  updated_at: string
  total_paise: number
  transaction_count: number
}

export interface Expense {
  id: number
  expense_type_id: number
  account_id?: number | null
  amount_paise: number
  expense_date: string
  note: string | null
  payment_method: string | null
  merchant: string | null
  created_at: string
  updated_at: string
  expense_type: ExpenseTypeRef
  account?: BankAccount | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export type ExpensePage = Page<Expense>
export type ExpenseTypePage = Page<ExpenseType>

export interface PeriodComparison {
  previous_start_date: string
  previous_end_date: string
  previous_total_paise: number
  previous_transaction_count: number
  change_paise: number
  change_percent: number | null
  direction: Direction
}

export interface MostExpensiveType {
  expense_type_id: number
  name: string
  color: string
  icon: string
  total_paise: number
  transaction_count: number
  share_percent: number
}

export interface AnalyticsSummary {
  start_date: string
  end_date: string
  total_paise: number
  transaction_count: number
  average_paise: number
  highest_expense: Expense | null
  most_expensive_type: MostExpensiveType | null
  comparison: PeriodComparison
}

export interface TypeBreakdown {
  expense_type_id: number
  name: string
  color: string
  icon: string
  is_archived: boolean
  total_paise: number
  transaction_count: number
  average_paise: number
  share_percent: number
}

export interface ByTypeResponse {
  start_date: string
  end_date: string
  total_paise: number
  items: TypeBreakdown[]
}

export interface TrendPoint {
  date: string
  total_paise: number
  transaction_count: number
}

export interface LargestDay {
  date: string
  total_paise: number
  transaction_count: number
}

export interface RecurringType {
  expense_type_id: number
  name: string
  color: string
  icon: string
  transaction_count: number
  total_paise: number
  average_gap_days: number | null
  distinct_months: number
  pattern: 'regular' | 'frequent'
  message: string
}

export interface TrendsResponse {
  start_date: string
  end_date: string
  granularity: Granularity
  series: TrendPoint[]
  largest_days: LargestDay[]
  rankings: TypeBreakdown[]
  recurring: RecurringType[]
  insights: string[]
}

export interface TypeComparison {
  expense_type_id: number
  name: string
  color: string
  icon: string
  current_total_paise: number
  previous_total_paise: number
  current_transaction_count: number
  previous_transaction_count: number
  change_paise: number
  change_percent: number | null
  direction: Direction
}

export interface ComparisonResponse {
  start_date: string
  end_date: string
  previous_start_date: string
  previous_end_date: string
  current_total_paise: number
  previous_total_paise: number
  current_transaction_count: number
  previous_transaction_count: number
  change_paise: number
  change_percent: number | null
  direction: Direction
  by_type: TypeComparison[]
}

export interface ExpenseBrief {
  id: number
  amount_paise: number
  expense_date: string
  note: string | null
}

export interface ExpenseTypePeriodSummary {
  expense_type: ExpenseTypeRef
  start_date: string
  end_date: string
  total_paise: number
  transaction_count: number
  average_paise: number
  highest_expense: ExpenseBrief | null
  lowest_expense: ExpenseBrief | null
  previous_start_date: string
  previous_end_date: string
  previous_total_paise: number
  change_paise: number
  change_percent: number | null
  direction: Direction
  daily_trend: TrendPoint[]
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  app: string
  version: string
  environment: string
  database: 'connected' | 'unavailable'
}

export interface ExpenseTypeCreateInput {
  name: string
  description?: string | null
  category?: Category | null
  icon?: string
  color?: string
}

export type ExpenseTypeUpdateInput = Partial<ExpenseTypeCreateInput>

export interface ExpenseCreateInput {
  expense_type_id: number
  account_id?: number | null
  amount_paise: number
  expense_date: string
  note?: string | null
  payment_method?: PaymentMethod | null
  merchant?: string | null
}

export type ExpenseUpdateInput = Partial<ExpenseCreateInput>

export interface RestoreSummary {
  restored_types: number
  matched_types: number
  restored_expenses: number
  skipped_expenses: number
  message: string
}

export interface ReceiptItem {
  name: string
  amount_paise?: number | null
  quantity?: number | null
}

export interface ReceiptParseResult {
  merchant: string | null
  amount_paise: number | null
  expense_date: string | null
  currency: string
  subtotal_paise: number | null
  tax_paise: number | null
  payment_method: PaymentMethod | null
  items: ReceiptItem[]
  note: string | null
  suggested_expense_type_id: number | null
  suggested_expense_type_name: string | null
  /** Suggested *new* expense type name when no existing type matches. */
  suggested_new_type_name: string | null
  confidence: {
    merchant?: number
    date?: number
    amount?: number
    type?: number
    [key: string]: number | undefined
  }
  warnings: string[]
  raw_text: string | null
  /** Scan method used: 'ocr' (Tesseract), 'groq' (Groq AI vision), or 'hybrid' (OCR+Groq). */
  scan_method: string
}

export type AccountType = 'savings' | 'current' | 'credit_card' | 'wallet' | 'cash'

export interface BankAccount {
  id: number
  name: string
  bank_name: string
  account_number_mask: string | null
  account_type: AccountType
  opening_balance_paise: number
  opening_date: string
  current_balance_paise: number
  last_reported_balance_paise: number | null
  last_reported_at: string | null
  color: string
  icon: string
  is_primary: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface BankAccountCreateInput {
  name: string
  bank_name: string
  account_number_mask?: string | null
  account_type?: AccountType
  opening_balance_paise?: number
  opening_date?: string
  color?: string
  icon?: string
  is_primary?: boolean
}

export type BankAccountUpdateInput = Partial<BankAccountCreateInput> & { is_archived?: boolean }

export interface BankAccountList {
  items: BankAccount[]
  total_accounts: number
  consolidated_balance_paise: number
  total_reported_balance_paise: number
}

export interface IncomeType {
  id: number
  name: string
  category: string | null
  icon: string
  color: string
  is_archived: boolean
  total_paise: number
  transaction_count: number
  created_at: string
  updated_at: string
}

export interface IncomeTypeList {
  items: IncomeType[]
  total: number
}

export interface IncomeTypeCreateInput {
  name: string
  category?: string | null
  icon?: string
  color?: string
}

export type IncomeTypeUpdateInput = Partial<IncomeTypeCreateInput> & { is_archived?: boolean }

export interface Income {
  id: number
  income_type_id: number
  account_id: number | null
  amount_paise: number
  income_date: string
  payer: string | null
  payment_method: string | null
  reference: string | null
  note: string | null
  created_at: string
  updated_at: string
  income_type: IncomeType
  account: BankAccount | null
}

export interface IncomeCreateInput {
  income_type_id: number
  account_id?: number | null
  amount_paise: number
  income_date: string
  payer?: string | null
  payment_method?: string | null
  reference?: string | null
  note?: string | null
}

export type IncomeUpdateInput = Partial<IncomeCreateInput>

export type IncomePage = Page<Income>

export interface AccountTransfer {
  id: number
  from_account_id: number
  to_account_id: number
  amount_paise: number
  transfer_date: string
  reference: string | null
  note: string | null
  created_at: string
  from_account: BankAccount
  to_account: BankAccount
}

export interface TransferCreateInput {
  from_account_id: number
  to_account_id: number
  amount_paise: number
  transfer_date: string
  reference?: string | null
  note?: string | null
}

export interface TransferList {
  items: AccountTransfer[]
  total: number
}

export interface CashFlowSummary {
  start_date: string
  end_date: string
  total_income_paise: number
  total_expense_paise: number
  net_cashflow_paise: number
  savings_rate_percent: number
  consolidated_balance_paise: number
  total_reported_balance_paise: number
  reconciliation_difference_paise: number
  bank_accounts: BankAccount[]
}

export interface AccountReconciliation {
  account_id: number
  account_name: string
  bank_name: string
  account_number_mask: string | null
  calculated_balance_paise: number
  last_reported_balance_paise: number | null
  discrepancy_paise: number
  is_reconciled: boolean
  last_reported_at: string | null
}

// -------------------------------------------------------------
// Security Alerts & Fraud Protection
// -------------------------------------------------------------

export interface SecurityAlert {
  id: number
  transaction_id?: number | null
  account_id?: number | null
  amount_paise: number
  merchant: string | null
  account_suffix: string | null
  alert_type: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  reason: string
  status: 'NEEDS_REVIEW' | 'RECOGNISED' | 'DISPUTED' | 'RESOLVED'
  dispute_reason?: string | null
  disputed_at?: string | null
  resolved_at?: string | null
  created_at: string
  updated_at: string
}

export interface SecuritySummary {
  total_alerts: number
  needs_review_count: number
  disputed_count: number
  recent_alerts: SecurityAlert[]
}

export interface BankHelplineInfo {
  bank_name: string
  phone: string
  sms_block_keyword?: string | null
  url: string
}

export interface SecurityActionResponse {
  alert_id: number
  status: string
  success: boolean
  message: string
  fraud_guidance?: string[] | null
  bank_helplines?: BankHelplineInfo[] | null
  cybercrime_helpline?: string | null
  cybercrime_url?: string | null
}

// -------------------------------------------------------------
// In-App Notifications & Preferences
// -------------------------------------------------------------

export interface NotificationLog {
  id: number
  title: string
  body: string
  category: 'SECURITY' | 'WEEKLY_REPORT' | 'BUDGET' | 'SYSTEM'
  reference_id?: string | null
  is_read: boolean
  read_at?: string | null
  created_at: string
}

export interface NotificationPreferences {
  suspicious_alerts_enabled: boolean
  weekly_report_enabled: boolean
  weekly_report_day: string
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  max_alerts_per_day: number
}

export interface NotificationCenterSummary {
  unread_count: number
  items: NotificationLog[]
}

// -------------------------------------------------------------
// Weekly Spending Report
// -------------------------------------------------------------

export interface WeeklyCategoryBreakdown {
  category_id: number
  category_name: string
  color: string
  icon: string
  total_paise: number
  share_percent: number
  transaction_count: number
}

export interface WeeklyTopExpense {
  id: number
  expense_date: string
  amount_paise: number
  merchant: string | null
  category_name: string
  color: string
}

export interface WeeklyAccountSpend {
  account_id: number
  account_name: string
  bank_name: string
  account_number_mask: string | null
  total_spent_paise: number
  transaction_count: number
}

export interface WeeklyReportComparison {
  previous_start_date: string
  previous_end_date: string
  previous_expense_paise: number
  previous_income_paise: number
  expense_change_paise: number
  expense_change_percent?: number | null
  direction: Direction
}

export interface WeeklyReportData {
  start_date: string
  end_date: string
  period_label: string
  total_expense_paise: number
  total_income_paise: number
  net_cashflow_paise: number
  savings_rate_percent: number
  transaction_count?: number
  average_daily_spend_paise?: number
  comparison: WeeklyReportComparison
  top_categories: WeeklyCategoryBreakdown[]
  largest_expenses: WeeklyTopExpense[]
  account_breakdown?: WeeklyAccountSpend[]
  account_spending?: WeeklyAccountSpend[]
  unreviewed_sms_count?: number
  generated_at?: string
}

