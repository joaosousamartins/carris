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
  direction: 0, // 0: Ida, 1: Volta
  viewMode: 'pattern' as 'schedule' | 'pattern'
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

function findClosestDate(targetDate: string, availableDates: string[]): string {
  if (availableDates.length === 0) return targetDate;
  // availableDates is sorted YYYYMMDD
  const pastOrEqualDates = availableDates.filter(d => d <= targetDate);
  if (pastOrEqualDates.length > 0) {
    return pastOrEqualDates[pastOrEqualDates.length - 1]; // Latest past date
  }
  return availableDates[0]; // Earliest future date
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

  // Mode Selector (Schedule vs Pattern)
  const modeContainer = document.createElement('div');
  modeContainer.style.display = 'flex';
  modeContainer.style.margin = '0 20px 10px 20px';
  modeContainer.style.background = '#f0f0f0';
  modeContainer.style.borderRadius = '8px';
  modeContainer.style.padding = '4px';
  modeContainer.style.gap = '4px';

  const btnSchedule = document.createElement('button');
  btnSchedule.innerHTML = '<i class="ph ph-clock"></i> Horário';
  btnSchedule.style.flex = '1';
  btnSchedule.style.padding = '6px';
  btnSchedule.style.border = 'none';
  btnSchedule.style.borderRadius = '6px';
  btnSchedule.style.cursor = 'pointer';
  btnSchedule.style.fontSize = '13px';
  btnSchedule.style.fontWeight = '600';
  btnSchedule.style.background = state.viewMode === 'schedule' ? '#fff' : 'transparent';
  btnSchedule.style.boxShadow = state.viewMode === 'schedule' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none';
  btnSchedule.style.color = state.viewMode === 'schedule' ? '#000' : '#666';

  const btnPattern = document.createElement('button');
  btnPattern.innerHTML = '<i class="ph ph-git-branch"></i> Variante';
  btnPattern.style.flex = '1';
  btnPattern.style.padding = '6px';
  btnPattern.style.border = 'none';
  btnPattern.style.borderRadius = '6px';
  btnPattern.style.cursor = 'pointer';
  btnPattern.style.fontSize = '13px';
  btnPattern.style.fontWeight = '600';
  btnPattern.style.background = state.viewMode === 'pattern' ? '#fff' : 'transparent';
  btnPattern.style.boxShadow = state.viewMode === 'pattern' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none';
  btnPattern.style.color = state.viewMode === 'pattern' ? '#000' : '#666';

  btnSchedule.addEventListener('click', () => { state.viewMode = 'schedule'; renderSchedules(); });
  btnPattern.addEventListener('click', () => { state.viewMode = 'pattern'; renderSchedules(); });

  modeContainer.appendChild(btnSchedule);
  modeContainer.appendChild(btnPattern);
  resultsList.appendChild(modeContainer);

  if (state.viewMode === 'pattern') {
    renderPatterns();
    return;
  }

  const dateStr = state.date.replace(/-/g, '');

  const availableDates = new Set<string>();
  const getTripsForDate = (targetDate: string) => {
    const trips: TripData[] = [];
    state.patterns.forEach(pattern => {
      if (pattern.direction !== state.direction) return;
      pattern.trips.forEach(trip => {
        if (trip.dates.includes(targetDate)) {
          const firstStop = trip.schedule[0];
          if (firstStop) {
            trips.push({
              trip,
              pattern,
              startTime: firstStop.arrival_time
            });
          }
        }
        // Collect all dates for fallback
        if (pattern.direction === state.direction) {
          trip.dates.forEach(d => availableDates.add(d));
        }
      });
    });
    return trips;
  };

  let allTrips = getTripsForDate(dateStr);
  let isFallback = false;
  let fallbackDateDisplay = '';

  if (allTrips.length === 0 && availableDates.size > 0) {
    const sortedDates = Array.from(availableDates).sort();
    const fallbackDateStr = findClosestDate(dateStr, sortedDates);
    if (fallbackDateStr !== dateStr) {
      allTrips = getTripsForDate(fallbackDateStr);
      isFallback = true;
      fallbackDateDisplay = `${fallbackDateStr.substring(0, 4)}-${fallbackDateStr.substring(4, 6)}-${fallbackDateStr.substring(6, 8)}`;
    }
  }

  if (isFallback) {
    const warning = document.createElement('div');
    warning.style.margin = '0 20px 10px 20px';
    warning.style.padding = '12px';
    warning.style.background = '#fff3cd';
    warning.style.color = '#856404';
    warning.style.border = '1px solid #ffeeba';
    warning.style.borderRadius = '8px';
    warning.style.fontSize = '13px';
    warning.style.display = 'flex';
    warning.style.alignItems = 'center';
    warning.style.gap = '8px';
    warning.innerHTML = `<i class="ph ph-warning-circle" style="font-size: 18px"></i> <div>Horários de <strong>${fallbackDateDisplay}</strong> (dados para ${state.date} indisponíveis)</div>`;
    resultsList.appendChild(warning);
  }

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

function renderPatterns() {
  const dirPatterns = state.patterns.filter(p => p.direction === state.direction);

  if (dirPatterns.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.innerHTML = `<p>Sem variantes para esta direção</p>`;
    resultsList.appendChild(msg);
    return;
  }

  dirPatterns.forEach(pattern => {
    const el = document.createElement('div');
    el.className = 'line-card';
    if (state.selectedPattern && state.selectedPattern.id === pattern.id) {
      el.classList.add('active');
    }

    const headsign = pattern.short_name || (state.direction === 0 ? 'Ida' : 'Volta');

    el.innerHTML = `
      <div class="line-header">
        <span class="line-name">${headsign}</span>
      </div>
      <div class="line-route">
        <small>ID: ${pattern.id}</small>
      </div>
    `;
    el.addEventListener('click', async () => {
      // Create a dummy TripData for compatibility with selectTrip or just handle here
      state.selectedPattern = pattern;
      state.selectedTrip = null;

      document.querySelectorAll('.line-card').forEach(e => e.classList.remove('active'));
      el.classList.add('active');

      updateURL(state.selectedLine?.short_name, pattern.id);

      const shape = await fetchShape(pattern.shape_id);
      if (shape) {
        state.selectedShape = shape;
        drawShape(shape.geojson, state.selectedLine?.color || '#FFEB00', pattern.path);
        downloadSection.style.display = 'block';
      } else {
        clearMap();
      }
    });
    resultsList.appendChild(el);
  });
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
