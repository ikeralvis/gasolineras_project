// src/types/auth.ts

export interface User {
  id: number;
  nombre: string;
  email: string;
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
}

export interface AuthResponse {
  token: string;
  user: User;
}
