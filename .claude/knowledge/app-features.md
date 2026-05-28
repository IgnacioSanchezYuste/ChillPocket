# ChillPocket — Inventario funcional (qué hace la app HOY)

> Fuente de verdad para decisiones de producto / marketing / billing. Solo lo
> implementado y funcionando en la versión actual. Para lo que falta y queda
> en backlog, ver `ROADMAP.md`. Para detalles técnicos: `app-overview.md`,
> `backend-api.md`, `data-model.md`, `frontend-map.md`.

## 1. Identidad
- **Nombre**: ChillPocket
- **Categoría**: Gestor de finanzas personales / control de gastos.
- **Plataformas**: Android (publicada/en publicación), Web responsive (en uso),
  iOS (preparado en código pero sin build/store activo).
- **Idiomas**: español (único, no hay i18n todavía).
- **Modelo**: cuenta personal con login email/password o Google OAuth.

## 2. Acceso, cuenta y seguridad
- **Registro** con email + contraseña (mínimo 6 caracteres).
- **Login con Google** (OAuth, vía RevenueCat-… *sic* `@react-native-google-signin` nativo + `expo-auth-session` web).
  Al primer login crea la cuenta y lanza el onboarding.
- **Persistencia de sesión**: JWT de 7 días firmado por el backend.
- **JWT en almacén seguro** (`expo-secure-store` → Keystore/Keychain). Antes vivía en AsyncStorage.
- **Bloqueo de la app opcional**: el usuario puede activar PIN de 4-6 dígitos +
  biometría (huella/cara) desde Ajustes. Se pide al abrir y tras 5 min en background.
- **Rate limiting** en `/auth/login`, `/auth/register`, `/auth/google`: 5 intentos
  fallidos / 15 min, doble bucket (IP + email) → 429.
- **Logout limpio**: limpia datos en memoria + token + sesión Google.
- **Política de privacidad** publicada (`docs/privacy-policy.html`).

## 3. Núcleo financiero
### 3.1 Transacciones
- Crear, editar, eliminar gastos e ingresos.
- Campos: importe (> 0 obligatorio, validado en front y back), descripción,
  fecha, categoría opcional, **método de pago** opcional (efectivo, débito,
  crédito, bizum, transferencia, otros), notas opcionales.
- Iconos circulares con color por categoría en cada fila.
- Marca visual si la transacción viene de un recurrente (icono `repeat`) o
  de una contribución a meta (icono `flag`).

### 3.2 Pantalla "Movimientos"
- **Lista paginada** (50 por página, scroll infinito) con loader y mensaje al final.
- Pull-to-refresh.
- **Agrupación por fecha**: Hoy / Ayer / Esta semana / Este mes / `<Mes año>`.
- **Búsqueda en vivo** con debounce 250 ms (sobre descripción y notas).
- **Filtros básicos** inline:
  - Tipo (Todo / Gastos / Ingresos).
  - Categoría (chips horizontales).
- **Filtros avanzados** en sheet:
  - Rango de fechas (desde / hasta).
  - Importe mínimo / máximo.
  - Método de pago.
- Badge con número de filtros activos junto al icono de filtros.
- Cualquier 403 `plan_limit_reached` abre el Paywall automáticamente.

### 3.3 Categorías
- Categorías del sistema sembradas (Alimentos, Transporte, Vivienda, Ocio,
  Salud, Suscripciones, Compras, Otros gastos, Salario, Freelance, Inversiones,
  Otros ingresos) con color e icono.
- Categoría especial **"Ahorro"** (sistema) usada por las contribuciones a metas.
- El usuario puede **crear/editar/borrar categorías propias** con color e icono.

### 3.4 Recurrentes (gastos fijos / ingresos recurrentes)
- Crear gasto o ingreso recurrente con nombre, importe, frecuencia
  (semanal / mensual / anual), fecha de inicio, fecha de fin opcional,
  categoría y notas.
