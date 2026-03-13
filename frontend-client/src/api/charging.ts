/**
 * API client for the EV Charging microservice.
 * All requests go through the API Gateway.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BoundingBox {
  lat_ne: number;
  lon_ne: number;
  lat_sw: number;
  lon_sw: number;
  zoom: number;
}

/** Nested sub-object on a type=location marker. */
export interface LocationInMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status?: string;       // AVAILABLE, CHARGING, UNKNOWN, …
  total_evse: number;
  source_type?: string;  // OCPI, …
}

/** Cluster marker — all fields flat at the top level. */
export interface ClusterMarker {
  type: "cluster";
  latitude: number;
  longitude: number;
  total_evse: number;
}

/** Individual charging location with a nested location sub-object. */
export interface LocationMarker {
  type: "location";
  latitude: number;
  longitude: number;
  total_evse: number;
  location: LocationInMarker;
}

export type EVMarker = ClusterMarker | LocationMarker;

export interface TariffPriceComponent {
  type: string; // "ENERGY" | "TIME" | "FLAT" | …
  price: number;
  vat?: number;
  step_size?: number;
}

export interface TariffElement {
  price_components?: TariffPriceComponent[];
  restrictions?: {
    start_time?: string | null;
    end_time?: string | null;
    day_of_week?: string[];
    [key: string]: unknown;
  };
}

export interface TariffInfo {
  id?: string;
  currency?: string;
  elements?: TariffElement[];
}

export interface ConnectorTariff {
  tariff?: TariffInfo;
  tariff_alt_url?: string | null;
}

export interface EVSEConnector {
  id?: string;
  standard?: string;
  format?: string;
  power_type?: string;
  max_electric_power?: number;
  tariffs?: ConnectorTariff[];
}

export interface EVSEUnit {
  id?: string;
  evse_id?: string;
  status?: string;
  connectors?: EVSEConnector[];
  payment_methods?: string[];
  last_updated?: string;
}

export interface LocationDetail {
  id: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  postal_code?: string;
  state?: string | null;
  latitude?: number;
  longitude?: number;
  coordinates?: { latitude: string | number; longitude: string | number };
  operator?: { id?: string; name?: string };
  owner?: { name?: string; website?: string; logo?: string | null; phone?: string };
  evses?: EVSEUnit[];
  facilities?: string[];
  opening_times?: { twentyfourseven?: boolean; regular_hours?: unknown[] };
  last_updated?: string;
  access_restricted?: boolean;
  [key: string]: unknown;
}

export class BoundingBoxTooLargeError extends Error {
  requiredZoom: number;
  constructor(requiredZoom: number) {
    super("Zoom in to see charging stations");
    this.name = "BoundingBoxTooLargeError";
    this.requiredZoom = requiredZoom;
  }
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * Fetch EV charging markers for the current map viewport.
 * Throws BoundingBoxTooLargeError when the backend returns a 400/BBOX_TOO_LARGE.
 */
export async function fetchEVMarkers(bbox: BoundingBox): Promise<EVMarker[]> {
  const res = await fetch(`${API_BASE}/api/charging/markers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bbox),
  });

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail ?? body;
    if (detail?.code === "BBOX_TOO_LARGE") {
      throw new BoundingBoxTooLargeError(detail.required_zoom ?? bbox.zoom + 2);
    }
  }

  if (!res.ok) {
    throw new Error(`EV markers request failed: ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch full details for a single charging location.
 * Result is cached 5 min on the backend.
 */
export async function fetchEVLocationDetail(id: string): Promise<LocationDetail> {
  const res = await fetch(`${API_BASE}/api/charging/details/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(`EV detail request failed: ${res.status}`);
  }
  return res.json();
}
