# ChillPocket — Modelo de datos (MySQL/MariaDB)

> Fuente de verdad de columnas: `src/api/types.ts` (frontend) + `backend/u204231532_Finanzas.sql` (esquema)
> + `backend/update.sql` (migración 1.1.0). Si cambias el esquema, actualiza los tres y este documento.

## Tablas

### `users`
`id, name, email, password_hash, currency, timezone, avatar_url, google_sub, theme, created_at`
- `password_hash`: `password_hash()` de PHP (bcrypt). Usuarios solo-Google llevan password aleatoria no usable.
- `google_sub`: el `sub` del ID token de Google. **UNIQUE** (`uniq_google_sub`). Permite login Google y enlazar
  una cuenta de email existente al iniciar con Google por primera vez.
- `currency` (p.ej. `EUR`), `timezone` (`Europe/Madrid`), `theme` (`light|dark|system`).

### `categories`
`id, user_id (NULL = sistema/global), name, color (hex), icon, type ('expense'|'income'), created_at`
- `user_id IS NULL` → categorías **del sistema** sembradas (Alimentos, Transporte, Salario, etc.). Los iconos
  se guardan como nombres **Material Icons** (`restaurant`, `directions-car`...). El front los traduce a Ionicons
  con `src/utils/categoryIcon.ts` (mapa + fallback). **No asumas que `icon` es un Ionicon válido.**
- Existe una categoría sistema especial **"Ahorro"** (`type='expense'`, icon `savings`) usada por el modelo de metas.

### `transactions`
`id, user_id, amount, description, type, transaction_date, notes, payment_method, recurring_id, goal_id,
 category_id, created_at, updated_at`
- `payment_method`: `cash | debit_card | credit_card | bizum | transfer | other` (nullable).
- `recurring_id` → FK `recurring_expenses(id)` **ON DELETE SET NULL**. Marca transacciones generadas por un recurrente.
- `goal_id` → FK `savings_goals(id)` **ON DELETE SET NULL**. Marca contribuciones a metas (modelo sobre).
- **UNIQUE `(user_id, recurring_id, transaction_date)`** (`uniq_user_recurring_date`): hace **idempotente** la
  generación perezosa de recurrentes (no se duplican aunque se ejecute varias veces).
- Índices: `idx_recurring`, `idx_goal`.

### `recurring_expenses`
`id, user_id, name, amount, type ('expense'|'income'), frequency ('weekly'|'monthly'|'yearly'),
 start_date, end_date, is_active (0|1), notes, category_id`
- A pesar del nombre, sirve para **gastos E ingresos** recurrentes (la nómina es un income recurrente).
- `is_active` se puede alternar con el endpoint toggle.

### `budgets`
`id, user_id, amount (límite), month_year ('YYYY-MM'), reset_day (1-28, default 1), category_id (NULL = global)`
- El `% gastado` se calcula respecto al **límite del presupuesto**, no respecto al total de gastos.

### `savings_goals`
`id, user_id, name, target_amount, current_amount, target_date, description, color, icon, is_completed (0|1)`
- El front calcula `progress_pct` y `days_remaining` (vienen ya en la respuesta).

## Modelo "sobre" de metas de ahorro (envelope) — IMPORTANTE
Ahorrar dinero **mueve dinero de verdad**, no es solo un contador:
- Contribuir a una meta crea una **transacción de gasto** en la categoría sistema **"Ahorro"** con `goal_id` puesto.
- Retirar de la meta crea el movimiento inverso.
- **No puedes ahorrar más de tu saldo disponible** (`availableBalance` valida en backend antes de contribuir).
- Por eso las contribuciones aparecen en Movimientos y afectan al saldo. `saved_this_month` = aportes − retiradas del mes.

## Generación perezosa de recurrentes
- `expandRecurringTransactions($conn, $userId)` se llama al pedir datos (login, analytics, etc.). Recorre los
  recurrentes activos y crea las transacciones que ya tocan hasta hoy, con inserción idempotente (UNIQUE arriba).
- **No hay cron**: si el usuario no entra, no se generan hasta que vuelve. Es intencional (hosting compartido).

## Reglas de negocio numéricas (no romper)
- **Neto mensual** = `avgIncome − avgExpense` (NO sumar recurrentes aparte: ya están dentro de las transacciones
  reales una vez generados). Duplicar recurrentes fue un bug corregido.
- `savings_ratio` se presenta como **"% Libre"** del mes; `saved_this_month` es lo realmente movido a metas.
