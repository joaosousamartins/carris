import type { Pattern, Shape } from './api';

export function downloadGPX(pattern: Pattern, shape: Shape, filename?: string, includeStops: boolean = false) {
    const gpxData = createGPX(pattern, shape, includeStops);
    const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${pattern.line_id}_${pattern.id}.gpx`;
    a.click();
    // @ts-ignore
    document.body.removeChild(a); // Fix removal if not appended
    URL.revokeObjectURL(url);
}

function createGPX(pattern: Pattern, shape: Shape, includeStops: boolean): string {
    const coords = shape.geojson.geometry.coordinates;

    // Header
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
    gpx += '<gpx version="1.1" creator="CarrisDriverApp" xmlns="http://www.topografix.com/GPX/1/1">\n';
    gpx += `  <metadata>\n    <name>${pattern.short_name || pattern.id}</name>\n  </metadata>\n`;

    // Waypoints (Stops)
    if (includeStops && pattern.path) {
        pattern.path.forEach(p => {
            if (p.stop && p.stop.lat && p.stop.lon) {
                gpx += `  <wpt lat="${p.stop.lat}" lon="${p.stop.lon}">\n`;
                gpx += `    <name>${p.stop.name}</name>\n`;
                gpx += `    <desc>Stop Sequence: ${p.stop_sequence}</desc>\n`;
                gpx += '  </wpt>\n';
            }
        });
    }

    // Track
    gpx += '  <trk>\n';
    gpx += `    <name>${pattern.short_name} (${pattern.direction === 0 ? 'Ida' : 'Volta'})</name>\n`;
    gpx += '    <trkseg>\n';

    // Points
    // GeoJSON is [lon, lat], GPX expects lat, lon
    for (const [lon, lat] of coords) {
        gpx += `      <trkpt lat="${lat}" lon="${lon}"></trkpt>\n`;
    }

    gpx += '    </trkseg>\n';
    gpx += '  </trk>\n';
    gpx += '</gpx>';

    return gpx;
}
