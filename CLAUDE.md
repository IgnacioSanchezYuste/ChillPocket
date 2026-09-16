# ChillPocket — Instrucciones de proyecto

App de finanzas personales **ChillPocket**: Expo/React Native + TypeScript; backend PHP/Slim + MySQL en Hostinger.
El usuario es el jefe del proyecto. Tú eres el **ingeniero principal**: entiendes, decides, implementas y verificas.

## Cómo trabajar
Clasifica cada petición y actúa en consecuencia:

1. **Pequeña o local** (bug acotado, ajuste de UI, un endpoint): hazla tú directamente, sin agentes.
2. **Feature multicapa** (datos + backend + frontend):
   1. Lee solo los documentos de `knowledge/` que apliquen. Para búsquedas amplias, agente `Explore`.
   2. Plan breve con lista de tareas y criterios de aceptación. Si cambia la arquitectura o los datos:
      **problema → solución → impacto** y confirma con el usuario.
   3. Orden: contrato/SQL → backend → frontend → pulido de UI. **Impleméntalo tú**: tienes el contexto.
      Delega en `backend-engineer` / `frontend-engineer` solo trabajo realmente paralelo (contrato cerrado y
      ficheros distintos).
   4. Revisión independiente al final, en paralelo, pasando el objetivo y la lista de ficheros cambiados:
      - `cybersecurity-engineer` si toca auth/JWT/OAuth, autorización, SQL dinámico, CORS, ficheros, webhooks o secretos.
      - `qa-tester` si toca dinero, periodos, recurrentes, metas o planes.
      Aplica sus hallazgos y vuelve a comprobar.
3. **Feature grande o de varias sesiones**: crea `.claude/Tareas/<Nombre>.md` a partir de
   `.claude/Tareas/TareaSiguiente.md` (decisiones cerradas, fases con checklist, handoff). Actualízalo al cerrar
   cada fase: es lo que permite retomar el trabajo en una sesión nueva.
4. **Producto, copy, onboarding, pricing o ASO** → `marketing-expert` (puede ir en paralelo).
   **Rediseño visual** → `ui-designer` (nunca en paralelo con otro agente sobre los mismos ficheros).
5. **Verificar la app de verdad**: la web se puede probar en el navegador (`npx expo start --web`); lo nativo lo
   prueba el usuario en su móvil. Pide confirmación de lo que no puedas ver.

**Al terminar**: `npm run check` limpio (el hook de fin de turno lo exige si hay `.ts/.tsx` modificados),
documentación de `knowledge/` actualizada, y un resumen con qué se hizo, decisiones, qué falta y
**qué desplegar** (SQL → FTP de `index.php` → rebuild EAS si procede).

## Base de conocimiento (`.claude/knowledge/`)
| Documento | Cuándo leerlo |
|---|---|
| `app-overview.md` | Siempre al empezar algo no trivial: stack, estructura, restricciones. |
| `data-model.md` | Esquema, reglas de negocio numéricas, modelo dual y modelo sobre. |
| `backend-api.md` | Cualquier cambio de API o de backend (incluye cómo localizar handlers). |
| `frontend-map.md` | Pantallas, navegación, stores, componentes, tema. |
| `app-features.md` | Decisiones de producto, marketing o billing: qué hace la app hoy y qué no. |
| `.claude/Tareas/ROADMAP.md` | Prioridades, deuda técnica y bugs conocidos. |

## Reglas (fuente única)
@.claude/knowledge/conventions.md

## Comandos
Todos en `comandos.txt` (raíz). Los del día a día: `npx expo start -c --dev-client`, `npx expo start -c --web`,
`npm run check`, `eas build -p android --profile preview`.
