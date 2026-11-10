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
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_MARKERS = 5000;
const MAX_SEARCH_RESULTS = 8;

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

// Tipi di marker. "glyph" è il disegno (16×16) dentro il segnaposto.
const MARKER_TYPES = {
  party: { label: 'Gruppo', plural: 'Gruppo', glyph: 'M4 1.5h1.6v13H4Zm2.6 1H14l-2.2 3 2.2 3H6.6Z' },
  city: { label: 'Città', plural: 'Città', glyph: 'M2 14V7h3V3h2v2h2V3h2v4h3v7H9.5v-3h-3v3Z' },
  village: { label: 'Villaggio', plural: 'Villaggi', glyph: 'M8 2 1.5 8h2v6H7v-4h2v4h3.5V8h2Z' },
  dungeon: { label: 'Dungeon', plural: 'Dungeon', glyph: 'M3 14V7a5 5 0 0 1 10 0v7h-3V7.5a2 2 0 0 0-4 0V14Z' },
  monster: { label: 'Mostro', plural: 'Mostri', glyph: 'M3.5 2c1 4 1 8-1 12h2c2-4 2-8 1-12Zm4 0c1 4 1 8-1 12h2c2-4 2-8 1-12Zm4 0c1 4 1 8-1 12h2c2-4 2-8 1-12Z' },
  other: { label: 'Nota', plural: 'Note', glyph: 'm8 2 1.8 4.2L14 8 9.8 9.8 8 14 6.2 9.8 2 8l4.2-1.8Z' }
};
const DEFAULT_MARKER_TYPE = 'other';

const PLACE_KINDS = {
  continent: { label: 'Continente', dot: false, browse: 0 },
  nation: { label: 'Nazione', dot: false, browse: 1 },
  region: { label: 'Regione', dot: false },
  capital: { label: 'Capitale', dot: true },
  city: { label: 'Città', dot: true },
  site: { label: 'Luogo', dot: true }
};

const narrowScreen = window.matchMedia('(max-width: 719px)');

