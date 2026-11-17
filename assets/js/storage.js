// Salvataggio di campagne, marker, percorsi e preferenze.
//
// Il "backend" è qualunque oggetto con getItem/setItem (di norma
// window.localStorage). Per salvare su un server basta passare a initMap un
// oggetto con la stessa interfaccia.

import { LIMITS } from './config.js';
import { normalizeMarker, normalizeRoute } from './core.js';

const CAMPAIGNS_KEY = 'eberronCampaigns';
const LEGACY_MARKERS_KEY = 'eberronMarkers';
const LAYERS_KEY = 'eberronLayers';
const DEFAULT_NAME = 'La mia campagna';

export function newId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function readJson(backend, key) {
  try {
    const text = backend.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return null;
  }
}

function normalizeCampaign(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    name: String(raw.name ?? '').slice(0, LIMITS.name).trim() || DEFAULT_NAME,
    markers: (Array.isArray(raw.markers) ? raw.markers : []).map(normalizeMarker).filter(Boolean),
    routes: (Array.isArray(raw.routes) ? raw.routes : []).map(normalizeRoute).filter(Boolean)
  };
}

export class CampaignStore {
  constructor(backend) {
    this.backend = backend;
    this.state = this.load();
    // Dopo la migrazione dal vecchio formato i dati si salvano subito nel nuovo.
    if (!readJson(backend, CAMPAIGNS_KEY)) this.persist();
  }

  load() {
    const saved = readJson(this.backend, CAMPAIGNS_KEY);
    let campaigns = saved && Array.isArray(saved.campaigns) ? saved.campaigns.map(normalizeCampaign).filter(Boolean) : [];
    if (!campaigns.length) {
      // Prima apertura, o dati della versione precedente (un solo elenco di marker).
      const legacy = readJson(this.backend, LEGACY_MARKERS_KEY);
      campaigns = [normalizeCampaign({ id: newId(), name: DEFAULT_NAME, markers: Array.isArray(legacy) ? legacy : [] })];
    }
    const current = saved && campaigns.some((c) => c.id === saved.current) ? saved.current : campaigns[0].id;
    return { current, campaigns };
  }

  // Restituisce false se il salvataggio non è riuscito (spazio esaurito,
  // navigazione privata...).
  persist() {
    try {
      this.backend.setItem(CAMPAIGNS_KEY, JSON.stringify({ version: 2, ...this.state }));
      return true;
    } catch (e) {
      return false;
    }
  }

  get campaigns() {
    return this.state.campaigns;
  }

  get current() {
    return this.state.campaigns.find((c) => c.id === this.state.current);
  }

  select(id) {
    if (!this.state.campaigns.some((c) => c.id === id)) return false;
    this.state.current = id;
    return this.persist();
  }

  create(name) {
    if (this.state.campaigns.length >= LIMITS.campaigns) return null;
    const campaign = normalizeCampaign({ id: newId(), name });
    this.state.campaigns.push(campaign);
    this.state.current = campaign.id;
    this.persist();
    return campaign;
  }

  rename(id, name) {
    const campaign = this.state.campaigns.find((c) => c.id === id);
    if (!campaign) return false;
    campaign.name = String(name).slice(0, LIMITS.name).trim() || campaign.name;
    return this.persist();
  }

  // L'ultima campagna non si può eliminare: al suo posto se ne crea una vuota.
  remove(id) {
    this.state.campaigns = this.state.campaigns.filter((c) => c.id !== id);
    if (!this.state.campaigns.length) this.state.campaigns.push(normalizeCampaign({ id: newId(), name: DEFAULT_NAME }));
    if (!this.state.campaigns.some((c) => c.id === this.state.current)) this.state.current = this.state.campaigns[0].id;
    return this.persist();
  }

  setMarkers(markers) {
    this.current.markers = markers.map(normalizeMarker).filter(Boolean);
    return this.persist();
  }

  setRoutes(routes) {
    this.current.routes = routes.map(normalizeRoute).filter(Boolean);
    return this.persist();
  }

  loadLayers() {
    const saved = readJson(this.backend, LAYERS_KEY);
    return saved && typeof saved === 'object' ? saved : {};
  }

  saveLayers(layers) {
    try {
      this.backend.setItem(LAYERS_KEY, JSON.stringify(layers));
    } catch (e) {
      // Le preferenze dei livelli sono una comodità: se non si salvano, pazienza.
    }
  }
}

// Backend in memoria: per i test, o quando il browser blocca localStorage.
export function memoryBackend(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    data
  };
}

// localStorage se il browser lo permette; altrimenti la memoria, e
// "persistent: false" avvisa che i dati andranno persi alla chiusura.
export function defaultBackend() {
  try {
    const probe = '__eberron_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return { store: window.localStorage, persistent: true };
  } catch (e) {
    return { store: memoryBackend(), persistent: false };
  }
}
