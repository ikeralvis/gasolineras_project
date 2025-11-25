import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';

// Mock de localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock de fetch global
globalThis.fetch = vi.fn();

// Reset mocks después de cada test
afterEach(() => {
  vi.clearAllMocks();
});

