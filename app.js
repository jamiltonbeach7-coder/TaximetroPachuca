/**
 * Taxímetro Pachuca - Código Abierto y Auditable
 * Módulo Principal de Lógica, GPS, Tarifas y Experiencia de Usuario
 */

// ==========================================
// 1. CONFIGURACIÓN Y ESTADO DE LA APLICACIÓN
// ==========================================

const TARIFF_PRESETS = {
  pachuca_2026: {
    name: "Propuesta Pachuca 2026 ($50.00 base)",
    shortName: "Pachuca ($50 base / 4km + $4.50/km)",
    baseFare: 50.00,
    baseKm: 4.0,
    pricePerKm: 4.50,
    pricePerWaitMinute: 1.00
  },
  historica: {
    name: "Referencia Histórica ($38.50 base)",
    shortName: "Histórica ($38.50 base / 4km + $3.50/km)",
    baseFare: 38.50,
    baseKm: 4.0,
    pricePerKm: 3.50,
    pricePerWaitMinute: 1.00
  },
  custom: {
    name: "Tarifa Personalizada",
    shortName: "Personalizada",
    baseFare: 50.00,
    baseKm: 4.0,
    pricePerKm: 4.50,
    pricePerWaitMinute: 1.00
  }
};

const state = {
  // Estado del viaje: 'IDLE' | 'RUNNING' | 'PAUSED' | 'FINISHED'
  status: 'IDLE',
  
  // Tarifas activas
  tariffKey: 'pachuca_2026',
  tariff: { ...TARIFF_PRESETS.pachuca_2026 },
  nightFareActive: false,
  nightSurchargePct: 20,

  // Métricas acumuladas
  totalDistanceKm: 0.0,
  totalElapsedSeconds: 0,
  totalWaitSeconds: 0,
  currentSpeedKmh: 0,
  
  // Posicionamiento y Trazado
  lastPosition: null,
  routeCoordinates: [],
  geolocationWatchId: null,
  gpsAccuracy: null,

  // Tiempos e intervalos
  timerInterval: null,
  rideStartTime: null,
  rideEndTime: null,

  // Hardware y Auxiliares
  wakeLock: null,
  soundEnabled: true,
  theme: 'dark',
  
  // Simulación
  isSimulating: false,
  simulationInterval: null
};

// ==========================================
// 2. REFERENCIAS AL DOM
// ==========================================

