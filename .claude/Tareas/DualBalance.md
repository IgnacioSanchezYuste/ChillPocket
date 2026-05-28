# Modelo dual "Saldo del mes / Mis ahorros" + Onboarding personalizado — Plan de implementación

> **Para el agente que continúe esta tarea en una sesión nueva**: este documento
> es tu guion. Las decisiones de producto YA están cerradas tras consulta del
> equipo (frontend-engineer + qa-tester + producto). No replantees el diseño,
> no preguntes al usuario lo que ya está decidido. Implementa lo que está aquí
> en el orden que está aquí.

---

## 0.0. HANDOFF — lee esto ANTES de hacer nada (estado a 2026-05-27)

> Esta sección la añade el project-master al final de cada sesión para que el
> siguiente agente sepa exactamente dónde se quedó todo. Las fases 1 y 2 ya
> tienen código en el repo; **el deploy backend puede o no haberse hecho**
> cuando empieces — confírmalo con el usuario al arrancar.

### Estado del código (en el repo, NO necesariamente en producción)

| Fase | Estado código | Notas |
|---|---|---|
| Fase 1 — Onboarding personalizado + demo cleanup | ✅ implementada | Solo JS; sin deploy backend; Metro la sirve al dev client. Detalles en §5. |
| Patch extra — límite `recurring` plan free 1→3 | ✅ implementado | SQL en `backend/update.sql` §7. Sin esto el tuto se atascaba en el step de ingreso. |
| Patch extra — wheel picker para "día de cobro" | ✅ implementado | UI sustituye los 28+ botones del onboarding por un selector vertical estilo iOS. Solo JS. |
| Fase 2 — Schema + motor de cierre | ✅ implementada | Necesita deploy: SQL §8 + FTP de `backend/index.php`. Detalles en §5. |
| Fase 3 — Dashboard modo dual | ✅ implementada | Solo frontend, sin SQL ni FTP. Confirmado tras §0.0: Fase 2 ya desplegada el 2026-05-27. Detalles en §5. |
| Fase 4 — Scope en transacciones y metas | ✅ implementada | Requiere **FTP de `backend/index.php`** (no SQL nuevo; la columna `scope` ya existía de Fase 2). Detalles en §5. |
| Fase 5 — Analítica por mes financiero | ⏸️ deliberadamente aplazada | El propio doc (§Fase 5) dice no tocar hasta que el modelo dual lleve semanas en producción con feedback real. |

### Estado de deploy real (VERIFICA al arrancar — el usuario puede no haber desplegado)

