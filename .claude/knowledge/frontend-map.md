# ChillPocket — Mapa del frontend

## Arranque (`App.tsx`)
Providers: GestureHandler, SafeArea, Theme, Toast, ErrorBoundary. Hidrata `useSecurityStore` e inicializa
RevenueCat (`src/billing/purchases.ts`). Un listener de `AppState` vuelve a bloquear la app tras
`LOCK_BACKGROUND_GRACE_MS` (5 min) en segundo plano.

## Navegación (`src/navigation/`)
- `RootNavigator.tsx`: control de acceso. Con `token` → `AppNavigator` + `OnboardingHost` (+ `LockScreen` encima
  si el bloqueo está activo); sin token → `AuthNavigator` (Login, Register). Crea el `NavigationContainer` con
  `navigationRef`.
- `AppNavigator.tsx`: stack nativo.
  - `Tabs`: **Home** (Dashboard), **Movimientos**, **Analítica**, **Más** (`MoreScreen`, hub definido en este mismo fichero).
  - Rutas apiladas: `Recurring, Goals, Categories, Settings, Budgets, Investments, NetWorth, Paywall, DayDetail`.
  - Estructura `Row > [AppSidebar?] + Stack` estable para no remontar al redimensionar.
- `FloatingTabBar.tsx`: barra inferior (móvil/tablet); cada botón registra un objetivo de spotlight (`tab-Home`…).
  En desktop se oculta.
- `AppSidebar.tsx` (componente): barra lateral en desktop (≥ 960 px) con todas las secciones; navega con
  `navigateToTab` / `navigateToRoute` y marca el activo con `useActiveRouteName()`.
- `navigationRef.ts`: `navigationRef`, `navigateToTab(name)`.

## Stores (zustand, `src/store/`)
| Store | Responsabilidad |
|---|---|
| `useAuthStore` | `user, token`, `login/register/loginWithGoogle/logout/bootstrap`. Token en `secureStorage`; user con `safeParseUser`. `loginWithGoogle` lanza el onboarding si `is_new`. |
| `useDataStore` | **Fuente central de datos**: categorías, transacciones, recurrentes, metas, presupuestos, analítica. Throttle `STALE_MS = 30 s`; cada fetch acepta `force`; `refreshAll(force)`. Flags `{analytics,goals,recurring,budgets,…}{Loading,Error}`. `balanceMode: 'month' \| 'historical'` (por sesión) + `setBalanceMode`. `fetchAnalytics` usa `/analytics/all`. |
| `usePreferencesStore` | Últimas elecciones (categoría, método de pago), datos del onboarding (`goal, incomeFrequency, incomeAmount, incomePayday, savingsGoalMonthly`) y `seenBalanceSwipeTooltip`. **Solo local** (ver bug en `backend-api.md`). |
| `useOnboardingStore` | Fase del tutorial, borrador de personalización e IDs de datos demo a borrar. |
| `useSecurityStore` | Bloqueo con PIN (4-6 dígitos) + biometría: `enabled, biometricEnabled, locked, hydrate, enable, disable, setPin…`. PIN en `secureStorage`. |
| `useBillingStore` | `useBilling()` → `plan, planName, isPremium, isEarlyAdopter, hasFeature(k), getLimit(k)`, leídos de `useAuthStore.user`. |

## API (`src/api/`)
- `http.ts`: axios con `EXPO_PUBLIC_API_URL`, inyecta el JWT, 401 → logout, 403 `plan_limit_reached` → Paywall,
  `apiError(e, fallback)`.
- `endpoints.ts`: `authApi, categoriesApi, transactionsApi (incl. exportCsv, uploadReceipt, deleteReceipt,
  getReceiptUrl), recurringApi, goalsApi (contribute con scope), budgetsApi, analyticsApi`. **Contrato exacto.**
- `types.ts`: tipos compartidos (`Transaction`, `Recurring`, `AnalyticsSummary`, `SavingsGoalStats`, `PlanLimits`, `PlanFeatures`, `User`…).
- `googleConfig.ts`: client IDs de Google por plataforma.

