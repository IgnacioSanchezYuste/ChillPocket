# ChillPocket — Roadmap

Plan vivo. La v1.x está en producción Android (Play). Los items con ✅ ya están
hechos en la v1.x; el resto van a v2 (y v3 cuando haya). Para alinear con
billing, ver `Billing.md` en este mismo directorio y `app-features.md` en
`.claude/knowledge/`.

> Leyenda — Esfuerzo: **S** (pequeño) · **M** (medio) · **L** (grande).
> "Backend" = requiere cambios de API/SQL y desplegar.

## ✅ Hecho en v1.x

1. ✅ **Paginación / scroll infinito en Movimientos** — `onEndReached`, 50/página, reset en filtros, badge de filtros activos.
2. ✅ **Búsqueda y filtros avanzados** — sheet con rango de fechas, importe min/max, método de pago + debounce 250 ms. Backend acepta `amount_min`/`amount_max`.
3. ✅ **PIN / biometría + JWT en `expo-secure-store`** — `useSecurityStore`, `LockScreen`, AppState listener (lock tras 5 min en background), migración automática del token.
4. ✅ **Rate limiting en `/auth/*`** — 5 intentos / 15 min, doble bucket IP+email, tabla `auth_attempts` con limpieza oportunista.
5. ✅ **Sistema de billing Fase 1** — `plans`, `user_entitlements`, `billing_events`, paywall, `useBilling()`, `PremiumLock`, backfill early-adopter.
6. ✅ **RevenueCat wired** — SDK cargado con guard, identify/signOut, offerings, purchase, restore.

## 🔝 Prioridad alta v2

7. **Modelo dual "Saldo del mes" + "Mis ahorros" + onboarding personalizado** — **L** · Backend sí · ✅ Fases 1-4 completas (2026-05-27)
   Plan de implementación detallado en **`.claude/Tareas/DualBalance.md`** (5 fases). Spec funcional en `.claude/knowledge/app-features.md` §10-11. Estado:
   - ✅ **Fase 1** — Onboarding personalizado + demo cleanup (frontend; sin deploy backend). Completada 2026-05-26.
   - ✅ **Patches extra** — Límite `recurring` plan free 1→3 (SQL §7) y wheel picker para "día de cobro" en onboarding. Completados 2026-05-26.
   - ✅ **Fase 2** — Schema + motor de cierre (`transactions.scope`, `monthly_closures`, `users.income_payday/savings_goal_monthly`, `closeFinancialPeriods()` lazy idempotente, `summary.current_period_start` en `/analytics/all`). Completada y desplegada 2026-05-27.
   - ✅ **Fase 3** — Dashboard modo dual (swipe en `BalanceHero`, `useDataStore.balanceMode`, filtro implícito en transacciones). Completada 2026-05-27 (solo frontend).
   - ✅ **Fase 4** — Scope en transacciones y metas (selector en `TransactionSheet`, "Aportar desde" en `GoalSheet`, stats personalizadas en `InsightBanner`). Completada 2026-05-27 (requirió FTP de `index.php`).
   - ⏸️ **Fase 5** — Migrar analítica a mes financiero (deliberadamente aplazada hasta tener feedback real del modelo dual). Ver DualBalance.md §Fase 5.
   - Reglas clave decididas (NO replantear): mes negativo **baja** Mis ahorros (honestidad); analítica sigue siendo **mes natural** hasta Fase 5; reset siempre mensual aunque la frecuencia sea semanal; cap 24 cierres por request (cuota Hostinger).
   - Deuda menor abierta: `/transactions` aún no acepta `scope` como query-param (el filtrado por modo se hace cliente-side); revisar si causa problemas con muchas transacciones `scope='historical'`.

7. **Notificaciones y recordatorios inteligentes** — **L** · Backend sí
   Avisos al alcanzar 80/100% del presupuesto, recurrente próximo a cobrarse (1-3 días antes), meta cumplida, recordatorio diario de registrar gastos.
   Decisiones pendientes: locales (Expo Notifications, sin servidor) vs push (FCM + cron en backend), configurabilidad por usuario en Ajustes. Es el mayor salto de valor: la app pasa de "registrar" a "ayudar".

