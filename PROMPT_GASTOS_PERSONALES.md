# PROMPT: Personal Finance Tracker - Aplicación Móvil de Gestión de Gastos Personales

## 📋 Contexto y Objetivo

Se necesita desarrollar una **aplicación móvil nativa** (iOS + Android) similar a la arquitectura de **Inventra**, pero orientada a **gestión de gastos personales y beneficios**. La aplicación debe permitir a usuarios individuales llevar un control detallado de sus finanzas personales con estadísticas, categorización de gastos, visualización de ahorros y gestión de gastos fijos. **Optimizada para mobile-first con experiencia nativa en ambos sistemas operativos.**

---

## 🏗️ Arquitectura Base (Adaptada del proyecto Inventra)

### Frontend (Móvil)
- **Framework:** React Native + TypeScript (Expo o Bare React Native)
- **State Management:** Redux Toolkit o Zustand (stores reactivos)
- **Navegación:** React Navigation con native stacks
- **Visualización de datos:** Victory Native o React Native Chart Kit (gráficos nativos)
- **HTTP Client:** Axios con interceptores para JWT
- **UI Components:** React Native Paper / NativeBase (Material Design + componentes nativos)
- **Storage Local:** AsyncStorage para persistencia
- **Iconos:** React Native Vector Icons
- **Responsivo:** Responsive con Dimensions API y SafeAreaView

### Backend
- **Framework:** Slim 4 (PHP micro-framework) - **IDÉNTICO A INVENTRA**
- **Autenticación:** JWT (Firebase JWT)
- **Base de datos:** MySQL 8
- **Validación:** Rutas tipadas y middleware
- **CORS:** Habilitado para acceso desde app móvil

---

## 🎯 Características Principales del Nueva Aplicación

### 1. **Autenticación y Gestión de Usuario**
- Registro e inicio de sesión (sin multi-empresa, solo usuario personal)
- JWT con expiración automática (3600 segundos)
- Guards de ruta para proteger vistas
- Perfil de usuario editable

### 2. **Dashboard Principal**
- **KPIs principales:**
  - Ingresos totales (mes actual)
  - Gastos totales (mes actual)
  - Saldo actual (ingresos - gastos)
  - Saldo ahorrado (histórico o meta)
- **Gráficos:**
  - Sparklines de últimas 7 días (ingresos vs gastos)
  - Line chart de tendencias mensuales (últimos 6 meses)
  - Doughnut chart de distribución de gastos por categoría
  - Bar chart de top 5 categorías de gastos

### 3. **Gestión de Gastos (Variable)**
- Crear, editar, eliminar gastos variables
- Campos: descripción, monto, categoría, fecha, notas opcionales
- Filtros: por categoría, rango de fechas, tipo (gasto/ingreso)
- Vista de tabla con scroll horizontal (mobile)
- Modal para crear/editar con validación
- Ordenamiento por fecha descendente

### 4. **Gestión de Gastos Fijos**
- CRUD para gastos fijos recurrentes (alquiler, servicios, suscripciones)
- Campos: nombre, monto, categoría, frecuencia (mensual, semanal, anual), fecha inicio
- Cálculo automático: proyección mensual/anual de gastos fijos
- Vista listado con opciones para activar/desactivar sin eliminar
- Aplicación automática a los cálculos del dashboard

### 5. **Gestión de Categorías**
- CRUD para crear categorías personalizadas
- Categorías predefinidas al registrarse: Alimentos, Transporte, Ocio, Utilities, Salud, Otros
- Colores asociados a cada categoría (para gráficos)
- Estadísticas por categoría (gasto promedio, total, % del total)

### 6. **Ingresos/Beneficios**
- Registro de ingresos (sueldo, freelance, venta, etc.)
- Fuentes de ingresos configurables
- Cálculo de ingresos mensuales y acumulados
- Proyección vs gastos para visualizar margen de ahorro

### 7. **Análisis y Estadísticas**
- **Vista Analytics:**
  - Comparativa ingresos vs gastos por mes
  - Tendencia de ahorros acumulados
  - Breakdown de gastos por categoría (% y cantidad)
  - Budget vs realizado (si el usuario define presupuestos)
  - Proyecciones: gastos estimados en 6 meses, año
  - Ratio de ahorro (% del ingreso que se ahorra)

### 8. **Metas de Ahorro (Opcional pero incluir)**
- Crear metas de ahorro con objetivo y plazo
- Visualizar progreso hacia la meta
- Alertas cuando se alcanza la meta

### 9. **Reportes y Exportación**
- Exportar gastos a CSV/PDF
- Resumen mensual descargable
- Opción para imprimir dashboard

