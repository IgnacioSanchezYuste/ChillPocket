import { Ionicons } from '@expo/vector-icons';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Las categorías sembradas en la BD guardan nombres de Material Icons
// (p.ej. 'restaurant', 'directions-car'), que NO son válidos en Ionicons.
// Este mapa los traduce a su equivalente Ionicons. Cualquier valor
// desconocido cae en un icono genérico según el tipo.
const MATERIAL_TO_IONICONS: Record<string, IoniconName> = {
  restaurant: 'restaurant',
  'fast-food': 'fast-food',
  cafe: 'cafe',
  'directions-car': 'car',
  'directions-bus': 'bus',
  home: 'home',
  'sports-esports': 'game-controller',
  favorite: 'heart',
  'medical-services': 'medkit',
  subscriptions: 'repeat',
  'shopping-bag': 'bag-handle',
  'shopping-cart': 'cart',
  'more-horiz': 'ellipsis-horizontal',
  work: 'briefcase',
  computer: 'laptop',
  'trending-up': 'trending-up',
  'attach-money': 'cash',
  savings: 'wallet',
  school: 'school',
  flight: 'airplane',
  pets: 'paw',
  'fitness-center': 'barbell',
  bolt: 'flash',
  wifi: 'wifi',
  phone: 'call',
  gift: 'gift',
};

/**
 * Devuelve un icono Ionicons válido para una categoría.
 * Acepta valores Material (BD), valores Ionicons ya válidos, o null.
 */
export function categoryIonicon(
  icon: string | null | undefined,
  type: 'expense' | 'income'
): IoniconName {
  if (icon) {
    if (MATERIAL_TO_IONICONS[icon]) return MATERIAL_TO_IONICONS[icon];
    if ((Ionicons.glyphMap as Record<string, number>)[icon]) return icon as IoniconName;
  }
  return type === 'income' ? 'arrow-down-circle' : 'pricetag';
}
