// Misura di distanze e tempi di viaggio, con percorsi salvati nella campagna.

import { LIMITS, TRAVEL_MODES } from './config.js';
import { formatTravelTime } from './core.js';
import { button, el } from './dom.js';

const STYLE = { color: '#b3262b', weight: 3, dashArray: '1,7', lineCap: 'round' };

export function setupMeasure(ctx) {
  const { map, panel, store, toast } = ctx;
  const state = {
    active: false,
    points: [],
    layer: L.layerGroup(),
    line: L.polyline([], STYLE),
    preview: L.polyline([], { ...STYLE, opacity: 0.55, interactive: false }),
    // Su schermi stretti la tabella parte chiusa per non coprire la mappa.
    showTimes: !ctx.narrow.matches,
    saving: false
  };

  const routeMiles = (points) => points.slice(1).reduce((total, point, i) => total + ctx.milesBetween(points[i], point), 0);
  const milesLabel = (miles) => `${Math.round(miles).toLocaleString('it-IT')} miglia`;

  function draw() {
    state.line.setLatLngs(state.points);
    state.layer.clearLayers();
    state.line.addTo(state.layer);
    state.preview.setLatLngs([]).addTo(state.layer);
    state.points.forEach((point) => {
      L.circleMarker(point, { radius: 5, color: '#f1e6c8', weight: 2, fillColor: '#b3262b', fillOpacity: 1, interactive: false }).addTo(state.layer);
    });
  }

  function update() {
    draw();
    panel.refresh();
  }

  function onClick(e) {
    state.points.push(e.latlng);
    state.saving = false;
    update();
  }

  // Su desktop una linea tratteggiata segue il mouse fino al prossimo punto.
  function onMove(e) {
    const last = state.points[state.points.length - 1];
    state.preview.setLatLngs(last ? [last, e.latlng] : []);
  }

  function start() {
    if (state.active) return;
    map.closePopup();
    Object.assign(state, { active: true, points: [], saving: false });
    state.layer.addTo(map);
    map.on('click', onClick);
    map.on('mousemove', onMove);
    map.doubleClickZoom.disable();
    map.getContainer().classList.add('is-measuring');
    draw();
  }

  function stop() {
    if (!state.active) return;
    Object.assign(state, { active: false, points: [], saving: false });
    map.removeLayer(state.layer);
    map.off('click', onClick);
    map.off('mousemove', onMove);
    map.doubleClickZoom.enable();
    map.getContainer().classList.remove('is-measuring');
  }

  // Avvia una misura con il primo punto già fissato (da un luogo o un marker).
  function from(latlng) {
    panel.open('measure');
    state.points = [latlng];
    update();
  }

  function showRoute(route) {
    state.points = route.points.map(([lat, lng]) => L.latLng(lat, lng));
    state.saving = false;
    update();
    // Il pannello resta aperto: su telefono copre la parte bassa dello schermo,
    // quindi lì il percorso si inquadra lasciando più spazio sotto.
    const bottom = ctx.narrow.matches ? Math.round(window.innerHeight * 0.55) : 60;
    map.flyToBounds(L.latLngBounds(state.points), { paddingTopLeft: [40, 80], paddingBottomRight: [40, bottom], maxZoom: 6, duration: 0.8 });
  }

  function deleteRoute(index) {
    const routes = [...store.current.routes];
    const [removed] = routes.splice(index, 1);
    store.setRoutes(routes);
    panel.refresh();
    toast(`Percorso eliminato: ${removed.name}`, {
      label: 'Annulla',
      run() {
        const restored = [...store.current.routes];
        restored.splice(Math.min(index, restored.length), 0, removed);
        store.setRoutes(restored);
        panel.refresh();
      }
    });
  }

  function renderSaveForm(body) {
    const form = el('form', 'inline-form inline-form--stack');
    const name = el('input', 'field__input field__input--dark');
    name.maxLength = LIMITS.name;
    name.placeholder = 'Nome del percorso, per esempio "Da Sharn a Wroat"';
    name.setAttribute('aria-label', 'Nome del percorso');
    const hidden = el('input');
    hidden.type = 'checkbox';
    const hiddenRow = el('label', 'check check--dark');
    hiddenRow.append(hidden, el('span', '', 'Nascondi ai giocatori'));
    const actions = el('div', 'sheet__actions');
    const submit = el('button', 'btn btn--accent', 'Salva percorso');
    submit.type = 'submit';
    actions.append(submit, button('btn', 'Annulla', () => { state.saving = false; panel.refresh(); }));
    form.append(name, hiddenRow, actions);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (store.current.routes.length >= LIMITS.routes) return toast(`Puoi salvare al massimo ${LIMITS.routes} percorsi per campagna`);
      const routeName = name.value.trim() || 'Percorso senza nome';
      store.setRoutes([...store.current.routes, { name: routeName, points: state.points.map((p) => [p.lat, p.lng]), hidden: hidden.checked }]);
      state.saving = false;
      panel.refresh();
      toast(`Percorso salvato: ${routeName}`);
    });
    body.append(form);
    setTimeout(() => name.focus(), 0);
  }

  function render(body) {
    const count = state.points.length;
    const miles = routeMiles(state.points);

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
      details.open = state.showTimes;
      details.addEventListener('toggle', () => { state.showTimes = details.open; });
      details.append(el('summary', '', 'Tempi di viaggio'));
      const table = el('table', 'measure__table');
      TRAVEL_MODES.forEach((mode) => {
        const row = el('tr');
        const head = el('th', '', mode.label);
        head.scope = 'row';
        row.append(head, el('td', '', formatTravelTime(miles, mode)));
        table.append(row);
      });
      details.append(table, el('p', 'sheet__hint', 'Stime sul percorso tracciato. Navi, aeronavi e lightning rail viaggiano giorno e notte.'));
      body.append(details);
    }

    if (state.saving && count >= 2) {
      renderSaveForm(body);
    } else {
      const actions = el('div', 'sheet__actions sheet__actions--wrap');
      const undo = button('btn', 'Togli ultima tappa', () => { state.points.pop(); update(); });
      const reset = button('btn', 'Ricomincia', () => { state.points = []; update(); });
      const save = button('btn btn--accent', 'Salva percorso', () => { state.saving = true; panel.refresh(); });
      undo.disabled = reset.disabled = !count;
      save.disabled = count < 2;
      actions.append(undo, reset, save);
      body.append(actions);
    }

    const routes = store.current.routes;
    if (routes.length) {
      body.append(el('h3', 'sheet__heading', `Percorsi salvati (${routes.length})`));
      const list = el('ul', 'marker-list');
      routes.forEach((route, index) => {
        const item = el('li', 'route');
        const open = button('marker-list__btn', undefined, () => showRoute(route));
        const text = el('span', 'marker-list__text');
        text.append(el('span', 'marker-list__name', route.name),
          el('span', 'marker-list__kind', milesLabel(routeMiles(route.points)) + (route.hidden ? ', nascosto ai giocatori' : '')));
        open.append(text);
        const del = button('icon-btn route__delete', undefined, () => deleteRoute(index));
        del.setAttribute('aria-label', `Elimina il percorso ${route.name}`);
        del.title = 'Elimina';
        del.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg>';
        item.append(open, del);
        list.append(item);
      });
      body.append(list);
    }
  }

  panel.register('measure', { title: 'Misura un percorso', render, onOpen: start, onClose: stop });

  return {
    from,
    // Dopo un cambio di campagna: azzera la misura in corso e aggiorna l'elenco.
    loadRoutes() {
      state.points = [];
      state.saving = false;
      if (state.active) draw();
      panel.refresh();
    }
  };
}
