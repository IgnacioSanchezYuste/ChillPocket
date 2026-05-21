# ChillPocket — Roadmap v2.0.0

Funcionalidades planificadas para la **v2.0.0**, salidas del brainstorm del equipo (backend,
frontend, UI, QA y seguridad). Ordenadas por valor/impacto. La v1.x (actual) ya está en producción.

> Leyenda — Esfuerzo: **S** (pequeño) · **M** (medio) · **L** (grande). "Backend" = requiere cambios de API/SQL y desplegar.

## 🔝 Prioridad alta (núcleo de la v2)

1. **Notificaciones y recordatorios inteligentes** — Esfuerzo **L** · Backend sí
   Avisos cuando un presupuesto llega al 80/100%, un gasto fijo está próximo a cobrarse, o se cumple una meta.
   Notificaciones locales (Expo Notifications) + tabla `notifications` en el backend. Es el mayor salto de valor: la app pasa de "registrar" a "ayudar".

2. **Paginación / scroll infinito en Movimientos** — Esfuerzo **S** · Backend no
   Hoy hay un tope silencioso de 100 transacciones (`useDataStore`). Usar `onEndReached` + `offset` (ya existe en `TransactionFilter`).

3. **Seguridad de acceso: PIN / biometría + token en almacén seguro** — Esfuerzo **M** · Backend no
   `expo-local-authentication` (Face ID / huella) para desbloquear la app, y migrar el JWT de AsyncStorage a `expo-secure-store` (Keychain/Keystore).

4. **Rate limiting en `/auth/*`** — Esfuerzo **M** · Backend sí
   Frenar fuerza bruta en login/register y proteger la cuota de 500 conexiones MySQL/h de Hostinger.

5. **Búsqueda y filtros avanzados en Movimientos** — Esfuerzo **S** · Backend no
   Rango de fechas, importe mín/máx y método de pago combinados (parámetros ya soportados por la API).

## 🚀 Prioridad media (diferenciadores)

6. **Exportar a CSV** — Esfuerzo **S** · Backend sí
   `GET /transactions/export?format=csv` con `Content-Disposition: attachment`. Muy pedido en apps de finanzas.

7. **Presupuestos con auto-renovación mensual** — Esfuerzo **M** · Backend sí
   Flag `auto_renew`: al pedir un mes sin presupuesto, clonar el del mes anterior. Evita recrearlos cada mes.

8. **Patrimonio neto / "Net Worth"** — Esfuerzo **L** · Backend no
   Gráfica de evolución del saldo histórico acumulado (`net_total_historical` ya existe). Vista diferenciadora.

9. **Swipe actions en Movimientos** — Esfuerzo **M** · Backend no
   Deslizar para eliminar (con confirmación) o duplicar una transacción.

10. **Animaciones premium** — Esfuerzo **M** · Backend no
    Entrada radial del DonutChart, count-up del saldo, y celebración (confetti) al cumplir una meta.

11. **Estados de carga y error robustos en todas las pantallas** — Esfuerzo **M** · Backend no
    Skeletons en Analítica/Metas/Recurrentes/Presupuestos y diferenciar "sin datos" de "error de red" con botón Reintentar.

## 🧩 Prioridad baja (nice-to-have)

12. **Estados vacíos ilustrados** (SVG por entidad) — **M**
13. **Personalización del color de acento** (presets en Ajustes) — **M**
14. **Etiquetas (tags) en transacciones** — **L** · Backend sí
15. **Importar extractos CSV/OFX** del banco — **L** · Backend sí
16. **Multi-divisa con tipo de cambio** — **L** · Backend sí
17. **Adjuntar foto/ticket a una transacción** — **L** · Backend sí
18. **Revocación de sesión / refresh tokens** (cerrar sesión en todos los dispositivos) — **M** · Backend sí

## 🧪 Calidad / deuda técnica (transversal a la v2)

- **Tests automatizados** (Jest) empezando por utils puras: `format`, `validators`, `categoryIcon`, interés compuesto.
- **Sincronizar el dump SQL** (`backend/u204231532_Finanzas.sql`) con el esquema real (`goal_id`, `google_sub`).
- **CORS con allowlist** de orígenes en vez de `*`.
- **Mover `expandRecurringTransactions`** fuera del middleware genérico (solo en endpoints que lo necesitan) y fusionar queries de analítica para ahorrar conexiones MySQL.
- **`React.memo`** en `TransactionRow`/`KPICard`/`DonutChart`/`Sparkline`.
