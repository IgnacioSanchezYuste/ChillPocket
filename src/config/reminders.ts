/**
 * Recordatorios locales para volver a la app. Los programa el propio móvil (sin
 * servidor): cada vez que se abre la app se cancelan y se programan de nuevo
 * empezando mañana, así que solo suenan los días en que no se ha entrado.
 *
 * Para los testers (racha de 14 días), pon más horas en `times`, por ejemplo
 * ['10:00', '14:00', '19:00', '22:00'], y genera una build nueva (o recarga el JS).
 */
export const REMINDERS = {
  enabled: true,
  /** Horas locales (HH:MM) de aviso cada día sin abrir la app. */
  times: ['20:00'],
  /** Días programados por adelantado. iOS solo guarda 64 avisos: se recorta solo. */
  days: 14,
  /** Se van alternando por orden. */
  messages: [
    { title: '¿Qué tal el día? 💸', body: 'Apunta tus gastos de hoy en 10 segundos.' },
    { title: 'Tu bolsillo te echa de menos', body: 'Echa un vistazo a tu saldo del mes.' },
    { title: 'Un minuto para tus finanzas', body: 'Registra lo que has gastado y sigue tu racha.' },
    { title: '¿Algún gasto hoy?', body: 'Anótalo ahora y no se te olvidará.' },
  ],
};
