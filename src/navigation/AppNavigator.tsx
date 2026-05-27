import React from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import { useBreakpoint } from '../theme/layout';
import { Text } from '../components/Text';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { FloatingTabBar } from '../components/FloatingTabBar';
import { AppSidebar } from '../components/AppSidebar';
import { DashboardScreen } from '../screens/main/DashboardScreen';
import { TransactionsScreen } from '../screens/main/TransactionsScreen';
import { AnalyticsScreen } from '../screens/main/AnalyticsScreen';
import { RecurringScreen } from '../screens/main/RecurringScreen';
import { GoalsScreen } from '../screens/main/GoalsScreen';
import { SettingsScreen } from '../screens/main/SettingsScreen';
import { CategoriesScreen } from '../screens/main/CategoriesScreen';
import { BudgetsScreen } from '../screens/main/BudgetsScreen';
import { InvestmentsScreen } from '../screens/main/InvestmentsScreen';
import { PaywallScreen } from '../screens/main/PaywallScreen';
import { DayDetailScreen } from '../screens/main/DayDetailScreen';

export type AppStackParamList = {
  Tabs: undefined;
  Recurring: undefined;
  Goals: undefined;
  Settings: undefined;
  Categories: undefined;
  Budgets: undefined;
  Investments: undefined;
  Paywall: { feature?: string } | undefined;
  DayDetail: { date: string };
};

const Stack = createNativeStackNavigator<AppStackParamList>();
const Tab = createBottomTabNavigator();

const MoreScreen: React.FC<any> = ({ navigation }) => {
  const { palette } = useTheme();
  const items: { key: keyof typeof Ionicons.glyphMap; label: string; description: string; route: keyof AppStackParamList }[] = [
    { key: 'wallet-outline', label: 'Presupuestos', description: 'Límites mensuales por categoría', route: 'Budgets' },
    { key: 'trending-up-outline', label: 'Inversiones', description: 'Calculadora de interés compuesto', route: 'Investments' },
    { key: 'repeat-outline', label: 'Gastos fijos', description: 'Suscripciones y recurrentes', route: 'Recurring' },
    { key: 'flag-outline', label: 'Metas de ahorro', description: 'Objetivos y progreso', route: 'Goals' },
    { key: 'pricetags-outline', label: 'Categorías', description: 'Personaliza tus etiquetas', route: 'Categories' },
    { key: 'settings-outline', label: 'Ajustes', description: 'Cuenta, moneda, tema', route: 'Settings' },
  ];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl, gap: spacing.md }}>
        <ScreenHeader title="Más" subtitle="Otras herramientas" />
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {items.map((it) => (
            <Pressable key={it.route} onPress={() => navigation.navigate(it.route)}>
              <Card padding="md">
                <View style={styles.row}>
                  <View style={[styles.iconWrap, { backgroundColor: palette.accentSoft }]}>
                    <Ionicons name={it.key} size={20} color={palette.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" weight="semibold">{it.label}</Text>
                    <Text variant="caption" tone="muted">{it.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const Tabs: React.FC = () => {
  const { palette } = useTheme();
  const { isDesktop } = useBreakpoint();

  return (
    <Tab.Navigator
      // En desktop la navegación vive en el sidebar persistente → ocultamos la barra.
      tabBar={isDesktop ? () => null : (props) => <FloatingTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarIcon: ({ color, focused }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: focused ? 'home' : 'home-outline',
            Movimientos: focused ? 'list' : 'list-outline',
            Analítica: focused ? 'pie-chart' : 'pie-chart-outline',
            Más: focused ? 'apps' : 'apps-outline',
          };
          return <Ionicons name={map[route.name] || 'ellipse-outline'} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Movimientos" component={TransactionsScreen} />
      <Tab.Screen name="Analítica" component={AnalyticsScreen} />
      <Tab.Screen name="Más" component={MoreScreen} />
    </Tab.Navigator>
  );
};

const AppStack: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="Tabs" component={Tabs} />
    <Stack.Screen name="Recurring" component={RecurringScreen} />
    <Stack.Screen name="Goals" component={GoalsScreen} />
    <Stack.Screen name="Categories" component={CategoriesScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="Budgets" component={BudgetsScreen} />
    <Stack.Screen name="Investments" component={InvestmentsScreen} />
    <Stack.Screen name="Paywall" component={PaywallScreen} />
    <Stack.Screen name="DayDetail" component={DayDetailScreen} />
  </Stack.Navigator>
);

// En desktop, un sidebar persistente acompaña a TODO el stack (también las
// pantallas secundarias). En móvil/tablet el stack va solo y la navegación
// está en los bottom tabs.
// La estructura del árbol es estable (siempre Row > [sidebar?] + Stack) para
// que cruzar el breakpoint al redimensionar NO remonte el navigator ni resetee
// la navegación; solo aparece/desaparece el sidebar.
export const AppNavigator: React.FC = () => {
  const { isDesktop } = useBreakpoint();
  const { palette } = useTheme();

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.bgBase }}>
      {isDesktop && <AppSidebar />}
      <View style={{ flex: 1 }}>
        <AppStack />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
