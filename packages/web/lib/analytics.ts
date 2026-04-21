type EventData = Record<string, string | number | boolean | null | undefined>

declare global {
  interface Window {
    umami?: {
      track: (event?: string, data?: EventData) => void
    }
  }
}

export function track(event: string, data?: EventData): void {
  if (typeof window === 'undefined') return
  if (!window.umami) return
  try {
    window.umami.track(event, data)
  } catch {}
}