## Pantallas (`src/screens/`)
- `auth/`: `LoginScreen`, `RegisterScreen` (la moneda se elige en el onboarding), `LockScreen` (PIN + biometría).
- `main/`:
  - `DashboardScreen` (Home): cabecera con mes, `BalanceHero` dual (Saldo del mes ⇄ Mis ahorros), `InsightBanner`,
    `KPICard` con sparkline, gráfica de 7 días, "Recientes" filtrados por `balanceMode`.
  - `TransactionsScreen`: lista paginada (50) con scroll infinito, búsqueda con debounce, filtros básicos y
    avanzados (`TransactionFiltersSheet`), swipe para duplicar/borrar, filtro por `balanceMode`.
  - `AnalyticsScreen`: delta-cards, `DonutChart`, proyección, comparativa mensual, ingresos vs gastos,
    `SpendingHabits` (heatmap), métodos de pago, presupuestos, sección "Meta de ahorro". Secciones avanzadas tras `PremiumLock`.
  - `DayDetailScreen`: movimientos de un día (desde el heatmap), leídos del store.
  - `NetWorthScreen`: patrimonio (`net_total_historical`) con gráfica acumulada. Plus.
  - `RecurringScreen`, `GoalsScreen` (confetti al completar), `BudgetsScreen`, `CategoriesScreen`,
    `InvestmentsScreen` (interés compuesto, Plus), `PaywallScreen` (planes + RevenueCat),
    `SettingsScreen` (perfil, contraseña, tema, bloqueo, exportar CSV/PDF, ver tutorial, logout).
- `modals/`: `TransactionSheet` (crear/editar, `prefill`, selector de `scope`, foto de recibo),
  `RecurringSheet`, `GoalSheet` (aportar desde el mes o desde ahorros), `SecuritySetupSheet`.

## Componentes (`src/components/`)
- Base: `Text`, `Card`, `Button`, `Input`, `Sheet`, `SegmentedControl`, `ProgressBar`, `Toast`, `Skeleton`,
  `EmptyState`, `ErrorState`, `ErrorBoundary`, `ScreenHeader`, `ResponsiveGrid`.
- Datos/visual: `BalanceHero`, `KPICard`, `DonutChart`, `Sparkline`, `TransactionRow`,
  `SwipeableTransactionRow` (sin swipe en web), `SpendingHabits`, `InsightBanner`, `GradientCard`, `BrandLogo`,
  `FAB`, `Confetti`, `CategoryBadge`, `CategoryChip`.
- Selectores: `MonthPickerModal`, `DateRangePicker`, `TransactionFiltersSheet`.
- Plan: `PremiumLock` (banner o badge → Paywall).
- Por plataforma (Metro elige `.web`/`.native`; el `.tsx` base es el stub de tipos):
  `GoogleButton` (+ `GoogleButtonView`), `AuthImage` (web: fetch + blob; nativo: `Image` con cabeceras).

## Hooks y utilidades
- `src/hooks/`: `useCountUp` (animación de cifras), `useGoogleAuth`.
- `src/onboarding/`: `OnboardingHost` (welcome → personalize → createExpense → createRecurringExpense →
  createIncome → tour → success), `SpotlightOverlay`, `useSpotlightTarget(id)`. Solo para usuarios nuevos; se puede
  repetir desde Ajustes. Los datos demo se borran por IDs guardados (la nómina se conserva).
- `src/utils/`:
  - **Lógica pura con tests** (`__tests__/`): `financialPeriod` (periodo, fechas de recurrentes, fijos pendientes),
    `balanceMode` (filtro del modo dual), `validators`.
  - Resto: `format`, `categoryIcon`, `paymentMethods`, `exportHtml` (PDF), `analytics` (`track()`, sin envío),
    `confirm`, `secureStorage`, `biometric`, `googleSession(.native)`, `receiptPicker(.web/.native)`.
- `src/billing/purchases.ts`: RevenueCat (`initPurchases`, `identifyPurchases`, `getOfferingPackages`,
  `purchasePackageById`, `restorePurchases`) cargado con guardas para que web/Expo Go no rompan.

## Tema y responsive (`src/theme/`)
- `colors.ts`: `lightPalette` (pastel) y `darkPalette` (sobrio). Degradados `gradientHero, gradientApp,
  gradientAccent, gradientBalance, gradientFab`.
- `spacing.ts`: `spacing`, `radius`, `fontSize`, `fontWeight`.
- `layout.ts`: `useBreakpoint()` → `{ bp:'sm'|'md'|'lg', isLg, isDesktop, width }` (sm < 600, md 600–959,
  lg ≥ 960). `useContentWidth()` → ancho útil + `columnStyle`. La app **reorganiza** (sidebar + grids), no estira.
- `ThemeProvider.tsx`: `useTheme()` → `{ palette, mode, preference, setPreference }`.
