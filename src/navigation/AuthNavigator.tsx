import React, { useEffect, useState } from 'react';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { track } from '../utils/analytics';

const SCREEN_NAMES = { login: 'Login', register: 'Register', forgot: 'ForgotPassword' } as const;

export const AuthNavigator: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [forgotEmail, setForgotEmail] = useState('');

  // No es un navigator real: la vista de pantalla se cuenta aquí.
  useEffect(() => {
    track('screen', SCREEN_NAMES[mode]);
  }, [mode]);

  if (mode === 'register') return <RegisterScreen onGoToLogin={() => setMode('login')} />;
  if (mode === 'forgot') {
    return <ForgotPasswordScreen initialEmail={forgotEmail} onBack={() => setMode('login')} />;
  }
  return (
    <LoginScreen
      onGoToRegister={() => setMode('register')}
      onForgotPassword={(email) => {
        setForgotEmail(email);
        setMode('forgot');
      }}
    />
  );
};