- **Generación perezosa idempotente**: al pedir datos autenticados el backend
  crea las transacciones que toquen desde la última generada hasta hoy. UNIQUE
  `(user_id, recurring_id, transaction_date)` evita duplicados.
- **Toggle activar/pausar** sin perder histórico.
- Vista con proyección mensual de ingresos vs gastos fijos.

### 3.5 Metas de ahorro (modelo "sobre")
- Crear metas con nombre, objetivo, fecha objetivo opcional, color, icono.
- **Contribuir a una meta crea una transacción de gasto** real en la categoría
  "Ahorro" con `goal_id`. Retirar crea el ingreso inverso.
- **Validación de saldo**: no puedes aportar más de lo que tienes disponible.
- Progreso visual + días restantes hasta la fecha objetivo.

### 3.6 Presupuestos
- Por categoría (o global) con límite mensual.
- `reset_day` configurable (1-28) — útil si tu mes empieza el 5.
- Cálculo de gasto en la ventana del presupuesto (no necesariamente mes natural).
- Estados visuales: sano / atención (>80%) / excedido (>100%).
- Selector de mes para ver presupuestos pasados.

## 4. Analítica (`AnalyticsScreen`)
Toda la analítica de un mes en una sola petición HTTP (`/analytics/all`,
diseñada para no agotar la cuota MySQL de Hostinger).

### 4.1 Resumen del mes
- Ingresos totales, gastos totales, balance, **% libre** (savings ratio).
- **Saldo histórico total** acumulado.
- Gastos fijos mensuales (ingresos / gastos recurrentes equivalentes a mes).
- Comparativa con mes anterior (delta %).
- **Ahorrado este mes**: aportado neto a metas (aportes − retiradas).

### 4.2 Gastos por categoría
- **Donut** SVG con segmentos por categoría + total en el centro.
- Leyenda con porcentaje y barra de progreso por categoría.
- Flechas para navegar a meses pasados (carrusel).

### 4.3 Tendencias diarias
- Serie de 30 días con ingresos vs gastos (gráfica de líneas).
- Sparkline de fondo en las cards comparativas (subidas/bajadas suaves).

### 4.4 Comparativa mensual
- Barras de gastos por mes (últimos 6).
- Línea ingresos vs gastos (últimos 6 meses) con leyenda.

### 4.5 Métodos de pago
- Suma por método (Bizum, débito, etc.) con % del gasto y nº de movimientos.

### 4.6 Hábitos de gasto (`SpendingHabits`)
- **Heatmap del mes**: calendario con cada día coloreado según gasto vs media diaria
  (sin gasto = verde claro, sobre la media = naranja/rojo, futuro = atenuado).
- Gasto por semana (barras).
- Insights: media diaria, días sin gastar, día más caro, racha sin gastar.

### 4.7 Forecast / Proyección mensual
- Card con degradado y narrativa: *"Si mantienes este ritmo, este mes ahorrarás X €"*.
- Sparkline del net diario acumulado.
- Métricas: ingreso medio, gasto medio, neto mensual, proyección a 6 y 12 meses.

### 4.8 Insight banner (Home)
- En el Dashboard, un banner accionable elige UNA frase útil:
  *"Gastas un 12% más que el mes pasado"*,
  *"Llevas 3 días sin gastar 🔥"*,
  *"Has movido 200 € a tus metas este mes"*,
  *"Vas en positivo este mes (+X €)"*.

## 5. Inversiones (calculadora)
- Calculadora de **interés compuesto** con aportación inicial, aportes
  recurrentes y horizonte temporal.
- Escenarios comparables (p.ej. cuenta remunerada, ahorro tradicional, inversión)
  con colores diferenciados.
- Gráfica de evolución con marcadores por año.
- Tabla del crecimiento año a año.

## 6. Experiencia
### 6.1 Onboarding
- **Spotlight tour** para nuevos usuarios (email + Google con `is_new=true`).
- Welcome → personalización (5 pasos: nombre, moneda, objetivo, frecuencia de
  ingresos, tema) → crear primer gasto (formulario precargado: 13,99 € · Ocio
  · Cena) → crear gasto fijo (Netflix 12,99 €) → crear ingreso (Nómina 2.100 €)
  → tour por las 4 pestañas → pantalla de éxito.
