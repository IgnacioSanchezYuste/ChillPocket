/**
 * Sistema de eventos placeholder. En Fase 2 se conectará a un proveedor real
 * (Amplitude / PostHog / Firebase). De momento es un no-op en producción y
 * un `console.log` en desarrollo, para que las llamadas estén listas.
 */
export type AnalyticsEvent =
  | 'paywall_viewed'
  | 'upgrade_clicked'
  | 'purchase_started'
  | 'purchase_success'
  | 'purchase_failed'
  | 'plan_limit_reached'
  | 'restore_purchases';

export function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event}`, props ?? {});
  }
  // Fase 2: provider.track(event, props)
}
