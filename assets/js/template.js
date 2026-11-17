// Struttura fissa dell'interfaccia. È markup statico, senza dati dell'utente.
// I comandi vengono prima della mappa: da tastiera si raggiungono subito,
// senza passare per centinaia di segnaposto.

const ICONS = {
  search: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4.5 4.5"/>',
  close: '<path d="M5 5l10 10M15 5 5 15"/>',
  atlas: '<path d="M4 5.5 9.5 4l5 1.5L20 4v14.5L14.5 20l-5-1.5L4 20Z"/><path d="M9.5 4v14.5M14.5 5.5V20"/>',
  markers: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  measure: '<circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="5.5" r="2"/><path d="M7 17 17 7" stroke-dasharray="2.5 3"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>'
};

const dockButton = (tool, label) => `
      <button class="dock__btn" type="button" data-tool="${tool}" aria-expanded="false" aria-controls="sheet">
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[tool]}</svg>
        <span>${label}</span>
      </button>`;

const MARKUP = `
  <div id="searchBox" class="search">
    <div class="search__bar">
      <h1 class="search__brand">Eberron</h1>
      <label for="searchInput" class="visually-hidden">Cerca un luogo o un marker</label>
      <svg class="search__icon" viewBox="0 0 20 20" aria-hidden="true">${ICONS.search}</svg>
      <input id="searchInput" class="search__input" type="search" role="combobox" aria-expanded="false"
        aria-controls="searchResults" aria-autocomplete="list" autocomplete="off" spellcheck="false"
        placeholder="Cerca luoghi e marker" />
    </div>
    <ul id="searchResults" class="search__results" role="listbox" aria-label="Risultati della ricerca" tabindex="-1" hidden></ul>
  </div>

  <nav class="dock" aria-label="Strumenti della mappa">${dockButton('atlas', 'Atlante')}${dockButton('markers', 'Marker')}${dockButton('measure', 'Misura')}${dockButton('layers', 'Livelli')}
    <button class="dock__btn" type="button" id="copyLink">
      <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.link}</svg>
      <span>Copia link</span>
    </button>
  </nav>

  <section id="sheet" class="sheet" aria-labelledby="sheetTitle" hidden>
    <header class="sheet__header">
      <h2 id="sheetTitle" class="sheet__title" tabindex="-1"></h2>
      <button id="sheetClose" class="icon-btn" type="button" aria-label="Chiudi pannello">
        <svg viewBox="0 0 20 20" aria-hidden="true">${ICONS.close}</svg>
      </button>
    </header>
    <div id="sheetBody" class="sheet__body"></div>
  </section>

  <div id="banner" class="banner" role="status" hidden>
    <span id="bannerText"></span>
    <button id="bannerCancel" class="btn btn--quiet" type="button">Annulla</button>
  </div>

  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>

  <div id="scale" class="scale" aria-hidden="true">
    <span id="scaleLabel"></span>
    <span id="scaleBar" class="scale__bar"></span>
  </div>

  <input id="importFile" type="file" accept="application/json,.json" hidden />

  <div id="map" class="map" role="region" aria-label="Mappa di Eberron"></div>
`;

export function buildChrome(container) {
  container.classList.add('app');
  container.innerHTML = MARKUP;
  const $ = (id) => container.querySelector(`#${id}`);
  return {
    container,
    map: $('map'),
    searchBox: $('searchBox'),
    searchInput: $('searchInput'),
    searchResults: $('searchResults'),
    dock: container.querySelector('.dock'),
    dockButtons: [...container.querySelectorAll('.dock__btn[data-tool]')],
    copyLink: $('copyLink'),
    sheet: $('sheet'),
    sheetTitle: $('sheetTitle'),
    sheetBody: $('sheetBody'),
    sheetClose: $('sheetClose'),
    banner: $('banner'),
    bannerText: $('bannerText'),
    bannerCancel: $('bannerCancel'),
    toast: $('toast'),
    scaleLabel: $('scaleLabel'),
    scaleBar: $('scaleBar'),
    importFile: $('importFile')
  };
}
