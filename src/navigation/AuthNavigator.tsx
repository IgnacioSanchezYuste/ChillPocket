import React, { useState } from 'react';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';

export const AuthNavigator: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  if (mode === 'login') return <LoginScreen onGoToRegister={() => setMode('register')} />;
  return <RegisterScreen onGoToLogin={() => setMode('login')} />;
};
