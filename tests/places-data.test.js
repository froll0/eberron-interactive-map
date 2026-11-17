// Controlli sul file dei luoghi: chi aggiunge un luogo scopre subito un errore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP_BOUNDS_Z3, PLACE_KINDS, WIKI_PREFIX } from '../assets/js/config.js';

const places = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url), 'utf8'));
const names = new Set(places.map((p) => p.name));

// Da lat/lng ai pixel del mondo allo zoom 3 (proiezione di Leaflet).
function toPixels(lat, lng) {
  const size = 256 * 2 ** 3;
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

test('ogni luogo ha nome unico, tipo valido e coordinate sulla mappa', () => {
  assert.equal(names.size, places.length, 'nomi duplicati');
  for (const p of places) {
    assert.ok(p.name && p.name.trim() === p.name, `nome non valido: "${p.name}"`);
    assert.ok(PLACE_KINDS[p.kind], `${p.name}: tipo sconosciuto "${p.kind}"`);
    const { x, y } = toPixels(p.lat, p.lng);
    assert.ok(x >= MAP_BOUNDS_Z3.west && x <= MAP_BOUNDS_Z3.east && y >= MAP_BOUNDS_Z3.north && y <= MAP_BOUNDS_Z3.south,
      `${p.name}: fuori dai bordi della mappa`);
  }
});

test('i genitori esistono e non formano cicli', () => {
  const byName = new Map(places.map((p) => [p.name, p]));
  for (const p of places) {
    const seen = new Set([p.name]);
    let parent = p.parent;
    while (parent) {
      assert.ok(byName.has(parent), `${p.name}: il genitore "${parent}" non esiste`);
      assert.ok(!seen.has(parent), `${p.name}: ciclo di genitori`);
      seen.add(parent);
      parent = byName.get(parent).parent;
    }
  }
});

test('link alla wiki e descrizioni sono nel formato atteso', () => {
  for (const p of places) {
    if (p.wiki !== undefined) assert.ok(p.wiki.startsWith(WIKI_PREFIX), `${p.name}: link non alla Eberron Wiki`);
    if (p.description !== undefined) {
      assert.ok(p.description.length > 0 && p.description.length <= 300, `${p.name}: descrizione vuota o troppo lunga`);
    }
  }
});
