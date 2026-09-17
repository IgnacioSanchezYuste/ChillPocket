import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Sheet } from '../../components/Sheet';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { CategoryChip } from '../../components/CategoryChip';
import { Text } from '../../components/Text';
import { ProgressBar } from '../../components/ProgressBar';
import { AuthImage } from '../../components/AuthImage';
import { PremiumLock } from '../../components/PremiumLock';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { isMissingNativeModule, MISSING_NATIVE_MESSAGE } from '../../utils/nativeModules';
import { useDataStore } from '../../store/useDataStore';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { useBilling } from '../../store/useBillingStore';
import { useToast } from '../../components/Toast';
import { savingsApi, transactionsApi, type TransferDirection } from '../../api/endpoints';
import { useAuthStore } from '../../store/useAuthStore';
import { apiError } from '../../api/http';
import { confirmDelete } from '../../utils/confirm';
import { track } from '../../utils/analytics';
import { formatMoney, todayISO } from '../../utils/format';
import { spacing, radius } from '../../theme/spacing';
import { useTheme } from '../../theme/ThemeProvider';
import { PAYMENT_METHODS } from '../../utils/paymentMethods';
import type { PaymentMethod, Transaction } from '../../api/types';
import {
  pickFromGallery,
  pickFromCamera,
  buildReceiptFormData,
  validateReceiptAsset,
  type ReceiptAsset,
} from '../../utils/receiptPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransactionPrefill = {
  amount?: string;
  description?: string;
  type?: 'expense' | 'income';
  paymentMethod?: PaymentMethod | null;
  categoryName?: string;
  /** ID directo de categoría (tiene prioridad sobre categoryName). Usado al duplicar. */
  category_id?: number | null;
  /** Notas a prerellenar. Usado al duplicar. */
  notes?: string | null;
  /** Fecha ISO YYYY-MM-DD. Si se omite, se usa hoy. Usado al duplicar. */
  date?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: Transaction | null;
  /**
   * Callback tras guardar. En creación recibe la transacción creada;
   * en edición/borrado recibe null (no hay objeto relevante que capturar).
   * El parámetro es opcional para no romper los callsites que ya no lo usan.
   */
  onSaved?: (created?: Transaction | null) => void;
  prefill?: TransactionPrefill | null;
};

// Estado del bloque de foto
type ReceiptState =
  | { phase: 'idle' }                         // vacío, sin foto
  | { phase: 'local'; asset: ReceiptAsset }   // foto elegida localmente (nueva/reemplazo)
  | { phase: 'server' }                       // tx existente con receipt_path (ya en servidor)
  | { phase: 'uploading'; progress: number }  // subiendo al servidor
  | { phase: 'error'; msg: string };          // fallo de subida

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RECEIPT_THUMB_SIZE = 100;

