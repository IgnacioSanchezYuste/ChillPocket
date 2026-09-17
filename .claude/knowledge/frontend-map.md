# ChillPocket — Mapa del frontend

## Arranque (`App.tsx`)
Providers: GestureHandler, SafeArea, Theme, Toast, ErrorBoundary. Hidrata `useSecurityStore` e inicializa
RevenueCat (`src/billing/purchases.ts`). Un listener de `AppState` vuelve a bloquear la app tras
`LOCK_BACKGROUND_GRACE_MS` (5 min) en segundo plano. `initUsageTracking()` (`src/utils/analytics.ts`) cuenta la
apertura y envía los contadores de uso en lotes (ver "Monitoreo de uso").

## Navegación (`src/navigation/`)
- `RootNavigator.tsx`: control de acceso. Con `token` → `AppNavigator` + `OnboardingHost` (+ `LockScreen` encima
  si el bloqueo está activo); sin token → `AuthNavigator` (Login, Register, ForgotPassword; conmutador de estado,
  sin stack). Crea el `NavigationContainer` con `navigationRef` y monta `useFinancialProfileSync`.
  `onReady`/`onStateChange` cuentan `screen:<ruta>` (ruta más profunda, sin repetir); `AuthNavigator` cuenta
  `screen:login|register|forgotpassword` al cambiar de modo.
- `AppNavigator.tsx`: stack nativo.
  - `Tabs`: **Home** (Dashboard), **Movimientos**, **Analítica**, **Más** (`MoreScreen`, hub definido en este mismo fichero).
  - Rutas apiladas: `Recurring, Goals, Categories, Settings, Budgets, Investments, NetWorth, Paywall, DayDetail, Usage`
    (`Usage` = panel de administración).
  - Estructura `Row > [AppSidebar?] + Stack` estable para no remontar al redimensionar.
- `FloatingTabBar.tsx`: barra inferior (móvil/tablet); cada botón registra un objetivo de spotlight (`tab-Home`…).
  En desktop se oculta.
- `AppSidebar.tsx` (componente): barra lateral en desktop (≥ 960 px) con todas las secciones; navega con
  `navigateToTab` / `navigateToRoute` y marca el activo con `useActiveRouteName()`. Si `user.is_admin`, añade
  "Uso de la app" (`Usage`).
- `navigationRef.ts`: `navigationRef`, `navigateToTab(name)`.

## Stores (zustand, `src/store/`)
| Store | Responsabilidad |
|---|---|
| `useAuthStore` | `user, token`, `login/register/loginWithGoogle/resetPassword/logout/bootstrap/refreshUser`. Token en `secureStorage`; user con `safeParseUser`. `loginWithGoogle` lanza el onboarding si `is_new`. `logout` limpia datos y el perfil financiero local. |
| `useDataStore` | **Fuente central de datos**: categorías, transacciones, recurrentes, metas, presupuestos, analítica. Throttle `STALE_MS = 30 s`; cada fetch acepta `force`; `refreshAll(force)`. Flags `{analytics,goals,recurring,budgets,…}{Loading,Error}`. `balanceMode: 'month' \| 'historical'` (por sesión) + `setBalanceMode`. `fetchAnalytics` usa `/analytics/all`. |
| `usePreferencesStore` | Últimas elecciones (categoría, método de pago), perfil financiero (`goal, incomeFrequency, incomeAmount` tal cual —semanal si cobra semanal—, `incomePayday` —día del mes o de la semana—, `savingsGoalMonthly`) y `seenBalanceSwipeTooltip`. El perfil se sincroniza con el servidor (`useFinancialProfileSync`, `FinancialProfileSheet`, tutorial) y se borra al cerrar sesión. |
| `useOnboardingStore` | Fase del tutorial, borrador de personalización e IDs de datos demo a borrar. |
| `useSecurityStore` | Bloqueo con PIN (4-6 dígitos) + biometría: `enabled, biometricEnabled, locked, hydrate, enable, disable, setPin…`. PIN en `secureStorage`. |
| `useBillingStore` | `useBilling()` → `plan, planName, isPremium, isEarlyAdopter, hasFeature(k), getLimit(k)`, leídos de `useAuthStore.user`. |

## API (`src/api/`)
- `http.ts`: axios con `EXPO_PUBLIC_API_URL`, inyecta el JWT, 401 → logout, 403 `plan_limit_reached` → Paywall,
  `apiError(e, fallback)`.
