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
  async function encodeDesc(desc) {
    const raw = enc.encode(JSON.stringify({ t: desc.type, s: desc.sdp }));
    if (typeof CompressionStream === 'function') {
      return 'TP1.' + toB64Url(await pipe(raw, new CompressionStream('deflate-raw')));
    }
    return 'TP0.' + toB64Url(raw);
  }
  async function decodeDesc(code) {
    code = String(code || '').trim();
    const [prefix, body] = [code.slice(0, 4), code.slice(4)];
    let raw;
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
      this.pc.addEventListener('connectionstatechange', () => {
        const s = this.pc && this.pc.connectionState;
        if (s === 'failed' || s === 'disconnected' || s === 'closed') {
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

    /** Si no se conecta a tiempo (p. ej. redes distintas), avisa para ofrecer el modo sin conexión. */
    _watchTimeout(ms = 25000) {
      clearTimeout(this._timer);
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
    async encode(data, rootHash) {
      const raw = enc.encode(JSON.stringify({ d: data, h: rootHash || '', ts: Date.now() }));
      const body = typeof CompressionStream === 'function'
        ? 'TPR1.' + toB64Url(await pipe(raw, new CompressionStream('deflate-raw')))
        : 'TPR0.' + toB64Url(raw);
      const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(body)));
      const hex = Array.from(sum.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
      return body + '.' + hex;
    },
    async decode(code) {
      code = String(code || '').trim();
      const dot = code.lastIndexOf('.');
      const body = code.slice(0, dot), hex = code.slice(dot + 1);
      const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(body)));
      const expected = Array.from(sum.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (!body.startsWith('TPR') || !sameHex(expected, hex)) throw new Error('Código dañado o incompleto (el checksum no coincide)');
      const bytes = fromB64Url(body.slice(5));
      const raw = body.startsWith('TPR1.') ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
      const o = JSON.parse(dec.decode(raw));
      return { data: o.d, rootHash: o.h, ts: o.ts };
    }
  };

  const TP = root.TP = root.TP || {};
  TP.Sync = Sync;
  TP.Snapshot = Snapshot;
  TP.qr = { render: renderQR, scan: scanQR };
})(window);
