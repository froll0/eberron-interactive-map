// Il pannello unico (a sinistra su desktop, dal basso su telefono) che
// ospita Atlante, Marker, Misura e Livelli. Ogni strumento registra il
// proprio contenuto con panel.register().

export function setupPanel(ctx) {
  const { refs } = ctx;
  const sheets = new Map();
  let current = null;
  let opener = null;

  const panel = {
    get current() {
      return current;
    },
    register(tool, { title, render, onOpen, onClose }) {
      sheets.set(tool, { title, render, onOpen, onClose });
    },
    refresh() {
      if (!current) return;
      const scroll = refs.sheetBody.scrollTop;
      const body = document.createDocumentFragment();
      sheets.get(current).render(body);
      refs.sheetBody.replaceChildren(body);
      refs.sheetBody.scrollTop = scroll;
    },
    open(tool, { focus = true } = {}) {
      if (current === tool) return;
      if (current) panel.close({ restoreFocus: false });
      const sheet = sheets.get(tool);
      current = tool;
      ctx.banner.cancel && ctx.banner.cancel();
      if (sheet.onOpen) sheet.onOpen();
      refs.sheetTitle.textContent = sheet.title;
      refs.sheet.dataset.sheet = tool;
      refs.sheet.hidden = false;
      refs.sheetBody.scrollTop = 0;
      panel.refresh();
      sync();
      // Il focus va sul titolo, così chi usa la tastiera o un lettore di
      // schermo arriva subito al contenuto del pannello.
      if (focus) refs.sheetTitle.focus({ preventScroll: true });
    },
    close({ restoreFocus = true } = {}) {
      if (!current) return;
      const sheet = sheets.get(current);
      const focusInside = refs.sheet.contains(document.activeElement);
      current = null;
      if (sheet.onClose) sheet.onClose();
      refs.sheet.hidden = true;
      sync();
      // Riporta il focus al pulsante che aveva aperto il pannello, ma solo se
      // era dentro il pannello: se l'utente è già altrove, non lo spostiamo.
      if (restoreFocus && focusInside && opener) opener.focus({ preventScroll: true });
    },
    // Chiude il pannello solo su telefono, dove copre la mappa.
    closeIfNarrow() {
      if (ctx.narrow.matches) panel.close({ restoreFocus: false });
    }
  };

  function sync() {
    refs.dockButtons.forEach((btn) => btn.setAttribute('aria-expanded', String(btn.dataset.tool === current)));
  }

  refs.dockButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (current === btn.dataset.tool) {
        panel.close();
      } else {
        opener = btn;
        panel.open(btn.dataset.tool);
      }
    });
  });
  refs.sheetClose.addEventListener('click', () => panel.close());
  return panel;
}