// Le schede si aprono lasciando liberi ricerca, zoom e barra degli strumenti.
const POPUP_OPTIONS = {
  autoPanPaddingTopLeft: [12, 76],
  autoPanPaddingBottomRight: [68, 92]
};

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------
// Crea un elemento DOM. Il testo passa sempre da textContent, mai da innerHTML:
// il contenuto scritto dall'utente non viene mai interpretato come HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, label, onClick) {
  const node = el('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

// Impedisce che i clic dentro un pannello o una scheda arrivino alla mappa.
// Serve fermarli qui: molti pulsanti sostituiscono il proprio contenuto, e
// Leaflet non riconosce più come "suoi" i clic su elementi già rimossi.
function shield(node) {
  node.addEventListener('click', (e) => e.stopPropagation());
  return node;
}

// Confronto senza maiuscole, accenti e apostrofi ("Q'barra" ≈ "qbarra").
function normalizeText(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ'’`]/g, '');
}

function getMarkerType(type) {
  return Object.prototype.hasOwnProperty.call(MARKER_TYPES, type) ? type : DEFAULT_MARKER_TYPE;
}

function getMarkerTypeLabel(type) {
  return MARKER_TYPES[getMarkerType(type)].label;
}

// Disegno del segnaposto. È una stringa costruita solo da costanti definite
// qui sopra: non contiene mai testo dell'utente.
function pinSvg(type) {
  return `<svg class="pin pin--${type}" viewBox="0 0 32 42" aria-hidden="true" focusable="false">` +
    '<path class="pin__body" d="M16 40.5C16 40.5 3.5 26.5 3.5 15.5a12.5 12.5 0 0 1 25 0C28.5 26.5 16 40.5 16 40.5Z"/>' +
    `<path class="pin__glyph" transform="translate(8 7.5)" d="${MARKER_TYPES[type].glyph}"/></svg>`;
}

function pinElement(type) {
  const wrap = el('span', 'pin-wrap');
  wrap.innerHTML = pinSvg(getMarkerType(type));
  return wrap;
}

// Notifica breve sopra la mappa.
const toastEl = document.getElementById('toast');
let toastTimer = null;

function toast(text) {
  clearTimeout(toastTimer);
  toastEl.textContent = text;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

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

// Zoom e ritorno alla vista iniziale.
const ZoomControl = L.Control.extend({
  options: { position: 'topright' },
  onAdd(map) {
    const group = el('div', 'zoom');
    const make = (label, path, onClick) => {
      const node = button('zoom__btn', undefined, onClick);
      node.setAttribute('aria-label', label);
      node.title = label;
      node.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${path}"/></svg>`;
      group.append(node);
      return node;
    };
    const zoomIn = make('Ingrandisci', 'M10 4v12M4 10h12', () => map.zoomIn());
    const zoomOut = make('Riduci', 'M4 10h12', () => map.zoomOut());
    make('Torna alla vista iniziale', 'M3.5 9.5 10 4l6.5 5.5M5.5 8.5V16h9V8.5',
      () => map.setView(HOME_VIEW.center, HOME_VIEW.zoom));
    const sync = () => {
      zoomIn.disabled = map.getZoom() >= maxZoom;
      zoomOut.disabled = map.getZoom() <= minZoom;
    };
    map.on('zoomend', sync);
    sync();
    L.DomEvent.disableClickPropagation(group);
    return group;
  }
});

new ZoomControl().addTo(eberronmap);

// Barra di scala: la lunghezza più "tonda" che sta in circa 120 pixel.
const scaleLabel = document.getElementById('scaleLabel');
const scaleBar = document.getElementById('scaleBar');

function updateScale() {
  const milesPerPixel = MILES_PER_PIXEL_AT_MAX_ZOOM * 2 ** (maxZoom - eberronmap.getZoom());
  const target = milesPerPixel * 120;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const miles = [5, 2, 1].map((step) => step * magnitude).find((value) => value <= target);
  scaleBar.style.width = `${Math.round(miles / milesPerPixel)}px`;
  scaleLabel.textContent = `${miles.toLocaleString('it-IT')} miglia`;
}

eberronmap.on('zoomend', updateScale);
updateScale();

// ---------------------------------------------------------------------------
// Marker: stato e persistenza
// ---------------------------------------------------------------------------
// Ogni voce: { data: { lat, lng, text, description, type }, layer: L.Marker }
const markers = [];

const markerIcons = {};
Object.keys(MARKER_TYPES).forEach((type) => {
  markerIcons[type] = L.divIcon({
    className: 'map-pin',
    html: pinSvg(type),
    iconSize: [32, 42],
    iconAnchor: [16, 41],
    popupAnchor: [0, -38],
    tooltipAnchor: [0, -38]
  });
});

function saveMarkers() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markers.map((m) => m.data)));
  } catch (e) {
    console.error('Impossibile salvare i marker:', e);
    toast('Marker non salvati: lo spazio del browser non è disponibile');
  }
  refreshSheet();
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
// Marker: scheda (lettura e modifica)
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
  const root = shield(el('div', 'note'));
  root.append(el('p', 'note__kind', getMarkerTypeLabel(data.type)));
  root.append(el('h3', 'note__title', data.text));
  if (data.description) root.append(el('p', 'note__text', data.description));

  const actions = el('div', 'note__actions');
  actions.append(
    button('btn btn--ink', 'Modifica', () => showEditPopup(entry)),
    button('btn btn--ink', 'Misura da qui', () => measureFrom(entry.layer.getLatLng())),
    button('btn btn--danger', 'Elimina', () => removeMarker(entry))
  );
  root.append(actions);
  return root;
}

function field(labelText, control) {
  const label = el('label', 'field');
  label.append(el('span', 'field__label', labelText), control);
  return label;
}

