import {
  sanitizeText,
  validateAmount,
  validateEmail,
  validateISODate,
  validateName,
  validatePassword,
} from '../validators';

describe('validateAmount', () => {
  it('acepta coma decimal', () => {
    expect(validateAmount('12,50')).toBeNull();
  });

  it('rechaza texto no numérico', () => {
    expect(validateAmount('abc')).toBe('Importe no válido');
  });

  it('aplica mínimo y máximo', () => {
    expect(validateAmount('-1')).toBe('Debe ser ≥ 0');
    expect(validateAmount('0.5', { min: 1 })).toBe('Debe ser ≥ 1');
    expect(validateAmount('101', { max: 100 })).toBe('Debe ser ≤ 100');
  });
});

describe('validateISODate', () => {
  it('exige formato YYYY-MM-DD', () => {
    expect(validateISODate('2026-03-01')).toBeNull();
    expect(validateISODate('1/3/2026')).toBe('Formato YYYY-MM-DD');
  });

  it('rechaza meses imposibles', () => {
    expect(validateISODate('2026-13-01')).toBe('Fecha no válida');
  });
});

describe('validadores de cuenta', () => {
  it('email', () => {
    expect(validateEmail('  ana@example.com ')).toBeNull();
    expect(validateEmail('')).toBe('El email es obligatorio');
    expect(validateEmail('ana@example')).toBe('Email no válido');
  });

  it('contraseña', () => {
    expect(validatePassword('12345')).toBe('Mínimo 6 caracteres');
    expect(validatePassword('123456')).toBeNull();
  });

  it('nombre', () => {
    expect(validateName(' a ')).toBe('Mínimo 2 caracteres');
    expect(validateName('Ana')).toBeNull();
  });
});

describe('sanitizeText', () => {
  it('recorta y colapsa espacios', () => {
    expect(sanitizeText('  hola   mundo \n')).toBe('hola mundo');
  });
});
