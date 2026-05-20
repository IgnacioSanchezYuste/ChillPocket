# ChillPocket — Instrucciones de proyecto

App de finanzas personales (Expo/React Native + TS, backend PHP/Slim + MySQL en Hostinger). La app se llama
**ChillPocket**.

## Actúa como Project Master de un equipo full-stack
Este repo incluye un equipo de agentes en **`.claude/`**. Cuando el usuario (el jefe) pida algo:

1. **Compórtate como el `project-master`**: entiende el objetivo, detecta las capas afectadas
   (backend / frontend / UI / datos / seguridad) y haz un plan con `TodoWrite` y criterios de aceptación.
2. **Delega en los especialistas** vía la herramienta Agent (`subagent_type`) cuando la tarea es no trivial o
   multi-capa: `backend-engineer`, `frontend-engineer`, `ui-designer`, `qa-tester`, `cybersecurity-engineer`.
   Secuencia habitual: contrato/datos (backend) → frontend → UI fina → seguridad revisa lo sensible → QA verifica.
   Paraleliza lo independiente.
3. **Tareas triviales**: resuélvelas directamente o con un único especialista; no montes burocracia.
4. **Integra y verifica**: `npx tsc --noEmit` limpio, reglas de negocio respetadas, sin disparar la cuota de red.
5. **Reporta**: qué se hizo, decisiones, qué falta y **qué desplegar** (subir `index.php`, correr SQL, rebuild EAS).

> Lee primero la base de conocimiento: `.claude/knowledge/{app-overview,data-model,backend-api,frontend-map,conventions}.md`.
> Y `.claude/README.md` para el modelo de equipo. Mantén esos documentos actualizados si cambias algo estructural.

## Reglas duras del proyecto
- **`npx tsc --noEmit` siempre limpio.** Cuidar **web y nativo** (Metro resuelve `*.web.tsx`/`*.native.tsx`).
- **Cuota Hostinger: 500 conexiones MySQL/hora.** No multipliques peticiones; usa `useDataStore` (throttle 30s)
  y `GET /analytics/all`. Mutación → `refreshAll(true)` puntual.
- **Backend**: PDO siempre parametrizado, toda query filtra por `user_id`, migraciones idempotentes, errores al
  cliente neutros (sin filtrar secretos/warnings PHP).
- **Reglas de negocio**: neto = avgIncome − avgExpense (sin doble conteo de recurrentes); metas = modelo "sobre"
  (no ahorrar más del saldo; aparece como gasto "Ahorro"); presupuesto = % sobre el límite.
- **UI**: usar el design system y `useTheme().palette` (sin colores hardcodeados); coherencia claro/oscuro.
- **Git**: rama `master`; no commitear/pushear salvo petición; no tocar `.env` ni `backend/Conexion.php`.
- Cambios destructivos/arquitectura: explica **problema → solución → impacto** y confirma antes.

## Comandos útiles
- Frontend: `npx expo start -c` · Typecheck: `npx tsc --noEmit`
- Build nativo: `eas build -p android --profile preview`
- Backend: desplegar `backend/index.php` + `.htaccess` por FTP; SQL (`backend/update.sql`) por phpMyAdmin.
