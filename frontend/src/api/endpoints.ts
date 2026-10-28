import { apiGet } from './client'
import type { CountryBreakdown, CustomerSummary, MonthlySales, SalesSummary, TopProducts } from './types'

export interface DateFilter {
  from?: string
  to?: string
}

type Signal = AbortSignal | undefined

export const api = {
  salesSummary: (token: string, range: DateFilter, signal?: Signal) =>
    apiGet<SalesSummary>('/sales/summary', token, { ...range }, signal),
  monthlySales: (token: string, range: DateFilter, signal?: Signal) =>
    apiGet<MonthlySales>('/sales/monthly', token, { ...range }, signal),
  revenueByCountry: (token: string, limit: number, signal?: Signal) =>
    apiGet<CountryBreakdown>('/sales/by-country', token, { limit }, signal),
  topProducts: (token: string, limit: number, signal?: Signal) =>
    apiGet<TopProducts>('/products/top', token, { limit }, signal),
  customerSummary: (token: string, customerId: number, signal?: Signal) =>
    apiGet<CustomerSummary>(`/customers/${encodeURIComponent(customerId)}/summary`, token, {}, signal),
}
