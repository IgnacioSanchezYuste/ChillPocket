# ChillPocket — Modelo de datos (MySQL/MariaDB)

> Columnas: `src/api/types.ts` (frontend) + `backend/u204231532_Finanzas.sql` (esquema base, **desactualizado**)
> + `backend/update.sql` (migraciones idempotentes §5–§14, fuente real de lo añadido después).
> Si cambias el esquema: migración en `update.sql`, tipos en `types.ts` y este documento, en el mismo cambio.

## Migraciones de `update.sql`
| § | Contenido |
|---|---|
| 5 | Billing: `plans`, `user_entitlements`, `billing_events`. El backfill early adopter (5.4) ya se aplicó y está retirado: al re-ejecutarse regalaba Plus. |
| 6 | `auth_attempts` (rate limiting de `/auth/*`). |
| 7 | Límite `recurring` del plan free: 1 → 3. |
| 8 | Modelo dual: `transactions.scope`, `monthly_closures`, `users.income_reference/income_payday/savings_goal_monthly`. |
| 9 | `budgets.auto_renew`. |
| 10 | `transactions.receipt_path` + features completas de cada plan (`receipt_photos` en los de pago). Sin `CAST AS JSON`: MariaDB no lo admite. |
| 11 | `user_entitlements.plan_id` (FK a `plans`) + fila base `manual` (gratis) para cada usuario. |
| 12 | `users.email_verified_at` + tabla `email_codes`; cuentas de Google marcadas como verificadas. |
| 13 | `usage_daily` (monitoreo anónimo), `exchange_rates` (caché de cambios), `currency_conversions` (registro). |
| 14 | `recurring_expenses.last_generated_date` (con relleno), `transactions.transfer`, `users.auto_savings_period` (relleno con hoy para quien ya tenía objetivo: su primer ahorro automático llega en el próximo periodo). |

> Probado en MariaDB 10.4 local: el script completo se puede ejecutar varias veces. La BD de producción es
> **MariaDB 11.8**: nada de sintaxis exclusiva de MySQL (`CAST(... AS JSON)`, etc.).

## Tablas

### `users`
`id, name, email, password_hash, currency, timezone, avatar_url, google_sub, theme, income_reference, income_payday, savings_goal_monthly, email_verified_at, created_at`
- `password_hash`: bcrypt. Los usuarios solo-Google llevan una contraseña aleatoria inutilizable.
- `google_sub`: **UNIQUE** (`uniq_google_sub`). Permite enlazar una cuenta de email al entrar con Google.
- `currency` (`EUR`), `timezone` (`Europe/Madrid`), `theme` (`light|dark|system`).
- Modelo dual (§8):
  - `income_reference DECIMAL(10,2) NULL`: salario neto declarado.
  - `income_payday TINYINT NULL` (1-31): día de cobro; define el periodo financiero. `NULL` → mes natural.
  - `savings_goal_monthly DECIMAL(10,2) NULL`: objetivo mensual de ahorro = importe del ahorro automático.
  - `auto_savings_period DATE NULL` (§14): inicio del último periodo con ahorro automático aplicado.
  - Se escriben con `PUT /me` (tutorial, "Ingresos y ahorro" en Ajustes y `useFinancialProfileSync`). El
    cliente guarda además su versión local, con la frecuencia y el importe tal cual (semanal incluido).
- `email_verified_at DATETIME NULL` (§12): se rellena al verificar con código, al restablecer la contraseña o al
  entrar con Google. Necesario para comprar un plan (comprobación en la app).

### `categories`
`id, user_id (NULL = sistema), name, color (hex), icon, type ('expense'|'income'), created_at`
- Las categorías del sistema guardan nombres de **Material Icons**; el front los traduce con
  `src/utils/categoryIcon.ts`. **No asumas que `icon` es un Ionicon válido.**
- Categoría de sistema especial **"Ahorro"** (`expense`, icono `savings`) para el modelo de metas.

### `transactions`
`id, user_id, amount, description, type, transaction_date, notes, payment_method, recurring_id, goal_id,
 category_id, scope, receipt_path, created_at, updated_at`
- `payment_method`: `cash | debit_card | credit_card | bizum | transfer | other` (nullable).
- `recurring_id` → `recurring_expenses(id)` **ON DELETE SET NULL**.
- `goal_id` → `savings_goals(id)` **ON DELETE SET NULL**. Con `goal_id`, el `scope` es inmutable (PUT → 409).
- `scope ENUM('month','historical') DEFAULT 'month'`:
  - `month` → cuenta para "Saldo del mes" y, al cerrarse el periodo, para su `surplus`.
  - `historical` → va directo a "Mis ahorros". Solo filas antiguas: desde §14 la API rechaza crearlas.
