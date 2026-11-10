// ---------------------------------------------------------------------------
// Configurazione
// ---------------------------------------------------------------------------
const minZoom = 1;
const maxZoom = 7;
const tileSize = 256;
const HOME_VIEW = { center: [20.009428770699756, 0.07578125], zoom: 4 };
const STORAGE_KEY = 'eberronMarkers';
const LAYERS_STORAGE_KEY = 'eberronLayers';
const PLACES_URL = 'data/places.json';
const PLACES_MIN_ZOOM = 5; // sotto questo zoom i punti dei luoghi sono nascosti
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_MARKERS = 5000;

// L'immagine della mappa occupa solo una parte del "mondo" delle tile:
// questi sono i suoi bordi in pixel allo zoom 3, con un po' di margine.
const MAP_BOUNDS_Z3 = { west: 115, east: 1930, north: 350, south: 1700 };

// Scala: miglia per pixel allo zoom massimo. Corrisponde alla barra di scala
// disegnata sulla mappa (circa 135 px ogni 1000 miglia allo zoom 3).
const MILES_PER_PIXEL_AT_MAX_ZOOM = 3.233 / 7;

// Velocità di viaggio. "milesPerDay" per chi si ferma a riposare (8 ore di
// marcia al giorno), "milesPerHour" per i mezzi che viaggiano senza sosta.
// Valori indicativi delle regole di D&D 5e / Eberron: adattali alla tua campagna.
const TRAVEL_MODES = [
  { label: 'A piedi, ritmo lento', milesPerDay: 18 },
  { label: 'A piedi, ritmo normale', milesPerDay: 24 },
  { label: 'A piedi, ritmo veloce', milesPerDay: 30 },
  { label: 'Veliero', milesPerHour: 2 },
  { label: 'Galeone elementale', milesPerHour: 20 },
  { label: 'Aeronave', milesPerHour: 20 },
  { label: 'Lightning rail', milesPerHour: 30 }
];

const PLACE_KINDS = {
  continent: { label: 'Continente', dot: false },
  nation: { label: 'Nazione', dot: false },
  region: { label: 'Regione', dot: false },
  capital: { label: 'Capitale', dot: true },
  city: { label: 'Città', dot: true },
  site: { label: 'Luogo', dot: true }
};
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;

const MARKER_TYPES = {
  city: { label: 'Città', emoji: '🏙️' },
  monster: { label: 'Posizione Mostro', emoji: '👾' },
  dungeon: { label: 'Dungeon', emoji: '🏰' },
  village: { label: 'Villaggio', emoji: '🏡' },
  other: { label: 'Altro', emoji: '📍' }
};

// ---------------------------------------------------------------------------
// Mappa
// ---------------------------------------------------------------------------
const fullmap = L.tileLayer('eberron/{z}/{x}/{y}.jpg', {
  minZoom, maxZoom, tileSize,
  updateWhenZooming: false,
  updateWhenIdle: true,
  keepBuffer: 8,
  noWrap: true
});

const eberronmap = L.map('map', {
  minZoom, maxZoom,
  worldCopyJump: false,
  layers: [fullmap],
  zoomControl: false,
  attributionControl: false
});

eberronmap.setMaxBounds(L.latLngBounds(
  eberronmap.unproject([MAP_BOUNDS_Z3.west, MAP_BOUNDS_Z3.south], 3),
  eberronmap.unproject([MAP_BOUNDS_Z3.east, MAP_BOUNDS_Z3.north], 3)
));

