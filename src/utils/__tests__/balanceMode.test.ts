import { filterByBalanceMode, monthBalanceFigures } from '../balanceMode';

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

describe('monthBalanceFigures', () => {
  const summary = {
    total_income: 200,
    total_expense: 50,
    balance: 150,
    savings_ratio: 75,
    period_income: 1000,
    period_expense: 50,
    period_balance: 950,
  };

  it('mes actual: usa el periodo en curso', () => {
    expect(monthBalanceFigures(summary, true)).toEqual({ income: 1000, expense: 50, balance: 950, savingsRatio: 95 });
  });

  it('otro mes: usa el mes natural consultado', () => {
    expect(monthBalanceFigures(summary, false)).toEqual({ income: 200, expense: 50, balance: 150, savingsRatio: 75 });
  });

  it('backend sin campos de periodo: cae al mes natural', () => {
    const { period_income, period_expense, period_balance, ...legacy } = summary;
    expect(monthBalanceFigures(legacy, true).balance).toBe(150);
  });

  it('periodo sin ingresos: % libre 0 y saldo negativo', () => {
    expect(monthBalanceFigures({ ...summary, period_income: 0, period_expense: 50, period_balance: -50 }, true))
      .toEqual({ income: 0, expense: 50, balance: -50, savingsRatio: 0 });
  });

  it('sin resumen todo es 0', () => {
    expect(monthBalanceFigures(null, true)).toEqual({ income: 0, expense: 0, balance: 0, savingsRatio: 0 });
  });
});
