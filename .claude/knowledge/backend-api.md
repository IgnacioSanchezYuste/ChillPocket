# ChillPocket — API backend (Slim 4, `backend/index.php`)

> Contratos del cliente en `src/api/endpoints.ts` + `src/api/types.ts`; handlers en `backend/index.php` (~3.900 líneas).
> Correo: `backend/Mailer.php` (cliente SMTP propio, sin dependencias). Configuración en `Conexion.php` del servidor:
> `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME` (constantes de la clase `Conexion`,
> globales o variables de entorno). Sin configurar, los correos no se envían y queda constancia en `error_log`.
> Para localizar un handler sin leer el fichero entero: `grep -n "\->get('/ruta'" backend/index.php`
> (cambia `get` por `post`/`put`/`delete`/`patch`). Helpers: `grep -n "^function " backend/index.php`.
>
> Ficheros PHP: `index.php` (API), `Logger.php` (`appConfig()` + logs), `Mailer.php` (SMTP), `Conexion.php` (solo servidor).
> Configuración con `appConfig('CLAVE')`: variable de entorno → constante `Conexion::CLAVE` → constante global.
> Claves: `JWT_SECRET_CONFIG`, `SMTP_*`, `ADMIN_EMAILS` (emails separados por comas), `LOG_ROTATION` (`week`|`month`),
> `LOG_KEEP` (12), `LOG_LEVEL` (`info`), `LOG_TIMEZONE` (`Europe/Madrid`), `LOG_MAX_MB` (20), `REVENUECAT_WEBHOOK_AUTH`.
>
> Rutas protegidas: cabecera `Authorization: Bearer <JWT>` (firebase/php-jwt, 7 días). Respuestas JSON.
> Errores: `{ error: true, message }` + status HTTP. Límite de plan: **403** `{ error, code:'plan_limit_reached',
> entity, limit, current, plan }` → el cliente abre el Paywall (`src/api/http.ts`).

## Auth (públicas, con rate limiting)
Rate limiting: **5 intentos fallidos / 15 min** por bucket `ip:<ip>` **y** `email:<email>` (tabla
`auth_attempts`, limpieza oportunista > 7 días). Superado → **429**. La ventana se calcula con `NOW()` de la BD
(antes con la hora de PHP: si las zonas horarias no coinciden, el límite podía no bloquear nunca). Emails de más de
120 bytes se guardan como hash. Además hay topes de 24 h por email: `EMAIL_SENDS_PER_DAY` (10, envíos de códigos) y
`EMAIL_CODE_FAILS_PER_DAY` (15, códigos fallidos). Helpers: `checkAuthRateLimit`, `checkEmailDailyLimit`,
`recordAuthFailure`, `clearAuthAttempts`, `rateLimitedResponse`, `authEmailBucket`, `authIpBucket`.
⚠️ `clientIp()` confía en el primer valor de `X-Forwarded-For`, que el cliente puede falsificar: el límite por IP
no es fiable (ver ROADMAP → seguridad).

| Método | Ruta | Body | Respuesta | Notas |
|---|---|---|---|---|
| POST | `/auth/register` | `{name,email,password,currency?}` | `{success,token,user}` | bcrypt. |
| POST | `/auth/login` | `{email,password}` | `{success,token,user}` | |
| POST | `/auth/google` | `{id_token}` | `{success,token,user,is_new}` | Verifica con `tokeninfo` contra `GOOGLE_ALLOWED_CLIENT_IDS`. Busca por `google_sub`, si no por email (enlaza solo si la cuenta no tiene otro `google_sub`; si lo tiene → **409**), si no crea. `is_new=true` → el front lanza el onboarding. Marca el email como verificado. Al enlazar con una cuenta cuyo email **no** estaba verificado, invalida su contraseña (pudo registrarla otra persona); el dueño entra con Google o usa "¿Olvidaste tu contraseña?". |
| POST | `/auth/password/forgot` | `{email}` | `{success,message}` | Respuesta idéntica exista o no la cuenta. Límite 3 solicitudes / 15 min (IP y email). Envía un código de 6 dígitos (15 min). |
| POST | `/auth/password/reset` | `{email,code,new_password}` | `{success,token,user}` | Consume el código (5 intentos, uso único), cambia la contraseña, verifica el email, limpia límites de login y avisa por correo. **Inicia sesión.** Fallos → 400 neutro + límite de intentos. |

El registro crea la fila base del plan (`createBaseEntitlement`) y envía un código de verificación (60 min). Los
correos se envían **después** de responder (`sendMailAfterResponse`), así que no retrasan la respuesta.

