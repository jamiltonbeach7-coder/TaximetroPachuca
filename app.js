/**
 * Taxímetro Pachuca - Código Abierto y Auditable
 * Módulo Principal de Lógica, GPS, Tarifas y Simulación Vial Realista
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
  simulationInterval: null,
  simSpeedMultiplier: 3
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

  // Simulación
  selectSimRoute: document.getElementById('selectSimRoute'),
  selectSimSpeed: document.getElementById('selectSimSpeed'),
  simStatusBanner: document.getElementById('simStatusBanner'),
  simTrafficLightIcon: document.getElementById('simTrafficLightIcon'),
  simStreetName: document.getElementById('simStreetName'),
  simTrafficText: document.getElementById('simTrafficText'),
  simWaitCountdown: document.getElementById('simWaitCountdown'),
  btnStartSimulation: document.getElementById('btnStartSimulation'),
  btnStopSimulation: document.getElementById('btnStopSimulation'),

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

  trafficLightSound() {
    this.playTone(350, 'sine', 0.2);
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
      if (!state.isSimulating) {
        updateMapPosition(latitude, longitude);
      }

      // Si el viaje está corriendo en modo real, procesar movimiento
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
      setVisualStatus('waiting', `🚦 Detenido en tráfico / Semáforo`);
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
      html: '<div style="font-size: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); transition: all 0.3s ease;">🚕</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    mapTaxiMarker = L.marker(pachucaCenter, { icon: taxiIcon }).addTo(mapInstance);
    mapRoutePolyline = L.polyline([], { color: '#f59e0b', weight: 5, opacity: 0.85, smoothFactor: 1 }).addTo(mapInstance);
  } catch (e) {
    console.warn("Leaflet map load error:", e);
  }
}

function updateMapPosition(lat, lon) {
  if (!mapInstance) return;
  if (mapTaxiMarker) {
    mapTaxiMarker.setLatLng([lat, lon]);
  }
  mapInstance.panTo([lat, lon], { animate: true, duration: 0.4 });
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

  // Arrancar temporizador de segundos reales
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    // Si no estamos simulando, contabilizar tiempo real
    if (!state.isSimulating) {
      state.totalElapsedSeconds++;
      if (state.currentSpeedKmh < 4) {
        state.totalWaitSeconds++;
      }
      updateDisplays();
    }
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

  DOM.btnStopSimulation.classList.add('hidden');
  DOM.simStatusBanner.classList.add('hidden');

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
  if (state.simulationInterval) clearInterval(state.simulationInterval);
  state.isSimulating = false;

  DOM.btnStopSimulation.classList.add('hidden');
  DOM.simStatusBanner.classList.add('hidden');

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
  } else if (type === 'waiting' || type === 'traffic_light') {
    DOM.statusDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse';
    DOM.statusBadge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-rose-950/60 border border-rose-500/50 text-rose-300';
  } else if (type === 'paused') {
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
// 8. SIMULADOR DE RUTAS VIALES REALES Y SEMÁFOROS
// ==========================================

// Base de datos de geometría vial precisa y semáforos de Pachuca
const PACHUCA_REAL_ROUTES = {
  // 1. Centro Histórico (Reloj) a Plaza Galerías por Av. Juárez y Blvd. Felipe Ángeles
  centro_galerias: {
    name: "Reloj Centro a Galerías Pachuca",
    origin: [20.12873, -98.73032],
    destination: [20.08950, -98.76610],
    segments: [
      {
        street: "Plaza Independencia / Calle Doria",
        targetSpeed: 25,
        trafficLight: null,
        points: [
          [20.12873, -98.73032],
          [20.12810, -98.73045],
          [20.12740, -98.73090],
          [20.12650, -98.73150]
        ]
      },
      {
        street: "Calle Vicente Guerrero / Plaza Juárez",
        targetSpeed: 30,
        trafficLight: { name: "Semáforo Plaza Juárez y Madero", durationSec: 12 },
        points: [
          [20.12650, -98.73150],
          [20.12520, -98.73230],
          [20.12400, -98.73310],
          [20.12280, -98.73400]
        ]
      },
      {
        street: "Av. Benito Juárez",
        targetSpeed: 45,
        trafficLight: { name: "Semáforo Av. Juárez y Fernando Soto", durationSec: 15 },
        points: [
          [20.12280, -98.73400],
          [20.12150, -98.73480],
          [20.11980, -98.73580],
          [20.11800, -98.73700],
          [20.11620, -98.73820]
        ]
      },
      {
        street: "Glorieta Insurgentes (Cruce con Revolución)",
        targetSpeed: 28,
        trafficLight: { name: "Cruce Glorieta Insurgentes", durationSec: 10 },
        points: [
          [20.11620, -98.73820],
          [20.11540, -98.73890],
          [20.11470, -98.73970],
          [20.11390, -98.74080]
        ]
      },
      {
        street: "Blvd. Felipe Ángeles (Tramo Santa Julia / Corona)",
        targetSpeed: 55,
        trafficLight: { name: "Semáforo Cruce Blvd. Minero / Corona", durationSec: 18 },
        points: [
          [20.11390, -98.74080],
          [20.11250, -98.74220],
          [20.11050, -98.74420],
          [20.10820, -98.74650],
          [20.10580, -98.74890]
        ]
      },
      {
        street: "Blvd. Felipe Ángeles (Estadio Hidalgo y Central)",
        targetSpeed: 50,
        trafficLight: { name: "Semáforo Estadio Hidalgo / Central", durationSec: 16 },
        points: [
          [20.10580, -98.74890],
          [20.10320, -98.75150],
          [20.10080, -98.75380],
          [20.09820, -98.75620],
          [20.09550, -98.75880]
        ]
      },
      {
        street: "Blvd. Felipe Ángeles (Parque David Ben Gurión / IT Pachuca)",
        targetSpeed: 55,
        trafficLight: { name: "Semáforo Tecnológico de Pachuca", durationSec: 14 },
        points: [
          [20.09550, -98.75880],
          [20.09350, -98.76080],
          [20.09180, -98.76280],
          [20.09050, -98.76450]
        ]
      },
      {
        street: "Acceso a Plaza Galerías Pachuca",
        targetSpeed: 25,
        trafficLight: null,
        points: [
          [20.09050, -98.76450],
          [20.08980, -98.76540],
          [20.08950, -98.76610]
        ]
      }
    ]
  },

  // 2. Central de Autobuses a Reloj Monumental por Viaducto Nuevo Hidalgo
  central_reloj: {
    name: "Central Autobuses a Reloj Centro",
    origin: [20.10080, -98.75380],
    destination: [20.12873, -98.73032],
    segments: [
      {
        street: "Blvd. Javier Rojo Gómez",
        targetSpeed: 45,
        trafficLight: { name: "Semáforo Rojo Gómez y Cobián", durationSec: 14 },
        points: [
          [20.10080, -98.75380],
          [20.10350, -98.75100],
          [20.10650, -98.74800],
          [20.10980, -98.74450]
        ]
      },
      {
        street: "Viaducto Nuevo Hidalgo (Tramo Río de las Avenidas)",
        targetSpeed: 55,
        trafficLight: { name: "Cruce Viaducto y Av. Madero", durationSec: 16 },
        points: [
          [20.10980, -98.74450],
          [20.11400, -98.74050],
          [20.11850, -98.73600],
          [20.12250, -98.73250],
          [20.12600, -98.72950]
        ]
      },
      {
        street: "Acceso a Plaza Independencia / Reloj",
        targetSpeed: 20,
        trafficLight: null,
        points: [
          [20.12600, -98.72950],
          [20.12750, -98.72980],
          [20.12873, -98.73032]
        ]
      }
    ]
  },

  // 3. Plaza Explanada a Hospital General por Blvd. Colosio
  explanada_hospital: {
    name: "Plaza Explanada a Hospital General",
    origin: [20.04500, -98.78800],
    destination: [20.11200, -98.72100],
    segments: [
      {
        street: "Blvd. Felipe Ángeles (Sur / San Antonio)",
        targetSpeed: 60,
        trafficLight: { name: "Semáforo San Antonio el Desmonte", durationSec: 15 },
        points: [
          [20.04500, -98.78800],
          [20.05600, -98.78000],
          [20.06800, -98.77200],
          [20.08000, -98.76500]
        ]
      },
      {
        street: "Distribuidor Vial 11 de Julio / Blvd. Colosio",
        targetSpeed: 55,
        trafficLight: { name: "Semáforo Colosio y Piracantos", durationSec: 18 },
        points: [
          [20.08000, -98.76500],
          [20.09000, -98.75200],
          [20.10000, -98.73800],
          [20.10800, -98.72800],
          [20.11200, -98.72100]
        ]
      }
    ]
  },

  // 4. Centro Pachuca a Real del Monte por Carretera Panorámica
  reloj_realmonte: {
    name: "Centro Pachuca a Real del Monte",
    origin: [20.12873, -98.73032],
    destination: [20.14150, -98.67300],
    segments: [
      {
        street: "Salida Centro hacia Corredor de la Montaña",
        targetSpeed: 35,
        trafficLight: { name: "Semáforo Loreto / Mina de San Juan", durationSec: 12 },
        points: [
          [20.12873, -98.73032],
          [20.13200, -98.72500],
          [20.13600, -98.71800]
        ]
      },
      {
        street: "Carretera Federal 105 (Curvas de la Montaña)",
        targetSpeed: 50,
        trafficLight: null,
        points: [
          [20.13600, -98.71800],
          [20.13900, -98.70500],
          [20.14200, -98.69200],
          [20.14150, -98.67300]
        ]
      }
    ]
  }
};

// Generador de pasos de interpolación de alta densidad a lo largo de las curvas
function buildDetailedTrajectory(routeKey) {
  const route = PACHUCA_REAL_ROUTES[routeKey] || PACHUCA_REAL_ROUTES.centro_galerias;
  const trajectory = [];

  route.segments.forEach((segment) => {
    const pts = segment.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dist = calculateHaversine(p1[0], p1[1], p2[0], p2[1]);
      
      // Interpolación densa cada ~15 a 20 metros para movimiento suave sin saltos
      const steps = Math.max(4, Math.ceil(dist / 0.018));
      for (let s = 0; s < steps; s++) {
        const ratio = s / steps;
        const lat = p1[0] + (p2[0] - p1[0]) * ratio;
        const lon = p1[1] + (p2[1] - p1[1]) * ratio;
        trajectory.push({
          lat,
          lon,
          street: segment.street,
          targetSpeed: segment.targetSpeed,
          isSegmentEnd: (i === pts.length - 2 && s === steps - 1),
          trafficLight: (i === pts.length - 2 && s === steps - 1) ? segment.trafficLight : null
        });
      }
    }
  });

  return trajectory;
}

// Intentar consultar ruta OSRM con fallback automático al modelo local
async function fetchOsrmRouteGeometry(routeKey) {
  const route = PACHUCA_REAL_ROUTES[routeKey] || PACHUCA_REAL_ROUTES.centro_galerias;
  const [origLat, origLon] = route.origin;
  const [destLat, destLon] = route.destination;

  const url = `https://router.project-osrm.org/route/v1/driving/${origLon},${origLat};${destLon},${destLat}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s timeout

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates; // [lon, lat]
        // Convertir coordenadas OSRM a formato de simulación
        const osrmTrajectory = [];
        for (let i = 0; i < coords.length - 1; i++) {
          const p1 = coords[i];
          const p2 = coords[i + 1];
          const lat1 = p1[1], lon1 = p1[0], lat2 = p2[1], lon2 = p2[0];
          const dist = calculateHaversine(lat1, lon1, lat2, lon2);
          const steps = Math.max(2, Math.ceil(dist / 0.02));
          
          for (let s = 0; s < steps; s++) {
            const ratio = s / steps;
            const lat = lat1 + (lat2 - lat1) * ratio;
            const lon = lon1 + (lon2 - lon1) * ratio;
            
            // Insertar semáforos periódicos en la ruta
            let tl = null;
            if (i > 0 && i % 25 === 0 && s === 0) {
              tl = { name: "Semáforo en Intersección Vial", durationSec: 15 };
            }

            osrmTrajectory.push({
              lat,
              lon,
              street: route.name,
              targetSpeed: 50,
              trafficLight: tl
            });
          }
        }
        return osrmTrajectory;
      }
    }
  } catch (err) {
    console.log("OSRM no disponible o sin conexión. Usando trazado vial de alta precisión local de Pachuca.");
  }

  // Fallback a coordenadas locales precisas
  return buildDetailedTrajectory(routeKey);
}

async function startSimulationRide() {
  resetRide();
  initMapIfNeeded();
  DOM.mapSection.classList.remove('hidden');
  
  const selectedRouteKey = DOM.selectSimRoute.value || 'centro_galerias';
  const speedMult = parseInt(DOM.selectSimSpeed.value, 10) || 3;
  state.simSpeedMultiplier = speedMult;

  state.isSimulating = true;
  startRide();

  DOM.btnStopSimulation.classList.remove('hidden');
  DOM.simStatusBanner.classList.remove('hidden');
  DOM.simStreetName.textContent = "Preparando ruta vial...";
  DOM.simTrafficText.textContent = "Calculando trazado sobre calles...";

  const trajectory = await fetchOsrmRouteGeometry(selectedRouteKey);
  
  if (!trajectory || trajectory.length === 0) {
    finishRide();
    return;
  }

  let index = 0;
  let currentSpeed = 0;
  let waitingCounter = 0; // Segundos restantes de semáforo rojo
  let activeTrafficLight = null;

  // Centrar mapa en origen
  updateMapPosition(trajectory[0].lat, trajectory[0].lon);

  // Intervalo de simulación (cada 200ms)
  const stepMs = 200;
  const tickTimeSec = (stepMs / 1000) * speedMult;

  state.simulationInterval = setInterval(() => {
    if (state.status === 'PAUSED') return;

    // Si terminó la ruta
    if (index >= trajectory.length - 1) {
      clearInterval(state.simulationInterval);
      finishRide();
      return;
    }

    const currentPoint = trajectory[index];
    const nextPoint = trajectory[index + 1];

    // ===================================
    // 1. MANEJO DE SEMÁFOROS Y DETENCIONES
    // ===================================
    if (waitingCounter > 0) {
      // Vehículo detenido por completo en el semáforo
      currentSpeed = 0;
      state.currentSpeedKmh = 0;
      
      // Contabilizar tiempo detenido en segundos simulados
      state.totalWaitSeconds += tickTimeSec;
      state.totalElapsedSeconds += tickTimeSec;
      waitingCounter -= tickTimeSec;

      // Actualizar UI del Semáforo
      DOM.simTrafficLightIcon.textContent = "🔴";
      DOM.simStreetName.textContent = activeTrafficLight ? activeTrafficLight.name : "Semáforo en Rojo";
      DOM.simTrafficText.textContent = `Detenido a 0 km/h (Contabilizando tiempo de espera)`;
      DOM.simWaitCountdown.textContent = `Espera: ${Math.max(0, Math.ceil(waitingCounter))}s`;
      setVisualStatus('traffic_light', `🚦 ${activeTrafficLight ? activeTrafficLight.name : 'Detenido en Semáforo'}`);

      updateDisplays();
      return;
    }

    // Comprobar si llegamos a un nuevo semáforo en este punto
    if (currentPoint.trafficLight && !activeTrafficLight) {
      activeTrafficLight = currentPoint.trafficLight;
      waitingCounter = activeTrafficLight.durationSec;
      sounds.trafficLightSound();
      return;
    }

    // Si salimos del semáforo, resetear estado
    activeTrafficLight = null;
    DOM.simWaitCountdown.textContent = "--";

    // ===================================
    // 2. DINÁMICA DE VELOCIDAD Y AVANCE
    // ===================================
    const targetSpeed = currentPoint.targetSpeed || 45;
    
    // Aceleración gradual realista
    if (currentSpeed < targetSpeed) {
      currentSpeed = Math.min(targetSpeed, currentSpeed + 6 * speedMult);
    } else if (currentSpeed > targetSpeed) {
      currentSpeed = Math.max(targetSpeed, currentSpeed - 8 * speedMult);
    }

    state.currentSpeedKmh = currentSpeed;

    // Calcular distancia recorrida en este paso
    const deltaKm = calculateHaversine(
      currentPoint.lat, currentPoint.lon,
      nextPoint.lat, nextPoint.lon
    );

    state.totalDistanceKm += deltaKm;
    state.totalElapsedSeconds += tickTimeSec;

    // Actualizar estado visual
    DOM.simTrafficLightIcon.textContent = "🟢";
    DOM.simStreetName.textContent = currentPoint.street || "Vía Principal";
    DOM.simTrafficText.textContent = `Avanzando sobre asfalto a ${Math.round(currentSpeed)} km/h`;
    setVisualStatus('moving', `🚕 ${currentPoint.street} (${Math.round(currentSpeed)} km/h)`);

    // Actualizar Mapa y Coordenadas
    updateMapPosition(nextPoint.lat, nextPoint.lon);
    if (mapRoutePolyline) {
      mapRoutePolyline.addLatLng([nextPoint.lat, nextPoint.lon]);
    }

    DOM.gpsCoordsText.textContent = `Lat: ${nextPoint.lat.toFixed(5)}, Lon: ${nextPoint.lon.toFixed(5)}`;
    DOM.gpsAccuracyText.textContent = `Precisión: Simulación Vial (${speedMult}x)`;

    index++;
    updateDisplays();
  }, stepMs);
}

function stopSimulation() {
  if (state.simulationInterval) clearInterval(state.simulationInterval);
  state.isSimulating = false;
  DOM.btnStopSimulation.classList.add('hidden');
  DOM.simStatusBanner.classList.add('hidden');
  finishRide();
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
  DOM.btnStopSimulation.addEventListener('click', stopSimulation);

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