### 10. **Auto-refresh**
- Actualización cada 15-20 segundos si la app está activa
- Refresh al volver a la pestaña (focus event)
- Botón manual para refrescar

---

## 📊 Estructura de Base de Datos

### Tablas Principales

#### `users`
```
id (INT PRIMARY KEY AUTO_INCREMENT)
name (VARCHAR 255)
email (VARCHAR 255 UNIQUE)
password_hash (VARCHAR 255)
currency (VARCHAR 3, default 'EUR') -- Moneda preferida
timezone (VARCHAR 50, default 'UTC')
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

#### `categories` (Categorías personalizadas)
```
id (INT PRIMARY KEY AUTO_INCREMENT)
user_id (INT FOREIGN KEY -> users.id)
name (VARCHAR 255)
color (VARCHAR 7) -- Código hex #XXXXXX
type (ENUM: 'expense', 'income') -- Tipo de categoría
created_at (TIMESTAMP)
```

#### `transactions` (Gastos e ingresos variables)
```
id (INT PRIMARY KEY AUTO_INCREMENT)
user_id (INT FOREIGN KEY -> users.id)
category_id (INT FOREIGN KEY -> categories.id)
amount (DECIMAL 10,2)
description (VARCHAR 500)
type (ENUM: 'expense', 'income')
transaction_date (DATE)
notes (TEXT NULL)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
INDEX idx_user_date (user_id, transaction_date)
```

#### `recurring_expenses` (Gastos fijos)
```
id (INT PRIMARY KEY AUTO_INCREMENT)
user_id (INT FOREIGN KEY -> users.id)
category_id (INT FOREIGN KEY -> categories.id)
name (VARCHAR 255)
amount (DECIMAL 10,2)
frequency (ENUM: 'weekly', 'monthly', 'yearly')
start_date (DATE)
end_date (DATE NULL) -- NULL si es indefinido
is_active (BOOLEAN default TRUE)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

