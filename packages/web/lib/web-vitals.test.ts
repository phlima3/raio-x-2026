import assert from 'node:assert/strict'
import test from 'node:test'
import { validateWebVital } from './web-vitals'

test('accepts the stable fields needed to monitor Core Web Vitals', () => {
  assert.deepEqual(
    validateWebVital({
      id: 'v4-123',
      name: 'LCP',
      value: 2100.5,
      rating: 'good',
      delta: 2100.5,
      navigationType: 'navigate',
      path: '/candidatos/ana',
    }),
    {
      id: 'v4-123',
      name: 'LCP',
      value: 2100.5,
      rating: 'good',
      delta: 2100.5,
      navigationType: 'navigate',
      path: '/candidatos/ana',
    },
  )
})

test('rejects unknown metrics and non-finite values', () => {
  assert.equal(validateWebVital({ id: '1', name: 'CPU', value: 1 }), null)
  assert.equal(validateWebVital({ id: '1', name: 'LCP', value: Number.NaN }), null)
  assert.equal(
    validateWebVital({ id: '1', name: 'LCP', value: 1, navigationType: 'x'.repeat(65) }),
    null,
  )
})
