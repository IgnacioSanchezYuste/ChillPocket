<div align="center">

<img src="assets/icon.png" alt="ChillPocket logo" width="120" style="border-radius:24px"/>

# ChillPocket

### Tu bolsillo, en modo relax.

*App de finanzas personales para iOS, Android y web — diseñada para que controlar tu dinero sea sencillo, bonito y sin estrés.*

[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81.5-61DAFB?logo=react&logoColor=white)](https://reactnative.dev)
[![React](https://img.shields.io/badge/React-19.1.0-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PHP Slim 4](https://img.shields.io/badge/Backend-PHP%20%2B%20Slim%204-777BB4?logo=php&logoColor=white)](https://www.slimframework.com)
[![MySQL/MariaDB](https://img.shields.io/badge/DB-MariaDB%2010.3%2B-003545?logo=mariadb&logoColor=white)](https://mariadb.org)
[![Licencia](https://img.shields.io/badge/Licencia-Privado-red)](.)
[![Version](https://img.shields.io/badge/Versión-1.3.4-blueviolet)](app.json)

</div>

---

## Índice

1. [Descripción](#-descripción)
2. [Características](#-características)
3. [Capturas](#-capturas)
4. [Stack tecnológico](#-stack-tecnológico)
5. [Arquitectura del repositorio](#-arquitectura-del-repositorio)
6. [Puesta en marcha](#-puesta-en-marcha)
   - [Requisitos](#requisitos)
   - [Instalación](#instalación)
   - [Variables de entorno](#variables-de-entorno)
   - [Ejecución](#ejecución)
7. [Despliegue](#-despliegue)
8. [Decisiones técnicas destacadas](#-decisiones-técnicas-destacadas)
9. [Autor](#-autor)

---

## Descripción

**ChillPocket** es una aplicación multiplataforma (iOS, Android y web) de gestión de finanzas personales. Nació con un objetivo claro: ofrecer una experiencia premium, coherente y accesible para controlar ingresos, gastos, suscripciones y metas de ahorro sin complejidad innecesaria.

El diseño sigue la filosofía de las mejores fintech del mercado (Revolut, Monzo, N26): paleta pastel en modo claro, sobria en oscuro, componentes con aire y microinteracciones elegantes. Todo el design system es propio — sin librerías de UI de terceros — para garantizar coherencia total entre plataformas.

El backend es un único archivo PHP (`index.php`) sobre Slim Framework 4, desplegado en Hostinger. Cada decisión de arquitectura — desde el endpoint agregado `/analytics/all` hasta el throttle de 30 segundos en el store — está condicionada por el límite real de 500 conexiones MySQL/hora del hosting compartido.

---

## Características

### Finanzas del día a día
- Registro de **ingresos y gastos** con categoría, método de pago, notas y fecha
- **Categorías personalizadas** con icono y color
- Filtros y búsqueda en el historial de movimientos
- Resumen mensual con saldo neto, ingresos totales y gastos totales

### Recurrentes
- Definición de **gastos e ingresos recurrentes** (suscripciones, nómina, alquiler...)
- Generación **lazy/perezosa**: sin cron, las transacciones se materializan automáticamente al consultar los datos, con INSERT idempotente vía UNIQUE `(user_id, recurring_id, transaction_date)`

### Presupuestos y metas
- **Presupuestos por categoría**: límite mensual con barra de progreso y alerta visual al acercarse al tope
- **Metas de ahorro** con modelo *envelope* (sobre): el ahorro aparece como gasto interno para no gastar de más; imposible superar el saldo disponible

### Analítica avanzada
- **DonutChart** de gastos por categoría (SVG propio)
- Sparklines de tendencia por KPI
- Proyección / **forecast** mensual con gradiente
- **Heatmap de hábitos** de gasto (`SpendingHabits`)
- Comparativa mensual (barras) e ingresos vs. gastos (línea)
- Desglose por **métodos de pago**
- Progreso de presupuestos en pantalla analítica

### Inversiones
- **Calculadora de interés compuesto** con aportaciones periódicas opcionales

### Experiencia y diseño
- **Onboarding guiado con spotlight** para nuevos usuarios (welcome → personalización → tutorial interactivo → success)
- **Tema claro** (pastel, fondo con degradado gris/lila) y **tema oscuro** (sobrio, sin pastel), conmutable desde ajustes
- Design system propio: `BalanceHero`, `KPICard`, `DonutChart`, `Sparkline`, `TransactionRow`, `GradientCard`, `FAB`, `FloatingTabBar`...
- Responsive: columna centrada a 600 px en web, nativo completo
- Login con **email/contraseña** y con **Google OAuth** (web + nativo con builds EAS)

---

## Capturas

> Las imágenes se cargan automáticamente si dejas caer los PNG con los nombres indicados en `docs/screenshots/`.
> Consulta [`docs/screenshots/README.md`](docs/screenshots/README.md) para instrucciones detalladas.

<table>
  <tr>
    <td align="center" width="50%">
      <!-- Sustituye por la captura real: docs/screenshots/dashboard.png -->
      <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="280"/>
      <br/><sub><b>Dashboard — Resumen mensual</b></sub>
    </td>
    <td align="center" width="50%">
      <!-- Sustituye por la captura real: docs/screenshots/analytics.png -->
      <img src="docs/screenshots/analytics.png" alt="Analítica" width="280"/>
      <br/><sub><b>Analítica — Donut, forecast y heatmap</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <!-- Sustituye por la captura real: docs/screenshots/transactions.png -->
      <img src="docs/screenshots/transactions.png" alt="Movimientos" width="280"/>
      <br/><sub><b>Movimientos — Historial y filtros</b></sub>
    </td>
    <td align="center" width="50%">
      <!-- Sustituye por la captura real: docs/screenshots/goals.png -->
      <img src="docs/screenshots/goals.png" alt="Metas de ahorro" width="280"/>
      <br/><sub><b>Metas de ahorro — Modelo envelope</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <!-- Sustituye por la captura real: docs/screenshots/budgets.png -->
      <img src="docs/screenshots/budgets.png" alt="Presupuestos" width="280"/>
      <br/><sub><b>Presupuestos — Límites por categoría</b></sub>
    </td>
    <td align="center" width="50%">
      <!-- Sustituye por la captura real: docs/screenshots/onboarding.png -->
      <img src="docs/screenshots/onboarding.png" alt="Onboarding" width="280"/>
      <br/><sub><b>Onboarding — Tutorial con spotlight</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <!-- Sustituye por la captura real: docs/screenshots/login.png -->
      <img src="docs/screenshots/login.png" alt="Login" width="280"/>
      <br/><sub><b>Login — Email y Google OAuth</b></sub>
    </td>
    <td align="center" width="50%">
      <!-- Sustituye por la captura real: docs/screenshots/dark-mode.png -->
      <img src="docs/screenshots/dark-mode.png" alt="Modo oscuro" width="280"/>
      <br/><sub><b>Modo oscuro — Tema sobrio</b></sub>
    </td>
  </tr>
</table>

---

## Stack tecnológico

### Frontend

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Expo | SDK 54 |
| Runtime | React Native | 0.81.5 |
| UI library | React | 19.1.0 |
| Lenguaje | TypeScript | Estricto |
| Navegación | @react-navigation (native-stack + bottom-tabs) | — |
| Estado global | Zustand | — |
| Persistencia local | @react-native-async-storage | — |
| Red / HTTP | Axios + JWT interceptor | — |
| Gráficas | react-native-chart-kit + react-native-svg | — |
| Degradados | expo-linear-gradient | — |
| Auth Google (web) | expo-auth-session (id_token implícito) | — |
| Auth Google (nativo) | @react-native-google-signin | — |
| Web | react-native-web (Metro resuelve `*.web.tsx`) | — |

### Backend

| Capa | Tecnología | Detalle |
|---|---|---|
| Runtime | PHP | Hostinger compartido |
| Framework | Slim Framework 4 | Un único `backend/index.php` |
| Base de datos | MariaDB 10.3+ | PDO siempre parametrizado |
| Auth | firebase/php-jwt | JWT 7 días |
| CORS / Routing | backend/.htaccess | Rewrite a index.php |

---

## Arquitectura del repositorio

```
ChillPocket/
├── App.tsx                        # Entrada Expo (GestureHandler, SafeArea, Theme, Toast, ErrorBoundary)
├── app.json                       # Config Expo (nombre, versión, bundle ID, plugins)
├── assets/
│   ├── icon.png                   # Icono de la app
│   ├── adaptive-icon.png          # Icono adaptativo Android
│   └── favicon.png                # Favicon web / splash
├── src/
│   ├── api/
│   │   ├── http.ts                # Instancia axios, inyección JWT, handler 401
│   │   ├── endpoints.ts           # Contratos de todos los endpoints por dominio
│   │   └── types.ts               # Tipos compartidos frontend ↔ backend
│   ├── components/                # Design system propio
│   │   ├── Text, Card, Button, Input, Sheet, SegmentedControl
│   │   ├── ProgressBar, Toast, Skeleton, EmptyState, ErrorBoundary
│   │   ├── BalanceHero, KPICard, DonutChart, Sparkline
│   │   ├── TransactionRow, SpendingHabits, GradientCard
│   │   ├── BrandLogo, FAB, FloatingTabBar (en navigation/)
│   │   └── GoogleButton.tsx / GoogleButton.native.tsx
│   ├── navigation/
│   │   ├── RootNavigator.tsx      # Auth gate: token → App, sin token → Auth
│   │   ├── AppNavigator.tsx       # Tabs (Home, Movimientos, Analítica, Más) + stack
│   │   ├── FloatingTabBar.tsx     # Barra inferior premium con spotlight targets
│   │   └── navigationRef.ts      # Ref global + navigateToTab()
│   ├── onboarding/
│   │   ├── OnboardingHost.tsx     # Orquesta fases: welcome → personalize → tour → success
│   │   ├── SpotlightOverlay.tsx   # Oscurece pantalla, recorta elemento y muestra tooltip
│   │   └── useSpotlightTarget.ts  # Registra un elemento como objetivo de spotlight
│   ├── screens/
│   │   ├── auth/                  # LoginScreen, RegisterScreen
│   │   ├── main/                  # Dashboard, Transactions, Analytics, Recurring,
│   │   │                          # Goals, Budgets, Investments, Categories, Settings
│   │   └── modals/                # TransactionSheet, RecurringSheet, GoalSheet
│   ├── store/
│   │   ├── useAuthStore.ts        # user, token, login/register/loginWithGoogle/logout
│   │   ├── useDataStore.ts        # Fuente central de datos, throttle 30s, refreshAll()
│   │   ├── usePreferencesStore.ts # Últimas elecciones, goal, incomeFrequency
│   │   └── useOnboardingStore.ts  # Estado y progreso del onboarding
│   ├── theme/
│   │   ├── colors.ts              # lightPalette, darkPalette, degradados
│   │   ├── spacing.ts             # spacing, radius, fontSize, fontWeight
│   │   ├── layout.ts              # useContentWidth() → 600px en web
│   │   └── ThemeProvider.tsx      # useTheme() → { palette, mode, setPreference }
│   └── utils/                     # format, validators, paymentMethods, categoryIcon, ...
└── backend/
    ├── index.php                  # TODA la API (Slim 4). Helpers: expandRecurring, availableBalance...
    ├── .htaccess                  # CORS + rewrite a index.php
    ├── update.sql                 # Migración idempotente 1.1.0
    ├── u204231532_Finanzas.sql    # Esquema base completo
    └── Conexion.example.php       # Plantilla PDO (Conexion.php real NO versionada)
```

---

## Puesta en marcha

### Requisitos

- **Node.js** 22 o superior
- **npm** (incluido con Node)
- Cuenta en [Expo](https://expo.dev) (para builds EAS, opcional en desarrollo)
- Credenciales Google OAuth (para el login con Google, opcional en desarrollo con email)

### Instalación

```bash
git clone <url-del-repo>
cd ChillPocket
npm install
```

### Variables de entorno

Crea un archivo `.env` en la raíz del proyecto (está en `.gitignore`, nunca se versiona):

| Variable | Descripción | Requerida |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | URL base del backend, p. ej. `https://ignaciosanchezyuste.es/API_Finanzas` | Siempre |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Client ID OAuth de Google para web | Login Google web |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Client ID OAuth de Google para Android | Login Google nativo |

> Las variables `EXPO_PUBLIC_*` se inyectan en tiempo de build. Tras modificar `.env` reinicia Metro con `-c` para limpiar la caché.

Ejemplo de `.env`:

```env
EXPO_PUBLIC_API_URL=https://ignaciosanchezyuste.es/API_Finanzas
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
```

### Ejecución

```bash
# Desarrollo (web o Expo Go en móvil)
npx expo start -c

# Verificación de tipos — debe estar siempre limpio
npx tsc --noEmit
```

> **Nota sobre el login Google en nativo:** `@react-native-google-signin` es un módulo nativo que no funciona en Expo Go. Necesita un dev build o un build EAS. Además, el Android OAuth client requiere el SHA-1 del keystore y el package `com.Ignacio.ChillPocket` registrados en Google Cloud Console. Para web hay que añadir el redirect URI en Google Cloud Console.

---

## Despliegue

### Frontend — Build nativo (EAS)

```bash
# Build Android (perfil preview, APK)
eas build -p android --profile preview

# Build iOS
eas build -p ios --profile preview
```

Las variables `EXPO_PUBLIC_*` deben estar configuradas en el panel de EAS o en `eas.json` antes de lanzar el build.

### Backend — Hostinger

1. Subir por FTP los archivos `backend/index.php` y `backend/.htaccess` al directorio raíz de la API en Hostinger.
2. Ejecutar el SQL de migración `backend/update.sql` desde phpMyAdmin.
3. Asegurarse de que `backend/Conexion.php` (credenciales PDO) existe en el servidor y **no está versionado**. Usar `Conexion.example.php` como plantilla.

> `.env` y `backend/Conexion.php` contienen credenciales y nunca deben subirse al repositorio.

---

## Decisiones técnicas destacadas

Estas decisiones no son obvias pero tienen un impacto directo en la fiabilidad y el rendimiento del sistema. Se documentan aquí para que cualquier colaborador entienda el porqué antes de modificar el comportamiento.

### 1. Endpoint agregado `GET /analytics/all` + throttle de 30s

El hosting de Hostinger tiene un límite duro de **500 conexiones MySQL/hora**. En lugar de hacer 7 peticiones independientes (categorías de gasto, tendencias, proyección, métodos de pago, presupuestos, comparativa, hábitos), toda la analítica se obtiene con una única llamada a `/analytics/all`. El `useDataStore` aplica un throttle de 30 segundos (`STALE_MS`) para evitar refrescos innecesarios: si los datos tienen menos de 30 segundos, no se vuelve a llamar al servidor. Las mutaciones (crear/editar/borrar) sí llaman `refreshAll(true)` para forzar la recarga puntual.

### 2. Recurrentes con generación lazy y INSERT idempotente

No hay ningún cron job ni proceso en background. Cuando el usuario consulta sus datos, el backend ejecuta `expandRecurringTransactions`, que calcula qué transacciones periódicas deberían existir hasta la fecha y las inserta con `INSERT IGNORE` (o equivalente idempotente). La clave es la restricción `UNIQUE (user_id, recurring_id, transaction_date)`: si la transacción ya existe, la inserción no falla y no duplica datos. Esto elimina la necesidad de infraestructura adicional (workers, cron, queues) en un hosting compartido.

### 3. Multiplataforma con resolución por plataforma de Metro

Algunos componentes tienen comportamiento distinto en web y nativo (principalmente el botón de Google, que usa `expo-auth-session` en web y `@react-native-google-signin` en nativo). En lugar de condicionales `Platform.OS` en el código, se usan archivos `*.native.tsx` y `*.web.tsx` que Metro resuelve automáticamente según la plataforma objetivo. Esto mantiene el código de cada plataforma limpio y sin condiciones anidadas.

### 4. Neto sin doble conteo de recurrentes

El cálculo `neto = avgIncome − avgExpense` opera sobre el mes completo. Las transacciones recurrentes ya están materializadas como transacciones reales (punto 2), por lo que no se procesan de forma especial: se suman igual que cualquier otra transacción del mes, evitando el doble conteo.

### 5. Modelo "sobre" (envelope) en metas de ahorro

Al asignar dinero a una meta, el sistema registra un gasto interno de categoría "Ahorro". Esto reduce el saldo disponible real, haciendo imposible gastar más de lo que hay. La validación en backend rechaza aportaciones que superen `availableBalance()`, calculado como ingresos del mes menos gastos del mes (incluidas aportaciones anteriores).

---

## Autor

**Ignacio Sánchez Yuste**

Desarrollador full-stack. Este proyecto es un portfolio personal que demuestra arquitectura mobile/web completa con React Native + Expo, backend PHP propio, diseño de sistemas de componentes desde cero y toma de decisiones de ingeniería condicionadas por restricciones reales de infraestructura.

- GitHub: [@IgnacioSanchezYuste](https://github.com/IgnacioSanchezYuste)
- Email: ignaciosanchezyuste@gmail.com

---

<div align="center">
  <sub>Hecho con paciencia, café y muchos commits — ChillPocket v1.3.4</sub>
</div>