function buildEditPopup(entry, { isNew }) {
  const { data } = entry;
  const form = shield(el('form', 'note note--form'));
  form.noValidate = true;

  const nameInput = el('input', 'field__input');
  nameInput.type = 'text';
  nameInput.required = true;
  nameInput.maxLength = MAX_NAME_LENGTH;
  nameInput.value = data.text;
  nameInput.placeholder = 'Come si chiama?';

  const typeSelect = el('select', 'field__input');
  Object.keys(MARKER_TYPES).forEach((type) => {
    const option = el('option', '', MARKER_TYPES[type].label);
    option.value = type;
    option.selected = type === data.type;
    typeSelect.append(option);
  });

  const descInput = el('textarea', 'field__input');
  descInput.rows = 3;
  descInput.maxLength = MAX_DESCRIPTION_LENGTH;
  descInput.value = data.description;
  descInput.placeholder = 'Appunti per la campagna (facoltativi)';

  const error = el('p', 'note__error');
  error.setAttribute('role', 'alert');

  const actions = el('div', 'note__actions');
  const saveBtn = el('button', 'btn btn--primary', isNew ? 'Aggiungi marker' : 'Salva');
  saveBtn.type = 'submit';
  actions.append(saveBtn, button('btn btn--ink', 'Annulla', () => {
    if (isNew) entry.layer.closePopup(); // la chiusura scarta la bozza
    else showViewPopup(entry);
  }));

  form.append(field('Nome', nameInput), field('Tipo', typeSelect), field('Note', descInput), error, actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = nameInput.value.trim();
    if (!text) {
      error.textContent = 'Scrivi un nome per il marker.';
      nameInput.focus();
      return;
    }
    data.text = text;
    data.type = getMarkerType(typeSelect.value);
    data.description = descInput.value.trim();
    entry.draft = false;
    if (!markers.includes(entry)) markers.push(entry);
    refreshMarker(entry);
    setLayerVisible(`marker:${data.type}`, true);
    saveMarkers();
    showViewPopup(entry);
    toast(isNew ? `Marker aggiunto: ${text}` : `Marker salvato: ${text}`);
  });

  // Il focus va dato dopo che Leaflet ha inserito la scheda nel DOM.
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
  layer.bindPopup('', { ...POPUP_OPTIONS, minWidth: 264, maxWidth: 290 });

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
  toast(`Marker eliminato: ${entry.data.text}`);
}

function focusMarker(entry) {
  setLayerVisible(`marker:${entry.data.type}`, true);
  eberronmap.flyTo(entry.layer.getLatLng(), Math.max(eberronmap.getZoom(), 5), { duration: 0.8 });
  entry.layer.openPopup();
}

// ---------------------------------------------------------------------------
// Posizionamento di un nuovo marker
// ---------------------------------------------------------------------------
const placingBanner = document.getElementById('placing');
const placingText = document.getElementById('placingText');
let placingType = null;

function startPlacing(type) {
  closeSheet();
  eberronmap.closePopup();
  placingType = getMarkerType(type);
  placingText.textContent = `Tocca la mappa per posizionare: ${getMarkerTypeLabel(placingType)}`;
  placingBanner.hidden = false;
  eberronmap.getContainer().classList.add('is-placing');
}

function stopPlacing() {
  placingType = null;
  placingBanner.hidden = true;
  eberronmap.getContainer().classList.remove('is-placing');
}

document.getElementById('placingCancel').addEventListener('click', stopPlacing);

eberronmap.on('click', (e) => {
  if (!placingType) return;
  const entry = createEntry({
    lat: e.latlng.lat,
    lng: e.latlng.lng,
    text: '',
    description: '',
    type: placingType
  }, { draft: true });
  stopPlacing();
  showEditPopup(entry);
});

// ---------------------------------------------------------------------------
// Livelli (luoghi, tipi di marker, griglia)
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

const placesLayer = L.layerGroup();

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
  refreshSheet();
}

function applyLayers() {
  markers.forEach((entry) => {
    const visible = isLayerVisible(`marker:${entry.data.type}`);
    if (visible && !eberronmap.hasLayer(entry.layer)) entry.layer.addTo(eberronmap);
    if (!visible && eberronmap.hasLayer(entry.layer)) eberronmap.removeLayer(entry.layer);
  });
  const showPlaces = isLayerVisible('places') && eberronmap.getZoom() >= PLACES_MIN_ZOOM;
  if (showPlaces && !eberronmap.hasLayer(placesLayer)) placesLayer.addTo(eberronmap);
  if (!showPlaces && eberronmap.hasLayer(placesLayer)) eberronmap.removeLayer(placesLayer);
}

