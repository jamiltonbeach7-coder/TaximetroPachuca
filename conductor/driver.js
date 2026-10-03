/**
 * Taxímetro Pachuca - App del conductor
 * Recibe el viaje del pasajero por WebRTC, recalcula la tarifa con el motor compartido
 * y alerta si el total recibido difiere del recalculado.
 */
const $ = (id) => document.getElementById(id);
const integrityState = { ok: false, rootHash: '' };
let sync = null;
let stopScan = null;
let lastTotalOk = true;
let offlineKey = null;
let offlinePair = null;
let offlineSecret = null;
let mqttLink = null;

function formatTime(totalSeconds) {
  const s = Math.floor(Math.max(0, Number(totalSeconds) || 0));
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

async function runIntegrityCheck() {
  const res = await TP.integrity.verify('../');
  integrityState.ok = res.ok;
  integrityState.rootHash = res.rootHash;
  integrityState.report = res.error ? 'No se pudo verificar: ' + res.error : res.ok ? 'Todos los archivos coinciden con integrity.json.\nHash raíz: ' + res.rootHash : 'Archivos con problemas:\n' + res.details.map(d => '• ' + d.path + ': ' + d.reason).join('\n') + '\n\nSi acabas de actualizar la app, cierra y abre de nuevo (caché).';
  const b = $('integrityBadge');
  if (res.ok) {
    b.textContent = `✅ ${res.rootHash.slice(0, 8)}`;
    b.className = 'px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-xs font-semibold text-emerald-300';
    b.title = `App íntegra. Hash raíz SHA-256: ${res.rootHash}`;
  } else {
    b.textContent = '⚠️ Alterada';
    b.className = 'px-2 py-1 rounded-full bg-red-500/20 border border-red-500/60 text-xs font-bold text-red-300';
    b.title = res.error ? `No se pudo verificar: ${res.error}` : `Archivos que no coinciden: ${res.mismatches.join(', ')}`;
  }
}

function saveTrip(d, calc, source) {
  if (!d || !d.rideId) return;
  TP.store.addTrip({
    id: d.rideId, ts: d.rideId, distanceKm: Number(d.distanceKm) || 0, elapsedSeconds: Number(d.elapsedSeconds) || 0,
    waitSeconds: Number(d.waitSeconds) || 0, tariffName: (TP.TARIFF_PRESETS[d.tariffKey] || {}).shortName || 'Personalizada',
    total: calc.total, isNight: !!d.isNight, source
  });
  TP.store.render($('historyList'), $('historySummary'));
}

function renderTick(d, source) {
  // Validar tipos antes de usar datos remotos
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const tariff = {
    baseFare: num(d.tariff && d.tariff.baseFare), baseKm: num(d.tariff && d.tariff.baseKm),
    pricePerKm: num(d.tariff && d.tariff.pricePerKm), pricePerWaitMinute: num(d.tariff && d.tariff.pricePerWaitMinute)
  };
  const calc = TP.calculateFare(num(d.distanceKm), num(d.waitSeconds), tariff, !!d.isNight, num(d.nightPct));

  $('liveSection').classList.remove('hidden');
  const labels = { IDLE: 'Listo', RUNNING: '🚕 En viaje', PAUSED: '⏸️ Pausado', FINISHED: '🏁 Terminado' };
  $('rideStatus').textContent = labels[d.status] || 'Esperando…';
  const preset = TP.TARIFF_PRESETS[d.tariffKey];
  $('tariffName').textContent = preset ? preset.shortName : 'Tarifa personalizada';
  $('totalFare').textContent = calc.total.toFixed(2);
  $('dist').textContent = num(d.distanceKm).toFixed(2);
  $('elapsed').textContent = formatTime(d.elapsedSeconds);
  $('wait').textContent = formatTime(d.waitSeconds);
  $('speed').textContent = `Velocidad: ${Math.round(num(d.speedKmh))} km/h`;

  $('bBaseKm').textContent = calc.baseKm.toFixed(1);
  $('bBase').textContent = calc.baseFare.toFixed(2);
  $('bExtraKm').textContent = calc.extraKm.toFixed(2);
  $('bPriceKm').textContent = calc.pricePerKm.toFixed(2);
  $('bExtra').textContent = calc.extraDistFare.toFixed(2);
  $('bWaitMin').textContent = calc.waitMinutes;
  $('bPriceMin').textContent = calc.pricePerWaitMin.toFixed(2);
  $('bWaitFare').textContent = calc.extraWaitFare.toFixed(2);
  $('bNightRow').classList.toggle('hidden', !calc.isNight);
  $('bNightPct').textContent = num(d.nightPct);
  $('bNight').textContent = calc.nightFare.toFixed(2);
  $('bTotal').textContent = calc.total.toFixed(2);

  const diff = Math.abs(calc.total - num(d.total));
  lastTotalOk = diff <= 0.01;
  if (d.status === 'FINISHED') saveTrip(d, calc, source || 'en vivo');
  const chk = $('fareCheck');
  chk.textContent = lastTotalOk ? '✅ Total coincide con el del pasajero' : `⚠️ El pasajero reporta $${num(d.total).toFixed(2)} (difiere $${diff.toFixed(2)})`;
  chk.className = 'text-xs mt-2 ' + (lastTotalOk ? 'text-emerald-400' : 'text-red-400 font-bold');
}

function createSync() {
  sync = new TP.Sync({
    role: 'driver',
    getIntegrity: () => ({ rootHash: integrityState.rootHash, integrityOk: integrityState.ok }),
    onState: (st) => {
      const labels = { idle: 'Sin vincular', pairing: 'Emparejando…', connected: '✅ Conectado', disconnected: '⚠️ Desconectado', timeout: '⏱️ Sin conexión', error: '⚠️ Mensaje rechazado' };
      $('connBadge').textContent = labels[st] || st;
      if (st === 'connected') {
        $('pairStatus').textContent = 'Conectado. Esperando datos del viaje…';
        $('pairSection').classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (sync) $('linkDiag').textContent = sync.getDiagnostics();
      if (st === 'timeout') $('pairStatus').textContent = 'No se logró conectar (¿redes distintas?). Prueba la misma Wi-Fi o sincroniza solo por QR (abajo).';
      if (st === 'disconnected') $('pairSection').classList.remove('hidden');
      if (st === 'disconnected') $('pairStatus').textContent = 'Conexión perdida. Pide al pasajero una nueva invitación.';
    },
    onVerifyCode: (code) => { $('verifyCode').textContent = code; $('verifyBox').classList.remove('hidden'); },
    onHello: (info) => { $('mismatchBox').classList.toggle('hidden', !info.mismatch); },
    onReject: () => {
      const t = $('tamperBox');
      t.textContent = '⚠️ Se descartó un mensaje con firma inválida o repetido.';
      t.classList.remove('hidden');
    },
    onMessage: (type, data) => {
      if (type === 'tick') renderTick(data);
    }
  });
}

// Cualquier botón de escaneo/pegado acepta cualquier tipo de código y lo manda al flujo correcto
async function routeCode(raw) {
  const code = String(raw || '').trim();
  const kind = await TP.classify(code);
  if (kind === 'offline') return applyOffline(code);
  if (kind === 'offer') return acceptOffer(code);
  if (kind === 'answer') return applyAnswer(code);
  if (kind === 'snapshot') return loadSnapshot(code);
  $('pairStatus').textContent = 'Código no reconocido. Pega o escanea un código que empiece con TP, TPK1. o TPR.';
}

async function acceptOffer(code) {
  try {
    if (!window.RTCPeerConnection) throw new Error('Este navegador no soporta WebRTC');
    $('pairStatus').textContent = 'Generando respuesta…';
    if (!sync) createSync();
    const answer = await sync.acceptOffer(code);
    $('answerCode').value = answer;
    $('answerBox').classList.remove('hidden');
    try { await TP.qr.render($('answerQr'), answer); } catch (e) { $('answerQr').classList.add('hidden'); }
    $('pairStatus').textContent = 'Paso 2 de 3 listo: el pasajero debe escanear este QR de respuesta. Espera a que diga Conectado.';
  } catch (e) {
    $('pairStatus').textContent = 'Código inválido: ' + e.message;
  }
}

$('btnAcceptOffer').addEventListener('click', () => routeCode($('offerCode').value));
$('btnScanOffer').addEventListener('click', async () => {
  $('scanVideo').classList.remove('hidden');
  stopScan = await TP.qr.scan($('scanVideo'), (text) => {
    $('scanVideo').classList.add('hidden'); stopScan = null; $('offerCode').value = text; routeCode(text);
  }, () => { $('scanVideo').classList.add('hidden'); $('pairStatus').textContent = 'No se pudo abrir la cámara; pega el código.'; });
});
$('btnCopyAnswer').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText($('answerCode').value); });

