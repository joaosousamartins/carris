import './style.css';
import { fetchLines, fetchPatterns, fetchShape } from './api';
import type { Line, Pattern, Shape } from './api';
import { initMap, drawShape, clearMap, resizeMap } from './map';
import { downloadGPX } from './gpx';

interface TripData {
  trip: Pattern['trips'][0];
  pattern: Pattern;
  startTime: string;
}

const state = {
  lines: [] as Line[],
  selectedLine: null as Line | null,
  selectedPattern: null as Pattern | null,
  selectedShape: null as Shape | null,
  selectedTrip: null as Pattern['trips'][0] | null,
  patterns: [] as Pattern[],
  date: new Date().toISOString().split('T')[0],
  time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  direction: 0 // 0: Ida, 1: Volta
};

// DOM Elements
const searchInput = document.getElementById('line-search') as HTMLInputElement;
const resultsList = document.getElementById('results-list') as HTMLDivElement;
const downloadSection = document.getElementById('download-section') as HTMLDivElement;
const btnDownload = document.getElementById('btn-download-gpx') as HTMLButtonElement;
const datePicker = document.getElementById('date-picker') as HTMLInputElement;
// const timePicker = document.getElementById('time-picker') as HTMLInputElement;
const clockEl = document.getElementById('clock') as HTMLDivElement;

function init() {
  initMap('map');

  // Set initial date/time
  datePicker.value = state.date;
  // timePicker.value = state.time;

  // Clock ticker
  setInterval(() => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }, 1000);

  // Load Lines and Handle Deep Linking
  handleStartup();

  // Event Listeners
  searchInput.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase();
    renderLines(state.lines.filter(l =>
      l.short_name.toLowerCase().includes(query) ||
      l.long_name.toLowerCase().includes(query)
    ));
  });

  btnDownload.addEventListener('click', () => {
    if (state.selectedPattern && state.selectedShape) {
      const includeStops = (document.getElementById('gpx-include-stops') as HTMLInputElement).checked;
      // User request: Line Number + Variation (Pattern ID)
      const filename = `${state.selectedLine?.short_name}_${state.selectedPattern.id}.gpx`;
      downloadGPX(state.selectedPattern, state.selectedShape, filename, includeStops);
    }
  });

  // Update state on inputs
  datePicker.addEventListener('change', (e) => {
    state.date = (e.target as HTMLInputElement).value;
    updateScheduleView();
  });

  /*
  timePicker.addEventListener('change', (e) => {
    state.time = (e.target as HTMLInputElement).value;
  });
  */

  // Handle browser back/forward
  window.addEventListener('popstate', handleStartup);

  // Fix map size on resize (keyboard open/close, rotation)
  window.addEventListener('resize', () => {
    resizeMap();
  });
}

async function handleStartup() {
  const params = new URLSearchParams(window.location.search);
  const lineId = params.get('line');
  const patternId = params.get('active_pattern_id');

  // Load lines if not already loaded (or reload clean)
  // Ideally we only load once, but for simplicity:
  if (state.lines.length === 0) {
    await loadLines();
  }

  if (lineId) {
    const line = state.lines.find(l => l.short_name === lineId || l.id === lineId);
    if (line) {
      // Only select if not already selected to avoid loops/re-renders
      if (state.selectedLine?.id !== line.id) {
        await selectLine(line, false); // false = don't push state again
      }

      if (patternId) {
        // We need to wait for patterns to load (selectLine awaits fetchPatterns)
        const pattern = state.patterns.find(p => p.id === patternId);
        if (pattern) {
          // Find a trip for this pattern to select it
          // We need to simulate selecting it or just set state
          // For now, let's try to find a trip that matches or just first one
          // Ideally we need a robust way to select a pattern without a specific trip context
          // But selectTrip expects a TripData wrapper.

          // Let's Find the first trip of this pattern
          const trip = pattern.trips[0];
          if (trip) {
            const tripData = {
              trip: trip,
              pattern: pattern,
              startTime: trip.schedule[0]?.arrival_time || '00:00:00'
            };
            // We might need to switch direction view if pattern is Volta
            if (pattern.direction !== state.direction) {
              state.direction = pattern.direction;
              renderSchedules(); // Re-render to show correct list
            }

            // Reuse selectTrip logic but don't update URL (it's already there)
            await selectTrip(tripData, null, false);
          }
        }
      }
    } else {
      // No line in URL, reset view if needed?
      if (state.selectedLine) {
        state.selectedLine = null;
        loadLines();
        clearMap();
        downloadSection.style.display = 'none';
      }
    }
  }
}