eberronmap.on('zoomend', applyLayers);

// Griglia delle tile, utile a chi lavora sulle immagini della mappa.
const TileGrid = L.GridLayer.extend({
  createTile(coords) {
    const tile = L.DomUtil.create('canvas', 'leaflet-tile');
    tile.width = tileSize;
    tile.height = tileSize;
    const ctx = tile.getContext('2d');
    ctx.strokeStyle = 'rgba(241,230,200,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, tileSize, tileSize);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(241,230,200,0.9)';
    ctx.fillText(`z${coords.z} x${coords.x} y${coords.y}`, 8, 20);
    return tile;
  }
});

let gridLayer = null;

function setGridVisible(visible) {
  if (visible && !gridLayer) gridLayer = new TileGrid({ tileSize, pane: 'overlayPane' }).addTo(eberronmap);
  if (!visible && gridLayer) {
    eberronmap.removeLayer(gridLayer);
    gridLayer = null;
  }
}

// ---------------------------------------------------------------------------
// Luoghi di Eberron (data/places.json)
// ---------------------------------------------------------------------------
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
  return place.parent ? `${kind}, ${place.parent}` : kind;
}

function buildPlacePopup(place) {
  const root = shield(el('div', 'note'));
  root.append(el('p', 'note__kind', placeSubtitle(place)));
  root.append(el('h3', 'note__title', place.name));
  if (place.description) root.append(el('p', 'note__text', place.description));
  const actions = el('div', 'note__actions');
  actions.append(button('btn btn--ink', 'Misura da qui', () => measureFrom(L.latLng(place.lat, place.lng))));
  root.append(actions);
  return root;
}

function showPlace(place) {
  eberronmap.flyTo([place.lat, place.lng], place.zoom, { duration: 0.8 });
  L.popup({ ...POPUP_OPTIONS, minWidth: 220, maxWidth: 280, offset: [0, -4] })
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
            iconSize: [16, 16],
            iconAnchor: [8, 8],
            popupAnchor: [0, -6],
            tooltipAnchor: [0, -8]
          }),
          alt: place.name,
          zIndexOffset: -1000 // sempre sotto i marker dell'utente
        })
          .bindTooltip(tooltipContent(place.name), { direction: 'top' })
          .bindPopup(() => buildPlacePopup(place), { ...POPUP_OPTIONS, minWidth: 220, maxWidth: 280 })
          .addTo(placesLayer);
      });
      applyLayers();
    })
    .catch((e) => {
      console.error('Impossibile caricare i luoghi:', e);
      toast('Elenco dei luoghi non caricato: la ricerca trova solo i tuoi marker');
    });
}

// ---------------------------------------------------------------------------
// Ricerca di luoghi e marker
// ---------------------------------------------------------------------------
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
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

function placeCandidate(place) {
  return { name: place.name, subtitle: placeSubtitle(place), select: () => showPlace(place) };
}

