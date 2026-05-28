# Recibos en transacciones + Estadísticas de meta de ahorro — Plan de implementación

> Plan consensuado por el equipo (backend, ciberseguridad, frontend, UI, QA, marketing)
> el 2026-05-28, orquestado por project-master. Las decisiones de producto YA están
> cerradas con el jefe (ver §1). NO replantees el diseño; impleméntalo en el orden de §3.
> Estado: **TODAS LAS FASES IMPLEMENTADAS (2026-05-28).** `npx tsc --noEmit` limpio.
> Revisión de seguridad: VERDE (10/10 MUST + hardening de área de imagen aplicado).
> **PENDIENTE DE DESPLIEGUE Y QA DINÁMICA** (ver §5 y §6). Backend NO desplegado aún;
> requiere FTP + SQL + rebuild EAS (expo-image-picker). La QA en vivo (subida real,
> IDOR, picker web/nativo) la hace el jefe tras desplegar.
>
> Resumen por fase:
> - Fase 1 (backend): `transactions.receipt_path`, flag `receipt_photos` en plan plus (lifetime hereda de plus), 3 endpoints receipt (POST/GET/DELETE con gate Plus server-side, magic bytes, re-encode GD, path-traversal guard, área≤24MP), unlink en `DELETE /transactions/{id}`, `summary.savings_goal_stats` en `/analytics/all`, `backend/Images/.htaccess` (deny total). ✅
> - Fase 2 (datos frontend): tipos (`receipt_path`, `SavingsGoalStats`, `PlanFeatures.receipt_photos`), `transactionsApi.uploadReceipt/deleteReceipt/getReceiptUrl`, componente `AuthImage` (`.web`=fetch+blob+objectURL, `.native`=Image+headers), `expo-image-picker@~17.0.11` + permisos en `app.json`. ✅
> - Fase 3 (UI form): `TransactionSheet` rediseñado + bloque foto (estados vacío/local/server/subiendo/error/Plus-locked), helpers `receiptPicker.web/native`, flujo crear→subir y editar→reemplazar/quitar, validación 5MB cliente, contrato `onSaved` intacto (onboarding no se rompe). ✅
> - Fase 4 (UI analítica): sección "Meta de ahorro" en `AnalyticsScreen` (gratis: meses cumplidos + racha con copy motivador; Plus: mejor racha/%/superados + BarChart con línea de meta, tras `PremiumLock`). Anti dark-pattern: la racha siempre visible en gratis. ✅
>
> Limitación conocida: el `BarChart` (chart-kit) con `fromZero` puede truncar visualmente los meses de surplus negativo a 0; el valor y los totales sí los reflejan. Aceptable; revisar si molesta en producción.

---

## 1. Decisiones de producto cerradas (NO volver a preguntar)

| Punto | Decisión |
|---|---|
| Quién sube fotos de recibo | **Solo Plus/Lifetime** (gate `receipt_photos`, validado server-side). |
| Nº de fotos por transacción | **Una** (columna simple, no tabla 1:N). |
| Dónde se guardan | En el servidor, carpeta **`backend/Images/`**; en BDD la **ruta** (`transactions.receipt_path`). |
| Privacidad de las fotos | **Privadas.** Se sirven SOLO por endpoint autenticado con check de propiedad. Nunca URL pública. |
| Stats de ahorro — gratis | **Meses cumplidos + racha actual** (gancho de retención para todos). |
| Stats de ahorro — Plus | Mejor racha, % meses cumplidos, meses superados, gráfica de la serie (`advanced_analytics`). |
| Histórico de meta | Se compara `monthly_closures.surplus` contra el **objetivo ACTUAL** (`users.savings_goal_monthly`). No se guarda histórico de objetivos. Limitación asumida y comunicada. |

---

## 2. Contrato cerrado (Ola 1: backend + seguridad)

### 2.1 Fotos de recibo

**SQL (idempotente, a `backend/update.sql`)**
- `ALTER TABLE transactions ADD COLUMN receipt_path VARCHAR(255) NULL` (con guard `information_schema`).
- Añadir flag `receipt_photos:true` al `features_json` de planes `plus` y `lifetime` (UPDATE idempotente con `JSON_SET`); `false`/ausente en `free`.

**Almacenamiento**
- `backend/Images/{user_id}/{random32hex}.{jpg|png|webp}`. Nombre 100% generado server-side (`bin2hex(random_bytes(16))`), el nombre del cliente se IGNORA.
- En BDD se guarda la ruta relativa (`Images/{user_id}/{file}`). Al servir, se compone la ruta física validando que no contiene `..`.

**`backend/Images/.htaccess`** (defensa contra el `!-f` del `.htaccess` raíz, que sirve archivos reales sin pasar por Slim):
- `Options -Indexes` (sin listado).
- Denegar ejecución de `.php .phtml .phar .php3-8 .pht` (FilesMatch deny + `php_flag engine off` si el plan lo permite).
- **Denegar acceso directo TOTAL** (`Require all denied` / `Deny from all`): las imágenes solo salen por el endpoint PHP. Verificar precedencia sobre el `.htaccess` raíz.

