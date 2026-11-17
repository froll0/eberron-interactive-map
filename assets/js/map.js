// Punto d'ingresso: initMap(container, options) costruisce la mappa completa
// dentro un elemento qualsiasi, così si può incorporare in un'altra app.

import { HOME_VIEW, MAP_BOUNDS_Z3, MAX_ZOOM, MILES_PER_PIXEL_AT_MAX_ZOOM, MIN_ZOOM, TILE_SIZE } from './config.js';
import { formatViewHash, niceScale, parseViewHash } from './core.js';
import { createToaster, shield } from './dom.js';
import { CampaignStore, defaultBackend } from './storage.js';
import { buildChrome } from './template.js';
import { setupPanel } from './panel.js';
import { setupLayers } from './layers.js';
import { setupMarkers } from './markers.js';
import { setupPlaces } from './places.js';
import { setupSearch } from './search.js';
import { setupMeasure } from './measure.js';

/**
 * @param {HTMLElement} container  elemento che ospiterà la mappa (a tutto schermo o no)
 * @param {object} [options]
 * @param {string} [options.tilesUrl]   modello degli URL delle tile
 * @param {string} [options.placesUrl]  file JSON dei luoghi
 * @param {{getItem: Function, setItem: Function}} [options.storage]  dove salvare campagne e preferenze
 * @param {boolean} [options.syncUrl]   tenere la vista nell'indirizzo della pagina (#zoom/lat/lng)
 * @param {boolean} [options.debug]     strumenti per chi lavora sulle tile
 */
export function initMap(container, options = {}) {
  const settings = {
    tilesUrl: 'eberron/{z}/{x}/{y}.jpg',
    placesUrl: 'data/places.json',
    syncUrl: true,
    debug: new URLSearchParams(location.search).has('debug'),
    ...options
  };
  const refs = buildChrome(container);
  const backend = settings.storage ? { store: settings.storage, persistent: true } : defaultBackend();

  const map = L.map(refs.map, {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: false
  });
  L.tileLayer(settings.tilesUrl, {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    tileSize: TILE_SIZE,
    noWrap: true,
    keepBuffer: 4
  }).addTo(map);
  map.setMaxBounds(L.latLngBounds(
    map.unproject([MAP_BOUNDS_Z3.west, MAP_BOUNDS_Z3.south], 3),
    map.unproject([MAP_BOUNDS_Z3.east, MAP_BOUNDS_Z3.north], 3)
  ));

  const zoomRange = { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM };
  const startView = (settings.syncUrl && parseViewHash(location.hash, zoomRange)) || HOME_VIEW;
  map.setView(startView.center, startView.zoom);

  const ctx = {
    map,
    refs,
    settings,
    store: new CampaignStore(backend.store),
    toast: createToaster(refs.toast),
    narrow: window.matchMedia('(max-width: 719px)'),
    // Le schede si aprono lasciando liberi ricerca, zoom e barra degli strumenti.
    popupOptions: { autoPanPaddingTopLeft: [12, 76], autoPanPaddingBottomRight: [68, 92] },
    viewHash() {
      const center = map.getCenter();
      return formatViewHash(map.getZoom(), center.lat, center.lng);
    },
    milesBetween(a, b) {
      return map.project(a, MAX_ZOOM).distanceTo(map.project(b, MAX_ZOOM)) * MILES_PER_PIXEL_AT_MAX_ZOOM;
    },
    // Avviso in basso (posizionamento o spostamento di un marker).
    banner: {
      cancel: null,
      show(text, onCancel) {
        refs.bannerText.textContent = text;
        refs.banner.hidden = false;
        this.cancel = onCancel;
      },
      hide() {
        refs.banner.hidden = true;
        this.cancel = null;
      }
    }
  };
  refs.bannerCancel.addEventListener('click', () => ctx.banner.cancel && ctx.banner.cancel());

  ctx.panel = setupPanel(ctx);
  ctx.layers = setupLayers(ctx);
  ctx.markers = setupMarkers(ctx);
  ctx.places = setupPlaces(ctx);
  ctx.measure = setupMeasure(ctx);
  setupSearch(ctx);
  setupZoomControl(ctx);
  setupScale(ctx);
  setupLink(ctx);

  if (!backend.persistent) {
    ctx.toast('Questo browser non permette di salvare: i marker andranno persi alla chiusura');
  }

  // Esc annulla l'azione in corso; altrimenti chiude la scheda aperta sulla
  // mappa; altrimenti il pannello.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ctx.banner.cancel) ctx.banner.cancel();
    else if (map._popup && map.hasLayer(map._popup)) map.closePopup();
    else ctx.panel.close();
  });

  // I clic sugli strumenti non devono arrivare alla mappa.
  [refs.searchBox, refs.sheet, refs.banner, refs.dock, refs.toast].forEach((node) => {
    shield(node);
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
  });

  ctx.markers.load();
  ctx.layers.apply();
  ctx.places.load(settings.placesUrl);
  return ctx;
}

function setupZoomControl(ctx) {
  const { map } = ctx;
  const ZoomControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const group = L.DomUtil.create('div', 'zoom');
      const make = (label, path, onClick) => {
        const node = L.DomUtil.create('button', 'zoom__btn', group);
        node.type = 'button';
        node.setAttribute('aria-label', label);
        node.title = label;
        node.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${path}"/></svg>`;
        node.addEventListener('click', onClick);
        return node;
      };
      const zoomIn = make('Ingrandisci', 'M10 4v12M4 10h12', () => map.zoomIn());
      const zoomOut = make('Riduci', 'M4 10h12', () => map.zoomOut());
      make('Torna alla vista iniziale', 'M3.5 9.5 10 4l6.5 5.5M5.5 8.5V16h9V8.5',
        () => map.setView(HOME_VIEW.center, HOME_VIEW.zoom));
      const sync = () => {
        zoomIn.disabled = map.getZoom() >= MAX_ZOOM;
        zoomOut.disabled = map.getZoom() <= MIN_ZOOM;
      };
      map.on('zoomend', sync);
      sync();
      L.DomEvent.disableClickPropagation(group);
      return group;
    }
  });
  new ZoomControl().addTo(map);
}

function setupScale(ctx) {
  const { map, refs } = ctx;
  const update = () => {
    const { miles, pixels } = niceScale(MILES_PER_PIXEL_AT_MAX_ZOOM * 2 ** (MAX_ZOOM - map.getZoom()));
    refs.scaleBar.style.width = `${pixels}px`;
    refs.scaleLabel.textContent = `${miles.toLocaleString('it-IT')} miglia`;
  };
  map.on('zoomend', update);
  update();
}

function setupLink(ctx) {
  const { map, refs, settings } = ctx;
  if (settings.syncUrl) {
    // L'indirizzo segue la vista, così si può copiare anche dalla barra del browser.
    map.on('moveend', () => history.replaceState(null, '', ctx.viewHash()));
    window.addEventListener('hashchange', () => {
      const view = parseViewHash(location.hash, { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
      if (view) map.setView(view.center, view.zoom);
    });
  }
  refs.copyLink.addEventListener('click', () => {
    const url = location.href.split('#')[0] + ctx.viewHash();
    const fallback = () => window.prompt('Copia questo link:', url);
    if (!navigator.clipboard) {
      fallback();
      return;
    }
    navigator.clipboard.writeText(url).then(() => ctx.toast('Link a questa vista copiato'), fallback);
  });
}