#### `savings_goals` (Metas de ahorro)
```
id (INT PRIMARY KEY AUTO_INCREMENT)
user_id (INT FOREIGN KEY -> users.id)
name (VARCHAR 255)
target_amount (DECIMAL 10,2)
current_amount (DECIMAL 10,2 default 0)
target_date (DATE)
description (TEXT NULL)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

#### `budgets` (Presupuestos por categoría/mes - opcional)
```
id (INT PRIMARY KEY AUTO_INCREMENT)
user_id (INT FOREIGN KEY -> users.id)
category_id (INT FOREIGN KEY -> categories.id NULL) -- NULL = presupuesto general
amount (DECIMAL 10,2)
month_year (VARCHAR 7) -- "2024-05" formato
created_at (TIMESTAMP)
```

---

## 🗂️ Estructura de Carpetas (Frontend - React Native)

```
mobile/
├── src/
│   ├── api/
│   │   ├── auth.ts              -- Endpoints de autenticación
│   │   ├── transactions.ts       -- CRUD gastos/ingresos
│   │   ├── categories.ts         -- CRUD categorías
│   │   ├── recurring.ts          -- CRUD gastos fijos
│   │   ├── analytics.ts          -- Endpoints de estadísticas
│   │   ├── goals.ts              -- CRUD metas de ahorro
│   │   ├── http.ts               -- Axios instance con interceptores JWT
│   │   ├── types.ts              -- Interfaces TypeScript
│   │   └── storage.ts            -- AsyncStorage helpers
│   │
│   ├── store/ (Redux Toolkit o Zustand)
│   │   ├── authSlice.ts          -- Estado de autenticación
│   │   ├── transactionsSlice.ts  -- Estado de gastos/ingresos
│   │   ├── categoriesSlice.ts    -- Estado de categorías
│   │   ├── recurringSlice.ts     -- Estado de gastos fijos
│   │   ├── analyticsSlice.ts     -- Estado de estadísticas
│   │   ├── goalsSlice.ts         -- Estado de metas
│   │   ├── appSlice.ts           -- Estado global (user, loading)
│   │   └── index.ts              -- Store configuration
│   │
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   └── OnboardingScreen.tsx
│   │   ├── main/
│   │   │   ├── DashboardScreen.tsx      -- Dashboard principal con KPIs
│   │   │   ├── TransactionsScreen.tsx   -- Lista de gastos/ingresos
│   │   │   ├── RecurringScreen.tsx      -- Gestión gastos fijos
│   │   │   ├── AnalyticsScreen.tsx      -- Gráficos y estadísticas
│   │   │   ├── GoalsScreen.tsx          -- Metas de ahorro
│   │   │   ├── CategoriesScreen.tsx     -- Gestión categorías
│   │   │   └── SettingsScreen.tsx       -- Ajustes perfil, moneda, zona horaria
│   │   └── modals/
│   │       ├── TransactionFormModal.tsx
│   │       ├── RecurringExpenseModal.tsx
│   │       ├── SavingsGoalModal.tsx
│   │       └── ConfirmModal.tsx
│   │
│   ├── components/
│   │   ├── KPICard.tsx                  -- Tarjeta de KPI
│   │   ├── TransactionItem.tsx          -- Item lista de transacciones
│   │   ├── CategoryBadge.tsx            -- Badge de categoría con color
│   │   ├── SparklineChart.tsx           -- Mini gráfico sparkline
│   │   ├── LineChart.tsx                -- Gráfico de líneas
│   │   ├── DoughnutChart.tsx            -- Gráfico de donuts
│   │   ├── BarChart.tsx                 -- Gráfico de barras
│   │   ├── FloatingActionButton.tsx    -- FAB para crear gasto rápido
│   │   ├── Header.tsx                   -- Header personalizado con back
│   │   ├── BottomTabNavigator.tsx      -- Bottom navigation tabs
│   │   ├── LoadingSpinner.tsx           -- Indicador de carga
│   │   └── Toast.tsx                    -- Notificación tipo toast
│   │
│   ├── hooks/
│   │   ├── useAuth.ts                   -- Hook para autenticación
│   │   ├── useTransactions.ts           -- Hook para transacciones
│   │   ├── useAutoRefresh.ts            -- Hook para refresh automático
│   │   ├── useCurrency.ts               -- Hook para formato moneda
│   │   └── useKeyboard.ts               -- Hook para keyboard (Android/iOS)
│   │
│   ├── utils/
│   │   ├── format.ts                    -- Formateo moneda, fechas
│   │   ├── analytics.ts                 -- Cálculos de estadísticas
│   │   ├── colors.ts                    -- Paleta de colores y temas
│   │   ├── constants.ts                 -- Constantes globales
│   │   └── helpers.ts                   -- Funciones helper
│   │
│   ├── navigation/
│   │   ├── RootNavigator.tsx            -- Navegador raíz (auth/app)
│   │   ├── AuthNavigator.tsx            -- Stack navegación login/register
│   │   └── AppNavigator.tsx             -- Bottom tabs y nested stacks
│   │
│   ├── theme/
│   │   ├── colors.ts
│   │   ├── fonts.ts
│   │   ├── spacing.ts
│   │   └── theme.ts                     -- Tema global
│   │
│   ├── App.tsx
│   └── index.ts
│
├── assets/
│   ├── images/
│   ├── fonts/
│   └── icons/
│
├── app.json                  -- Configuración Expo
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## 🛠️ Backend (PHP/Slim)

### Estructura de archivos

```
backend/
├── index.php                 -- Punto de entrada, configuración Slim
├── Conexion.php              -- Conexión PDO a MySQL
├── Routes/
│   ├── AuthRoutes.php        -- POST login, register, refresh token
│   ├── TransactionRoutes.php -- GET/POST/PUT/DELETE transacciones
│   ├── CategoryRoutes.php    -- GET/POST/PUT/DELETE categorías
│   ├── RecurringRoutes.php   -- GET/POST/PUT/DELETE gastos fijos
│   ├── AnalyticsRoutes.php   -- GET resumen, gráficos, estadísticas
│   ├── GoalsRoutes.php       -- GET/POST/PUT/DELETE metas
│   └── UserRoutes.php        -- GET/PUT perfil usuario
│
├── Middleware/
│   ├── AuthMiddleware.php    -- Verificar JWT en header Authorization
│   └── ValidationMiddleware.php -- Validar payloads
│
├── Controllers/
│   ├── AuthController.php
│   ├── TransactionController.php
│   ├── CategoryController.php
│   ├── RecurringController.php
│   ├── AnalyticsController.php
│   ├── GoalsController.php
│   └── UserController.php
│
├── Models/ (Opcional, o queries directo en Controllers)
│   ├── User.php
│   ├── Transaction.php
│   ├── Category.php
│   ├── RecurringExpense.php
│   ├── SavingsGoal.php
│   └── Analytics.php
│
├── schema.sql                -- Script crear BD
├── migration_expenses.sql    -- (Opcional) Migraciones
├── composer.json             -- Dependencias
└── vendor/                   -- Autoload
```

### Endpoints principales

**Auth:**
- `POST /auth/register` - Registrar nuevo usuario
- `POST /auth/login` - Login con email/password
- `POST /auth/refresh` - Refrescar JWT