async function loadSnapshot(code) {
  const st = $('snapStatus');
  try {
    const snap = await TP.Snapshot.decode(code, offlineKey);
    const src = snap.authentic === true ? 'QR firmado' : snap.authentic === false ? 'QR firma inválida' : 'QR sin firma';
    renderTick(Object.assign({}, snap.data, { status: 'FINISHED' }), src);
    const sameApp = snap.rootHash && snap.rootHash === integrityState.rootHash;
    const age = Math.round((Date.now() - snap.ts) / 60000);
    const sig = snap.authentic === true ? '🔏 firma válida (del pasajero sincronizado)'
      : snap.authentic === false ? '⛔ FIRMA INVÁLIDA o ausente: no confíes en este resumen'
      : 'sin firma verificable (no están sincronizados por QR); confía en el total recalculado';
    st.textContent = `Resumen cargado (hace ${age} min). ${sig}. App del pasajero: ${sameApp ? '✅ misma versión' : '⚠️ versión distinta'}.`;
    st.className = 'text-xs ' + (snap.authentic === false ? 'text-red-400 font-bold' : sameApp ? 'text-emerald-400' : 'text-amber-400');
  } catch (e) {
    st.textContent = 'No se pudo leer: ' + e.message;
    st.className = 'text-xs text-red-400';
  }
}
$('btnLoadSnap').addEventListener('click', () => routeCode($('snapCode').value));
$('btnScanSnap').addEventListener('click', async () => {
  $('snapVideo').classList.remove('hidden');
  await TP.qr.scan($('snapVideo'), (text) => {
    $('snapVideo').classList.add('hidden'); $('snapCode').value = text; routeCode(text);
  }, () => { $('snapVideo').classList.add('hidden'); $('snapStatus').textContent = 'No se pudo abrir la cámara; pega el código.'; });
});