function updateURL(lineId?: string, patternId?: string) {
  const params = new URLSearchParams();
  if (lineId) params.set('line', lineId);
  if (patternId) params.set('active_pattern_id', patternId);

  // mimic carris style params optionally if we want more
  // params.set('active_waypoint_stop_id', ...); 

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({ path: newUrl }, '', newUrl);
}

async function loadLines(): Promise<Line[]> {
  resultsList.innerHTML = '<div class="empty-state">A carregar linhas...</div>';
  state.lines = await fetchLines();
  renderLines(state.lines);
  return state.lines;
}

function renderLines(lines: Line[]) {
  resultsList.innerHTML = '';

  if (lines.length === 0) {
    resultsList.innerHTML = '<div class="empty-state"><p>Nenhuma linha encontrada</p></div>';
    return;
  }

  const displayLines = searchInput.value ? lines : lines.slice(0, 50);

  displayLines.forEach(line => {
    const el = document.createElement('div');
    el.className = 'line-card';
    el.innerHTML = `
      <div class="line-header">
        <span class="line-number" style="background-color: ${line.color}; color: ${line.text_color}">${line.short_name}</span>
        <span class="line-name">${line.long_name}</span>
      </div>
    `;
    el.addEventListener('click', () => selectLine(line));
    resultsList.appendChild(el);
  });
}

async function selectLine(line: Line, updateUrl: boolean = true) {
  state.selectedLine = line;
  state.selectedPattern = null;
  state.selectedTrip = null;
  state.selectedShape = null;
  state.direction = 0; // Reset to default direction
  downloadSection.style.display = 'none';
  clearMap();

  resultsList.innerHTML = '<div class="empty-state">A carregar horários...</div>';
  state.patterns = await fetchPatterns(line.patterns);

  if (updateUrl) updateURL(line.short_name);
  renderSchedules();
}

