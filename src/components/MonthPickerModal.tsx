import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from './Text';
import { monthLabel } from '../utils/format';

type Props = {
  visible: boolean;
  selected: string; // 'YYYY-MM'
  onSelect: (monthYear: string) => void;
  onClose: () => void;
  count?: number;
};

export const MonthPickerModal: React.FC<Props> = ({
  visible,
  selected,
  onSelect,
  onClose,
  count = 6,
}) => {
  const { palette } = useTheme();

  const months = useMemo(() => {
    const arr: string[] = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return arr;
  }, [count]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.menu, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}>
          <Text variant="label" tone="muted" style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
            Selecciona mes
          </Text>
          {months.map((m) => {
            const active = m === selected;
            return (
              <Pressable
                key={m}
                onPress={() => onSelect(m)}
                android_ripple={{ color: palette.bgElevated }}
                style={styles.item}
              >
                <Text
                  variant="body"
                  weight={active ? 'semibold' : 'regular'}
                  tone={active ? 'accent' : 'primary'}
                  style={{ textTransform: 'capitalize' }}
                >
                  {monthLabel(m)}
                </Text>
                {active && <Ionicons name="checkmark" size={18} color={palette.accent} />}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    paddingTop: 140,
    paddingHorizontal: spacing.lg,
  },
  menu: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
    minWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