// La vista iniziale arriva dal link (#zoom/lat/lng) oppure è quella predefinita.
function parseViewHash(hash) {
  const parts = hash.replace(/^#/, '').split('/').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return null;
  const [zoom, lat, lng] = parts;
  if (zoom < minZoom || zoom > maxZoom || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { center: [lat, lng], zoom: Math.round(zoom) };
}

const initialView = parseViewHash(location.hash) || HOME_VIEW;
eberronmap.setView(initialView.center, initialView.zoom);

L.control.zoom({ position: 'topright' }).addTo(eberronmap);

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------
const statusEl = document.getElementById('status');

function setStatus(text) {
  statusEl.textContent = text;
}

// Notifica breve sopra la mappa, visibile anche su telefono.
const toastEl = document.getElementById('toast');
let toastTimer = null;

function toast(text, { sticky = false } = {}) {
  clearTimeout(toastTimer);
  toastEl.textContent = text;
  toastEl.hidden = false;
  if (!sticky) toastTimer = setTimeout(hideToast, 4000);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastEl.hidden = true;
}

// Confronto senza maiuscole, accenti e apostrofi ("Q'barra" ≈ "qbarra").
function normalizeText(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f'’`]/g, '');
}

function getMarkerType(type) {
  return Object.prototype.hasOwnProperty.call(MARKER_TYPES, type) ? type : 'other';
}

function getMarkerTypeLabel(type) {
  return MARKER_TYPES[getMarkerType(type)].label;
}

// Crea un elemento DOM. Il testo passa sempre da textContent, mai da innerHTML:
// il contenuto scritto dall'utente non viene mai interpretato come HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Le icone sono emoji in un divIcon: nessuna immagine esterna da scaricare.
const markerIcons = {};
Object.keys(MARKER_TYPES).forEach((type) => {
  markerIcons[type] = L.divIcon({
    className: `map-pin map-pin--${type}`,
    // Stringa statica definita qui sopra, non contiene input dell'utente.
    html: `<span class="map-pin__glyph" aria-hidden="true">${MARKER_TYPES[type].emoji}</span>`,
    iconSize: [36, 36],
    // La punta del pin (quadrato ruotato di 45°) cade ~7px sotto il riquadro.
    iconAnchor: [18, 43],
    popupAnchor: [0, -44],
    tooltipAnchor: [0, -44]
  });
});

// ---------------------------------------------------------------------------
// Marker: stato e persistenza
// ---------------------------------------------------------------------------
// Ogni voce: { data: { lat, lng, text, description, type }, layer: L.Marker }
const markers = [];

function saveMarkers() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markers.map((m) => m.data)));
  } catch (e) {
    console.error('Impossibile salvare i marker:', e);
    toast('Impossibile salvare i marker in questo browser');
  }
}

function normalizeMarkerData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    text: String(raw.text ?? '').slice(0, MAX_NAME_LENGTH) || 'Marker senza nome',
    description: String(raw.description ?? '').slice(0, MAX_DESCRIPTION_LENGTH),
    type: getMarkerType(raw.type)
  };
}

function loadMarkers() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {
    console.error('Errore nel parsing dei marker salvati:', e);
    return;
  }
  if (!Array.isArray(saved)) return;
  saved.forEach((raw) => {
    const data = normalizeMarkerData(raw);
    if (data) addMarker(data);
  });
}

// ---------------------------------------------------------------------------
// Marker: popup (vista e modifica)
// ---------------------------------------------------------------------------
function tooltipContent(text) {
  return el('span', '', text);
}

function refreshMarker(entry) {
  entry.layer.setIcon(markerIcons[entry.data.type]);
  entry.layer.setTooltipContent(tooltipContent(entry.data.text));
}

function buildViewPopup(entry) {
  const { data } = entry;
  const root = el('div', 'marker-popup');
  root.append(el('strong', 'marker-popup__title', data.text));
  root.append(el('div', 'marker-popup__meta', `${MARKER_TYPES[data.type].emoji} ${getMarkerTypeLabel(data.type)}`));
  if (data.description) root.append(el('p', 'marker-popup__description', data.description));
  root.append(el('div', 'marker-popup__coords', `Lat ${data.lat.toFixed(4)} · Lng ${data.lng.toFixed(4)}`));

  const actions = el('div', 'marker-popup__actions');
  const editBtn = el('button', 'marker-btn', 'Modifica');
  editBtn.type = 'button';
  editBtn.addEventListener('click', () => showEditPopup(entry));
  const removeBtn = el('button', 'marker-btn marker-btn--danger', 'Rimuovi');
  removeBtn.type = 'button';
  removeBtn.addEventListener('click', () => removeMarker(entry));
  actions.append(editBtn, removeBtn);
  root.append(actions);
  return root;
}

