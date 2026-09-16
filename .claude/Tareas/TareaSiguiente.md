# Tarea siguiente

> Buzón para la próxima feature grande. Escribe la idea en "Petición" y pide a Claude:
> *"Lee `.claude/Tareas/TareaSiguiente.md`, plantéalo con el equipo y cierra las decisiones conmigo"*.
> Claude la convertirá en `.claude/Tareas/<Nombre>.md` con la estructura de abajo y vaciará este buzón.

## Petición
_(tu idea, en lenguaje natural)_

---

<!-- Estructura del plan que genera Claude (copiar a Tareas/<Nombre>.md) -->

# <Nombre de la feature> — Plan de implementación

> Estado: ⬜ sin empezar · Última actualización: AAAA-MM-DD

## 0. Handoff (léelo antes de nada)
- Fase actual y qué queda.
- Qué está desplegado y qué no (SQL / FTP / EAS). Confírmalo con el usuario al arrancar.
- Gotchas que no se pueden olvidar.

## 1. Decisiones cerradas (no replantear)
| Punto | Decisión |
|---|---|

## 2. Contrato
- SQL (sección nueva en `backend/update.sql`).
- Endpoints (request / response / errores).
- Tipos en `src/api/types.ts`.

## 3. Fases
- [ ] Fase 1 — … (backend / frontend / UI). Criterios de aceptación: …
- [ ] Fase 2 — …

Al cerrar una fase: marca la casilla, añade una nota con fecha, qué quedó pendiente y qué desplegar.

## 4. Revisión
- Seguridad (`cybersecurity-engineer`): veredicto.
- QA (`qa-tester`): veredicto, tests añadidos, pruebas manuales pendientes.

## 5. Despliegue
1. SQL en phpMyAdmin (§…).
2. FTP de `backend/index.php`.
3. Rebuild EAS (solo si hay módulos nativos o variables nuevas).
