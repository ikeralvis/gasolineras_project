import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { motion } from 'framer-motion';
import { Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

function needsOnboarding(user: { modelo_coche?: string; tipo_combustible_coche?: string }) {
  return !user.modelo_coche || !user.tipo_combustible_coche;
}

const GOOGLE_OAUTH_ENABLED = Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim());

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, loginWithGoogleCredential } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(searchParams.get('error') ? 'No se pudo autenticar tu sesión.' : '');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);
      if (needsOnboarding(user)) {
        navigate('/profile?onboarding=1');
        return;
      }
      navigate('/gasolineras');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      setError('No se recibió credencial de Google.');
      return;
    }

    setGoogleLoading(true);
    setError('');

    try {
      const user = await loginWithGoogleCredential(credentialResponse.credential);
      if (needsOnboarding(user)) {
        navigate('/profile?onboarding=1');
        return;
      }
      navigate('/gasolineras');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión con Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-(--color-bg) px-4 py-10 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="landing-glow-1" />
        <div className="landing-glow-2" />
        <div className="landing-grid" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="mx-auto w-full max-w-md"
      >
        <div className="landing-panel rounded-3xl p-5 sm:p-7">
          <div className="mb-6 flex items-center justify-center">
            <img src={logo} alt="TankGo" className="h-14 w-auto" />
          </div>

          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-(--color-primary-ink)">Bienvenido de nuevo</h1>
            <p className="mt-2 text-sm text-(--color-text-muted)">
              Inicia sesión y entra directo a tus gasolineras, rutas y recarga.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-(--color-text)">Correo electrónico</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-text-muted)" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full rounded-xl border border-(--color-border) bg-white/80 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-(--color-text)">Contraseña</span>
              <span className="relative block">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-text-muted)" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-(--color-border) bg-white/80 py-3 pl-10 pr-12 text-sm outline-none transition focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-(--color-text-muted) transition hover:text-(--color-primary)"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-(--color-primary) px-4 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-(--color-border)" />
            <span className="text-xs uppercase tracking-[0.12em] text-(--color-text-muted)">o</span>
            <div className="h-px flex-1 bg-(--color-border)" />
          </div>

          <div className="flex justify-center">
            {!GOOGLE_OAUTH_ENABLED ? (
              <div className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-(--color-text-muted) ring-1 ring-(--color-border)">
                Login con Google no configurado en este entorno.
              </div>
            ) : googleLoading ? (
              <div className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-(--color-text-muted) ring-1 ring-(--color-border)">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-(--color-primary) border-t-transparent" />
                Validando Google...
              </div>
            ) : (
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Error al iniciar sesión con Google')}
                useOneTap={false}
                theme="outline"
                size="large"
                text="continue_with"
                shape="pill"
                locale="es"
                ux_mode="popup"
              />
            )}
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Tu sesión se valida con JWT a través del gateway para mantener un acceso seguro.
          </div>

          <p className="mt-6 text-center text-sm text-(--color-text-muted)">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="font-semibold text-(--color-primary) hover:underline">
              Crear cuenta
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

