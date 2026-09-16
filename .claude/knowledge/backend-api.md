# ChillPocket — API backend (Slim 4, `backend/index.php`)

> Contratos del cliente en `src/api/endpoints.ts` + `src/api/types.ts`; handlers en `backend/index.php` (~3.500 líneas).
> Para localizar un handler sin leer el fichero entero: `grep -n "\->get('/ruta'" backend/index.php`
> (cambia `get` por `post`/`put`/`delete`/`patch`). Helpers: `grep -n "^function " backend/index.php`.
>
> Rutas protegidas: cabecera `Authorization: Bearer <JWT>` (firebase/php-jwt, 7 días). Respuestas JSON.
> Errores: `{ error: true, message }` + status HTTP. Límite de plan: **403** `{ error, code:'plan_limit_reached',
> entity, limit, current, plan }` → el cliente abre el Paywall (`src/api/http.ts`).

## Auth (públicas, con rate limiting)
Rate limiting: **5 intentos fallidos / 15 min** por bucket `ip:<ip>` **y** `email:<email>` (tabla
`auth_attempts`, limpieza oportunista > 7 días). Superado → **429**. Helpers: `checkAuthRateLimit`,
`recordAuthFailure`, `clearAuthAttempts`, `rateLimitedResponse`.

| Método | Ruta | Body | Respuesta | Notas |
|---|---|---|---|---|
| POST | `/auth/register` | `{name,email,password,currency?}` | `{success,token,user}` | bcrypt. |
| POST | `/auth/login` | `{email,password}` | `{success,token,user}` | |
| POST | `/auth/google` | `{id_token}` | `{success,token,user,is_new}` | Verifica con `tokeninfo` contra `GOOGLE_ALLOWED_CLIENT_IDS`. Busca por `google_sub`, si no por email (enlaza), si no crea. `is_new=true` → el front lanza el onboarding. |

`user` siempre lleva el plan inyectado por `attachEntitlement()`: `plan_code, plan_name, limits, features,
is_premium, is_web_allowed`.

## Perfil (protegidas)
| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/me` | — | `{user}` |
| PUT | `/me` | `{name?,currency?,timezone?,theme?,avatar_url?}` | `{success,user}` |
| PUT | `/me/password` | `{current_password,new_password}` | `{success}` |

> ⚠️ **Bug conocido**: `PUT /me` **no** acepta `income_reference`, `income_payday` ni `savings_goal_monthly`, y
> ningún otro endpoint los escribe. El onboarding los guarda solo en local (`usePreferencesStore`). Consecuencia:
> en el servidor el periodo financiero es siempre el mes natural y `savings_goal_stats.goal` es siempre `null`.
> Ver ROADMAP → Calidad / deuda técnica.

## Categorías (protegidas)
| Método | Ruta | Body / Query | Notas |
|---|---|---|---|
| GET | `/categories` | `?type=expense\|income` | Sistema (`user_id NULL`) + propias. |
| POST | `/categories` | `{name,type,color?,icon?}` | Límite de plan `custom_categories`. → `{success,category}` |
| PUT | `/categories/{id}` | `Partial<Category>` | Solo propias. |
| DELETE | `/categories/{id}` | — | Solo propias. |

## Transacciones (protegidas)
| Método | Ruta | Body / Query |
|---|---|---|
| GET | `/transactions` | `?from,to,type,category_id,payment_method,search,amount_min,amount_max,limit,offset` → `{transactions}` (incluye `scope`, `receipt_path`). `from` pasa por `enforceHistoryLimit`. **No** filtra por `scope` (se hace en cliente). |
| POST | `/transactions` | `{amount,description,type,transaction_date,category_id?,payment_method?,notes?,scope?}` → `{success,transaction}`. `scope` = `month` por defecto. |
| PUT | `/transactions/{id}` | `Partial<Transaction>`. Cambiar `scope` de una tx con `goal_id` → **409**. |
| DELETE | `/transactions/{id}` | Borra también el fichero de recibo si existe. |
| GET | `/transactions/export` | `?format=csv` (obligatorio). Gate `features.export` (403 si no). CSV con BOM UTF-8, `fputcsv`, `Cache-Control: no-store`, tope 50.000 filas (`X-ChillPocket-Truncated: true`). Respeta `enforceHistoryLimit`. |

### Recibos (protegidas — solo Plus, feature `receipt_photos`)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/transactions/{id}/receipt` | Multipart, campo `receipt`. Propiedad + bytes mágicos (JPEG/PNG/WebP), ≤ 5 MB, ≤ 4000×4000 px y ≤ 24 MP; re-encode con GD (sin EXIF); nombre aleatorio; reemplaza el anterior. → `{success, receipt_url}` o 400/403/404/413/415/500. |
| DELETE | `/transactions/{id}/receipt` | Propiedad → borra fichero + `receipt_path=NULL`. |
| GET | `/transactions/{id}/receipt` | Propiedad → stream con `nosniff`, `inline`, `Cache-Control: private`. Los ficheros viven en `backend/Images/{user_id}/`, bloqueados por `Images/.htaccess`. |