// Flujo inverso: el conductor genera la invitación y el pasajero la escanea
$('btnGenInvite').addEventListener('click', async () => {
  try {
    if (!window.RTCPeerConnection) throw new Error('Este navegador no soporta WebRTC');
    $('pairStatus').textContent = 'Generando invitación…';
    if (!sync) createSync();
    const code = await sync.createOffer();
    $('inviteCode').value = code;
    $('inviteBox').classList.remove('hidden');
    try { await TP.qr.render($('inviteQr'), code); } catch (e) { $('inviteQr').classList.add('hidden'); }
    $('pairStatus').textContent = 'Paso 1 de 3 listo: el pasajero debe escanear este QR. Después escanea SU respuesta (paso 2) y toca Conectar (paso 3).';
  } catch (e) { $('pairStatus').textContent = 'Error: ' + e.message; }
});
$('btnCopyInvite').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText($('inviteCode').value); });
async function applyAnswer(code) {
  try { await sync.acceptAnswer(code); $('pairStatus').textContent = 'Paso 3 de 3: conectando…'; const iv = setInterval(() => { if (!sync || sync.connected) return clearInterval(iv); $('linkDiag').textContent = sync.getDiagnostics(); }, 1500); setTimeout(() => clearInterval(iv), 30000); }
  catch (e) { $('pairStatus').textContent = 'Código inválido: ' + e.message; }
}
$('btnApplyAns').addEventListener('click', () => routeCode($('ansIn').value));
$('btnScanAnswer').addEventListener('click', async () => {
  $('scanAnsVideo').classList.remove('hidden');
  await TP.qr.scan($('scanAnsVideo'), (text) => {
    $('scanAnsVideo').classList.add('hidden'); routeCode(text);
  }, () => { $('scanAnsVideo').classList.add('hidden'); $('pairStatus').textContent = 'No se pudo abrir la cámara; pega el código.'; });
});

