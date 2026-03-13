import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Compass,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

type Feature = {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const features: Feature[] = [
  {
    id: 'gasolineras',
    title: 'Gasolineras',
    description: 'Compara precios por combustible y encuentra la mejor opción cerca de ti.',
    icon: BarChart3,
  },
  {
    id: 'electrolineras',
    title: 'Electrolineras',
    description: 'Descubre puntos de carga con mapa inteligente y vista progresiva por zoom.',
    icon: Zap,
  },
  {
    id: 'rutas',
    title: 'Rutas',
    description: 'Planifica trayectos y decide paradas según precio, ubicación y disponibilidad.',
    icon: Route,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

export default function Home() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-(--color-bg) text-(--color-text)">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="landing-glow-1" />
        <div className="landing-glow-2" />
        <div className="landing-grid" />
      </div>

      <motion.section
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-12"
      >
        <div className="landing-panel rounded-3xl p-5 sm:p-8">
          <div className="mb-8 flex items-center justify-between gap-3 sm:mb-10">
            <div className="flex items-center gap-3">
              <img src={logo} alt="TankGo" className="h-9 w-auto sm:h-11" />
              <span className="text-xs font-semibold tracking-[0.18em] text-(--color-text-muted) uppercase">
                movilidad inteligente
              </span>
            </div>

            {isAuthenticated ? (
              <Link
                to="/gasolineras"
                className="inline-flex min-h-11 items-center rounded-full bg-(--color-primary) px-4 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2"
              >
                Entrar
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-(--color-primary) ring-1 ring-(--color-primary-soft) transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                >
                  Iniciar sesion
                </Link>
                <Link
                  to="/register"
                  className="inline-flex min-h-11 items-center rounded-full bg-(--color-primary) px-4 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                >
                  Crear cuenta
                </Link>
              </div>
            )}
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 py-1 text-xs font-medium text-(--color-text-muted)">
                <Compass className="h-3.5 w-3.5" />
                App mobile first
              </p>

              <h1 className="text-balance text-3xl font-bold leading-tight text-(--color-primary-ink) sm:text-4xl lg:text-5xl">
                Todo tu viaje en una sola app.
              </h1>

              <p className="mt-4 max-w-xl text-pretty text-sm leading-relaxed text-(--color-text-muted) sm:text-base">
                Consulta gasolineras, electrolineras y rutas con una experiencia clara, rapida y adaptada a tu vehiculo.
                Si no has iniciado sesion, te guiamos. Si ya tienes cuenta, entras directo a tus herramientas.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {isAuthenticated ? (
                  <>
                    <Link
                      to="/gasolineras"
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-(--color-primary) px-5 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                    >
                      Continuar como {user?.nombre ?? 'usuario'}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to="/recarga"
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/80 px-5 text-sm font-semibold text-(--color-primary) ring-1 ring-(--color-primary-soft) transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                    >
                      Ver recarga
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      to="/register"
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-(--color-primary) px-5 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                    >
                      Empezar ahora
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to="/login"
                      className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white/80 px-5 text-sm font-semibold text-(--color-primary) ring-1 ring-(--color-primary-soft) transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
                    >
                      Ya tengo cuenta
                    </Link>
                  </>
                )}
              </div>
            </div>

            <motion.aside
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12, duration: 0.4, ease: 'easeOut' }}
              className="landing-panel-soft rounded-2xl p-4 sm:p-5"
              aria-label="Vista previa"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-(--color-text-muted)">
                Vista rapida
              </p>
              <ul className="space-y-3">
                <li className="rounded-xl bg-white/85 p-3 ring-1 ring-(--color-border)">
                  <p className="text-xs text-(--color-text-muted)">Combustible favorito</p>
                  <p className="mt-1 text-sm font-semibold text-(--color-text)">Precio Gasolina 95 E5</p>
                </li>
                <li className="rounded-xl bg-white/85 p-3 ring-1 ring-(--color-border)">
                  <p className="text-xs text-(--color-text-muted)">Modo visual</p>
                  <p className="mt-1 text-sm font-semibold text-(--color-text)">Tabla o mapa segun necesidad</p>
                </li>
                <li className="rounded-xl bg-white/85 p-3 ring-1 ring-(--color-border)">
                  <p className="text-xs text-(--color-text-muted)">Detalle de estacion</p>
                  <p className="mt-1 text-sm font-semibold text-(--color-text)">Precio, horario e historial de 30 dias</p>
                </li>
                <li className="rounded-xl bg-white/85 p-3 ring-1 ring-(--color-border)">
                  <p className="text-xs text-(--color-text-muted)">Seguridad</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-(--color-text)">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Sesion segura con JWT
                  </p>
                </li>
              </ul>
            </motion.aside>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        variants={fadeUp}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6"
      >
        <h2 className="mb-4 text-lg font-semibold text-(--color-primary-ink) sm:text-xl">
          Que puedes hacer
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.article
                key={feature.id}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.2 }}
                className="landing-card rounded-2xl p-4 sm:p-5"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--color-primary-soft) text-(--color-primary)">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-(--color-text)">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-(--color-text-muted)">{feature.description}</p>
              </motion.article>
            );
          })}
        </div>
      </motion.section>

      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={fadeUp}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6"
      >
        <div className="landing-panel rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-(--color-primary-ink) sm:text-2xl">
                Minimalista, fluida y enfocada a tu movilidad
              </h2>
              <p className="mt-2 text-sm text-(--color-text-muted) sm:text-base">
                Interfaz clara, buen contraste, controles tactiles y microinteracciones suaves.
              </p>
            </div>
            <Link
              to={isAuthenticated ? '/mapa' : '/register'}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-(--color-primary) px-5 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
            >
              {isAuthenticated ? 'Ir al mapa' : 'Crear cuenta gratis'}
              {isAuthenticated ? <MapPin className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

