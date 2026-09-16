import { filterByBalanceMode } from '../balanceMode';

type Tx = { id: number; transaction_date: string; scope?: 'month' | 'historical' };

const txs: Tx[] = [
  { id: 1, transaction_date: '2026-02-20' },
  { id: 2, transaction_date: '2026-03-05', scope: 'month' },
  { id: 3, transaction_date: '2026-03-06', scope: 'historical' },
  { id: 4, transaction_date: '2026-03-01' },
  { id: 5, transaction_date: '2026-02-10', scope: 'historical' },
];

const ids = (list: Tx[]) => list.map((t) => t.id);

describe('filterByBalanceMode', () => {
  it('sin inicio de periodo devuelve la lista intacta', () => {
    expect(filterByBalanceMode(txs, 'month', null)).toBe(txs);
    expect(filterByBalanceMode(txs, 'historical', undefined)).toBe(txs);
  });

  it('modo mes: periodo en curso sin las marcadas como históricas', () => {
    expect(ids(filterByBalanceMode(txs, 'month', '2026-03-01'))).toEqual([2, 4]);
  });

  it('modo histórico: periodos cerrados más las marcadas como históricas', () => {
    expect(ids(filterByBalanceMode(txs, 'historical', '2026-03-01'))).toEqual([1, 3, 5]);
  });

  it('cada transacción cae exactamente en un modo', () => {
    const month = filterByBalanceMode(txs, 'month', '2026-03-01');
    const historical = filterByBalanceMode(txs, 'historical', '2026-03-01');
    expect(month.length + historical.length).toBe(txs.length);
  });
});
