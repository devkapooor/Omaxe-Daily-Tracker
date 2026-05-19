import type { FinanceData } from '../domain/financeTypes'

const now = new Date().toISOString()
export const seedData: FinanceData = {
  stores: [
    {
      id: 'single-store',
      name: 'Omaxe Main Store',
      location: 'Omaxe',
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ],
  sales: [],
  purchases: [],
  cashouts: [],
  payments: [],
}
