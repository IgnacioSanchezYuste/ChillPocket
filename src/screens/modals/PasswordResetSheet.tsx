import React from 'react';
import { Sheet } from '../../components/Sheet';
import { PasswordResetForm } from '../../components/PasswordResetForm';
import { useToast } from '../../components/Toast';
import { useAuthStore } from '../../store/useAuthStore';

type Props = { visible: boolean; onClose: () => void };

/** Recuperación de contraseña desde Ajustes (sirve también a cuentas de Google sin contraseña). */
export const PasswordResetSheet: React.FC<Props> = ({ visible, onClose }) => {
  const toast = useToast();
  const email = useAuthStore((s) => s.user?.email ?? '');

  return (
    <Sheet visible={visible} onClose={onClose} title="Nueva contraseña por email">
      {visible && (
        <PasswordResetForm
          initialEmail={email}
          lockEmail
          onDone={() => {
            onClose();
            toast.success('Contraseña cambiada');
          }}
        />
      )}
    </Sheet>
  );
};