**Transactions:**
- `GET /transactions` - Listar gastos/ingresos (con filtros: fecha, categoría, tipo)
- `POST /transactions` - Crear gasto/ingreso
- `PUT /transactions/:id` - Editar gasto/ingreso
- `DELETE /transactions/:id` - Eliminar gasto/ingreso

**Categories:**
- `GET /categories` - Listar categorías
- `POST /categories` - Crear categoría
- `PUT /categories/:id` - Editar categoría
- `DELETE /categories/:id` - Eliminar categoría

**Recurring Expenses:**
- `GET /recurring` - Listar gastos fijos
- `POST /recurring` - Crear gasto fijo
- `PUT /recurring/:id` - Editar gasto fijo
- `DELETE /recurring/:id` - Eliminar gasto fijo

**Analytics:**
- `GET /analytics/summary` - KPIs: ingresos, gastos, saldo, ahorrados
- `GET /analytics/monthly?months=6` - Datos últimos N meses
- `GET /analytics/categories` - Breakdown por categoría
- `GET /analytics/trends` - Tendencias últimos 30 días
- `GET /analytics/projection` - Proyecciones futuras

**Goals:**
- `GET /savings-goals` - Listar metas
- `POST /savings-goals` - Crear meta
- `PUT /savings-goals/:id` - Editar meta
- `DELETE /savings-goals/:id` - Eliminar meta

**User:**
- `GET /user/profile` - Obtener perfil
- `PUT /user/profile` - Actualizar perfil, moneda, zona horaria

---

## 🎨 Design System (UI limpia, moderna y profesional)

> **Norte estético:** *fintech minimalista*, inspirado en apps como Revolut, N26, Monzo y Linear.
> Nada de gradientes saturados, ni emojis decorativos en la UI, ni sombras pesadas.
> La aplicación debe **respirar**: mucho espacio en blanco, jerarquía tipográfica clara, color usado como información (no como decoración).

### Principios de diseño

1. **Claridad antes que densidad.** Un solo dato grande por encima del resto en cada pantalla (saldo, total del mes, progreso de meta).
2. **Color con intención.** El color comunica estado: verde = ingreso/positivo, rojo suave = gasto/negativo, azul = acción primaria, gris = neutro/secundario. Las categorías llevan su propio color, pero siempre como **dot/pill/borde**, nunca como fondo de tarjeta completo.
3. **Bordes en lugar de sombras.** Cards con `border: 1px solid` sutil + `border-radius: 16px`. Sombras solo en modales y FAB, muy suaves (`0 4px 12px rgba(0,0,0,0.06)`).
4. **Tipografía variable.** Una sola familia (Inter o SF Pro Rounded en iOS / Roboto Flex en Android). Pesos: 400 cuerpo, 500 etiquetas, 600 títulos, 700 KPIs. Números siempre **tabulares** (`font-variant-numeric: tabular-nums`).
5. **Movimiento discreto.** Transiciones 150–250 ms, easing `cubic-bezier(0.2, 0, 0, 1)`. Skeletons en lugar de spinners cuando se pueda. Haptic feedback en acciones importantes (crear, borrar, completar meta).
6. **Mobile-first real.** Áreas táctiles ≥ 44 px, FAB en el pulgar (bottom-right), gestos swipe para editar/eliminar, bottom sheets en lugar de modales tradicionales para crear/editar.

### Paleta (modo claro)

| Token | Valor | Uso |
|-------|-------|-----|
| `bg-base`        | `#FAFAFA` | Fondo de pantalla |
| `bg-surface`     | `#FFFFFF` | Cards, listas, sheets |
| `bg-elevated`    | `#F4F4F5` | Inputs, chips, secciones secundarias |
| `border-subtle`  | `#E4E4E7` | Bordes de cards e inputs |
| `text-primary`   | `#09090B` | Títulos, KPIs |
| `text-secondary` | `#52525B` | Cuerpo, etiquetas |
| `text-muted`     | `#A1A1AA` | Helpers, placeholders |
| `accent`         | `#6366F1` | Botones primarios, links, FAB |
| `accent-soft`    | `#EEF2FF` | Background del estado activo |
| `success`        | `#10B981` | Ingresos, metas alcanzadas |
| `danger`         | `#EF4444` | Gastos, eliminar |
| `warning`        | `#F59E0B` | Alertas de presupuesto |

### Paleta (modo oscuro)