const DOM = {
  // Displays Principales
  totalFareDisplay: document.getElementById('totalFareDisplay'),
  distanceDisplay: document.getElementById('distanceDisplay'),
  totalTimeDisplay: document.getElementById('totalTimeDisplay'),
  waitTimeDisplay: document.getElementById('waitTimeDisplay'),
  fareFormulaHint: document.getElementById('fareFormulaHint'),
  speedIndicator: document.getElementById('speedIndicator'),
  statusLabel: document.getElementById('statusLabel'),
  statusDot: document.getElementById('statusDot'),
  statusBadge: document.getElementById('statusBadge'),
  activeTariffLabel: document.getElementById('activeTariffLabel'),

  // Botones de Control
  btnStartRide: document.getElementById('btnStartRide'),
  btnPauseRide: document.getElementById('btnPauseRide'),
  pauseText: document.getElementById('pauseText'),
  pauseIcon: document.getElementById('pauseIcon'),
  btnFinishRide: document.getElementById('btnFinishRide'),
  btnResetRide: document.getElementById('btnResetRide'),
  btnChangeTariff: document.getElementById('btnChangeTariff'),

  // Auditoría en Vivo
  auditBaseFare: document.getElementById('auditBaseFare'),
  auditBaseKm: document.getElementById('auditBaseKm'),
  auditExtraKm: document.getElementById('auditExtraKm'),
  auditPriceKm: document.getElementById('auditPriceKm'),
  auditExtraDistFare: document.getElementById('auditExtraDistFare'),
  auditWaitMin: document.getElementById('auditWaitMin'),
  auditPriceMin: document.getElementById('auditPriceMin'),
  auditExtraWaitFare: document.getElementById('auditExtraWaitFare'),
  auditNightRow: document.getElementById('auditNightRow'),
  auditNightPct: document.getElementById('auditNightPct'),
  auditNightFare: document.getElementById('auditNightFare'),
  auditTotalFare: document.getElementById('auditTotalFare'),

  // GPS y Cabecera
  btnGpsStatus: document.getElementById('btnGpsStatus'),
  gpsPulse: document.getElementById('gpsPulse'),
  gpsStatusText: document.getElementById('gpsStatusText'),
  btnToggleTheme: document.getElementById('btnToggleTheme'),
  btnToggleSound: document.getElementById('btnToggleSound'),
  btnOpenHelp: document.getElementById('btnOpenHelp'),
  screenLockIcon: document.getElementById('screenLockIcon'),

  // Mapa
  mapSection: document.getElementById('mapSection'),
  btnToggleMap: document.getElementById('btnToggleMap'),
  btnCloseMap: document.getElementById('btnCloseMap'),
  gpsCoordsText: document.getElementById('gpsCoordsText'),
  gpsAccuracyText: document.getElementById('gpsAccuracyText'),

  // Acciones Rápidas
  btnOpenEstimator: document.getElementById('btnOpenEstimator'),
  btnShareTrip: document.getElementById('btnShareTrip'),
  btnGenerateTicket: document.getElementById('btnGenerateTicket'),
  btnStartSimulation: document.getElementById('btnStartSimulation'),

  // Modales
  tariffModal: document.getElementById('tariffModal'),
  btnCloseTariffModal: document.getElementById('btnCloseTariffModal'),
  btnSaveTariff: document.getElementById('btnSaveTariff'),
  customTariffFields: document.getElementById('customTariffFields'),
  inputCustomBase: document.getElementById('inputCustomBase'),
  inputCustomBaseKm: document.getElementById('inputCustomBaseKm'),
  inputCustomExtraKm: document.getElementById('inputCustomExtraKm'),
  inputCustomMinWait: document.getElementById('inputCustomMinWait'),
  toggleNightFare: document.getElementById('toggleNightFare'),

  estimatorModal: document.getElementById('estimatorModal'),
  btnCloseEstimatorModal: document.getElementById('btnCloseEstimatorModal'),
  selectQuickRoute: document.getElementById('selectQuickRoute'),
  estimatorKmInput: document.getElementById('estimatorKmInput'),
  estimatorResultPrice: document.getElementById('estimatorResultPrice'),
  estimatorResultBreakdown: document.getElementById('estimatorResultBreakdown'),

  ticketModal: document.getElementById('ticketModal'),
  btnCloseTicketModal: document.getElementById('btnCloseTicketModal'),
  ticketDate: document.getElementById('ticketDate'),
  ticketRideId: document.getElementById('ticketRideId'),
  ticketDistance: document.getElementById('ticketDistance'),
  ticketDuration: document.getElementById('ticketDuration'),
  ticketWaitTime: document.getElementById('ticketWaitTime'),
  ticketTariffName: document.getElementById('ticketTariffName'),
  ticketBaseFare: document.getElementById('ticketBaseFare'),
  ticketExtraKmFare: document.getElementById('ticketExtraKmFare'),
  ticketWaitFare: document.getElementById('ticketWaitFare'),
  ticketTotalFare: document.getElementById('ticketTotalFare'),
  btnShareTicketWhatsApp: document.getElementById('btnShareTicketWhatsApp'),
  btnPrintTicket: document.getElementById('btnPrintTicket'),

  helpModal: document.getElementById('helpModal'),
  btnCloseHelpModal: document.getElementById('btnCloseHelpModal'),
  btnCloseHelpBtn: document.getElementById('btnCloseHelpBtn'),

  // Banner PWA
  installBanner: document.getElementById('installBanner'),
  btnInstallPWA: document.getElementById('btnInstallPWA'),
  btnCloseInstallBanner: document.getElementById('btnCloseInstallBanner')
};

// ==========================================
// 3. MOTOR DE AUDIO SINTÉTICO (SIN ARCHIVOS)
// ==========================================

class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
  }

  playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.1) {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio feedback error:", e);
    }
  }

  startRideSound() {
    this.playTone(523.25, 'triangle', 0.1); // C5
    setTimeout(() => this.playTone(659.25, 'triangle', 0.15), 100); // E5
    setTimeout(() => this.playTone(783.99, 'triangle', 0.25), 200); // G5
  }

  pauseSound() {
    this.playTone(600, 'sine', 0.15);
    setTimeout(() => this.playTone(400, 'sine', 0.2), 120);
  }

  resumeSound() {
    this.playTone(400, 'sine', 0.15);
    setTimeout(() => this.playTone(600, 'sine', 0.2), 120);
  }

  finishSound() {
    this.playTone(783.99, 'sine', 0.12);
    setTimeout(() => this.playTone(659.25, 'sine', 0.12), 120);
    setTimeout(() => this.playTone(523.25, 'sine', 0.3), 240);
  }
}

