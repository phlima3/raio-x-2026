export interface WebVitalPayload {
  id: string
  name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB'
  value: number
  rating?: 'good' | 'needs-improvement' | 'poor'
  delta?: number
  navigationType?: string
  path?: string
}

const METRICS = new Set<WebVitalPayload['name']>(['CLS', 'FCP', 'INP', 'LCP', 'TTFB'])
const RATINGS = new Set(['good', 'needs-improvement', 'poor'])

export function validateWebVital(value: unknown): WebVitalPayload | null {
  if (!value || typeof value !== 'object') return null
  const metric = value as Record<string, unknown>
  if (
    typeof metric.id !== 'string' ||
    metric.id.length < 1 ||
    metric.id.length > 120 ||
    typeof metric.name !== 'string' ||
    !METRICS.has(metric.name as WebVitalPayload['name']) ||
    typeof metric.value !== 'number' ||
    !Number.isFinite(metric.value)
  ) {
    return null
  }
  if (metric.rating != null && (typeof metric.rating !== 'string' || !RATINGS.has(metric.rating))) {
    return null
  }
  if (metric.delta != null && (typeof metric.delta !== 'number' || !Number.isFinite(metric.delta))) {
    return null
  }
  if (
    metric.navigationType != null &&
    (typeof metric.navigationType !== 'string' || metric.navigationType.length > 64)
  ) {
    return null
  }
  if (
    metric.path != null &&
    (typeof metric.path !== 'string' || !metric.path.startsWith('/') || metric.path.length > 300)
  ) {
    return null
  }

  return {
    id: metric.id,
    name: metric.name as WebVitalPayload['name'],
    value: metric.value,
    ...(metric.rating != null && {
      rating: metric.rating as WebVitalPayload['rating'],
    }),
    ...(metric.delta != null && { delta: metric.delta }),
    ...(metric.navigationType != null && { navigationType: metric.navigationType }),
    ...(metric.path != null && { path: metric.path }),
  }
}