| Token | Valor |
|-------|-------|
| `bg-base`        | `#0A0A0B` |
| `bg-surface`     | `#141416` |
| `bg-elevated`    | `#1C1C1F` |
| `border-subtle`  | `#27272A` |
| `text-primary`   | `#FAFAFA` |
| `text-secondary` | `#A1A1AA` |
| `text-muted`     | `#71717A` |
| `accent`         | `#818CF8` |

> El backend ya guarda la preferencia `theme` (`light` | `dark` | `system`) por usuario.

### Escala de espaciado y tipografía

- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32 / 48 px. Padding interno de cards: `20px`. Gap entre cards: `12px`.
- **Radios:** `8` (chips, inputs), `16` (cards), `24` (sheets), `9999` (botones pill, dots de categoría).
- **Tipografía:**
  - `display` 32 / 40 / -0.02em — saldo principal del dashboard.
  - `h1` 24 / 32 / -0.01em — títulos de pantalla.
  - `h2` 18 / 28 — secciones.
  - `body` 15 / 22 — texto general.
  - `label` 13 / 18 / 500 — etiquetas y helpers.
  - `mono` 13 — fechas, IDs.

### Patrones de componente

- **KPI Card.** Etiqueta pequeña arriba (`label`, color `text-secondary`), número grande (`display`, color según contexto), variación porcentual con flecha en una línea inferior. Sin iconos decorativos.
- **Transaction Row.** `[dot 8px color categoría] [descripción / fecha pequeña debajo] [importe alineado a la derecha, en verde si ingreso, en `text-primary` si gasto]`. Sin emojis. Swipe-left muestra dos acciones: editar (azul) y eliminar (rojo).
- **Bottom Sheet de creación.** Inputs en columna, teclado numérico para importes, selector de categoría como grid de chips coloreados, fecha con date picker nativo, botón primario fijo abajo.
- **Charts.** Sin grids gruesos, ejes minimalistas, líneas de 2 px, area fill al 8 % de opacidad. El donut de categorías no lleva leyenda dentro: lista lateral debajo con el dot, nombre y porcentaje.
- **Empty states.** Ilustración monocroma SVG simple + título + 1 línea + un único CTA primario. Nada de mascotas o copy gracioso.
- **Toasts.** Esquina inferior, 56 px de alto, fondo `text-primary` sobre `bg-surface` invertido, autodismiss en 3.5 s.

### Accesibilidad

- Contraste WCAG AA en todos los pares texto/fondo.
- Tap targets ≥ 44 × 44 px.
- `accessibilityLabel` en todos los iconos y FAB.
- Soporte completo de Dynamic Type (iOS) y Font scale (Android).
- Estados de focus visibles cuando se navega con teclado externo.

### Qué evitar (líneas rojas)

- ❌ Gradientes en backgrounds completos, glassmorphism o neumorfismo.
- ❌ Emojis dentro de la UI de producto (sí en onboarding ilustraciones SVG).
- ❌ Más de un color de marca por pantalla.
- ❌ Tipografías con serifs decorativas o fuentes "handwritten".
- ❌ Sombras grandes o múltiples capas elevadas.
- ❌ Tablas tradicionales en mobile — siempre lista de cards/filas.

---

## 🎨 Pantallas Principales (Mobile-First)

### 1. DashboardScreen (Tab principal)
- **Header:** Saldo actual en grande + período (mes actual)
- **Quick Stats:** 4 KPI cards deslizables (Ingresos, Gastos, Saldo, Ahorrados)
- **Chart:** Sparkline últimos 7 días con iconos ↑ gasto, ↓ ingreso
- **Breakdown:** Doughnut chart gastos por categoría con legend
- **Quick Actions:** FAB azul + Botón editar transacción reciente
- **Recent Transactions:** Mini lista últimas 3-5 transacciones (swipe para más)
- **Scroll vertical:** Todo el contenido cabe con scroll
- **Bottom Tab:** Acceso a otras pantallas (Transacciones, Analytics, Más)

### 2. TransactionsScreen (Tab principal)
- **Header:** Selector período (mes, rango fechas) + filtro categoría
- **Search:** Barra búsqueda por descripción (sticky)
- **Filter Chips:** Categorías como chips deslizables (scroll horizontal)
- **List:** Transacciones en lista vertical, cada una:
  - Icono categoría + color
  - Descripción
  - Monto (rojo gasto, verde ingreso)
  - Fecha pequeña
  - Swipe left: editar/eliminar
- **Empty State:** Ilustración + botón "Añadir transacción" si está vacío
- **FAB:** Botón flotante azul para crear nueva transacción
- **Infinite Scroll:** Cargar más al llegar al final