function buildEditPopup(entry, { isNew }) {
  const { data } = entry;
  const form = el('form', 'marker-popup marker-popup--form');
  form.noValidate = true;

  const nameLabel = el('label', 'marker-field');
  nameLabel.append(el('span', 'marker-field__label', 'Nome'));
  const nameInput = el('input', 'marker-field__input');
  nameInput.type = 'text';
  nameInput.required = true;
  nameInput.maxLength = MAX_NAME_LENGTH;
  nameInput.value = data.text;
  nameLabel.append(nameInput);

  const typeLabel = el('label', 'marker-field');
  typeLabel.append(el('span', 'marker-field__label', 'Tipo'));
  const typeSelect = el('select', 'marker-field__input');
  Object.keys(MARKER_TYPES).forEach((type) => {
    const option = el('option', '', `${MARKER_TYPES[type].emoji} ${MARKER_TYPES[type].label}`);
    option.value = type;
    option.selected = type === data.type;
    typeSelect.append(option);
  });
  typeLabel.append(typeSelect);

  const descLabel = el('label', 'marker-field');
  descLabel.append(el('span', 'marker-field__label', 'Descrizione (facoltativa)'));
  const descInput = el('textarea', 'marker-field__input');
  descInput.rows = 3;
  descInput.maxLength = MAX_DESCRIPTION_LENGTH;
  descInput.value = data.description;
  descLabel.append(descInput);

  const error = el('div', 'marker-popup__error');
  error.setAttribute('role', 'alert');

  const actions = el('div', 'marker-popup__actions');
  const saveBtn = el('button', 'marker-btn marker-btn--primary', isNew ? 'Aggiungi' : 'Salva');
  saveBtn.type = 'submit';
  const cancelBtn = el('button', 'marker-btn', 'Annulla');
  cancelBtn.type = 'button';
  cancelBtn.addEventListener('click', () => {
    if (isNew) entry.layer.closePopup(); // la chiusura scarta la bozza
    else showViewPopup(entry);
  });
  actions.append(saveBtn, cancelBtn);

  form.append(nameLabel, typeLabel, descLabel, error, actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = nameInput.value.trim();
    if (!text) {
      error.textContent = 'Inserisci un nome per il marker.';
      nameInput.focus();
      return;
    }
    data.text = text;
    data.type = getMarkerType(typeSelect.value);
    data.description = descInput.value.trim();
    entry.draft = false;
    if (!markers.includes(entry)) markers.push(entry);
    refreshMarker(entry);
    saveMarkers();
    showViewPopup(entry);
    setLayerVisible(`marker:${data.type}`, true);
    toast(isNew ? `Marker aggiunto: ${text}` : `Marker aggiornato: ${text}`);
  });

  // Il focus va dato dopo che Leaflet ha inserito il popup nel DOM.
  setTimeout(() => { nameInput.focus(); nameInput.select(); }, 0);
  return form;
}

function showViewPopup(entry) {
  entry.layer.setPopupContent(buildViewPopup(entry));
  if (!entry.layer.isPopupOpen()) entry.layer.openPopup();
}

function showEditPopup(entry) {
  entry.layer.setPopupContent(buildEditPopup(entry, { isNew: Boolean(entry.draft) }));
  if (!entry.layer.isPopupOpen()) entry.layer.openPopup();
}

// ---------------------------------------------------------------------------
// Marker: creazione, spostamento, rimozione
// ---------------------------------------------------------------------------
function createEntry(data, { draft = false } = {}) {
  const layer = L.marker([data.lat, data.lng], {
    icon: markerIcons[data.type],
    draggable: true,
    autoPan: true,
    keyboard: true,
    alt: data.text
  });
  const entry = { data, layer, draft };

  layer.bindTooltip(tooltipContent(data.text), { direction: 'top' });
  layer.bindPopup('', { minWidth: 220, maxWidth: 260, closeButton: true });

  // Il contenuto viene ricostruito a ogni apertura, così è sempre aggiornato.
  layer.on('popupopen', () => {
    layer.closeTooltip();
    if (!entry.draft) layer.setPopupContent(buildViewPopup(entry));
  });
  // Una bozza chiusa senza salvare viene scartata.
  layer.on('popupclose', () => {
    if (entry.draft) eberronmap.removeLayer(layer);
  });
  layer.on('dragend', () => {
    const { lat, lng } = layer.getLatLng();
    data.lat = lat;
    data.lng = lng;
    if (entry.draft) return;
    saveMarkers();
    toast(`Marker spostato: ${data.text}`);
  });

  if (draft || isLayerVisible(`marker:${data.type}`)) layer.addTo(eberronmap);
  return entry;
}

function addMarker(data) {
  const entry = createEntry(data);
  markers.push(entry);
  return entry;
}

function removeMarker(entry) {
  const index = markers.indexOf(entry);
  if (index !== -1) markers.splice(index, 1);
  eberronmap.removeLayer(entry.layer);
  saveMarkers();
  toast(`Marker rimosso: ${entry.data.text}`);
}

// ---------------------------------------------------------------------------
// Modalità "aggiungi marker"
// ---------------------------------------------------------------------------
const markerMenuBtn = document.getElementById('toggleMarkerMenu');
const markerMenuDropdown = document.getElementById('markerMenuDropdown');
const markerMenuText = document.getElementById('markerMenuText');

