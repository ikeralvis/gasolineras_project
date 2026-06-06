import { useState, useEffect } from 'react';

const API_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export interface PredictionPoint {
  ideess: string;
  fuel: string;
  forecast_date: string;
  run_date: string;
  precio_predicho: number;
  margen_min: number;
  margen_max: number;
}

export interface UsePredictionsResult {
  byStation: Record<string, PredictionPoint[]>;
  runDate: string | null;
  loading: boolean;
  error: string | null;
}

export function usePredictions(ideessList: string[]): UsePredictionsResult {
  const [byStation, setByStation] = useState<Record<string, PredictionPoint[]>>({});
  const [runDate, setRunDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableKey = [...ideessList].sort((a, b) => a.localeCompare(b)).join(',');

  useEffect(() => {
    if (!stableKey) {
      setByStation({});
      setRunDate(null);
      return;
    }

    setLoading(true);
    setError(null);

    const ids = stableKey; // already sorted & joined, max 20 enforced by slice
    fetch(`${API_URL}/api/prediction/batch?ideess=${encodeURIComponent(ids.split(',').slice(0, 20).join(','))}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(json => {
        setByStation(json.by_station || {});
        setRunDate(json.run_date || null);
      })
      .catch(() => setError('no_data'))
      .finally(() => setLoading(false));
  }, [stableKey]); // stableKey is a primitive — safe dep

  return { byStation, runDate, loading, error };
}