### 3. RecurringScreen (Dentro de tab Más)
- **Header:** "Gastos Fijos" + Proyección mensual destacada
- **List:** Cada gasto fijo muestra:
  - Nombre + Monto
  - Frecuencia (Mensual, Semanal, Anual)
  - Toggle on/off para activar/desactivar
  - Próxima fecha
  - Tap para editar, swipe delete
- **Summary:** Cards al top: "Próximas 2 semanas: €XXX"
- **FAB:** Crear nuevo gasto fijo
- **Empty State:** Botón para crear primer gasto fijo

### 4. AnalyticsScreen (Tab principal)
- **Tabs horizontales:** Mes, Trimestre, Año
- **Chart 1:** Line chart ingresos vs gastos últimos meses
- **Chart 2:** Doughnut chart categorías de gasto
- **Stats:** Grid 2x2:
  - Gasto promedio por categoría
  - Ratio ahorro (%)
  - Gastos fijos (€/mes)
  - Proyección próximos 6 meses
- **Detail List:** Top 5 categorías con barras
- **Scroll vertical:** Todo en una pantalla

### 5. GoalsScreen (Dentro de tab Más)
- **List:** Cada meta en card con:
  - Nombre + Objetivo (€)
  - Progress bar circular o lineal
  - Porcentaje alcanzado
  - Días restantes
  - Tap para ver detalles/editar
- **Sorting:** Activas primero, completadas luego
- **FAB:** Crear nueva meta
- **Summary:** Total ahorrado en metas

### 6. CategoriesScreen (Dentro de Settings)
- **List:** Cada categoría:
  - Color cuadrado (tap para elegir color)
  - Nombre
  - Icono predeterminado
  - Switch para predeterminada
  - Tap editar, swipe delete
- **Add Button:** Crear nueva categoría
- **Warning:** No permitir borrar si tiene transacciones

### 7. SettingsScreen (Tab principal o dentro de Más)
- **Sections:**
  - **Perfil:** Nombre, Email, Avatar (tap para cambiar)
  - **Seguridad:** Cambiar contraseña
  - **Preferencias:**
    - Moneda selector (EUR, USD, GBP)
    - Zona horaria selector
    - Idioma selector
    - Tema (Light/Dark)
  - **Notificaciones:** Toggles para alerts presupuesto, resumen semanal
  - **Acerca de:** Versión app, legal
  - **Logout:** Botón rojo cerrar sesión
- **Scroll vertical:** Todo accesible

### 8. LoginScreen (Pre-auth)
- **Header:** Logo app + "Gestiona tus gastos"
- **Form:**
  - Email input (teclado email)
  - Password input (secure)
  - Botón login azul
  - "¿No tienes cuenta?" link a RegisterScreen
- **Error:** Mostrar toast si falla
- **Loading:** Spinner en botón mientras se procesa

### 9. RegisterScreen (Pre-auth)
- **Header:** Logo app + "Crea tu cuenta"
- **Frontend Framework** | React Native |
| **Frontend Language** | TypeScript |
| **Development Env** | Expo (recomendado) o Bare React Native |
| **State Management** | Redux Toolkit o Zustand |
| **Navigation** | React Navigation (Native Stack + Bottom Tabs) |
| **HTTP Client** | Axios |
| **Charts** | Victory Native o React Native Chart Kit |
| **UI Components** | React Native Paper (Material Design) |
| **Local Storage** | AsyncStorage |
| **Icons** | React Native Vector Icons (Ionicons / MaterialCommunityIcons) |
| **Date Picker** | @react-native-camera-roll/camera-roll o react-native-date-picker |
| **Push Notifications** | Expo Notifications |
| **Backend Framework** | Slim 4 (PHP) |
| **Database** | MySQL 8 |
| **Auth** | JWT (Firebase JWT) |
| **Native API** | React Native Keyboard, Dimensions, Platform, SafeAreaView
### 10. OnboardingScreen (Post-register, pre-dashboard)
- **Wizard:** 2-3 pasos:Expo o React Native CLI
   - Setup Backend Slim + MySQL (idéntico a Inventra)
   - Implementar RegisterScreen/LoginScreen
   - Crear store Redux/Zustand inicial (auth)
   - Configurar React Navigation (Root + Auth stacks)

2. **Fase 2 - Dashboard Base & Transacciones**
   - DashboardScreen con KPIs simples
   - TransactionsScreen lista básica
   - CRUD transacciones (gastos/ingresos)
   - Gestión categorías (CRUD)
   - Store transacciones + categorías
   - Modal crear/editar transacción

