export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'alphahub.theme'

const THEME_CHANGE_EVENT = 'alphahub:theme-change'
const THEME_COLORS: Record<Theme, string> = {
  light: '#f4f8fc',
  dark: '#212121',
}

let isSystemListenerActive = false

export function resolveTheme(storedTheme: string | null, prefersDark: boolean): Theme {
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme
  return prefersDark ? 'dark' : 'light'
}

function getStoredTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    return null
  }
}

function getSystemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }))
}

export function initializeTheme() {
  const theme = resolveTheme(getStoredTheme(), getSystemTheme())
  applyTheme(theme)

  if (!isSystemListenerActive && window.matchMedia) {
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)')
    systemPreference.addEventListener('change', (event) => {
      if (!getStoredTheme()) applyTheme(event.matches ? 'dark' : 'light')
    })
    isSystemListenerActive = true
  }

  return theme
}

export function getActiveTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The active theme still applies when browser storage is unavailable.
  }
  applyTheme(theme)
}

export function subscribeToTheme(listener: (theme: Theme) => void) {
  const handleThemeChange = (event: Event) => listener((event as CustomEvent<Theme>).detail)
  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
}