let markerMode = false;
let markerType = 'city';

function setMarkerMode(type) {
  stopMeasuring();
  markerMode = true;
  markerType = getMarkerType(type);
  markerMenuBtn.classList.add('bg-emerald-600', 'border-emerald-500');
  markerMenuBtn.classList.remove('bg-white/5', 'border-white/15');
  markerMenuText.textContent = `Aggiungi: ${getMarkerTypeLabel(markerType)}`;
  eberronmap.getContainer().classList.add('is-placing-marker');
  toast(`Clicca sulla mappa per posizionare il marker "${getMarkerTypeLabel(markerType)}"`, { sticky: true });
}

function resetMarkerMode() {
  markerMode = false;
  markerMenuBtn.classList.remove('bg-emerald-600', 'border-emerald-500');
  markerMenuBtn.classList.add('bg-white/5', 'border-white/15');
  markerMenuText.textContent = 'Aggiungi marker';
  eberronmap.getContainer().classList.remove('is-placing-marker');
}

// Menu a tendina dell'header: si aprono al click e se ne tiene aperto uno solo.
const dropdowns = [];

function setupDropdown(button, panel) {
  const dropdown = {
    button,
    panel,
    setOpen(open) {
      panel.classList.toggle('hidden', !open);
      button.setAttribute('aria-expanded', String(open));
    }
  };
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = panel.classList.contains('hidden');
    closeDropdowns();
    dropdown.setOpen(willOpen);
  });
  dropdowns.push(dropdown);
  return dropdown;
}

function closeDropdowns() {
  dropdowns.forEach((d) => d.setOpen(false));
}

const markerMenu = setupDropdown(markerMenuBtn, markerMenuDropdown);
const mainMenu = setupDropdown(document.getElementById('toggleMainMenu'), document.getElementById('mainMenu'));

document.addEventListener('click', (e) => {
  if (!dropdowns.some((d) => d.button.contains(e.target) || d.panel.contains(e.target))) closeDropdowns();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeDropdowns();
  if (markerMode) {
    resetMarkerMode();
    hideToast();
  }
});

document.querySelectorAll('.marker-type-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    setMarkerMode(btn.getAttribute('data-marker-type'));
    markerMenu.setOpen(false);
  });
});

eberronmap.on('click', (e) => {
  if (!markerMode) return;
  const entry = createEntry({
    lat: e.latlng.lat,
    lng: e.latlng.lng,
    text: `Nuovo marker: ${getMarkerTypeLabel(markerType)}`,
    description: '',
    type: markerType
  }, { draft: true });
  resetMarkerMode();
  hideToast();
  showEditPopup(entry);
});

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const hudZoom = document.getElementById('hudZoom');
const hudTile = document.getElementById('hudTile');

function refreshHUD() {
  const z = eberronmap.getZoom();
  const p = eberronmap.project(eberronmap.getCenter(), z);
  hudZoom.textContent = `z ${z}`;
  hudTile.textContent = `x ${Math.floor(p.x / tileSize)}, y ${Math.floor(p.y / tileSize)}`;
}

eberronmap.on('moveend zoomend', refreshHUD);
refreshHUD();

// ---------------------------------------------------------------------------
// Controlli dell'header
// ---------------------------------------------------------------------------
document.getElementById('resetView').addEventListener('click', () => {
  eberronmap.setView(HOME_VIEW.center, HOME_VIEW.zoom);
  mainMenu.setOpen(false);
});

const CanvasGrid = L.GridLayer.extend({
  createTile(coords) {
    const tile = L.DomUtil.create('canvas', 'leaflet-tile');
    tile.width = tileSize;
    tile.height = tileSize;
    const ctx = tile.getContext('2d');
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, tileSize, tileSize);
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`z${coords.z} x${coords.x} y${coords.y}`, 8, 20);
    return tile;
  }
});

let gridLayer = null;
const gridBtn = document.getElementById('toggleGrid');
gridBtn.addEventListener('click', () => {
  if (gridLayer) {
    eberronmap.removeLayer(gridLayer);
    gridLayer = null;
  } else {
    gridLayer = new CanvasGrid({ tileSize, pane: 'overlayPane', opacity: 1 }).addTo(eberronmap);
  }
  gridBtn.setAttribute('aria-pressed', String(Boolean(gridLayer)));
  document.getElementById('hud').classList.toggle('hidden', !gridLayer);
  mainMenu.setOpen(false);
});

