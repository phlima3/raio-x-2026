'use client'

import { useReportWebVitals } from 'next/web-vitals'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const payload = {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navigationType: metric.navigationType,
      path: window.location.pathname,
    }
    const endpoint = process.env.NEXT_PUBLIC_WEB_VITALS_ENDPOINT ?? '/api/web-vitals'
    const body = JSON.stringify(payload)

    if (!navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }

    if (window.gtag) {
      window.gtag('event', metric.name, {
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        event_label: metric.id,
        metric_rating: metric.rating,
        non_interaction: true,
      })
    }
  })

  return null
}
