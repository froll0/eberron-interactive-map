import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CampaignStore, memoryBackend } from '../assets/js/storage.js';

test('alla prima apertura c\'è una campagna vuota', () => {
  const store = new CampaignStore(memoryBackend());
  assert.equal(store.campaigns.length, 1);
  assert.equal(store.current.name, 'La mia campagna');
  assert.deepEqual(store.current.markers, []);
});

test('i marker della versione precedente vengono migrati', () => {
  const backend = memoryBackend({ eberronMarkers: JSON.stringify([{ lat: 1, lng: 2, text: 'Vecchio', type: 'city' }, { lat: 'x' }]) });
  const store = new CampaignStore(backend);
  assert.equal(store.current.markers.length, 1);
  assert.equal(store.current.markers[0].text, 'Vecchio');
});

test('campagne: crea, seleziona, rinomina, elimina, e tutto resta salvato', () => {
  const backend = memoryBackend();
  const store = new CampaignStore(backend);
  const first = store.current.id;
  store.setMarkers([{ lat: 1, lng: 1, text: 'A' }]);
  const second = store.create('Seconda');
  assert.equal(store.current.id, second.id);
  assert.deepEqual(store.current.markers, []);
  store.setRoutes([{ name: 'R', points: [[0, 0], [1, 1]] }]);
  store.rename(second.id, 'Rinominata');

  const reopened = new CampaignStore(backend);
  assert.equal(reopened.campaigns.length, 2);
  assert.equal(reopened.current.name, 'Rinominata');
  assert.equal(reopened.current.routes.length, 1);
  reopened.select(first);
  assert.equal(reopened.current.markers[0].text, 'A');

  reopened.remove(first);
  reopened.remove(second.id);
  assert.equal(reopened.campaigns.length, 1, 'l\'ultima campagna viene sostituita da una vuota');
});

test('un backend che non salva non fa crollare nulla', () => {
  const broken = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
  const store = new CampaignStore(broken);
  assert.equal(store.campaigns.length, 1);
  assert.equal(store.setMarkers([{ lat: 1, lng: 1, text: 'A' }]), false);
  assert.equal(store.current.markers.length, 1);
});