function findMatches(rawQuery) {
  const query = normalizeText(rawQuery).trim();
  // Senza testo si sfogliano continenti e nazioni.
  if (!query) {
    return places
      .filter((place) => PLACE_KINDS[place.kind].browse !== undefined)
      .sort((a, b) => PLACE_KINDS[a.kind].browse - PLACE_KINDS[b.kind].browse || a.name.localeCompare(b.name))
      .map(placeCandidate);
  }
  const candidates = [
    ...markers.map((entry) => ({
      name: entry.data.text,
      subtitle: `Tuo marker, ${getMarkerTypeLabel(entry.data.type).toLowerCase()}`,
      pin: entry.data.type,
      select: () => focusMarker(entry)
    })),
    ...places.map(placeCandidate)
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
  Array.from(searchResults.querySelectorAll('[role="option"]')).forEach((item, i) => {
    item.setAttribute('aria-selected', String(i === index));
    if (i === index) item.scrollIntoView({ block: 'nearest' });
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
  const hasQuery = Boolean(searchInput.value.trim());
  searchMatches = findMatches(searchInput.value);
  searchResults.replaceChildren();
  if (!hasQuery && !searchMatches.length) {
    closeSearch();
    return;
  }
  if (!searchMatches.length) {
    searchResults.append(el('li', 'search__empty', `Nessun luogo o marker per "${searchInput.value.trim()}"`));
  }
  searchMatches.forEach((match, index) => {
    const item = el('li', 'search__result');
    item.id = `searchResult${index}`;
    item.setAttribute('role', 'option');
    const text = el('span', 'search__text');
    text.append(el('span', 'search__name', match.name), el('span', 'search__subtitle', match.subtitle));
    item.append(match.pin ? pinElement(match.pin) : el('span', 'search__dot'), text);
    // mousedown: così la scelta avviene prima che l'input perda il focus.
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      chooseSearchResult(index);
    });
    searchResults.append(item);
  });
  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
  setSearchActive(hasQuery && searchMatches.length ? 0 : -1);
}

function chooseSearchResult(index) {
  const match = searchMatches[index];
  if (!match) return;
  searchInput.value = match.name;
  closeSearch();
  searchInput.blur();
  if (narrowScreen.matches) closeSheet();
  match.select();
}

searchInput.addEventListener('input', renderSearch);
searchInput.addEventListener('focus', renderSearch);
searchInput.addEventListener('blur', closeSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!searchMatches.length) return;
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const from = searchActiveIndex < 0 && step < 0 ? 0 : searchActiveIndex;
    setSearchActive((from + step + searchMatches.length) % searchMatches.length);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    chooseSearchResult(Math.max(searchActiveIndex, 0));
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    closeSearch();
    searchInput.blur();
  }
});

// ---------------------------------------------------------------------------
// Link alla vista, esportazione e importazione dei marker
// ---------------------------------------------------------------------------
document.getElementById('copyLink').addEventListener('click', () => {
  const url = location.href.split('#')[0] + viewHash();
  const fallback = () => window.prompt('Copia questo link:', url);
  if (!navigator.clipboard) {
    fallback();
    return;
  }
  navigator.clipboard.writeText(url).then(() => toast('Link a questa vista copiato'), fallback);
});

function exportMarkers() {
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
  toast(markers.length === 1 ? 'Esportato 1 marker' : `Esportati ${markers.length} marker`);
}

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
      const ignored = skipped ? ` (${skipped === 1 ? '1 ignorato' : `${skipped} ignorati`}: doppi o non validi)` : '';
      if (!added) toast(`Nessun marker nuovo nel file${ignored}`);
      else toast(`${added === 1 ? 'Importato 1 marker' : `Importati ${added} marker`}${ignored}`);
    })
    .catch((e) => {
      console.error('Importazione fallita:', e);
      toast('Importazione non riuscita: scegli un file esportato da questa mappa');
    });
});

// ---------------------------------------------------------------------------
// Misura di distanze e tempi di viaggio
// ---------------------------------------------------------------------------
const measureStyle = { color: '#b3262b', weight: 3, dashArray: '1,7', lineCap: 'round' };
const measure = {
  active: false,
  points: [],
  layer: L.layerGroup(),
  line: L.polyline([], measureStyle),
  preview: L.polyline([], { ...measureStyle, opacity: 0.55, interactive: false }),
  // Su schermi stretti la tabella parte chiusa per non coprire la mappa.
  showTimes: !narrowScreen.matches
};

function milesBetween(a, b) {
  return eberronmap.project(a, maxZoom).distanceTo(eberronmap.project(b, maxZoom)) * MILES_PER_PIXEL_AT_MAX_ZOOM;
}

