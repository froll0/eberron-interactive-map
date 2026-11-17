// Luoghi di Eberron (data/places.json): anelli cliccabili sulla mappa,
// schede con descrizione e link alla wiki, e l'Atlante per sfogliarli.

import { MAX_ZOOM, MIN_ZOOM, PLACE_KINDS, WATERS_GROUP } from './config.js';
import { atlasRoots, countPlaces, groupPlaces, normalizePlace } from './core.js';
import { button, el, shield } from './dom.js';

export function setupPlaces(ctx) {
  const { map, panel, toast } = ctx;
  let places = [];
  let byName = new Map();
  let groups = new Map();
  let atlasAt = null; // null = primo livello
  let pending = null; // gruppo da mostrare alla prossima apertura dell'Atlante
  let failed = false;

  function subtitle(place) {
    const kind = PLACE_KINDS[place.kind].label;
    return place.parent ? `${kind}, ${place.parent}` : kind;
  }

  function note(place) {
    const root = shield(el('div', 'note'));
    root.append(el('p', 'note__kind', subtitle(place)));
    root.append(el('h3', 'note__title', place.name));
    if (place.description) root.append(el('p', 'note__text', place.description));
    if (place.wiki) {
      const link = el('a', 'note__link', 'Leggi sulla Eberron Wiki');
      link.href = place.wiki;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      root.append(link);
    }
    const actions = el('div', 'note__actions');
    actions.append(button('btn btn--ink', 'Misura da qui', () => ctx.measure.from(L.latLng(place.lat, place.lng))));
    if (groups.has(place.name)) {
      actions.append(button('btn btn--ink', 'Luoghi qui', () => {
        map.closePopup();
        openAtlas(place.name);
      }));
    }
    root.append(actions);
    return root;
  }

  function show(place) {
    map.flyTo([place.lat, place.lng], place.zoom, { duration: 0.8 });
    L.popup({ ...ctx.popupOptions, minWidth: 220, maxWidth: 300, offset: [0, -4] })
      .setLatLng([place.lat, place.lng])
      .setContent(note(place))
      .openOn(map);
  }

  function load(url) {
    return fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((raw) => {
        places = (Array.isArray(raw) ? raw : []).map((p) => normalizePlace(p, { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM })).filter(Boolean);
        byName = new Map(places.map((place) => [place.name, place]));
        groups = groupPlaces(places);
        places.filter((place) => PLACE_KINDS[place.kind].dotZoom).forEach((place) => {
          L.marker([place.lat, place.lng], {
            icon: L.divIcon({ className: `place-dot place-dot--${place.kind}`, iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -6], tooltipAnchor: [0, -8] }),
            alt: place.name,
            // Fuori dall'ordine di tabulazione: da tastiera i luoghi si
            // raggiungono con la ricerca e l'Atlante.
            keyboard: false,
            zIndexOffset: -1000 // sempre sotto i marker dell'utente
          })
            .bindTooltip(el('span', '', place.name), { direction: 'top' })
            .bindPopup(() => note(place), { ...ctx.popupOptions, minWidth: 220, maxWidth: 300 })
            .addTo(ctx.layers.placeGroup(PLACE_KINDS[place.kind].dotZoom));
        });
        ctx.layers.apply();
        panel.refresh();
      })
      .catch((e) => {
        failed = true;
        console.error('Impossibile caricare i luoghi:', e);
        toast('Elenco dei luoghi non caricato: la ricerca trova solo i tuoi marker');
        panel.refresh();
      });
  }

  // ---------------------------------------------------------------------------
  // Atlante
  // ---------------------------------------------------------------------------
  function openAtlas(name) {
    const target = name && groups.has(name) ? name : null;
    if (panel.current === 'atlas') {
      atlasAt = target;
      ctx.refs.sheetBody.scrollTop = 0;
      panel.refresh();
    } else {
      pending = target;
      panel.open('atlas');
    }
  }

  function goTo(place) {
    panel.closeIfNarrow();
    show(place);
  }

  function row(name, hint, onClick) {
    const item = el('li');
    const node = button('marker-list__btn', undefined, onClick);
    const text = el('span', 'marker-list__text');
    text.append(el('span', 'marker-list__name', name));
    if (hint) text.append(el('span', 'marker-list__kind', hint));
    node.append(text);
    item.append(node);
    return item;
  }

  const countLabel = (n) => (n === 1 ? '1 luogo' : `${n} luoghi`);

  function render(body) {
    if (!places.length) {
      body.append(el('p', 'sheet__lead', failed ? 'L\'elenco dei luoghi non è disponibile.' : 'Caricamento dei luoghi…'));
      return;
    }

    if (!atlasAt) {
      body.append(el('p', 'sheet__lead', 'Scegli un continente, poi una nazione, per vederne città, fortezze, rovine e territori.'));
      const list = el('ul', 'marker-list');
      atlasRoots(places, groups).forEach((name) => {
        list.append(row(name, countLabel(countPlaces(name, groups)), () => openAtlas(name)));
      });
      body.append(list);
      body.append(el('p', 'sheet__hint', `${places.length} luoghi. Le descrizioni riassumono la Eberron Wiki, a cui rimanda ogni scheda.`));
      return;
    }

    const here = byName.get(atlasAt);
    const up = here && here.parent ? here.parent : null;
    const nav = el('div', 'sheet__actions sheet__actions--top');
    nav.append(button('btn', up ? `Torna a ${up}` : 'Tutti i continenti', () => openAtlas(up)));
    if (here) nav.append(button('btn', 'Mostra sulla mappa', () => goTo(here)));
    body.append(nav);
    body.append(el('h3', 'sheet__title sheet__title--inline', atlasAt));
    if (here && here.description) body.append(el('p', 'sheet__lead', here.description));

    const children = groups.get(atlasAt);
    Object.keys(PLACE_KINDS).forEach((kind) => {
      const ofKind = children.filter((place) => place.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
      if (!ofKind.length) return;
      body.append(el('h3', 'sheet__heading', PLACE_KINDS[kind].plural));
      const list = el('ul', 'marker-list');
      ofKind.forEach((place) => {
        const inner = groups.has(place.name);
        const hint = inner ? `${countLabel(countPlaces(place.name, groups))}${place.description ? '. ' + place.description : ''}` : place.description;
        list.append(row(place.name, hint, inner ? () => openAtlas(place.name) : () => goTo(place)));
      });
      body.append(list);
    });
    if (atlasAt === WATERS_GROUP) body.append(el('p', 'sheet__hint', 'Mari, baie e laghi non appartengono a una nazione.'));
  }

  panel.register('atlas', {
    title: 'Atlante',
    render,
    // Dal pulsante dell'Atlante si riparte dal primo livello; da una scheda
    // ("Luoghi qui") si apre direttamente il gruppo richiesto.
    onOpen() {
      atlasAt = pending;
      pending = null;
    }
  });

  return {
    load,
    show,
    get list() { return places; },
    subtitle,
    openAtlas
  };
}