`user` siempre lleva el plan inyectado por `attachEntitlement()`: `plan_code, plan_name, limits, features,
is_premium, is_web_allowed`.

## Perfil (protegidas)
| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/me` | — | `{user}` |
| PUT | `/me` | `{name?,currency?,timezone?,theme?,avatar_url?,income_reference?,income_payday?,savings_goal_monthly?}` | `{success,user}` `currency` solo de `SUPPORTED_CURRENCIES` (400 si no, salvo que sea la actual) |
| PUT | `/me/password` | `{current_password,new_password}` | `{success}` + correo de aviso |
| POST | `/me/email/send-verification` | — | `{success, already_verified?}` · límite 3 / 15 min |
| POST | `/me/email/verify` | `{code}` | `{success,user}` · 400 si el código no vale |

- `user` = campos de `USER_PUBLIC_FIELDS` (lista blanca sobre `SELECT *`) + `email_verified` + `is_admin` (bool) + plan.
  Incluye `income_reference` (equivalente mensual), `income_payday` (1-31 o null) y `savings_goal_monthly`.
- `PUT /me`: `income_payday` entero 1-31 o null; importes ≥ 0 y ≤ 99.999.999, redondeados a 2 decimales; null borra.
  Va en una transacción con `SELECT … FOR UPDATE` sobre la fila del usuario. **Si cambia el día de cobro**, se borran
  los `monthly_closures` del usuario y se recalculan con el nuevo periodo (24 por petición; las siguientes completan
  el resto). Error → 500 neutro y nada se guarda.
- Direcciones de correo: `Mailer::isSafeAddress()` (más estricta que `FILTER_VALIDATE_EMAIL`, que admite saltos de
  línea entre comillas) en registro, `/forgot`, `/reset` y en el propio envío.
- La verificación de email **no bloquea** nada en el servidor; la app la exige antes de comprar un plan.

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
| POST | `/transactions` | `{amount,description,type,transaction_date,category_id?,payment_method?,notes?,scope?}` → `{success,transaction}`. `scope` = `month` (con `historical` → **400**: a "Mis ahorros" solo se llega con `POST /savings/transfer`). |
| PUT | `/transactions/{id}` | `Partial<Transaction>`. Cambiar `scope` de una tx con `goal_id` → **409**; pasar a `historical` → 400; editar una transferencia (`transfer > 0`) → **409** (se borra y se rehace). |
| POST | `/savings/transfer` | `{amount, direction: to_savings\|to_spending}` → **201** `{success, transaction}`. Crea una fila `scope='month'`, `transfer=1`, categoría sistema "Ahorro" (gasto hacia ahorro, ingreso desde ahorro), con fecha de hoy. Valida contra `currentPeriodAvailable()` / `historicalAvailable()` (400 con `available`). |
| DELETE | `/transactions/{id}` | Borra también el fichero de recibo si existe. Una cuota de gasto fijo o un ahorro automático borrados no se vuelven a generar. |
| GET | `/transactions/export` | `?format=csv` (obligatorio). Gate `features.export` (403 si no). CSV con BOM UTF-8, `fputcsv`, `Cache-Control: no-store`, tope 50.000 filas (`X-ChillPocket-Truncated: true`). Respeta `enforceHistoryLimit`. Separador `,`, escape RFC 4180 (`escape ''`); las celdas de texto que empiezan por `= + - @` o tabulador llevan un `'` delante (sin fórmulas al abrirlo en Excel/Sheets). |

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
| GET | `/analytics/all` | **La que usa la app.** `?month_year,months,days` → `summary, monthly, categories, category_comparison, payment_methods, trends, projection, daily`. `month_year` pasa por `enforceHistoryLimit`. `summary.total_income/total_expense/balance/savings_ratio` son del **mes natural** consultado (gráficos). El "Saldo del mes" del modelo dual va en `period_income`, `period_expense`, `period_balance` (solo `scope='month'` en `[current_period_start, next_period_start)`, calculados en la misma consulta que `net_total_historical`). `summary` incluye también `net_total_historical` (= `SUM(monthly_closures.surplus)` + tx `scope='historical'`, sin el periodo en curso) y `savings_goal_stats {goal, months_met, months_exceeded, current_streak, best_streak, total_saved, avg_monthly_surplus, pct_months_met, series[]}`. |
| GET | `/analytics/summary` | Fórmula **antigua** de `net_total_historical`. Sin uso en la app. |
| GET | `/analytics/monthly` · `/categories` · `/category-comparison` · `/payment-methods` · `/trends` · `/projection` | Endpoints sueltos por compatibilidad. En pantallas usa siempre `/analytics/all`. |

