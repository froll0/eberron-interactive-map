// ---------------------------------------------------------------------------
// Configurazione
// ---------------------------------------------------------------------------
const minZoom = 1;
const maxZoom = 7;
const tileSize = 256;
const HOME_VIEW = { center: [20.009428770699756, 0.07578125], zoom: 4 };
const STORAGE_KEY = 'eberronMarkers';
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
}).setView(HOME_VIEW.center, HOME_VIEW.zoom);

L.control.zoom({ position: 'topright' }).addTo(eberronmap);

L.control.ruler({
  position: 'topright',
  lengthUnit: { factor: 3.233, display: 'miles', decimal: 0 }
}).addTo(eberronmap);

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------
const statusEl = document.getElementById('status');

function setStatus(text) {
  statusEl.textContent = text;
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
    setStatus('Impossibile salvare i marker in questo browser');
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
    setStatus(isNew ? `Marker aggiunto: ${text}` : `Marker aggiornato: ${text}`);
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
function createEntry(data) {
  const layer = L.marker([data.lat, data.lng], {
    icon: markerIcons[data.type],
    draggable: true,
    autoPan: true,
    keyboard: true,
    alt: data.text
  });
  const entry = { data, layer, draft: false };

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
    setStatus(`Marker spostato: ${data.text}`);
  });

  layer.addTo(eberronmap);
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
  setStatus(`Marker rimosso: ${entry.data.text}`);
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
  markerMode = true;
  markerType = getMarkerType(type);
  markerMenuBtn.classList.add('bg-emerald-600', 'border-emerald-500');
  markerMenuBtn.classList.remove('bg-white/5', 'border-white/15');
  markerMenuText.textContent = `Aggiungi: ${getMarkerTypeLabel(markerType)}`;
  eberronmap.getContainer().classList.add('is-placing-marker');
  setStatus(`Clicca sulla mappa per aggiungere un marker "${getMarkerTypeLabel(markerType)}" (Esc per annullare)`);
}

function resetMarkerMode() {
  markerMode = false;
  markerMenuBtn.classList.remove('bg-emerald-600', 'border-emerald-500');
  markerMenuBtn.classList.add('bg-white/5', 'border-white/15');
  markerMenuText.textContent = 'Aggiungi marker';
  eberronmap.getContainer().classList.remove('is-placing-marker');
}

function setMarkerMenuOpen(open) {
  markerMenuDropdown.classList.toggle('hidden', !open);
  markerMenuBtn.setAttribute('aria-expanded', String(open));
}

markerMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setMarkerMenuOpen(markerMenuDropdown.classList.contains('hidden'));
});

document.addEventListener('click', (e) => {
  if (!markerMenuBtn.contains(e.target) && !markerMenuDropdown.contains(e.target)) {
    setMarkerMenuOpen(false);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  setMarkerMenuOpen(false);
  if (markerMode) {
    resetMarkerMode();
    setStatus('Pronto');
  }
});

document.querySelectorAll('.marker-type-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    setMarkerMode(btn.getAttribute('data-marker-type'));
    setMarkerMenuOpen(false);
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
  });
  entry.draft = true;
  resetMarkerMode();
  setStatus('Compila i dati del marker e premi "Aggiungi"');
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
});

// ---------------------------------------------------------------------------
// Stato di caricamento delle tile
// ---------------------------------------------------------------------------
fullmap.on('loading', () => setStatus('Caricamento…'));
fullmap.on('load', () => setStatus('Pronto'));
fullmap.on('tileerror', () => setStatus('Alcune tile non trovate'));

loadMarkers();
