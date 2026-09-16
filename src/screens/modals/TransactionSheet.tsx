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
import { useDataStore } from '../../store/useDataStore';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { useBilling } from '../../store/useBillingStore';
import { useToast } from '../../components/Toast';
import { transactionsApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { confirmDelete } from '../../utils/confirm';
import { todayISO } from '../../utils/format';
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
  /** Scope del modelo dual. Si se omite, se usa 'month'. */
  scope?: 'month' | 'historical';
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
  const { categories, fetchCategories, refreshAll } = useDataStore();
  const { lastCategoryId, lastPaymentMethod, setLastCategory, setLastPaymentMethod } =
    usePreferencesStore();
  const toast = useToast();
  const { palette } = useTheme();
  const navigation = useNavigation<any>();
  const { hasFeature } = useBilling();
  const hasReceipts = hasFeature('receipt_photos');

  // --- Form state ---
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [scope, setScope] = useState<'month' | 'historical'>('month');
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

      if (editing) {
        setType(editing.type);
        setAmount(String(editing.amount));
        setDescription(editing.description);
        setCategoryId(editing.category_id);
        setDate(editing.transaction_date);
        setNotes(editing.notes || '');
        setPaymentMethod(editing.payment_method ?? null);
        setScope(editing.scope ?? 'month');
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
        setScope(prefill.scope ?? 'month');
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
        setScope('month');
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
  const scopeLocked = !!editing?.goal_id;

  // Colores dinámicos según tipo: danger para gastos, success para ingresos
  const typeAccent = type === 'expense' ? palette.danger : palette.success;
  const typeAccentSoft = type === 'expense' ? palette.dangerSoft : palette.successSoft;

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
    } catch {
      toast.error('No se pudo abrir la galería');
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
    } catch {
      toast.error('No se pudo abrir la cámara');
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
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('El importe debe ser mayor que 0');
    if (!description.trim()) return toast.error('Añade una descripción');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast.error('Fecha YYYY-MM-DD');

    setSaving(true);
    try {
      if (editing) {
        // Edición: primero actualizar la tx
        const scopeChanged = !scopeLocked && (editing.scope ?? 'month') !== scope;
        await transactionsApi.update(editing.id, {
          amount: amt,
          description: description.trim(),
          type,
          transaction_date: date,
          category_id: categoryId,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
          ...(scopeChanged ? { scope } : {}),
        });

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
          scope,
        });

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
    // Free: teaser con candado
    if (!hasReceipts) {
      return (
        <View style={{ gap: spacing.xs }}>
          <Text variant="label" tone="secondary">Foto del ticket</Text>
          <PremiumLock
            label="Guarda el justificante — Solo en ChillPocket Plus"
            planLabel="Ver Plus"
            variant="banner"
            feature="receipt_photos"
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
      title={editing ? 'Editar transacción' : 'Nueva transacción'}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            title={editing ? 'Guardar cambios' : 'Crear transacción'}
            onPress={onSave}
            loading={saving}
            size="lg"
          />
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

      {/* Toggle gasto / ingreso — tiñe el acento dinámicamente */}
      <View
        style={[
          styles.typeToggleWrap,
          { backgroundColor: typeAccentSoft, borderColor: typeAccent + '44' },
        ]}
      >
        <Pressable
          onPress={() => { setType('expense'); setCategoryId(null); }}
          style={[
            styles.typeBtn,
            type === 'expense' && { backgroundColor: typeAccent },
          ]}
          accessibilityLabel="Marcar como gasto"
          accessibilityState={{ selected: type === 'expense' }}
        >
          <Ionicons
            name="arrow-down-outline"
            size={15}
            color={type === 'expense' ? '#FFFFFF' : palette.textSecondary}
          />
          <Text
            variant="label"
            weight="semibold"
            style={{ color: type === 'expense' ? '#FFFFFF' : palette.textSecondary }}
          >
            Gasto
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { setType('income'); setCategoryId(null); }}
          style={[
            styles.typeBtn,
            type === 'income' && { backgroundColor: typeAccent },
          ]}
          accessibilityLabel="Marcar como ingreso"
          accessibilityState={{ selected: type === 'income' }}
        >
          <Ionicons
            name="arrow-up-outline"
            size={15}
            color={type === 'income' ? '#FFFFFF' : palette.textSecondary}
          />
          <Text
            variant="label"
            weight="semibold"
            style={{ color: type === 'income' ? '#FFFFFF' : palette.textSecondary }}
          >
            Ingreso
          </Text>
        </Pressable>
      </View>

      {/* Importe */}
      <Input
        label="Importe"
        keyboardType="decimal-pad"
        placeholder="0.00"
        value={amount}
        onChangeText={setAmount}
      />

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

      {/* Fecha + Método de pago en 2 columnas */}
      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Input
            label="Fecha"
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
          />
        </View>
        {type === 'expense' && (
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="label" tone="secondary">Tipo de pago</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.chips, { paddingVertical: 2 }]}
            >
              {PAYMENT_METHODS.map((pm) => {
                const active = paymentMethod === pm.value;
                return (
                  <Pressable
                    key={pm.value}
                    onPress={() => setPaymentMethod(active ? null : pm.value)}
                    style={[
                      styles.pmChip,
                      {
                        backgroundColor: active ? palette.accentSoft : palette.bgElevated,
                        borderColor: active ? palette.accent : palette.borderSubtle,
                      },
                    ]}
                    accessibilityLabel={`Método de pago: ${pm.label}`}
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={pm.icon}
                      size={13}
                      color={active ? palette.accent : palette.textSecondary}
                    />
                    <Text
                      variant="caption"
                      weight={active ? 'semibold' : 'medium'}
                      tone={active ? 'accent' : 'secondary'}
                    >
                      {pm.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Scope — selector dual (Saldo del mes / Mis ahorros) */}
      <View style={{ gap: spacing.xs }}>
        <Text variant="label" tone="secondary">Mover a</Text>
        <View
          style={{ opacity: scopeLocked ? 0.55 : 1 }}
          pointerEvents={scopeLocked ? 'none' : 'auto'}
        >
          <SegmentedControl
            options={[
              { value: 'month', label: 'Saldo del mes' },
              { value: 'historical', label: 'Mis ahorros' },
            ]}
            value={scope}
            onChange={setScope}
          />
        </View>
        <Text variant="caption" tone="muted">
          {scopeLocked
            ? 'Las contribuciones a una meta no pueden cambiar de pool. Para moverlas, retira y vuelve a aportar.'
            : scope === 'historical'
            ? 'Esta transacción afecta directamente a "Mis ahorros", sin pasar por el saldo del mes.'
            : 'Forma parte del periodo en curso. Cuando el mes cierre, su efecto pasa a "Mis ahorros".'}
        </Text>
      </View>

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
    </Sheet>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  chips: { gap: spacing.sm, paddingVertical: 4 },
  pmChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
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
  twoCol: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
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
