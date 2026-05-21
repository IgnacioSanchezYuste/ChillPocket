
Debeis implementar el sistema de monetización completo descrito abajo, **end‑to‑end**, sin cambios destructivos y respetando las reglas del proyecto (Hostinger 500 conexiones/h, TypeScript estricto, design system, sin hardcode de colores, etc.). Puedes tomar decisiones razonables si algo no está definido, pero debes documentarlas y **preguntar** si afectan al producto o al pricing.

## 1. Objetivo
Implementar un **freemium** con planes **Gratis, Plus, Familia, Pro Freelance**, add‑ons, y pagos en:
- **iOS/Android** con **RevenueCat** (IAP)
- **Web** con **Stripe Billing**

Debe existir un **sistema de entitlements** consistente y seguro, sincronizado en backend mediante webhooks. Las funciones premium se deben **bloquear** de forma fiable en frontend y **validar** también en backend donde aplique.

## 2. Planes y límites (definición estricta)
Implementa **exactamente** estos planes y límites:

**Gratis**
- 2 presupuestos
- 2 metas de ahorro
- 1 recurrente
- 8 categorías personalizadas
- historial 3 meses
- analítica básica del mes
- sin exportar
- sin web

**Plus**
- historial ilimitado
- analítica avanzada (tendencias, métodos de pago, comparativas, proyección)
- export CSV/PDF
- categorías y presupuestos ilimitados
- acceso web
- backup en nube (si no existe, simular como “incluido” con etiqueta y prepara endpoint para futuro)

**Familia**
- todo Plus
- hasta 5 perfiles
- metas compartidas y presupuestos por miembro (si aún no existe multi‑perfil, crea “modo familia” con vista agrupada y deja el resto en backlog con flag visible)

**Pro Freelance**
- todo Plus
- etiquetas fiscales + reportes trimestrales
- export para gestor (CSV con columnas fiscales)

**Add‑ons**
- Lifetime (1 usuario Plus) promo
- Pack de temas/íconos
- Reportes automáticos (email mensual)

## 3. Arquitectura técnica (obligatoria)
- **iOS/Android**: RevenueCat SDK
- **Web**: Stripe Billing + Checkout + Customer Portal
- **Entitlements**: tabla `user_entitlements` en MySQL
- **Webhooks**:
  - `/billing/webhook/stripe`
  - `/billing/webhook/revenuecat`
- **Feature flags** (opcional): Firebase Remote Config o LaunchDarkly, pero solo si aporta. Si no, usa flags en backend.

## 4. Backend (Slim/PHP) — cambios exactos
**A. DB (idempotente en `backend/update.sql`)**
Crea tablas:
1. `plans` (id, code, name, is_active, limits_json, created_at)
2. `user_entitlements` (user_id, plan_code, is_active, source, expires_at, features_json, updated_at)
3. `billing_events` (id, provider, event_type, payload_json, received_at) para auditoría
4. `family_members` (family_owner_id, member_user_id, role, created_at) — si activas Familia real
5. `export_jobs` (id, user_id, type, status, file_url, created_at) si haces export async

**B. Endpoints nuevos**
- `GET /me` debe incluir `plan_code`, `entitlements`, `limits`, `is_web_allowed`
- `GET /billing/entitlements` (cacheado) si no quieres cargarlo en /me
- `POST /billing/create-checkout-session` (Stripe) → URL
- `GET /billing/portal` (Stripe) → portal URL
- `POST /billing/webhook/stripe` (verificar firma)
- `POST /billing/webhook/revenuecat` (validar secret)
- `POST /billing/claim-lifetime` (si implementas cupón/clave)

**C. Seguridad**
- Verifica firmas de webhooks
- No filtrar datos sensibles en errores
- Todas las queries filtradas por `user_id`
- Respuestas JSON limpias

**D. Reglas de límites**
Antes de crear:
- presupuesto/metas/recurrentes/categorías: verificar límites del plan en backend.  
Si supera → `403` con mensaje claro `"plan_limit_reached"`

## 5. Frontend (Expo/React Native) — cambios exactos
**A. Estado**
- Añadir `useBillingStore` o extender `useAuthStore` con:
  - `plan`, `entitlements`, `limits`, `hasFeature(feature)`
  - `refreshEntitlements()`

**B. Paywall y gestión**
Crear pantallas:
1. `PaywallScreen`  
   - Lista de beneficios por plan  
   - CTA “Probar Plus” o “Elegir plan”  
   - Precios dinámicos (RevenueCat en mobile, Stripe en web)  
   - Diseño con `Card`, `Button`, `Text`, `palette`  
2. `ManageSubscriptionScreen`  
   - Ver plan actual  
   - Botón “Gestionar suscripción”  
3. `PricingWebScreen` (solo web)  
   - Tabla comparativa  
   - CTA Stripe Checkout

**C. Gating UX**
- Si usuario excede límites → abrir `PaywallScreen`
- En cada feature premium (analytics avanzados, export, web access, etc.):
  - Mostrar banner + botón upgrade
  - Bloquear acción con explicación clara

**D. Flujos**
- **Mobile**: RevenueCat `getOfferings()`, `purchasePackage()`, `restorePurchases()`
- **Web**: botón “Suscribirse” → backend `create-checkout-session` → Stripe Checkout

## 6. Web (Next.js opcional)
Si decides implementar landing:
- Reutiliza branding
- Comparativa de planes y CTA
- Login vía token JWT (si tienes tiempo) o redirige a app

## 7. Eventos y analítica
Registra eventos en frontend:
- `paywall_viewed`, `upgrade_clicked`, `purchase_success`, `purchase_failed`
- `plan_limit_reached`

Backend: guardar `billing_events` desde webhooks.

## 8. Documentación
Actualiza:
- `.claude/knowledge/app-overview.md` (planes, monetización)
- `README.md` con variables de entorno necesarias

## 9. Variables de entorno
Frontend (Expo):
- `EXPO_PUBLIC_REVENUECAT_API_KEY`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_API_URL`

Backend:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `REVENUECAT_WEBHOOK_SECRET`

## 10. UX de pantallas de pago (específico)
- Paywall con 3 tarjetas (Plus, Familia, Pro) y selector anual/mensual
- Default preseleccionado: Plus anual
- Mostrar ahorro porcentual anual
- Garantía “cancelar cuando quieras”
- Botón “Restaurar compras” en iOS/Android

## 11. Aceptación
- Los límites gratuitos se respetan en frontend y backend
- Entitlements actualizados por webhook
- Paywall funcional en web y móvil
- No se rompe `/analytics/all` ni throttle
- `npx tsc --noEmit` limpio

## 12. Margen de maniobra
Puedes:
- Ajustar estructura exacta de tablas si mantienes las columnas necesarias
- Cambiar textos UI si mantienes intención comercial
- Elegir librerías de UI internas existentes
Si hay duda crítica (precios, trials, límite exacto, familia real vs simbólico), **pregunta primero**.

---
