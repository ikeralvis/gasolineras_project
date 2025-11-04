import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(form.email, form.password);
      navigate('/profile');
    } catch {
      setError('Credenciales incorrectas');
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto glass p-8">
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">Iniciar sesión</h2>
      {error && <p className="text-red-500 text-sm text-center mb-2">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          placeholder="Correo electrónico"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-gray-900 focus:outline-none transition"
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-gray-900 focus:outline-none transition"
          required
        />
        <button type="submit" className="bg-gray-900 text-white py-2 rounded-lg font-medium hover:bg-gray-800 transition">
          Entrar
        </button>
      </form>
    </div>
  );
}