// ---------------------------------------------------------------------------
// Stato di caricamento delle tile
// ---------------------------------------------------------------------------
fullmap.on('loading', () => setStatus('Caricamento…'));
fullmap.on('load', () => setStatus('Pronto'));
fullmap.on('tileerror', () => setStatus('Alcune tile non trovate'));


// ---------------------------------------------------------------------------
// Livelli (luoghi e tipi di marker)
// ---------------------------------------------------------------------------
const layerState = { places: true };
Object.keys(MARKER_TYPES).forEach((type) => { layerState[`marker:${type}`] = true; });

try {
  const savedLayers = JSON.parse(localStorage.getItem(LAYERS_STORAGE_KEY) || '{}');
  Object.keys(layerState).forEach((key) => {
    if (typeof savedLayers[key] === 'boolean') layerState[key] = savedLayers[key];
  });
} catch (e) {
  console.error('Preferenze dei livelli non leggibili:', e);
}

const layerToggles = document.querySelectorAll('.layer-toggle');

function isLayerVisible(key) {
  return layerState[key] !== false;
}

function setLayerVisible(key, visible) {
  if (!(key in layerState) || layerState[key] === visible) return;
  layerState[key] = visible;
  try {
    localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify(layerState));
  } catch (e) {
    console.error('Impossibile salvare le preferenze dei livelli:', e);
  }
  applyLayers();
}

function applyLayers() {
  layerToggles.forEach((input) => {
    input.checked = isLayerVisible(input.getAttribute('data-layer'));
  });
  markers.forEach((entry) => {
    const visible = isLayerVisible(`marker:${entry.data.type}`);
    if (visible && !eberronmap.hasLayer(entry.layer)) entry.layer.addTo(eberronmap);
    if (!visible && eberronmap.hasLayer(entry.layer)) eberronmap.removeLayer(entry.layer);
  });
  const showPlaces = isLayerVisible('places') && eberronmap.getZoom() >= PLACES_MIN_ZOOM;
  if (showPlaces && !eberronmap.hasLayer(placesLayer)) placesLayer.addTo(eberronmap);
  if (!showPlaces && eberronmap.hasLayer(placesLayer)) eberronmap.removeLayer(placesLayer);
}

layerToggles.forEach((input) => {
  input.addEventListener('change', () => setLayerVisible(input.getAttribute('data-layer'), input.checked));
});

// ---------------------------------------------------------------------------
// Luoghi di Eberron (data/places.json)
// ---------------------------------------------------------------------------
const placesLayer = L.layerGroup();
let places = [];

function normalizePlace(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const zoom = Number(raw.zoom);
  return {
    name: raw.name.trim(),
    kind: Object.prototype.hasOwnProperty.call(PLACE_KINDS, raw.kind) ? raw.kind : 'site',
    parent: typeof raw.parent === 'string' ? raw.parent : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    lat,
    lng,
    zoom: Number.isFinite(zoom) ? Math.min(maxZoom, Math.max(minZoom, Math.round(zoom))) : 5
  };
}

function placeSubtitle(place) {
  const kind = PLACE_KINDS[place.kind].label;
  return place.parent ? `${kind} · ${place.parent}` : kind;
}

function buildPlacePopup(place) {
  const root = el('div', 'marker-popup');
  root.append(el('strong', 'marker-popup__title', place.name));
  root.append(el('div', 'marker-popup__meta', placeSubtitle(place)));
  if (place.description) root.append(el('p', 'marker-popup__description', place.description));
  return root;
}

function showPlace(place) {
  eberronmap.flyTo([place.lat, place.lng], place.zoom, { duration: 0.8 });
  L.popup({ minWidth: 200, maxWidth: 260, offset: [0, -4] })
    .setLatLng([place.lat, place.lng])
    .setContent(buildPlacePopup(place))
    .openOn(eberronmap);
}