function renderSchedules() {
  resultsList.innerHTML = '';

  // Header Back Button
  const backBtn = document.createElement('div');
  backBtn.className = 'line-card';
  backBtn.style.textAlign = 'center';
  backBtn.style.fontWeight = 'bold';
  backBtn.innerHTML = '<i class="ph ph-arrow-left"></i> Voltar às Linhas';
  backBtn.addEventListener('click', () => {
    state.selectedLine = null;
    loadLines();
    clearMap();
    downloadSection.style.display = 'none';
    updateURL(); // clear URL
  });
  resultsList.appendChild(backBtn);

  // Line Info
  const header = document.createElement('div');
  header.style.padding = '10px 20px';
  header.innerHTML = `<strong>${state.selectedLine?.short_name}</strong> - ${state.date}`;
  resultsList.appendChild(header);

  // Direction Selector
  const dirContainer = document.createElement('div');
  dirContainer.style.display = 'flex';
  dirContainer.style.margin = '0 20px 10px 20px';
  dirContainer.style.background = '#e0e0e0';
  dirContainer.style.borderRadius = '8px';
  dirContainer.style.overflow = 'hidden';

  // Helper to get destination name
  const getDestinationName = (dir: number) => {
    const dirPatterns = state.patterns.filter(p => p.direction === dir);
    if (dirPatterns.length === 0) return dir === 0 ? 'Ida' : 'Volta';

    const counts: Record<string, number> = {};

    dirPatterns.forEach(p => {
      if (p.path && p.path.length > 0) {
        const lastStop = p.path[p.path.length - 1].stop.name;
        // Weigh by number of trips to find the "main" destination
        const weight = p.trips ? p.trips.length : 1;
        counts[lastStop] = (counts[lastStop] || 0) + weight;
      }
    });

    let bestName = dir === 0 ? 'Ida' : 'Volta';
    let maxCount = -1;

    for (const [name, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        bestName = name;
      }
    }

    return bestName;
  };

  const labelIda = getDestinationName(0);
  const labelVolta = getDestinationName(1);

  const btnIda = document.createElement('button');
  btnIda.textContent = labelIda;
  btnIda.style.flex = '1';
  btnIda.style.padding = '8px';
  btnIda.style.border = 'none';
  btnIda.style.cursor = 'pointer';
  btnIda.style.fontWeight = '600';
  btnIda.style.whiteSpace = 'nowrap';
  btnIda.style.overflow = 'hidden';
  btnIda.style.textOverflow = 'ellipsis';
  btnIda.style.background = state.direction === 0 ? (state.selectedLine?.color || '#000') : 'transparent';
  btnIda.style.color = state.direction === 0 ? (state.selectedLine?.text_color || '#fff') : '#666';

  const btnVolta = document.createElement('button');
  btnVolta.textContent = labelVolta;
  btnVolta.style.flex = '1';
  btnVolta.style.padding = '8px';
  btnVolta.style.border = 'none';
  btnVolta.style.cursor = 'pointer';
  btnVolta.style.fontWeight = '600';
  btnVolta.style.whiteSpace = 'nowrap';
  btnVolta.style.overflow = 'hidden';
  btnVolta.style.textOverflow = 'ellipsis';
  btnVolta.style.background = state.direction === 1 ? (state.selectedLine?.color || '#000') : 'transparent';
  btnVolta.style.color = state.direction === 1 ? (state.selectedLine?.text_color || '#fff') : '#666';

  btnIda.addEventListener('click', () => { state.direction = 0; renderSchedules(); });
  btnVolta.addEventListener('click', () => { state.direction = 1; renderSchedules(); });

  // Only append if we actually have patterns for that direction? 
  // For now show both, but maybe disable if no patterns? 
  // Let's keep simpler logic: Check if any pattern exists for that direction
  const hasIda = state.patterns.some(p => p.direction === 0);
  const hasVolta = state.patterns.some(p => p.direction === 1);

  if (hasIda) dirContainer.appendChild(btnIda);
  if (hasVolta) dirContainer.appendChild(btnVolta);

  if (dirContainer.children.length > 0) {
    resultsList.appendChild(dirContainer);
  }

  const dateStr = state.date.replace(/-/g, '');

  // Flatten all trips filtered by direction
  const allTrips: TripData[] = [];

  state.patterns.forEach(pattern => {
    // Filter by direction
    if (pattern.direction !== state.direction) return;

    pattern.trips.forEach(trip => {
      if (trip.dates.includes(dateStr)) {
        // Find first stop time for sorting
        // Assuming schedule is sorted by sequence, but safeguards are good
        const firstStop = trip.schedule[0]; // simplistic
        if (firstStop) {
          allTrips.push({
            trip,
            pattern,
            startTime: firstStop.arrival_time
          });
        }
      }
    });
  });

  if (allTrips.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.innerHTML = `<p>Sem horários para esta direção em ${state.date}</p>`;
    resultsList.appendChild(msg);
    return;
  }

  // Sort by time
  allTrips.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Render
  allTrips.forEach(item => {
    const el = document.createElement('div');
    el.className = 'line-card';
    if (state.selectedTrip && state.selectedTrip.id === item.trip.id) {
      el.classList.add('active');
    }

    // Format Time 
    const time = item.startTime.substring(0, 5); // HH:MM:SS -> HH:MM
    const direction = item.pattern.direction === 0 ? 'Ida' : 'Volta';
    const headsign = item.pattern.short_name || direction;

    el.innerHTML = `
      <div class="line-header">
        <span class="line-number" style="font-size: 14px; width: auto; padding: 2px 8px;">${time}</span>
        <span class="line-name">${headsign}</span>
      </div>
      <div class="line-route">
        <small>Variação: ${item.pattern.id}</small>
      </div>
    `;
    el.addEventListener('click', () => selectTrip(item, el));
    resultsList.appendChild(el);
  });
}

async function selectTrip(data: TripData, element: HTMLElement | null, updateUrl: boolean = true) {
  state.selectedTrip = data.trip;
  state.selectedPattern = data.pattern;

  // UI Feedback
  document.querySelectorAll('.line-card').forEach(el => el.classList.remove('active'));
  if (element) element.classList.add('active');

  if (updateUrl) updateURL(state.selectedLine?.short_name, data.pattern.id);

  // Fetch and Draw Shape
  // Check if shape matches current to avoid refetch?
  // But different patterns might share shape_id? 
  // Let's just fetch, it's fast enough or cached by browser

  const shape = await fetchShape(data.pattern.shape_id);
  if (shape) {
    state.selectedShape = shape;
    drawShape(shape.geojson, state.selectedLine?.color || '#FFEB00', state.selectedPattern?.path);
    downloadSection.style.display = 'block';
  } else {
    console.error('Shape not found for pattern', data.pattern.id);
    // Maybe clear map?
    clearMap();
  }
}

function updateScheduleView() {
  if (state.selectedLine) {
    renderSchedules();
  }
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
