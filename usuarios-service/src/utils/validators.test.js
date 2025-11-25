import { describe, it, expect } from 'vitest';
import { 
  validateStrongPassword, 
  validateEmail, 
  sanitizeName 
} from './validators.js';

describe('validateStrongPassword', () => {
  it('debería rechazar contraseñas menores a 8 caracteres', () => {
    const result = validateStrongPassword('Abc1!');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('8 caracteres');
  });

  it('debería rechazar contraseñas sin mayúsculas', () => {
    const result = validateStrongPassword('password123!');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('mayúsculas');
  });

  it('debería rechazar contraseñas sin minúsculas', () => {
    const result = validateStrongPassword('PASSWORD123!');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('minúsculas');
  });

  it('debería rechazar contraseñas sin números', () => {
    const result = validateStrongPassword('Password!@#');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('número');
  });

  it('debería rechazar contraseñas sin caracteres especiales', () => {
    const result = validateStrongPassword('Password123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('carácter especial');
  });

  it('debería aceptar contraseñas válidas', () => {
    const validPasswords = [
      'Password123!',
      'MySecure@Pass1',
      'Test_2024!ABC',
      'Complex#Password99',
    ];

    for (const password of validPasswords) {
      const result = validateStrongPassword(password);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });
});

describe('validateEmail', () => {
  it('debería rechazar emails vacíos', () => {
    const result = validateEmail('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('requerido');
  });

  it('debería rechazar emails solo con espacios', () => {
    const result = validateEmail('   ');
    expect(result.valid).toBe(false);
  });

  it('debería rechazar emails muy largos (>254 chars)', () => {
    const longEmail = 'a'.repeat(250) + '@test.com';
    const result = validateEmail(longEmail);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('largo');
  });

  it('debería rechazar emails con formato inválido', () => {
    const invalidEmails = [
      'noatsymbol.com',
      '@nodomain.com',
      'no@domain',
      'spaces in@email.com',
      'double@@email.com',
    ];

    for (const email of invalidEmails) {
      const result = validateEmail(email);
      expect(result.valid).toBe(false);
    }
  });

  it('debería aceptar emails válidos', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.org',
      'user+tag@example.co.uk',
      'test123@subdomain.domain.com',
    ];

    for (const email of validEmails) {
      const result = validateEmail(email);
      expect(result.valid).toBe(true);
    }
  });
});

describe('sanitizeName', () => {
  it('debería eliminar espacios al inicio y final', () => {
    expect(sanitizeName('  Juan García  ')).toBe('Juan García');
  });

  it('debería reducir múltiples espacios a uno solo', () => {
    expect(sanitizeName('Juan    García')).toBe('Juan García');
  });

  it('debería manejar nombres normales sin cambios', () => {
    expect(sanitizeName('María López')).toBe('María López');
  });

  it('debería manejar nombres con tabs y saltos de línea', () => {
    expect(sanitizeName('Juan\t\nGarcía')).toBe('Juan García');
  });
});