8. **Exportar a CSV** — **S** · Backend sí · ✅ Implementado 2026-05-27
   Endpoint `GET /transactions/export?format=csv` en `backend/index.php` (~líneas 1585-1718). Auth JWT + gate por `features.export` (devuelve 403 `plan_limit_reached` entity='export' si el plan no la incluye). Una query con LEFT JOINs a categories/recurring/savings_goals + INNER JOIN a users para la moneda. Genera CSV con `fputcsv()` (escapado correcto) + BOM UTF-8 al inicio (Excel detecta encoding). Headers: `Content-Type: text/csv`, `Content-Disposition: attachment`, `Cache-Control: no-store`. Reutiliza `enforceHistoryLimit` para defensa profunda. Cap defensivo de 50.000 filas con header `X-ChillPocket-Truncated: true` si se alcanza. Frontend: `transactionsApi.exportCsv()` en `endpoints.ts` + `onExport` en `SettingsScreen.tsx` reescrito — web descarga Blob, nativo usa `Share.share({message})`. **Pendiente**: FTP `index.php`. SIN SQL.

9. **Webhook de RevenueCat** (`/billing/webhook/revenuecat`) — **M** · Backend sí · ✅ Implementado 2026-05-27
   Endpoint público en `backend/index.php` (~líneas 2564-2808). Auth por header `Authorization` con `hash_equals` contra `REVENUECAT_WEBHOOK_AUTH` (constante en `Conexion.php` no versionado). Idempotencia gratis vía UNIQUE `(provider, external_id)` en `billing_events`. Mapea event types: `INITIAL_PURCHASE/RENEWAL/PRODUCT_CHANGE/UNCANCELLATION` → activar; `EXPIRATION/REFUND/SUBSCRIPTION_PAUSED` → desactivar; `CANCELLATION/BILLING_ISSUE` → sin cambios; `NON_RENEWING_PURCHASE` + `lifetime_plus` → fila permanente `source='lifetime'`. Excluye `source IN ('early_adopter','manual')` de las desactivaciones masivas (los grants permanentes sobreviven al ciclo de billing). **Pendiente**: FTP `index.php`, añadir `define('REVENUECAT_WEBHOOK_AUTH', ...)` en `Conexion.php` del servidor, configurar webhook URL + Authorization en RC Dashboard.

10. **Gating real del historial > 3 meses para Free** — **S** · Backend sí · ✅ Implementado 2026-05-27
    Helper `enforceHistoryLimit($conn, $userId, $monthYear, $from)` en `backend/index.php` que lee `limits.history_months` (ya existía en `plans` como `3` para free, `null` para los demás — no se añadió flag nueva). Aplicado en `GET /transactions` (valida `from`) y `GET /analytics/all` (valida `month_year`). Devuelve 403 `plan_limit_reached` con `entity='history'`; el frontend ya captura el código en `src/api/http.ts:48` y abre Paywall. **Pendiente**: FTP `index.php`. SIN SQL nuevo.

11. **PremiumLock en pantallas analíticas restantes** — **S** · Backend no · ✅ Implementado 2026-05-27
    `PremiumLock` aplicado con flag `advanced_analytics` en: Hábitos de gasto, Comparativa mensual, Métodos de pago (3 secciones de `AnalyticsScreen.tsx`) y Calculadora de inversiones (cuerpo completo de `InvestmentsScreen.tsx`, `ScreenHeader` se mantiene visible). Patrón idéntico al del Forecast/Proyección que ya estaba. **Deuda menor**: la calculadora reusa `advanced_analytics` en vez de crear la flag `investments` propuesta en Billing.md §7; si en el futuro se quiere vender por separado, refactor trivial (añadir flag a `types.ts.PlanFeatures` + `features_json` del plan + cambiar `feature` prop).

## 🚀 Prioridad media (diferenciadores)

12. **Presupuestos con auto-renovación mensual** — **M** · Backend sí · ✅ Implementado 2026-05-27
    Columna `budgets.auto_renew TINYINT(1) DEFAULT 0` (SQL §9 idempotente con guard `information_schema`). Helper `autoRenewBudgets($conn, $userId, $monthYear)` en `backend/index.php` clona vía `INSERT IGNORE` los presupuestos del mes anterior con `auto_renew=1` al consultar un mes nuevo. Cableado en `GET /budgets` (lazy, con try/catch silencioso). `POST` y `PUT /budgets/{id}` aceptan el flag. UI: `Switch` en `BudgetSheet` con label "Renovar automáticamente cada mes". **Pendiente**: SQL §9 en phpMyAdmin → FTP `index.php`.

13. **Patrimonio neto / "Net Worth"** — **L** · Backend no · ✅ Implementado 2026-05-27
    Pantalla nueva `src/screens/main/NetWorthScreen.tsx`. Hero con `useCountUp` mostrando `net_total_historical` + delta vs mes anterior. `LineChart` (react-native-chart-kit) con serie cumulativa derivada de `summary.monthly`. 4 stat cards: crecimiento 6 meses, promedio mensual, mejor mes, mes más bajo. Acceso desde la pantalla "Más" (hub). Plus-gated con `PremiumLock` flag `advanced_analytics`. Skeleton + ErrorState + EmptyState siguiendo el patrón de item 16.

