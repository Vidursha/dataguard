/** Response shapes of the DataGuard Sales API (see wso2/openapi.json). */

export interface DateRange {
  start: string | null
  end: string | null
}

export interface SalesSummary {
  period: DateRange
  total_revenue: number
  orders: number
  average_order_value: number
  customers: number
  units_sold: number
}

export interface MonthlyPoint {
  month: string
  revenue: number
  orders: number
}

export interface MonthlySales {
  period: DateRange
  months: MonthlyPoint[]
}

export interface CountryRevenue {
  country: string
  revenue: number
  orders: number
  share: number
}

export interface CountryBreakdown {
  total_revenue: number
  countries: CountryRevenue[]
}

export interface ProductSales {
  rank: number
  stock_code: string
  description: string
  units_sold: number
  revenue: number
  orders: number
}

export interface TopProducts {
  products: ProductSales[]
}

export interface CustomerSummary {
  customer_id: number
  country: string
  orders: number
  total_spend: number
  units_bought: number
  average_order_value: number
  first_order: string
  last_order: string
}
