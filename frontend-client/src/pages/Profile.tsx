import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/http";

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  is_admin: boolean;
  combustible_favorito?: string;
  modelo_coche?: string;
  tipo_combustible_coche?: 'gasolina' | 'diesel' | 'electrico' | 'hibrido';
}

const COMBUSTIBLES = [
  { value: "Precio Gasolina 95 E5", label: "Gasolina 95 E5", color: "#16a34a" },
  { value: "Precio Gasolina 98 E5", label: "Gasolina 98 E5", color: "#0d9488" },
  { value: "Precio Gasoleo A",      label: "Gasóleo A",      color: "#2563eb" },
  { value: "Precio Gasoleo B",      label: "Gasóleo B",      color: "#4f46e5" },
  { value: "Precio Gasoleo Premium", label: "Gasóleo Premium", color: "#7c3aed" },
];

export default function Profile() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, logout, refreshUser } = useAuth();
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [combustibleSeleccionado, setCombustibleSeleccionado] = useState<string>("");
  const [modeloCoche, setModeloCoche] = useState<string>("");
  const [guardandoCombustible, setGuardandoCombustible] = useState(false);
  const [saveOkMessage, setSaveOkMessage] = useState<string>("");
  const navigate = useNavigate();
  const onboardingMode = searchParams.get('onboarding') === '1';

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setLoading(true);
    apiFetch('/api/usuarios/me')
      .then((r) => r.json())
      .then((perfilData) => {
        if (perfilData.error) setError(perfilData.error);
        else {
          setPerfil(perfilData);
          setCombustibleSeleccionado(perfilData.combustible_favorito || "Precio Gasolina 95 E5");
          setModeloCoche(perfilData.modelo_coche || "");
        }
      })
      .catch(() => setError(t('profile.errorLoadingUserData')))
      .finally(() => setLoading(false));
  }, [isAuthenticated, navigate, t]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleDelete = async () => {
    if (!globalThis.confirm(t('profile.deleteConfirm'))) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/usuarios/me', { method: "DELETE" });
      if (res.ok) {
        logout();
        navigate("/register");
      } else {
        const data = await res.json();
        setError(data.error || t('profile.errorDeletingAccount'));
      }
    } catch {
      setError(t('profile.networkErrorDeletingAccount'));
    } finally {
      setLoading(false);
    }
  };

  const deriveCarFuelType = (fuel: string): 'gasolina' | 'diesel' | 'electrico' | 'hibrido' => {
    if (fuel.includes('Gasolina')) return 'gasolina';
    if (fuel.includes('Gasoleo') || fuel.includes('Gasóleo')) return 'diesel';
    return 'gasolina';
  };

  const handleGuardarCombustible = async () => {
    if (!perfil) return;
    if (!modeloCoche.trim()) {
      setError(t('profile.vehicleModelRequired'));
      return;
    }
    const tipoCombustibleCoche = deriveCarFuelType(combustibleSeleccionado);
    const unchanged =
      combustibleSeleccionado === perfil.combustible_favorito &&
      modeloCoche.trim() === (perfil.modelo_coche || "") &&
      tipoCombustibleCoche === (perfil.tipo_combustible_coche || '');
    if (unchanged) return;

    setGuardandoCombustible(true);
    setSaveOkMessage("");
    setError("");
    try {
      const res = await apiFetch('/api/usuarios/me', {
        method: "PATCH",
        body: JSON.stringify({
          combustible_favorito: combustibleSeleccionado,
          modelo_coche: modeloCoche.trim(),
          tipo_combustible_coche: tipoCombustibleCoche,
        }),
      });
      if (res.ok) {
        const patchedPerfil = await res.json();
        if (patchedPerfil?.error) { setError(patchedPerfil.error); return; }
        const refreshed = await apiFetch('/api/usuarios/me');
        const updatedPerfil = await refreshed.json();
        if (!updatedPerfil.error) {
          setPerfil(updatedPerfil);
          setCombustibleSeleccionado(updatedPerfil.combustible_favorito || "Precio Gasolina 95 E5");
          setModeloCoche(updatedPerfil.modelo_coche || "");
          await refreshUser();
          setSaveOkMessage(t('profile.updateSuccess'));
        }
        if (onboardingMode) navigate('/gasolineras', { replace: true });
      } else {
        const data = await res.json();
        setError(data.error || t('profile.errorSavingPreference'));
      }
    } catch {
      setError(t('profile.networkErrorSavingPreference'));
    } finally {
      setGuardandoCombustible(false);
    }
  };

  const getLabelTipoCoche = (tipo?: string) => {
    const labels: Record<string, string> = {
      gasolina: t('profile.vehicleFuelOptions.gasolina'),
      diesel: t('profile.vehicleFuelOptions.diesel'),
      electrico: t('profile.vehicleFuelOptions.electrico'),
      hibrido: t('profile.vehicleFuelOptions.hibrido'),
    };
    return tipo ? labels[tipo] || tipo : t('profile.notDefined');
  };

  const initials = perfil?.nombre
    ? perfil.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const selectedFuel = COMBUSTIBLES.find(c => c.value === combustibleSeleccionado);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6FF] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#000C74] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!perfil) {
    return (
      <div className="min-h-screen bg-[#F4F6FF] flex items-center justify-center px-4">
        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-xl max-w-md">
          <p className="text-red-700 font-medium">{error || t('profile.errorLoadingProfile')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FF]">
      {/* Gradient header */}
      <div className="bg-linear-to-br from-[#000C74] to-[#2A36B8] px-4 pt-10 pb-28">
        <div className="max-w-md mx-auto text-center text-white">
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            {initials}
          </div>
          <h1 className="text-2xl font-bold">{perfil.nombre}</h1>
          <p className="text-white/70 text-sm mt-1 flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            {perfil.email}
          </p>
          {perfil.is_admin && (
            <span className="inline-flex items-center gap-1 mt-3 px-3 py-1 bg-amber-400/20 text-amber-200 border border-amber-400/30 rounded-full text-xs font-semibold">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Admin
            </span>
          )}
        </div>
      </div>

      {/* Cards overlapping the gradient */}
      <div className="max-w-md mx-auto px-4 -mt-20 pb-12 space-y-4">

        {/* Onboarding banner */}
        {onboardingMode && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
            {t('profile.onboardingBanner')}
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto shrink-0 text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        )}

        {/* Tu vehículo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#F0F2FF] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#000C74]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('profile.favoriteFuel', { defaultValue: 'Tu vehículo' })}</h2>
              <p className="text-xs text-gray-500">{t('profile.favoriteFuelDescription', { defaultValue: 'Configura tu coche y combustible habitual' })}</p>
            </div>
          </div>

          <label htmlFor="modelo-coche" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('profile.vehicleModel', { defaultValue: 'Modelo del vehículo' })}
          </label>
          <input
            id="modelo-coche"
            type="text"
            value={modeloCoche}
            onChange={(e) => setModeloCoche(e.target.value)}
            placeholder={t('profile.vehicleModelPlaceholder', { defaultValue: 'Ej: Toyota Yaris 1.5 HSD' })}
            className="w-full border border-gray-200 focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/10 rounded-xl px-3.5 py-2.5 outline-none transition text-sm bg-gray-50 focus:bg-white text-gray-900 mb-4"
          />

          <p className="text-sm font-medium text-gray-700 mb-2">
            {t('profile.fuelType', { defaultValue: '¿Qué combustible usas habitualmente?' })}
          </p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {COMBUSTIBLES.map((c) => {
              const isSelected = combustibleSeleccionado === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCombustibleSeleccionado(c.value)}
                  className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-[#000C74] bg-[#F0F2FF] text-[#000C74]'
                      : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-white'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-xs font-medium leading-tight">{c.label}</span>
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5">
                      <svg className="w-3 h-3 text-[#000C74]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selectedFuel && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-gray-500">
                {t('profile.vehicleFuelType', { defaultValue: 'Tipo detectado' })}:{" "}
                <span className="font-semibold text-gray-700">
                  {getLabelTipoCoche(deriveCarFuelType(combustibleSeleccionado))}
                </span>
              </p>
            </div>
          )}

          <button
            onClick={handleGuardarCombustible}
            disabled={
              guardandoCombustible ||
              (
                combustibleSeleccionado === perfil.combustible_favorito &&
                modeloCoche.trim() === (perfil.modelo_coche || '') &&
                deriveCarFuelType(combustibleSeleccionado) === (perfil.tipo_combustible_coche || '')
              )
            }
            className="w-full py-2.5 bg-[#000C74] text-white rounded-xl font-semibold text-sm hover:bg-[#000C74]/90 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {guardandoCombustible ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('profile.saving', { defaultValue: 'Guardando…' })}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('profile.savePreference', { defaultValue: 'Guardar preferencias' })}
              </>
            )}
          </button>

          {saveOkMessage && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {saveOkMessage}
            </div>
          )}
        </div>

        {/* Cuenta */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#F0F2FF] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#000C74]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-gray-900">{t('profile.accountInfo', { defaultValue: 'Mi cuenta' })}</h2>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
              <span className="text-sm text-gray-500">{t('profile.name', { defaultValue: 'Nombre' })}</span>
              <span className="text-sm font-medium text-gray-900">{perfil.nombre}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
              <span className="text-sm text-gray-500">{t('profile.email', { defaultValue: 'Email' })}</span>
              <span className="text-sm font-medium text-gray-900 truncate max-w-45">{perfil.email}</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-gray-500">{t('profile.role', { defaultValue: 'Rol' })}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${perfil.is_admin ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                {perfil.is_admin ? t('profile.admin', { defaultValue: 'Admin' }) : t('profile.user', { defaultValue: 'Usuario' })}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {t('profile.logout', { defaultValue: 'Cerrar sesión' })}
          </button>
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-5">
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">
            {t('profile.dangerZone', { defaultValue: 'Zona peligrosa' })}
          </p>
          <p className="text-sm text-gray-600 mb-3">
            {t('profile.deleteAccountDescription', { defaultValue: 'Esta acción es irreversible. Se borrarán todos tus datos y favoritos.' })}
          </p>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl font-semibold text-sm hover:bg-red-50 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {t('profile.deleteAccount', { defaultValue: 'Eliminar cuenta' })}
          </button>
        </div>
      </div>
    </div>
  );
}
