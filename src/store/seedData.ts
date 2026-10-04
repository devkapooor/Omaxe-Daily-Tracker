import type { FinanceData } from '../domain/financeTypes'

const now = '1970-01-01T00:00:00.000Z'
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
