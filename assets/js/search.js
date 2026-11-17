// Ricerca di luoghi e marker: per nome, per nazione ("breland" elenca anche i
// luoghi del Breland) e nelle descrizioni ("città delle torri" trova Sharn).

import { MARKER_TYPES, PLACE_KINDS } from './config.js';
import { rankMatches } from './core.js';
import { el, pinElement } from './dom.js';

export function setupSearch(ctx) {
  const { refs } = ctx;
  const input = refs.searchInput;
  const results = refs.searchResults;
  let matches = [];
  let active = -1;

  function candidates() {
    return [
      ...ctx.markers.entries.map((entry) => ({
        name: entry.data.text,
        description: entry.data.description,
        subtitle: `Tuo marker, ${MARKER_TYPES[entry.data.type].label.toLowerCase()}`,
        pin: entry.data.type,
        select: () => ctx.markers.focus(entry)
      })),
      ...ctx.places.list.map((place) => ({
        name: place.name,
        parent: place.parent,
        description: place.description,
        subtitle: ctx.places.subtitle(place),
        select: () => ctx.places.show(place)
      }))
    ];
  }

  // Senza testo si sfogliano continenti e nazioni.
  function browseList() {
    return ctx.places.list
      .filter((place) => PLACE_KINDS[place.kind].browse !== undefined)
      .sort((a, b) => PLACE_KINDS[a.kind].browse - PLACE_KINDS[b.kind].browse || a.name.localeCompare(b.name))
      .map((place) => ({ name: place.name, subtitle: ctx.places.subtitle(place), select: () => ctx.places.show(place) }));
  }

  function setActive(index) {
    active = index;
    results.querySelectorAll('[role="option"]').forEach((item, i) => {
      item.setAttribute('aria-selected', String(i === index));
      if (i === index) item.scrollIntoView({ block: 'nearest' });
    });
    if (index >= 0) input.setAttribute('aria-activedescendant', `searchResult${index}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function close() {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function render() {
    const query = input.value.trim();
    matches = query ? rankMatches(candidates(), query) : browseList();
    results.replaceChildren();
    if (!query && !matches.length) return close();
    if (!matches.length) results.append(el('li', 'search__empty', `Nessun luogo o marker per "${query}"`));
    matches.forEach((match, index) => {
      const item = el('li', 'search__result');
      item.id = `searchResult${index}`;
      item.setAttribute('role', 'option');
      const text = el('span', 'search__text');
      text.append(el('span', 'search__name', match.name), el('span', 'search__subtitle', match.subtitle));
      item.append(match.pin ? pinElement(match.pin) : el('span', 'search__dot'), text);
      // mousedown: così la scelta avviene prima che il campo perda il focus.
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        choose(index);
      });
      results.append(item);
    });
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(query && matches.length ? 0 : -1);
  }

  function choose(index) {
    const match = matches[index];
    if (!match) return;
    // Il campo si svuota: alla prossima apertura si riparte dall'elenco.
    input.value = '';
    close();
    input.blur();
    ctx.panel.closeIfNarrow();
    match.select();
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!matches.length) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const from = active < 0 && step < 0 ? 0 : active;
      setActive((from + step + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(Math.max(active, 0));
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      input.blur();
    }
  });
}
