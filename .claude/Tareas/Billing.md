# ChillPocket — Estrategia de Billing (v1)

> Este documento **sustituye** al brief original de billing. La versión anterior
> proponía planes con funcionalidades inexistentes (modo familia con multi-perfil,
> reportes fiscales trimestrales, web app pública, "backup en la nube" como
> diferencial). Eso generaría reembolsos, reseñas 1⭐ y riesgo de suspensión por
> *deceptive subscriptions* en Google Play.
>
> **Principio rector**: solo vendemos lo que la app HACE HOY. Lo que no existe va
> al [`ROADMAP.md`](../../ROADMAP.md) y se promociona como "próximamente" cuando
> sea inminente, nunca como parte de un plan ya cobrado.
>
> Inventario real de features → [`.claude/knowledge/app-features.md`](../knowledge/app-features.md).

---

## 1. Objetivo

Implementar un **freemium honesto** con dos planes vivos:
- **Gratis**: lo justo para enganchar al usuario y dejarle ver el valor.
- **Plus**: todo sin límites + las herramientas analíticas serias.

Más un add-on real (**Lifetime Plus**) y un set claro de planes **en cola** para
cuando estén las features (Familia, Pro Freelance).

Stack de pagos:
- **iOS/Android**: RevenueCat + In-App Subscriptions de Play.
- **Web**: aplazado hasta que exista una web pública (no en v1).

---

## 2. Planes activos en v1

### 🆓 Gratis · 0 €
Pensado para que el usuario use la app a diario y entienda el valor antes de pagar.

**Sin límites en**:
- Movimientos (crear/editar/borrar).
- Categorías del sistema.
- Login, sincronización entre dispositivos del mismo usuario.
- Tema claro/oscuro, multi-moneda, biometría/PIN (la seguridad NO se monetiza).

**Con estos límites**:
- ✋ **2 presupuestos** activos en el mes en curso.
- ✋ **2 metas** de ahorro activas (no completadas).
- ✋ **1 gasto/ingreso recurrente** activo.
- ✋ **8 categorías personalizadas** (las del sistema siempre disponibles).
- ✋ **Historial visible: últimos 3 meses** (los datos siguen en backend; solo se oculta la navegación a meses anteriores).
- ✋ Analítica **básica** del mes en curso: balance, ingresos, gastos, donut por categoría, tendencia 7 días.

**No incluye** (se ofrece upgrade desde estas pantallas):
- Forecast / proyección mensual.
- Hábitos de gasto (heatmap + insights).
- Comparativa mensual (barras + línea ingresos vs gastos de los últimos 6).
- Métodos de pago detallados.
- Calculadora de inversiones.
- Exportar datos.

### ⭐ Plus · 2,99 €/mes · 19,99 €/año *(ahorra 44%)*
Todo el potencial de la app, pensado para usuarios serios con el dinero.

**Diferenciales reales** (todos implementados):
1. **Sin límites** — presupuestos, metas, recurrentes y categorías personalizadas ilimitados.
2. **Historial completo** — accede a cualquier mes con el selector y al carrusel de comparativa.
3. **Forecast mensual** — *"Si mantienes este ritmo, este mes ahorrarás X €"* + proyección a 6 y 12 meses con sparkline.
4. **Hábitos de gasto** — heatmap diario + media diaria, días sin gastar, día más caro, racha sin gastar.
5. **Comparativa mensual** — barras de gastos y línea ingresos vs gastos de los últimos 6 meses.
6. **Métodos de pago detallados** — desglose por método con % del gasto.
7. **Calculadora de inversiones** — interés compuesto con escenarios.
8. **Insight inteligente** — el banner accionable de la Home (Free ve un mensaje genérico).
9. **Exportar a JSON** (CSV/PDF en cuanto estén implementados; ver roadmap).
10. **Soporte por email** con respuesta en 48 h.

### Razonamiento del precio
- Competencia indie consumer (España): 2-4 €/mes para apps similares (Spendee 1,99, Money Lover 2,99, Wallet by BudgetBakers 3,49).
- Apps con conexión bancaria automática (Bilance, Fintonic) son gratis pero monetizan datos. Nosotros NO, lo que justifica precio bajo pero existente.
- **2,99 €/mes** maximiza conversión sin parecer "barata". El **anual a 19,99 €** equivale a 1,66 €/mes (ahorro 44%) → presión sana hacia el anual, que mejora retención.
- *Compara con un café al mes.* Mensaje suave pero efectivo.

---

## 3. Add-ons activos en v1

### 💎 Lifetime Plus · 49,99 € (compra única)
Para early adopters y "compradores de un solo pago" alérgicos a las suscripciones.

- Equivale a ~2,5 años de Plus anual.
- No renueva, no expira: una vez activado, plan `plus` permanente
  (`source='lifetime'` en `user_entitlements`).
