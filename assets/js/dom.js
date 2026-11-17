// Piccoli aiuti per costruire l'interfaccia.

import { MARKER_TYPES } from './config.js';
import { getMarkerType } from './core.js';

// Crea un elemento. Il testo passa sempre da textContent, mai da innerHTML:
// il contenuto scritto dall'utente non viene mai interpretato come HTML.
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className, label, onClick) {
  const node = el('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

// Impedisce che i clic dentro un pannello o una scheda arrivino alla mappa.
// Serve fermarli qui: molti pulsanti sostituiscono il proprio contenuto, e
// Leaflet non riconosce più come "suoi" i clic su elementi già rimossi.
export function shield(node) {
  node.addEventListener('click', (e) => e.stopPropagation());
  return node;
}

// Disegno del segnaposto. È una stringa costruita solo da costanti di
// config.js: non contiene mai testo dell'utente.
export function pinSvg(type, { hidden = false } = {}) {
  const safe = getMarkerType(type);
  return `<svg class="pin pin--${safe}${hidden ? ' pin--hidden' : ''}" viewBox="0 0 32 42" aria-hidden="true" focusable="false">` +
    '<path class="pin__body" d="M16 40.5C16 40.5 3.5 26.5 3.5 15.5a12.5 12.5 0 0 1 25 0C28.5 26.5 16 40.5 16 40.5Z"/>' +
    `<path class="pin__glyph" transform="translate(8 7.5)" d="${MARKER_TYPES[safe].glyph}"/></svg>`;
}

export function pinElement(type, options) {
  const wrap = el('span', 'pin-wrap');
  wrap.innerHTML = pinSvg(type, options);
  return wrap;
}

// Icona a tratto da un elenco di percorsi SVG (costanti del codice).
export function icon(paths, viewBox = '0 0 20 20') {
  const wrap = el('span', 'icon');
  wrap.innerHTML = `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
  return wrap.firstChild;
}

// Notifica breve, con un'azione facoltativa (per esempio "Annulla").
export function createToaster(node) {
  let timer = null;
  return function toast(text, action) {
    clearTimeout(timer);
    node.replaceChildren(el('span', '', text));
    if (action) {
      node.append(button('toast__action', action.label, () => {
        node.hidden = true;
        action.run();
      }));
    }
    node.classList.toggle('toast--action', Boolean(action));
    node.hidden = false;
    timer = setTimeout(() => { node.hidden = true; }, action ? 7000 : 4000);
  };
}
