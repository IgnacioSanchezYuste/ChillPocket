import { useAuthStore } from './useAuthStore';
import type { PlanCode, PlanFeatures, PlanLimits } from '../api/types';

export type FeatureKey = keyof PlanFeatures;
export type LimitKey = keyof PlanLimits;

/**
 * Hook de billing. Lee plan/features/limits del usuario autenticado (el backend
 * los adjunta en `/me`, login, register y google). En Fase 1 no fuerza nada en
 * cliente; sirve para mostrar locks/badges premium y para que la UI del paywall
 * sepa qué plan está activo. La enforcement dura llega en Fase 2.
 */
export function useBilling() {
  const user = useAuthStore((s) => s.user);
  const plan: PlanCode = (user?.plan_code as PlanCode | undefined) ?? 'free';
  const features = user?.features ?? {};
  const limits = user?.limits ?? {};

  return {
    plan,
    planName: user?.plan_name ?? 'Gratis',
    planSource: user?.plan_source ?? null,
    isPremium: !!user?.is_premium,
    isPlus: plan === 'plus',
    isFamily: plan === 'family',
    isProFreelance: plan === 'pro_freelance',
    isWebAllowed: !!user?.is_web_allowed,
    isEarlyAdopter: user?.plan_source === 'early_adopter',
    /** `false` → la feature está bloqueada en este plan. */
    hasFeature: (k: FeatureKey): boolean => !!features[k],
    /** `null` = ilimitado. `undefined` = el plan no define ese límite. */
    getLimit: (k: LimitKey): number | null | undefined => limits[k] as number | null | undefined,
  };
}