**Endpoints (todos JWT; `user_id` del token):**
| Método | Ruta | Notas |
|---|---|---|
| `POST` | `/transactions/{id}/receipt` | Gate Plus **server-side**. Multipart campo `receipt`. Valida propiedad (tx.user_id==jwt), **magic bytes** (jpg/png/webp, NO extensión/Content-Type), tamaño ≤ 5 MB (en código, no solo php.ini), dimensiones ≤ ~4000px. **Re-encoda con GD** (normaliza a JPEG ~85%, neutraliza polyglots, **strip EXIF/GPS**). Reemplazo borra el archivo anterior. Devuelve `{success, receipt_url:"/transactions/{id}/receipt"}`. Errores: 403 (no Plus / no es tuya), 404, 413, 415, 400. |
| `DELETE` | `/transactions/{id}/receipt` | Check propiedad → `unlink()` + `receipt_path=NULL`. |
| `GET` | `/transactions/{id}/receipt` | Check propiedad → stream del archivo. Headers: `Content-Type` correcto + `X-Content-Type-Options: nosniff` + `Content-Disposition: inline` + `Cache-Control: private`. Nunca `text/html`. |
| `DELETE /transactions/{id}` (existente) | — | Antes de borrar la fila, leer `receipt_path` y `unlink()` el archivo. |

**Flujo de 2 pasos**: crear/editar la transacción primero (`POST/PUT /transactions`), luego subir/borrar la foto sobre ese `id`. Más simple y robusto que multipart en el create.

### 2.2 Stats de meta de ahorro

Se AÑADE `savings_goal_stats` al `summary` de `GET /analytics/all` (additivo, retrocompatible, **+1 query SQL**, 0 round-trips). Cálculo en PHP sobre `SELECT period_start, surplus FROM monthly_closures WHERE user_id=:u ORDER BY period_start ASC` + `users.savings_goal_monthly`:

```json
"savings_goal_stats": {
  "goal": 300.00,
  "months_met": 4,            // surplus >= goal (y goal>0)
  "months_exceeded": 1,       // surplus > goal
  "current_streak": 2,        // meses consecutivos recientes cumpliendo
  "best_streak": 3,
  "total_saved": 1240.50,     // SUM(surplus), incluye negativos
  "avg_monthly_surplus": 206.75,
  "pct_months_met": 66.67,
  "series": [ { "period_start":"2025-01-15", "surplus":350, "goal":300, "met":true } ]
}
```
- `goal` NULL/0 → campos de cumplimiento `null`; `total_saved`/`avg` se siguen calculando; `met=null` en serie.
- 0 cierres → numéricos `null`, `series:[]`.
- El backend devuelve TODO; el **gate Plus lo aplica el frontend** en visualización (no hay dato sensible).

### 2.3 Riesgos backend/infra a VERIFICAR en el primer deploy
- ¿`gd` disponible? (`extension_loaded('gd')`). Sin GD → rechazar upload (no guardar original). Imagick como fallback solo si está.
- ¿`.htaccess` del plan respeta `php_flag engine off` y la precedencia de subcarpeta sobre el `!-f` raíz? Si no → considerar carpeta fuera del webroot.
- `upload_max_filesize`/`post_max_size` reales (en Hostinger compartido el php.ini en carpeta no siempre aplica → guard en código obligatorio).
- Permisos de escritura del proceso PHP en `Images/` (crear carpeta 755 por FTP).
- Disco compartido: 5 MB/foto + re-encode mantiene ~1-2 MB reales. Monitorizar.

---

## 3. Fases de implementación (orden recomendado)

### Fase 1 — Backend + seguridad (PHP/SQL)
- `update.sql`: columna `receipt_path` + flag `receipt_photos` en planes plus/lifetime.
- `index.php`: 3 handlers de receipt (con TODO el checklist de seguridad de §2.1 y §4), unlink en `DELETE /transactions/{id}`, y bloque `savings_goal_stats` en `/analytics/all`.
- Crear `backend/Images/` + `backend/Images/.htaccess` (hard-deny).
- **Deploy**: ejecutar `update.sql` en phpMyAdmin → FTP `index.php` → crear carpeta `Images/` (755) + subir `Images/.htaccess`. Verificar §2.3.
- **Revisión obligatoria de cybersecurity-engineer** antes de exponer.

### Fase 2 — Frontend datos + AuthImage (TS, sin UI fina)
- `types.ts`: `Transaction.receipt_path?: string|null`; `SavingsGoalStats` + `AnalyticsSummary.savings_goal_stats?`; `PlanFeatures.receipt_photos?: boolean`.
- `endpoints.ts`: `transactionsApi.uploadReceipt(id, FormData)`, `deleteReceipt(id)`, `getReceiptUrl(id)` (solo construye string). Override `Content-Type: multipart/form-data` en el upload.
- Componente **`AuthImage`** (privada/autenticada):
  - `.native.tsx`: `<Image source={{uri, headers:{Authorization: Bearer <token>}}}>`.
  - `.web.tsx`: `fetch(url,{headers})` → blob → `URL.createObjectURL` → `<img src>`; `revokeObjectURL` en cleanup.
  - Token vía `secureGet(TOKEN_KEY)` (async; estado de carga). Loading/skeleton + error fallback.