- `endpoints.ts`: `authApi, categoriesApi, transactionsApi (incl. exportCsv, uploadReceipt, deleteReceipt,
  getReceiptUrl), recurringApi, goalsApi (contribute con scope), budgetsApi, analyticsApi, currencyApi (rate,
  convert), usageApi (send), adminApi (usage, mailTest)`. **Contrato exacto.**
- `types.ts`: tipos compartidos (`Transaction`, `Recurring`, `AnalyticsSummary`, `SavingsGoalStats`, `PlanLimits`, `PlanFeatures`, `User`…).
- `googleConfig.ts`: client IDs de Google por plataforma.

## Pantallas (`src/screens/`)
- `auth/`: `LoginScreen` (enlace "¿Olvidaste tu contraseña?"), `RegisterScreen` (la moneda se elige en el onboarding),
  `ForgotPasswordScreen` (usa `PasswordResetForm`; al terminar deja la sesión iniciada), `LockScreen` (PIN + biometría).
- `main/`:
  - `DashboardScreen` (Home): saludo, fila con selector de mes y `PlanBadge`, `BalanceHero` dual (Saldo del mes ⇄ Mis ahorros;
    en el mes actual con las cifras del periodo vía `monthBalanceFigures`), `InsightBanner`,
    `KPICard` con sparkline, gráfica de 7 días, "Recientes" filtrados por `balanceMode`.
  - `TransactionsScreen`: lista paginada (50) con scroll infinito, búsqueda con debounce, filtros básicos y
    avanzados (`TransactionFiltersSheet`), swipe para duplicar/borrar, filtro por `balanceMode`.
  - `AnalyticsScreen`: delta-cards, `DonutChart`, proyección, comparativa mensual, ingresos vs gastos,
    `SpendingHabits` (heatmap), métodos de pago, presupuestos, sección "Meta de ahorro". Secciones avanzadas tras `PremiumLock`.
  - `DayDetailScreen`: movimientos de un día (desde el heatmap), leídos del store.
  - `NetWorthScreen`: patrimonio (`net_total_historical`) con gráfica acumulada. Plus.
  - `RecurringScreen`, `GoalsScreen` (confetti al completar), `BudgetsScreen`, `CategoriesScreen`,
    `InvestmentsScreen` (interés compuesto, Plus), `PaywallScreen` (planes + RevenueCat; si el email no está
    verificado abre `VerifyEmailSheet` y continúa la compra al verificar),
    `SettingsScreen` (nombre, verificar email, contraseña —con enlace a recuperación por código—, "Ingresos y
    ahorro", moneda —abre `CurrencyChangeSheet`—, tema, bloqueo, plan, exportar CSV/PDF —errores dentro de la
    hoja; el CSV lleva BOM para Excel; el PDF pide hasta 500 movimientos en una sola petición, avisa si no están todos y en web
    se imprime desde un iframe oculto (`printHtmlOnWeb`: `expo-print` en web imprimiría la pantalla)—, ver tutorial, "Administración → Panel de uso" si `user.is_admin`, logout).
  - `UsageScreen` (ruta `Usage`, solo `user.is_admin`; si no, `EmptyState` y ninguna petición): periodo 7/30/90
    (`adminApi.usage`, una petición por periodo mientras la pantalla vive, sin polling; pull-to-refresh fuerza),
    resumen (usuarios, nuevos, activos, % verificados, planes), "Pantallas más vistas" / "Acciones más usadas"
    con barras, plataformas, aperturas diarias (`Sparkline`) y "Enviar correo de prueba" (`adminApi.mailTest`,
    muestra destinatario o el `message` SMTP y las claves `SMTP_*` que faltan).
- `modals/`: `TransactionSheet` (crear/editar, `prefill`, tipo de pago en cuadrícula 3×2 solo para gastos,
  foto de recibo; "Ver Plus" cierra el formulario antes de navegar; tercer botón "Ahorro" = transferencia
  Gastos ⇄ Ahorro con `savingsApi.transfer` y el disponible de cada saldo; una transferencia existente solo se borra;
  ya no hay selector de `scope`: todo va al saldo del mes),
  `RecurringSheet`, `GoalSheet` (aportar desde el mes o desde ahorros), `SecuritySetupSheet`,
  `VerifyEmailSheet` (código de 6 dígitos + reenviar), `PasswordResetSheet`, `FinancialProfileSheet`
  (frecuencia, ingreso, día de cobro con `WheelPicker`, objetivo; avisa si recalcula los cierres),
  `CurrencyChangeSheet` (cambio del BCE vía `currencyApi.rate`, ejemplo con "Mis ahorros", `currencyApi.convert`
  convierte todos los importes en el servidor; ante 409 `rate_changed` muestra el cambio nuevo; al terminar convierte
  también el perfil local y hace `refreshAll(true)`). La moneda ya no se cambia con `PUT /me` si hay datos
  (409 `currency_conversion_required`); el tutorial repetido la muestra bloqueada.
