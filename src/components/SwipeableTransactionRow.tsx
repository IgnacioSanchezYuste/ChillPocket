import React, { useRef } from 'react';
import { Platform, View, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import { Text } from './Text';
import { TransactionRow } from './TransactionRow';
import type { Transaction } from '../api/types';

type Props = {
  transaction: Transaction;
  currency: string;
  onDelete: (id: number) => void;
  onDuplicate: (tx: Transaction) => void;
  onPress?: () => void;
};

// Componente de acciones swipe (solo nativo). Se renderiza a la derecha
// cuando el usuario desliza hacia la izquierda.
const RightActions: React.FC<{
  onDelete: () => void;
  onDuplicate: () => void;
}> = ({ onDelete, onDuplicate }) => {
  const { palette } = useTheme();

  return (
    <View style={styles.actionsContainer}>
      {/* Duplicar (más a la izquierda de los dos botones revelados) */}
      <Pressable
        onPress={onDuplicate}
        style={[styles.actionBtn, { backgroundColor: palette.accent }]}
        accessibilityRole="button"
        accessibilityLabel="Duplicar movimiento"
      >
        <Ionicons name="copy-outline" size={20} color="#fff" />
        <Text variant="caption" weight="semibold" style={styles.actionLabel}>
          Duplicar
        </Text>
      </Pressable>

      {/* Eliminar (más a la derecha; el usuario lo alcanza primero deslizando más) */}
      <Pressable
        onPress={onDelete}
        style={[styles.actionBtn, { backgroundColor: palette.danger }]}
        accessibilityRole="button"
        accessibilityLabel="Eliminar movimiento"
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text variant="caption" weight="semibold" style={styles.actionLabel}>
          Eliminar
        </Text>
      </Pressable>
    </View>
  );
};

/**
 * Envuelve TransactionRow con acciones de swipe en nativo.
 * En web renderiza directamente TransactionRow sin swipe (Swipeable no funciona
 * bien en react-native-web y el patrón tap→sheet ya es suficiente).
 */
export const SwipeableTransactionRow: React.FC<Props> = ({
  transaction,
  currency,
  onDelete,
  onDuplicate,
  onPress,
}) => {
  // En web: render simple, sin swipe.
  if (Platform.OS === 'web') {
    return (
      <TransactionRow
        tx={transaction}
        currency={currency}
        onPress={onPress}
      />
    );
  }

  // En nativo: wrapper con Swipeable.
  return (
    <SwipeableNative
      transaction={transaction}
      currency={currency}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onPress={onPress}
    />
  );
};

// Separamos el componente nativo en una función interna para que el
// hook useRef/Swipeable solo se instancie cuando la plataforma es nativa.
const SwipeableNative: React.FC<Props> = ({
  transaction,
  currency,
  onDelete,
  onDuplicate,
  onPress,
}) => {
  const swipeableRef = useRef<Swipeable>(null);

  const handleDelete = () => {
    swipeableRef.current?.close();
    onDelete(transaction.id);
  };

  const handleDuplicate = () => {
    swipeableRef.current?.close();
    onDuplicate(transaction);
  };

  const handleSwipeableWillOpen = () => {
    // Feedback háptico leve al revelar las acciones.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      // Silenciar si el dispositivo no soporta haptics.
    });
  };

  return (
    <Swipeable
      ref={swipeableRef}
      friction={1}
      rightThreshold={40}
      renderRightActions={() => (
        <RightActions onDelete={handleDelete} onDuplicate={handleDuplicate} />
      )}
      onSwipeableWillOpen={handleSwipeableWillOpen}
    >
      <TransactionRow
        tx={transaction}
        currency={currency}
        onPress={onPress}
      />
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionBtn: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 11,
  },
});