- `transfer TINYINT` (§14): 0 normal, 1 transferencia manual, 2 ahorro automático (ver modelo dual).
- `amount DECIMAL(12,2)` (igual en `recurring_expenses`, `budgets` y `savings_goals`); `users.income_reference`,
  `users.savings_goal_monthly` y `monthly_closures.surplus` son `DECIMAL(10,2)`.
- `receipt_path VARCHAR(255) NULL`: p. ej. `Images/42/abc123.jpg`. Solo lo escriben los endpoints `/receipt`.
- **UNIQUE `(user_id, recurring_id, transaction_date)`**: hace idempotente la generación de recurrentes.

### `recurring_expenses`
`id, user_id, name, amount, type ('expense'|'income'), frequency ('weekly'|'monthly'|'yearly'),
 start_date, end_date, is_active (0|1), notes, category_id`
- Sirve para gastos **e ingresos** recurrentes (la nómina es un ingreso recurrente).
- `last_generated_date DATE NULL` (§14): última fecha generada; la generación sigue desde ahí.

### `budgets`
`id, user_id, amount (límite), month_year ('YYYY-MM'), reset_day (1-28), category_id (NULL = global), auto_renew (0|1)`
- El % gastado es sobre el **límite**, no sobre el total de gastos.
- `auto_renew=1`: `autoRenewBudgets()` lo clona al consultar un mes nuevo. **Riesgo**: para el presupuesto global
  (`category_id NULL`) el UNIQUE no evita duplicados (MySQL trata cada NULL como distinto).

### `savings_goals`
`id, user_id, name, target_amount, current_amount, target_date, description, color, icon, is_completed (0|1)`
- La respuesta ya trae `progress_pct` y `days_remaining`.

### `monthly_closures` (§8)
`id, user_id, period_start, period_end, surplus, closed_at`
- Una fila por periodo financiero cerrado. `surplus = SUM(income) − SUM(expense)` de las transacciones
  `scope='month'` del periodo. **Puede ser negativo** (decisión cerrada: sin mínimo en 0).
- UNIQUE `(user_id, period_start)`; índice `(user_id, period_end)`; FK a `users` ON DELETE CASCADE.

### Billing (§5)
- `plans`: `code` (`free|plus|family|pro_freelance`), `limits_json`, `features_json`. "Lifetime" no es un plan
  propio: es una fila de `user_entitlements` con `source='lifetime'` sobre Plus.
  - Límites: `budgets, goals, recurring, custom_categories, history_months, family_members` (`null` = ilimitado).
    Free: budgets 2, goals 2, recurring 3, custom_categories 8, history_months 3.
  - Features: `advanced_analytics, export, web_access, cloud_backup, family_mode, fiscal_reports, receipt_photos`.
- `user_entitlements`: planes por usuario; `source` = `early_adopter | manual | stripe | revenuecat | lifetime`.
  - `plan_id` (§11, FK a `plans.id`) **manda**; `plan_code` es una copia que el backend corrige sola.
  - Cada usuario tiene una **fila base** `source='manual'` (gratis al registrarse); los early adopters tienen en su
    lugar la `early_adopter`. **Para cambiar el plan a mano**, edita el `plan_id` de esa fila:
    1 = Gratis · 2 = Plus · 3 = Familia · 4 = Pro Freelance (comprueba antes `SELECT id, code FROM plans`).
  - Los webhooks crean sus propias filas (`revenuecat`/`lifetime`) y nunca desactivan las `manual`/`early_adopter`.
  - Con varias filas activas y vigentes gana la de mayor rango; a igual plan, la permanente (`expires_at` NULL). Sin
    ninguna → `free`.
- `billing_events`: auditoría de webhooks, UNIQUE `(provider, external_id)`.

### `auth_attempts` (§6)
`bucket_key ('ip:…' | 'email:…'), endpoint, attempted_at`. Contadores del rate limiting. Endpoints: `login`,
`register`, `google`, `pwd_forgot` y `verify_send` (cuentan cada solicitud), `pwd_reset` y `verify` (cuentan fallos).

### `email_codes` (§12)
`id, user_id, purpose ('verify_email' | 'reset_password'), code_hash, attempts, expires_at, used_at, created_at`
- Código de 6 dígitos; solo se guarda `HMAC-SHA256(código, JWT_SECRET)`. Emitir uno invalida los anteriores del
  mismo propósito. Máximo 5 intentos; uso único con UPDATE atómico. Limpieza oportunista de los de > 7 días.
- Caducidad: verificación 60 min, recuperación 15 min.

### `usage_daily` (§13)
`day, event, platform, events, users` — PK `(day, event, platform)`. Uso anónimo: sin `user_id`. `users` cuenta usuarios
únicos porque el cliente marca `first_today` solo la primera vez que hace ese evento ese día.

### `exchange_rates` (§13)
`base, quote, rate DECIMAL(18,8), rate_date, fetched_at` — PK `(base, quote)`. Caché compartida de 12 h.

