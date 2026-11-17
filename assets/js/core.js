// Logica pura della mappa: niente DOM, niente Leaflet. Ogni funzione qui
// riceve dati e restituisce dati, così si può provare con `npm test`.

import { DEFAULT_MARKER_TYPE, LIMITS, MARKER_TYPES, PLACE_KINDS, WATERS_GROUP, WIKI_PREFIX } from './config.js';

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// Confronto senza maiuscole, accenti e apostrofi ("Q'barra" ≈ "qbarra").
export function normalizeText(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ'’`]/g, '');
}

// ---------------------------------------------------------------------------
// Vista nell'indirizzo: #zoom/lat/lng
// ---------------------------------------------------------------------------
export function parseViewHash(hash, { minZoom, maxZoom }) {
  const parts = String(hash).replace(/^#/, '').split('/').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return null;
  const [zoom, lat, lng] = parts;
  if (zoom < minZoom || zoom > maxZoom || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { center: [lat, lng], zoom: Math.round(zoom) };
}

export function formatViewHash(zoom, lat, lng) {
  return `#${zoom}/${lat.toFixed(4)}/${lng.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Distanze e tempi di viaggio
// ---------------------------------------------------------------------------
const days = (n) => `${n.toLocaleString('it-IT')} ${n === 1 ? 'giorno' : 'giorni'}`;

export function formatTravelTime(miles, mode) {
  if (mode.milesPerDay) {
    const total = miles / mode.milesPerDay;
    if (total < 1) return 'meno di un giorno';
    return days(Math.round(total * 2) / 2);
  }
  const hours = Math.max(1, Math.round(miles / mode.milesPerHour));
  const parts = [];
  if (hours >= 24) parts.push(days(Math.floor(hours / 24)));
  if (hours % 24) parts.push(`${hours % 24} ${hours % 24 === 1 ? 'ora' : 'ore'}`);
  return parts.join(' e ');
}

// La lunghezza "tonda" (1, 2 o 5 × 10^n miglia) più lunga che sta in maxPixels.
export function niceScale(milesPerPixel, maxPixels = 120) {
  const target = milesPerPixel * maxPixels;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const miles = [5, 2, 1].map((step) => step * magnitude).find((value) => value <= target);
  return { miles, pixels: Math.round(miles / milesPerPixel) };
}

// ---------------------------------------------------------------------------
// Ricerca
// ---------------------------------------------------------------------------
// Punteggio di un testo: 0 = inizia con la ricerca, 1 = una sua parola inizia
// con la ricerca, 2 = la contiene. -1 = nessuna corrispondenza.
export function matchScore(text, query) {
  const normalized = normalizeText(text);
  if (normalized.startsWith(query)) return 0;
  if (normalized.split(/[\s,.:;()"-]+/).some((word) => word.startsWith(query))) return 1;
  return normalized.includes(query) ? 2 : -1;
}

// Ordina i candidati ({ name, parent?, description? }) per pertinenza.
// Il nome conta più della nazione di appartenenza, che conta più della
// descrizione: "breland" trova prima il Breland, poi i luoghi del Breland.
export function rankMatches(candidates, rawQuery, limit = LIMITS.searchResults) {
  const query = normalizeText(rawQuery).trim();
  if (!query) return [];
  const scored = [];
  candidates.forEach((candidate) => {
    let score = matchScore(candidate.name, query);
    if (score < 0 && candidate.parent && matchScore(candidate.parent, query) === 0) score = 3;
    if (score < 0 && query.length >= 3 && candidate.description) {
      const inDescription = matchScore(candidate.description, query);
      if (inDescription >= 0 && inDescription < 2) score = 4;
    }
    if (score >= 0) scored.push({ candidate, score });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, limit)
    .map((match) => match.candidate);
}

// ---------------------------------------------------------------------------
// Marker e percorsi
// ---------------------------------------------------------------------------
export function getMarkerType(type) {
  return has(MARKER_TYPES, type) ? type : DEFAULT_MARKER_TYPE;
}

const finite = (value) => Number.isFinite(Number(value));

export function normalizeMarker(raw) {
  if (!raw || typeof raw !== 'object' || !finite(raw.lat) || !finite(raw.lng)) return null;
  return {
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    text: String(raw.text ?? '').trim().slice(0, LIMITS.name) || 'Marker senza nome',
    description: String(raw.description ?? '').slice(0, LIMITS.description),
    type: getMarkerType(raw.type),
    // I marker nascosti non finiscono nell'esportazione per i giocatori.
    hidden: raw.hidden === true
  };
}

export function normalizeRoute(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.points)) return null;
  const points = raw.points
    .filter((point) => Array.isArray(point) && point.length === 2 && point.every(finite))
    .map(([lat, lng]) => [Number(lat), Number(lng)]);
  if (points.length < 2) return null;
  return {
    name: String(raw.name ?? '').trim().slice(0, LIMITS.name) || 'Percorso senza nome',
    points,
    hidden: raw.hidden === true
  };
}

export function markerKey(marker) {
  return [marker.lat.toFixed(5), marker.lng.toFixed(5), marker.type, marker.text].join('|');
}

const routeKey = (route) => route.name + '|' + route.points.map((p) => p.map((n) => n.toFixed(4)).join(',')).join(';');

// Unisce il contenuto di un file esportato a marker e percorsi esistenti,
// saltando i doppioni e le voci non valide. Accetta anche il vecchio formato
// (un semplice elenco di marker).
export function mergeImport(existing, raw) {
  const isList = Array.isArray(raw);
  const incomingMarkers = isList ? raw : raw && Array.isArray(raw.markers) ? raw.markers : null;
  if (!incomingMarkers) throw new Error('Il file non contiene un elenco di marker');
  const incomingRoutes = !isList && Array.isArray(raw.routes) ? raw.routes : [];

  const markers = [...existing.markers];
  const routes = [...existing.routes];
  const seenMarkers = new Set(markers.map(markerKey));
  const seenRoutes = new Set(routes.map(routeKey));
  let added = 0;
  let skipped = 0;

  incomingMarkers.forEach((item) => {
    const marker = normalizeMarker(item);
    if (!marker || seenMarkers.has(markerKey(marker)) || markers.length >= LIMITS.markers) {
      skipped++;
      return;
    }
    seenMarkers.add(markerKey(marker));
    markers.push(marker);
    added++;
  });
  incomingRoutes.forEach((item) => {
    const route = normalizeRoute(item);
    if (!route || seenRoutes.has(routeKey(route)) || routes.length >= LIMITS.routes) {
      skipped++;
      return;
    }
    seenRoutes.add(routeKey(route));
    routes.push(route);
    added++;
  });
  return { markers, routes, added, skipped };
}

// Contenuto di un file di esportazione. Per i giocatori restano fuori i
// marker e i percorsi nascosti.
export function buildExport({ campaignName, markers, routes }, { forPlayers = false, now = new Date() } = {}) {
  const visible = (item) => !forPlayers || !item.hidden;
  const strip = ({ hidden, ...rest }) => (forPlayers ? rest : { ...rest, hidden });
  return {
    app: 'eberron-interactive-map',
    version: 2,
    campaign: campaignName,
    exportedAt: now.toISOString(),
    markers: markers.filter(visible).map(strip),
    routes: routes.filter(visible).map(strip)
  };
}

// ---------------------------------------------------------------------------
// Luoghi di Eberron
// ---------------------------------------------------------------------------
export function normalizePlace(raw, { minZoom, maxZoom }) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  if (!finite(raw.lat) || !finite(raw.lng)) return null;
  const zoom = Number(raw.zoom);
  return {
    name: raw.name.trim(),
    kind: has(PLACE_KINDS, raw.kind) ? raw.kind : 'site',
    parent: typeof raw.parent === 'string' ? raw.parent : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    // Solo link alla wiki di Eberron: il file dei luoghi non deve poter puntare altrove.
    wiki: typeof raw.wiki === 'string' && raw.wiki.startsWith(WIKI_PREFIX) ? raw.wiki : '',
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    zoom: Number.isFinite(zoom) ? Math.min(maxZoom, Math.max(minZoom, Math.round(zoom))) : 5
  };
}

// Raggruppa i luoghi per nazione o continente. Mari e laghi non appartengono
// a una nazione: stanno in un gruppo a parte.
export function groupPlaces(places) {
  const groups = new Map();
  places.forEach((place) => {
    const group = place.parent || (place.kind === 'water' ? WATERS_GROUP : '');
    if (!group) return;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(place);
  });
  return groups;
}

// Le voci del primo livello dell'atlante: i luoghi senza "genitore" che hanno
// figli (i continenti), più il gruppo dei mari.
export function atlasRoots(places, groups) {
  const roots = places
    .filter((place) => !place.parent && groups.has(place.name))
    .map((place) => place.name)
    .sort((a, b) => a.localeCompare(b));
  if (groups.has(WATERS_GROUP)) roots.push(WATERS_GROUP);
  return roots;
}

// Numero di luoghi contenuti in un gruppo, compresi quelli dei sottogruppi.
export function countPlaces(name, groups, seen = new Set()) {
  if (seen.has(name)) return 0; // protezione da cicli nel file dei luoghi
  seen.add(name);
  const children = groups.get(name) || [];
  return children.reduce((total, place) => total + 1 + countPlaces(place.name, groups, seen), 0);
}
