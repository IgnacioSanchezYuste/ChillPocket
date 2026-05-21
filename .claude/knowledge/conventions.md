# ChillPocket — Convenciones y flujo de trabajo

## Calidad / verificación
- **Typecheck obligatorio**: `npx tsc --noEmit` debe pasar limpio antes de entregar cambios de frontend.
- No hay framework de tests todavía. El rol **qa-tester** define casos manuales y, si se aprueba, puede introducir
  testing (Jest + React Native Testing Library) de forma incremental sin romper el arranque.
- Backend: no hay `php` local en este entorno; valida con revisión cuidadosa y, si está disponible, `php -l`.

## Estilo de código
- TypeScript estricto en el front. Componentes funcionales + hooks. Estado global con zustand.
- UI: usar **siempre** el design system (`Text`, `Card`, `Button`, `palette`...). Nada de colores hardcodeados;
  tomar de `useTheme().palette`. Respetar `spacing`/`radius`. Cuidar modo claro y oscuro.
- Comentarios en español, concisos, explicando el "por qué" no el "qué". Igualar el estilo del código vecino.
- Backend PHP: mantener el patrón Slim existente, consultas PDO **siempre parametrizadas**, filtrar por `user_id`.
- **Secreto JWT**: `index.php` lo lee, en orden, de `getenv('JWT_SECRET')` → `Conexion::JWT_SECRET_CONFIG`
  (constante de la clase `Conexion` en `backend/Conexion.php`, NO versionado) → constante global `JWT_SECRET_CONFIG`.
  Si falta, el backend aborta (fail-closed). Nunca poner el secreto en el repo.

## Rendimiento / red (CRÍTICO)
- Hostinger limita a **500 conexiones MySQL/hora**. Minimiza peticiones: usa `/analytics/all`, respeta el
  throttle de 30s de `useDataStore`, no pongas polling agresivo. Mutación → `refreshAll(true)` puntual.

## Git
- Rama por defecto: `master`. No commitear ni pushear salvo que el usuario lo pida; si pide commit y estás en
  `master`, crear rama antes. Mensajes claros. No tocar `.env` ni `backend/Conexion.php` (no versionados).
- Cambios de backend se despliegan manualmente (FTP + phpMyAdmin); avisa al usuario de qué subir.

## Seguridad mínima en cada cambio
- No registrar secretos ni tokens en logs. No exponer detalles internos en mensajes de error al cliente.
- Validar/sanear input en backend (montos, fechas `YYYY-MM-DD`, longitudes). Autorización por `user_id` siempre.
- Cualquier cambio que toque auth, JWT, CORS o queries SQL pasa revisión del rol **cybersecurity-engineer**.

## Cambios destructivos / arquitectura
- No hagas cambios destructivos (borrar features, migraciones no idempotentes, reescrituras grandes) sin
  explicar antes **problema → solución → impacto** y, si afecta a datos/arquitectura, confirmarlo.
- Las migraciones SQL deben ser **idempotentes** (ver `backend/update.sql`).

## Definition of Done (común)
1. Cumple lo pedido y respeta las reglas de negocio (ver `data-model.md`).
2. `npx tsc --noEmit` limpio (frontend).
3. Funciona en web y nativo (o se indica la limitación).
4. Sin secretos filtrados; autorización correcta.
5. Resumen claro de qué cambió, qué falta y qué debe desplegar el usuario.
