import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { useSecurityStore } from '../../store/useSecurityStore';
import { useToast } from '../../components/Toast';
import { biometricEnrolled, biometricHardwareAvailable } from '../../utils/biometric';

type Mode = 'enable' | 'change' | 'disable';
type Step = 'newPin' | 'confirmPin' | 'currentPin' | 'biometric';

type Props = {
  visible: boolean;
  mode: Mode;
  onClose: () => void;
  onDone?: () => void;
};

const MIN_LEN = 4;
const MAX_LEN = 6;

/**
 * Sheet unificado para activar, cambiar o desactivar el bloqueo. Internamente
 * gestiona los sub-pasos (PIN nuevo, confirmación, PIN actual, biometría).
 */
export const SecuritySetupSheet: React.FC<Props> = ({ visible, mode, onClose, onDone }) => {
  const { palette } = useTheme();
  const toast = useToast();
  const sec = useSecurityStore();

  const [step, setStep] = useState<Step>('newPin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [useBio, setUseBio] = useState(false);

  // Reset al abrir + comprobación de hardware biométrico.
  useEffect(() => {
    if (!visible) return;
    setPin('');
    setConfirmPin('');
    setStep(mode === 'enable' ? 'newPin' : 'currentPin');
    (async () => {
      const hasHw = await biometricHardwareAvailable();
      const enrolled = hasHw && (await biometricEnrolled());
      setBioAvailable(enrolled);
      setUseBio(enrolled);
    })();
  }, [visible, mode]);

  const title =
    mode === 'enable' ? 'Activar bloqueo' :
    mode === 'change' ? 'Cambiar PIN' :
    'Desactivar bloqueo';

  const onDigit = (d: string) => {
    if (step === 'newPin') {
      if (pin.length < MAX_LEN) setPin(pin + d);
    } else if (step === 'confirmPin') {
      if (confirmPin.length < MAX_LEN) setConfirmPin(confirmPin + d);
    } else if (step === 'currentPin') {
      if (pin.length < MAX_LEN) setPin(pin + d);
    }
  };
  const onBackspace = () => {
    if (step === 'newPin') setPin(pin.slice(0, -1));
    else if (step === 'confirmPin') setConfirmPin(confirmPin.slice(0, -1));
    else if (step === 'currentPin') setPin(pin.slice(0, -1));
  };

  const proceed = async () => {
    if (mode === 'enable') {
      if (step === 'newPin') {
        if (pin.length < MIN_LEN) return toast.error(`El PIN debe tener al menos ${MIN_LEN} dígitos`);
        setStep('confirmPin');
        return;
      }
      if (step === 'confirmPin') {
        if (confirmPin !== pin) {
          toast.error('Los PIN no coinciden');
          setConfirmPin('');
          return;
        }
        setStep('biometric');
        return;
      }
      if (step === 'biometric') {
        await sec.enable(pin, useBio && bioAvailable);
        toast.success('Bloqueo activado');
        onDone?.();
        onClose();
      }
    } else if (mode === 'change') {
      if (step === 'currentPin') {
        const ok = await sec.verifyPin(pin);
        if (!ok) { toast.error('PIN actual incorrecto'); setPin(''); return; }
        setPin(''); setStep('newPin');
        return;
      }
      if (step === 'newPin') {
        if (pin.length < MIN_LEN) return toast.error(`El PIN debe tener al menos ${MIN_LEN} dígitos`);
        setStep('confirmPin');
        return;
      }
      if (step === 'confirmPin') {
        if (confirmPin !== pin) {
          toast.error('Los PIN no coinciden');
          setConfirmPin('');
          return;
        }
        await sec.setPin(pin);
        toast.success('PIN actualizado');
        onDone?.();
        onClose();
      }
    } else { // disable
      if (step === 'currentPin') {
        const ok = await sec.verifyPin(pin);
        if (!ok) { toast.error('PIN incorrecto'); setPin(''); return; }
        await sec.disable();
        toast.success('Bloqueo desactivado');
        onDone?.();
        onClose();
      }
    }
  };

  const subtitle =
    step === 'newPin' ? `Introduce un PIN de ${MIN_LEN}-${MAX_LEN} dígitos` :
    step === 'confirmPin' ? 'Repítelo para confirmar' :
    step === 'currentPin' ? 'Introduce tu PIN actual' :
    'Decide si usar biometría';

  const activePin = step === 'confirmPin' ? confirmPin : pin;
  const ctaLabel =
    step === 'newPin' ? 'Siguiente' :
    step === 'confirmPin' ? 'Siguiente' :
    step === 'currentPin' ? (mode === 'disable' ? 'Desactivar bloqueo' : 'Continuar') :
    'Guardar';
  const ctaDisabled = step !== 'biometric' && activePin.length < MIN_LEN;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <Button title={ctaLabel} onPress={proceed} disabled={ctaDisabled} size="lg" />
      }
    >
      <Text variant="body" tone="secondary" align="center">{subtitle}</Text>

      {step !== 'biometric' ? (
        <>
          <View style={styles.dots}>
            {Array.from({ length: MAX_LEN }).map((_, i) => {
              const active = i < activePin.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: active ? palette.accent : 'transparent',
                      borderColor: active ? palette.accent : palette.borderStrong,
                    },
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.pad}>
            {['1','2','3','4','5','6','7','8','9'].map((d) => (
              <Pressable
                key={d}
                onPress={() => onDigit(d)}
                android_ripple={{ color: palette.bgElevated, borderless: true, radius: 36 }}
                style={styles.padBtn}
              >
                <Text variant="display" tabular>{d}</Text>
              </Pressable>
            ))}
            <View style={styles.padBtn} />
            <Pressable
              onPress={() => onDigit('0')}
              android_ripple={{ color: palette.bgElevated, borderless: true, radius: 36 }}
              style={styles.padBtn}
            >
              <Text variant="display" tabular>0</Text>
            </Pressable>
            <Pressable onPress={onBackspace} hitSlop={8} style={styles.padBtn}>
              <Ionicons name="backspace-outline" size={26} color={palette.textSecondary} />
            </Pressable>
          </View>
        </>
      ) : (
        <View style={[styles.bioRow, { borderColor: palette.borderSubtle }]}>
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="semibold">Desbloquear con huella / cara</Text>
            <Text variant="caption" tone="muted">
              {bioAvailable
                ? 'Usaremos el sensor del dispositivo cuando esté disponible.'
                : 'Tu dispositivo no tiene biometría configurada; usaremos solo el PIN.'}
            </Text>
          </View>
          <Switch
            value={useBio && bioAvailable}
            onValueChange={setUseBio}
            disabled={!bioAvailable}
            trackColor={{ false: palette.borderStrong, true: palette.accent }}
            thumbColor={palette.bgSurface}
          />
        </View>
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 10, marginVertical: spacing.lg, justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignSelf: 'center', width: 270, rowGap: spacing.sm },
  padBtn: { width: 80, height: 56, alignItems: 'center', justifyContent: 'center' },
  bioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
});
