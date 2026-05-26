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

7. **Modelo dual "Saldo del mes" + "Mis ahorros" + onboarding personalizado** — **L** · Backend sí
   Aprobado tras consulta del equipo (ver `.claude/knowledge/app-features.md` §10-11).
   - Backend: nueva columna `transactions.scope`, tabla `monthly_closures`, función `closeFinancialPeriods` lazy idempotente, columnas en `users` (`income_reference`, `income_payday`, `savings_goal_monthly`).
   - Frontend: `BalanceHero` con swipe entre modos, `useDataStore.balanceMode`, filtro implícito en transacciones, selector "Aportar desde" en `GoalSheet`, onboarding con input adaptativo + paso de objetivo de ahorro, **borrado de demo data por IDs al finalizar tuto**, replay del tuto que omite pasos de creación.
   - Reglas clave decididas: mes negativo **baja** el ahorro (honestidad); analítica sigue siendo **mes natural** en v1 del cambio; reset siempre mensual aunque la frecuencia sea semanal.
   - Implementación por fases (más detalle en `app-features.md` §10):
     1. Onboarding personalizado + demo cleanup (solo frontend, sin SQL).
     2. SQL + motor de cierre (backend puro, retrocompatible).
     3. Dashboard modo dual (swipe + filtros).
     4. Scope en transacciones y metas.
     5. Migrar analítica a mes financiero (opcional, fase posterior).

7. **Notificaciones y recordatorios inteligentes** — **L** · Backend sí
   Avisos al alcanzar 80/100% del presupuesto, recurrente próximo a cobrarse (1-3 días antes), meta cumplida, recordatorio diario de registrar gastos.
   Decisiones pendientes: locales (Expo Notifications, sin servidor) vs push (FCM + cron en backend), configurabilidad por usuario en Ajustes. Es el mayor salto de valor: la app pasa de "registrar" a "ayudar".

8. **Exportar a CSV** — **S** · Backend sí
   `GET /transactions/export?format=csv` con `Content-Disposition: attachment`.
   *Bloquea promesa Plus en `Billing.md`*: "exportar a CSV" se anuncia como feature Plus.

9. **Webhook de RevenueCat** (`/billing/webhook/revenuecat`) — **M** · Backend sí
   Verificación de firma + actualización de `user_entitlements` (`source='revenuecat'`/`'lifetime'`) + auditoría en `billing_events`. Sin esto, las compras NO sincronizan con nuestra BD aunque el SDK marque al usuario como Plus.

10. **Gating real del historial > 3 meses para Free** — **S** · Backend sí
    Nueva feature flag `unlimited_history`. Clampar `from` mínimo en `GET /transactions` y `GET /analytics/all` para usuarios free. Frontend ya está preparado para abrir paywall.

11. **PremiumLock en pantallas analíticas restantes** — **S** · Backend no
    Aplicar `PremiumLock` en Hábitos de gasto, Comparativa mensual, Métodos de pago, Calculadora de inversiones. La flag `advanced_analytics` ya existe.

## 🚀 Prioridad media (diferenciadores)

12. **Presupuestos con auto-renovación mensual** — **M** · Backend sí
    Flag `auto_renew`: al pedir un mes sin presupuesto, clonar el del anterior.

13. **Patrimonio neto / "Net Worth"** — **L** · Backend no
    Gráfica de evolución del saldo histórico acumulado (`net_total_historical` ya existe). Vista diferenciadora visible en Plus.

14. **Swipe actions en Movimientos** — **M** · Backend no
    Deslizar para eliminar (con confirmación) o duplicar una transacción.

15. **Animaciones premium** — **M** · Backend no
    Entrada radial del DonutChart, count-up del saldo, celebración (confetti) al cumplir meta.

16. **Estados de carga y error robustos** — **M** · Backend no
    Skeletons en Analítica/Metas/Recurrentes/Presupuestos. Diferenciar "sin datos" de "error de red" con botón Reintentar.

17. **Exportar a PDF** — **M** · Backend sí
    Resumen mensual o anual generado como PDF (server-side `mPDF` o cliente con react-native-print).

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

### Hito 2 — Plus diferencial
12 (auto-renew) + 13 (Net Worth) + 14 (swipe actions) + 15 (animaciones) + 16 (estados).
Plus se siente "premium" de verdad y mejora retención.

### Hito 3 — Plan Familia vendible
F1 + F2 + F3 + F4 + F5. Levanta el plan Familia del paywall.

### Hito 4 — Plan Pro Freelance vendible
P1 + P2 + P3 + P4 + P5. Levanta el plan Pro Freelance.
