// Livelli visibili (luoghi, tipi di marker), legenda dei simboli della mappa
// e, con ?debug, la griglia delle tile.

import { MARKER_TYPES, TILE_SIZE } from './config.js';
import { el, pinElement } from './dom.js';

// Simboli disegnati sulla mappa originale, ridisegnati per la legenda.
const LEGEND = [
  ['Capitale', '<circle cx="12" cy="12" r="7" class="lg-fill-light"/><path class="lg-fill-dark" d="m12 7.2 1.4 3.2 3.5.3-2.7 2.3.9 3.4-3.1-1.9-3.1 1.9.9-3.4-2.7-2.3 3.5-.3Z"/>'],
  ['Città', '<circle cx="12" cy="12" r="6.5" class="lg-fill-light"/><circle cx="12" cy="12" r="3.2" class="lg-fill-dark"/>'],
  ['Cittadina', '<circle cx="12" cy="12" r="5" class="lg-fill-light"/>'],
  ['Villaggio', '<circle cx="12" cy="12" r="2.6" class="lg-fill-dark"/>'],
  ['Fortezza', '<rect x="7.5" y="7.5" width="9" height="9" class="lg-fill-light"/>'],
  ['Rovina', '<rect x="7.5" y="7.5" width="9" height="9" class="lg-fill-light"/><path class="lg-line" d="M7.5 7.5l9 9"/>'],
  ['Luogo notevole', '<path class="lg-fill-dark" d="M12 6.5 17.5 12 12 17.5 6.5 12Z"/>'],
  ['Lightning rail', '<path class="lg-rail" d="M3 15c5-6 13-2 18-8"/>'],
  ['Strada commerciale Orien', '<path class="lg-road" d="M3 15c5-6 13-2 18-8"/>'],
  ['Confine', '<path class="lg-border" d="M3 15c5-6 13-2 18-8"/>']
];

export function setupLayers(ctx) {
  const { map, store, panel, settings } = ctx;
  const state = { places: true };
  Object.keys(MARKER_TYPES).forEach((type) => { state[`marker:${type}`] = true; });
  const saved = store.loadLayers();
  Object.keys(state).forEach((key) => {
    if (typeof saved[key] === 'boolean') state[key] = saved[key];
  });

  const placeGroups = new Map(); // soglia di zoom -> gruppo di anelli
  let grid = null;

  const layers = {
    isVisible: (key) => state[key] !== false,
    setVisible(key, visible) {
      if (!(key in state) || state[key] === visible) return;
      state[key] = visible;
      store.saveLayers(state);
      layers.apply();
      panel.refresh();
    },
    // Un gruppo di anelli per ogni soglia di zoom (città prima, centri minori poi).
    placeGroup(dotZoom) {
      if (!placeGroups.has(dotZoom)) placeGroups.set(dotZoom, L.layerGroup());
      return placeGroups.get(dotZoom);
    },
    apply() {
      ctx.markers.entries.forEach((entry) => {
        const visible = layers.isVisible(`marker:${entry.data.type}`);
        if (visible && !map.hasLayer(entry.layer)) entry.layer.addTo(map);
        if (!visible && map.hasLayer(entry.layer)) map.removeLayer(entry.layer);
      });
      placeGroups.forEach((group, dotZoom) => {
        const show = layers.isVisible('places') && map.getZoom() >= dotZoom;
        if (show && !map.hasLayer(group)) group.addTo(map);
        if (!show && map.hasLayer(group)) map.removeLayer(group);
      });
    }
  };
  map.on('zoomend', layers.apply);

  function toggleRow(labelText, hint, checked, onChange, lead) {
    const row = el('label', 'toggle');
    const input = el('input', 'toggle__input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    const text = el('span', 'toggle__text');
    text.append(el('span', 'toggle__label', labelText));
    if (hint) text.append(el('span', 'toggle__hint', hint));
    const leadNode = el('span', 'toggle__lead');
    if (lead) leadNode.append(lead);
    row.append(leadNode, text, input, el('span', 'toggle__switch'));
    return row;
  }

  function render(body) {
    body.append(toggleRow('Città e luoghi di Eberron', 'Le città da zoom medio, i centri minori ingrandendo ancora',
      layers.isVisible('places'), (on) => layers.setVisible('places', on), el('span', 'search__dot')));

    body.append(el('h3', 'sheet__heading', 'I tuoi marker'));
    Object.keys(MARKER_TYPES).forEach((type) => {
      const count = ctx.markers.entries.filter((m) => m.data.type === type).length;
      body.append(toggleRow(MARKER_TYPES[type].plural, count ? `${count} sulla mappa` : '',
        layers.isVisible(`marker:${type}`), (on) => layers.setVisible(`marker:${type}`, on), pinElement(type)));
    });

    body.append(el('h3', 'sheet__heading', 'Simboli della mappa'));
    const legend = el('ul', 'legend');
    LEGEND.forEach(([label, svg]) => {
      const item = el('li', 'legend__item');
      const symbol = el('span', 'legend__symbol');
      symbol.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`; // costanti del codice
      item.append(symbol, el('span', '', label));
      legend.append(item);
    });
    body.append(legend);

    if (settings.debug) {
      body.append(el('h3', 'sheet__heading', 'Strumenti di sviluppo'));
      body.append(toggleRow('Griglia delle tile', 'Zoom e coordinate di ogni riquadro', Boolean(grid), (on) => {
        if (on && !grid) grid = createGrid().addTo(map);
        if (!on && grid) {
          map.removeLayer(grid);
          grid = null;
        }
      }));
    }
  }

  panel.register('layers', { title: 'Livelli', render });
  return layers;
}

// Griglia delle tile, utile solo a chi lavora sulle immagini della mappa.
function createGrid() {
  const Grid = L.GridLayer.extend({
    createTile(coords) {
      const tile = L.DomUtil.create('canvas', 'leaflet-tile');
      tile.width = TILE_SIZE;
      tile.height = TILE_SIZE;
      const g = tile.getContext('2d');
      g.strokeStyle = 'rgba(241,230,200,0.45)';
      g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
      g.font = '12px sans-serif';
      g.fillStyle = 'rgba(241,230,200,0.9)';
      g.fillText(`z${coords.z} x${coords.x} y${coords.y}`, 8, 20);
      return tile;
    }
  });
  return new Grid({ tileSize: TILE_SIZE, pane: 'overlayPane' });
}