- Los `Sheet` son `Modal`: antes de navegar o abrir otro `Sheet`, cierra el actual (en iOS dos `Modal` a la vez
  fallan) y muestra los errores dentro del formulario (los toasts pueden quedar debajo).
- Accesibilidad multiplataforma: usa las props `aria-*` (`aria-checked`, `aria-selected`, `aria-valuetext`).
  react-native-web 0.21 ignora `accessibilityState`/`accessibilityValue`; RN 0.81 entiende ambas en nativo.
  (`AppSidebar`, `BalanceHero` y `FloatingTabBar` aún usan `accessibilityState`.)

## Componentes (`src/components/`)
- Base: `Text`, `Card`, `Button`, `Input`, `Sheet`, `SegmentedControl`, `ProgressBar`, `Toast`, `Skeleton`,
  `EmptyState`, `ErrorState`, `ErrorBoundary`, `ScreenHeader`, `ResponsiveGrid`.
- Datos/visual: `BalanceHero`, `KPICard`, `DonutChart`, `Sparkline`, `TransactionRow`,
  `SwipeableTransactionRow` (sin swipe en web), `SpendingHabits`, `InsightBanner`, `GradientCard`, `BrandLogo`,
  `FAB`, `Confetti`, `CategoryBadge`, `CategoryChip`.
- Selectores: `MonthPickerModal`, `DateRangePicker`, `TransactionFiltersSheet`.
- Plan: `PremiumLock` (banner o badge → Paywall; `onNavigate` para cerrar el Modal que lo contiene),
  `PlanBadge` (chip del plan en Inicio: neutro en Gratis; Plus y Familia con `gradientBalance` y texto blanco;
  Pro Freelance en contraste inverso; detalle "Early adopter").
- Formularios: `WheelPicker` (rueda vertical; confirma al pararse por cualquier vía, `nestedScrollEnabled`,
  accesible como `adjustable`), `PasswordResetForm` (pedir código → código + nueva contraseña).
- Por plataforma (Metro elige `.web`/`.native`; el `.tsx` base es el stub de tipos):
  `GoogleButton` (+ `GoogleButtonView`), `AuthImage` (web: fetch + blob; nativo: `Image` con cabeceras).

## Recordatorios locales (`src/notifications/reminders.ts`)
- `expo-notifications` (módulo nativo nuevo: requiere build EAS; carga protegida, en web no hace nada).
- Config en `src/config/reminders.ts` (`enabled`, `times` HH:MM, `days`, `messages`). Al abrir la app, volver a
  primer plano, cambiar la sesión o terminar el tutorial se cancelan y se programan de nuevo **desde mañana**
  (`reminderSlots`, con tests; máx. 60 por el límite de iOS), así que solo suenan los días sin abrir la app.
  Permiso: se pide la primera vez con sesión y fuera del tutorial. Al cerrar sesión solo se cancelan.
- Analítica → "Meta de ahorro": "Definir objetivo" y "Editar" abren `FinancialProfileSheet` (el objetivo es el
  ahorro automático mensual). El calendario de `SpendingHabits` usa celdas de 1/7 de ancho.

## Hooks y utilidades
- `src/hooks/`: `useCountUp` (animación de cifras), `useGoogleAuth`, `useCooldown` (cuenta atrás de "Reenviar"),
  `useFinancialProfileSync` (el servidor manda: si está vacío y el dispositivo tiene perfil, lo sube una vez por
  arranque; si no, cada cambio de `user` alinea el perfil local con `reconcileLocalProfile`, sin peticiones).
- `src/onboarding/`: `OnboardingHost` (welcome → personalize → createExpense → createRecurringExpense →
  createIncome → tour → success), `SpotlightOverlay`, `useSpotlightTarget(id)`. Solo para usuarios nuevos; se puede
  repetir desde Ajustes. Los datos demo se borran por IDs guardados (la nómina se conserva). Al terminar la
  personalización guarda el perfil también en el servidor (`serverFinancialProfile`). Con cobro semanal el importe y
  el objetivo se comparan en equivalente mensual.