- Replay disponible en Ajustes ("Ver tutorial de nuevo").

### 6.2 Tema y diseño
- **Tres modos**: claro / oscuro / automático (sigue al sistema).
- Paleta pastel premium en claro, sobria en oscuro.
- Degradados: hero del saldo (morado→azul), hero pastel, hero del FAB.

### 6.3 Responsive
- En **móvil/tablet**: bottom tabs (Inicio, Movimientos, Analítica, Más).
- En **desktop** (≥ 960 px): **sidebar persistente** con todas las secciones,
  contenido en columna centrada (max 960), grids multi-columna en Analítica y
  Dashboard. Cambia en caliente al redimensionar sin remontar el navegador.

### 6.4 Multi-moneda
- Soporte de EUR, USD, GBP (selección en onboarding + Ajustes).
- Formateo localizado (`Intl.NumberFormat('es-ES', {style:'currency', currency})`).

### 6.5 Exportar mis datos
- En Ajustes → "Exportar mis datos" → descarga **JSON** completo (transacciones,
  recurrentes, metas, presupuestos, categorías).
- Solo plan Plus (feature `export`).

## 7. Estado actual del billing
- Tablas `plans`, `user_entitlements`, `billing_events` (Fase 1).
- 4 planes definidos en BD: `free`, `plus`, `family`, `pro_freelance`.
  **Aviso**: hoy solo `free` y `plus` corresponden a features reales.
- Todos los usuarios anteriores a la migración recibieron `plus` con
  `source='early_adopter'` (de por vida, sin pago).
- RevenueCat **conectado en código** (`expo-purchases`) y key de Android en
  `eas.json`. Pendiente: producto + offering creados en Google Play y RC.
- `PremiumLock` muestra badge "Plus" en features bloqueadas (export, forecast).
- Backend valida límites del plan en POST de presupuestos, metas, recurrentes,
  categorías propias → 403 `plan_limit_reached` (el front abre Paywall solo).

## 8. Plataformas y despliegue
- **Android**: package `com.Ignacio.ChillPocket`, EAS build (preview/production).
- **Web**: el frontend funciona en `react-native-web` (no hay despliegue público de la web aún).
- **iOS**: bundle id reservado (`com.Ignacio.ChillPocket`), sin App Store Connect activo.

## 9. Lo que NO hace (gaps importantes)
Esto se ha vendido o sugerido en documentos previos pero **no está implementado**.
Cualquier paywall debe respetar esta lista (no ofrecer lo que no existe):

- ❌ **Modo familia / multi-perfil**: no hay invitaciones, no hay perfiles
  separados, no hay tabla `family_members` poblada. La columna `family_mode`
  del plan existe pero ningún código la consume.
- ❌ **Etiquetas fiscales / reportes trimestrales (Pro Freelance)**: no hay módulo fiscal.
- ❌ **Web app pública con dominio propio**: el código corre en web (dev) pero
  no hay deploy. La feature `web_access` no existe como producto.
- ❌ **"Backup en la nube"** como diferencial: TODA la app guarda en nuestro
  backend. No es una feature premium, es la base del producto.
- ❌ **Notificaciones push o locales**: ni recordatorios ni alertas.
- ❌ **Exportar a CSV / PDF**: solo JSON.
- ❌ **Conexión bancaria automática** (PSD2 / Tink / Plaid).
- ❌ **Importar extractos** CSV / OFX.
- ❌ **Adjuntar foto / ticket a una transacción**.
- ❌ **Patrimonio neto histórico** (gráfica).
- ❌ **Etiquetas (tags) libres** en transacciones.
- ❌ **Soporte real prioritario** (no hay canal definido aún).
- ❌ **Familia con metas compartidas / presupuestos por miembro**.

## 10. Modelo financiero · Saldo del mes + Mis ahorros (DISEÑADO, no implementado aún)