function loadPlaces() {
  return fetch(PLACES_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((raw) => {
      places = (Array.isArray(raw) ? raw : []).map(normalizePlace).filter(Boolean);
      places.filter((place) => PLACE_KINDS[place.kind].dot).forEach((place) => {
        L.marker([place.lat, place.lng], {
          icon: L.divIcon({
            className: `place-dot place-dot--${place.kind}`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            popupAnchor: [0, -6],
            tooltipAnchor: [0, -8]
          }),
          alt: place.name,
          zIndexOffset: -1000 // sempre sotto i marker dell'utente
        })
          .bindTooltip(tooltipContent(place.name), { direction: 'top' })
          .bindPopup(() => buildPlacePopup(place), { minWidth: 200, maxWidth: 260 })
          .addTo(placesLayer);
      });
      applyLayers();
    })
    .catch((e) => {
      console.error('Impossibile caricare i luoghi:', e);
      toast('Elenco dei luoghi non disponibile: la ricerca trova solo i tuoi marker');
    });
}

eberronmap.on('zoomend', applyLayers);

// ---------------------------------------------------------------------------
// Ricerca di luoghi e marker
// ---------------------------------------------------------------------------
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const MAX_SEARCH_RESULTS = 8;
let searchMatches = [];
let searchActiveIndex = -1;

// Punteggio: 0 = il nome inizia con la ricerca, 1 = una parola del nome
// inizia con la ricerca, 2 = la contiene. -1 = nessuna corrispondenza.
function matchScore(name, query) {
  const normalized = normalizeText(name);
  if (normalized.startsWith(query)) return 0;
  if (normalized.split(/[\s-]+/).some((word) => word.startsWith(query))) return 1;
  return normalized.includes(query) ? 2 : -1;
}

function findMatches(rawQuery) {
  const query = normalizeText(rawQuery).trim();
  if (!query) return [];
  const candidates = [
    ...places.map((place) => ({
      name: place.name,
      subtitle: placeSubtitle(place),
      select: () => showPlace(place)
    })),
    ...markers.map((entry) => ({
      name: entry.data.text,
      subtitle: `Tuo marker · ${getMarkerTypeLabel(entry.data.type)}`,
      select: () => {
        setLayerVisible(`marker:${entry.data.type}`, true);
        eberronmap.flyTo(entry.layer.getLatLng(), Math.max(eberronmap.getZoom(), 5), { duration: 0.8 });
        entry.layer.openPopup();
      }
    }))
  ];
  return candidates
    .map((candidate) => ({ candidate, score: matchScore(candidate.name, query) }))
    .filter((match) => match.score >= 0)
    .sort((a, b) => a.score - b.score || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, MAX_SEARCH_RESULTS)
    .map((match) => match.candidate);
}

function setSearchActive(index) {
  searchActiveIndex = index;
  Array.from(searchResults.children).forEach((item, i) => {
    item.setAttribute('aria-selected', String(i === index));
  });
  if (index >= 0) searchInput.setAttribute('aria-activedescendant', `searchResult${index}`);
  else searchInput.removeAttribute('aria-activedescendant');
}

function closeSearch() {
  searchResults.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
  setSearchActive(-1);
}

function renderSearch() {
  searchMatches = findMatches(searchInput.value);
  searchResults.replaceChildren();
  if (!searchInput.value.trim()) {
    closeSearch();
    return;
  }
  if (!searchMatches.length) {
    searchResults.append(el('li', 'search-box__empty', 'Nessun risultato'));
  }
  searchMatches.forEach((match, index) => {
    const item = el('li', 'search-box__result');
    item.id = `searchResult${index}`;
    item.setAttribute('role', 'option');
    item.append(el('span', 'search-box__name', match.name), el('span', 'search-box__subtitle', match.subtitle));
    // mousedown: così la scelta avviene prima che l'input perda il focus.
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      chooseSearchResult(index);
    });
    searchResults.append(item);
  });
  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
  setSearchActive(searchMatches.length ? 0 : -1);
}

function chooseSearchResult(index) {
  const match = searchMatches[index];
  if (!match) return;
  searchInput.value = match.name;
  closeSearch();
  searchInput.blur();
  match.select();
}

searchInput.addEventListener('input', renderSearch);
searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) renderSearch(); });
searchInput.addEventListener('blur', closeSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!searchMatches.length) return;
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    setSearchActive((searchActiveIndex + step + searchMatches.length) % searchMatches.length);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    chooseSearchResult(Math.max(searchActiveIndex, 0));
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    closeSearch();
    searchInput.blur();
  }
});

// I clic nel riquadro di ricerca non devono arrivare alla mappa.
L.DomEvent.disableClickPropagation(document.getElementById('searchBox'));
L.DomEvent.disableScrollPropagation(document.getElementById('searchBox'));

// ---------------------------------------------------------------------------
// Link alla vista, esportazione e importazione dei marker
// ---------------------------------------------------------------------------
function viewHash() {
  const center = eberronmap.getCenter();
  return `#${eberronmap.getZoom()}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`;
}

// L'indirizzo segue la vista, così si può copiare anche dalla barra del browser.
eberronmap.on('moveend', () => history.replaceState(null, '', viewHash()));

window.addEventListener('hashchange', () => {
  const view = parseViewHash(location.hash);
  if (view) eberronmap.setView(view.center, view.zoom);
});