// ---- Sincronización solo por QR (clave compartida ECDH) ----
function showSyncedHome() {
  $('pairSection').classList.add('hidden');
  $('syncedBox').classList.remove('hidden');
  $('btnOfflineDone').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('btnOfflineDone').addEventListener('click', showSyncedHome);
$('btnResync').addEventListener('click', () => {
  offlineKey = null; offlineSecret = null; TP.OfflinePair.clear();
  if (mqttLink) { mqttLink.stop(); mqttLink = null; }
  $('mqttStatus').textContent = '';
  $('syncedBox').classList.add('hidden');
  $('pairSection').classList.remove('hidden');
  $('connBadge').textContent = 'Sin vincular';
});
const offStatus = (t) => { $('offlineStatus').textContent = t; };
async function showOfflineCode(code) {
  $('offlineCode').value = code;
  $('offlineCode').classList.remove('hidden');
  $('offlineQr').classList.remove('hidden');
  try { await TP.qr.render($('offlineQr'), code); } catch (e) { $('offlineQr').classList.add('hidden'); }
}
$('btnOfflineStart').addEventListener('click', async () => {
  try {
    offlinePair = new TP.OfflinePair();
    await showOfflineCode(await offlinePair.start(integrityState.rootHash));
    offStatus('Paso 1 listo: el pasajero debe escanear este QR. Después escanea el QR que él te muestre.');
  } catch (e) { offStatus('Error: ' + e.message); }
});
async function applyOffline(code) {
  try {
    if (!offlinePair) offlinePair = new TP.OfflinePair();
    const r = await offlinePair.accept(code, integrityState.rootHash);
    if (r.mismatch && !confirm(`Las apps tienen versiones distintas (tú: ${integrityState.rootHash.slice(0, 8)}, pasajero: ${r.peerRoot.slice(0, 8)}). Lo normal es una caché vieja: cierra y abre de nuevo la app desactualizada. ¿Sincronizar de todos modos?`)) {
      offStatus('Sincronización cancelada: versiones distintas.'); offlinePair = null; return;
    }
    TP.OfflinePair.save(r.secret);
    offlineKey = await TP.OfflinePair.keyFrom(r.secret);
    offlineSecret = r.secret;
    applyMqttSetting();
    $('connBadge').textContent = '🔑 Sincronizado (QR)';
    if (r.replyCode) {
      await showOfflineCode(r.replyCode);
      offStatus(`Sincronizado ✅ (código de verificación ${r.verifyCode}, debe ser igual en el otro). Falta que el pasajero escanee TU QR de arriba.`);
    } else {
      offStatus(`Sincronizado ✅ (código de verificación ${r.verifyCode}, debe ser igual en el otro). Al terminar el viaje escanea su resumen firmado.`);
    }
    $('btnOfflineDone').classList.remove('hidden');
    if (!r.replyCode) setTimeout(showSyncedHome, 1200);
    offlinePair = null;
  } catch (e) { offStatus('No se pudo sincronizar: ' + e.message); }
}
$('btnOfflineApply').addEventListener('click', () => routeCode($('offlineIn').value));
$('btnOfflineScan').addEventListener('click', async () => {
  $('offlineVideo').classList.remove('hidden');
  await TP.qr.scan($('offlineVideo'), (text) => {
    $('offlineVideo').classList.add('hidden'); $('offlineIn').value = text; routeCode(text);
  }, () => { $('offlineVideo').classList.add('hidden'); offStatus('No se pudo abrir la cámara; pega el código.'); });
});
TP.OfflinePair.load().then((p) => { if (p) { offlineKey = p.key; offlineSecret = p.secret; $('connBadge').textContent = '🔑 Sincronizado (QR)'; showSyncedHome(); applyMqttSetting(); } });

$('integrityBadge').addEventListener('click', () => alert(integrityState.report || 'Verificando…'));
// ---- Seguimiento en vivo por MQTT cifrado (opcional) ----
const MQTT_PREF = 'tp_mqtt_d';
function applyMqttSetting() {
  let enabled = false;
  try { enabled = localStorage.getItem(MQTT_PREF) === '1'; } catch (e) { /* noop */ }
  $('toggleMqtt').checked = enabled;
  if (mqttLink) { mqttLink.stop(); mqttLink = null; }
  if (!enabled) { $('mqttStatus').textContent = ''; return; }
  if (!offlineSecret) { $('mqttStatus').textContent = 'Primero sincroniza por QR (sección de abajo).'; return; }
  mqttLink = new TP.MqttLink({
    role: 'd',
    secret: offlineSecret,
    getIntegrity: () => ({ rootHash: integrityState.rootHash }),
    onState: (st, detail) => {
      const labels = { connecting: 'Conectando al broker…', broker: 'Conectado al broker; esperando al pasajero…', peer: '✅ Pasajero en línea (cifrado)', offline: '', error: '⚠️ Error: ' + (detail || '') };
      $('mqttStatus').textContent = labels[st] || st;
      if (st === 'peer') $('connBadge').textContent = '✅ En vivo (internet)';
      else if (offlineKey) $('connBadge').textContent = '🔑 Sincronizado (QR)';
    },
    onHello: (info) => { $('mismatchBox').classList.toggle('hidden', !info.mismatch); },
    onMessage: (type, data) => { if (type === 'tick') renderTick(data, 'en vivo (internet)'); }
  });
  mqttLink.start();
}
$('toggleMqtt').addEventListener('change', () => {
  try { localStorage.setItem(MQTT_PREF, $('toggleMqtt').checked ? '1' : '0'); } catch (e) { /* noop */ }
  applyMqttSetting();
});

// ---- Historial local ----
const refreshHistory = () => TP.store.render($('historyList'), $('historySummary'));
$('btnExportHistory').addEventListener('click', () => TP.store.download('viajes-conductor.json', TP.store.exportJson()));
$('btnClearHistory').addEventListener('click', () => {
  if (confirm('¿Borrar todo el historial de este dispositivo? No se puede deshacer.')) { TP.store.clearHistory(); refreshHistory(); }
});
refreshHistory();

runIntegrityCheck();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('../sw.js?v=8', { scope: '../' }).catch(() => {}));
}