3. **Fase 3 - Charts & Analytics**
   - Integrar Victory Native / React Native Chart Kit
   - Sparkline últimos 7 días
   - Line chart ingresos vs gastos
   - Doughnut chart categorías
   - AnalyticsScreen completa
   - Store analytics con cálculos

4. **Fase 4 - Gastos Fijos & Metas**
   - CRUD gastos recurrentes (RecurringScreen)
   - CRUD metas de ahorro (GoalsScreen)
   - Proyecciones automáticas
   - Cálculo de gastos fijos en proyecciones

5. **Fase 5 - UX Avanzada & Optimizaciones**
   - SettingsScreen completo
   - Tema Dark/Light (react-native-appearance)
   - AsyncStorage para caché local
   - OnboardingScreen wizard
   - Infinite scroll en listas
   - Swipe gestures para editar/eliminar

6. **Fase 6 - Pulido & Deploy**
   - Testing unitario (Jest)
   - Testing E2E (Detox)
   - Optimización performance (FlatList, memoization)
   - Error handling completo y logging
   - Build Android APK + iOS IPA
   - Deploy a App Store + Google Play
   - Definir presupuesto por categoría/mes
   - Alertas cuando se acerca al límite

4. **Etiquetas:**
   - Añadir etiquetas (tags) adicionales a transacciones
   - Filtrar por etiqueta

5. **Análisis predictivo:**
   - Proyección de spending patterns
   - Alertas de anomalías (gasto anormalmente alto)

---

## 🚀 Tecnologías Específicas

| Aspecto | Tecnología |
|--------|-----------|
| Frontend Framework | Vue 3 |
| Frontend Language | TypeScript |
| Build Tool | Vite |
| State Management | Pinia |
| HTTP Client | Axios |
| Charts | Chart.js + vue-chartjs |
| Routing | Vue Router 4 |
| Backend Framework | Slim 4 (PHP) |
| Database | MySQL 8 |
| Auth | JWT (Firebase JWT) |
| Styling | CSS3 / Tailwind (opcional) |

---

## 📋 Flujo de Desarrollo Recomendado

1. **Fase 1 - Setup & Core Auth**
   - Scaffolding proyecto Vite + Vue
   - Setup Backend Slim + MySQL
   - Implementar Register/Login
   - Crear stores iniciales (auth)

2. **Fase 2 - Transacciones Base**
   - CRUD transacciones (gastos/ingresos)
   - Gestión categorías
   - Tabla de transacciones
   - Modal crear/editar

3. **Fase 3 - Dashboard & Analytics**
   - Dashboard con KPIs
   - Sparklines y line chart
   - Store analytics con cálculos
   - Refresh automático

4. **Fase 4 - Gastos Fijos & Metas**
   - CRUD gastos recurrentes
   - CRUD metas de ahorro
   - Proyecciones automáticas

5. **Fase 5 - Vistas Adicionales**
   - Vista analytics completa
   - Vista settings/perfil
   - Exportación (CSV/PDF)

6. **Fase 6 - Pulido & Deploy**
   - Responsive testing
   - Optimizaciones performance
   - Error handling completo
   - Deploy a producción

---

## 🎯 Validaciones y Reglas de Negocio

- **Montos:** Solo números positivos (decimales con 2 dígitos)
- **Fechas:** No permitir fechas futuras en transacciones pasadas
- **Categorías:** No permitir duplicadas con el mismo nombre (por usuario)
- **Gastos fijos:** El monto proyectado debe incluirse en totales del dashboard
- **Metas:** No permitir monto negativo o fecha pasada
- **Email:** Validar formato en registro y login
- **� Consideraciones específicas de React Native

### Navegación
- **React Navigation:** Bottom Tab Navigator para las 4-5 pantallas principales
- **Nested Stacks:** Dentro de cada tab, stacks para modales y detalles
- **Deep Linking:** Soporte para links profundos a transacciones específicas
- **Gesture Handlers:** Swipe back (iOS), hardware back button (Android)

### Rendimiento
- **FlatList:** Usar en lugar de ScrollView para listas largas
- **memoization:** React.memo() en componentes que se renderizan frecuentemente
- **useMemo y useCallback:** En componentes con cálculos pesados
- **Image optimization:** Usar FastImage para imágenes cacheadas

### Responsividad
- **Dimensions API:** Detectar tamaño pantalla y orientación
- **SafeAreaView:** Respetar notches y áreas seguras (iOS/Android)
- **Flex layouts:** Usar flexbox para adaptarse a diferentes tamaños
- **Platform-specific:** Código diferente para iOS vs Android donde sea necesario

