export const CASHOUT_WINDOW_START_MINUTE = 23 * 60 + 55
export const CASHOUT_WINDOW_END_MINUTE = 20

export function isCashoutWindowOpen(serverTimeMs: number) {
  if (!Number.isFinite(serverTimeMs)) return false
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(serverTimeMs))
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  const minuteOfDay = hour * 60 + minute
  return minuteOfDay >= CASHOUT_WINDOW_START_MINUTE || minuteOfDay <= CASHOUT_WINDOW_END_MINUTE
}
