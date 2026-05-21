# ChillPocket — Mapa del frontend

## Navegación (`src/navigation/`)
- `RootNavigator.tsx`: gate de auth. Si `token` → `AppNavigator` (+ `OnboardingHost`), si no → `AuthNavigator`.
  Crea `NavigationContainer` con `navigationRef` (para navegar desde fuera de pantallas, p.ej. el onboarding).
- `AppNavigator.tsx`: Stack nativo. Pantalla `Tabs` (bottom tabs: **Home, Movimientos, Analítica, Más**) +
  pantallas apiladas (Recurring, Goals, Categories, Settings, Budgets, Investments). La pestaña "Más" es un hub.
- `FloatingTabBar.tsx`: barra inferior premium (móvil/tablet). Cada botón registra un objetivo de spotlight
  (`tab-Home`, ...) para el onboarding. **En desktop (`isDesktop`) se oculta** (`tabBar={()=>null}`).
- `AppSidebar.tsx`: barra lateral persistente en desktop (≥960px). Expone TODAS las secciones (tabs + rutas de
  stack) y Ajustes; navega vía `navigationRef` (`navigateToTab`/`navigateToRoute`) y marca el item activo con
  `useActiveRouteName()`. `AppNavigator` envuelve el stack en `Row > [AppSidebar?] + Stack` (estructura estable
  para no remontar al redimensionar). `ResponsiveGrid` es un grid reutilizable que reorganiza Cards por breakpoint.
- `navigationRef.ts`: `navigationRef` + `navigateToTab(name)`.

## Stores (zustand, `src/store/`)
- `useAuthStore`: `user, token`, `login/register/loginWithGoogle/logout/bootstrap`. Persiste token+user en
  AsyncStorage con parseo tolerante (`safeParseUser`). `loginWithGoogle` lanza el onboarding si `is_new`.
- `useDataStore`: **fuente central de datos**. Categorías, transacciones, recurrentes, metas, presupuestos y
  analítica. Throttle de **30s** (`STALE_MS`) con `fresh()`; cada fetcher acepta `force`. `fetchAnalytics` usa
  `/analytics/all`. `refreshAll(force)` recarga todo. Las mutaciones llaman `refreshAll(true)`.
- `usePreferencesStore`: últimas elecciones (categoría/método de pago) + `goal`/`incomeFrequency` del onboarding.
- `useOnboardingStore`: ver sección onboarding.

## API (`src/api/`)
- `http.ts`: instancia axios, base URL de `EXPO_PUBLIC_API_URL`, inyecta el JWT, maneja 401 (handler que hace logout),
  `apiError(e, fallback)` para mensajes. `TOKEN_KEY`.
- `endpoints.ts`: objeto por dominio (`authApi, categoriesApi, transactionsApi, recurringApi, goalsApi, budgetsApi,
  analyticsApi`). **Contrato exacto request/response.** Usa esto como verdad para llamadas.
- `types.ts`: todos los tipos compartidos.

## Pantallas (`src/screens/`)
- `auth/LoginScreen`, `auth/RegisterScreen` (registro NO pide moneda; se elige en onboarding).
- `main/DashboardScreen` (Home): header (saludo + selector de mes + botón logo→Ajustes), `BalanceHero`
  (saldo del mes, ojo para ocultar, ingresos/gastos/libre), 2 `KPICard` con sparkline, gráfica 7 días con
  segmentado, "Recientes". Columna responsive (`useContentWidth`).
- `main/AnalyticsScreen`: header con mes, dos delta-cards con sparkline de fondo, **DonutChart** de gastos por
  categoría con leyenda + flechas de periodo, "Proyección mensual" (gradiente + forecast), comparativa mensual
  (barras), ingresos vs gastos (línea), `SpendingHabits` (heatmap), métodos de pago, presupuestos (barra con gradiente).
- `main/TransactionsScreen`: lista + filtros/búsqueda. `main/RecurringScreen`, `GoalsScreen`, `BudgetsScreen`,
  `InvestmentsScreen` (interés compuesto), `CategoriesScreen`, `SettingsScreen` (nombre, contraseña, tema, export,
  "Ver tutorial de nuevo", logout).
- `modals/`: `TransactionSheet` (crea/edita; acepta `prefill`), `RecurringSheet` (acepta `prefill`), `GoalSheet`.

## Componentes clave (`src/components/`)
- Base: `Text` (variants/tones), `Card`, `Button`, `Input`, `Sheet`, `SegmentedControl`, `ProgressBar`, `Toast`,
  `Skeleton`, `EmptyState`, `ErrorBoundary`.
- Datos/visual: `BalanceHero`, `KPICard`, `DonutChart` (SVG), `Sparkline` (SVG), `TransactionRow`
  (icono circular por categoría vía `categoryIcon`), `SpendingHabits`, `GradientCard`, `BrandLogo`, `FAB`.
- Google: `GoogleButton.tsx` (web, `expo-auth-session`) y `GoogleButton.native.tsx` (`@react-native-google-signin`)
  — resueltos por plataforma por Metro. `GoogleButtonView` es la parte presentacional.

## Tema y responsive (`src/theme/`)
- `colors.ts`: `lightPalette` (pastel) y `darkPalette` (sobrio). Degradados: `gradientHero, gradientApp,
  gradientAccent, gradientBalance` (hero saldo vibrante), `gradientFab`.
- `spacing.ts`: `spacing`, `radius`, `fontSize`, `fontWeight`.
- `layout.ts`: sistema responsive. `useBreakpoint()` → `{ bp:'sm'|'md'|'lg', isLg, isDesktop, width }`
  (sm <600, md 600–959, lg ≥960). `useContentWidth()` devuelve el ancho útil del contenido (en desktop =
  ventana − `SIDEBAR_WIDTH`, acotado a `DESKTOP_CONTENT_MAX`) + `columnStyle` (columna centrada). Úsalo para
  anchos de gráficas. La app **reorganiza** (no estira): en desktop hay sidebar + grids de 2 columnas.
- `ThemeProvider`: `useTheme()` → `{ palette, mode, preference, setPreference }`.

## Onboarding (`src/onboarding/`)
- `OnboardingHost`: orquesta fases welcome → personalize (5 pasos) → createExpense → createRecurringExpense →
  createIncome → tour → success. Pantallas completas para welcome/personalize/success; **spotlight** para el resto.
- `SpotlightOverlay`: oscurece la pantalla, recorta el elemento resaltado y muestra tooltip + controles.
- `useSpotlightTarget(id)`: registra (mide en ventana) un elemento como objetivo. Usado por `FAB` y los tabs.
- Se dispara solo para **nuevos usuarios** (registro email o Google con `is_new`). Persistido; replay desde Ajustes.

## Reglas de oro del frontend
- Tipa todo; ejecuta `npx tsc --noEmit` antes de dar nada por hecho. No hay test runner aún.
- No multipliques llamadas HTTP (cuota MySQL). Pasa por `useDataStore`; respeta el throttle.
- Cuida web y nativo. Usa los componentes del design system; no hardcodees colores (usa `palette`).
- Referencia ficheros como rutas clicables `src/...:línea`.
