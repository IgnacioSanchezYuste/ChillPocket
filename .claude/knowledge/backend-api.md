# ChillPocket — API backend (Slim 4, `backend/index.php`)

> Contratos exactos en `src/api/endpoints.ts` (cliente) y handlers en `backend/index.php`.
> Todas las rutas protegidas requieren cabecera `Authorization: Bearer <JWT>`. El JWT lo emite el backend
> (firebase/php-jwt, expiración **7 días**). Respuestas JSON. Errores: `{ error: true, message }` + status HTTP.

## Auth (públicas)
| Método | Ruta | Body | Respuesta | Notas |
|---|---|---|---|---|
| POST | `/auth/register` | `{name,email,password,currency?}` | `{success,token,user}` | Crea usuario (bcrypt). |
| POST | `/auth/login` | `{email,password}` | `{success,token,user}` | |
| POST | `/auth/google` | `{id_token}` | `{success,token,user,is_new}` | Verifica id_token con el endpoint `tokeninfo` de Google contra los client IDs permitidos (web+android). Busca por `google_sub`, si no por email (enlaza), si no crea. **`is_new=true`** cuando crea → el front lanza el onboarding. |

## Perfil (protegidas)
| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/me` | — | `{user}` |
| PUT | `/me` | `{name?,currency?,timezone?,theme?,avatar_url?}` | `{success,user}` |
| PUT | `/me/password` | `{current_password,new_password}` | `{success}` |

## Categorías (protegidas)
| Método | Ruta | Body / Query | Notas |
|---|---|---|---|
| GET | `/categories` | `?type=expense\|income` | Incluye categorías del sistema (`user_id NULL`) + las del usuario. |
| POST | `/categories` | `{name,type,color?,icon?}` | Devuelve `{success,category}`. |
| PUT | `/categories/{id}` | `Partial<Category>` | Solo categorías propias. |
| DELETE | `/categories/{id}` | — | Solo propias; las del sistema no se borran. |

## Transacciones (protegidas)
| Método | Ruta | Body / Query |
|---|---|---|
| GET | `/transactions` | `?from,to,type,category_id,payment_method,search,limit,offset` → `{transactions}` |
| POST | `/transactions` | `{amount,description,type,transaction_date,category_id?,payment_method?,notes?}` → `{success,transaction}` |
| PUT | `/transactions/{id}` | `Partial<Transaction>` |
| DELETE | `/transactions/{id}` | — |

## Recurrentes (protegidas)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/recurring` | `{recurring, projection}` (también dispara `expandRecurringTransactions`). |
| POST | `/recurring` | `{name,amount,type,frequency,start_date,category_id?}` |
| PUT | `/recurring/{id}` | actualizar |
| PATCH **o** POST | `/recurring/{id}/toggle` | Activa/desactiva. Hay alias **POST** porque algunos proxys de hosting compartido bloquean PATCH. El cliente intenta PATCH y cae a POST. |
| POST | `/recurring/run` | Fuerza la generación perezosa. |
| DELETE | `/recurring/{id}` | Las transacciones ya generadas quedan (FK SET NULL). |

## Metas de ahorro (protegidas) — modelo "sobre"
| Método | Ruta | Notas |
|---|---|---|
| GET | `/savings-goals` | `{goals, available_balance}` |
| POST | `/savings-goals` | `{name,target_amount,...}` |
| PUT | `/savings-goals/{id}` | |
| POST | `/savings-goals/{id}/contribute` | `{amount}` → `{success, goal, available_balance}`. **Valida saldo disponible**; crea una transacción de gasto en categoría "Ahorro" con `goal_id`. |
| DELETE | `/savings-goals/{id}` | |

## Presupuestos (protegidas)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/budgets` | `?month_year` → `{budgets, month_year}` (incluye `spent` calculado). |
| POST | `/budgets` | `{amount, month_year, category_id?, reset_day?}` (**upsert**). |
| PUT | `/budgets/{id}` | `{amount?, reset_day?}` |
| DELETE | `/budgets/{id}` | |

## Analítica (protegidas)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/analytics/all` | **PREFERIDO.** `?month_year,months,days` → bundle: `summary, monthly, categories, category_comparison, payment_methods, trends, projection, daily`. **1 sola petición** = ahorra conexiones MySQL. El front (`useDataStore.fetchAnalytics`) usa este. **Fase 2 DualBalance**: `summary` ahora incluye `current_period_start: 'YYYY-MM-DD'` (inicio del periodo financiero del usuario) y `net_total_historical` se calcula como `SUM(monthly_closures.surplus)` + transacciones `scope='historical'` (excluye el periodo en curso). Retrocompatible: el resto del shape no cambia. |
| GET | `/analytics/summary` | `?month_year` → `AnalyticsSummary` (income, expense, balance, savings_ratio, net_total_historical, recurring_monthly, previous, saved_this_month...). **Ojo: mantiene la fórmula antigua de `net_total_historical` (deuda menor, sin caller activo en frontend)**. Usar `/analytics/all` para el cálculo nuevo. |
| GET | `/analytics/monthly` | `?months` → `{monthly:[{month_year,income,expense}]}` |
| GET | `/analytics/categories` | `?month_year` → `{categories:[CategoryStat]}` |
| GET | `/analytics/category-comparison` | `?months` → `{rows}` (por mes y categoría; alimenta el carrusel). |
| GET | `/analytics/payment-methods` | `?month_year` → `{payment_methods}` |
| GET | `/analytics/trends` | `?days` → `{trends:[{transaction_date,income,expense}]}` |
| GET | `/analytics/projection` | `Projection` (medias 3 meses + recurrentes). |

> Los endpoints individuales se conservan por compatibilidad, pero **en pantallas usa siempre `/analytics/all`**.

## Middleware lazy (corre en `requireAuth` antes de cada handler protegido)

Estos helpers se ejecutan automáticamente en cada request autenticada. Si fallan, se loguean en `error_log` y la request continúa (no rompen la API).

- `expandRecurringTransactions($conn, $userId)` — Genera las transacciones que tocan de los recurrentes activos del usuario hasta hoy. Idempotente vía `UNIQUE (user_id, recurring_id, transaction_date)`.
- `closeFinancialPeriods($conn, $userId)` (Fase 2 DualBalance) — Cierra los periodos financieros pasados que aún no tengan fila en `monthly_closures`. **Cap 24 cierres por request** (cuota Hostinger). Calcula `surplus = SUM(income) − SUM(expense)` de las transacciones con `scope='month'` dentro de cada periodo. Idempotente vía `UNIQUE (user_id, period_start)`. Comparte cache con `currentPeriodStart()` para no consultar `users.income_payday` dos veces (`$_paydayCache`, `$_periodStartCache`).

## Auth, CORS y seguridad (resumen)
- Middleware de grupo valida el `Bearer` JWT y mete `userId` en el request. Todas las consultas filtran por `user_id`.
- CORS y preflight `OPTIONS` se resuelven a nivel Apache en `backend/.htaccess` (más el rewrite a `index.php`).
- `ini_set('display_errors','0')` evita que warnings PHP contaminen el JSON (rompía el parse en el cliente).
- Verificación de Google vía `tokeninfo` (con fallback cURL) contra `GOOGLE_ALLOWED_CLIENT_IDS`.
- Detalle ampliado y amenazas en el rol **cybersecurity-engineer**.
