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

function renderTick(d) {
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
  const chk = $('fareCheck');
  chk.textContent = lastTotalOk ? '✅ Total coincide con el del pasajero' : `⚠️ El pasajero reporta $${num(d.total).toFixed(2)} (difiere $${diff.toFixed(2)})`;
  chk.className = 'text-xs mt-2 ' + (lastTotalOk ? 'text-emerald-400' : 'text-red-400 font-bold');
}

function createSync() {
  sync = new TP.Sync({
    role: 'driver',
    getIntegrity: () => ({ rootHash: integrityState.rootHash, integrityOk: integrityState.ok }),
    onState: (st) => {
      const labels = { idle: 'Sin vincular', pairing: 'Emparejando…', connected: '✅ Conectado', disconnected: '⚠️ Desconectado', error: '⚠️ Mensaje rechazado' };
      $('connBadge').textContent = labels[st] || st;
      if (st === 'connected') $('pairStatus').textContent = 'Conectado. Esperando datos del viaje…';
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

async function acceptOffer(code) {
  try {
    if (!window.RTCPeerConnection) throw new Error('Este navegador no soporta WebRTC');
    $('pairStatus').textContent = 'Generando respuesta…';
    if (!sync) createSync();
    const answer = await sync.acceptOffer(code);
    $('answerCode').value = answer;
    $('answerBox').classList.remove('hidden');
    try { await TP.qr.render($('answerQr'), answer); } catch (e) { $('answerQr').classList.add('hidden'); }
    $('pairStatus').textContent = 'Muestra el QR de respuesta al pasajero.';
  } catch (e) {
    $('pairStatus').textContent = 'Código inválido: ' + e.message;
  }
}

$('btnAcceptOffer').addEventListener('click', () => acceptOffer($('offerCode').value));
$('btnScanOffer').addEventListener('click', async () => {
  $('scanVideo').classList.remove('hidden');
  stopScan = await TP.qr.scan($('scanVideo'), (text) => {
    $('scanVideo').classList.add('hidden'); stopScan = null; $('offerCode').value = text; acceptOffer(text);
  }, () => { $('scanVideo').classList.add('hidden'); $('pairStatus').textContent = 'No se pudo abrir la cámara; pega el código.'; });
});
$('btnCopyAnswer').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText($('answerCode').value); });

runIntegrityCheck();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('../sw.js?v=8', { scope: '../' }).catch(() => {}));
}
