import L from 'leaflet';


let map: L.Map;
let routeLayer: L.LayerGroup;

export function initMap(elementId: string) {
    // Center on Lisbon Area roughly
    map = L.map(elementId).setView([38.7223, -9.1393], 11);

    // Force map invalidation to fix tile loading issues on mobile/resize
    setTimeout(() => {
        map.invalidateSize();
    }, 100);

    // CartoDB Voyager (clean, premium look)
    const voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    // Satellite (Esri)
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19 // Esri goes up to ~19 usually
    });

    // Default to Voyager
    voyager.addTo(map);

    // Layer Control
    const baseMaps = {
        "Rua": voyager,
        "Satélite": satellite
    };

    L.control.layers(baseMaps).addTo(map);

    routeLayer = L.layerGroup().addTo(map);

    // Hack to fix Leaflet icon issue in Vite/Webpack
    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
}

export function drawShape(geojson: any, color: string = '#FFEB00', stops: any[] = []) {
    routeLayer.clearLayers();

    // Leaflet's L.geoJSON handles GeoJSON naturally
    const layer = L.geoJSON(geojson, {
        style: {
            color: color,
            weight: 5,
            opacity: 0.8
        }
    });

    routeLayer.addLayer(layer);

    // Add Stops
    if (stops && stops.length > 0) {
        stops.forEach((s: any) => {
            if (s.stop && s.stop.lat && s.stop.lon) {
                const lat = parseFloat(s.stop.lat);
                const lon = parseFloat(s.stop.lon);

                L.circleMarker([lat, lon], {
                    radius: 5,
                    fillColor: '#fff',
                    color: '#000',
                    weight: 1.5,
                    opacity: 1,
                    fillOpacity: 1
                })
                    .bindTooltip(s.stop.name, { direction: 'top', offset: [0, -5] })
                    .addTo(routeLayer);
            }
        });
    }

    // Add Markers (Start/End)
    if (geojson.geometry && geojson.geometry.coordinates && geojson.geometry.coordinates.length > 0) {
        // ... (existing marker logic)
        const coords = geojson.geometry.coordinates;
        const start = coords[0];
        const end = coords[coords.length - 1];

        // GeoJSON is [lon, lat], Leaflet wants [lat, lon]
        const startLatLng = [start[1], start[0]] as [number, number];
        const endLatLng = [end[1], end[0]] as [number, number];

        const busIcon = L.divIcon({
            html: '<div style="font-size: 24px; line-height: 1; transform: translate(-50%, -50%);">🚌</div>',
            className: 'marker-bus',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const flagIcon = L.divIcon({
            html: '<div style="font-size: 24px; line-height: 1; transform: translate(-10%, -90%);">🏁</div>',
            className: 'marker-flag',
            iconSize: [30, 30],
            iconAnchor: [5, 25]
        });

        L.marker(startLatLng, { icon: busIcon }).addTo(routeLayer);
        L.marker(endLatLng, { icon: flagIcon }).addTo(routeLayer);
    }

    // Fit bounds with some padding
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

export function clearMap() {
    routeLayer.clearLayers();
}

export function resizeMap() {
    if (map) {
        map.invalidateSize();
    }
}
