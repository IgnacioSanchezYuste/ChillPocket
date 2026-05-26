# Equipo full-stack de ChillPocket (sistema de agentes de Claude)

Este directorio convierte a Claude Code en un **equipo de ingeniería senior** que trabaja sobre ChillPocket.
Tú eres el jefe: le dices un objetivo y el **Project Master** lo organiza y pone a trabajar a los especialistas.

## Cómo funciona (modelo mental)
```
            TÚ (jefe)
               │  "quiero X"
               ▼
     ┌─────────────────────┐
     │   PROJECT MASTER     │  planifica · descompone · delega · integra · verifica · reporta
     └─────────┬───────────┘
    ┌───────┬───┴────┬─────────┬───────────────┬───────────────┐
    ▼       ▼        ▼         ▼               ▼               ▼
 backend frontend  ui      qa-tester   cybersecurity     marketing
 engineer engineer designer            engineer           expert
```

- El **hilo principal de Claude** actúa como Project Master (lo fija `CLAUDE.md`, que Claude carga solo).
- Para tareas no triviales, descompone el trabajo y **delega** en los subagentes especialistas
  (`.claude/agents/*.md`) con la herramienta de tareas/Agent.
- Para tareas triviales, lo resuelve directo sin burocracia.

## El equipo (`.claude/agents/`)
| Agente | Rol | Cuándo |
|---|---|---|
| `project-master` | Líder técnico / orquestador | Cualquier petición multi-capa; planificar y coordinar. |
| `backend-engineer` | API PHP/Slim, MySQL, JWT, negocio | Endpoints, SQL, migraciones, auth de servidor. |
| `frontend-engineer` | React Native/Expo, stores, API | Pantallas, navegación, estado, integración. |
| `ui-designer` | Diseño visual / design system | Estética premium, layouts, claro/oscuro, microinteracciones. |
| `marketing-expert` | Marketing / growth | Posicionamiento, ASO, copy, onboarding, pricing, campañas, research. |
| `qa-tester` | QA / pruebas | Casos de prueba, repro de bugs, aceptación, regresiones. |
| `cybersecurity-engineer` | AppSec (defensivo) | Auth, autorización, validación, secretos, CORS, SQLi/XSS. |

## Conocimiento compartido (`.claude/knowledge/`)
Todos los agentes leen esto antes de trabajar — es la fuente de verdad de "cómo funciona la app entera":
- `app-overview.md` — qué es, stack, estructura, cómo ejecutar, restricciones clave.
- `data-model.md` — tablas, relaciones, modelo "sobre" de metas, reglas numéricas.
- `backend-api.md` — **cada endpoint**: método, ruta, auth, params, respuesta.
- `frontend-map.md` — pantallas, navegación, stores, componentes, tema, onboarding.
- `conventions.md` — estilo, rendimiento/red, git, seguridad mínima, Definition of Done.

> Mantén estos documentos vivos: si cambias el esquema, un endpoint o el design system, actualízalos.

## Uso al clonar en otro PC
1. Abre Claude Code en la raíz del repo. `CLAUDE.md` se carga automáticamente y activa el rol de Project Master.
2. Dile lo que quieres en lenguaje natural ("añade exportar a CSV", "el donut se ve mal en oscuro", "revisa la
   seguridad del login"). Claude planifica y reparte entre el equipo.
3. También puedes invocar a un especialista directamente: pídelo por su nombre (p.ej. "que el `ui-designer`
   rediseñe la pantalla de metas") o usa `@`/el selector de agentes de tu cliente.

## Reglas de oro (resumen)
- `npx tsc --noEmit` siempre limpio. Cuidar **web y nativo**.
- No multiplicar peticiones HTTP (Hostinger: 500 conexiones MySQL/hora). Usar `useDataStore` y `/analytics/all`.
- Autorización por `user_id`, SQL parametrizado, sin secretos en logs, migraciones idempotentes.
- Cambios destructivos/arquitectura: explicar **problema → solución → impacto** y confirmar.