| Componente | Cómo confirmar antes de tocar nada |
|---|---|
| Dev build Android con `react-native-purchases` autolinkeado | Pregunta al usuario. (Construido por EAS el 2026-05-25; URL: https://expo.dev/accounts/nachonsennn/projects/Finanzas/builds/ab36a2a7-b147-47a5-8a2f-28b9a37408ef) |
| SQL §7 (`recurring=3`) ejecutado en phpMyAdmin | Pregunta. Comprueba consultando `SELECT JSON_EXTRACT(limits_json, '$.recurring') FROM plans WHERE code='free'` si te dan acceso |
| SQL §8 (`scope`, `monthly_closures`, columnas `users.*`) ejecutado | Pregunta. Comprueba con `SHOW TABLES LIKE 'monthly_closures'` |
| `backend/index.php` con Fase 2 (FTP) | Pregunta. Si dudas, golpea `GET /analytics/all` con un JWT y mira si `summary.current_period_start` aparece en el JSON |
| JS local sirviendo via Metro | `npm install` + `npx expo start -c`. Confirma que `npx tsc --noEmit` da exit 0 |

> **Si Fase 2 NO está desplegada**, NO empieces Fase 3. Pide al usuario que ejecute primero `update.sql` §7 + §8 en phpMyAdmin **y** suba `index.php` por FTP (en ese orden). Sin eso, `current_period_start` y `scope` no existen en la respuesta y Fase 3 fallará silenciosamente.

### Orden de deploy correcto (si el usuario aún no lo ha hecho)

1. phpMyAdmin → ejecutar §7 y §8 de `backend/update.sql` (son idempotentes; reejecutar no rompe).
2. FTP → subir `backend/index.php` (sobreescribir).
3. `npx expo start -c` (Metro con cache limpia).
4. Validación: en el dev client, ver que la Analítica sigue funcionando + verificar `summary.current_period_start` en la respuesta.

### Gotchas que NO debes perder de vista

- **Fase 3 ya pinta "Mis ahorros"**: el `BalanceHero` lee `summary.net_total_historical` y `projection.avg_monthly_expense`. Si Fase 2 NO está desplegada, ambos campos faltarán y la card mostrará 0 € y sin runway — fallback OK pero feo.
- **Filtro de transacciones por modo en cliente** (Fase 3): si añades transacciones con `scope='historical'` (Fase 4) y el usuario está en modo `historical` viendo Movimientos, ten en cuenta que el server solo filtra por `to = period_start - 1`. La inclusión de `scope='historical'` con fecha >= period_start se hace cliente-side; si la lista paginada no las trae, no aparecerán. **Deuda pendiente**: añadir `scope` como query-param al backend `/transactions` (no se hizo en Fase 4 para minimizar el área de cambio).
- **Saldo del mes calculado en cliente** (Fase 4): el `GoalSheet` calcula `monthAvailable = availableBalance − net_total_historical`. Es exacto en estado coherente, pero si el endpoint `/savings-goals` se llama antes de que `closeFinancialPeriods` haya corrido (caso raro), puede haber discrepancia de un cierre. El backend valida de verdad con `currentPeriodAvailable()`/`historicalAvailable()`, así que el peor caso es que la UI muestre un máximo distinto del que aplica el server (y el server gane).
- **InsightBanner — forecast detrás del paywall**: el cálculo del cierre proyectado del periodo solo se muestra si `useBilling().hasFeature('advanced_analytics')`. El resto de stats personalizadas (presupuesto diario, días al cobro, % objetivo) están abiertas a todos los planes — son la propuesta de valor del modelo dual.
- `net_total_historical` cambió de fórmula en Fase 2 (ya no incluye el mes en curso). Si el usuario reporta "ha bajado un poco", es **esperado** — coherente con que la card "Mis ahorros" de Fase 3 mostrará lo cerrado, no lo en curso.
- `monthly_closures` se rellena retroactivamente con cap **24 cierres/request**. Histórico > 24 meses → varias requests para terminar de poblar. Es intencional.
- **Surplus negativo BAJA `monthly_closures.surplus`** (sin floor a 0). Respétalo en Fase 3 al pintar "Mis ahorros" — puede ser negativo, hay que comunicarlo bien (decisión cerrada §2).
- Cache compartida en backend: `$_paydayCache` y `$_periodStartCache` evitan queries duplicadas a `users`. Si añades nuevas llamadas a `currentPeriodStart()`, no te preocupes — es free después de la primera.
- `/analytics/summary` mantiene la fórmula antigua de `net_total_historical` (deuda menor, sin caller activo). NO la toques en Fase 3 a menos que descubras que la necesitas.
- El frontend pre-Fase-3 sigue funcionando con Fase 2 backend ya desplegado — el contrato es 100% retrocompatible. Es decir: si el usuario sigue usando una build vieja por un tiempo, no rompe nada.
- `react-native-purchases` ya está en `package.json` y autolinkeado en el dev build de 2026-05-25. NO reinstalar a menos que se reconstruya el binario.

---

## 0. Antes de empezar (OBLIGATORIO leer)

1. **`.claude/knowledge/app-features.md`** §10 (Modelo financiero dual) y §11 (Onboarding rediseñado) — la especificación funcional completa, con todas las reglas de negocio.
2. **`.claude/knowledge/data-model.md`** — esquema actual.
3. **`.claude/knowledge/backend-api.md`** — endpoints actuales.
4. **`.claude/knowledge/conventions.md`** — reglas duras (tsc limpio, cuota Hostinger, PDO parametrizado, etc.).
5. **`.claude/Tareas/ROADMAP.md`** §7 — resumen del item en el roadmap.
6. **`.claude/Tareas/Billing.md`** — para saber qué features quedarán detrás del paywall Plus tras el cambio.

> Memoria del proyecto: `dual-balance-model.md` tiene el resumen rápido.

## 1. Estado actual (lo que vas a encontrar)

> **⚠️ Esta sección describe el código ANTES de iniciar la implementación (sesión inicial 2026-05-26).**
> Para el estado actual tras Fases 1+2, ver §0.0 (HANDOFF) y §5 (Estado actual de las fases).
> Se mantiene como registro histórico del punto de partida.

- Modelo único de saldo: `net_total_historical = SUM(income) − SUM(expense)` sobre todo el historial. Frontend lo lee de `summary.net_total_historical`.
- **Onboarding** (`src/onboarding/OnboardingHost.tsx`): la fase `personalize` tiene 5 sub-pasos (0..4): name, currency, goal, incomeFrequency, theme. NO pide salario ni objetivo de ahorro. Tras personalize entra en spotlight: `createExpense` → `createRecurringExpense` → `createIncome` → `tour` → `success`. Los formularios precargados crean transacciones/recurrentes **reales** en BD que **no se borran nunca** (bug actual).
- **`useOnboardingStore`** (`src/store/useOnboardingStore.ts`): tiene `draft: OnboardingDraft` con `name, currency, goal, incomeFrequency, theme`. Persiste `done` en AsyncStorage; **no persiste IDs demo todavía**.
- **`usePreferencesStore`** (`src/store/usePreferencesStore.ts`): persiste `goal`, `incomeFrequency` (entre otros).
- **`useDataStore`**: tiene `transactions, recurring, goals, budgets, categories, summary, etc.` con throttle 30 s.
- **`BalanceHero`**: muestra `balance, income, expense, savings_ratio, saved_this_month`. Sin gestos, sin modo dual.
- **Backend `index.php`**: `fetchUser`, `attachEntitlement`, `expandRecurringTransactions`, helpers de billing. La función `closeFinancialPeriods` NO existe todavía.

## 2. Decisiones cerradas (NO preguntar al usuario otra vez)

| Punto | Decisión |
|---|---|
| Mes con surplus negativo | **Baja "Mis ahorros"**. La UI lo comunica claro. |
| Mes en Analítica | **Mes natural** en v1 del cambio (no se toca `/analytics/all` hasta Fase 5). |
| Demo data del tuto | **Borrado por IDs persistidos en AsyncStorage** (sin columna `is_demo`, sin endpoint nuevo). |
| Replay del tuto | **Omite createExpense/createRecurringExpense/createIncome** si hay datos reales (`transactions.length > 0 \|\| recurring.length > 0`). |
| Naming en UI | "Saldo del mes" (modo `month`) y **"Mis ahorros"** (modo `historical`). |
| Frecuencia semanal | **Solo se usa para calcular el equivalente mensual** (`monto × 4.345`). El reset siempre es mensual. |
| Día 31 en mes corto | `MIN(payday, last_day_of_month)`. |
| Scope de contribución a meta | **Inmutable** una vez guardada. Mover = retirar + aportar. |
| Migración del histórico | **Cierres retroactivos calculados automáticamente** al primer request post-deploy del backend. |
| Cap de cierres por request | **24 máximo** (protege cuota Hostinger). |

## 3. Reglas duras que aplican a TODAS las fases

- **`npx tsc --noEmit` limpio** después de cada fase.
- **No multipliques peticiones HTTP** (cuota Hostinger 500 conex/h). Usa el store y su throttle de 30 s.
- **SQL idempotente** siempre (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, comprobaciones en `information_schema` cuando haga falta).
- **No rompas `/analytics/all`** hasta Fase 5. Cualquier cambio en backend (Fase 2) debe ser additivo y retrocompatible (campos nuevos opcionales, default coherente).
- **PDO parametrizado siempre**. Filtrar por `user_id` en todas las queries.
- **Errores neutros al cliente**, detalles a `error_log`.
- **No commits ni push** salvo que el usuario lo pida.
- **Marca cada fase como "completada" en este documento** (edita aquí) cuando la termines, para que la siguiente sesión sepa por dónde va.

---

## Fase 1 — Onboarding personalizado + demo cleanup (solo frontend, sin SQL)

**Riesgo: bajo.** No toca backend, no requiere despliegue de SQL, no necesita rebuild EAS si no añades plugins. **Ya arregla un bug real** (demo data que se queda permanentemente). Es lo que se debería tirar primero.

### 1.1 Persistir IDs demo en `useOnboardingStore`

**Archivo**: `src/store/useOnboardingStore.ts`.

- Añadir al state: `demoTransactionIds: number[]`, `demoRecurringIds: number[]`.
- Añadir acciones: `addDemoTransactionId(id)`, `addDemoRecurringId(id)`, `clearDemoIds()`.
- **Persistir esos arrays en AsyncStorage** (clave `@chillpocket:onboarding_demo_ids`) tolerante a basura (patrón `safeParseUser`). Cargar en el `hydrate()` o equivalente.
- Razón: si la app crashea entre crear y borrar, los IDs sobreviven y se borran en el siguiente arranque.

### 1.2 Borrado al finalizar el tuto

**Archivo**: `src/store/useOnboardingStore.ts` (acciones `finish()` y `skipAll()`).

- Antes de marcar `done`, iterar `demoTransactionIds` y llamar `transactionsApi.delete(id)`. Idem `demoRecurringIds` con `recurringApi.delete(id)`.
- Manejar errores individuales sin romper el flujo (un 404 = ya borrada por el usuario, ignorar).
- Tras borrar todo, **una sola** llamada a `useDataStore.getState().refreshAll(true)`.
- Borrar los IDs persistidos en AsyncStorage.

### 1.3 Capturar IDs al crear durante el tuto

**Archivos**: `src/onboarding/OnboardingHost.tsx` (los `onSaved` de los sheets durante el tuto).

- Hoy `OnboardingHost` instancia `TransactionSheet` y `RecurringSheet` con `onSaved` que avanza la fase. Cambia el handler para que ANTES de avanzar guarde el ID de la transacción/recurrente recién creada en el onboarding store.
- Esto requiere que los sheets devuelvan el ID. Revisa la respuesta de `transactionsApi.create` (devuelve la transacción) y de `recurringApi.create` (devuelve `id`). Si los sheets no exponen el ID al `onSaved`, ajusta el contrato (cambio mínimo, pasa el ID o el objeto creado).
- Solo capturar IDs **si el onboarding está activo** (fases `createExpense`, `createRecurringExpense`, `createIncome`). Fuera del tuto, no.

### 1.4 Limpieza oportunista al arrancar

**Archivo**: `App.tsx` o `useAuthStore.bootstrap`.

- Si al arrancar la app hay IDs demo persistidos del onboarding store y el onboarding NO está activo (es decir, una sesión anterior crasheó), lanzar la limpieza silenciosa: borrar esas transacciones/recurrentes y limpiar los IDs.
- Si falla la limpieza (sin red), reintentar en el próximo arranque (los IDs siguen ahí hasta que se borren con éxito).

### 1.5 Onboarding personalizado — paso "frecuencia + monto + día"

**Archivo**: `src/onboarding/OnboardingHost.tsx`, sub-paso `personalize 3` (frecuencia de ingresos).

- Hoy es solo `<SegmentedControl>` con mensual/semanal/variable.
- Tras seleccionar la frecuencia, mostrar **inline** dentro del mismo paso:
  - Si **mensual**: input numérico *"Tu salario neto mensual"* + selector *"Día del mes que cobras"* (1-28 + opción "fin de mes" → guardamos 31, normalizamos a `LAST_DAY` cuando el mes no tenga ese día).
  - Si **semanal**: input numérico *"Tu salario semanal"* + selector *"Día de la semana que cobras"* (L/M/X/J/V/S/D).
  - Si **variable**: nada más; usaremos día 1 del mes natural.
- Validación: monto > 0; si la frecuencia ≠ variable, monto obligatorio.
- Guardar en `draft`: `incomeAmount: number | null`, `incomePayday: number | null` (1-31 para mensual; 0-6 para semanal con domingo=0; null para variable).

### 1.6 Onboarding personalizado — paso nuevo "objetivo de ahorro mensual"

**Archivo**: `src/onboarding/OnboardingHost.tsx`.

- Añadir un nuevo sub-paso `personalize 4` (entre frecuencia y tema; renumerar tema a 5). Actualizar `PERSONALIZE_TOTAL` de 5 → 6.
- Título: *"¿Cuánto quieres ahorrar al mes?"*
- Subtítulo motivador (consultable con `marketing-expert` si quieres iterar copy).
- Input numérico + **chips de sugerencia** rápidos cuando hay `incomeAmount` declarado: 10% / 20% / 30% / Custom. Si la frecuencia es variable, solo input libre sin chips.
- Validación: `savingsGoalMonthly >= 0`; si hay `incomeAmount`, también `savingsGoalMonthly < incomeAmount` (mostrar error: "el objetivo debe ser menor que el ingreso").

### 1.7 Persistir los nuevos campos en preferencias

**Archivo**: `src/store/usePreferencesStore.ts`.

- Añadir `incomeAmount: number | null`, `incomePayday: number | null`, `savingsGoalMonthly: number | null` al estado y al `hydrate`/persist.
- Estos valores se aplican en `OnboardingHost.applyPersonalization()`.

### 1.8 Pre-llenar `createIncome` con los datos del usuario

**Archivo**: `src/onboarding/OnboardingHost.tsx`, la renderización del `RecurringSheet` para `openSheet==='recIncome'`.

- Hoy el prefill es `{ name: 'Nómina', amount: '2100', type: 'income', frequency: 'monthly', categoryName: 'Salario' }`.
- Cambiar para que use los valores del draft: `amount = String(draft.incomeAmount ?? 2100)`, `frequency = draft.incomeFrequency === 'weekly' ? 'weekly' : 'monthly'`, y si `draft.incomePayday`, calcular `start_date` para que caiga en ese día este mes.
- Si el usuario eligió "variable", **omitir el paso `createIncome`** (saltar directo al tour).

### 1.9 Replay del tuto: omitir creación si hay datos reales

**Archivo**: `src/store/useOnboardingStore.ts`, acción `restart()`.

- Al hacer `restart()`, leer `useDataStore.getState().transactions` y `recurring`. Si alguna lista no está vacía, fijar un flag `skipCreationPhases: true` en el store.
- En `OnboardingHost.tsx`, las fases `createExpense`, `createRecurringExpense`, `createIncome` consultan el flag y, si está `true`, hacen `setPhase('tour')` directamente sin abrir sheets.
- Razón: evita duplicar Netflix indefinidamente y no toca datos reales.

### 1.10 Mensaje de éxito personalizado

**Archivo**: `src/onboarding/OnboardingHost.tsx`, fase `success`.

- Si `draft.incomeAmount && draft.savingsGoalMonthly`, mostrar: *"Hola {nombre}, hoy puedes gastar X € y seguir ahorrando {savingsGoalMonthly} € este mes 🎯"*.
- Cálculo de X (presupuesto diario): `(incomeAmount − savingsGoalMonthly) / días_restantes_del_mes`. Si frecuencia variable, omitir la frase.

### 1.11 Criterios de aceptación de la Fase 1

- [ ] `npx tsc --noEmit` limpio.
- [ ] Crear cuenta nueva → al completar el onboarding, las 3 transacciones demo (Cena, Netflix, Nómina) se borran al llegar a `success`. Si forzaste el cierre de la app a mitad, en el siguiente arranque se borran solas.
- [ ] El sub-paso de frecuencia muestra el input adaptativo correcto y bloquea avanzar si no es válido.
- [ ] El sub-paso nuevo "objetivo de ahorro" funciona con chips si hay ingreso o solo input libre si es variable.
- [ ] `createIncome` se pre-rellena con los datos del usuario.
- [ ] Replay del tuto (Ajustes → "Ver tutorial de nuevo") con datos reales **salta** los pasos de creación y va directo al tour.
- [ ] Los nuevos campos están en `usePreferencesStore` y sobreviven al cerrar y abrir la app.
- [ ] El mensaje de éxito personalizado se muestra con el cálculo correcto.

### 1.12 Despliegue de la Fase 1

- Solo frontend → `eas build -p android --profile preview` (o lo que use el usuario para test). No requiere `index.php` ni SQL.
- **Marca esta fase como ✅ COMPLETADA aquí cuando termines** y comunica al usuario qué cambió.

---

## Fase 2 — Schema + motor de cierre (backend puro, retrocompatible)

**Riesgo: medio.** Toca SQL y `index.php`. **No** cambia el contrato de `/analytics/all` (solo añade campos opcionales). El frontend antiguo sigue funcionando.

### 2.1 Migración SQL idempotente

**Archivo**: `backend/update.sql` (añadir nueva sección al final, antes del `COMMIT`).

- `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS scope ENUM('month','historical') NOT NULL DEFAULT 'month'`.
- `CREATE TABLE IF NOT EXISTS monthly_closures` con columnas: `id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, period_start DATE NOT NULL, period_end DATE NOT NULL, surplus DECIMAL(10,2) NOT NULL DEFAULT 0, closed_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uniq_user_period (user_id, period_start), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`.
- `ALTER TABLE users` añadir columnas: `income_reference DECIMAL(10,2) NULL`, `income_payday TINYINT NULL`, `savings_goal_monthly DECIMAL(10,2) NULL` (todas idempotentes con `IF NOT EXISTS`).

### 2.2 Función `closeFinancialPeriods($conn, $userId)`

**Archivo**: `backend/index.php`, junto a `expandRecurringTransactions`.

- Calcular el `current_period_start` del usuario: si tiene `income_payday`, el periodo va de `payday` del mes pasado al `payday`-1 de este mes (normalizando con `LAST_DAY`). Si no tiene, `current_period_start = primer día del mes actual`.
- Buscar el último cierre en `monthly_closures` para ese usuario.
- Iterar **máximo 24 veces** (cap de seguridad) cerrando periodos consecutivos:
  - Para cada periodo no cerrado y ya pasado, calcular `surplus = SUM(income) − SUM(expense)` de transacciones con `scope='month'` en ese rango de fechas.
  - `INSERT IGNORE INTO monthly_closures (user_id, period_start, period_end, surplus)` (UNIQUE garantiza idempotencia).
- Llamarla en el middleware `requireAuth` justo después de `expandRecurringTransactions` (o en `/analytics/all` y `/savings-goals`; ver cuota).

### 2.3 Helper `currentPeriodStart($conn, $userId)`

- Centraliza el cálculo del inicio del periodo actual.
- Lo usan `closeFinancialPeriods`, el filtro de transacciones del modo dual, y los endpoints que devuelven el inicio del periodo.

### 2.4 Exponer `current_period_start` en `/analytics/all`

**Archivo**: `backend/index.php`, handler `/analytics/all`.

- Añadir al objeto `summary` el campo `current_period_start: 'YYYY-MM-DD'`.
- **No** cambiar el resto del shape de `summary`. Es additivo.

### 2.5 Recalcular `net_total_historical`

- Cambiar el cálculo de `summary.net_total_historical` a: `SUM(monthly_closures.surplus) + SUM(income WHERE scope='historical') − SUM(expense WHERE scope='historical')` del usuario.
- **NO incluye el periodo en curso** (sería incoherente, el mes aún no ha cerrado).
- Verificar que para los usuarios actuales, tras la migración retroactiva, el valor resulta coherente con lo que tenían antes (es esperable que cambie ligeramente por el "mes actual" que ya no se cuenta; comunicar este punto al usuario antes del deploy).

### 2.6 Tipos en frontend

**Archivo**: `src/api/types.ts`.

- Añadir `scope?: 'month' | 'historical'` al tipo `Transaction`.
- Añadir `current_period_start?: string` a `AnalyticsSummary`.
- Mantener opcionales para no romper la compilación de pantallas que aún no los usan.

### 2.7 Criterios de aceptación de la Fase 2

- [ ] SQL ejecutado en phpMyAdmin sin errores (idempotente: re-ejecutable).
- [ ] `index.php` desplegado.
- [ ] Hacer login con un usuario existente y comprobar que se crean filas en `monthly_closures` para sus meses pasados.
- [ ] `current_period_start` aparece en la respuesta de `/analytics/all`.
- [ ] `net_total_historical` tiene un valor razonable y consistente con lo que el usuario tenía antes.
- [ ] El frontend antiguo (sin Fase 3) sigue funcionando exactamente igual: el Dashboard muestra el balance del mes natural, `net_total_historical` se ve correcto.

### 2.8 Despliegue de la Fase 2

- FTP `index.php` + ejecutar `update.sql` en phpMyAdmin.
- No requiere rebuild del frontend porque los cambios son additivos.

---

## Fase 3 — Dashboard modo dual (frontend del saldo)

**Riesgo: medio.** Toca `BalanceHero`, `useDataStore`, `DashboardScreen`. Requiere Fase 2 desplegada.

### 3.1 Estado del modo en `useDataStore`

**Archivo**: `src/store/useDataStore.ts`.

- Añadir `balanceMode: 'month' | 'historical'` (default `'month'`) y `setBalanceMode(mode)`.
- **No persistir** en AsyncStorage; es efímero por sesión.

### 3.2 Swipe + control alternativo en `BalanceHero`

**Archivo**: `src/components/BalanceHero.tsx`.

- Detectar gesto horizontal con `PanResponder` o con `react-native-gesture-handler` (verifica si ya está instalado en `package.json`).
- Renderizar **dos dots/indicadores** clicables debajo de la card como alternativa accesible y para web (gestos táctiles no funcionan igual en `react-native-web`).
- Animación de transición horizontal con `Animated.Value`.
- Modo `month`: muestra "Saldo del mes" + ingresos/gastos/libre como hoy.
- Modo `historical`: muestra "Mis ahorros" + cifra agregada + frase ej. *"Llevas N meses ahorrando"* o el nº de meses con surplus positivo.

### 3.3 Filtro implícito en transacciones

**Archivos**: `src/screens/main/DashboardScreen.tsx` (sección "Recientes") y `src/screens/main/TransactionsScreen.tsx`.

- Si `balanceMode === 'month'`: filtrar transacciones con `transaction_date >= current_period_start && scope !== 'historical'`.
- Si `balanceMode === 'historical'`: filtrar transacciones con `transaction_date < current_period_start || scope === 'historical'`.
- En `TransactionsScreen`, el filtro implícito no debe estorbar a los filtros avanzados explícitos (rango de fechas manual): si el usuario fija un rango en el filtro avanzado, ese rango prevalece.

### 3.4 Copy contextual

- Card en modo `historical` con frases motivadoras según el estado: *"X € que has ido guardando"*, *"Esto cubre Y meses de gastos"* (si se calcula el runway).
- Mensaje al hacer swipe la primera vez en una sesión: tooltip o snackbar explicativo (*"Desliza para ver tus ahorros acumulados"*) **solo la primera vez** (persiste un flag en preferencias `seenBalanceSwipeTooltip`).

### 3.5 Criterios de aceptación de la Fase 3

- [ ] `npx tsc --noEmit` limpio.
- [ ] Swipe horizontal alterna entre las dos vistas con animación suave.
- [ ] Los dots/flechas funcionan en web y son navegables con tab/lector de pantalla.
- [ ] La lista de transacciones del Dashboard se filtra correctamente al cambiar de modo.
- [ ] `TransactionsScreen` respeta el modo activo pero los filtros avanzados explícitos lo sobrescriben.
- [ ] El número del modo `historical` cuadra con `summary.net_total_historical` (que ya viene recalculado de Fase 2).

---

## Fase 4 — Scope en transacciones y metas

**Riesgo: medio.** Requiere Fase 2.

### 4.1 Selector de scope en `TransactionSheet`

**Archivo**: `src/screens/modals/TransactionSheet.tsx`.

- Añadir, al final del formulario o en una sección "Avanzado", un selector "**Mover a**: [Saldo del mes / Mis ahorros]" con default `month`.
- Enviar `scope` en `POST /transactions` y aceptarlo en `PUT /transactions/{id}` (cambio menor en backend; ya está la columna).

### 4.2 Selector "Aportar desde" en `GoalSheet`

**Archivo**: `src/screens/modals/GoalSheet.tsx`.

- En el flujo de contribuir a una meta, añadir un selector "**Aportar desde**: [Este mes / Mis ahorros]" con default `month`.
- Enviar `scope` a `POST /savings-goals/{id}/contribute`.
- **Backend**: en el endpoint de contribute, validar el saldo según el scope:
  - `month`: contra el saldo disponible del periodo actual.
  - `historical`: contra `net_total_historical`.
- La transacción que crea la contribución hereda el `scope` elegido.

### 4.3 Stats personalizadas en el Insight banner

**Archivo**: `src/components/InsightBanner.tsx`.

- Si el usuario tiene `incomeAmount` y `savingsGoalMonthly`, generar mensajes nuevos:
  - *"Hoy puedes gastar X € sin pasarte de tu objetivo"* (presupuesto diario).
  - *"Te quedan N días hasta el próximo cobro"*.
  - *"Llevas Y € ahorrados este mes (Z% del objetivo)"*.
  - *"Si sigues así, cerrarás el mes con +W €"* (forecast).
- Priorizar según relevancia (consultar `marketing-expert` si quieres iterar el copy).
- Las stats avanzadas (forecast, runway) **gate detrás de `hasFeature('advanced_analytics')`** para empujar al plan Plus.

### 4.4 Criterios de aceptación de la Fase 4

- [ ] `npx tsc --noEmit` limpio.
- [ ] Crear una transacción con scope `historical` → aparece en "Mis ahorros", no en "Saldo del mes".
- [ ] Aportar a una meta desde `historical` → no toca el balance del mes; descuenta de `net_total_historical`.
- [ ] El Insight banner muestra el presupuesto diario correcto para usuarios con datos.

---

## Fase 5 — Analítica por mes financiero (OPCIONAL, aplazable)

**Riesgo: alto.** Cambia el contrato de `/analytics/all` (acepta `period_start`/`period_end` en vez de o además de `month_year`). Toca todas las queries de analítica. Toca todas las pantallas que pasan `month_year`.

**Recomendación**: no hacer esta fase hasta que el modelo dual lleve semanas funcionando en producción y haya feedback real de los usuarios. Documenta esta decisión cuando termines las Fases 1-4.

---

## 4. Reglas duras (recordatorio)

- `npx tsc --noEmit` limpio antes de marcar una fase como completada.
- SQL idempotente.
- No multipliques peticiones (cuota Hostinger).
- PDO parametrizado + filtro por `user_id` siempre.
- No tocar `.env` ni `Conexion.php`.
- Cualquier cambio que afecte a `/analytics/all` requiere revisar que el frontend antiguo no se rompe.
- **Si algo no encaja con lo escrito aquí, PARA y pregunta al usuario** antes de improvisar (es lo que ya hizo el equipo en la primera consulta).

## 5. Estado actual de las fases

- [x] Fase 1 — Onboarding personalizado + demo cleanup
  _Completada 2026-05-26. Notas:_
  - _Captura de IDs requirió cambiar el contrato de `onSaved` en `TransactionSheet` (pasa `Transaction | null`) y `RecurringSheet` (pasa `number | null`). Todos los callsites existentes actualizados con lambdas._
  - _Se añadió `forcedStartDate` a `RecurringSheet` para el pre-relleno de fecha de cobro en el step `createIncome`._
  - _`PERSONALIZE_TOTAL` fue 5, ahora es 6 (paso nuevo 4 = objetivo de ahorro; tema pasa a paso 5)._
  - _La limpieza oportunista se hace en `RootNavigator` (efecto sobre `bootstrapped + token`), hydratando los IDs demo antes de evaluar si hay huérfanos._
  - _`palette.error` no existe; se usa `palette.danger` para el mensaje de validación del objetivo de ahorro._
  - _`npx tsc --noEmit` limpio (exit 0)._
- [x] Fase 2 — Schema + motor de cierre
  _Completada 2026-05-27. Notas:_
  - _Migración SQL §8 añadida al final de `backend/update.sql`: `transactions.scope`, tabla `monthly_closures`, columnas `users.income_reference/income_payday/savings_goal_monthly`. Idempotente con guards `information_schema`._
  - _Backend: helpers `getUserPayday()` (con caché), `currentPeriodStart()` (con caché), `nextPeriodStart()`, `closeFinancialPeriods()` (cap 24, INSERT IGNORE, try/catch en `requireAuth`)._
  - _`/analytics/all`: añadido `summary.current_period_start` (additivo, retrocompatible). `net_total_historical` ahora suma `monthly_closures.surplus` + transacciones `scope='historical'`. NO incluye el mes en curso._
  - _Frontend: `scope?` y `current_period_start?` opcionales en `src/api/types.ts` (sin uso aún; se consumen en Fase 3)._
  - _QA atrapó query duplicada a `users.income_payday`; arreglado extrayendo `getUserPayday()` con cache compartida → 1 query por request._
  - _Deuda menor (no bloqueante): `/analytics/summary` mantiene la fórmula antigua de `net_total_historical` (endpoint sin caller activo; revisar si se usa en Fase 3+)._
- [x] Fase 3 — Dashboard modo dual
  _Completada 2026-05-27. Notas:_
  - _`useDataStore` ahora expone `balanceMode` (efímero por sesión) + `setBalanceMode`._
  - _`usePreferencesStore` añade `seenBalanceSwipeTooltip` (persistido) para la pista educativa una sola vez._
  - _`BalanceHero` rediseñado con dos vistas (mes / histórico) animadas con cross-fade + ligero slide, gesto horizontal (`PanResponder` solo nativo; web usa dots), dots accesibles con `accessibilityRole="tab"`._
  - _Vista "Mis ahorros" pinta `summary.net_total_historical`, frase contextual según el signo, y card de runway (`projection.avg_monthly_expense`) cuando hay datos. Acepta surplus/historical negativo sin crash._
  - _Helper `src/utils/balanceMode.ts` con `filterByBalanceMode(items, mode, periodStart)` reutilizado en Dashboard y Movimientos. Si `current_period_start` falta, no filtra (fallback seguro)._
  - _`DashboardScreen` filtra la lista "Recientes" según el modo y descarta la pista cuando el usuario interactúa (swipe, dot o botón close)._
  - _`TransactionsScreen` añade `from`/`to` derivados del modo cuando NO hay rango explícito en filtros avanzados (los avanzados prevalecen). Filtro cliente-side complementario para `scope='historical'`. Recarga al cambiar `balanceMode`/`periodStart`._
  - _`npx tsc --noEmit` limpio (exit 0)._
- [x] Fase 4 — Scope en transacciones y metas
  _Completada 2026-05-27. Notas:_
  - _Backend: helper `validScope()` + helpers `currentPeriodAvailable()` y `historicalAvailable()` (descomposición de availableBalance en los dos pools)._
  - _`POST /transactions` y `PUT /transactions/{id}` aceptan `scope` ('month' default). El PUT bloquea cambiar el `scope` si la tx está ligada a una meta (`goal_id != null`) → 409. Decisión §2 del plan: las contribuciones a meta tienen scope inmutable._
  - _`POST /savings-goals/{id}/contribute` acepta `scope`; aporte valida contra `currentPeriodAvailable` o `historicalAvailable` según el pool elegido. La transacción creada hereda el `scope`._
  - _`GET /transactions` ahora devuelve `t.scope` en la SELECT._
  - _Frontend: `transactionsApi.create` añade `scope?`; `goalsApi.contribute(id, amount, scope?)` extiende firma; `TransactionSheet` muestra selector "Mover a" + helper text + bloqueo visual si `editing.goal_id`; `GoalSheet` muestra card con ambos pools + selector "Aportar desde / Devolver a" + validación cliente del límite._
  - _`InsightBanner` enriquecido con presupuesto diario, forecast (Plus), % objetivo, días al cobro. Existentes (delta mes anterior, racha, etc.) se mantienen como fallbacks._
  - _Review de cybersecurity-engineer verde: scope validado contra enum, PDO parametrizado, `user_id` desde JWT (nunca body), ownership chequeado antes de la lógica de scope, errores neutros al cliente._
  - _**Corrección posterior (2026-05-28):** la fórmula del presupuesto diario usaba el salario teórico (`incomeAmount`), lo que recomendaba gastar dinero no cobrado todavía. Ahora usa el **saldo real** (`summary.balance`) y **reserva los gastos fijos pendientes** del periodo (recurrentes con cobro futuro aún no materializados; el backend solo expande hasta hoy). Helpers `nthRecurringDate`/`pendingRecurringExpense` en `InsightBanner.tsx`. El mensaje de éxito del onboarding aplica la misma reserva de fijos (excluyendo los recurrentes demo). Ver `app-features.md §10.7`._
  - _**Bug fix (2026-05-28):** el Netflix demo no se borraba (DELETE /recurring devolvía 404). Causa raíz en backend: `POST /recurring` leía `lastInsertId()` DESPUÉS de `expandRecurringTransactions` (que inserta transacciones), devolviendo el id de la transacción en vez del recurrente; el cliente guardaba ese id como demoRecurringId y al borrarlo → 404. Arreglado capturando `$newId` justo tras el INSERT del recurrente (requiere **FTP de `index.php`**). Además: el FK `recurring_id` es ON DELETE SET NULL (correcto: preserva histórico en borrados normales), así que la transacción generada por el recurrente demo hay que borrarla aparte. `deleteDemoData()` ahora: (1) recolecta las tx con `recurring_id ∈ demoRecurringIds`, (2) borra los recurrentes PRIMERO (si no, el middleware `expandRecurringTransactions`, que corre en cada request, las regenera), (3) borra esas tx (ya huérfanas) + las demo sueltas. **El salario (Nómina) ya NO se captura como demo: persiste tras el tuto como ingreso real del usuario.**_
  - _`npx tsc --noEmit` limpio (exit 0)._
- [ ] Fase 5 — Analítica por mes financiero (opcional)

Cuando termines una fase, **marca la casilla** y añade una breve nota con la fecha y lo que quedó pendiente (si algo).

## 6. Si vuelves a esta tarea y dudas

1. Lee este documento entero.
2. Lee `app-features.md` §10-11.
3. Lee la memoria del proyecto `dual-balance-model.md`.
4. Si después de eso tienes dudas sobre algo que NO está aquí, **pregunta al usuario antes de tirar código**. Ya hemos pulido la idea con el equipo; cualquier cosa nueva merece confirmación.
