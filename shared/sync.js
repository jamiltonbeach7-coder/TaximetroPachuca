/**
 * Taxímetro Pachuca - Sincronización P2P entre pasajero y conductor
 * WebRTC (RTCDataChannel) con emparejamiento manual por QR / código (sin servidor).
 * Cada mensaje viaja con número de secuencia y HMAC-SHA-256 derivado del intercambio de códigos.
 *
 * Flujo: pasajero createOffer() -> conductor acceptOffer(offer) -> pasajero acceptAnswer(answer)
 */
(function (root) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  // ---------- Utilidades de codificación ----------
  function toB64Url(bytes) {
    let bin = '';
    bytes.forEach(b => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64Url(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  }
  async function pipe(bytes, stream) {
    const out = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  // SDP compacto: solo ufrag, pwd, huella, rol y hasta 4 candidatos UDP IPv4 (QR mucho más corto).
  function compactDesc(desc) {
    const sdp = desc.sdp;
    const g = (re) => { const m = sdp.match(re); return m ? m[1].trim() : null; };
    const u = g(/a=ice-ufrag:(.+)/), p = g(/a=ice-pwd:(.+)/), f = g(/a=fingerprint:sha-256 (.+)/), st = g(/a=setup:(.+)/);
    if (!u || !p || !f || !st || !/m=application/.test(sdp)) return null;
    const all = [...sdp.matchAll(/a=candidate:(.+)/g)].map(m => m[1].trim())
      .filter(c => / udp /i.test(c) && !(c.split(' ')[4] || ':').includes(':'));
    const srflx = all.filter(c => / typ srflx/.test(c)).slice(0, 2);
    const host = all.filter(c => / typ host/.test(c)).slice(0, 2);
    const fpBytes = f.split(':').map(h => parseInt(h, 16));
    return { t: desc.type, u, p, f: toB64Url(Uint8Array.from(fpBytes)), s: st, c: [...host, ...srflx] };
  }
  function expandDesc(o) {
    const fp = Array.from(fromB64Url(o.f)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
    const lines = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:' + o.u, 'a=ice-pwd:' + o.p, 'a=ice-options:trickle', 'a=fingerprint:sha-256 ' + fp,
      'a=setup:' + o.s, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144',
      ...o.c.map(c => 'a=candidate:' + c), 'a=end-of-candidates'];
    return { type: o.t, sdp: lines.join('\r\n') + '\r\n' };
  }
  async function encodeDesc(desc) {
    const compact = compactDesc(desc);
    const hasDeflate = typeof CompressionStream === 'function';
    if (compact) {
      const raw = enc.encode(JSON.stringify(compact));
      return 'TP2.' + toB64Url(hasDeflate ? await pipe(raw, new CompressionStream('deflate-raw')) : raw) + (hasDeflate ? '' : '~');
    }
    const raw = enc.encode(JSON.stringify({ t: desc.type, s: desc.sdp }));
    return hasDeflate ? 'TP1.' + toB64Url(await pipe(raw, new CompressionStream('deflate-raw'))) : 'TP0.' + toB64Url(raw);
  }
  async function decodeDesc(code) {
    code = String(code || '').trim();
    const prefix = code.slice(0, 4);
    let body = code.slice(4);
    let raw;
    if (prefix === 'TP2.') {
      const plain = body.endsWith('~');
      if (plain) body = body.slice(0, -1);
      raw = plain ? fromB64Url(body) : await pipe(fromB64Url(body), new DecompressionStream('deflate-raw'));
      return expandDesc(JSON.parse(dec.decode(raw)));
    }
    if (prefix === 'TP1.') raw = await pipe(fromB64Url(body), new DecompressionStream('deflate-raw'));
    else if (prefix === 'TP0.') raw = fromB64Url(body);
    else throw new Error('Código de emparejamiento inválido');
    const o = JSON.parse(dec.decode(raw));
    return { type: o.t, sdp: o.s };
  }

  async function hmacKey(secret) {
    const keyBytes = await crypto.subtle.digest('SHA-256', enc.encode(secret));
    return crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  async function hmacHex(key, text) {
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function sameHex(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function waitIceComplete(pc, timeoutMs = 4000) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => { pc.removeEventListener('icegatheringstatechange', check); resolve(); };
      const check = () => { if (pc.iceGatheringState === 'complete') done(); };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(done, timeoutMs);
    });
  }

  /**
   * @param {object} opts
   * @param {'passenger'|'driver'} opts.role
   * @param {(type:string, data:object)=>void} opts.onMessage  mensajes verificados
   * @param {(state:string)=>void} opts.onState  'idle'|'pairing'|'connected'|'disconnected'|'error'
   * @param {(code:string)=>void} [opts.onVerifyCode]  código de 4 dígitos a comparar a simple vista
   * @param {(info:{rootHash:string, role:string})=>void} [opts.onHello]
   * @param {()=>({rootHash:string, integrityOk:boolean})} [opts.getIntegrity]
   */
  class Sync {
    constructor(opts) {
      this.opts = opts;
      this.pc = null;
      this.channel = null;
      this.key = null;
      this.sendSeq = 0;
      this.lastRecvSeq = 0;
      this.blocked = false; // true si el hash de la app del otro lado no coincide
      this.connected = false;
    }

    _setup() {
      this.close(true);
      this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.sendSeq = 0;
      this.lastRecvSeq = 0;
      this.blocked = false;
      this.opts.onState('pairing');
      this.diag = { host: 0, srflx: 0, relay: 0, mdns: 0, remote: 0 };
      this.pc.addEventListener('icecandidate', (ev) => {
        if (!ev.candidate) return;
        const c = ev.candidate.candidate || '';
        const m = c.match(/ typ (\w+)/);
        if (m && this.diag[m[1]] !== undefined) this.diag[m[1]]++;
        if (/\.local /.test(c)) this.diag.mdns++;
      });
      this.pc.addEventListener('connectionstatechange', () => {
        const s = this.pc && this.pc.connectionState;
        clearTimeout(this._lostTimer);
        if (s === 'connected') {
          // Se recuperó de una desconexión transitoria
          if (this.channel && this.channel.readyState === 'open' && !this.connected) { this.connected = true; this.opts.onState('connected'); }
        } else if (s === 'disconnected') {
          // 'disconnected' suele ser transitorio (cambio de red, ahorro de energía): damos 8 s de gracia
          this._lostTimer = setTimeout(() => {
            if (this.pc && this.pc.connectionState !== 'connected') { this.connected = false; this.opts.onState('disconnected'); }
          }, 8000);
        } else if (s === 'failed' || s === 'closed') {
          this.connected = false;
          this.opts.onState('disconnected');
        }
      });
    }

    _bindChannel(channel) {
      this.channel = channel;
      channel.addEventListener('open', () => {
        this.connected = true;
        this.opts.onState('connected');
        const info = this.opts.getIntegrity ? this.opts.getIntegrity() : { rootHash: '', integrityOk: false };
        this.send('hello', { role: this.opts.role, rootHash: info.rootHash, integrityOk: info.integrityOk }, true);
      });
      channel.addEventListener('close', () => {
        this.connected = false;
        this.opts.onState('disconnected');
      });
      channel.addEventListener('message', (ev) => this._receive(ev.data));
    }

    async _deriveKey(offerCode, answerCode) {
      const secret = offerCode + '|' + answerCode;
      this.key = await hmacKey(secret);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('verify|' + secret)));
      const num = ((digest[0] << 8) | digest[1]) % 10000;
      if (this.opts.onVerifyCode) this.opts.onVerifyCode(String(num).padStart(4, '0'));
    }

    async createOffer() {
      this._setup();
      this._bindChannel(this.pc.createDataChannel('taximetro', { ordered: true }));
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await waitIceComplete(this.pc);
      this._offerCode = await encodeDesc(this.pc.localDescription);
      return this._offerCode;
    }

    async acceptOffer(offerCode) {
      this._setup();
      this.pc.addEventListener('datachannel', (ev) => this._bindChannel(ev.channel));
      await this.pc.setRemoteDescription(await decodeDesc(offerCode));
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await waitIceComplete(this.pc);
      const answerCode = await encodeDesc(this.pc.localDescription);
      await this._deriveKey(offerCode.trim(), answerCode);
      this._watchTimeout(60000);
      return answerCode;
    }

    async acceptAnswer(answerCode) {
      if (!this.pc || !this._offerCode) throw new Error('Primero genera el código de invitación');
      await this._deriveKey(this._offerCode, answerCode.trim());
      await this.pc.setRemoteDescription(await decodeDesc(answerCode));
      this._watchTimeout();
    }

    /** Resumen legible del estado de la conexión para mostrar al usuario. */
    getDiagnostics() {
      if (!this.pc) return '';
      const d = this.diag || {};
      const remote = ((this.pc.remoteDescription && this.pc.remoteDescription.sdp) || '').split('a=candidate:').length - 1;
      return `Rutas propias: ${d.host || 0} locales${d.mdns ? ' (ocultas mDNS)' : ''}, ${d.srflx || 0} públicas · rutas del otro: ${remote} · ICE: ${this.pc.iceConnectionState} · conexión: ${this.pc.connectionState}`;
    }

    /** Si no se conecta a tiempo (p. ej. redes distintas), avisa para ofrecer el modo sin conexión. */
    _watchTimeout(ms = 25000) {
      clearTimeout(this._timer);
      clearTimeout(this._lostTimer);
      const pc = this.pc;
      this._timer = setTimeout(() => {
        if (this.pc === pc && !this.connected) this.opts.onState('timeout');
      }, ms);
    }

    async send(type, data, force) {
      if (!this.channel || this.channel.readyState !== 'open' || !this.key) return false;
      if (this.blocked && !force) return false;
      const seq = ++this.sendSeq;
      const p = JSON.stringify({ type, data });
      const mac = await hmacHex(this.key, seq + '|' + p);
      this.channel.send(JSON.stringify({ seq, p, mac }));
      return true;
    }

    async _receive(raw) {
      try {
        const msg = JSON.parse(raw);
        const expected = await hmacHex(this.key, msg.seq + '|' + msg.p);
        if (!sameHex(expected, String(msg.mac)) || !(msg.seq > this.lastRecvSeq)) {
          this.opts.onState('error');
          console.warn('Mensaje descartado: firma inválida o repetido');
          if (this.opts.onReject) this.opts.onReject();
          return;
        }
        this.lastRecvSeq = msg.seq;
        const { type, data } = JSON.parse(msg.p);
        if (type === 'hello') {
          const mine = this.opts.getIntegrity ? this.opts.getIntegrity() : { rootHash: '' };
          this.blocked = !data.rootHash || data.rootHash !== mine.rootHash || !data.integrityOk;
          if (this.opts.onHello) this.opts.onHello({ ...data, mismatch: this.blocked });
          return;
        }
        this.opts.onMessage(type, data);
      } catch (e) {
        console.warn('Mensaje inválido', e);
        if (this.opts.onReject) this.opts.onReject();
      }
    }

    /** Permite continuar a pesar de que los hashes de las apps no coinciden. */
    unblock() { this.blocked = false; }

    close(silent) {
      clearTimeout(this._timer);
      try { if (this.channel) this.channel.close(); } catch (e) { /* noop */ }
      try { if (this.pc) this.pc.close(); } catch (e) { /* noop */ }
      this.channel = null;
      this.pc = null;
      this.key = null;
      this.connected = false;
      if (!silent) this.opts.onState('idle');
    }
  }

  // ---------- QR: generación y escaneo (librerías cargadas bajo demanda) ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function renderQR(container, text) {
    if (!root.qrcode) await loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js');
    const qr = root.qrcode(0, 'L');
    qr.addData(text);
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    const svg = container.querySelector('svg');
    if (svg) { svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.background = '#fff'; }
  }

  /** Abre la cámara y llama onResult(texto) al leer un QR. Devuelve función stop(). */
  async function scanQR(videoEl, onResult, onError) {
    let stopped = false;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
      if (onError) onError(e);
      return () => {};
    }
    videoEl.srcObject = stream;
    await videoEl.play();
    const stop = () => { stopped = true; stream.getTracks().forEach(t => t.stop()); videoEl.srcObject = null; };

    let detector = null;
    if ('BarcodeDetector' in root) {
      try { detector = new root.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
    }
    if (!detector && !root.jsQR) await loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (stopped) return;
      if (videoEl.readyState >= 2) {
        try {
          let text = null;
          if (detector) {
            const found = await detector.detect(videoEl);
            if (found.length) text = found[0].rawValue;
          } else {
            canvas.width = videoEl.videoWidth; canvas.height = videoEl.videoHeight;
            ctx.drawImage(videoEl, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const res = root.jsQR(img.data, img.width, img.height);
            if (res) text = res.data;
          }
          if (text) { stop(); onResult(text); return; }
        } catch (e) { /* frame no legible */ }
      }
      setTimeout(tick, 200);
    };
    tick();
    return stop;
  }

  // ---------- Resumen de viaje sin conexión (plan B cuando falla el emparejamiento) ----------
  // Código = "TPR1." + deflate(JSON) en base64url + "." + 8 hex de SHA-256 (detecta errores de copiado/alteración).
  // Sin clave compartida NO autentica al emisor: el conductor debe recalcular y comparar el total.
  const Snapshot = {
    async encode(data, rootHash, key) {
      const payload = { d: data, h: rootHash || '', ts: Date.now() };
      if (key) payload.m = await hmacHex(key, payload.ts + '|' + JSON.stringify(payload.d) + '|' + payload.h);
      const raw = enc.encode(JSON.stringify(payload));
      const body = typeof CompressionStream === 'function'
        ? 'TPR1.' + toB64Url(await pipe(raw, new CompressionStream('deflate-raw')))
        : 'TPR0.' + toB64Url(raw);
      const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(body)));
      const hex = Array.from(sum.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
      return body + '.' + hex;
    },
    /** authentic: true (firma válida), false (firma inválida o falta), null (sin clave local para comprobar) */
    async decode(code, key) {
      code = String(code || '').trim();
      const dot = code.lastIndexOf('.');
      const body = code.slice(0, dot), hex = code.slice(dot + 1);
      const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(body)));
      const expected = Array.from(sum.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (!body.startsWith('TPR') || !sameHex(expected, hex)) throw new Error('Código dañado o incompleto (el checksum no coincide)');
      const bytes = fromB64Url(body.slice(5));
      const raw = body.startsWith('TPR1.') ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
      const o = JSON.parse(dec.decode(raw));
      let authentic = null;
      if (key) {
        authentic = !!o.m && sameHex(await hmacHex(key, o.ts + '|' + JSON.stringify(o.d) + '|' + o.h), String(o.m));
      }
      return { data: o.d, rootHash: o.h, ts: o.ts, signed: !!o.m, authentic };
    }
  };

  // ---------- Sincronización solo por QR (sin WebRTC): acuerdo de clave ECDH P-256 ----------
  // Código = "TPK1." + llave pública (b64url) + "." + 16 hex del hash raíz de la app.
  // Tras intercambiar los dos códigos ambos tienen la misma clave HMAC (se guarda en este dispositivo).
  const STORE_KEY = 'tp_offline_pair' + (location.pathname.indexOf('/conductor') !== -1 ? '_d' : '_p'); // una clave por app
  class OfflinePair {
    constructor() { this.keyPair = null; this.myPub = null; this.myCode = null; }

    async _ensureKeys(rootHash) {
      if (this.keyPair) return false;
      this.keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
      // La llave privada no es exportable, la pública sí
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', this.keyPair.publicKey));
      this.myPub = toB64Url(raw);
      this.myCode = 'TPK1.' + this.myPub + '.' + String(rootHash || '').slice(0, 16);
      return true;
    }

    /** Genera mi código (si aún no existe) para mostrarlo como QR. */
    async start(rootHash) {
      await this._ensureKeys(rootHash);
      return this.myCode;
    }

    /** Procesa el código del otro. Devuelve {replyCode|null, verifyCode, mismatch, secret}. */
    async accept(code, rootHash) {
      const parts = String(code || '').trim().split('.');
      if (parts[0] !== 'TPK1' || !parts[1]) throw new Error('Código de sincronización inválido');
      const created = await this._ensureKeys(rootHash);
      const peerRaw = fromB64Url(parts[1]);
      const peerKey = await crypto.subtle.importKey('raw', peerRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peerKey }, this.keyPair.privateKey, 256));
      const pubs = [this.myPub, parts[1]].sort().join('|');
      const secretBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(toB64Url(bits) + '|' + pubs)));
      const secret = toB64Url(secretBytes);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('verify|' + secret)));
      const verifyCode = String(((digest[0] << 8) | digest[1]) % 10000).padStart(4, '0');
      const mismatch = !!(parts[2] && rootHash && parts[2] !== String(rootHash).slice(0, 16));
      return { replyCode: created ? this.myCode : null, verifyCode, mismatch, secret, peerRoot: parts[2] || '' };
    }

    static save(secret) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify({ s: secret, ts: Date.now() })); } catch (e) { /* sin almacenamiento */ }
    }
    static async load() {
      try {
        const o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (o && o.s) return { key: await hmacKey(o.s), ts: o.ts, secret: o.s };
      } catch (e) { /* ignorar */ }
      return null;
    }
    static async keyFrom(secret) { return hmacKey(secret); }
    static clear() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* noop */ } }
  }

  /** Identifica qué tipo de código es: 'offer' | 'answer' | 'offline' | 'snapshot' | 'invalid'. */
  async function classify(raw) {
    const code = String(raw || '').trim();
    if (code.startsWith('TPK1.')) return 'offline';
    if (code.startsWith('TPR')) return 'snapshot';
    if (/^TP[012]\./.test(code)) {
      try { return (await decodeDesc(code)).type === 'offer' ? 'offer' : 'answer'; } catch (e) { return 'invalid'; }
    }
    return 'invalid';
  }

  const TP = root.TP = root.TP || {};
  TP.classify = classify;
  TP.Sync = Sync;
  TP.Snapshot = Snapshot;
  TP.OfflinePair = OfflinePair;
  TP.qr = { render: renderQR, scan: scanQR };
})(window);