document.getElementById('copyLink').addEventListener('click', () => {
  mainMenu.setOpen(false);
  const url = location.href.split('#')[0] + viewHash();
  const fallback = () => window.prompt('Copia questo link:', url);
  if (!navigator.clipboard) {
    fallback();
    return;
  }
  navigator.clipboard.writeText(url).then(() => toast('Link copiato negli appunti'), fallback);
});

document.getElementById('exportMarkers').addEventListener('click', () => {
  mainMenu.setOpen(false);
  if (!markers.length) {
    toast('Non ci sono marker da esportare');
    return;
  }
  const payload = {
    app: 'eberron-interactive-map',
    version: 1,
    exportedAt: new Date().toISOString(),
    markers: markers.map((m) => m.data)
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = el('a');
  link.href = url;
  link.download = `eberron-markers-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Esportati ${markers.length} marker`);
});

function markerKey(data) {
  return [data.lat.toFixed(5), data.lng.toFixed(5), data.type, data.text].join('|');
}

// Aggiunge i marker di un file esportato a quelli esistenti, saltando i doppioni.
function importMarkers(raw) {
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.markers) ? raw.markers : null;
  if (!list) throw new Error('Il file non contiene un elenco di marker');
  const existing = new Set(markers.map((m) => markerKey(m.data)));
  let added = 0;
  let skipped = 0;
  list.forEach((item) => {
    const data = normalizeMarkerData(item);
    if (!data || existing.has(markerKey(data)) || markers.length >= MAX_MARKERS) {
      skipped++;
      return;
    }
    existing.add(markerKey(data));
    addMarker(data);
    added++;
  });
  if (added) saveMarkers();
  return { added, skipped };
}

const importFile = document.getElementById('importFile');

document.getElementById('importMarkers').addEventListener('click', () => {
  mainMenu.setOpen(false);
  importFile.click();
});

importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  importFile.value = ''; // permette di reimportare lo stesso file
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    toast('File troppo grande: il limite è 2 MB');
    return;
  }
  file.text()
    .then((text) => {
      const { added, skipped } = importMarkers(JSON.parse(text));
      const ignored = skipped ? ` (${skipped} ignorati perché doppi o non validi)` : '';
      toast(added ? `Importati ${added} marker${ignored}` : `Nessun marker nuovo da importare${ignored}`);
    })
    .catch((e) => {
      console.error('Importazione fallita:', e);
      toast('Importazione fallita: il file non è un JSON di marker valido');
    });
});

// ---------------------------------------------------------------------------
// Misuratore di distanze e tempi di viaggio
// ---------------------------------------------------------------------------
const measurePanel = document.getElementById('measurePanel');
const helpCard = document.getElementById('helpCard');
const measureStyle = { color: '#ef4444', weight: 3, dashArray: '2,8' };
const measure = {
  active: false,
  points: [],
  layer: L.layerGroup(),
  line: L.polyline([], measureStyle),
  preview: L.polyline([], { ...measureStyle, opacity: 0.5, interactive: false }),
  button: null,
  // Su schermi stretti la tabella parte chiusa per non coprire la mappa.
  showTimes: window.matchMedia('(min-width: 768px)').matches
};

function milesBetween(a, b) {
  const pa = eberronmap.project(a, maxZoom);
  const pb = eberronmap.project(b, maxZoom);
  return pa.distanceTo(pb) * MILES_PER_PIXEL_AT_MAX_ZOOM;
}

function measuredMiles() {
  let total = 0;
  for (let i = 1; i < measure.points.length; i++) total += milesBetween(measure.points[i - 1], measure.points[i]);
  return total;
}

function formatMiles(miles) {
  return `${Math.round(miles).toLocaleString('it-IT')} miglia`;
}

function formatTravelTime(miles, mode) {
  if (mode.milesPerDay) {
    const days = miles / mode.milesPerDay;
    if (days < 1) return 'meno di un giorno';
    const rounded = Math.round(days * 2) / 2;
    return `${rounded.toLocaleString('it-IT')} ${rounded === 1 ? 'giorno' : 'giorni'}`;
  }
  const hours = Math.max(1, Math.round(miles / mode.milesPerHour));
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const parts = [];
  if (days) parts.push(`${days.toLocaleString('it-IT')} ${days === 1 ? 'giorno' : 'giorni'}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? 'ora' : 'ore'}`);
  return parts.join(' e ');
}

function measureButton(label, onClick, disabled) {
  const button = el('button', 'marker-btn', label);
  button.type = 'button';
  button.disabled = Boolean(disabled);
  button.addEventListener('click', onClick);
  return button;
}