- **`expo-image-picker`**: NO está en `package.json`. Añadirlo + `app.json` (`plugins:["expo-image-picker"]`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, permisos Android). → **Requiere rebuild del dev client EAS** para nativo. Web funciona sin rebuild (usa `<input type=file>`; si Metro da problemas en web, fallback a `<input>` en variante `.web.tsx`).

### Fase 3 — UI: rediseño de `TransactionSheet`
- Layout premium (spec ui-designer): importe héroe, toggle gasto/ingreso (tiñe el form: danger/success), categoría en chips, fecha + método en 2 columnas, selector `scope` (Saldo del mes / Mis ahorros) **intacto**, notas, botón guardar `gradientBalance`.
- **Bloque FOTO** con estados: vacío (cámara/galería), miniatura (ver/cambiar/quitar vía `AuthImage`), subiendo (ProgressBar), error (reintentar), y **Plus-locked** (free ve teaser con candado → paywall; nunca el control real).
- Flujo crear: `create()` → si hay foto, `uploadReceipt(created.id, ...)`. Si falla la foto: toast "Transacción guardada, no se pudo subir la foto". Editar: PUT → delete/replace de foto según flags. Límite 5 MB validado en cliente antes de subir.

### Fase 4 — UI: stats de ahorro en `AnalyticsScreen`
- Sección "Meta de ahorro" (consume `summary.savings_goal_stats`, 0 peticiones nuevas), tras las delta-cards y antes del donut.
- **Gratis**: KPIs "Meses cumplidos" + "Racha actual" (llama/badge), card motivadora. Estados: sin goal → EmptyState con CTA a Goals; sin cierres → skeleton/empty.
- **Plus** (`PremiumLock`/`advanced_analytics`): mejor racha, % cumplido, meses superados + **gráfica de barras por mes** (surplus, línea de meta, verde si cumplido/rosa si no) con `react-native-chart-kit` (ya usado en NetWorthScreen). Respetar `useContentWidth` en web.
- **Marketing (dark-pattern check)**: el número de racha actual SIEMPRE visible en gratis; el candado cubre SOLO el bloque de detalle, jamás la racha en sí.

### Fase 5 — Copy (integrado en 3/4)
- Racha: "Racha de ahorro". Microcopy por estado (primer mes / activa / rota sin culpa / hitos 3-6-12 meses como toast pasivo).
- Teaser foto (form): *"Guarda el justificante — Adjunta la foto del ticket a esta transacción. Solo en ChillPocket Plus." [Ver Plus]*.
- Teaser stats (Analítica): *"Tu racha, en detalle — Con Plus ves tu mejor racha, el % de meses cumplidos y la evolución mes a mes." [Ver Plus]*.
- Changelog/ASO: ver notas del marketing-expert (recibos + racha gratis + detalle Plus, mensaje "control + tranquilidad").

### QA — antes de dar por terminado
- Plan completo del qa-tester. P0 imprescindibles: gate Plus server-side (free 403), IDOR (ver/borrar recibo ajeno), `.php` disfrazado, >5 MB, tipo no permitido, path traversal, borrado de archivo al borrar tx, **lazy load (0 peticiones de imagen en listados)**, retrocompat de `/analytics/all`, edge cases de stats (goal null/0, surplus negativo, racha rota/reanudada, goal cambiado, 36+ meses), web vs nativo del picker, scope intacto en el form rediseñado.

---

## 4. Checklist de seguridad OBLIGATORIO (cybersecurity-engineer)
MUST (bloqueantes): anti-ejecución en `/Images` + hard-deny de acceso directo · nombre server-side aleatorio · validación por magic bytes (rechazar SVG) · re-encode (GD) + strip EXIF · autorización (propiedad) en servir Y borrar · gate de plan server-side · una foto/tx (reemplazo borra anterior) · límite tamaño+dimensiones server-side · headers `nosniff`/Content-Type correcto al servir · errores neutros.
NICE: cuota de almacenamiento por usuario, rate-limit de uploads, recomprimir a ancho máx.

---

## 5. Despliegue (resumen)
1. phpMyAdmin: `update.sql` (idempotente).
2. FTP: `index.php` + crear `Images/` (755) + `Images/.htaccess`.
3. Frontend: `npm i expo-image-picker` + permisos `app.json` → `eas build` (rebuild dev client nativo; web no lo necesita).
4. `npx tsc --noEmit` limpio. Verificar §2.3 tras el primer deploy.

> **EAS rebuild**: necesario UNA vez por `expo-image-picker`. La feature de fotos no funciona en nativo hasta ese build; web sí desde Metro.