- `src/utils/`:
  - **Lógica pura con tests** (`__tests__/`): `financialPeriod` (periodo, fechas de recurrentes, fijos pendientes,
    `monthlyIncome`, `periodPayday` —solo cobro mensual define periodo—, `serverFinancialProfile`,
    `nextIncomeDate` —próximo cobro mensual o semanal—, `currentPeriodStartFor`/`periodLengthDays` —espejo del
    servidor—, `reconcileLocalProfile`), `balanceMode` (filtro del modo dual y `monthBalanceFigures`), `validators`,
    `usageQueue` (claves, contadores por día, lotes y reglas de envío del monitoreo; tests en `analytics.test.ts`,
    que también prueba el runtime con red/sesión/AppState simulados), `usageReport` (nombres legibles de
    eventos y datos del panel de uso).
    `financialProfile.test.ts` compara la lógica del cliente con la de `backend/index.php`.
  - `paydayOptions` (`MONTH_DAYS` 1-28 + fin de mes, `WEEKDAYS`), `paymentMethods` (con `shortLabel`).
  - Resto: `format`, `categoryIcon`, `exportHtml` (PDF), `analytics` (monitoreo de uso, abajo),
    `confirm`, `secureStorage`, `biometric`, `googleSession(.native)`, `receiptPicker(.web/.native)`,
    `nativeModules` (`isMissingNativeModule` + `MISSING_NATIVE_MESSAGE`: los módulos nativos —file-system,
    print, sharing, image-picker— se cargan con `require` perezoso y, si la build instalada no los trae, se
    muestra "actualiza la app" en vez de romper).

## Monitoreo de uso (`src/utils/analytics.ts` + `usageQueue.ts`)
- `track(evento, dimensión | props?)` suma 1 a un contador del día (`evento` o `evento:dimension`, normalizado a
  `/^[a-z0-9_.:-]{1,64}$/`: minúsculas y sin tildes). Con props solo se usa la propiedad prevista por evento
  (`upgrade_clicked` → `feature`/`plan`, `purchase_*` → `plan`, `plan_limit_reached` → `entity`); nunca importes,
  textos libres, emails ni errores. Persistido en AsyncStorage `@chillpocket:usage` (parseo tolerante).
- Envío con `usageApi.send`: **una petición por disparador**, el día pendiente más antiguo (máx. 60 claves, cuentas
  topadas a 500; lo demás espera al siguiente disparador):
  al pasar a segundo plano; al arrancar / aparecer la sesión si quedan días anteriores; con ≥ 40 pendientes como
  mucho cada 5 min. Siempre: con sesión, ≥ 1 min entre intentos (fallidos incluidos), días de > 7 días descartados.
  Fallo de red/401 → se conserva hasta el siguiente disparador; 400/413/422 → se descarta el lote;
  403/404/405 → espera 6 h; 429/5xx → espera 15 min. `first_today` se recuerda por día y por usuario (id local).
- `app_open` al arrancar y al volver de segundo plano tras ≥ 30 s. Eventos: `screen:*`, `onboarding:start|finish|skip`
  (store), `transaction_created:expense|income` (no durante el tutorial), `transaction_updated|deleted|duplicated`,
  `receipt_uploaded`, `recurring_created` (no en el tutorial), `goal_created`, `goal_contribution`,
  `goal_withdrawal`, `budget_created`, `balance_mode:historical`, `filters_applied`, `search_used` (una vez hasta
  vaciar el buscador), `financial_profile_saved`, `email_verified`, `password_reset`, `export:csv|pdf`, y los de
  plan (`paywall_viewed`, `upgrade_clicked:*`, `purchase_*:<plan>`, `restore_purchases`). Traducciones del panel en
  `usageReport.USAGE_LABELS`.
- `src/billing/purchases.ts`: RevenueCat (`initPurchases`, `identifyPurchases`, `getOfferingPackages`,
  `purchasePackageById`, `restorePurchases`) cargado con guardas para que web/Expo Go no rompan.

## Tema y responsive (`src/theme/`)
- `colors.ts`: `lightPalette` (pastel) y `darkPalette` (sobrio). Degradados `gradientHero, gradientApp,
  gradientAccent, gradientBalance, gradientFab`.
- `spacing.ts`: `spacing`, `radius`, `fontSize`, `fontWeight`.
- `layout.ts`: `useBreakpoint()` → `{ bp:'sm'|'md'|'lg', isLg, isDesktop, width }` (sm < 600, md 600–959,
  lg ≥ 960). `useContentWidth()` → ancho útil + `columnStyle`. La app **reorganiza** (sidebar + grids), no estira.
- `ThemeProvider.tsx`: `useTheme()` → `{ palette, mode, preference, setPreference }`.