/** Revoca Object URL de web si existe. Idempotente. */
function revokeLocalAsset(asset: ReceiptAsset | null) {
  if (!asset) return;
  // En web el uri es un objectURL que hay que revocar
  if (Platform.OS === 'web' && asset.uri?.startsWith('blob:')) {
    try { URL.revokeObjectURL(asset.uri); } catch { /* no-op */ }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TransactionSheet: React.FC<Props> = ({
  visible,
  onClose,
  editing,
  onSaved,
  prefill,
}) => {
  const { categories, fetchCategories, refreshAll, summary } = useDataStore();
  const currency = useAuthStore((s) => s.user?.currency || 'EUR');
  const { lastCategoryId, lastPaymentMethod, setLastCategory, setLastPaymentMethod } =
    usePreferencesStore();
  const toast = useToast();
  const { palette } = useTheme();
  const navigation = useNavigation<any>();
  const { hasFeature } = useBilling();
  const hasReceipts = hasFeature('receipt_photos');
  const onboardingActive = useOnboardingStore((s) => s.active);

  // --- Form state ---
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  // Transferencia entre "Saldo del mes" y "Mis ahorros" (única forma de mover dinero a ahorro).
  const [transferMode, setTransferMode] = useState(false);
  const [transferDir, setTransferDir] = useState<TransferDirection>('to_savings');
  const [transferError, setTransferError] = useState('');
  const [saving, setSaving] = useState(false);

  // --- Receipt state ---
  const [receiptState, setReceiptState] = useState<ReceiptState>({ phase: 'idle' });
  // true cuando el usuario quiere borrar el recibo del servidor (en edición)
  const [removeServerReceipt, setRemoveServerReceipt] = useState(false);
  // Guardamos el asset local en un ref para poder revocarlo en cleanup
  const localAssetRef = useRef<ReceiptAsset | null>(null);

  // Sincroniza ref con el estado
  useEffect(() => {
    if (receiptState.phase === 'local') {
      localAssetRef.current = receiptState.asset;
    } else {
      // No revocar aquí; lo haremos al desmontar o al cambiar de asset
    }
  }, [receiptState]);

  // Cleanup Object URLs al desmontar
  useEffect(() => {
    return () => {
      revokeLocalAsset(localAssetRef.current);
    };
  }, []);

  // Reset completo al abrir/cerrar o cambiar el editing
  useEffect(() => {
    if (visible) {
      // Limpiar asset anterior
      revokeLocalAsset(localAssetRef.current);
      localAssetRef.current = null;
      setRemoveServerReceipt(false);
      setTransferMode(false);
      setTransferDir('to_savings');
      setTransferError('');

      if (editing) {
        setType(editing.type);
        setAmount(String(editing.amount));
        setDescription(editing.description);
        setCategoryId(editing.category_id);
        setDate(editing.transaction_date);
        setNotes(editing.notes || '');
        setPaymentMethod(editing.payment_method ?? null);
        // Inicializar el bloque de foto según si ya tiene recibo
        setReceiptState(editing.receipt_path ? { phase: 'server' } : { phase: 'idle' });
      } else if (prefill) {
        const t = prefill.type ?? 'expense';
        setType(t);
        setAmount(prefill.amount ?? '');
        setDescription(prefill.description ?? '');
        setCategoryId(prefill.category_id !== undefined ? (prefill.category_id ?? null) : null);
        setDate(prefill.date ?? todayISO());
        setNotes(prefill.notes ?? '');
        setPaymentMethod(prefill.paymentMethod ?? null);
        setReceiptState({ phase: 'idle' });
      } else {
        const initialType: 'expense' | 'income' = 'expense';
        setType(initialType);
        setAmount('');
        setDescription('');
        setCategoryId(lastCategoryId[initialType] ?? null);
        setDate(todayISO());
        setNotes('');
        setPaymentMethod(lastPaymentMethod);
        setReceiptState({ phase: 'idle' });
      }
    }
  }, [visible, editing]);

  useEffect(() => {
    if (visible && categories.length === 0) fetchCategories();
  }, [visible]);

  // Pre-seleccionar última categoría al cambiar tipo (solo en creación sin prefill)
  useEffect(() => {
    if (visible && !editing && !prefill) {
      setCategoryId(lastCategoryId[type] ?? null);
    }
  }, [type, visible, editing, lastCategoryId]);

  // Resolver categoría por nombre (onboarding)
  useEffect(() => {
    if (
      visible &&
      !editing &&
      prefill?.categoryName &&
      prefill?.category_id === undefined &&
      categories.length > 0
    ) {
      const wanted = prefill.categoryName.toLowerCase();
      const match = categories.find(
        (c) => c.type === (prefill.type ?? 'expense') && c.name.toLowerCase() === wanted
      );
      if (match) setCategoryId(match.id);
    }
  }, [categories, visible, editing]);

  const filtered = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const generatedFromRecurring = !!editing?.recurring_id;
  const isTransfer = !!editing?.transfer;

  // Colores dinámicos según tipo: danger para gastos, success para ingresos
  const typeAccent = transferMode ? palette.accent : type === 'expense' ? palette.danger : palette.success;
  const typeAccentSoft = transferMode ? palette.accentSoft : type === 'expense' ? palette.dangerSoft : palette.successSoft;
  const expenseActive = !transferMode && type === 'expense';
  const incomeActive = !transferMode && type === 'income';
  const transferAvailable = Number(
    (transferDir === 'to_savings' ? summary?.period_balance : summary?.net_total_historical) ?? 0,
  );

  // ---------------------------------------------------------------------------
  // Receipt actions
  // ---------------------------------------------------------------------------

  const handlePickGallery = useCallback(async () => {
    try {
      const asset = await pickFromGallery();
      if (!asset) return; // cancelado o permiso denegado

      const err = validateReceiptAsset(asset);
      if (err) {
        toast.error(err);
        revokeLocalAsset(asset);
        return;
      }

      // Revocar asset anterior si lo hay
      if (receiptState.phase === 'local') {
        revokeLocalAsset(receiptState.asset);
      }
      setReceiptState({ phase: 'local', asset });
      // Si había un recibo de servidor y el usuario elige uno nuevo,
      // marcamos que hay que reemplazar (deleteReceipt + upload)
      setRemoveServerReceipt(false);
    } catch (e) {
      toast.error(isMissingNativeModule(e) ? MISSING_NATIVE_MESSAGE : 'No se pudo abrir la galería');
    }
  }, [receiptState, toast]);

  const handlePickCamera = useCallback(async () => {
    try {
      const asset = await pickFromCamera();
      if (!asset) return;

      const err = validateReceiptAsset(asset);
      if (err) {
        toast.error(err);
        revokeLocalAsset(asset);
        return;
      }

      if (receiptState.phase === 'local') {
        revokeLocalAsset(receiptState.asset);
      }
      setReceiptState({ phase: 'local', asset });
      setRemoveServerReceipt(false);
    } catch (e) {
      toast.error(isMissingNativeModule(e) ? MISSING_NATIVE_MESSAGE : 'No se pudo abrir la cámara');
    }
  }, [receiptState, toast]);

  const handleRemoveReceipt = useCallback(() => {
    if (receiptState.phase === 'local') {
      revokeLocalAsset(receiptState.asset);
    }
    if (receiptState.phase === 'server') {
      // Marcar para borrar en el servidor al guardar
      setRemoveServerReceipt(true);
    }
    setReceiptState({ phase: 'idle' });
  }, [receiptState]);

  // ---------------------------------------------------------------------------
  // Save logic
  // ---------------------------------------------------------------------------

  const uploadReceiptForTx = useCallback(
    async (txId: number, asset: ReceiptAsset, allowFail: boolean) => {
      setReceiptState({ phase: 'uploading', progress: 0 });
      try {
        const form = buildReceiptFormData(asset);
        await transactionsApi.uploadReceipt(txId, form);
        track('receipt_uploaded');
        revokeLocalAsset(asset);
        localAssetRef.current = null;
        setReceiptState({ phase: 'server' });
      } catch (e) {
        const msg = apiError(e, 'No se pudo subir la foto del ticket');
        if (allowFail) {
          // La tx YA existe; toast blando y cierra igual
          toast.error(`Transacción guardada, pero no se pudo subir la foto: ${msg}`);
          setReceiptState({ phase: 'idle' });
        } else {
          setReceiptState({ phase: 'error', msg });
          throw e;
        }
      }
    },
    [toast]
  );

  const onSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) {
      if (transferMode) return setTransferError('El importe debe ser mayor que 0');
      return toast.error('El importe debe ser mayor que 0');
    }
    if (transferMode) {
      setTransferError('');
      setSaving(true);
      try {
        await savingsApi.transfer(amt, transferDir);
        track('savings_transfer', transferDir);
        toast.success(transferDir === 'to_savings' ? 'Enviado a Mis ahorros' : 'Pasado al saldo del mes');
        await refreshAll(true);
        onSaved?.(null);
        onClose();
      } catch (e) {
        setTransferError(apiError(e, 'No se pudo transferir'));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!description.trim()) return toast.error('Añade una descripción');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast.error('Fecha YYYY-MM-DD');

    setSaving(true);
    try {
      if (editing) {
        // Edición: primero actualizar la tx
        await transactionsApi.update(editing.id, {
          amount: amt,
          description: description.trim(),
          type,
          transaction_date: date,
          category_id: categoryId,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
        });
        track('transaction_updated');

        // Luego gestionar el recibo
        if (removeServerReceipt && receiptState.phase === 'idle') {
          // Borrar recibo del servidor
          try {
            await transactionsApi.deleteReceipt(editing.id);
          } catch {
            // No bloquear el guardado si el borrado falla
          }
        }
        if (receiptState.phase === 'local') {
          // Subir nuevo recibo (reemplaza el anterior si existía; el servidor lo gestiona)
          await uploadReceiptForTx(editing.id, receiptState.asset, true);
        }

        toast.success('Transacción actualizada');
        await refreshAll(true);
        onSaved?.(null);
        onClose();
      } else {
        // Creación
        const created = await transactionsApi.create({
          amount: amt,
          description: description.trim(),
          type,
          transaction_date: date,
          category_id: categoryId,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
        });
        // Los movimientos demo del tutorial no cuentan como uso real.
        if (!onboardingActive) track('transaction_created', type);

        // Persistir últimas elecciones
        setLastCategory(type, categoryId);
        if (type === 'expense') setLastPaymentMethod(paymentMethod);

        // Subir foto si hay una pendiente
        if (receiptState.phase === 'local') {
          await uploadReceiptForTx(created.id, receiptState.asset, true);
        }

        toast.success('Transacción creada');
        await refreshAll(true);
        onSaved?.(created);
        onClose();
      }
    } catch (e) {
      // Solo llega aquí si no es un error de foto (upload con allowFail=true)
      toast.error(apiError(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    const ok = await confirmDelete('transacción', `"${editing.description}" se eliminará permanentemente.`);
    if (!ok) return;
    setSaving(true);
    try {
      await transactionsApi.remove(editing.id);
      track('transaction_deleted');
      toast.success('Eliminada');
      await refreshAll(true);
      onSaved?.(null);
      onClose();
    } catch (e) {
      toast.error(apiError(e, 'No se pudo eliminar'));
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Receipt block
  // ---------------------------------------------------------------------------

  const ReceiptBlock = () => {
    // Free: teaser con candado (no durante el tutorial: "Ver Plus" lo interrumpiría)
    if (!hasReceipts) {
      if (onboardingActive) return null;
      return (
        <View style={{ gap: spacing.xs }}>
          <Text variant="label" tone="secondary">Foto del ticket</Text>
          <PremiumLock
            label="Guarda el justificante — Solo en ChillPocket Plus"
            planLabel="Ver Plus"
            variant="banner"
            feature="receipt_photos"
            onNavigate={onClose}
          />
        </View>
      );
    }

    // Plus — estado idle: botones para elegir foto
    if (receiptState.phase === 'idle') {
      return (
        <View style={{ gap: spacing.xs }}>
          <Text variant="label" tone="secondary">Foto del ticket</Text>
          <View style={styles.receiptButtons}>
            {/* En web solo mostramos galería (capture vía mismo botón) */}
            {Platform.OS !== 'web' && (
              <Pressable
                onPress={handlePickCamera}
                style={[
                  styles.receiptBtn,
                  { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle },
                ]}
                accessibilityLabel="Fotografiar ticket con la cámara"
              >
                <Ionicons name="camera-outline" size={18} color={palette.textSecondary} />
                <Text variant="label" tone="secondary">Cámara</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handlePickGallery}
              style={[
                styles.receiptBtn,
                { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle },
                Platform.OS === 'web' && styles.receiptBtnFull,
              ]}
              accessibilityLabel="Elegir foto del ticket de la galería"
            >
              <Ionicons name="image-outline" size={18} color={palette.textSecondary} />
              <Text variant="label" tone="secondary">
                {Platform.OS === 'web' ? 'Adjuntar foto' : 'Galería'}
              </Text>
            </Pressable>
          </View>
          <Text variant="caption" tone="muted">
            Adjunta el justificante de esta transacción (máx. 5 MB, jpg/png/webp).
          </Text>
        </View>
      );
    }

    // Plus — foto elegida localmente (nueva, aún no subida)
    if (receiptState.phase === 'local') {
      return (
        <View style={{ gap: spacing.xs }}>
          <Text variant="label" tone="secondary">Foto del ticket</Text>
          <View style={styles.receiptPreviewRow}>
            <Image
              source={{ uri: receiptState.asset.uri }}
              style={[styles.receiptThumb, { borderRadius: radius.md }]}
              resizeMode="cover"
              accessibilityLabel="Vista previa del ticket adjunto"
            />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {receiptState.asset.fileName}
              </Text>
              <Text variant="caption" tone="muted">
                {(receiptState.asset.size / (1024 * 1024)).toFixed(1)} MB
              </Text>
              <View style={styles.receiptActions}>
                <Pressable
                  onPress={handlePickGallery}
                  style={[styles.receiptActionBtn, { borderColor: palette.borderSubtle, backgroundColor: palette.bgElevated }]}
                  accessibilityLabel="Cambiar foto del ticket"
                >
                  <Ionicons name="refresh-outline" size={14} color={palette.textSecondary} />
                  <Text variant="caption" tone="secondary">Cambiar</Text>
                </Pressable>
                <Pressable
                  onPress={handleRemoveReceipt}
                  style={[styles.receiptActionBtn, { borderColor: palette.dangerSoft, backgroundColor: palette.dangerSoft }]}
                  accessibilityLabel="Quitar foto del ticket"
                >
                  <Ionicons name="trash-outline" size={14} color={palette.danger} />
                  <Text variant="caption" tone="danger">Quitar</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <Text variant="caption" tone="muted">
            Se subirá al guardar la transacción.
          </Text>
        </View>
      );
    }

    // Plus — recibo ya en servidor (edición con receipt_path)
    if (receiptState.phase === 'server' && editing) {
      const receiptUrl = transactionsApi.getReceiptUrl(editing.id);
      return (
        <View style={{ gap: spacing.xs }}>
          <Text variant="label" tone="secondary">Foto del ticket</Text>
          <View style={styles.receiptPreviewRow}>
            <AuthImage
              url={receiptUrl}
              style={{ width: RECEIPT_THUMB_SIZE, height: RECEIPT_THUMB_SIZE }}
              accessibilityLabel="Foto del justificante guardada"
            />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text variant="caption" tone="muted">Ticket adjunto</Text>
              <View style={styles.receiptActions}>
                <Pressable
                  onPress={handlePickGallery}
                  style={[styles.receiptActionBtn, { borderColor: palette.borderSubtle, backgroundColor: palette.bgElevated }]}
                  accessibilityLabel="Reemplazar foto del ticket"
                >
                  <Ionicons name="refresh-outline" size={14} color={palette.textSecondary} />
                  <Text variant="caption" tone="secondary">Cambiar</Text>
                </Pressable>
                <Pressable
                  onPress={handleRemoveReceipt}
                  style={[styles.receiptActionBtn, { borderColor: palette.dangerSoft, backgroundColor: palette.dangerSoft }]}
                  accessibilityLabel="Eliminar foto del ticket"
                >
                  <Ionicons name="trash-outline" size={14} color={palette.danger} />
                  <Text variant="caption" tone="danger">Quitar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      );
    }

    // Plus — subiendo
    if (receiptState.phase === 'uploading') {
      return (
        <View style={{ gap: spacing.xs }}>
          <Text variant="label" tone="secondary">Foto del ticket</Text>
          <View
            style={[
              styles.receiptUploadBox,
              { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle },
            ]}
          >
            <ActivityIndicator size="small" color={palette.accent} />
            <Text variant="caption" tone="secondary">Subiendo foto…</Text>
            <ProgressBar value={receiptState.progress} color={palette.accent} height={4} />
          </View>
        </View>
      );
    }

    // Plus — error de subida
    if (receiptState.phase === 'error') {
      return (
        <View style={{ gap: spacing.xs }}>
          <Text variant="label" tone="secondary">Foto del ticket</Text>
          <View
            style={[
              styles.receiptErrorBox,
              { backgroundColor: palette.dangerSoft, borderColor: palette.danger },
            ]}
          >
            <Ionicons name="warning-outline" size={16} color={palette.danger} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" tone="danger">{receiptState.msg}</Text>
            </View>
            <Pressable
              onPress={() => setReceiptState({ phase: 'idle' })}
              accessibilityLabel="Reintentar subida de foto"
              style={[styles.retryBtn, { borderColor: palette.danger }]}
            >
              <Text variant="caption" tone="danger" weight="semibold">Reintentar</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return null;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isTransfer ? 'Transferencia' : editing ? 'Editar transacción' : transferMode ? 'Transferir' : 'Nueva transacción'}
      footer={
        <View style={{ gap: spacing.sm }}>
          {!isTransfer && (
            <Button
              title={editing ? 'Guardar cambios' : transferMode ? 'Transferir' : 'Crear transacción'}
              onPress={onSave}
              loading={saving}
              size="lg"
            />
          )}
          {editing && <Button title="Eliminar" variant="ghost" onPress={onDelete} />}
        </View>
      }
    >
      {/* Banner: generada desde recurrente */}
      {generatedFromRecurring && (
        <View
          style={[
            styles.infoBanner,
            { backgroundColor: palette.accentSoft, borderColor: palette.accent },
          ]}
        >
          <Ionicons name="repeat" size={16} color={palette.accent} />
          <Text variant="caption" tone="accent" style={{ flex: 1 }}>
            Generada desde un gasto fijo. Puedes editarla pero seguirá ligada al recurrente.
          </Text>
        </View>
      )}

      {isTransfer && editing && (
        <View style={[styles.infoBanner, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
          <Ionicons name="swap-horizontal" size={16} color={palette.accent} />
          <Text variant="caption" tone="accent" style={{ flex: 1 }}>
            {editing.type === 'expense' ? 'Transferencia a Mis ahorros' : 'Retirada de Mis ahorros'} de{' '}
            {formatMoney(Number(editing.amount), currency)} ({editing.transaction_date}). Una transferencia no se
            edita: elimínala y haz otra.
          </Text>
        </View>
      )}

      {/* Toggle gasto / ingreso / ahorro — tiñe el acento dinámicamente */}
      {!isTransfer && (
      <View
        style={[
          styles.typeToggleWrap,
          { backgroundColor: typeAccentSoft, borderColor: typeAccent + '44' },
        ]}
      >
        <Pressable
          onPress={() => { setTransferMode(false); setType('expense'); setCategoryId(null); }}
          style={[
            styles.typeBtn,
            expenseActive && { backgroundColor: typeAccent },
          ]}
          accessibilityLabel="Marcar como gasto"
          aria-selected={expenseActive}
        >
          <Ionicons
            name="arrow-down-outline"
            size={15}
            color={expenseActive ? '#FFFFFF' : palette.textSecondary}
          />
          <Text
            variant="label"
            weight="semibold"
            style={{ color: expenseActive ? '#FFFFFF' : palette.textSecondary }}
          >
            Gasto
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { setTransferMode(false); setType('income'); setCategoryId(null); }}
          style={[
            styles.typeBtn,
            incomeActive && { backgroundColor: typeAccent },
          ]}
          accessibilityLabel="Marcar como ingreso"
          aria-selected={incomeActive}
        >
          <Ionicons
            name="arrow-up-outline"
            size={15}
            color={incomeActive ? '#FFFFFF' : palette.textSecondary}
          />
          <Text
            variant="label"
            weight="semibold"
            style={{ color: incomeActive ? '#FFFFFF' : palette.textSecondary }}
          >
            Ingreso
          </Text>
        </Pressable>
        {!editing && (
          <Pressable
            onPress={() => {
              setTransferMode(true);
              setTransferError('');
            }}
            style={[styles.typeBtn, transferMode && { backgroundColor: typeAccent }]}
            accessibilityLabel="Transferir entre el saldo del mes y Mis ahorros"
            aria-selected={transferMode}
          >
            <Ionicons name="swap-horizontal" size={15} color={transferMode ? '#FFFFFF' : palette.textSecondary} />
            <Text variant="label" weight="semibold" style={{ color: transferMode ? '#FFFFFF' : palette.textSecondary }}>
              Ahorro
            </Text>
          </Pressable>
        )}
      </View>
      )}

      {transferMode && (
        <View style={{ gap: spacing.sm }}>
          <SegmentedControl
            options={[
              { value: 'to_savings', label: 'Gastos → Ahorro' },
              { value: 'to_spending', label: 'Ahorro → Gastos' },
            ]}
            value={transferDir}
            onChange={(v) => {
              setTransferDir(v);
              setTransferError('');
            }}
          />
          <Text variant="caption" tone="muted">
            Disponible en {transferDir === 'to_savings' ? 'el saldo del mes' : 'Mis ahorros'}:{' '}
            {formatMoney(Math.max(0, transferAvailable), currency)}
          </Text>
        </View>
      )}

      {/* Importe */}
      {!isTransfer && (
        <Input
          label="Importe"
          keyboardType="decimal-pad"
          placeholder="0.00"
          value={amount}
          onChangeText={(t) => {
            setAmount(t);
            setTransferError('');
          }}
        />
      )}
      {transferMode && !!transferError && (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {transferError}
        </Text>
      )}

      {!transferMode && !isTransfer && (
      <>
      {/* Descripción */}
      <Input
        label="Descripción"
        placeholder="¿En qué fue?"
        value={description}
        onChangeText={setDescription}
      />

      {/* Categoría */}
      <View style={{ gap: spacing.sm }}>
        <Text variant="label" tone="secondary">Categoría</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {filtered.length === 0 && (
            <Text variant="caption" tone="muted">Crea categorías desde Ajustes</Text>
          )}
          {filtered.map((c) => (
            <CategoryChip
              key={c.id}
              category={c}
              selected={categoryId === c.id}
              onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Fecha */}
      <Input
        label="Fecha"
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
      />

      {/* Tipo de pago (solo gastos): cuadrícula 3×2, todo a la vista y sin scroll */}
      {type === 'expense' && (
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="secondary">Tipo de pago</Text>
          <View style={styles.pmGrid} accessibilityRole="radiogroup">
            {PAYMENT_METHODS.map((pm) => {
              const active = paymentMethod === pm.value;
              return (
                <Pressable
                  key={pm.value}
                  onPress={() => setPaymentMethod(active ? null : pm.value)}
                  style={({ pressed }) => [
                    styles.pmTile,
                    {
                      backgroundColor: active ? palette.accentSoft : palette.bgElevated,
                      borderColor: active ? palette.accent : palette.borderSubtle,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityLabel={`Tipo de pago: ${pm.label}`}
                  aria-checked={active}
                >
                  <View
                    style={[
                      styles.pmIcon,
                      { backgroundColor: active ? palette.accent : palette.bgSurface },
                    ]}
                  >
                    <Ionicons
                      name={pm.icon}
                      size={18}
                      color={active ? palette.textInverted : palette.textSecondary}
                    />
                  </View>
                  <Text
                    variant="caption"
                    weight={active ? 'semibold' : 'medium'}
                    tone={active ? 'accent' : 'secondary'}
                    align="center"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {pm.shortLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Foto del ticket */}
      <ReceiptBlock />

      {/* Notas */}
      <Input
        label="Notas (opcional)"
        placeholder="Añade detalles si quieres"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      </>
      )}
    </Sheet>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  chips: { gap: spacing.sm, paddingVertical: 4 },
  pmGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pmTile: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pmIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  typeToggleWrap: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md - 2,
    minHeight: 44,
  },
  // Receipt
  receiptButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  receiptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    minHeight: 44,
  },
  receiptBtnFull: {
    flex: 1,
  },
  receiptPreviewRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  receiptThumb: {
    width: RECEIPT_THUMB_SIZE,
    height: RECEIPT_THUMB_SIZE,
  },
  receiptActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  receiptActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 30,
  },
  receiptUploadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  receiptErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  retryBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