function measuredMiles() {
  let total = 0;
  for (let i = 1; i < measure.points.length; i++) total += milesBetween(measure.points[i - 1], measure.points[i]);
  return total;
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

function drawMeasure() {
  measure.line.setLatLngs(measure.points);
  measure.layer.clearLayers();
  measure.line.addTo(measure.layer);
  measure.preview.setLatLngs([]).addTo(measure.layer);
  measure.points.forEach((point) => {
    L.circleMarker(point, { radius: 5, color: '#f1e6c8', weight: 2, fillColor: '#b3262b', fillOpacity: 1, interactive: false })
      .addTo(measure.layer);
  });
}

function renderMeasureSheet(body) {
  const count = measure.points.length;
  const miles = measuredMiles();

  if (count < 2) {
    body.append(el('p', 'sheet__lead', count
      ? 'Tocca il punto successivo. Puoi aggiungere tutte le tappe che vuoi.'
      : 'Tocca la mappa per segnare il punto di partenza. Puoi toccare anche città e marker.'));
  } else {
    const total = el('p', 'measure__total');
    total.append(el('strong', '', Math.round(miles).toLocaleString('it-IT')), el('span', '', ' miglia'));
    if (count > 2) total.append(el('span', 'measure__legs', `in ${count - 1} tratti`));
    body.append(total);

    const details = el('details', 'measure__details');
    details.open = measure.showTimes;
    details.addEventListener('toggle', () => { measure.showTimes = details.open; });
    details.append(el('summary', '', 'Tempi di viaggio'));
    const table = el('table', 'measure__table');
    TRAVEL_MODES.forEach((mode) => {
      const row = el('tr');
      const head = el('th', '', mode.label);
      head.scope = 'row';
      row.append(head, el('td', '', formatTravelTime(miles, mode)));
      table.append(row);
    });
    details.append(table, el('p', 'sheet__hint',
      'Stime sul percorso tracciato. Navi, aeronavi e lightning rail viaggiano giorno e notte.'));
    body.append(details);
  }

  const actions = el('div', 'sheet__actions');
  const undo = button('btn', 'Togli ultima tappa', () => { measure.points.pop(); updateMeasure(); });
  const reset = button('btn', 'Ricomincia', () => { measure.points = []; updateMeasure(); });
  undo.disabled = !count;
  reset.disabled = !count;
  actions.append(undo, reset);
  body.append(actions);
}

function updateMeasure() {
  drawMeasure();
  refreshSheet();
}

function onMeasureClick(e) {
  measure.points.push(e.latlng);
  updateMeasure();
}

// Su desktop una linea tratteggiata segue il mouse fino al prossimo punto.
function onMeasureMove(e) {
  const last = measure.points[measure.points.length - 1];
  measure.preview.setLatLngs(last ? [last, e.latlng] : []);
}

function startMeasuring() {
  if (measure.active) return;
  eberronmap.closePopup();
  measure.active = true;
  measure.points = [];
  measure.layer.addTo(eberronmap);
  eberronmap.on('click', onMeasureClick);
  eberronmap.on('mousemove', onMeasureMove);
  eberronmap.doubleClickZoom.disable();
  eberronmap.getContainer().classList.add('is-measuring');
  drawMeasure();
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
}

// Avvia una misura con il primo punto già fissato (da un luogo o un marker).
function measureFrom(latlng) {
  openSheet('measure');
  measure.points = [latlng];
  updateMeasure();
}

// ---------------------------------------------------------------------------
// Pannello unico: marker, livelli, misura
// ---------------------------------------------------------------------------
const sheet = document.getElementById('sheet');
const sheetTitle = document.getElementById('sheetTitle');
const sheetBody = document.getElementById('sheetBody');
const dockButtons = document.querySelectorAll('.dock__btn[data-tool]');
let openTool = null;

function renderMarkersSheet(body) {
  body.append(el('h3', 'sheet__heading', 'Aggiungi un marker'));
  const types = el('div', 'type-grid');
  Object.keys(MARKER_TYPES).forEach((type) => {
    const choice = button('type-grid__btn', undefined, () => startPlacing(type));
    choice.append(pinElement(type), el('span', '', MARKER_TYPES[type].label));
    types.append(choice);
  });
  body.append(types);

  body.append(el('h3', 'sheet__heading', markers.length ? `I tuoi marker (${markers.length})` : 'I tuoi marker'));
  if (!markers.length) {
    body.append(el('p', 'sheet__lead',
      'Ancora nessun marker. Scegli un tipo qui sopra e tocca la mappa per segnare un luogo della tua campagna.'));
  } else {
    const list = el('ul', 'marker-list');
    [...markers]
      .sort((a, b) => a.data.text.localeCompare(b.data.text))
      .forEach((entry) => {
        const item = el('li');
        const row = button('marker-list__btn', undefined, () => {
          if (narrowScreen.matches) closeSheet();
          focusMarker(entry);
        });
        const text = el('span', 'marker-list__text');
        text.append(el('span', 'marker-list__name', entry.data.text),
          el('span', 'marker-list__kind', getMarkerTypeLabel(entry.data.type)));
        row.append(pinElement(entry.data.type), text);
        item.append(row);
        list.append(item);
      });
    body.append(list);
  }

  const actions = el('div', 'sheet__actions');
  const exportBtn = button('btn', 'Esporta marker', exportMarkers);
  exportBtn.disabled = !markers.length;
  actions.append(exportBtn, button('btn', 'Importa marker', () => importFile.click()));
  body.append(actions, el('p', 'sheet__hint',
    'I marker restano in questo browser. Esportali per salvarli o passarli ai tuoi giocatori.'));
}

function toggleRow(labelText, hint, checked, onChange, lead) {
  const row = el('label', 'toggle');
  const input = el('input', 'toggle__input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const text = el('span', 'toggle__text');
  text.append(el('span', 'toggle__label', labelText));
  if (hint) text.append(el('span', 'toggle__hint', hint));
  row.append(lead || el('span', 'toggle__lead'), text, input, el('span', 'toggle__switch'));
  return row;
}

function renderLayersSheet(body) {
  const dot = el('span', 'toggle__lead');
  dot.append(el('span', 'search__dot'));
  body.append(toggleRow('Città e luoghi di Eberron', 'Compaiono ingrandendo la mappa',
    isLayerVisible('places'), (on) => setLayerVisible('places', on), dot));

  body.append(el('h3', 'sheet__heading', 'I tuoi marker'));
  Object.keys(MARKER_TYPES).forEach((type) => {
    const count = markers.filter((m) => m.data.type === type).length;
    const lead = el('span', 'toggle__lead');
    lead.append(pinElement(type));
    body.append(toggleRow(MARKER_TYPES[type].plural, count ? `${count} sulla mappa` : '',
      isLayerVisible(`marker:${type}`), (on) => setLayerVisible(`marker:${type}`, on), lead));
  });

  body.append(el('h3', 'sheet__heading', 'Strumenti'));
  body.append(toggleRow('Griglia delle tile', 'Mostra zoom e coordinate di ogni riquadro',
    Boolean(gridLayer), setGridVisible));
}

const SHEETS = {
  markers: { title: 'Marker', render: renderMarkersSheet },
  layers: { title: 'Livelli', render: renderLayersSheet },
  measure: { title: 'Misura un percorso', render: renderMeasureSheet }
};

function refreshSheet() {
  if (!openTool) return;
  const scroll = sheetBody.scrollTop;
  const body = document.createDocumentFragment();
  SHEETS[openTool].render(body);
  sheetBody.replaceChildren(body);
  sheetBody.scrollTop = scroll;
}

function syncDock() {
  dockButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-tool') === openTool));
  });
}

function openSheet(tool) {
  if (openTool === tool) return;
  stopPlacing();
  if (tool === 'measure') startMeasuring();
  else stopMeasuring();
  openTool = tool;
  sheetTitle.textContent = SHEETS[tool].title;
  sheet.dataset.sheet = tool;
  sheet.hidden = false;
  sheetBody.scrollTop = 0;
  refreshSheet();
  syncDock();
}

function closeSheet() {
  if (!openTool) return;
  stopMeasuring();
  openTool = null;
  sheet.hidden = true;
  syncDock();
}

dockButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tool = btn.getAttribute('data-tool');
    if (openTool === tool) closeSheet();
    else openSheet(tool);
  });
});

document.getElementById('sheetClose').addEventListener('click', closeSheet);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (placingType) stopPlacing();
  else closeSheet();
});

// I clic sugli strumenti non devono arrivare alla mappa.
[searchBox, sheet, placingBanner, document.querySelector('.dock')].forEach((node) => {
  shield(node);
  L.DomEvent.disableClickPropagation(node);
  L.DomEvent.disableScrollPropagation(node);
});

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
loadMarkers();
applyLayers();
loadPlaces();
