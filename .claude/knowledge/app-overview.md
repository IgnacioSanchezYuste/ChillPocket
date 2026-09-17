# ChillPocket — Visión general de la app

> Punto de partida para cualquier sesión o agente. Detalle en los demás documentos de `knowledge/`:
> `conventions.md` (reglas) · `data-model.md` · `backend-api.md` · `frontend-map.md` · `app-features.md` (producto).

## Qué es
**ChillPocket** es una app de finanzas personales (Android publicado en Play; web funcional sin despliegue público;
iOS preparado sin build). Registra ingresos y gastos por categorías, recurrentes (suscripciones, nómina),
presupuestos, metas de ahorro (modelo "sobre"), un **modelo dual "Saldo del mes / Mis ahorros"** con periodo
financiero por día de cobro, analítica avanzada, patrimonio, calculadora de inversiones, exportación CSV/PDF,
fotos de recibos y bloqueo con PIN/biometría. Modelo **freemium** (Gratis / Plus; Familia y Pro Freelance aún sin
funcionalidad propia).

## Stack
- **Frontend**: Expo SDK 54, React Native 0.81.5 (New Architecture), React 19.1, TypeScript estricto.
  Web con `react-native-web`.
  - Navegación `@react-navigation` (native-stack + bottom-tabs) · estado `zustand` · red `axios`.
  - Gráficas `react-native-chart-kit` + SVG propios · degradados `expo-linear-gradient`.
  - Nativo: `expo-secure-store`, `expo-local-authentication`, `expo-image-picker`, `expo-print`, `expo-sharing`,
    `expo-file-system`, `expo-haptics`, `react-native-purchases` (RevenueCat), `@react-native-google-signin`.
    **No funciona en Expo Go**: hace falta el dev client (`expo-dev-client`).
- **Backend**: PHP + **Slim 4** en un único fichero (`backend/index.php`), PDO sobre MySQL/MariaDB, JWT
  (`firebase/php-jwt`, 7 días). CORS y rewrite en `backend/.htaccess`.
  - Hosting **Hostinger** compartido → límite duro de **500 conexiones MySQL/hora**.
- **DB**: MariaDB (producción: **11.8**; XAMPP local: 10.4). Esquema base `backend/u204231532_Finanzas.sql` (desactualizado) + migraciones
  idempotentes en `backend/update.sql`.
- **Tests**: Jest (`jest-expo`) sobre la lógica pura de `src/utils/`.

## Estructura del repositorio
```
App.tsx              Entrada: providers, hidratación de seguridad, RevenueCat
src/
  api/               http.ts (axios + JWT + 401/403), endpoints.ts (contratos), types.ts, googleConfig.ts
  billing/           purchases.ts (RevenueCat)
  components/        design system + componentes de datos (algunos con variante .web/.native)
  hooks/             useCountUp, useGoogleAuth, useCooldown, useFinancialProfileSync
  navigation/        RootNavigator (auth + lock), AppNavigator (tabs + stack + hub "Más"), AuthNavigator
  onboarding/        OnboardingHost, SpotlightOverlay, useSpotlightTarget
  screens/           auth/ (Login, Register, ForgotPassword, Lock) · main/ (12 pantallas) · modals/ (7 sheets)
  store/             useAuth, useData, usePreferences, useOnboarding, useSecurity, useBilling
  theme/             colors, spacing, layout (responsive), ThemeProvider
  utils/             lógica pura con tests en __tests__/ + helpers de plataforma
backend/
  index.php          TODA la API
  .htaccess          CORS + rewrite
  update.sql         migraciones idempotentes (§5–§13), re-ejecutable entero
  Images/.htaccess   bloquea el acceso directo a los recibos subidos
  Logger.php         appConfig() + logs en ficheros (backend/logs/, semanales)
  Mailer.php         cliente SMTP propio (correos de verificación y recuperación)
  logs/              logs de la API (solo se versiona su .htaccess)
  Conexion.php       credenciales PDO, JWT y SMTP — SOLO en el servidor, nunca en el repo (está en .gitignore)
docs/                privacy-policy.html, screenshots
.claude/             sistema de agentes (ver .claude/README.md)
comandos.txt         comandos de ejecución, build y despliegue listos para copiar
```

## Cómo ejecutar
Todos los comandos están en `comandos.txt`. Los esenciales:
- `npx expo start -c --dev-client` (móvil con dev build) · `npx expo start -c --web` (web).
- `npm run check` = `tsc --noEmit` + Jest.
- Build: `eas build -p android --profile preview` (APK) / `--profile production` (AAB).
- Backend: SQL por phpMyAdmin y después FTP de los PHP cambiados (`index.php`, `Mailer.php`, `.htaccess`).

## Variables de entorno (frontend, prefijo `EXPO_PUBLIC_`)
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`,
`EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`. En local vienen de `.env` (no versionado; claves en `.env.example`);
en EAS, de `eas.json` por perfil. Backend (en `Conexion.php` o variables de entorno): credenciales PDO, `JWT_SECRET`,
`REVENUECAT_WEBHOOK_AUTH`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME`,
`ADMIN_EMAILS` y, opcionales, `LOG_ROTATION`, `LOG_KEEP`, `LOG_LEVEL`, `LOG_TIMEZONE`.

## Restricciones que condicionan todo
1. **500 conexiones MySQL/hora** → `GET /analytics/all` (1 petición en vez de 7), throttle de 30 s en el store,
   sin polling.
2. **Sin cron** → recurrentes y cierres de periodo se generan de forma perezosa en cada petición autenticada.
3. **Multiplataforma** → ficheros `*.native.tsx` / `*.web.tsx`; cuidar ambos.

## Monetización
- Planes en BD (`plans`) con `limits` y `features`; plan activo en `user_entitlements`. El backend los inyecta en
  `user` (`plan_code, limits, features, is_premium…`); el front los lee con `useBilling()`.
- **Gating real** en el servidor: límites de creación, historial > 3 meses, exportación y recibos
  (403 `plan_limit_reached` → Paywall). En la UI, `PremiumLock` en las secciones avanzadas.
- Early adopters: Plus gratis de por vida (`source='early_adopter'`). El resto recibe al registrarse una fila base
  gratis (`source='manual'`); para cambiar un plan a mano se edita su `plan_id` (1 Gratis · 2 Plus · 3 Familia · 4 Pro).
- Comprar un plan exige el email verificado (código por correo). El resto de la app no lo exige.
- RevenueCat conectado (SDK + webhook). Pendiente: productos y offering en Play/RevenueCat.

## Identidad
Nombre **ChillPocket**. Pastel en claro, sobrio en oscuro, morado/azul violeta como acento. Logo en `assets/`.