> Esta sección documenta el cambio aprobado tras la consulta del equipo (frontend
> + QA + producto) sobre `.claude/Tareas/TareaSiguiente.md`. Las decisiones están
> cerradas; el código aún no está escrito. Cuando lo esté, este apartado pasa a
> describir el comportamiento vigente y se elimina la nota de "DISEÑADO".

### 10.1 Idea central
La app deja de tener UN saldo agregado (`net_total_historical`) y pasa a tener
**dos pools** claramente diferenciados, con un trasvase mensual entre ellos:

- **Saldo del mes** — lo que tienes disponible en el periodo financiero actual.
  Se reinicia el **día del cobro** del ingreso recurrente principal.
- **Mis ahorros** (nombre comercial; nombre técnico: ahorro histórico) — la suma
  de los excedentes (surplus) de meses cerrados + cualquier transacción marcada
  explícitamente como "histórica".

### 10.2 Periodo financiero
El periodo va desde el día del cobro del mes M hasta el día anterior del cobro
del mes M+1. Si el día del cobro no existe en el mes siguiente (p. ej. cobro
día 31 en febrero), se usa `MIN(payday, last_day_of_month)`.

Si el usuario eligió frecuencia **variable** en el onboarding (no hay recurrente
de ingreso principal), el periodo es el **mes natural**: del día 1 al último día.

La frecuencia **semanal** se usa solo en el onboarding para calcular el
equivalente mensual (`monto × 4.345`). **El reset siempre es mensual**, no se
hacen ciclos semanales (los gastos del mundo real son mensuales: alquiler,
suscripciones, facturas).

### 10.3 Cierre del mes (motor)
Patrón **lazy idempotente** análogo a `expandRecurringTransactions`:

- En cada request autenticado que devuelva balance (principalmente
  `/analytics/all` y `/savings-goals`), el backend llama a `closeFinancialPeriods($conn, $userId)`.
- La función calcula qué periodos del usuario han terminado y aún no están en la
  tabla `monthly_closures`, e inserta un registro por cada uno con su `surplus`
  (= ingresos − gastos del periodo, en transacciones con `scope='month'`).
- **El surplus puede ser negativo**: si el usuario gastó más de lo que ingresó
  ese mes, "Mis ahorros" **baja**. Es honestidad contable; la UI lo comunica
  con claridad ("Este mes gastaste 87 € más de lo ingresado").
- Si el usuario no abre la app durante 3 meses, los 3 cierres se procesan
  encadenados en una sola llamada. Límite de seguridad: máximo 24 cierres por
  request para no agotar la cuota MySQL de Hostinger.
- Las transacciones NO se mueven entre tablas ni se reescriben. El cierre solo
  añade una fila a `monthly_closures`. Los rangos de fechas siguen siendo la
  fuente de verdad para filtrar.

### 10.4 Scope de transacciones
Nueva columna `scope ENUM('month','historical') NOT NULL DEFAULT 'month'` en
`transactions`. Significado:

- `month` (default): la transacción afecta al periodo financiero en el que cae
  su fecha. Si la fecha cae en un periodo ya cerrado, contó para el surplus de
  aquel cierre (no se recalcula a posteriori; ver sección "edge cases").
- `historical`: la transacción afecta directamente a "Mis ahorros", sin pasar
  por el saldo del mes. Casos típicos: reparación grande del coche pagada con
  ahorros; herencia, bonus o ingreso extra que el usuario quiere reservar.

El usuario elige el scope al crear la transacción. Una vez guardado, el scope
de las **contribuciones a meta** es inmutable (mover una contribución entre
scopes implica retirar y volver a aportar, no editar).

### 10.5 Contribuciones a metas
`POST /savings-goals/{id}/contribute` acepta un nuevo campo `scope`. Si
`scope='month'`, valida contra el saldo disponible del periodo actual; si
`scope='historical'`, valida contra "Mis ahorros". En la UI del `GoalSheet`,
selector "Aporto desde: [Este mes / Mis ahorros]".

