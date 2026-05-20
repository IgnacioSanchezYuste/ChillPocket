import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { GoogleButtonView } from './GoogleButtonView';
import { useToast } from './Toast';
import { googleAuthAvailable } from '../api/googleConfig';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

type Props = {
  label?: string;
  hideIfUnavailable?: boolean;
};

// Implementación WEB (y fallback de tipos para TS). En Android/iOS Metro
// usa GoogleButton.native.tsx en su lugar.
export const GoogleButton: React.FC<Props> = (props) => {
  const available = googleAuthAvailable();
  if (props.hideIfUnavailable !== false && !available) return null;
  return (
    <ErrorBoundary label="GoogleButton" fallback={null}>
      <GoogleButtonWebInner {...props} />
    </ErrorBoundary>
  );
};

const GoogleButtonWebInner: React.FC<Props> = ({ label = 'Continuar con Google' }) => {
  const toast = useToast();
  const { request, signIn, state } = useGoogleAuth();

  React.useEffect(() => {
    if (state.status === 'error') toast.error(state.error);
  }, [state]);

  return (
    <GoogleButtonView
      label={label}
      loading={state.status === 'pending'}
      disabled={!request || state.status === 'pending'}
      onPress={signIn}
    />
  );
};
