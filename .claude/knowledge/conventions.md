# ChillPocket — Reglas y convenciones (fuente única)

> Este es el **único** sitio donde viven las reglas comunes. `CLAUDE.md` lo importa y los agentes lo leen.
> No las copies en otros documentos: enlaza aquí.

## Reglas duras
1. **`npx tsc --noEmit` limpio** y **`npm test` en verde**. Cuidar **web y nativo** (Metro resuelve
   `*.web.tsx` / `*.native.tsx`).
2. **Cuota Hostinger: 500 conexiones MySQL/hora.** No multipliques peticiones: todo pasa por `useDataStore`
   (throttle 30 s) y la analítica por `GET /analytics/all`. Tras una mutación, un único `refreshAll(true)`.
   Nada de polling. En backend, reutiliza la conexión PDO y agrupa consultas.
3. **Backend**: PDO **siempre** parametrizado; **toda** query filtra por `user_id` (tomado del JWT, nunca del
   body); migraciones SQL **idempotentes** (`IF NOT EXISTS` + guards en `information_schema`); errores al cliente
   neutros (`{error:true,message}`), el detalle a `error_log`; `display_errors=0`.
4. **Reglas de negocio** (detalle en `data-model.md`):
   - Neto mensual = `avgIncome − avgExpense` (los recurrentes ya están en las transacciones: no sumarlos otra vez).
   - Metas = modelo "sobre": aportar crea un gasto en la categoría "Ahorro"; no se puede aportar más del saldo disponible.
   - Presupuesto: el % se calcula sobre el **límite** del presupuesto, no sobre el total de gastos.
   - Modelo dual: "Saldo del mes" = periodo en curso (`scope='month'`); "Mis ahorros" = cierres + `scope='historical'`.
5. **UI**: design system (`src/components/`) y `useTheme().palette`; **cero colores hardcodeados**; claro y oscuro
   coherentes; `useContentWidth()` para anchos.
6. **Secretos**: no leer ni tocar `.env*` (salvo `.env.example`) ni `backend/Conexion.php`. Nada de tokens o
   secretos en logs. *(Lo aplican las reglas `deny` y el hook `guard-secrets`.)*
7. **Git**: la rama principal es `master` y se trabaja en `development`. No commitear ni hacer push salvo que el
   usuario lo pida.
8. **Cambios destructivos o de arquitectura**: explicar **problema → solución → impacto** y confirmar antes.

## Qué se comprueba solo (hooks en `.claude/settings.json`)
| Hook | Cuándo | Qué hace |
|---|---|---|
| `guard-secrets.mjs` | Antes de cada comando Bash/PowerShell | Bloquea comandos que mencionen `.env` o `Conexion.php`. |
| `php-lint.mjs` | Tras editar un `.php` | `php -l`; si falla, obliga a corregir. |
| `stop-checks.mjs` | Al terminar cada turno, si hay `.ts/.tsx` modificados | `tsc --noEmit` + `jest --findRelatedTests`; si fallan, no deja terminar. Con caché: solo se repite si cambian los ficheros. |

Los hooks no sustituyen al criterio: ejecuta `npm run check` antes de dar algo por terminado.

## Tests
- Jest con el preset `jest-expo`. Los tests viven en `src/**/__tests__/*.test.ts(x)`.
- Toda lógica de negocio **pura** va en `src/utils/` (sin imports de React Native) y lleva test.
  Ejemplos: `financialPeriod.ts`, `balanceMode.ts`, `validators.ts`.
- Si arreglas un bug de cálculo, añade primero el test que lo reproduce.
- Backend: no hay tests automáticos; `php -l` (PHP de XAMPP en `C:\xampp\php`) y revisión cuidadosa.

## Estilo de código
- TypeScript estricto, componentes funcionales con hooks, estado global con zustand. Evita `any` salvo en libs sin tipos.
- Comentarios en español, concisos, explicando el "por qué". Iguala el estilo del código vecino.
- Persistencia tolerante a basura (patrón `safeParseUser`); nunca guardes `undefined`. Tokens y PIN en
  `secureStorage` (Keystore/Keychain), no en AsyncStorage.
- **Secreto JWT**: `index.php` lo lee de `getenv('JWT_SECRET')` → `Conexion::JWT_SECRET_CONFIG` → constante global.
  Si falta, el backend aborta (fail-closed).

## Despliegue (manual)
- Backend: subir `backend/index.php` (+ `.htaccess` si cambia) por FTP; SQL de `backend/update.sql` por phpMyAdmin
  **antes** de subir el PHP que lo necesita.
- App: rebuild EAS solo si cambian módulos nativos, plugins de `app.json` o variables `EXPO_PUBLIC_*`.
- Comandos listos para copiar: `comandos.txt` en la raíz.

## Definition of Done
1. Cumple lo pedido y respeta las reglas de negocio.
2. `npm run check` limpio (`tsc` + tests). Lógica nueva pura → con test.
3. Funciona en web y nativo (o se indica la limitación).
4. Sin secretos filtrados; autorización por `user_id` correcta. Si toca auth/JWT/CORS/SQL o subida de ficheros
   → revisión de `cybersecurity-engineer`.
5. **Documentación actualizada en el mismo cambio**: si cambia un endpoint, el esquema, una pantalla, un store o
   una regla, se actualiza el `.md` de `knowledge/` correspondiente y, si es una tarea larga, su `Tareas/*.md`.
6. Resumen final: qué cambió, qué falta y **qué desplegar** (FTP, SQL, rebuild EAS).
