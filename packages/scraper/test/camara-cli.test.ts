import { describe, expect, it } from 'vitest'

import { parseCamaraCliArgs } from '../src/sources/camara'

describe('parseCamaraCliArgs', () => {
  it('turns an election year into an explicit full-history backfill window', () => {
    expect(parseCamaraCliArgs(['--year=2023'])).toEqual({
      proposalYear: 2023,
      votingFilters: { dateFrom: '2023-01-01', dateTo: '2023-12-31' },
    })
  })

  it('preserves explicit voting dates and rejects malformed values', () => {
    expect(parseCamaraCliArgs([
      '--from=2024-01-15',
      '--to=2024-06-30',
      '--year=2024',
    ])).toEqual({
      proposalYear: 2024,
      votingFilters: { dateFrom: '2024-01-15', dateTo: '2024-06-30' },
    })
    expect(() => parseCamaraCliArgs(['--from=15/01/2024']))
      .toThrow('Invalid --from date')
  })
})
