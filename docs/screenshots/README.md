# Cómo añadir capturas de pantalla a ChillPocket

Esta carpeta contiene las capturas de pantalla que se muestran en el README principal del repositorio.
El README ya tiene las rutas configuradas — basta con dejar caer aquí los archivos PNG con los nombres
exactos indicados abajo para que se rendericen automáticamente en GitHub.

---

## Archivos esperados

| Nombre de archivo | Pantalla que representa |
|---|---|
| `dashboard.png` | Pantalla principal — Resumen mensual, BalanceHero, KPIs y movimientos recientes |
| `analytics.png` | Analítica — DonutChart por categoría, forecast, heatmap de hábitos |
| `transactions.png` | Movimientos — Historial completo con filtros y búsqueda |
| `goals.png` | Metas de ahorro — Lista de metas con modelo envelope |
| `budgets.png` | Presupuestos — Límites por categoría con barra de progreso |
| `onboarding.png` | Onboarding — Pantalla de bienvenida o paso del tutorial con spotlight |
| `login.png` | Login — Pantalla de inicio de sesión con email y Google OAuth |
| `dark-mode.png` | Cualquier pantalla con el tema oscuro activo (p. ej. Dashboard oscuro) |

---

## Recomendaciones de captura

- **Formato:** PNG (sin pérdida, fondo transparente innecesario — fondo de app real).
- **Resolución:** Capturas de móvil a resolución nativa o escaladas a ~1080 px de ancho.
  Para una galería más limpia en GitHub, se recomienda usar un **mockup/frame de teléfono**
  (p. ej. frame de iPhone o Pixel exportado desde Figma, Mockuphone o similares).
- **Tamaño de archivo:** Intenta mantener cada PNG por debajo de 500 KB.
  Puedes comprimir con [Squoosh](https://squoosh.app) o `pngquant` sin pérdida visible.
- **Proporción:** Si usas frames, 9:19.5 (pantalla moderna) queda bien.
  Sin frame, la proporción nativa del dispositivo es perfecta.

---

## Proceso para actualizar

1. Toma la captura desde el simulador, Expo Go o un dispositivo físico.
2. Opcional: aplica un frame de teléfono para mayor impacto visual.
3. Renombra el archivo exactamente como aparece en la tabla de arriba
   (en minúsculas, con guion, sin espacios).
4. Copia el archivo en esta carpeta (`docs/screenshots/`).
5. Haz push. GitHub renderizará las imágenes automáticamente en el README.

No es necesario modificar el README principal — las rutas ya están configuradas.

---

## Nota sobre el modo oscuro

Se recomienda incluir al menos una captura en modo oscuro (`dark-mode.png`) para mostrar
la coherencia del design system en ambos temas. El Dashboard o la pantalla de Analítica
quedan especialmente bien en oscuro.