- **Producto Google Play**: `lifetime_plus` (one-time purchase, no subscription).
- Útil como **palanca de marketing** ("oferta de lanzamiento") con cantidad limitada
  o ventana temporal cerrada.

### Add-ons descartados del brief original
- ❌ **Pack de temas/íconos**: bajo ARPU, distrae del core, posponer indefinidamente.
- ❌ **Reportes automáticos por email**: requiere cron, plantillas, infra de envío
  y baja la calidad percibida si solo es un email mensual. Mejor "Notificaciones inteligentes"
  (ver roadmap), gratis para Plus.

---

## 4. Planes en cola (NO vender hasta que existan)

Estos planes **están definidos en BD** (`plans` tiene los 4 codes) pero **no deben
aparecer en el Paywall** hasta tener sus features reales. Si alguien los compra hoy,
no recibe nada distinto a Plus → reembolso garantizado.

### 👨‍👩‍👧 Familia · 5,99 €/mes · 39,99 €/año *(estimado)*
**Bloqueado por**: no existe multi-perfil ni invitaciones.

Cuando exista, ofrecerá:
- Todo lo de Plus.
- Hasta **5 perfiles** con su propia cuenta vinculada al perfil titular.
- Metas y presupuestos **compartidos** (visibles para todos).
- Vista agrupada del balance familiar + por miembro.

**Hitos previos** (ver roadmap):
1. Tabla `family_members` poblada y endpoints CRUD.
2. Pantalla de "Familia" con invitaciones por email.
3. Permisos por miembro (lectura / contribuir / admin).
4. Soporte en analítica de filtrado por miembro o agrupado.

### 💼 Pro Freelance · 7,99 €/mes · 59,99 €/año *(estimado)*
**Bloqueado por**: no existe módulo fiscal.

Cuando exista, ofrecerá:
- Todo lo de Plus.
- **Etiquetas fiscales** en transacciones (IVA 21/10/4%, IRPF, deducible/no, etc.).
- **Reportes trimestrales** automáticos para 303 e ingresos/gastos por trimestre.
- **Export específico para gestor** (CSV con columnas fiscales y resumen).

**Hitos previos** (ver roadmap):
1. Campo `tax_metadata` en transacciones o tabla `transaction_tax_tags`.
2. Lógica de cálculo por trimestre.
3. Pantalla de "Reportes fiscales".
4. Export CSV con esquema validado.

---

## 5. Mapeo a `user_entitlements` (lo que ya hay en backend)

| `plan_code` | Existe en BD | Vendible en v1 | Notas |
|---|---|---|---|
| `free` | ✅ | (no se vende) | Por defecto si no hay fila activa. |
| `plus` | ✅ | ✅ | Plan estrella. |
| `family` | ✅ | ❌ | Solo activable manualmente para early testers. |
| `pro_freelance` | ✅ | ❌ | Solo activable manualmente para early testers. |

`source` posibles: `early_adopter` (backfill), `manual` (admin), `stripe` (aplazado),
`revenuecat` (subs Play), `lifetime` (compra única).

---

## 6. Implementación pendiente para alinear código con esta propuesta

**Frontend** (`src/screens/main/PaywallScreen.tsx`):
- Quitar las cards "Familia" y "Pro Freelance" del paywall **o** mostrarlas
  como "Próximamente" con CTA deshabilitado + enlace "Avísame cuando salga".
- Ajustar precio de Plus a **2,99 €/mes · 19,99 €/año** en los placeholders y
  asegurar que se sobrescribe con las offerings reales de RevenueCat.
- Añadir tarjeta de **Lifetime Plus** (49,99 € one-time) con CTA propio.

**Backend** (`backend/index.php`):
- `getUserEntitlements` ya soporta `lifetime` vía `source`. Confirmar que el
  webhook de RevenueCat (cuando se monte) gestiona `NON_RENEWING_PURCHASE` para
  el producto `lifetime_plus`.
- Revisar `limits_json` y `features_json` de los planes en `plans`:
  - `family.features.family_mode = true` debe **no** activar ninguna feature
    real hasta que esté implementada. Conservar como documental.
  - `pro_freelance.features.fiscal_reports = true` igual.
  - Eliminar `cloud_backup` y `web_access` de las feature flags activas (no son
    productos diferenciados — la app YA guarda en backend y la web no existe
    como producto pagable). Mantener si queremos mostrar como "incluido en Plus"
    en marketing, pero **no como gating**.

**RevenueCat** (Dashboard):
- Productos a crear en Google Play y mapear en RC:
  - `plus_monthly` — subscription 2,99 €/mes.
  - `plus_annual` — subscription 19,99 €/año.
  - `lifetime_plus` — one-time 49,99 €.
- **Offering "default"** con 3 packages: `$rc_monthly`, `$rc_annual`, `lifetime`.
- Entitlement único en RC: `plus` (asociado a los 3 productos).
- Webhook RC → `/billing/webhook/revenuecat` (cuando se monte) que actualiza
  `user_entitlements` con `source='revenuecat'` o `source='lifetime'`.