### 10.6 Visualización (Dashboard)
- `BalanceHero` muestra por defecto **"Saldo del mes"**. El usuario puede pasar
  a **"Mis ahorros"** mediante swipe horizontal (en móvil) o flechas/dots (en
  web y para accesibilidad). El gesto debe coexistir con un control alternativo
  visible para no romper accesibilidad y soporte web.
- Al cambiar al modo "Mis ahorros", la **lista de transacciones del mismo
  Dashboard** y la pantalla **Movimientos** filtran implícitamente:
  - Modo `month`: `transaction_date >= current_period_start AND scope='month'`.
  - Modo `historical`: `transaction_date < current_period_start OR scope='historical'`.
- El filtro implícito puede sobrescribirse desde los filtros avanzados de
  `TransactionsScreen` (fechas explícitas).

### 10.7 Estadísticas personalizadas (lista priorizada)
Calculables con `ingreso_referencia + frecuencia + objetivo_ahorro_mensual +
transacciones_del_periodo + payday`:

1. **Presupuesto diario disponible** — `(saldo_real_del_mes − ahorro_objetivo − gastos_fijos_pendientes) / días_restantes_del_periodo`. Usa el **saldo real** (`summary.balance`), NO el salario teórico: así nunca recomienda gastar dinero que aún no ha entrado (si no has cobrado, el presupuesto baja o avisa). Reserva además los **gastos fijos pendientes** del periodo (recurrentes con fecha de cobro futura, aún no materializados como transacción, ya que el backend solo expande hasta hoy) para que el número no salte cuando llega el recibo. *"Hoy puedes gastar 47 € y seguir cumpliendo tu objetivo"*. Si el saldo no cubre ni los fijos pendientes → aviso *"Tus gastos fijos pendientes no caben en tu saldo"*; si cubre fijos pero no el objetivo completo → *"…no deberías gastar más este periodo"*. Implementado en `src/components/InsightBanner.tsx`; el mensaje de éxito del onboarding (`OnboardingHost.tsx`) usa la misma fórmula con el salario declarado como proyección.
2. **Días hasta el próximo cobro** — countdown visible en Home.
3. **% completado del objetivo de ahorro este mes** — barra de progreso.
4. **Racha de días dentro del presupuesto** — gamificación motivadora.
5. **Forecast del cierre del mes** — *"Si sigues así, cerrarás el periodo con +180 € que irán a tus ahorros"*.
6. **"Te queda X esta semana"** — presupuesto semanal residual.
7. **Top 3 categorías que más se comen tu objetivo** — donut + comparativa con el mes anterior.
8. **Tendencia del % objetivo cumplido** — últimos 6 cierres.
9. **Meses de runway con tus ahorros** — *"Con lo que tienes ahorrado podrías cubrir 4,2 meses"*.
10. **Día de la semana más caro** — patrón de hábitos.

Las que requieren acceso a meses cerrados (forecast histórico, runway, tendencias)
forman parte del paquete **Plus** (feature `advanced_analytics`).

### 10.8 Cómo se persiste el "ingreso de referencia" y el "objetivo de ahorro"
- `users.income_reference DECIMAL(10,2) NULL` — el último importe declarado en el
  onboarding (o en Ajustes). Se guarda en su moneda actual.
- `users.income_payday TINYINT NULL` — día del mes del cobro (1-31; null si variable).
- `users.savings_goal_monthly DECIMAL(10,2) NULL` — objetivo de ahorro mensual.
- Los recurrentes de ingreso siguen siendo la fuente real para `expandRecurringTransactions`
  y el calendario de cobros. El `income_payday` se sincroniza con el recurrente
  principal cuando existe.

## 11. Onboarding rediseñado (DISEÑADO, no implementado aún)

