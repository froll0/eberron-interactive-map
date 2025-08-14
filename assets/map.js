// Leaflet setup
const minZoom = 1;
const maxZoom = 7;
const tileSize = 256;

var fullmap = L.tileLayer('eberron/{z}/{x}/{y}.jpg', {
  minZoom, maxZoom, tileSize,
  updateWhenZooming: false,
  updateWhenIdle: true,
  keepBuffer: 8,
  continuousWorld: !1,
  noWrap: !0
})

var eberronmap = L.map('map', {
  minZoom, maxZoom,
  worldCopyJump: false,
  layers: [fullmap],
  zoomControl: !1,
  attributionControl: !1
}).setView([20.009428770699756, .07578125], 3.5);

var baseMaps = {
    "Full Map": fullmap
};

L.control.zoom({
    position: "topright"
}).addTo(eberronmap);

var ruleroptions = {
    position: "topright",
    lengthUnit: {
        factor: 3.233,
        display: "miles",
        decimal: 0
    }
};

// Add ruler control directly to map
L.control.ruler(ruleroptions).addTo(eberronmap);

const markerIcons = {
  city: L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  }),
  monster: L.icon({
    iconUrl: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47e.png", // 👾
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  dungeon: L.icon({
    iconUrl: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3f0.png", // 🏰
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  village: L.icon({
    iconUrl: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3e1.png", // 🏡
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  other: L.icon({
    iconUrl: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4cd.png", // 📍
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  })
};

let markerMode = false;
let markerType = "city";
let markers = [];

// Carica marker da localStorage all'avvio
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('eberronMarkers');
  if (saved) {
    try {
      const arr = JSON.parse(saved);
      arr.forEach(m => {
        const marker = L.marker([m.lat, m.lng], {
          icon: markerIcons[m.type] || markerIcons.other
        })
          .addTo(eberronmap)
          .bindTooltip(m.text, { permanent: false, direction: 'top' })
          .bindPopup(`
            <div class="text-sm">
              <strong>${m.text}</strong><br>
              Tipo: ${getMarkerTypeLabel(m.type)}<br>
              Lat: ${m.lat.toFixed(4)}<br>
              Lng: ${m.lng.toFixed(4)}<br>
              <button onclick="removeMarker(${markers.length})" class="mt-2 px-2 py-1 bg-red-600 text-white rounded text-xs">
                Rimuovi marker
              </button>
            </div>
          `);
        markers.push(marker);
      });
    } catch (e) {
      console.error('Errore nel parsing dei marker salvati:', e);
    }
  }
});

// Salva tutti i marker attuali su localStorage
function saveMarkersToLocalStorage() {
  const arr = [];
  markers.forEach(m => {
    if (m && m.getLatLng) {
      arr.push({
        lat: m.getLatLng().lat,
        lng: m.getLatLng().lng,
        text: m.getTooltip().getContent(),
        type: Object.keys(markerIcons).find(key => m.options.icon === markerIcons[key]) || "other"
      });
    }
  });
  localStorage.setItem('eberronMarkers', JSON.stringify(arr));
}

// HUD bindings
const hudZoom = document.getElementById('hudZoom');
const hudTile = document.getElementById('hudTile');
const statusEl = document.getElementById('status');

function latLngToTileXY(lat, lng, z) {
  const p = eberronmap.project([lat, lng], z);
  return { x: Math.floor(p.x / tileSize), y: Math.floor(p.y / tileSize) };
}

function refreshHUD(e) {
  const z = eberronmap.getZoom();
  const center = eberronmap.getCenter();
  const t = latLngToTileXY(center.lat, center.lng, z);
  hudZoom.textContent = `z ${z}`;
  hudTile.textContent = `x ${t.x}, y ${t.y}`;
}

eberronmap.on('moveend zoomend', refreshHUD);
refreshHUD();

// Marker menu logic
const markerMenuBtn = document.getElementById('toggleMarkerMenu');
const markerMenuDropdown = document.getElementById('markerMenuDropdown');
const markerMenuText = document.getElementById('markerMenuText');

function setMarkerMode(type) {
  markerMode = true;
  markerType = type;
  markerMenuBtn.classList.add('bg-emerald-600', 'border-emerald-500');
  markerMenuBtn.classList.remove('bg-white/5', 'border-white/15');
  markerMenuText.textContent = `Aggiungi: ${getMarkerTypeLabel(type)}`;
  statusEl.textContent = `Clicca sulla mappa per aggiungere un marker "${getMarkerTypeLabel(type)}"`;
}

function resetMarkerMode() {
  markerMode = false;
  markerMenuBtn.classList.remove('bg-emerald-600', 'border-emerald-500');
  markerMenuBtn.classList.add('bg-white/5', 'border-white/15');
  markerMenuText.textContent = 'Aggiungi marker';
  statusEl.textContent = 'Pronto';
}

function getMarkerTypeLabel(type) {
  switch (type) {
    case "city": return "Città";
    case "monster": return "Posizione Mostro";
    case "dungeon": return "Dungeon";
    case "village": return "Villaggio";
    case "other": return "Altro";
    default: return "Altro";
  }
}

// Dropdown show/hide on click (mobile friendly)
markerMenuBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  markerMenuDropdown.classList.toggle('hidden');
});

// Dropdown hide on click outside
document.addEventListener('click', (e) => {
  if (!markerMenuBtn.contains(e.target) && !markerMenuDropdown.contains(e.target)) {
    markerMenuDropdown.classList.add('hidden');
  }
});

// Marker type selection
document.querySelectorAll('.marker-type-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const type = btn.getAttribute('data-marker-type');
    setMarkerMode(type);
    markerMenuDropdown.classList.add('hidden');
  });
});

