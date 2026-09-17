import { buildExportHtml } from '../exportHtml';
import { formatMoney } from '../format';
import type { Transaction } from '../../api/types';

// GET /transactions devuelve los DECIMAL de MySQL como texto ("45.50").
const tx = (id: number, amount: string | number, type: 'expense' | 'income', date: string, description = `mov ${id}`) =>
  ({
    id,
    user_id: 1,
    amount: amount as unknown as number,
    type,
    transaction_date: date,
    description,
    category_name: null,
  }) as unknown as Transaction;

const user = { name: 'Nacho', email: 'n@example.com', currency: 'EUR' };

describe('buildExportHtml', () => {
  it('suma bien los importes que llegan como texto (sin NaN ni concatenaciones)', () => {
    const html = buildExportHtml(
      [
        tx(1, '1500.00', 'income', '2026-09-01'),
        tx(2, '45.50', 'income', '2026-09-02'),
        tx(3, '10.05', 'expense', '2026-09-03'),
        tx(4, '0.95', 'expense', '2026-09-04'),
      ],
      [],
      user,
    );
    expect(html).not.toContain('NaN');
    expect(html).toContain(`Ing: +${formatMoney(1545.5, 'EUR')}`);
    expect(html).toContain(`-${formatMoney(11, 'EUR')}`);
    expect(html).toContain(`Neto: +${formatMoney(1534.5, 'EUR')}`);
  });

  it('usa la moneda de la cuenta (MXN, USD, GBP), no siempre €', () => {
    for (const currency of ['MXN', 'USD', 'GBP']) {
      const html = buildExportHtml([tx(1, '2965.85', 'expense', '2026-09-01')], [], { ...user, currency });
      expect(html).toContain(`-${formatMoney(2965.85, currency)}`);
      expect(html).not.toContain('€');
    }
  });

  it('escapa el texto del usuario', () => {
    const html = buildExportHtml([tx(1, 5, 'expense', '2026-09-01', '<img src=x onerror=alert(1)> "Cena" & co')], [], {
      ...user,
      name: '<b>Nacho</b>',
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &quot;Cena&quot; &amp; co');
    expect(html).toContain('&lt;b&gt;Nacho&lt;/b&gt;');
  });

  it('sin movimientos muestra el aviso y el total en singular/plural', () => {
    expect(buildExportHtml([], [], user)).toContain('No hay transacciones para exportar.');
    expect(buildExportHtml([tx(1, 5, 'expense', '2026-09-01')], [], user)).toContain('Total: 1 transaccion ');
  });

  it('avisa cuando el PDF no incluye todo el historial', () => {
    const html = buildExportHtml([tx(1, 5, 'expense', '2026-09-01')], [], user, { truncated: true });
    expect(html).toMatch(/solo los movimientos más recientes/i);
    expect(buildExportHtml([tx(1, 5, 'expense', '2026-09-01')], [], user)).not.toMatch(/más recientes/i);
  });
});
