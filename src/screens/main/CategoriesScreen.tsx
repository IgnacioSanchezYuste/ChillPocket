import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../store/useDataStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Sheet } from '../../components/Sheet';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useToast } from '../../components/Toast';
import { categoriesApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { categoryDotPalette } from '../../theme/colors';
import type { Category } from '../../api/types';

export const CategoriesScreen: React.FC = () => {
  const { palette } = useTheme();
  const { categories, fetchCategories } = useDataStore();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [color, setColor] = useState(categoryDotPalette[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCategories(true);
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setType('expense');
    setColor(categoryDotPalette[Math.floor(Math.random() * categoryDotPalette.length)]);
    setSheetOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setType(c.type);
    setColor(c.color);
    setSheetOpen(true);
  };

  const onSave = async () => {
    if (!name.trim()) return toast.error('Añade un nombre');
    setSaving(true);
    try {
      if (editing) {
        await categoriesApi.update(editing.id, { name: name.trim(), color, type });
      } else {
        await categoriesApi.create({ name: name.trim(), color, type });
      }
      await fetchCategories(true);
      toast.success('Guardada');
      setSheetOpen(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (c: Category) => {
    Alert.alert('Eliminar categoría', `¿Eliminar "${c.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await categoriesApi.remove(c.id);
            await fetchCategories(true);
            toast.success('Eliminada');
          } catch (e) {
            toast.error(apiError(e));
          }
        },
      },
    ]);
  };

  const expenses = categories.filter((c) => c.type === 'expense');
  const incomes = categories.filter((c) => c.type === 'income');

  const Section: React.FC<{ title: string; data: Category[] }> = ({ title, data }) => (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" tone="secondary" style={{ paddingHorizontal: spacing.lg, textTransform: 'uppercase' }}>
        {title}
      </Text>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        {data.map((c) => (
          <Pressable key={c.id} onPress={() => openEdit(c)} onLongPress={() => onDelete(c)}>
            <Card padding="md">
              <View style={styles.row}>
                <View style={[styles.colorBlock, { backgroundColor: c.color }]} />
                <Text variant="body" weight="medium" style={{ flex: 1 }}>{c.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl * 2, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        <ScreenHeader
          title="Categorías"
          subtitle="Toca para editar, mantén pulsado para eliminar"
          showBack
          right={
            <Pressable onPress={openCreate} hitSlop={8}>
              <Ionicons name="add-circle" size={28} color={palette.accent} />
            </Pressable>
          }
        />
        {expenses.length > 0 && <Section title="Gastos" data={expenses} />}
        {incomes.length > 0 && <Section title="Ingresos" data={incomes} />}
      </ScrollView>

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? 'Editar categoría' : 'Nueva categoría'}
        footer={<Button title="Guardar" loading={saving} onPress={onSave} size="lg" />}
      >
        <SegmentedControl
          options={[
            { value: 'expense', label: 'Gasto' },
            { value: 'income', label: 'Ingreso' },
          ]}
          value={type}
          onChange={setType}
        />
        <Input label="Nombre" placeholder="p.ej. Café" value={name} onChangeText={setName} />
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="secondary">Color</Text>
          <View style={styles.colorRow}>
            {categoryDotPalette.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)}>
                <View
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: c,
                      borderColor: color === c ? palette.textPrimary : 'transparent',
                    },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  colorBlock: { width: 12, height: 12, borderRadius: 6 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  colorSwatch: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 2 },
});
