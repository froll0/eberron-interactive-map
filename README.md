# Eberron Interactive Map

This project is a **community-driven fork** of [eberronmap.johnarcadian.com](https://eberronmap.johnarcadian.com).

The goal is to create an open, collaborative, and extensible interactive map for the Eberron campaign setting, with features tailored for D&D and other tabletop RPGs.

This project is also developing a user interface inspired by World of Warcraft. The map will be included as the "map" feature in the upcoming web software **World of D&D**.

## Why this fork?

- The original project is not open source and does not accept public contributions.
- This fork aims to be fully open to the community, welcoming contributions, feature requests, and improvements from everyone.

## Features

- Interactive marker creation (cities, monsters, dungeons, villages, etc.), with editable name, type and description and drag-to-move
- Custom tooltips and marker types
- Ruler tool for measuring distances
- Responsive UI (mobile and desktop)
- Local marker persistence (at the moment only localStorage)
- Modern UI with Tailwind CSS and Leaflet

## Running locally

The site is fully static: serve the repository root with any web server.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

### Editing styles

Tailwind is compiled ahead of time into `assets/tailwind.css`, which is committed, so no build step is needed just to run the map. If you add or change Tailwind classes in `index.html` or `assets/map.js`, regenerate it (requires Node.js):

```bash
npm install
npm run build:css
```

Styles for map controls, markers and popups live in `assets/map.css` and need no build.

## Contributing

Pull requests and suggestions are welcome!  
If you have ideas for new features, bug fixes, or want to help with documentation, feel free to open an issue or submit a PR.

## Credits

- Original map concept and tiles: [eberronmap.johnarcadian.com](https://eberronmap.johnarcadian.com)
- Built with [Leaflet](https://leafletjs.com/) and [Tailwind CSS](https://tailwindcss.com/)

## License

This project is released under the MIT License.