## Billing (pública, autenticada por secreto)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/billing/webhook/revenuecat` | Escribe `plan_code` y `plan_id`. `Authorization` comparado con `hash_equals` contra `REVENUECAT_WEBHOOK_AUTH` (constante en `Conexion.php` o env; si falta → 503). Idempotente por UNIQUE `(provider, external_id)` en `billing_events`. `INITIAL_PURCHASE/RENEWAL/PRODUCT_CHANGE/UNCANCELLATION` → activa; `EXPIRATION/REFUND/SUBSCRIPTION_PAUSED` → desactiva (nunca `early_adopter`/`manual`); `NON_RENEWING_PURCHASE` + `lifetime_plus` → `source='lifetime'`. |

## Middleware `requireAuth` (antes de cada handler protegido)
Si alguno falla, se registra en `error_log` y la petición continúa.
- `expandRecurringTransactions($conn, $userId)`: genera las transacciones de recurrentes activos hasta hoy.
  Idempotente por UNIQUE `(user_id, recurring_id, transaction_date)`.
- `closeFinancialPeriods($conn, $userId)`: cierra periodos pasados sin fila en `monthly_closures`
  (**máx. 24 por petición**). Comparte caché con `currentPeriodStart()` (`$_paydayCache`, `$_periodStartCache`).
  Si no hay nada pendiente (`pendingPeriodStart` ≥ periodo actual) sale sin bloquear. Si lo hay, bloquea la fila del
  usuario (`FOR UPDATE`), comprueba que el día de cobro no ha cambiado y cierra con `closePendingPeriods`. Así una
  petición simultánea a `PUT /me` no deja cierres solapados.

## Mapa de helpers
| Área | Funciones |
|---|---|
| Respuesta / auth | `jsonResponse`, `authenticate`, `fetchUser`, `tokenForUser`, `requireAuth`, `verifyGoogleIdToken`, `httpGetRaw` |
| Validación | `validHexColor`, `validDate`, `validMonthYear`, `validPaymentMethod`, `validScope`, `userCanUseCategory`, `userOwnsCategory` |
| Saldos | `availableBalance`, `currentPeriodAvailable`, `historicalAvailable`, `monthlyEquivalent`, `savingsCategoryId` |
| Planes | `getUserEntitlements` (resuelve por `plan_id`, respaldo `plan_code`, corrige `plan_code`), `createBaseEntitlement`, `attachEntitlement`, `planCount`, `enforcePlanLimit`, `enforceHistoryLimit`, `rcProductToPlanCode` |
| Administración / uso | `isAdminEmail`, `adminUser`, `userHasMoneyData` |
| Divisas | `exchangeRate`, constantes `SUPPORTED_CURRENCIES`, `EXCHANGE_RATE_TTL_HOURS` |
| Email | `issueEmailCode`, `consumeEmailCode` (reserva atómica del intento antes de comparar), `emailCodeHash`, `markEmailVerified`, `sendMailAfterResponse`, `emailBody`, `emailGreetingName` (solo la primera palabra del nombre, sin enlaces); clase `Mailer` en `Mailer.php` (TLS 1.2+, `isSafeAddress`) |
| Periodos / recurrentes | `getUserPayday`, `currentPeriodStart`, `nextPeriodStart`, `closeFinancialPeriods`, `pendingPeriodStart`, `closePendingPeriods`, `expandRecurringTransactions`, `nextRecurringDate`, `addMonthSafely`, `autoRenewBudgets` |

## Uso de la app (protegida) — monitoreo anónimo
| Método | Ruta | Notas |
|---|---|---|
| POST | `/usage` | `{day, platform, app_version?, events: {nombre: n}, first_today?: [nombres]}`. `day` entre hoy−8 y hoy+1 (el día local del cliente puede ir por detrás); `platform` ios/android/web; nombres `/^[A-Za-z0-9_.:-]{1,64}$/` (se guardan en minúsculas), máx. 60, cuentas enteras 1-500. Un solo INSERT multi-fila con `ON DUPLICATE KEY UPDATE` en `usage_daily`. `first_today` suma 1 usuario único. No guarda `user_id` ni `app_version`. Tope `USAGE_MAX_ROWS_PER_DAY` (1000 filas por día): superado, solo suman los nombres que ya existen ese día (los nuevos se descartan con 200). |