const sounds = new SoundEffects();

// ==========================================
// 4. MOTOR DE CÁLCULO Y AUDITORÍA MATEMÁTICA
// ==========================================

function calculateFare(distanceKm, waitSeconds, tariff, isNight) {
  const baseFare = Number(tariff.baseFare) || 50.00;
  const baseKm = Number(tariff.baseKm) || 4.0;
  const pricePerKm = Number(tariff.pricePerKm) || 4.50;
  const pricePerWaitMin = Number(tariff.pricePerWaitMinute) || 1.00;

  // Kilómetros adicionales que exceden el banderazo
  const extraKm = Math.max(0, distanceKm - baseKm);
  const extraDistFare = extraKm * pricePerKm;

  // Minutos de espera en semáforos o tráfico detenido
  const waitMinutes = Math.floor(waitSeconds / 60);
  const extraWaitFare = waitMinutes * pricePerWaitMin;

  // Subtotal diurno
  const subtotal = baseFare + extraDistFare + extraWaitFare;

  // Recargo nocturno (si aplica)
  let nightFare = 0;
  if (isNight) {
    nightFare = subtotal * (state.nightSurchargePct / 100);
  }

  const total = subtotal + nightFare;

  return {
    baseFare,
    baseKm,
    extraKm,
    pricePerKm,
    extraDistFare,
    waitMinutes,
    pricePerWaitMin,
    extraWaitFare,
    isNight,
    nightFare,
    subtotal,
    total: Math.max(baseFare, total)
  };
}

function updateDisplays() {
  const calculation = calculateFare(
    state.totalDistanceKm,
    state.totalWaitSeconds,
    state.tariff,
    state.nightFareActive
  );

  // Pantalla Principal de Cobro
  DOM.totalFareDisplay.textContent = calculation.total.toFixed(2);
  DOM.distanceDisplay.textContent = state.totalDistanceKm.toFixed(2);
  DOM.totalTimeDisplay.textContent = formatTime(state.totalElapsedSeconds);
  DOM.waitTimeDisplay.textContent = formatTime(state.totalWaitSeconds);
  DOM.speedIndicator.textContent = `${Math.round(state.currentSpeedKmh)} km/h`;

  // Actualizar Explicación Rápida
  if (state.totalDistanceKm <= state.tariff.baseKm) {
    DOM.fareFormulaHint.textContent = `Banderazo base cubre hasta ${state.tariff.baseKm.toFixed(1)} km`;
  } else {
    const extra = (state.totalDistanceKm - state.tariff.baseKm).toFixed(2);
    DOM.fareFormulaHint.textContent = `+${extra} km adicionales ($${state.tariff.pricePerKm.toFixed(2)}/km)`;
  }

  // Panel de Auditoría en Vivo
  DOM.auditBaseFare.textContent = calculation.baseFare.toFixed(2);
  DOM.auditBaseKm.textContent = calculation.baseKm.toFixed(1);
  DOM.auditExtraKm.textContent = calculation.extraKm.toFixed(2);
  DOM.auditPriceKm.textContent = calculation.pricePerKm.toFixed(2);
  DOM.auditExtraDistFare.textContent = calculation.extraDistFare.toFixed(2);
  DOM.auditWaitMin.textContent = calculation.waitMinutes;
  DOM.auditPriceMin.textContent = calculation.pricePerWaitMin.toFixed(2);
  DOM.auditExtraWaitFare.textContent = calculation.extraWaitFare.toFixed(2);

  if (state.nightFareActive) {
    DOM.auditNightRow.classList.remove('hidden');
    DOM.auditNightPct.textContent = state.nightSurchargePct;
    DOM.auditNightFare.textContent = calculation.nightFare.toFixed(2);
  } else {
    DOM.auditNightRow.classList.add('hidden');
  }

  DOM.auditTotalFare.textContent = calculation.total.toFixed(2);
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ==========================================
// 5. CONTROL DE HARDWARE: WAKE LOCK & GPS
// ==========================================

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
      DOM.screenLockIcon.textContent = "📱 Pantalla Activa";
      DOM.screenLockIcon.className = "text-emerald-400 font-bold";
    } catch (err) {
      console.warn("WakeLock error:", err);
      DOM.screenLockIcon.textContent = "📱 Normal";
    }
  }
}

function releaseWakeLock() {
  if (state.wakeLock) {
    state.wakeLock.release().then(() => {
      state.wakeLock = null;
      DOM.screenLockIcon.textContent = "📱 Normal";
      DOM.screenLockIcon.className = "text-slate-400";
    });
  }
}

