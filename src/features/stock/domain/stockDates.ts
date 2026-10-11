import { today } from '@/app/uiHelpers'
export function recentStockDate() {
  const date = new Date(`${today()}T00:00:00+05:30`)
  date.setTime(date.getTime() - 6 * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