## Recurrentes (protegidas)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/recurring` | `{recurring, projection}`. |
| POST | `/recurring` | `{name,amount,type,frequency,start_date,end_date?,category_id?}`. Límite de plan `recurring` (free = 3). El id se captura **antes** de expandir (bug de `lastInsertId` corregido). |
| PUT | `/recurring/{id}` | Actualizar. |
| PATCH **o** POST | `/recurring/{id}/toggle` | Alias POST porque algunos proxys bloquean PATCH; el cliente prueba PATCH y cae a POST. |
| POST | `/recurring/run` | Fuerza la generación perezosa. |
| DELETE | `/recurring/{id}` | Las transacciones ya generadas quedan (FK `SET NULL`). |

## Metas de ahorro (protegidas) — modelo "sobre"
| Método | Ruta | Notas |
|---|---|---|
| GET | `/savings-goals` | `{goals, available_balance}` |
| POST | `/savings-goals` | `{name,target_amount,...}`. Límite de plan `goals`. |
| PUT | `/savings-goals/{id}` | |
| POST | `/savings-goals/{id}/contribute` | `{amount, scope?}` → `{success, goal, available_balance}`. Importe negativo = retirada. Valida contra `currentPeriodAvailable()` (scope `month`) o `historicalAvailable()` (scope `historical`). Crea un gasto en la categoría "Ahorro" con `goal_id` y ese `scope`. |
| DELETE | `/savings-goals/{id}` | |

## Presupuestos (protegidas)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/budgets` | `?month_year` → `{budgets, month_year}` con `spent`. Antes ejecuta `autoRenewBudgets()` (clona los `auto_renew=1` del mes anterior). |
| POST | `/budgets` | `{amount, month_year, category_id?, reset_day?, auto_renew?}` (**upsert**). Límite de plan `budgets` por mes. |
| PUT | `/budgets/{id}` | `{amount?, reset_day?, auto_renew?}` |
| DELETE | `/budgets/{id}` | |

## Analítica (protegidas)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/analytics/all` | **La que usa la app.** `?month_year,months,days` → `summary, monthly, categories, category_comparison, payment_methods, trends, projection, daily`. `month_year` pasa por `enforceHistoryLimit`. `summary` incluye `current_period_start`, `net_total_historical` (= `SUM(monthly_closures.surplus)` + tx `scope='historical'`, sin el periodo en curso) y `savings_goal_stats {goal, months_met, months_exceeded, current_streak, best_streak, total_saved, avg_monthly_surplus, pct_months_met, series[]}`. |
| GET | `/analytics/summary` | Fórmula **antigua** de `net_total_historical`. Sin uso en la app. |
| GET | `/analytics/monthly` · `/categories` · `/category-comparison` · `/payment-methods` · `/trends` · `/projection` | Endpoints sueltos por compatibilidad. En pantallas usa siempre `/analytics/all`. |

## Billing (pública, autenticada por secreto)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/billing/webhook/revenuecat` | `Authorization` comparado con `hash_equals` contra `REVENUECAT_WEBHOOK_AUTH` (constante en `Conexion.php` o env; si falta → 503). Idempotente por UNIQUE `(provider, external_id)` en `billing_events`. `INITIAL_PURCHASE/RENEWAL/PRODUCT_CHANGE/UNCANCELLATION` → activa; `EXPIRATION/REFUND/SUBSCRIPTION_PAUSED` → desactiva (nunca `early_adopter`/`manual`); `NON_RENEWING_PURCHASE` + `lifetime_plus` → `source='lifetime'`. |

## Middleware `requireAuth` (antes de cada handler protegido)
Si alguno falla, se registra en `error_log` y la petición continúa.
- `expandRecurringTransactions($conn, $userId)`: genera las transacciones de recurrentes activos hasta hoy.
  Idempotente por UNIQUE `(user_id, recurring_id, transaction_date)`.
- `closeFinancialPeriods($conn, $userId)`: cierra periodos pasados sin fila en `monthly_closures`
  (**máx. 24 por petición**). Comparte caché con `currentPeriodStart()` (`$_paydayCache`, `$_periodStartCache`).

## Mapa de helpers
| Área | Funciones |
|---|---|
| Respuesta / auth | `jsonResponse`, `authenticate`, `fetchUser`, `tokenForUser`, `requireAuth`, `verifyGoogleIdToken`, `httpGetRaw` |
| Validación | `validHexColor`, `validDate`, `validMonthYear`, `validPaymentMethod`, `validScope`, `userCanUseCategory`, `userOwnsCategory` |
| Saldos | `availableBalance`, `currentPeriodAvailable`, `historicalAvailable`, `monthlyEquivalent`, `savingsCategoryId` |
| Planes | `getUserEntitlements`, `attachEntitlement`, `planCount`, `enforcePlanLimit`, `enforceHistoryLimit`, `rcProductToPlanCode` |
| Periodos / recurrentes | `getUserPayday`, `currentPeriodStart`, `nextPeriodStart`, `closeFinancialPeriods`, `expandRecurringTransactions`, `nextRecurringDate`, `addMonthSafely`, `autoRenewBudgets` |

## Seguridad (resumen)
- CORS y preflight `OPTIONS` en `backend/.htaccess` (hoy `*`; pasar a lista de orígenes cuando haya web pública).
- `ini_set('display_errors','0')` para que los warnings no rompan el JSON.
- Revisión detallada: agente `cybersecurity-engineer`.