14. **Swipe actions en Movimientos** — **M** · Backend no · ✅ Implementado 2026-05-27
    Componente nuevo `src/components/SwipeableTransactionRow.tsx` que envuelve `TransactionRow` con `Swipeable` (react-native-gesture-handler). Swipe izquierda revela **Duplicar** (icono `copy-outline`, `palette.accent`) y **Eliminar** (icono `trash-outline`, `palette.danger`). Confirmación via `confirm()` antes de borrar. Duplicar abre `TransactionSheet` con prefill (fecha = hoy, sin `id`). Vibración háptica con `expo-haptics` al abrir. Aplicado en `TransactionsScreen` y "Recientes" del `DashboardScreen`. Web fallback: render simple sin swipe (`Platform.OS === 'web'`).

15. **Animaciones premium** — **M** · Backend no · ✅ Implementado 2026-05-27
    Tres animaciones:
    - **Count-up del saldo**: hook `src/hooks/useCountUp.ts` (requestAnimationFrame, ease-out, ~700ms). Aplicado en `BalanceHero` para balance, ingresos, gastos y "Mis ahorros". No anima si el modo "ojo cerrado" está activo.
    - **Entrada radial del DonutChart**: animación 0→1 en 900ms con `strokeDasharray` dinámico (la "aguja" barre 0°→360° dibujando segmentos en orden). `src/components/DonutChart.tsx`. Re-anima al cambiar el dataset (huella basada en `value|color`).
    - **Confetti al cumplir meta**: `src/components/Confetti.tsx` (Animated clásico, 36 piezas, caída con rotación + scale + opacity). Trigger en `GoalsScreen` cuando una meta pasa de `current < target` a `current >= target` en la misma sesión. Toast "¡Meta cumplida! 🎉" y auto-oculta a los 2.4s. Set en memoria para no celebrar dos veces la misma.

16. **Estados de carga y error robustos** — **M** · Backend no · ✅ Implementado 2026-05-27
    Flags por entidad en `useDataStore`: `{analytics,goals,recurring,budgets}{Loading,Error}`. Componente nuevo `src/components/ErrorState.tsx` (icono `cloud-offline-outline`, descripción, botón "Reintentar"). Patrón en 4 pantallas (`AnalyticsScreen`, `GoalsScreen`, `RecurringScreen`, `BudgetsScreen`): `loading && !hasData → skeleton`; `error && !hasData → ErrorState con onRetry`; `!error && !loading && noData → EmptyState`; else contenido. Refreshes silenciosos (force=true) NO disparan skeleton para evitar parpadeo. Errores parciales: cada pantalla tiene su flag independiente.

17. **Exportar a PDF** — **M** · Cliente · ✅ Implementado 2026-05-27 (junto con el rework del CSV)
    Cliente-side con `expo-print.printToFileAsync({ html })`. HTML generado por `src/utils/exportHtml.ts` (función pura `buildExportHtml(transactions, categories, user)` con `escapeHtml`): cabecera con nombre/email/fecha, tabla por mes (Fecha · Categoría · Descripción · Tipo · Importe), subtotales mensuales, pie de página. En web → `Print.printAsync({ html })` (diálogo del navegador). En nativo → `Sharing.shareAsync(uri, { mimeType: 'application/pdf' })`. Plus-gated con flag `export`.

8b. **Rework del CSV export** — Backend ya estaba (item 8 hito 1). **Cliente reescrito 2026-05-27** con `expo-file-system` + `expo-sharing`: en nativo escribe el CSV a `cacheDirectory + filename` y comparte como archivo real (no como texto en share sheet). Web mantiene Blob + `a.download`. UI en Settings: un solo `RowAction` "Exportar mis datos" abre un `Sheet` con dos opciones (CSV / PDF). **Pendiente**: dev build EAS nuevo para que el binario incluya `expo-file-system`, `expo-sharing` y `expo-print` autolinkeados.

## 🏗️ Habilitadores para los planes premium en cola

Estos items existen específicamente porque **desbloquean** planes que ya están
prometidos en `Billing.md` pero no son vendibles aún. Sin ellos, los planes
quedan en "Próximamente".