### 11.1 Pasos del onboarding personalizado
1. **Welcome** (igual que hoy).
2. **Personalize · Nombre**.
3. **Personalize · Moneda**.
4. **Personalize · Objetivo** (ahorrar más / controlar gastos / etc.) — sin cambios.
5. **Personalize · Frecuencia de ingresos** con **input adaptativo**:
   - Mensual → input *"Tu salario neto mensual"* + selector *"Día del mes que lo cobras"* (1-28 con opción "fin de mes").
   - Semanal → input *"Tu salario semanal"* + selector *"Día de la semana que cobras"*.
   - Variable → no aparece nada más.
6. **Personalize · Objetivo de ahorro mensual** (NUEVO) — input numérico con
   sugerencias de 10% / 20% / 30% del ingreso si lo hay, o libre. Si el usuario
   eligió variable, sigue siendo libre pero sin presets.
7. **Personalize · Tema** (igual que hoy).
8. **CreateExpense** (spotlight + formulario precargado, igual que hoy).
9. **CreateRecurringExpense** (Netflix).
10. **CreateIncome** (si frecuencia ≠ variable, **el formulario se pre-rellena
    con el monto y el día declarados en el paso 5** en vez de los placeholders
    actuales).
11. **Tour de pestañas**.
12. **Success** con resumen personalizado: *"Hola Ignacio, hoy puedes gastar 47 € y seguir ahorrando 300 € este mes 🎯"*.

### 11.2 Demo data — borrado al finalizar
El gasto del paso 8 (Cena) y el gasto fijo del paso 9 (Netflix) son **demo**: se
borran al llegar a `success` o al pulsar "Saltar tutorial". **El ingreso del paso
10 (Nómina) NO es demo: persiste** como ingreso recurrente real del usuario
(decisión 2026-05-28). Por eso `createIncome` ya no captura su id para borrado.

Mecanismo (`useOnboardingStore`):
- Mantiene `demoTransactionIds: number[]` (Cena) y `demoRecurringIds: number[]` (Netflix),
  persistidos en AsyncStorage por si la app crashea entre la creación y el borrado.
- Al crear un recurrente, el backend lo materializa como transacción (FK
  `recurring_id` ON DELETE SET NULL: borrar el recurrente NO borra su transacción).
  Por eso `deleteDemoData()`: (1) recolecta las tx con `recurring_id ∈ demoRecurringIds`,
  (2) borra los **recurrentes primero** (si no, el middleware `expandRecurringTransactions`
  —corre en cada request— las regeneraría), (3) borra esas tx huérfanas + las demo
  sueltas, (4) `refreshAll(true)` UNA vez.
- **Dependencia backend**: `POST /recurring` debe devolver el id del recurrente
  (no el de la última transacción que inserta `expandRecurringTransactions`). Corregido
  capturando `lastInsertId()` antes de expandir — requiere FTP de `index.php`.

### 11.3 Replay del tutorial (botón "Ver tutorial de nuevo")
Si el usuario ya tiene datos reales (cualquier transacción, recurrente o meta
fuera del set demo), el replay **omite los pasos 8-10** (creación de
transacciones) y solo muestra: Welcome → Personalize → Tour → Success.
Esto evita el problema de **duplicar Netflix indefinidamente** y la confusión
de borrar datos reales.

Detección de "tiene datos reales": al iniciar `restart()`, consultar el estado
del store; si `transactions.length > 0` o `recurring.length > 0`, marcar el
replay como `skipCreationPhases: true`.

## 12. Restricciones técnicas que condicionan producto
- **Hostinger: 500 conexiones MySQL/hora**. Cualquier feature que añada peticiones
  recurrentes o webhooks de alto volumen necesita pensarse muy bien.
- **Generación perezosa de recurrentes**: no hay cron; los recurrentes se materializan
  al entrar el usuario. Notificaciones tipo "te van a cobrar Netflix mañana" requieren
  un cron real o trabajar en cliente con notificaciones locales programadas.
- **Backend mono-archivo**: `backend/index.php` ~2.000 líneas. Cualquier crecimiento
  serio pedirá refactor (separar en módulos, fuera de scope inmediato).
- **Sin tests automáticos**: cualquier cambio de regla de negocio se valida a mano.