### Almacenamiento Local
- **AsyncStorage:** Caché de transacciones, user profile, preferencias
- **Sincronización:** Batching de requests cuando hay conexión
- **Conflictos:** Resolver conflictos de última escritura

### Native APIs
- **Camera Roll:** Capturar fotos para avatares
- **Calendar:** Integrar con calendario del dispositivo para gastos
- **Biometric:** Touch ID / Face ID para login rápido (opcional)
- **Share:** Compartir resumen de gastos

### Notificaciones
- **Expo Notifications:** Recordatorios de gastos fijos, límite presupuesto
- **Push Notifications:** Desde backend cuando hay cambios remotos
- **Local Notifications:** Recordar entrada manual de gastos

---

## 📦 Estructura Package.json (React Native)

```json
{
  "name": "financetracker",
  "version": "1.0.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "build:android": "eas build --platform android",
    "build:ios": "eas build --platform ios",
    "test": "jest",
    "lint": "eslint src"
  },
  "dependencies": {
    "react": "^18.x.x",
    "react-native": "^0.73.x",
    "expo": "^50.x.x",
    "@react-navigation/native": "^6.x.x",
    "@react-navigation/bottom-tabs": "^6.x.x",
    "@react-navigation/native-stack": "^6.x.x",
    "react-native-gesture-handler": "^2.x.x",
    "react-native-reanimated": "^3.x.x",
    "react-native-safe-area-context": "^4.x.x",
    "react-native-screens": "^3.x.x",
    "@react-native-async-storage/async-storage": "^1.x.x",
    "@reduxjs/toolkit": "^1.x.x",
    "react-redux": "^8.x.x",
    "axios": "^1.x.x",
    "react-native-paper": "^5.x.x",
    "react-native-vector-icons": "^10.x.x",
    "victory-native": "^36.x.x",
    "date-fns": "^2.x.x"
  },
  "devDependencies": {
    "typescript": "^5.x.x",
    "@types/react-native": "^0.73.x",
    "@types/react": "^18.x.x",
    "jest": "^29.x.x",
    "eslint": "^8.x.x"
  }
}
```

---

## 🔒 Seguridad en Mobile

- **Almacenamiento JWT:** En AsyncStorage (considerar SecureStore en producción)
- **Refresh Token:** Implementar rotación de tokens
- **SSL Pinning:** Usar react-native-cert-pinner para APIs
- **Obfuscation:** Ofuscar código con ProGuard (Android), BitCode (iOS)
- **Secrets:** Nunca hardcodear API keys, usar variables de entorno (.env)

---

## 🎯 Testing en React Native

- **Unit Tests:** Jest para utilities, helpers, reducers
- **Component Tests:** React Native Testing Library para componentes
- **E2E Tests:** Detox o Maestro para flujos completos
- **Coverage:** Objetivo >80% en lógica crítica

---

## 🚀 Deploy

- **Expo:** EAS Build para compilar automáticamente
- **Android:** Generar APK para testing, AAB para Play Store
- **iOS:** Generar IPA para TestFlight / App Store
- **CI/CD:** GitHub Actions o EAS Workflows

---

## 📚 Referencias del Proyecto Inventra

Esta aplicación se basa en la arquitectura de **Inventra**, adaptando:
- ✅ Sistema de autenticación JWT (backend Slim idéntico)
- ✅ Estructura Redux / Redux Toolkit (como Pinia)
- ✅ React Navigation (como Vue Router con guards)
- ✅ Stack de gráficos (Victory Native / Chart Kit)
- ✅ Patrón API + Store reactivo
- ✅ Auto-refresh con TTL
- ✅ Mobile-first design
- ❌ Multi-empresa → Single user (simplificado)
- ❌ Roles complejos (no aplica)
- ❌ Multi-plataforma web → Solo móvil (iOS + Android)

---

**¡Listo para desarrollar! Este prompt proporciona especificaciones completas para una aplicación móvil profesional de gestión de gastos en React Native con backend Slim PHP idéntico al de Inventra
## 📚 Referencias del Proyecto Inventra

Esta aplicación se basa en la arquitectura de **Inventra**, adaptando:
- ✅ Sistema de autenticación JWT
- ✅ Estructura Pinia + Vue Router
- ✅ Stack de gráficos Chart.js
- ✅ Patrón API + Store
- ✅ Responsive design mobile-first
- ✅ Auto-refresh con TTL
- ❌ Multi-empresa (simplificado a single user)
- ❌ Roles complejos (no aplica)
- ❌ Invitaciones (no aplica)

---

**¡Listo para desarrollar! Este prompt debe ser suficiente para que una IA o desarrollador recree la aplicación adaptada a gestión de gastos personales.**
