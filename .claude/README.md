# Sistema de agentes de ChillPocket

Este directorio configura Claude Code para trabajar sobre ChillPocket. Las instrucciones que se cargan en cada
sesión están en `../CLAUDE.md`; las reglas, en `knowledge/conventions.md`.

## Modelo
```
                 TÚ (jefe)
                    │ "quiero X"
                    ▼
     ┌───────────────────────────────┐
     │  SESIÓN PRINCIPAL (Claude)    │  entiende · planifica · IMPLEMENTA · verifica · reporta
     └──────────────┬────────────────┘
        solo cuando aporta │
     ┌──────────────┬──────┴───────┬───────────────────┐
     ▼              ▼              ▼                   ▼
  paralelo       revisión       criterio            búsqueda
  backend-eng.   cybersecurity  marketing-expert    Explore
  frontend-eng.  qa-tester      ui-designer         (integrado)
```
- La sesión principal tiene todo el contexto de la conversación, así que implementa ella.
- Cada subagente empieza de cero: solo compensa si trabaja **en paralelo**, si su **mirada independiente** es el
  valor (seguridad, QA) o si aporta un **criterio especializado** (marketing, diseño).
- Un subagente no puede lanzar otros subagentes; por eso ya no hay un agente "project-master".

## Equipo (`agents/`)
| Agente | Modelo | Cuándo |
|---|---|---|
| `backend-engineer` | el de la sesión | Backend en paralelo, con el contrato cerrado. |
| `frontend-engineer` | el de la sesión | Frontend en paralelo, con el contrato cerrado. |
| `ui-designer` | sonnet | Rediseños, opciones de layout, consistencia visual. |
| `qa-tester` | opus | Revisión final de cambios de dinero, periodos, metas, planes; tests de Jest. |
| `cybersecurity-engineer` | opus | Revisión obligatoria de auth, SQL, CORS, ficheros, webhooks y secretos. |
| `marketing-expert` | sonnet | Copy, onboarding, paywall, pricing, ASO, retención. |

## Piezas
| Ruta | Qué es |
|---|---|
| `knowledge/` | Documentación viva de la app. Se actualiza en el mismo cambio que el código. |
| `Tareas/` | Planes de features largas con handoff entre sesiones. `TareaSiguiente.md` es la plantilla. |
| `hooks/` | Comprobaciones automáticas (ver tabla en `knowledge/conventions.md`). |
| `settings.json` | Permisos compartidos, reglas `deny` sobre secretos y registro de hooks. |
| `settings.local.json` | Permisos personales de cada máquina (no se versiona). |

## Flujo de trabajo del jefe
1. **Tarea pequeña**: pídela en una frase. Revisa el resumen y lo que haya que desplegar.
2. **Feature grande**:
   1. Escribe la idea en `Tareas/TareaSiguiente.md` (o pídeselo a Claude).
   2. En una sesión: *"Lee TareaSiguiente.md, plantéalo con el equipo y cierra las decisiones conmigo"*.
      Sale un `Tareas/<Feature>.md` con fases.
   3. Por cada fase: *"Implementa la fase N de `<Feature>.md`"*. Al acabar, Claude marca la fase y escribe el handoff.
   4. Despliega lo indicado (SQL → FTP → EAS) y confirma a Claude qué está en producción.
   5. Si la conversación se hace larga, empieza una sesión nueva: con el `.md` de la tarea basta para seguir.
3. **Antes de commitear**: `npm run check`. Pide el commit a Claude o hazlo tú; no se commitea solo.
4. Revisa o desactiva hooks con `/hooks` y permisos con `/permissions`.

## Al clonar en otro PC
1. `npm install`.
2. Crear `.env` a partir de `.env.example` (Claude no puede leerlo ni escribirlo).
3. Abrir Claude Code en la raíz. `CLAUDE.md`, agentes y hooks se cargan solos (los hooks necesitan `node`;
   el lint de PHP usa `php` del PATH o `C:\xampp\php\php.exe`, y si no hay PHP simplemente no se ejecuta).