### Habilitadores del plan Familia (5 perfiles, metas/presupuestos compartidos)
- **F1**. Multi-perfil real — tabla `family_members` poblada + endpoints CRUD (`POST /family/invite`, `POST /family/accept/{token}`, `DELETE /family/member/{id}`). **L**.
- **F2**. Invitaciones por email — generar token, enviar email (necesita SMTP en Hostinger o servicio externo tipo Resend/Mailgun). **M**.
- **F3**. Permisos por miembro — owner/contributor/viewer. Aplicar en cada query con filtro de pertenencia al núcleo. **M**.
- **F4**. Vista "Familia" — pantalla agregada de balance del núcleo + filtro por miembro en analítica. **M**.
- **F5**. Migración de metas/presupuestos a un *scope* familiar opcional. **M**.

### Habilitadores del plan Pro Freelance (etiquetas fiscales + reportes)
- **P1**. Tabla `transaction_tax_tags` (o columna `tax_metadata` JSON) — IVA, IRPF, deducibilidad. **M**.
- **P2**. UI para marcar fiscalmente una transacción al crearla/editarla. **M**.
- **P3**. Lógica de cálculo por trimestre — bases imponibles, cuotas, totales. **M**.
- **P4**. Pantalla "Reportes fiscales" con vista trimestral y export. **M**.
- **P5**. Export CSV con esquema fiscal validado (modelos 303 / 130 / 100). **L**.

### Habilitadores comunes
- **C1**. Conexión bancaria automática (PSD2 con Tink, Plaid o GoCardless) — diferencial enorme si se logra. **XL** y complicación regulatoria; aplazado.
- **C2**. Importar extractos CSV / OFX — del banco a la app, una vez sin necesidad de conexión continua. **L**.
- **C3**. Adjuntar foto/ticket a una transacción — `expo-image-picker` + Storage (S3-like o BunnyCDN). **L**.
- **C4**. Web app pública con dominio propio — necesario para vender `web_access`. Hoy el código corre en `react-native-web` pero no hay deploy. **M-L** (build + DNS + Cloudflare Pages o similar).

## 🧩 Prioridad baja (nice-to-have)

18. **Estados vacíos ilustrados** (SVG por entidad) — **M**.
19. **Personalización del color de acento** (presets en Ajustes) — **M**.
20. **Etiquetas (tags) libres** en transacciones — **L** · Backend sí.
21. **Multi-divisa con conversión** (tipo de cambio histórico) — **L** · Backend sí.
22. **Revocación de sesión / refresh tokens** (cerrar sesión en todos los dispositivos) — **M** · Backend sí.
23. **Pack de iconos premium** — bajo ARPU, posponer indefinidamente.

## 🧪 Calidad / deuda técnica (transversal a la v2)

- **Tests automatizados** (Jest) empezando por utils puras: `format`, `validators`, `categoryIcon`, interés compuesto, lógica de `getUserEntitlements`.
- **Sincronizar el dump SQL** (`backend/u204231532_Finanzas.sql`) con el esquema real (`goal_id`, `google_sub`, `plans`, `user_entitlements`, `billing_events`, `auth_attempts`).
- **CORS con allowlist** de orígenes en vez de `*` (cuando se publique la web).
- **Mover `expandRecurringTransactions`** fuera del middleware genérico (solo en endpoints que lo necesitan) y fusionar queries de analítica para ahorrar conexiones MySQL.
- **`React.memo`** en `TransactionRow`/`KPICard`/`DonutChart`/`Sparkline`.
- **Cron real** (o equivalente en Hostinger) para enviar notificaciones programadas y limpiar `auth_attempts`/`billing_events` viejos.

## 🎯 Hitos sugeridos

### Hito 1 — Plus vendible de verdad
6 (rate limiting ✅) + 7 (notificaciones) + 8 (CSV) + 9 (webhook RC) + 10 (history gating) + 11 (PremiumLock restantes).
Una vez aquí, **Plus tiene 4 features ya entregables** que justifican los 2,99 €/mes.

### Hito 2 — Plus diferencial ✅ Completado 2026-05-27
12 (auto-renew) + 13 (Net Worth) + 14 (swipe actions) + 15 (animaciones) + 16 (estados) **+ 17 (PDF)**.
Plus se siente "premium" de verdad y mejora retención. **Pendiente de deploy**: SQL §9 en phpMyAdmin + FTP de `index.php` + EAS dev build nuevo (3 deps nativas: `expo-file-system`, `expo-sharing`, `expo-print`).

### Hito 3 — Plan Familia vendible
F1 + F2 + F3 + F4 + F5. Levanta el plan Familia del paywall.

### Hito 4 — Plan Pro Freelance vendible
P1 + P2 + P3 + P4 + P5. Levanta el plan Pro Freelance.
