import { Platform } from 'react-native';
import type { PlanCode } from '../api/types';

/**
 * Wrapper fino de RevenueCat. Carga el SDK de forma "lazy" + protegida para
 * que la app siga arrancando en Expo Go y en web (donde el SDK nativo no
 * existe). Si el SDK no está disponible, las funciones son no-op silenciosas.
 *
 * En producción Android (EAS build) el SDK estará presente y funcionará.
 */

const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '';
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';

// Mapeo de planes ChillPocket → identificadores RevenueCat. Estos identifiers
// deben coincidir con los `Packages` que crees en el dashboard de RevenueCat,
// dentro de tu Offering "default".
// Convención propuesta (cámbiala si en RC usas otra):
//   plus_monthly, plus_annual, family_monthly, family_annual,
//   pro_freelance_monthly, pro_freelance_annual
export type Cycle = 'monthly' | 'annual';
export const PACKAGE_ID = (plan: Exclude<PlanCode, 'free'>, cycle: Cycle): string =>
  `${plan}_${cycle}`;

type SDK = typeof import('react-native-purchases');

let sdk: SDK | null = null;
let configured = false;

function getApiKey(): string {
  return Platform.select({ android: ANDROID_KEY, ios: IOS_KEY, default: '' }) ?? '';
}

/** Carga el SDK la primera vez. Devuelve null si no está disponible. */
function loadSDK(): SDK | null {
  if (sdk) return sdk;
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    sdk = (mod?.default ?? mod) as SDK;
    return sdk;
  } catch {
    // Probablemente Expo Go o build sin autolink: no hacemos nada.
    return null;
  }
}

/** Inicializa el SDK con la API key. Idempotente. */
export async function initPurchases(): Promise<void> {
  const s = loadSDK();
  const key = getApiKey();
  if (!s || !key) return;
  if (configured) return;
  try {
    // @ts-ignore — el tipo varía entre versiones del SDK
    if (s.setLogLevel && __DEV__) s.setLogLevel('warn');
    // @ts-ignore
    await s.configure({ apiKey: key });
    configured = true;
  } catch (e) {
    if (__DEV__) console.warn('[purchases] configure falló', e);
  }
}

/** Asocia las compras al usuario autenticado. Llamar tras login/bootstrap. */
export async function identifyPurchases(userId: number | string): Promise<void> {
  const s = loadSDK();
  if (!s || !configured) return;
  try {
    // @ts-ignore
    await s.logIn(String(userId));
  } catch (e) {
    if (__DEV__) console.warn('[purchases] logIn falló', e);
  }
}

/** Desliga al usuario actual. Llamar en logout. */
export async function signOutPurchases(): Promise<void> {
  const s = loadSDK();
  if (!s || !configured) return;
  try {
    // @ts-ignore
    await s.logOut();
  } catch (e) {
    if (__DEV__) console.warn('[purchases] logOut falló', e);
  }
}

export type RCPackage = {
  identifier: string;
  product: { priceString: string; price: number; currencyCode: string; title: string };
};

/** Devuelve los paquetes del Offering "default" (o null si no hay SDK). */
export async function getOfferingPackages(): Promise<RCPackage[] | null> {
  const s = loadSDK();
  if (!s || !configured) return null;
  try {
    // @ts-ignore
    const offerings = await s.getOfferings();
    const current = offerings?.current ?? null;
    const pkgs = current?.availablePackages as RCPackage[] | undefined;
    if (__DEV__) {
      console.log('[purchases] getOfferings →', {
        hasCurrent: !!current,
        currentId: current?.identifier ?? null,
        packagesCount: pkgs?.length ?? 0,
        packageIds: (pkgs ?? []).map((p) => p.identifier),
      });
    }
    return pkgs ?? [];
  } catch (e) {
    if (__DEV__) console.warn('[purchases] getOfferings falló', e);
    return null;
  }
}

/** Lanza el flujo de compra para un Package concreto. Lanza si el usuario
 *  cancela o si falla. El backend recibirá el alta vía webhook RC (Fase 2.1).
 *
 *  Códigos de error (en el mensaje del Error lanzado):
 *  - SDK_NOT_AVAILABLE: el SDK nativo no se cargó / configure() no corrió.
 *  - NO_OFFERINGS: la cuenta de RC no tiene Offering "current" o el Offering
 *    no tiene Packages. Causa típica: faltan productos en Play Console o el
 *    Offering "default" no está marcado como Current en el dashboard de RC.
 *  - PACKAGE_NOT_FOUND:<id>: hay Offering con Packages, pero ninguno con ese
 *    identifier. El identifier del Package en RC debe coincidir exactamente
 *    con la convención `${plan}_${cycle}` (ver PACKAGE_ID arriba).
 *  - Cualquier otro mensaje proviene del SDK nativo de RevenueCat (incluyendo
 *    cancelaciones del usuario, errores de red, productos sin precio, etc.).
 */
export async function purchasePackageById(packageId: string): Promise<void> {
  const s = loadSDK();
  if (!s || !configured) {
    throw new Error('SDK_NOT_AVAILABLE');
  }
  // @ts-ignore
  const offerings = await s.getOfferings();
  const current = offerings?.current ?? null;
  const pkgs: RCPackage[] = current?.availablePackages ?? [];
  if (!current || pkgs.length === 0) {
    if (__DEV__) {
      console.warn('[purchases] sin offerings', {
        hasCurrent: !!current,
        packagesCount: pkgs.length,
      });
    }
    throw new Error('NO_OFFERINGS');
  }
  const pkg = pkgs.find((p) => p.identifier === packageId);
  if (!pkg) {
    if (__DEV__) {
      console.warn('[purchases] package no encontrado', {
        packageId,
        available: pkgs.map((p) => p.identifier),
      });
    }
    throw new Error(`PACKAGE_NOT_FOUND:${packageId}`);
  }
  // @ts-ignore
  await s.purchasePackage(pkg);
}

/** Restaura compras anteriores asociadas al usuario / cuenta de tienda. */
export async function restorePurchases(): Promise<void> {
  const s = loadSDK();
  if (!s || !configured) {
    throw new Error('SDK_NOT_AVAILABLE');
  }
  // @ts-ignore
  await s.restorePurchases();
}

/** True si el SDK está cargado y configurado (= compras posibles). */
export function purchasesAvailable(): boolean {
  return !!loadSDK() && configured;
}
