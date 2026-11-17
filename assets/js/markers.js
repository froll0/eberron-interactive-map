// Marker della campagna: creazione, modifica, spostamento, eliminazione con
// possibilità di annullare, campagne multiple, esportazione e importazione.

import { LIMITS, MARKER_TYPES } from './config.js';
import { buildExport, getMarkerType, mergeImport } from './core.js';
import { button, el, pinElement, pinSvg, shield } from './dom.js';

export function setupMarkers(ctx) {
  const { map, store, panel, refs, toast } = ctx;
  const entries = []; // { data, layer, draft }
  let placingType = null;
  let campaignForm = null; // null | 'new' | 'rename' | 'delete'

  const icon = (data) => L.divIcon({
    className: 'map-pin',
    html: pinSvg(data.type, { hidden: data.hidden }),
    iconSize: [32, 42],
    iconAnchor: [16, 41],
    popupAnchor: [0, -38],
    tooltipAnchor: [0, -38]
  });
  const label = (text) => el('span', '', text);

  function save() {
    if (!store.setMarkers(entries.map((entry) => entry.data))) {
      toast('Marker non salvati: lo spazio del browser non è disponibile');
    }
    panel.refresh();
  }

  // ---------------------------------------------------------------------------
  // Schede
  // ---------------------------------------------------------------------------
  function viewNote(entry) {
    const { data } = entry;
    const root = shield(el('div', 'note'));
    root.append(el('p', 'note__kind', MARKER_TYPES[data.type].label + (data.hidden ? ', nascosto ai giocatori' : '')));
    root.append(el('h3', 'note__title', data.text));
    if (data.description) root.append(el('p', 'note__text', data.description));
    const actions = el('div', 'note__actions');
    actions.append(
      button('btn btn--ink', 'Modifica', () => showEdit(entry)),
      button('btn btn--ink', 'Sposta', () => startMoving(entry)),
      button('btn btn--ink', 'Misura da qui', () => ctx.measure.from(entry.layer.getLatLng())),
      button('btn btn--danger', 'Elimina', () => remove(entry))
    );
    root.append(actions);
    return root;
  }

  function field(text, control) {
    const node = el('label', 'field');
    node.append(el('span', 'field__label', text), control);
    return node;
  }

  function editNote(entry) {
    const { data } = entry;
    const isNew = entry.draft;
    const form = shield(el('form', 'note note--form'));
    form.noValidate = true;

    const name = el('input', 'field__input');
    name.type = 'text';
    name.maxLength = LIMITS.name;
    name.value = data.text;
    name.placeholder = 'Come si chiama?';

    const type = el('select', 'field__input');
    Object.keys(MARKER_TYPES).forEach((key) => {
      const option = el('option', '', MARKER_TYPES[key].label);
      option.value = key;
      option.selected = key === data.type;
      type.append(option);
    });

    const notes = el('textarea', 'field__input');
    notes.rows = 3;
    notes.maxLength = LIMITS.description;
    notes.value = data.description;
    notes.placeholder = 'Appunti per la campagna (facoltativi)';

    const hidden = el('input');
    hidden.type = 'checkbox';
    hidden.checked = data.hidden;
    const hiddenRow = el('label', 'check');
    hiddenRow.append(hidden, el('span', '', 'Nascondi ai giocatori'));

    const error = el('p', 'note__error');
    error.setAttribute('role', 'alert');

    const actions = el('div', 'note__actions');
    const submit = el('button', 'btn btn--primary', isNew ? 'Aggiungi marker' : 'Salva');
    submit.type = 'submit';
    actions.append(submit, button('btn btn--ink', 'Annulla', () => {
      if (isNew) entry.layer.closePopup(); // la chiusura scarta la bozza
      else showView(entry);
    }));
    form.append(field('Nome', name), field('Tipo', type), field('Note', notes), hiddenRow, error, actions);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = name.value.trim();
      if (!text) {
        error.textContent = 'Scrivi un nome per il marker.';
        name.focus();
        return;
      }
      Object.assign(data, { text, type: getMarkerType(type.value), description: notes.value.trim(), hidden: hidden.checked });
      entry.draft = false;
      if (!entries.includes(entry)) entries.push(entry);
      refreshLayer(entry);
      ctx.layers.setVisible(`marker:${data.type}`, true);
      save();
      showView(entry);
      toast(isNew ? `Marker aggiunto: ${text}` : `Marker salvato: ${text}`);
    });

    // Il focus va dato dopo che Leaflet ha inserito la scheda nel DOM.
    setTimeout(() => { name.focus(); name.select(); }, 0);
    return form;
  }

  function showView(entry) {
    entry.layer.setPopupContent(viewNote(entry));
    if (!entry.layer.isPopupOpen()) entry.layer.openPopup();
  }

  function showEdit(entry) {
    entry.layer.setPopupContent(editNote(entry));
    if (!entry.layer.isPopupOpen()) entry.layer.openPopup();
  }

  function refreshLayer(entry) {
    entry.layer.setIcon(icon(entry.data));
    entry.layer.setTooltipContent(label(entry.data.text));
    entry.layer.options.alt = entry.data.text;
  }

  // ---------------------------------------------------------------------------
  // Creazione, spostamento, eliminazione
  // ---------------------------------------------------------------------------
  // I marker sono fermi: su telefono trascinare la mappa partendo da un marker
  // lo spostava per sbaglio. Si spostano con "Sposta", e si può annullare.
  function createEntry(data, { draft = false } = {}) {
    const layer = L.marker([data.lat, data.lng], { icon: icon(data), draggable: false, autoPan: true, alt: data.text });
    const entry = { data, layer, draft };
    layer.bindTooltip(label(data.text), { direction: 'top' });
    layer.bindPopup('', { ...ctx.popupOptions, minWidth: 264, maxWidth: 300 });
    // Il contenuto viene ricostruito a ogni apertura, così è sempre aggiornato.
    layer.on('popupopen', () => {
      layer.closeTooltip();
      if (!entry.draft) layer.setPopupContent(viewNote(entry));
    });
    // Una bozza chiusa senza salvare viene scartata.
    layer.on('popupclose', () => {
      if (entry.draft) map.removeLayer(layer);
    });
    if (draft || ctx.layers.isVisible(`marker:${data.type}`)) layer.addTo(map);
    return entry;
  }

  function addEntry(data, index = entries.length) {
    const entry = createEntry(data);
    entries.splice(index, 0, entry);
    return entry;
  }

  function remove(entry) {
    const index = entries.indexOf(entry);
    if (index === -1) return;
    entries.splice(index, 1);
    map.removeLayer(entry.layer);
    save();
    toast(`Marker eliminato: ${entry.data.text}`, {
      label: 'Annulla',
      run() {
        addEntry(entry.data, Math.min(index, entries.length));
        save();
        ctx.layers.apply();
      }
    });
  }

  function startMoving(entry) {
    map.closePopup();
    stopPlacing();
    const from = entry.layer.getLatLng();
    entry.layer.dragging.enable();
    L.DomUtil.addClass(entry.layer.getElement(), 'map-pin--moving');
    const finish = () => {
      entry.layer.dragging.disable();
      const element = entry.layer.getElement();
      if (element) L.DomUtil.removeClass(element, 'map-pin--moving');
      entry.layer.off('dragend', onDrop);
      ctx.banner.hide();
    };
    const onDrop = () => {
      finish();
      const { lat, lng } = entry.layer.getLatLng();
      Object.assign(entry.data, { lat, lng });
      save();
      toast(`Marker spostato: ${entry.data.text}`, {
        label: 'Annulla',
        run() {
          entry.layer.setLatLng(from);
          Object.assign(entry.data, { lat: from.lat, lng: from.lng });
          save();
        }
      });
    };
    entry.layer.on('dragend', onDrop);
    ctx.banner.show(`Trascina "${entry.data.text}" nella nuova posizione`, finish);
  }

  function startPlacing(type) {
    panel.close({ restoreFocus: false });
    map.closePopup();
    placingType = getMarkerType(type);
    ctx.banner.show(`Tocca la mappa per posizionare: ${MARKER_TYPES[placingType].label}`, stopPlacing);
    map.getContainer().classList.add('is-placing');
  }

  function stopPlacing() {
    if (!placingType) return;
    placingType = null;
    ctx.banner.hide();
    map.getContainer().classList.remove('is-placing');
  }

  map.on('click', (e) => {
    if (!placingType) return;
    const entry = createEntry({ lat: e.latlng.lat, lng: e.latlng.lng, text: '', description: '', type: placingType, hidden: false }, { draft: true });
    stopPlacing();
    showEdit(entry);
  });

  function focus(entry) {
    ctx.layers.setVisible(`marker:${entry.data.type}`, true);
    map.flyTo(entry.layer.getLatLng(), Math.max(map.getZoom(), 5), { duration: 0.8 });
    map.once('moveend', () => entry.layer.openPopup());
  }

  // Sostituisce i marker sulla mappa con quelli della campagna attiva.
  function load() {
    entries.splice(0).forEach((entry) => map.removeLayer(entry.layer));
    store.current.markers.forEach((data) => addEntry({ ...data }));
    ctx.layers.apply();
  }

  // ---------------------------------------------------------------------------
  // Esportazione e importazione
  // ---------------------------------------------------------------------------
  function download(forPlayers) {
    const campaign = store.current;
    const payload = buildExport({ campaignName: campaign.name, markers: entries.map((e) => e.data), routes: campaign.routes }, { forPlayers });
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = el('a');
    const slug = campaign.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campagna';
    link.href = url;
    link.download = `eberron-${slug}${forPlayers ? '-giocatori' : ''}-${payload.exportedAt.slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const count = payload.markers.length;
    toast(`${count === 1 ? 'Esportato 1 marker' : `Esportati ${count} marker`}${forPlayers ? ' visibili ai giocatori' : ''}`);
  }

  refs.importFile.addEventListener('change', () => {
    const file = refs.importFile.files[0];
    refs.importFile.value = ''; // permette di reimportare lo stesso file
    if (!file) return;
    if (file.size > LIMITS.importBytes) {
      toast('File troppo grande: il limite è 2 MB');
      return;
    }
    file.text()
      .then((text) => {
        const merged = mergeImport({ markers: entries.map((e) => e.data), routes: store.current.routes }, JSON.parse(text));
        merged.markers.slice(entries.length).forEach((data) => addEntry(data));
        store.setRoutes(merged.routes);
        save();
        ctx.layers.apply();
        const ignored = merged.skipped ? ` (${merged.skipped === 1 ? '1 voce ignorata' : `${merged.skipped} voci ignorate`}: doppie o non valide)` : '';
        const added = merged.added === 1 ? '1 voce importata' : `${merged.added} voci importate`;
        toast(merged.added ? `${added} in "${store.current.name}"${ignored}` : `Niente di nuovo nel file${ignored}`);
      })
      .catch(() => toast('Importazione non riuscita: scegli un file esportato da questa mappa'));
  });

  // ---------------------------------------------------------------------------
  // Pannello
  // ---------------------------------------------------------------------------
  function renderCampaign(body) {
    const campaign = store.current;
    body.append(el('h3', 'sheet__heading', 'Campagna'));

    if (campaignForm === 'new' || campaignForm === 'rename') {
      const form = el('form', 'inline-form');
      const input = el('input', 'field__input field__input--dark');
      input.maxLength = LIMITS.name;
      input.value = campaignForm === 'rename' ? campaign.name : '';
      input.placeholder = 'Nome della campagna';
      input.setAttribute('aria-label', 'Nome della campagna');
      const submit = el('button', 'btn btn--accent', campaignForm === 'new' ? 'Crea' : 'Salva');
      submit.type = 'submit';
      form.append(input, submit, button('btn', 'Annulla', () => { campaignForm = null; panel.refresh(); }));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameValue = input.value.trim();
        if (!nameValue) return input.focus();
        if (campaignForm === 'new') {
          if (!store.create(nameValue)) return toast(`Puoi avere al massimo ${LIMITS.campaigns} campagne`);
          load();
          ctx.measure.loadRoutes();
          toast(`Campagna creata: ${nameValue}`);
        } else {
          store.rename(campaign.id, nameValue);
        }
        campaignForm = null;
        panel.refresh();
      });
      body.append(form);
      setTimeout(() => input.focus(), 0);
      return;
    }

    if (campaignForm === 'delete') {
      const box = el('div', 'confirm');
      const n = campaign.markers.length;
      box.append(el('p', '', `Eliminare "${campaign.name}" con ${n === 1 ? 'il suo marker' : `i suoi ${n} marker`} e i percorsi salvati? Non si può annullare.`));
      const actions = el('div', 'sheet__actions');
      actions.append(
        button('btn btn--danger-dark', 'Elimina campagna', () => {
          store.remove(campaign.id);
          campaignForm = null;
          load();
          ctx.measure.loadRoutes();
          toast(`Campagna eliminata: ${campaign.name}`);
          panel.refresh();
        }),
        button('btn', 'Annulla', () => { campaignForm = null; panel.refresh(); })
      );
      box.append(actions);
      body.append(box);
      return;
    }

    const row = el('div', 'campaign');
    const select = el('select', 'field__input field__input--dark');
    select.setAttribute('aria-label', 'Campagna attiva');
    store.campaigns.forEach((c) => {
      const option = el('option', '', c.name);
      option.value = c.id;
      option.selected = c.id === campaign.id;
      select.append(option);
    });
    select.addEventListener('change', () => {
      store.select(select.value);
      load();
      ctx.measure.loadRoutes();
      panel.refresh();
      toast(`Campagna attiva: ${store.current.name}`);
    });
    row.append(select);
    const actions = el('div', 'campaign__actions');
    actions.append(
      button('btn btn--small', 'Nuova', () => { campaignForm = 'new'; panel.refresh(); }),
      button('btn btn--small', 'Rinomina', () => { campaignForm = 'rename'; panel.refresh(); }),
      button('btn btn--small btn--danger-dark', 'Elimina', () => { campaignForm = 'delete'; panel.refresh(); })
    );
    row.append(actions);
    body.append(row);
  }

  function render(body) {
    renderCampaign(body);

    body.append(el('h3', 'sheet__heading', 'Aggiungi un marker'));
    const types = el('div', 'type-grid');
    Object.keys(MARKER_TYPES).forEach((type) => {
      const choice = button('type-grid__btn', undefined, () => startPlacing(type));
      choice.append(pinElement(type), el('span', '', MARKER_TYPES[type].label));
      types.append(choice);
    });
    body.append(types);

    body.append(el('h3', 'sheet__heading', entries.length ? `I tuoi marker (${entries.length})` : 'I tuoi marker'));
    if (!entries.length) {
      body.append(el('p', 'sheet__lead', 'Ancora nessun marker. Scegli un tipo qui sopra e tocca la mappa per segnare un luogo della campagna.'));
    } else {
      const list = el('ul', 'marker-list');
      [...entries].sort((a, b) => a.data.text.localeCompare(b.data.text)).forEach((entry) => {
        const item = el('li');
        const row = button('marker-list__btn', undefined, () => {
          panel.closeIfNarrow();
          focus(entry);
        });
        const text = el('span', 'marker-list__text');
        text.append(el('span', 'marker-list__name', entry.data.text),
          el('span', 'marker-list__kind', MARKER_TYPES[entry.data.type].label + (entry.data.hidden ? ', nascosto' : '')));
        row.append(pinElement(entry.data.type, { hidden: entry.data.hidden }), text);
        item.append(row);
        list.append(item);
      });
      body.append(list);
    }

    body.append(el('h3', 'sheet__heading', 'Condividi'));
    const actions = el('div', 'sheet__actions sheet__actions--wrap');
    const all = button('btn', 'Esporta tutto', () => download(false));
    const players = button('btn', 'Esporta per i giocatori', () => download(true));
    all.disabled = players.disabled = !entries.length && !store.current.routes.length;
    actions.append(all, players, button('btn', 'Importa', () => refs.importFile.click()));
    body.append(actions, el('p', 'sheet__hint',
      'I dati restano in questo browser: esportali per conservarli. La versione per i giocatori esclude i marker e i percorsi nascosti.'));
  }

  panel.register('markers', {
    title: 'Marker',
    render,
    onClose() { campaignForm = null; }
  });

  return { entries, load, focus, stopPlacing };
}
