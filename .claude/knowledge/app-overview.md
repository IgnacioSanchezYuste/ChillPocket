# ChillPocket — Visión general de la app

> Documento de conocimiento compartido. **Todos los agentes deben leerlo antes de trabajar.**

## Qué es
**ChillPocket** es una app de gestión de finanzas personales (móvil iOS/Android + web). Permite registrar
ingresos y gastos, organizar por categorías, definir gastos/ingresos recurrentes (suscripciones, nómina),
presupuestos por categoría, metas de ahorro (modelo "sobre"/envelope), analítica avanzada (donut por
categoría, métodos de pago, tendencias, forecast) y una calculadora de inversiones (interés compuesto).

## Stack
- **Frontend**: Expo SDK 54, React Native 0.81.5, React 19.1.0, TypeScript. Web vía `react-native-web`.
  - Navegación: `@react-navigation` (native-stack + bottom-tabs).
  - Estado: `zustand` (stores en `src/store/`). Persistencia ligera con `@react-native-async-storage`.
  - Red: `axios` (`src/api/http.ts`), endpoints en `src/api/endpoints.ts`.
  - Gráficas: `react-native-chart-kit` + `react-native-svg` (sparklines/donut propios).
  - Estilo: design system propio en `src/theme/` + `src/components/`. `expo-linear-gradient` para degradados.
  - Auth Google: web = `expo-auth-session` (id_token implícito); nativo = `@react-native-google-signin`.
- **Backend**: PHP + **Slim Framework 4** (`backend/index.php`, un único archivo), PDO sobre **MySQL/MariaDB**.
  - JWT con `firebase/php-jwt` (expiración 7 días). CORS y rewrite en `backend/.htaccess`.
  - Hosting: **Hostinger** (compartido) → límite duro de **500 conexiones MySQL/hora** (clave para diseño).
- **DB**: MariaDB 10.3+. Esquema base en `backend/u204231532_Finanzas.sql`; migraciones idempotentes en `backend/update.sql`.

## Estructura del repositorio
```
App.tsx                      Entrada Expo (providers: GestureHandler, SafeArea, Theme, Toast, ErrorBoundary)
src/
  api/         http.ts (axios + JWT + handler 401), endpoints.ts (contratos), types.ts (tipos compartidos)
  components/  design system (Text, Card, Button, Input, FAB, BalanceHero, DonutChart, Sparkline, ...)
  navigation/  RootNavigator (auth gate), AppNavigator (tabs+stack), FloatingTabBar, navigationRef
  onboarding/  OnboardingHost, SpotlightOverlay, useSpotlightTarget (tutorial guiado con spotlight)
  screens/     auth/ (Login, Register), main/ (Dashboard, Transactions, Analytics, Recurring, Goals,
               Budgets, Investments, Categories, Settings), modals/ (TransactionSheet, RecurringSheet, GoalSheet)
  store/       useAuthStore, useDataStore, usePreferencesStore, useOnboardingStore
  theme/       colors (paletas light/dark), spacing, layout (responsive web), ThemeProvider
  utils/       format, validators, paymentMethods, categoryIcon, confirm, googleSession
backend/
  index.php    TODA la API (Slim). Helpers: verifyGoogleIdToken, expandRecurringTransactions, availableBalance...
  .htaccess    CORS + rewrite a index.php
  update.sql   migración idempotente 1.1.0
  Conexion.example.php   plantilla de credenciales PDO (la real es Conexion.php, NO versionada)
.claude/       Este sistema de agentes (equipo full-stack)
```

## Cómo ejecutar
- **Frontend**: `npx expo start -c` (web/Expo Go). Typecheck: `npx tsc --noEmit`. No hay aún test runner configurado.
- **Build nativo**: EAS (`eas build -p android --profile preview`). Variables `EXPO_PUBLIC_*` se inyectan en build (ver `eas.json`).
- **Backend**: se sube `index.php` + `.htaccess` por FTP a Hostinger; migraciones SQL por phpMyAdmin.

## Variables de entorno (frontend, prefijo `EXPO_PUBLIC_`)
- `EXPO_PUBLIC_API_URL` — base URL del backend.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` — OAuth Google.
- `.env` está en `.gitignore`; `.env.example` documenta las claves.

## Restricciones de diseño que condicionan TODO
1. **Hostinger 500 conexiones MySQL/hora.** Por eso existe `GET /analytics/all` (1 request en vez de 7) y
   el store tiene throttle de 30s. **No multipliques llamadas HTTP** sin motivo.
2. **Recurrentes se generan de forma perezosa** (lazy): al pedir datos se ejecuta `expandRecurringTransactions`,
   que inserta las transacciones que tocan con `INSERT ... ` idempotente gracias a la UNIQUE
   `(user_id, recurring_id, transaction_date)`. No hay cron.
3. **Multiplataforma**: hay archivos `*.native.tsx` / `*.web.tsx` resueltos por Metro. Cuida ambas plataformas.

## Identidad de marca / nombre
La app se llama **ChillPocket**. Tono pastel en claro, sobrio en oscuro. Logo en `assets/` (`adaptive-icon.png`).
