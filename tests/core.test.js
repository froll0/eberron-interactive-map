import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  atlasRoots, buildExport, countPlaces, formatTravelTime, formatViewHash, groupPlaces, matchScore,
  mergeImport, niceScale, normalizeMarker, normalizePlace, normalizeRoute, normalizeText, parseViewHash, rankMatches
} from '../assets/js/core.js';
import { WATERS_GROUP } from '../assets/js/config.js';

const zooms = { minZoom: 2, maxZoom: 7 };

test('normalizeText ignora maiuscole, accenti e apostrofi', () => {
  assert.equal(normalizeText("Q'barra"), 'qbarra');
  assert.equal(normalizeText('Città'), 'citta');
  assert.equal(normalizeText('Zarash’ak'), 'zarashak');
});

test('parseViewHash accetta solo viste valide', () => {
  assert.deepEqual(parseViewHash('#6/53.2/-25.1', zooms), { center: [53.2, -25.1], zoom: 6 });
  assert.deepEqual(parseViewHash('5.6/1/2', zooms), { center: [1, 2], zoom: 6 });
  assert.equal(parseViewHash('#99/1/2', zooms), null);
  assert.equal(parseViewHash('#1/1/2', zooms), null);
  assert.equal(parseViewHash('#6/95/2', zooms), null);
  assert.equal(parseViewHash('#6/abc/<script>', zooms), null);
  assert.equal(parseViewHash('', zooms), null);
});

test('formatViewHash e parseViewHash sono inversi', () => {
  const hash = formatViewHash(5, 12.345678, -40.5);
  assert.equal(hash, '#5/12.3457/-40.5000');
  assert.deepEqual(parseViewHash(hash, zooms), { center: [12.3457, -40.5], zoom: 5 });
});

test('formatTravelTime: a piedi in giorni, i mezzi in giorni e ore', () => {
  const walk = { milesPerDay: 24 };
  assert.equal(formatTravelTime(10, walk), 'meno di un giorno');
  assert.equal(formatTravelTime(24, walk), '1 giorno');
  assert.equal(formatTravelTime(296, walk), '12,5 giorni');
  const rail = { milesPerHour: 30 };
  assert.equal(formatTravelTime(5, rail), '1 ora');
  assert.equal(formatTravelTime(300, rail), '10 ore');
  assert.equal(formatTravelTime(1302, rail), '1 giorno e 19 ore');
  assert.equal(formatTravelTime(1440, rail), '2 giorni');
});

test('niceScale sceglie lunghezze tonde', () => {
  assert.deepEqual(niceScale(1, 120), { miles: 100, pixels: 100 });
  assert.deepEqual(niceScale(2, 120), { miles: 200, pixels: 100 });
  assert.equal(niceScale(0.4618, 120).miles, 50);
});

test('matchScore: inizio, inizio di parola, contenuto', () => {
  assert.equal(matchScore('Sharn', 'sha'), 0);
  assert.equal(matchScore('Shadow Marches', 'mar'), 1);
  assert.equal(matchScore('Zarash\'ak', 'ras'), 2);
  assert.equal(matchScore('Sharn', 'xyz'), -1);
});

test('rankMatches: nome, poi nazione, poi descrizione', () => {
  const candidates = [
    { name: 'Sharn', parent: 'Breland', description: 'La Città delle Torri.' },
    { name: 'Breland', parent: 'Khorvaire', description: '' },
    { name: 'Wroat', parent: 'Breland', description: 'Capitale del Breland.' },
    { name: 'Korth', parent: 'Karrnath', description: 'Capitale del Karrnath.' }
  ];
  assert.deepEqual(rankMatches(candidates, 'breland').map((c) => c.name), ['Breland', 'Sharn', 'Wroat']);
  assert.deepEqual(rankMatches(candidates, 'torri').map((c) => c.name), ['Sharn']);
  assert.deepEqual(rankMatches(candidates, 'capitale').map((c) => c.name), ['Korth', 'Wroat']);
  assert.deepEqual(rankMatches(candidates, '  '), []);
  assert.equal(rankMatches(candidates, 'r', 2).length, 2);
});

test('normalizeMarker ripulisce i dati e scarta quelli non validi', () => {
  assert.equal(normalizeMarker(null), null);
  assert.equal(normalizeMarker({ lat: 'boh', lng: 1 }), null);
  const m = normalizeMarker({ lat: '10', lng: 5, text: '  ' + 'x'.repeat(200), type: 'nope', hidden: 'yes' });
  assert.equal(m.lat, 10);
  assert.equal(m.text.length, 80);
  assert.equal(m.type, 'other');
  assert.equal(m.hidden, false);
  assert.equal(normalizeMarker({ lat: 1, lng: 1 }).text, 'Marker senza nome');
  // Il testo resta testo: nessuna interpretazione come HTML qui.
  assert.equal(normalizeMarker({ lat: 1, lng: 1, text: '<img src=x>' }).text, '<img src=x>');
});

