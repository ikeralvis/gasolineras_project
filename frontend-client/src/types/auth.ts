// src/types/auth.ts

export interface User {
  id: number;
  nombre: string;
  email: string;
  combustible_favorito?: string;
  modelo_coche?: string;
  tipo_combustible_coche?: 'gasolina' | 'diesel' | 'electrico' | 'hibrido';
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  nombre: string;
  email: string;
  password: string;
  modelo_coche?: string;
  tipo_combustible_coche?: 'gasolina' | 'diesel' | 'electrico' | 'hibrido';
}

export interface AuthResponse {
  token: string;
  user: User;
}