// Cálculo Haversine para distancia GPS precisa entre coordenadas
function calculateHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
}

function startGpsTracking() {
  if (!navigator.geolocation) {
    updateGpsIndicator('error', 'Sin soporte GPS');
    return;
  }

  updateGpsIndicator('searching', 'Buscando GPS...');

  state.geolocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy, speed } = position.coords;
      state.gpsAccuracy = accuracy;

      // Actualizar información técnica
      DOM.gpsCoordsText.textContent = `Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}`;
      DOM.gpsAccuracyText.textContent = `Precisión: ±${Math.round(accuracy)}m`;

      if (accuracy > 40) {
        updateGpsIndicator('warning', `Baja señal (±${Math.round(accuracy)}m)`);
      } else {
        updateGpsIndicator('ready', `GPS Óptimo (±${Math.round(accuracy)}m)`);
      }

      // Actualizar marcador en mapa si está inicializado
      updateMapPosition(latitude, longitude);

      // Si el viaje está corriendo, procesar movimiento
      if (state.status === 'RUNNING' && !state.isSimulating) {
        processGpsUpdate(latitude, longitude, speed, accuracy);
      }
    },
    (error) => {
      console.warn("GPS Error:", error);
      updateGpsIndicator('error', 'GPS no disponible');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

function processGpsUpdate(lat, lon, speedMs, accuracy) {
  // Filtro anti-ruido: Descartar saltos si la precisión es muy mala (>45m)
  if (accuracy > 45) return;

  if (state.lastPosition) {
    const deltaKm = calculateHaversine(
      state.lastPosition.lat,
      state.lastPosition.lon,
      lat,
      lon
    );

    // Calcular velocidad real si no viene en speedMs
    let currentKmh = 0;
    if (speedMs !== null && speedMs !== undefined && speedMs >= 0) {
      currentKmh = speedMs * 3.6;
    } else {
      const dtSeconds = (Date.now() - state.lastPosition.timestamp) / 1000;
      if (dtSeconds > 0) {
        currentKmh = (deltaKm / (dtSeconds / 3600));
      }
    }

    state.currentSpeedKmh = Math.min(140, Math.max(0, currentKmh));

    // Si la velocidad es < 4 km/h o distancia mínima insignificante, considerar detenido/espera
    // Filtro anti-jitter: No sumar micro movimientos falsos menores a 8 metros
    if (deltaKm > 0.008 && state.currentSpeedKmh > 3.5) {
      state.totalDistanceKm += deltaKm;
      setVisualStatus('moving', `🚕 En movimiento (${Math.round(state.currentSpeedKmh)} km/h)`);
    } else {
      setVisualStatus('waiting', `🚦 Detenido / Semáforo`);
    }
  }

  state.lastPosition = { lat, lon, timestamp: Date.now() };
  state.routeCoordinates.push([lat, lon]);
  if (mapRoutePolyline) {
    mapRoutePolyline.addLatLng([lat, lon]);
  }
}

function updateGpsIndicator(status, text) {
  DOM.gpsStatusText.textContent = text;
  if (status === 'ready') {
    DOM.gpsPulse.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
  } else if (status === 'warning' || status === 'searching') {
    DOM.gpsPulse.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse';
  } else {
    DOM.gpsPulse.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
  }
}

// ==========================================
// 6. MAPA INTERACTIVO LEAFLET
// ==========================================

let mapInstance = null;
let mapTaxiMarker = null;
let mapRoutePolyline = null;

function initMapIfNeeded() {
  if (mapInstance) return;
  
  // Coordenadas centrales de Pachuca (Reloj Monumental)
  const pachucaCenter = [20.1287, -98.7303];

  try {
    if (typeof L === 'undefined') return;

    mapInstance = L.map('map', {
      zoomControl: false
    }).setView(pachucaCenter, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(mapInstance);

    L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

    const taxiIcon = L.divIcon({
      className: 'custom-taxi-icon',
      html: '<div style="font-size: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🚕</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    mapTaxiMarker = L.marker(pachucaCenter, { icon: taxiIcon }).addTo(mapInstance);
    mapRoutePolyline = L.polyline([], { color: '#f59e0b', weight: 5, opacity: 0.85 }).addTo(mapInstance);
  } catch (e) {
    console.warn("Leaflet map load error:", e);
  }
}

function updateMapPosition(lat, lon) {
  if (!mapInstance) return;
  mapTaxiMarker.setLatLng([lat, lon]);
  mapInstance.panTo([lat, lon]);
}

// ==========================================
// 7. FLUJO DE VIAJE: START, PAUSE, FINISH
// ==========================================

function startRide() {
  sounds.startRideSound();
  requestWakeLock();

  state.status = 'RUNNING';
  state.rideStartTime = new Date();
  state.lastPosition = null;

  // Interfaz de botones
  DOM.btnStartRide.classList.add('hidden');
  DOM.btnPauseRide.classList.remove('hidden');
  DOM.btnFinishRide.classList.remove('hidden');
  DOM.btnResetRide.classList.add('hidden');

  setVisualStatus('running', '🚕 Viaje en progreso');

  // Arrancar temporizador de segundos
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.totalElapsedSeconds++;

    // Si la velocidad es menor a 4 km/h se acumula tiempo de tráfico/espera
    if (state.currentSpeedKmh < 4) {
      state.totalWaitSeconds++;
    }

    updateDisplays();
  }, 1000);

  updateDisplays();
}

function togglePauseRide() {
  if (state.status === 'RUNNING') {
    sounds.pauseSound();
    state.status = 'PAUSED';
    DOM.pauseText.textContent = "REANUDAR";
    DOM.pauseIcon.textContent = "▶️";
    DOM.btnPauseRide.classList.remove('bg-amber-500', 'hover:bg-amber-400');
    DOM.btnPauseRide.classList.add('bg-emerald-500', 'hover:bg-emerald-400');
    setVisualStatus('paused', '⏸️ Viaje pausado');
  } else if (state.status === 'PAUSED') {
    sounds.resumeSound();
    state.status = 'RUNNING';
    DOM.pauseText.textContent = "PAUSAR";
    DOM.pauseIcon.textContent = "⏸️";
    DOM.btnPauseRide.classList.add('bg-amber-500', 'hover:bg-amber-400');
    DOM.btnPauseRide.classList.remove('bg-emerald-500', 'hover:bg-emerald-400');
    setVisualStatus('running', '🚕 Viaje reanudado');
  }
}

function finishRide() {
  sounds.finishSound();
  releaseWakeLock();

  if (state.timerInterval) clearInterval(state.timerInterval);
  if (state.simulationInterval) clearInterval(state.simulationInterval);
  state.isSimulating = false;

  state.status = 'FINISHED';
  state.rideEndTime = new Date();
  state.currentSpeedKmh = 0;

  DOM.btnPauseRide.classList.add('hidden');
  DOM.btnFinishRide.classList.add('hidden');
  DOM.btnResetRide.classList.remove('hidden');

  setVisualStatus('finished', '🏁 Viaje terminado');
  updateDisplays();

  // Abrir automáticamente el ticket de viaje
  showTicketModal();
}

function resetRide() {
  sounds.playTone(440, 'sine', 0.1);
  state.status = 'IDLE';
  state.totalDistanceKm = 0.0;
  state.totalElapsedSeconds = 0;
  state.totalWaitSeconds = 0;
  state.currentSpeedKmh = 0;
  state.lastPosition = null;
  state.routeCoordinates = [];
  state.rideStartTime = null;
  state.rideEndTime = null;

  if (mapRoutePolyline) {
    mapRoutePolyline.setLatLngs([]);
  }

  DOM.btnStartRide.classList.remove('hidden');
  DOM.btnPauseRide.classList.add('hidden');
  DOM.btnFinishRide.classList.add('hidden');
  DOM.btnResetRide.classList.add('hidden');
  DOM.pauseText.textContent = "PAUSAR";
  DOM.pauseIcon.textContent = "⏸️";

  setVisualStatus('idle', 'Listo para iniciar');
  updateDisplays();
}

function setVisualStatus(type, label) {
  DOM.statusLabel.textContent = label;
  if (type === 'moving' || type === 'running') {
    DOM.statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping';
    DOM.statusBadge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-emerald-950/60 border border-emerald-500/50 text-emerald-300';
  } else if (type === 'waiting' || type === 'paused') {
    DOM.statusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
    DOM.statusBadge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-amber-950/60 border border-amber-500/50 text-amber-300';
  } else if (type === 'finished') {
    DOM.statusDot.className = 'w-2.5 h-2.5 rounded-full bg-sky-400';
    DOM.statusBadge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-sky-950/60 border border-sky-500/50 text-sky-300';
  } else {
    DOM.statusDot.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
    DOM.statusBadge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-slate-800 border border-slate-700 text-slate-300';
  }
}

// ==========================================
// 8. SIMULADOR DE PRUEBA (PACHUCA RUTA DEMO)
// ==========================================

const PACHUCA_DEMO_WAYPOINTS = [
  { lat: 20.1287, lon: -98.7303, label: "Reloj Monumental (Centro)" },
  { lat: 20.1220, lon: -98.7345, label: "Av. Revolución" },
  { lat: 20.1130, lon: -98.7420, label: "Estadio Hidalgo / Corona" },
  { lat: 20.1010, lon: -98.7530, label: "Central de Autobuses" },
  { lat: 20.0950, lon: -98.7610, label: "Blvd. Felipe Ángeles" },
  { lat: 20.0895, lon: -98.7661, label: "Plaza Galerías Pachuca" }
];

function startSimulationRide() {
  resetRide();
  initMapIfNeeded();
  DOM.mapSection.classList.remove('hidden');
  
  state.isSimulating = true;
  startRide();

  let waypointIndex = 0;
  let step = 0;
  const totalStepsPerSegment = 25;

  let currentLat = PACHUCA_DEMO_WAYPOINTS[0].lat;
  let currentLon = PACHUCA_DEMO_WAYPOINTS[0].lon;
  updateMapPosition(currentLat, currentLon);

  state.simulationInterval = setInterval(() => {
    if (state.status === 'PAUSED') return;

    if (waypointIndex >= PACHUCA_DEMO_WAYPOINTS.length - 1) {
      clearInterval(state.simulationInterval);
      finishRide();
      return;
    }

    const startWp = PACHUCA_DEMO_WAYPOINTS[waypointIndex];
    const endWp = PACHUCA_DEMO_WAYPOINTS[waypointIndex + 1];

    step++;
    const progress = step / totalStepsPerSegment;

    currentLat = startWp.lat + (endWp.lat - startWp.lat) * progress;
    currentLon = startWp.lon + (endWp.lon - startWp.lon) * progress;

    // Simular variación realista de velocidad y semáforos
    let simSpeed = 45;
    if (step < 3 || step > totalStepsPerSegment - 2) {
      simSpeed = 10; // Frenando en esquina o semáforo
    } else if (waypointIndex === 2 && step >= 10 && step <= 16) {
      simSpeed = 0; // Detenido en semáforo de Estadio
      setVisualStatus('waiting', `🚦 Semáforo en Estadio Hidalgo`);
    } else {
      setVisualStatus('moving', `🚕 En movimiento (${simSpeed} km/h)`);
    }

    state.currentSpeedKmh = simSpeed;
    
    // Sumar distancia
    if (simSpeed > 0) {
      state.totalDistanceKm += (simSpeed / 3600); // km por segundo simulado
    }

    updateMapPosition(currentLat, currentLon);
    if (mapRoutePolyline) {
      mapRoutePolyline.addLatLng([currentLat, currentLon]);
    }

    DOM.gpsCoordsText.textContent = `Lat: ${currentLat.toFixed(5)}, Lon: ${currentLon.toFixed(5)}`;
    DOM.gpsAccuracyText.textContent = `Precisión: Simulado (Demo)`;

    if (step >= totalStepsPerSegment) {
      step = 0;
      waypointIndex++;
    }

    updateDisplays();
  }, 500); // Pasos cada 500ms para demostración fluida
}

// ==========================================
// 9. MODALES: TARIFAS, ESTIMADOR, TICKET
// ==========================================

function openTariffModal() {
  DOM.tariffModal.classList.remove('hidden');
  DOM.toggleNightFare.checked = state.nightFareActive;
}

function closeTariffModal() {
  DOM.tariffModal.classList.add('hidden');
}

function saveTariffSettings() {
  const selected = document.querySelector('input[name="tariffPreset"]:checked')?.value || 'pachuca_2026';
  state.tariffKey = selected;
  state.nightFareActive = DOM.toggleNightFare.checked;

  if (selected === 'custom') {
    state.tariff = {
      name: "Tarifa Personalizada",
      shortName: "Personalizada",
      baseFare: parseFloat(DOM.inputCustomBase.value) || 50.0,
      baseKm: parseFloat(DOM.inputCustomBaseKm.value) || 4.0,
      pricePerKm: parseFloat(DOM.inputCustomExtraKm.value) || 4.50,
      pricePerWaitMinute: parseFloat(DOM.inputCustomMinWait.value) || 1.00
    };
  } else {
    state.tariff = { ...TARIFF_PRESETS[selected] };
  }

  DOM.activeTariffLabel.textContent = `${state.tariff.shortName} ${state.nightFareActive ? '🌙 (Nocturna +20%)' : ''}`;
  updateDisplays();
  closeTariffModal();
}

function openEstimatorModal() {
  DOM.estimatorModal.classList.remove('hidden');
  calculateEstimation();
}

function closeEstimatorModal() {
  DOM.estimatorModal.classList.add('hidden');
}

function calculateEstimation() {
  const kmVal = parseFloat(DOM.estimatorKmInput.value) || 0;
  const trafficMins = parseInt(document.querySelector('input[name="trafficLevel"]:checked')?.value || '0', 10);
  
  const estimate = calculateFare(kmVal, trafficMins * 60, state.tariff, state.nightFareActive);

  DOM.estimatorResultPrice.textContent = `$${estimate.total.toFixed(2)} MXN`;
  if (kmVal <= state.tariff.baseKm) {
    DOM.estimatorResultBreakdown.textContent = `Banderazo base ($${state.tariff.baseFare.toFixed(2)}) cubre hasta ${state.tariff.baseKm} km.`;
  } else {
    const extra = (kmVal - state.tariff.baseKm).toFixed(1);
    DOM.estimatorResultBreakdown.textContent = `Base $${state.tariff.baseFare.toFixed(2)} + ${extra} km extra ($${(extra * state.tariff.pricePerKm).toFixed(2)}) + ${trafficMins} min tráfico.`;
  }
}

function showTicketModal() {
  const calculation = calculateFare(
    state.totalDistanceKm,
    state.totalWaitSeconds,
    state.tariff,
    state.nightFareActive
  );

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const randomId = Math.floor(1000 + Math.random() * 9000);

  DOM.ticketDate.textContent = `${dateStr} ${timeStr}`;
  DOM.ticketRideId.textContent = `TX-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-${randomId}`;
  DOM.ticketDistance.textContent = `${state.totalDistanceKm.toFixed(2)} km`;
  DOM.ticketDuration.textContent = `${formatTime(state.totalElapsedSeconds)} min`;
  DOM.ticketWaitTime.textContent = `${formatTime(state.totalWaitSeconds)} min`;
  DOM.ticketTariffName.textContent = state.tariff.shortName;

  DOM.ticketBaseFare.textContent = `$${calculation.baseFare.toFixed(2)}`;
  DOM.ticketExtraKmFare.textContent = `$${calculation.extraDistFare.toFixed(2)}`;
  DOM.ticketWaitFare.textContent = `$${calculation.extraWaitFare.toFixed(2)}`;
  DOM.ticketTotalFare.textContent = `$${calculation.total.toFixed(2)} MXN`;

  DOM.ticketModal.classList.remove('hidden');
}

function closeTicketModal() {
  DOM.ticketModal.classList.add('hidden');
}

function shareTicketWhatsApp() {
  const calculation = calculateFare(
    state.totalDistanceKm,
    state.totalWaitSeconds,
    state.tariff,
    state.nightFareActive
  );

  const message = `🚕 *COMPROBANTE DE TAXI - PACHUCA*\n` +
    `📅 Fecha: ${DOM.ticketDate.textContent}\n` +
    `🔢 ID: ${DOM.ticketRideId.textContent}\n` +
    `--------------------------\n` +
    `📏 Distancia: ${state.totalDistanceKm.toFixed(2)} km\n` +
    `⏱️ Duración: ${formatTime(state.totalElapsedSeconds)} min\n` +
    `🚦 Tiempo en espera/tráfico: ${formatTime(state.totalWaitSeconds)} min\n` +
    `🏷️ Tarifa aplicada: ${state.tariff.shortName}\n` +
    `--------------------------\n` +
    `💵 *TOTAL JUSTO: $${calculation.total.toFixed(2)} MXN*\n\n` +
    `✅ _Calculado de forma transparente con Taxímetro Pachuca (Código Abierto)_`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

function shareTripSafetyWhatsApp() {
  let coordsMsg = "Iniciando viaje en Pachuca";
  if (state.lastPosition) {
    coordsMsg = `https://www.google.com/maps?q=${state.lastPosition.lat},${state.lastPosition.lon}`;
  }

  const message = `🛡️ *COMPARTIENDO MI VIAJE EN TAXI (PACHUCA)*\n` +
    `Estoy a bordo de un taxi.\n` +
    `📍 Mi ubicación actual: ${coordsMsg}\n` +
    `📏 Distancia recorrida hasta ahora: ${state.totalDistanceKm.toFixed(2)} km\n` +
    `⏱️ Tiempo en viaje: ${formatTime(state.totalElapsedSeconds)}\n` +
    `🚕 Taxímetro Abierto Pachuca`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

// ==========================================
// 10. TEMA, SONIDO Y PWA LIFECYCLE
// ==========================================

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  if (isDark) {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    DOM.btnToggleTheme.textContent = "🌙";
    localStorage.setItem('tp_theme', 'light');
  } else {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
    DOM.btnToggleTheme.textContent = "☀️";
    localStorage.setItem('tp_theme', 'dark');
  }
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  DOM.btnToggleSound.textContent = state.soundEnabled ? "🔊" : "🔇";
  if (state.soundEnabled) {
    sounds.playTone(600, 'sine', 0.1);
  }
}

// PWA Install Prompt Handler
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  DOM.installBanner.classList.remove('hidden');
});

DOM.btnInstallPWA.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      DOM.installBanner.classList.add('hidden');
    }
    deferredInstallPrompt = null;
  } else {
    // Si no hay evento diferido, abrir la guía accesible
    DOM.helpModal.classList.remove('hidden');
  }
});