function renderMeasure() {
  measure.line.setLatLngs(measure.points);
  measure.layer.clearLayers();
  measure.line.addTo(measure.layer);
  measure.preview.setLatLngs([]).addTo(measure.layer);
  measure.points.forEach((point) => {
    L.circleMarker(point, { radius: 5, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1, interactive: false })
      .addTo(measure.layer);
  });

  const miles = measuredMiles();
  const root = document.createDocumentFragment();
  const header = el('div', 'measure-panel__header');
  header.append(el('strong', 'measure-panel__total', measure.points.length > 1 ? formatMiles(miles) : 'Misura distanza'));
  if (measure.points.length > 2) header.append(el('span', 'measure-panel__legs', `${measure.points.length - 1} tratti`));
  root.append(header);

  if (measure.points.length < 2) {
    root.append(el('p', 'measure-panel__hint', measure.points.length
      ? 'Clicca il punto successivo. Puoi aggiungere quante tappe vuoi.'
      : 'Clicca sulla mappa per segnare il punto di partenza.'));
  } else {
    const details = el('details', 'measure-panel__details');
    details.open = measure.showTimes;
    details.addEventListener('toggle', () => { measure.showTimes = details.open; });
    details.append(el('summary', '', 'Tempi di viaggio'));
    const table = el('table', 'measure-panel__table');
    TRAVEL_MODES.forEach((mode) => {
      const row = el('tr');
      row.append(el('th', '', mode.label), el('td', '', formatTravelTime(miles, mode)));
      row.firstChild.scope = 'row';
      table.append(row);
    });
    details.append(table, el('p', 'measure-panel__hint',
      'Stime lungo il percorso tracciato; i mezzi non a piedi viaggiano giorno e notte.'));
    root.append(details);
  }

  const actions = el('div', 'marker-popup__actions');
  actions.append(
    measureButton('Annulla', () => { measure.points.pop(); renderMeasure(); }, !measure.points.length),
    measureButton('Azzera', () => { measure.points = []; renderMeasure(); }, !measure.points.length),
    measureButton('Chiudi', stopMeasuring)
  );
  root.append(actions);
  measurePanel.replaceChildren(root);
}

function onMeasureClick(e) {
  measure.points.push(e.latlng);
  renderMeasure();
}

// Su desktop una linea tratteggiata segue il mouse fino al prossimo punto.
function onMeasureMove(e) {
  const last = measure.points[measure.points.length - 1];
  measure.preview.setLatLngs(last ? [last, e.latlng] : []);
}

function startMeasuring() {
  if (measure.active) return;
  if (markerMode) {
    resetMarkerMode();
    hideToast();
  }
  eberronmap.closePopup();
  measure.active = true;
  measure.points = [];
  measure.layer.addTo(eberronmap);
  eberronmap.on('click', onMeasureClick);
  eberronmap.on('mousemove', onMeasureMove);
  eberronmap.doubleClickZoom.disable();
  eberronmap.getContainer().classList.add('is-measuring');
  measure.button.classList.add('leaflet-ruler-clicked');
  measure.button.setAttribute('aria-pressed', 'true');
  measurePanel.hidden = false;
  helpCard.classList.add('is-hidden');
  renderMeasure();
}

function stopMeasuring() {
  if (!measure.active) return;
  measure.active = false;
  measure.points = [];
  eberronmap.removeLayer(measure.layer);
  eberronmap.off('click', onMeasureClick);
  eberronmap.off('mousemove', onMeasureMove);
  eberronmap.doubleClickZoom.enable();
  eberronmap.getContainer().classList.remove('is-measuring');
  measure.button.classList.remove('leaflet-ruler-clicked');
  measure.button.setAttribute('aria-pressed', 'false');
  measurePanel.hidden = true;
  helpCard.classList.remove('is-hidden');
}

const MeasureControl = L.Control.extend({
  options: { position: 'topright' },
  onAdd() {
    const button = L.DomUtil.create('button', 'leaflet-bar leaflet-ruler');
    button.type = 'button';
    button.title = 'Misura distanza e tempi di viaggio';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', 'false');
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, 'click', () => (measure.active ? stopMeasuring() : startMeasuring()));
    measure.button = button;
    return button;
  }
});

new MeasureControl().addTo(eberronmap);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') stopMeasuring();
});

L.DomEvent.disableClickPropagation(measurePanel);
L.DomEvent.disableScrollPropagation(measurePanel);

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
loadMarkers();
applyLayers();
loadPlaces();
