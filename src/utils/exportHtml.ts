import type { Transaction, Category, User } from '../api/types';

/** Escapa caracteres especiales HTML para que no rompan el markup del PDF. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formatea un importe con signo y moneda, p.ej. "+1.234,56 €". */
function formatAmount(amount: number, type: 'expense' | 'income', currency = 'EUR'): string {
  const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€';
  const abs = Math.abs(amount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = type === 'income' ? '+' : '-';
  return `${sign}${abs} ${symbol}`;
}

/** Convierte 'YYYY-MM-DD' → 'Junio 2026'. */
function monthLabel(monthYear: string): string {
  const [y, m] = monthYear.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

/** Convierte 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Extrae 'YYYY-MM' de una fecha 'YYYY-MM-DD'. */
function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * Genera el HTML completo para el PDF de exportación.
 * Pura: sin efectos secundarios, testeable de forma aislada.
 */
export function buildExportHtml(
  transactions: Transaction[],
  _categories: Category[],
  user: Pick<User, 'name' | 'email' | 'currency'> | null,
): string {
  const currency = user?.currency ?? 'EUR';
  const today = new Date().toISOString().slice(0, 10);

  // Agrupa transacciones por mes (YYYY-MM), más reciente primero.
  const byMonth = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const mk = monthKey(tx.transaction_date);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk)!.push(tx);
  }
  const sortedMonths = [...byMonth.keys()].sort((a, b) => (a < b ? 1 : -1));

  // Construye las secciones por mes.
  const monthSections = sortedMonths.map((mk) => {
    const txs = byMonth.get(mk)!.sort(
      (a, b) => (a.transaction_date < b.transaction_date ? 1 : -1),
    );
    let totalIncome = 0;
    let totalExpense = 0;

    const rows = txs
      .map((tx) => {
        const color = tx.type === 'income' ? '#059669' : '#DC2626';
        const cat = escapeHtml(tx.category_name ?? 'Sin categoria');
        const desc = escapeHtml(tx.description);
        const typeLabel = tx.type === 'income' ? 'Ingreso' : 'Gasto';
        const amountStr = formatAmount(tx.amount, tx.type, currency);
        if (tx.type === 'income') totalIncome += tx.amount;
        else totalExpense += tx.amount;
        return `
        <tr>
          <td>${escapeHtml(formatDate(tx.transaction_date))}</td>
          <td>${cat}</td>
          <td>${desc}</td>
          <td>${typeLabel}</td>
          <td style="color:${color};font-weight:600;text-align:right;">${escapeHtml(amountStr)}</td>
        </tr>`;
      })
      .join('');

    const net = totalIncome - totalExpense;
    const netColor = net >= 0 ? '#059669' : '#DC2626';
    const incomeStr = formatAmount(totalIncome, 'income', currency);
    const expenseStr = formatAmount(totalExpense, 'expense', currency);
    const netStr = formatAmount(Math.abs(net), net >= 0 ? 'income' : 'expense', currency);

    return `
    <section>
      <h2 style="font-size:16px;margin:24px 0 8px;color:#1e293b;text-transform:capitalize;">${escapeHtml(monthLabel(mk))}</h2>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Categoria</th>
            <th>Descripcion</th>
            <th>Tipo</th>
            <th style="text-align:right;">Importe</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#f8fafc;font-weight:600;">
            <td colspan="3" style="font-size:12px;color:#64748b;">Resumen del mes</td>
            <td style="color:#059669;font-size:12px;">Ing: ${escapeHtml(incomeStr)} &nbsp; Gst: <span style="color:#DC2626;">${escapeHtml(expenseStr)}</span></td>
            <td style="text-align:right;color:${netColor};">Neto: ${escapeHtml(netStr)}</td>
          </tr>
        </tfoot>
      </table>
    </section>`;
  }).join('');

  const totalTx = transactions.length;
  const userName = escapeHtml(user?.name ?? '');
  const userEmail = escapeHtml(user?.email ?? '');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Resumen de transacciones - ChillPocket</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: #1e293b;
    padding: 32px;
    background: #ffffff;
  }
  header { margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
  header h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
  header p { font-size: 12px; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th {
    background: #f1f5f9;
    text-align: left;
    padding: 8px 10px;
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    border-bottom: 1px solid #e2e8f0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  tfoot td { padding: 8px 10px; border-top: 1px solid #e2e8f0; }
  footer {
    margin-top: 32px;
    border-top: 1px solid #e2e8f0;
    padding-top: 12px;
    font-size: 11px;
    color: #94a3b8;
    text-align: center;
  }
</style>
</head>
<body>
  <header>
    <h1>Resumen de transacciones</h1>
    <p>ChillPocket</p>
    ${userName ? `<p>${userName}${userEmail ? ` &lt;${userEmail}&gt;` : ''}</p>` : ''}
    <p>Generado el ${escapeHtml(today)}</p>
  </header>

  ${monthSections || '<p style="color:#94a3b8;margin-top:16px;">No hay transacciones para exportar.</p>'}

  <footer>
    Total: ${totalTx} transacci${totalTx === 1 ? 'on' : 'ones'} &bull; Generado por ChillPocket &bull; ${escapeHtml(today)}
  </footer>
</body>
</html>`;
}
