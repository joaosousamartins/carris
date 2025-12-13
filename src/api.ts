export interface Line {
    id: string;
    short_name: string;
    long_name: string;
    color: string;
    text_color: string;
    patterns: string[];
}

export interface Pattern {
    id: string;
    line_id: string;
    route_id: string;
    short_name: string;
    direction: number;
    path: {
        stop: {
            id: string;
            name: string;
            lat: string;
            lon: string;
        };
        stop_sequence: number;
    }[];
    shape_id: string;
    trips: {
        id: string;
        dates: string[];
        schedule: {
            arrival_time: string;
            stop_id: string;
            stop_sequence: number;
        }[];
    }[];
}

export interface Shape {
    geojson: {
        type: "Feature";
        geometry: {
            type: "LineString";
            coordinates: [number, number][];
        };
        properties: any;
    };
}

const API_BASE = 'https://api.carrismetropolitana.pt';

export async function fetchLines(): Promise<Line[]> {
    try {
        const response = await fetch(`${API_BASE}/lines`);
        if (!response.ok) throw new Error('Failed to fetch lines');
        return await response.json();
    } catch (error) {
        console.error('Error fetching lines:', error);
        return [];
    }
}

export async function fetchShape(shapeId: string): Promise<Shape | null> {
    try {
        const response = await fetch(`${API_BASE}/shapes/${shapeId}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Error fetching shape:', error);
        return null;
    }
}

export async function fetchPatterns(patternIds: string[]): Promise<Pattern[]> {
    try {
        const promises = patternIds.map(async (id) => {
            const response = await fetch(`${API_BASE}/patterns/${id}`);
            if (!response.ok) return null;
            return await response.json();
        });

        const results = await Promise.all(promises);
        return results.filter((p): p is Pattern => p !== null);
    } catch (error) {
        console.error('Error fetching patterns:', error);
        return [];
    }
}