### `currency_conversions` (§13)
`id, user_id, from_currency, to_currency, rate, rate_date, transactions, converted_at`. Una fila por cambio de moneda
de una cuenta. Para deshacer uno: convertir de vuelta (con el cambio de ese momento; puede haber deriva de céntimos).

## Moneda de la cuenta
- `users.currency` es la moneda de **todos** los importes del usuario. No hay importes en otras monedas.
- Cambiarla con datos exige `POST /me/currency`, que multiplica todos los importes por el cambio del BCE del día
  (`ROUND(x * rate, 2)` en decimal exacto: con el cambio como texto MariaDB opera en DOUBLE y redondea mal los
  ,xx5) y recalcula los cierres. El perfil local del móvil se convierte con `convertLocalProfile` (el ingreso
  mensual lo toma del servidor; el semanal se escala y `reconcileLocalProfile` tolera la diferencia de céntimos).
  Tras convertir, `current_amount` de una meta puede diferir 1 céntimo de la suma de sus aportaciones.

## Modelo dual "Saldo del mes / Mis ahorros"
- **Saldo del mes** = ingresos − gastos del periodo en curso, solo `scope='month'` → `summary.period_balance`
  (no `summary.balance`, que es del mes natural). En el cliente, `monthBalanceFigures()` elige uno u otro.
  Comprobación: `period_balance + net_total_historical` = todo el dinero registrado.
- **Mis ahorros** (`net_total_historical`) = `SUM(monthly_closures.surplus)` + transacciones `scope='historical'`
  + transferencias (gasto `transfer>0` suma, ingreso `transfer>0` resta; SQL común en `HISTORICAL_TX_SQL`).
  **No incluye el periodo en curso**, para no contarlo dos veces.
- **Solo se entra en "Mis ahorros" desde el saldo del mes** (decisión 2026-09-17): los movimientos nuevos son siempre
  `scope='month'`; las filas `historical` antiguas se conservan. Mover dinero = transferencia (`transactions.transfer`:
  1 manual, 2 automática), una fila `scope='month'` en la categoría sistema "Ahorro": al cerrar el periodo baja el
  sobrante y la transferencia lo devuelve a ahorros, así que el total no cambia. Cuentan en la analítica como las
  aportaciones a metas (gasto "Ahorro"; la retirada, como ingreso). El sobrante del mes sigue pasando a ahorros al cerrar.
- **Ahorro automático** = `users.savings_goal_monthly` (el "objetivo de ahorro mensual"): `applyAutoSavings()`
  (en `requireAuth`, tras los cierres) crea una transferencia `transfer=2` con fecha de inicio del periodo, una vez
  por periodo (`users.auto_savings_period`; si el usuario la borra no se repite). Cambiar el importe se aplica en el
  siguiente cobro; cambiar el día de cobro no la duplica. No comprueba saldo: el saldo del mes puede quedar negativo.
- Periodo: del día `payday` del mes anterior al `payday-1` del actual (con `LAST_DAY` si el mes no tiene ese día);
  sin payday → mes natural. Lógica espejo en cliente: `src/utils/financialPeriod.ts` (con tests).
- `closeFinancialPeriods()` se ejecuta en `requireAuth`, cierra hasta **24 periodos por petición** con
  `INSERT IGNORE`. Con más de 24 meses de histórico, varias peticiones terminan de completarlo.
- Si el usuario cambia su día de cobro, `PUT /me` borra sus cierres y se recalculan con el periodo nuevo.
- La analítica sigue en **mes natural** hasta la Fase 5 (aplazada).

## Modelo "sobre" de metas — IMPORTANTE
Ahorrar **mueve dinero de verdad**:
- Aportar crea un **gasto** en la categoría "Ahorro" con `goal_id`; retirar crea el movimiento inverso.
- **No se puede aportar más del saldo disponible** del pool elegido (`currentPeriodAvailable` / `historicalAvailable`).
- Por eso las aportaciones aparecen en Movimientos. `saved_this_month` = aportes − retiradas del mes.

## Generación perezosa de recurrentes
- `expandRecurringTransactions()` corre en cada petición autenticada e inserta, de forma idempotente, las
  transacciones que ya tocan hasta hoy. Sigue desde `recurring_expenses.last_generated_date` (o la última cuota, si es
  posterior): así una cuota borrada no se vuelve a crear. **No hay cron**: si el usuario no entra, no se generan.
- Los cargos futuros del periodo no existen aún como transacción; el cliente los reserva con
  `pendingRecurringExpense()` para el presupuesto diario.

## Reglas numéricas (no romper)
- **Neto mensual** = `avgIncome − avgExpense`. No sumar los recurrentes aparte: ya están en las transacciones.
- `savings_ratio` se muestra como **"% Libre"**; `saved_this_month` es lo realmente movido a metas.
