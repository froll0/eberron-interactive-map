# Eberron Interactive Map

This project is a **community-driven fork** of [eberronmap.johnarcadian.com](https://eberronmap.johnarcadian.com).

The goal is to create an open, collaborative, and extensible interactive map for the Eberron campaign setting, with features tailored for D&D and other tabletop RPGs. The map is designed to be embedded as the "map" feature of the upcoming web software **World of D&D**, and works on its own as a static site.

## Why this fork?

- The original project is not open source and does not accept public contributions.
- This fork aims to be fully open to the community, welcoming contributions, feature requests, and improvements from everyone.

## Features

- Full-screen map with a search box, a toolbar and a single side panel (a bottom sheet on phones)
- 571 Eberron places with short descriptions and links to the Eberron Wiki
- **Atlas** to browse places by continent, nation and type
- **Search** by name, by nation ("breland" also lists Breland's places) and in descriptions ("città delle torri" finds Sharn)
- **Campaigns**: separate sets of markers and routes, created, renamed and deleted from the Marker panel
- **Markers** in six types (party, city, village, dungeon, monster, note) with name and notes. They stay put on the map and move only with "Sposta"; moving and deleting can be undone
- **Hidden markers and routes**: "Esporta per i giocatori" produces a file without them, to hand to your players
- **Measuring tool** with multi-leg routes and travel times (on foot, ship, airship, lightning rail); routes can be saved in the campaign
- **Legend** of the symbols drawn on the map, in the Layers panel
- **Shareable links**: the address always reflects the current view (`#zoom/lat/lng`)
- **Export and import** campaigns as JSON
- Keyboard and screen-reader friendly controls; no build step and no external requests

Data is stored in the browser (`localStorage`). There is no server yet, so campaigns are not synchronised between devices or between game master and players: share them by exporting and importing files.

## Running locally

The site is fully static: serve the repository root with any web server.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. A web server is required, because the code is made of ES modules and the places list is loaded with `fetch`: browsers block both when the page is opened directly from disk.

Add `?debug` to the address to get developer tools in the Layers panel (the tile grid).

## Code structure

There is nothing to compile. `index.html` only calls `initMap`; everything else is in `assets/`:

| File | Contents |
| --- | --- |
| `js/map.js` | `initMap(container, options)`: builds the map inside any element and wires the modules |
| `js/config.js` | zoom levels, map bounds, scale, travel speeds, marker and place types |
| `js/core.js` | pure logic with no DOM or Leaflet: search ranking, travel times, view links, import/export, atlas grouping |
| `js/storage.js` | campaigns, markers, routes and preferences, on any `getItem`/`setItem` backend |
| `js/markers.js`, `js/places.js`, `js/measure.js`, `js/search.js`, `js/layers.js`, `js/panel.js` | one feature each |
| `js/template.js`, `js/dom.js` | static markup and small DOM helpers |
| `map.css` | all styles; colours and fonts are CSS variables at the top |

### Embedding

```html
<link rel="stylesheet" href="assets/leaflet.css" />
<link rel="stylesheet" href="assets/map.css" />
<script src="assets/leaflet.js" defer></script>
<div id="map-feature" style="height: 600px"></div>
<script type="module">
  import { initMap } from './assets/js/map.js';
  initMap(document.getElementById('map-feature'), {
    syncUrl: false,          // do not write the view into the page address
    storage: myServerStore,  // any object with getItem(key) and setItem(key, value)
    placesUrl: 'data/places.json',
    tilesUrl: 'eberron/{z}/{x}/{y}.jpg'
  });
</script>
```

The `storage` option is where a future server backend plugs in: the map only ever calls `getItem` and `setItem` with JSON strings.

### Tests

The tests use Node's built-in runner (Node 20 or newer), with no dependencies to install:

```bash
npm test
```

They cover the pure logic in `core.js`, the campaign storage, and the consistency of `data/places.json` (unique names, valid kinds, parents that exist, coordinates inside the map). GitHub Actions runs them on every push and pull request.

## Places data

[`data/places.json`](data/places.json) holds 571 places: every settlement, fortress, ruin, forest, mountain range, island and sea labelled on the map, across all continents. Each entry looks like this:

```json
{
  "name": "Sharn",
  "kind": "city",
  "parent": "Breland",
  "lat": 7.3407,
  "lng": -40.7593,
  "zoom": 6,
  "description": "La Città delle Torri: la più popolosa del Khorvaire, in cima a una scogliera sopra la foce del Dagger.",
  "wiki": "https://eberron.fandom.com/wiki/Sharn"
}
```

- `kind` is one of `continent`, `nation`, `region`, `capital`, `city`, `town`, `village`, `fort`, `ruin`, `site`, `volcano`, `island`, `forest`, `mountains` or `water`. Settlements and sites get a clickable ring on the map (cities from zoom 5, the rest from zoom 6); the other kinds are reachable from the search and the atlas.
- `parent` is the nation or continent the place belongs to, and drives the atlas.
- `zoom` is the zoom level used when the place is selected.
- `description` and `wiki` are optional. About half of the places have a description: it is a short Italian summary of the introduction of the linked [Eberron Wiki](https://eberron.fandom.com) article. Places without an article there have only name, kind and position.

Coordinates were read by hand from the map tiles and checked against the map's own labels. To add a place, navigate to it, read its coordinates from the address bar, and run `npm test` to check the file.

Travel speeds for the measuring tool are defined in `TRAVEL_MODES` in `assets/js/config.js`.

## Deployment

`.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main`, after running the tests. It needs a one-time setting in the repository: **Settings > Pages > Build and deployment > Source: GitHub Actions**.

## Contributing

Pull requests and suggestions are welcome!  
If you have ideas for new features, bug fixes, or want to help with documentation, feel free to open an issue or submit a PR. Please run `npm test` before opening a pull request.

## Credits

- Original map concept and tiles: [eberronmap.johnarcadian.com](https://eberronmap.johnarcadian.com)
- Map engine: [Leaflet](https://leafletjs.com/) 1.9 (BSD 2-Clause, see `assets/LEAFLET-LICENSE.txt`)
- Place descriptions summarise articles of the [Eberron Wiki](https://eberron.fandom.com)
- Typefaces: [Marcellus](https://fonts.google.com/specimen/Marcellus) and [Alegreya Sans](https://fonts.google.com/specimen/Alegreya+Sans), both under the SIL Open Font License (see `assets/fonts/`)

## License

The repository mixes material under different terms, and the MIT License does not cover all of it:

- **Code** (`index.html`, `assets/js/`, `assets/map.css`, `tests/`, workflows): MIT License, see [`LICENSE`](LICENSE).
- **Map imagery** (`eberron/`): the map of Eberron is not original to this project. Eberron and its maps are owned by Wizards of the Coast; the tiles come from the original site credited above. They are **not** covered by the MIT License, and their use relies on the rights holders' policies for fan content.
- **Place descriptions** (`description` fields in `data/places.json`): summaries of Eberron Wiki articles, whose text is published under [CC BY-SA](https://www.fandom.com/licensing). Each place links back to its article.
- **Leaflet** and the **typefaces** keep their own licences, included in `assets/`.

Eberron, Dungeons & Dragons and their logos are trademarks of Wizards of the Coast. This is an unofficial fan project, not approved or endorsed by Wizards of the Coast.