test('normalizeRoute vuole almeno due punti validi', () => {
  assert.equal(normalizeRoute({ points: [[1, 2]] }), null);
  assert.equal(normalizeRoute({ points: [[1, 2], ['a', 3]] }), null);
  assert.deepEqual(normalizeRoute({ name: 'A', points: [[1, 2], ['3', 4]] }), { name: 'A', points: [[1, 2], [3, 4]], hidden: false });
});

test('mergeImport unisce, salta doppioni e accetta il vecchio formato', () => {
  const existing = { markers: [normalizeMarker({ lat: 1, lng: 1, text: 'A', type: 'city' })], routes: [] };
  const file = {
    markers: [{ lat: 1, lng: 1, text: 'A', type: 'city' }, { lat: 2, lng: 2, text: 'B' }, { lat: 'x' }],
    routes: [{ name: 'R', points: [[0, 0], [1, 1]] }, { name: 'R', points: [[0, 0], [1, 1]] }]
  };
  const merged = mergeImport(existing, file);
  assert.equal(merged.markers.length, 2);
  assert.equal(merged.routes.length, 1);
  assert.equal(merged.added, 2);
  assert.equal(merged.skipped, 3);
  assert.equal(existing.markers.length, 1, 'non modifica i dati di partenza');
  assert.equal(mergeImport(existing, [{ lat: 3, lng: 3, text: 'C' }]).added, 1);
  assert.throws(() => mergeImport(existing, { nothing: true }));
});

test('buildExport per i giocatori esclude ciò che è nascosto', () => {
  const data = {
    campaignName: 'Test',
    markers: [normalizeMarker({ lat: 1, lng: 1, text: 'Visibile' }), normalizeMarker({ lat: 2, lng: 2, text: 'Segreto', hidden: true })],
    routes: [normalizeRoute({ name: 'R', points: [[0, 0], [1, 1]], hidden: true })]
  };
  const now = new Date('2026-01-02T03:04:05Z');
  const full = buildExport(data, { now });
  assert.equal(full.markers.length, 2);
  assert.equal(full.routes.length, 1);
  assert.equal(full.exportedAt, '2026-01-02T03:04:05.000Z');
  const players = buildExport(data, { forPlayers: true, now });
  assert.deepEqual(players.markers.map((m) => m.text), ['Visibile']);
  assert.equal(players.routes.length, 0);
  assert.equal('hidden' in players.markers[0], false);
});

test('normalizePlace accetta solo link alla wiki di Eberron', () => {
  const base = { name: 'Sharn', kind: 'city', lat: 7, lng: -40, zoom: 9 };
  assert.equal(normalizePlace({ ...base, wiki: 'https://eberron.fandom.com/wiki/Sharn' }, zooms).wiki, 'https://eberron.fandom.com/wiki/Sharn');
  assert.equal(normalizePlace({ ...base, wiki: 'javascript:alert(1)' }, zooms).wiki, '');
  assert.equal(normalizePlace({ ...base, wiki: 'https://evil.example/wiki/' }, zooms).wiki, '');
  assert.equal(normalizePlace(base, zooms).zoom, 7);
  assert.equal(normalizePlace({ ...base, kind: 'castle' }, zooms).kind, 'site');
  assert.equal(normalizePlace({ name: ' ', lat: 1, lng: 1 }, zooms), null);
});

test('groupPlaces, atlasRoots e countPlaces costruiscono l\'atlante', () => {
  const places = [
    { name: 'Khorvaire', kind: 'continent', parent: '' },
    { name: 'Breland', kind: 'nation', parent: 'Khorvaire' },
    { name: 'Sharn', kind: 'city', parent: 'Breland' },
    { name: 'Wroat', kind: 'capital', parent: 'Breland' },
    { name: 'Thunder Sea', kind: 'water', parent: '' },
    { name: 'Everice', kind: 'continent', parent: '' }
  ];
  const groups = groupPlaces(places);
  assert.deepEqual(groups.get('Breland').map((p) => p.name), ['Sharn', 'Wroat']);
  assert.deepEqual(groups.get(WATERS_GROUP).map((p) => p.name), ['Thunder Sea']);
  assert.deepEqual(atlasRoots(places, groups), ['Khorvaire', WATERS_GROUP]);
  assert.equal(countPlaces('Khorvaire', groups), 3);
});
