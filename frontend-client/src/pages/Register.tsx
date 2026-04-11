import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  User,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

const FUEL_OPTIONS = [
  { value: 'gasolina', label: 'Gasolina', hint: 'Te mostraremos gasolina por defecto' },
  { value: 'diesel', label: 'Diésel', hint: 'Verás diésel como combustible principal' },
  { value: 'electrico', label: 'Eléctrico', hint: 'Priorizaremos puntos de recarga' },
  { value: 'hibrido', label: 'Híbrido', hint: 'Combinaremos opciones de repostaje y recarga' },
] as const;

const GOOGLE_OAUTH_ENABLED = Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim());

type FuelType = (typeof FUEL_OPTIONS)[number]['value'];

function needsOnboarding(user: { modelo_coche?: string; tipo_combustible_coche?: string }) {
  return !user.modelo_coche || !user.tipo_combustible_coche;
}

export default function Register() {
  const navigate = useNavigate();
  const { register, loginWithGoogleCredential } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [modeloCoche, setModeloCoche] = useState('');
  const [tipoCombustible, setTipoCombustible] = useState<FuelType | ''>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleOAuthMissing = !GOOGLE_OAUTH_ENABLED;

  const passwordRules = useMemo(
    () => ({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/'`~]/.test(password),
    }),
    [password]
  );

  const passwordIsValid = Object.values(passwordRules).every(Boolean);
  let submitLabel = 'Crear cuenta';
  if (loading) {
    submitLabel = 'Creando cuenta...';
  } else if (step === 1) {
    submitLabel = 'Continuar';
  }

  const validateStepOne = () => {
    if (!passwordIsValid) {
      setError('La contraseña debe cumplir todos los requisitos.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return false;
    }
    return true;
  };

  const validateStepTwo = () => {
    if (!modeloCoche.trim()) {
      setError('Indica qué coche tienes.');
      return false;
    }
    if (!tipoCombustible) {
      setError('Selecciona el tipo de combustible de tu coche.');
      return false;
    }
    return true;
  };

  const goToStepTwo = () => {
    setError('');
    if (!validateStepOne()) return;
    setStep(2);
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (step === 1) {
      goToStepTwo();
      return;
    }

    if (!validateStepTwo()) {
      return;
    }

    const selectedFuel = tipoCombustible as FuelType;

    setLoading(true);
    try {
      await register({
        nombre,
        email,
        password,
        modelo_coche: modeloCoche.trim(),
        tipo_combustible_coche: selectedFuel,
      });
      navigate('/gasolineras');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear la cuenta.');
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
      setError(err instanceof Error ? err.message : 'Error al registrarte con Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  let googleAuthContent = (
    <GoogleLogin
      onSuccess={handleGoogleSuccess}
      onError={() => setError('Error al registrarte con Google')}
      useOneTap={false}
      theme="outline"
      size="large"
      text="continue_with"
      shape="pill"
      ux_mode="popup"
    />
  );

  if (googleLoading) {
    googleAuthContent = (
      <div className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-(--color-text-muted) ring-1 ring-(--color-border)">
        <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-(--color-primary) border-t-transparent" />
        <span>Registrando con Google...</span>
      </div>
    );
  }

  if (googleOAuthMissing) {
    googleAuthContent = (
      <div className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-(--color-text-muted) ring-1 ring-(--color-border)">
        Registro con Google no configurado en este entorno.
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-(--color-bg) px-4 py-8 sm:px-6 sm:py-10">
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

          <div className="mb-4">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.13em] text-(--color-text-muted)">
              <span>Paso {step} de 2</span>
              <span>{step === 1 ? 'Cuenta' : 'Vehículo'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/70 ring-1 ring-(--color-border)">
              <motion.div
                className="h-full bg-(--color-primary)"
                animate={{ width: step === 1 ? '50%' : '100%' }}
                transition={{ duration: 0.22 }}
              />
            </div>
          </div>

          <h1 className="mb-2 text-2xl font-bold text-(--color-primary-ink)">
            {step === 1 ? 'Crea tu cuenta' : 'Configura tu movilidad'}
          </h1>
          <p className="mb-5 text-sm text-(--color-text-muted)">
            {step === 1
              ? 'Primero tus datos de acceso. Luego personalizamos la app para tu coche.'
              : 'Esto nos ayuda a mostrarte datos relevantes desde el primer minuto.'}
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 1 && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-(--color-text)">Nombre</span>
                  <span className="relative block">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-text-muted)" />
                    <input
                      type="text"
                      required
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Tu nombre"
                      className="w-full rounded-xl border border-(--color-border) bg-white/80 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
                    />
                  </span>
                </label>

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

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-(--color-text)">Confirmar contraseña</span>
                  <span className="relative block">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-text-muted)" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-(--color-border) bg-white/80 py-3 pl-10 pr-12 text-sm outline-none transition focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-(--color-text-muted) transition hover:text-(--color-primary)"
                      aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </span>
                </label>

                <div className="rounded-xl border border-(--color-border) bg-white/70 p-3 text-xs text-(--color-text-muted)">
                  <p className="mb-2 font-semibold">Requisitos de contraseña</p>
                  <ul className="space-y-1">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${passwordRules.length ? 'text-emerald-600' : 'text-slate-400'}`} />
                      Mínimo 8 caracteres
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${passwordRules.uppercase ? 'text-emerald-600' : 'text-slate-400'}`} />
                      Al menos una mayúscula
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${passwordRules.lowercase ? 'text-emerald-600' : 'text-slate-400'}`} />
                      Al menos una minúscula
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${passwordRules.number ? 'text-emerald-600' : 'text-slate-400'}`} />
                      Al menos un número
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${passwordRules.special ? 'text-emerald-600' : 'text-slate-400'}`} />
                      Al menos un carácter especial
                    </li>
                  </ul>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-(--color-text)">¿Qué coche tienes?</span>
                  <span className="relative block">
                    <Car className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-text-muted)" />
                    <input
                      type="text"
                      required
                      value={modeloCoche}
                      onChange={(e) => setModeloCoche(e.target.value)}
                      placeholder="Ej: Seat Ibiza 1.9 TDI"
                      className="w-full rounded-xl border border-(--color-border) bg-white/80 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
                    />
                  </span>
                </label>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-(--color-text)">¿Qué combustible usa?</legend>
                  <div className="grid gap-2">
                    {FUEL_OPTIONS.map((option) => {
                      const checked = tipoCombustible === option.value;
                      return (
                        <label
                          key={option.value}
                          className={`cursor-pointer rounded-xl border px-3 py-2.5 transition ${
                            checked
                              ? 'border-(--color-primary) bg-(--color-primary-soft)'
                              : 'border-(--color-border) bg-white/80 hover:border-(--color-primary-soft)'
                          }`}
                        >
                          <input
                            type="radio"
                            name="fuel"
                            value={option.value}
                            checked={checked}
                            onChange={() => setTipoCombustible(option.value)}
                            className="sr-only"
                          />
                          <p className="text-sm font-semibold text-(--color-text)">{option.label}</p>
                          <p className="text-xs text-(--color-text-muted)">{option.hint}</p>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            )}

            <div className="flex items-center gap-2 pt-1">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep(1);
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-(--color-border) bg-white px-4 text-sm font-semibold text-(--color-text) transition hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-(--color-primary) px-4 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong) disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitLabel}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-(--color-border)" />
            <span className="text-xs uppercase tracking-[0.12em] text-(--color-text-muted)">o</span>
            <div className="h-px flex-1 bg-(--color-border)" />
          </div>

          <div className="flex justify-center">
            {googleAuthContent}
          </div>

          <p className="mt-6 text-center text-sm text-(--color-text-muted)">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-semibold text-(--color-primary) hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}