// Map click for marker creation
eberronmap.on('click', function(e) {
  if (markerMode) {
    const label = getMarkerTypeLabel(markerType);
    const defaultText = `Nuovo marker: ${label}`;
    const customText = prompt(`Inserisci il testo per il tooltip del marker "${label}":`, defaultText);
    if (customText !== null) {
      const marker = L.marker([e.latlng.lat, e.latlng.lng], {
        icon: markerIcons[markerType] || markerIcons.other
      })
        .addTo(eberronmap)
        .bindTooltip(customText, { permanent: false, direction: 'top' })
        .bindPopup(`
          <div class="text-sm">
            <strong>${customText}</strong><br>
            Tipo: ${label}<br>
            Lat: ${e.latlng.lat.toFixed(4)}<br>
            Lng: ${e.latlng.lng.toFixed(4)}<br>
            <button onclick="removeMarker(${markers.length})" class="mt-2 px-2 py-1 bg-red-600 text-white rounded text-xs">
              Rimuovi marker
            </button>
          </div>
        `);
      markers.push(marker);
      saveMarkersToLocalStorage();
      statusEl.textContent = `Marker aggiunto: ${customText}`;
      resetMarkerMode();
    }
  }
});

// Function to remove marker
window.removeMarker = function(index) {
  if (markers[index]) {
    eberronmap.removeLayer(markers[index]);
    markers[index] = null;
    saveMarkersToLocalStorage();
    statusEl.textContent = 'Marker rimosso';
  }
};

// Reset view
document.getElementById('resetView').addEventListener('click', (e) => {
  console.log('Reset view button clicked');
  e.preventDefault();
  e.stopPropagation();
  eberronmap.setView([20.009428770699756, .07578125], 3.5);
});

// Grid overlay
let gridLayer = null;
function buildGrid() {
  const CanvasGrid = L.GridLayer.extend({
    createTile: function (coords) {
      const tile = L.DomUtil.create('canvas', 'leaflet-tile');
      tile.width = tileSize;
      tile.height = tileSize;
      const ctx = tile.getContext('2d');
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, tileSize, tileSize);
      ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`z${coords.z} x${coords.x} y${coords.y}`, 8, 20);
      return tile;
    }
  });
  return new CanvasGrid({ tileSize, pane: 'overlayPane', opacity: 1 });
}

document.getElementById('toggleGrid').addEventListener('click', (e) => {
  console.log('Grid button clicked');
  e.preventDefault();
  e.stopPropagation();
  if (gridLayer) { eberronmap.removeLayer(gridLayer); gridLayer = null; }
  else { gridLayer = buildGrid(); gridLayer.addTo(eberronmap); }
});

// Basic tile load status
fullmap.on('tileloadstart', () => statusEl.textContent = 'Caricamento…');
fullmap.on('load', () => statusEl.textContent = 'Pronto');
fullmap.on('tileerror', () => statusEl.textContent = 'Alcune tile non trovate');

// Map navigation function
function markerFunction(r) {
    // Check if linkarray exists
    if (typeof linkarray !== 'undefined') {
        for (var a in linkarray) {
            if (linkarray[a].options.title == r) return linkarray[a].openPopup(), linkarray[a]
        }
    }
    return null;
}

// Check if map-navigation element exists before assigning onclick
var mapNavigation = document.getElementById("map-navigation");
if (mapNavigation) {
    mapNavigation.onclick = function(r) {
        var a = r.target.getAttribute("data-position"),
            e = r.target.getAttribute("data-zoom"),
            o = r.target.getAttribute("data-marker");
        if (a && e) {
            var t = a.split(","),
                i = parseInt(e);
            eberronmap.setView(t, i, {
                animation: !0
            });
            var n = markerFunction(o);
            return n && !n.getPopup().isOpen() && (n.on("popupclose", function() {
                n.removeFrom(eberronmap)
            }), n.addTo(eberronmap).openPopup()), !1
        }
    };
}
