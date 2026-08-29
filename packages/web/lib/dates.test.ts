// Forçar o fuso do processo antes de qualquer uso de `Date`/`Intl`: sem a
// correção (sem `timeZone: 'UTC'` no `toLocaleDateString`), rodar em
// 'America/Sao_Paulo' faz meia-noite UTC do dia 28 virar 21h do dia 27 local,
// e o teste falha de verdade.
process.env.TZ = 'America/Sao_Paulo'

import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAccountsDate } from './dates'

test('formats a UTC-midnight date by its UTC calendar day, not the local one', () => {
  assert.equal(formatAccountsDate('2026-08-28T00:00:00.000Z'), '28/08/2026')
})

test('accepts a Date instance the same way', () => {
  assert.equal(formatAccountsDate(new Date('2026-08-28T00:00:00.000Z')), '28/08/2026')
})