DOM.btnCloseInstallBanner.addEventListener('click', () => {
  DOM.installBanner.classList.add('hidden');
});

// Registrar Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn("Service Worker registration failed:", err);
    });
  });
}

// ==========================================
// 11. REGISTRO DE EVENTOS (LISTENERS)
// ==========================================

function initEventListeners() {
  // Botones de Viaje
  DOM.btnStartRide.addEventListener('click', startRide);
  DOM.btnPauseRide.addEventListener('click', togglePauseRide);
  DOM.btnFinishRide.addEventListener('click', finishRide);
  DOM.btnResetRide.addEventListener('click', resetRide);

  // Selector y Modal de Tarifas
  DOM.btnChangeTariff.addEventListener('click', openTariffModal);
  DOM.btnCloseTariffModal.addEventListener('click', closeTariffModal);
  DOM.btnSaveTariff.addEventListener('click', saveTariffSettings);
  
  document.querySelectorAll('input[name="tariffPreset"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        DOM.customTariffFields.classList.remove('hidden');
      } else {
        DOM.customTariffFields.classList.add('hidden');
      }
    });
  });

  // Mapa
  DOM.btnToggleMap.addEventListener('click', () => {
    DOM.mapSection.classList.toggle('hidden');
    initMapIfNeeded();
    if (mapInstance) {
      setTimeout(() => mapInstance.invalidateSize(), 200);
    }
  });
  DOM.btnCloseMap.addEventListener('click', () => {
    DOM.mapSection.classList.add('hidden');
  });

  // Estimador
  DOM.btnOpenEstimator.addEventListener('click', openEstimatorModal);
  DOM.btnCloseEstimatorModal.addEventListener('click', closeEstimatorModal);
  DOM.estimatorKmInput.addEventListener('input', calculateEstimation);
  document.querySelectorAll('input[name="trafficLevel"]').forEach(r => r.addEventListener('change', calculateEstimation));
  DOM.selectQuickRoute.addEventListener('change', (e) => {
    if (e.target.value) {
      DOM.estimatorKmInput.value = e.target.value;
      calculateEstimation();
    }
  });

  // Ticket y Compartir
  DOM.btnGenerateTicket.addEventListener('click', showTicketModal);
  DOM.btnCloseTicketModal.addEventListener('click', closeTicketModal);
  DOM.btnShareTicketWhatsApp.addEventListener('click', shareTicketWhatsApp);
  DOM.btnPrintTicket.addEventListener('click', () => window.print());
  DOM.btnShareTrip.addEventListener('click', shareTripSafetyWhatsApp);

  // Ayuda y Guía
  DOM.btnOpenHelp.addEventListener('click', () => DOM.helpModal.classList.remove('hidden'));
  DOM.btnCloseHelpModal.addEventListener('click', () => DOM.helpModal.classList.add('hidden'));
  DOM.btnCloseHelpBtn.addEventListener('click', () => DOM.helpModal.classList.add('hidden'));

  // Modos y Sonido
  DOM.btnToggleTheme.addEventListener('click', toggleTheme);
  DOM.btnToggleSound.addEventListener('click', toggleSound);

  // Simulación
  DOM.btnStartSimulation.addEventListener('click', startSimulationRide);

  // Iniciar GPS
  startGpsTracking();

  // Restaurar Tema
  const savedTheme = localStorage.getItem('tp_theme');
  if (savedTheme === 'light') {
    toggleTheme();
  }
}

// Inicialización cuando carga el documento
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  updateDisplays();
});
