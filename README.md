# Eberron Interactive Map

This project is a **community-driven fork** of [eberronmap.johnarcadian.com](https://eberronmap.johnarcadian.com).

The goal is to create an open, collaborative, and extensible interactive map for the Eberron campaign setting, with features tailored for D&D and other tabletop RPGs.

This project is also developing a user interface inspired by World of Warcraft. The map will be included as the "map" feature in the upcoming web software **World of D&D**.

## Why this fork?

- The original project is not open source and does not accept public contributions.
- This fork aims to be fully open to the community, welcoming contributions, feature requests, and improvements from everyone.

## Features

- Full-screen map with a search box, a four-button toolbar and a single side panel (a bottom sheet on phones)
- Search for Eberron places (continents, nations, major cities) and your own markers; focus the empty box to browse continents and nations
- Campaign markers in six types (party, city, village, dungeon, monster, note) with name, notes, drag-to-move, and a list to jump between them
- Toggleable layers: the places overlay and each marker type
- Measuring tool with multi-leg routes and travel-time estimates (on foot, ship, airship, lightning rail), startable from any place or marker
- Shareable links: the URL always reflects the current view (`#zoom/lat/lng`)
- Export and import markers as JSON, to back them up or share them with your players
- Markers are stored locally in the browser (`localStorage`)
- No build step and no external requests: Leaflet and the fonts are vendored in `assets/`

### Places data

Places live in [`data/places.json`](data/places.json). Each entry looks like this:

```json
{
  "name": "Sharn",
  "kind": "city",
  "parent": "Breland",
  "lat": 7.3407,
  "lng": -40.7593,
  "zoom": 6,
  "description": "La Città delle Torri, la più grande del Khorvaire."
}
```

`kind` is one of `continent`, `nation`, `region`, `capital`, `city` or `site`; `zoom` is the zoom level used when the place is selected from the search. To find the coordinates of a new place, navigate to it and read them from the address bar. The list currently covers the continents, the nations of Khorvaire and about 45 major settlements: additions are very welcome.

Travel speeds for the measuring tool are defined in `TRAVEL_MODES` at the top of `assets/map.js`.

## Running locally

The site is fully static: serve the repository root with any web server.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. A web server is required: the places list is loaded with `fetch`, which browsers block when the page is opened directly from disk.

### Editing the interface

There is nothing to compile. The page is `index.html`, the behaviour is `assets/map.js` and all styles are in `assets/map.css`, where the colours and fonts are defined once as CSS variables at the top.

## Contributing

Pull requests and suggestions are welcome!  
If you have ideas for new features, bug fixes, or want to help with documentation, feel free to open an issue or submit a PR.

## Credits

- Original map concept and tiles: [eberronmap.johnarcadian.com](https://eberronmap.johnarcadian.com)
- Map engine: [Leaflet](https://leafletjs.com/) 1.9 (BSD 2-Clause, see `assets/LEAFLET-LICENSE.txt`)
- Typefaces: [Marcellus](https://fonts.google.com/specimen/Marcellus) and [Alegreya Sans](https://fonts.google.com/specimen/Alegreya+Sans), both under the SIL Open Font License (see `assets/fonts/`)

## License

This project is released under the MIT License.