**Frontend `useBillingStore`**: ya devuelve `hasFeature` por feature_json del plan
del usuario. No requiere cambios si limpio el `features_json` del plan free para
quitar las flags que no son productos reales.

---

## 7. Gating en pantallas (qué bloquea Plus realmente)

| Pantalla / sección | Feature flag | Estado |
|---|---|---|
| Movimientos · número máximo | `limits.recurring`, `goals`, `budgets`, `custom_categories` | ✅ Backend valida; front captura 403 y abre Paywall |
| Analítica · Forecast/Proyección | `advanced_analytics` | ✅ `PremiumLock` en `AnalyticsScreen` |
| Analítica · Hábitos de gasto | `advanced_analytics` | ⏳ Aplicar `PremiumLock` en `SpendingHabits` |
| Analítica · Comparativa mensual | `advanced_analytics` | ⏳ Aplicar `PremiumLock` |
| Analítica · Métodos de pago detallados | `advanced_analytics` | ⏳ Aplicar `PremiumLock` |
| Inversiones · Calculadora | `investments` (nueva flag) | ⏳ Añadir flag y gate |
| Ajustes · Exportar mis datos | `export` | ✅ Captura y abre Paywall |
| Movimientos · Historial > 3 meses | `unlimited_history` (nueva flag) | ⏳ Limitar `from` en queries para free |
| Insight banner Home | `advanced_analytics` | ⏳ Versión "básica" para free, "avanzada" para Plus |

> Las que están "⏳" son cambios pequeños que se harán cuando activemos el bloqueo
> en producción. Hoy todos los usuarios reales son `early_adopter` Plus, así que
> nadie ve los locks aún.

---

## 8. UX del Paywall (lo que el usuario ve)

- **2 tarjetas** en v1 (Gratis + Plus) + sección "Próximamente" con Familia y Pro deshabilitadas y CTA "Avísame".
- **Selector mensual / anual** preseleccionado en anual (mejor LTV).
- **Tarjeta de Lifetime** abajo con tono "oferta de lanzamiento".
- **Banner "Eres early adopter"** verde si `source='early_adopter'`: "Tienes
  Plus gratis de por vida" + agradecimiento.
- **Restaurar compras** visible y funcional (RevenueCat lo gestiona).
- **Garantía visible**: "Cancela cuando quieras". Play lo gestiona pero comunicarlo es clave.
- **Aviso de precios provisionales** mientras no haya offerings reales en RC.
- **Política de privacidad y términos** linkados desde el pie del paywall (requisito Play).

---

## 9. Aceptación

Antes de publicar el paywall:

- [ ] `npx tsc --noEmit` limpio.
- [ ] Solo se ofrecen Gratis + Plus + Lifetime. Familia y Pro como "próximamente".
- [ ] Los límites Free se respetan en frontend Y backend (ya está para 4 entidades).
- [ ] Restaurar compras funciona en build real.
- [ ] Precios reales de RC se sobreescriben sobre los placeholders.
- [ ] Política de privacidad linkable desde el paywall.
- [ ] `useBillingStore.hasFeature()` devuelve resultados coherentes con `plans` actualizada.
- [ ] No se rompe `/analytics/all` ni el throttle de 30 s.
- [ ] El "Eres early adopter" se muestra correctamente para usuarios pre-migración.

---

## 10. Métricas a seguir (post-publicación)

| Evento | Fuente | Para qué |
|---|---|---|
| `paywall_viewed` | front (`track()`) | Tráfico al paywall |
| `upgrade_clicked` | front | Intención de pago por plan/ciclo |
| `purchase_started` | front | Llegada al diálogo Play |
| `purchase_success` | front + RC webhook | Conversión |
| `purchase_failed` | front | Errores reales |
| `plan_limit_reached` | front (al recibir 403) | Qué límite genera más fricción |
| Distribución de planes | backend `user_entitlements` | Mix de cartera |
| Churn / refunds | RC dashboard | Salud del producto |
| Conversion rate Free → Plus | RC + backend | KPI principal |

El `track()` ya está enchufado como no-op en DEV; en Fase 2.1 se conecta a un
provider real (Amplitude / PostHog / Firebase).

---

## 11. Margen de maniobra

Puedes ajustar:
- **Precios** (avisando al jefe). Mover Plus a 3,49 mensual / 24,99 anual si la
  competencia se mueve, sin tocar arquitectura.
- **Granularidad de feature flags**: subdividir `advanced_analytics` en
  `forecast`, `habits`, `comparison`, `payment_methods` si queremos vender
  paquetes intermedios en el futuro.
- **Textos del paywall**: el `marketing-expert` puede iterar copy A/B sin tocar
  el motor.

NO ajustar sin preguntar:
- Modelo de planes (añadir/quitar planes a v1).
- Backfill de early adopters.
- Política de cancelación / reembolso (cumplir lo que dice Play).