## Administración (protegidas, `is_admin`)
`is_admin` = email en `ADMIN_EMAILS` **y** verificado. Si no, 403.
| Método | Ruta | Notas |
|---|---|---|
| GET | `/admin/usage` | `?days=7|30|90` (otro valor → 30) → `{days, from, to, overview: {users_total, users_new, users_active, verified_pct, plans[]}, totals[], by_platform[], daily[]}` (`daily` = `app_open` por día, días vacíos a 0). |
| POST | `/admin/mail-test` | Envía un correo inmediato al admin (devuelve el error SMTP si falla) y otro por la vía diferida (`sendMailAfterResponse`, la de los códigos). → `{success, to, message?, config}`; `config` dice qué claves `SMTP_*` existen y si hay `openssl` y `litespeed/fastcgi_finish_request`. Límite 5/15 min. |

## Divisas (protegidas)
Monedas: `SUPPORTED_CURRENCIES` = EUR, USD, GBP, MXN. Tipos del BCE vía `https://api.frankfurter.dev/v1/latest`,
cacheados 12 h en `exchange_rates` (compartidos entre usuarios; si la API falla se usa el último guardado y no se
reintenta hasta 15 min después). `exchangeRate()` solo consulta pares de la lista blanca (otra moneda → null → 502) y
solo acepta tipos finitos entre 0,0001 y 100.000 con fecha `YYYY-MM-DD`. cURL con TLS verificado, 5 s de conexión y 10 s en total.
| Método | Ruta | Notas |
|---|---|---|
| GET | `/currency/rate` | `?to=USD` → `{from (moneda del usuario), to, rate, date, source}`. 400 si no soportada, 502 si no hay cambio. |
| POST | `/me/currency` | `{currency, rate}`: convierte **todos** los importes del usuario con el cambio actual (transactions, recurring_expenses, budgets, savings_goals, users.income_reference/savings_goal_monthly), recalcula `monthly_closures` y registra la conversión en `currency_conversions`. Todo en una transacción con la fila del usuario bloqueada. Si `rate` no coincide con el del servidor → 409 `rate_changed` (con el nuevo). Misma moneda → no hace nada. Límite 5 al día por cuenta (`checkEmailDailyLimit`, no por IP) → 429. Importe que no cabe → 500 "demasiado grande" y nada cambia. Multiplica en decimal exacto (`CAST(:k AS DECIMAL(18,8))`, el cambio siempre en notación decimal) y redondea a 2 decimales; el objetivo de una meta nunca baja de 0,01 (CHECK). → `{success, user, rate, converted}`. |
- `PUT /me` con una `currency` distinta y datos guardados → 409 `currency_conversion_required` (solo cambiaría el símbolo). Sin datos (tutorial de un usuario nuevo) sí la cambia.

## Logs (`backend/logs/`)
- `AppLog::init()` al arrancar: fichero `api-AAAA-Www.log` (semanal) o `api-AAAA-MM.log` (mensual), protegido con `.htaccess`;
  se conservan `LOG_KEEP` ficheros. `error_log()` y los avisos de PHP van al mismo fichero.
  Tope `LOG_MAX_MB` (20): pasado, el fichero solo admite avisos y errores; al doble no se escribe nada (los avisos de
  PHP van entonces al log del servidor). Así un bucle de peticiones no llena el disco.
- Formato: `2026-09-16 19:33:28 INFO    http     GET /transactions/{id} 200 34ms u=12 ip=83.45.12.0`.
  Canales: `http` (cada petición, sin query ni ids), `auth`, `mail`, `currency`, `db`, `config`.
- Nunca: contraseñas, tokens, códigos ni cuerpos. Emails enmascarados (`i***@dominio`), IP sin el último bloque.
  `maskEmail` devuelve `***` si el texto no es un email válido (alguien que escribe la contraseña en el campo del
  email); además, `clean()` enmascara cualquier email que aparezca dentro de un mensaje (respuestas SMTP, errores de BD, rutas).
- Si `backend/logs` no se puede escribir, los avisos y errores van al log del servidor (`error_log`, prefijo `[chillpocket]`).
- Errores: un único `addErrorMiddleware` con manejador propio → JSON neutro con cabeceras CORS (404 "Ruta no encontrada",
  405, 500) y la excepción (clase, mensaje, fichero:línea) en el log. Sin base de datos → 503 JSON.
- Query string: un middleware descarta los parámetros que no son texto (`?from[]=x`); ningún endpoint usa listas.
- `Mailer`: si falla la conexión o el TLS, el mensaje incluye el aviso de PHP (p. ej. certificado que no coincide).
- Para diagnosticar el correo en producción: panel de uso → "Enviar correo de prueba" y líneas `mail` del log.

## Seguridad (resumen)
- CORS y preflight `OPTIONS` en `backend/.htaccess` (hoy `*`; pasar a lista de orígenes cuando haya web pública).
- `ini_set('display_errors','0')` para que los warnings no rompan el JSON.
- Revisión detallada: agente `cybersecurity-engineer`.
