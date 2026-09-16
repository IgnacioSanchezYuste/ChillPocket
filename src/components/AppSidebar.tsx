import React from 'react';
import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { SIDEBAR_WIDTH } from '../theme/layout';
import { Text } from './Text';
import { BrandLogo } from './BrandLogo';
import { useAuthStore } from '../store/useAuthStore';
import { useSpotlightTarget } from '../onboarding/useSpotlightTarget';
import { navigateToTab, navigateToRoute, useActiveRouteName } from '../navigation/navigationRef';

type Item = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  isTab?: boolean;
  /** id de spotlight para el onboarding (solo los principales). */
  spotlight?: string;
};

// Secciones primarias (pestañas) + secundarias (stack), todas en el sidebar.
const PRIMARY: Item[] = [
  { label: 'Inicio', icon: 'home', route: 'Home', isTab: true, spotlight: 'tab-Home' },
  { label: 'Movimientos', icon: 'list', route: 'Movimientos', isTab: true, spotlight: 'tab-Movimientos' },
  { label: 'Analítica', icon: 'pie-chart', route: 'Analítica', isTab: true, spotlight: 'tab-Analítica' },
];
const SECONDARY: Item[] = [
  { label: 'Presupuestos', icon: 'wallet', route: 'Budgets' },
  { label: 'Inversiones', icon: 'trending-up', route: 'Investments' },
  { label: 'Patrimonio neto', icon: 'diamond', route: 'NetWorth' },
  { label: 'Gastos fijos', icon: 'repeat', route: 'Recurring' },
  { label: 'Metas de ahorro', icon: 'flag', route: 'Goals' },
  { label: 'Categorías', icon: 'pricetags', route: 'Categories' },
];

export const AppSidebar: React.FC = () => {
  const { palette, mode } = useTheme();
  const { user } = useAuthStore();
  const active = useActiveRouteName();

  const go = (it: Item) => (it.isTab ? navigateToTab(it.route) : navigateToRoute(it.route));

  return (
    <View
      style={[
        styles.sidebar,
        { backgroundColor: palette.bgSurface, borderRightColor: palette.borderSubtle },
      ]}
    >
      <View style={styles.brand}>
        <BrandLogo size={32} />
        <Text variant="h2" weight="bold">ChillPocket</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 2, paddingBottom: spacing.md }}>
        {PRIMARY.map((it) => (
          <SidebarItem key={it.route} item={it} active={active === it.route} onPress={() => go(it)} />
        ))}

        <View style={[styles.divider, { backgroundColor: palette.borderSubtle }]} />

        {SECONDARY.map((it) => (
          <SidebarItem key={it.route} item={it} active={active === it.route} onPress={() => go(it)} />
        ))}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: palette.borderSubtle }]}>
        <Pressable
          onPress={() => navigateToRoute('Settings')}
          style={({ pressed }) => [
            styles.userRow,
            { backgroundColor: active === 'Settings' ? palette.accentSoft : pressed ? palette.bgElevated : 'transparent' },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: palette.accent }]}>
            <Text variant="label" weight="bold" style={{ color: '#fff' }}>
              {(user?.name?.[0] || '?').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" weight="semibold" numberOfLines={1}>{user?.name || 'Cuenta'}</Text>
            <Text variant="caption" tone="muted">Ajustes</Text>
          </View>
          <Ionicons name="settings-outline" size={18} color={palette.textMuted} />
        </Pressable>
      </View>
    </View>
  );
};

const SidebarItem: React.FC<{ item: Item; active: boolean; onPress: () => void }> = ({ item, active, onPress }) => {
  const { palette } = useTheme();
  const sp = useSpotlightTarget(item.spotlight ?? `side-${item.route}`);
  return (
    <Pressable
      ref={sp.ref}
      onLayout={sp.onLayout}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: active ? palette.accentSoft : pressed ? palette.bgElevated : 'transparent',
          borderLeftColor: active ? palette.accent : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : {}}
      accessibilityLabel={item.label}
    >
      <Ionicons name={item.icon} size={20} color={active ? palette.accent : palette.textSecondary} />
      <Text variant="body" weight={active ? 'semibold' : 'medium'} tone={active ? 'accent' : 'secondary'}>
        {item.label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.lg,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
  },
  divider: { height: 1, marginVertical: spacing.sm, marginHorizontal: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 3,
  },
  footer: { borderTopWidth: 1, paddingVertical: spacing.sm },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
