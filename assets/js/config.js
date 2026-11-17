// Impostazioni della mappa. Nessuna dipendenza: importabile anche dai test.

export const MIN_ZOOM = 2;
export const MAX_ZOOM = 7;
export const TILE_SIZE = 256;
export const HOME_VIEW = { center: [20.01, 0.08], zoom: 4 };

// L'immagine della mappa occupa solo una parte del "mondo" delle tile:
// questi sono i suoi bordi in pixel allo zoom 3, con un po' di margine.
export const MAP_BOUNDS_Z3 = { west: 115, east: 1930, north: 350, south: 1700 };

// Miglia per pixel allo zoom massimo. Corrisponde alla barra di scala
// disegnata sulla mappa (circa 135 px ogni 1000 miglia allo zoom 3).
export const MILES_PER_PIXEL_AT_MAX_ZOOM = 3.233 / 7;

export const LIMITS = {
  name: 80,
  description: 500,
  importBytes: 2 * 1024 * 1024,
  markers: 5000,
  routes: 200,
  campaigns: 50,
  searchResults: 10
};

// Velocità di viaggio. "milesPerDay" per chi si ferma a riposare (8 ore di
// marcia al giorno), "milesPerHour" per i mezzi che viaggiano senza sosta.
// Valori indicativi delle regole di D&D 5e / Eberron: adattali alla tua campagna.
export const TRAVEL_MODES = [
  { label: 'A piedi, ritmo lento', milesPerDay: 18 },
  { label: 'A piedi, ritmo normale', milesPerDay: 24 },
  { label: 'A piedi, ritmo veloce', milesPerDay: 30 },
  { label: 'Veliero', milesPerHour: 2 },
  { label: 'Galeone elementale', milesPerHour: 20 },
  { label: 'Aeronave', milesPerHour: 20 },
  { label: 'Lightning rail', milesPerHour: 30 }
];

// Tipi di marker. "glyph" è il disegno (16×16) dentro il segnaposto.
export const MARKER_TYPES = {
  party: { label: 'Gruppo', plural: 'Gruppo', glyph: 'M4 1.5h1.6v13H4Zm2.6 1H14l-2.2 3 2.2 3H6.6Z' },
  city: { label: 'Città', plural: 'Città', glyph: 'M2 14V7h3V3h2v2h2V3h2v4h3v7H9.5v-3h-3v3Z' },
  village: { label: 'Villaggio', plural: 'Villaggi', glyph: 'M8 2 1.5 8h2v6H7v-4h2v4h3.5V8h2Z' },
  dungeon: { label: 'Dungeon', plural: 'Dungeon', glyph: 'M3 14V7a5 5 0 0 1 10 0v7h-3V7.5a2 2 0 0 0-4 0V14Z' },
  monster: { label: 'Mostro', plural: 'Mostri', glyph: 'M3.5 2c1 4 1 8-1 12h2c2-4 2-8 1-12Zm4 0c1 4 1 8-1 12h2c2-4 2-8 1-12Zm4 0c1 4 1 8-1 12h2c2-4 2-8 1-12Z' },
  other: { label: 'Nota', plural: 'Note', glyph: 'm8 2 1.8 4.2L14 8 9.8 9.8 8 14 6.2 9.8 2 8l4.2-1.8Z' }
};
export const DEFAULT_MARKER_TYPE = 'other';

// Tipi di luogo. "dotZoom" è lo zoom da cui il luogo ha un anello cliccabile
// sulla mappa (assente = solo nella ricerca e nell'atlante); "browse" mette il
// tipo nell'elenco che compare aprendo la ricerca vuota.
export const PLACE_KINDS = {
  continent: { label: 'Continente', plural: 'Continenti', browse: 0 },
  nation: { label: 'Nazione', plural: 'Nazioni', browse: 1 },
  region: { label: 'Regione', plural: 'Regioni' },
  capital: { label: 'Capitale', plural: 'Capitali', dotZoom: 5 },
  city: { label: 'Città', plural: 'Città', dotZoom: 5 },
  town: { label: 'Cittadina', plural: 'Cittadine', dotZoom: 6 },
  village: { label: 'Villaggio', plural: 'Villaggi', dotZoom: 6 },
  fort: { label: 'Fortezza', plural: 'Fortezze', dotZoom: 6 },
  ruin: { label: 'Rovina', plural: 'Rovine', dotZoom: 6 },
  site: { label: 'Luogo notevole', plural: 'Luoghi notevoli', dotZoom: 6 },
  volcano: { label: 'Vulcano', plural: 'Vulcani', dotZoom: 6 },
  island: { label: 'Isola', plural: 'Isole' },
  forest: { label: 'Foresta o palude', plural: 'Foreste e paludi' },
  mountains: { label: 'Monti', plural: 'Monti' },
  water: { label: 'Mare o lago', plural: 'Mari e laghi' }
};

export const WATERS_GROUP = 'Mari, baie e laghi';
export const WIKI_PREFIX = 'https://eberron.fandom.com/wiki/';
