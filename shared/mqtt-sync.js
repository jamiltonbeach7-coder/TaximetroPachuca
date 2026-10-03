/**
 * Taxímetro Pachuca - Seguimiento en vivo por MQTT cifrado (opcional)
 * Funciona entre redes distintas: ambos dispositivos solo hacen una conexión saliente (WSS) a un broker
 * público que reenvía mensajes. El broker NO guarda nada (QoS 0, sin retain) y solo ve bytes cifrados.
 *
 * Requiere el secreto del emparejamiento por QR (TP.OfflinePair): de él se derivan el tema (topic)
 * y la clave AES-GCM; ninguno de los dos sale de los dispositivos.
 */
(function (root) {
  const BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
  const MQTT_LIB = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js';
  const MQTT_SRI = 'sha384-u4uqeACkFcoKl57rBQJHVGDd1pqhW4w8X3WjTu1ZksPdxoLqdt34jpoNkJisE25W';
  const HEARTBEAT_MS = 5000;
  const PEER_TIMEOUT_MS = 16000;
  const MAX_SKEW_MS = 5 * 60 * 1000;

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(bytes) { let s = ''; bytes.forEach(b => (s += String.fromCharCode(b))); return btoa(s); }
  function unb64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
  async function sha256(text) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))); }

  function loadLib() {
    if (root.mqtt) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = MQTT_LIB; s.integrity = MQTT_SRI; s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar la librería MQTT'));
      document.head.appendChild(s);
    });
  }

  /**
   * @param {object} o
   * @param {'p'|'d'} o.role  p = pasajero, d = conductor
   * @param {string} o.secret secreto del emparejamiento por QR
   * @param {(type:string, data:object)=>void} o.onMessage
   * @param {(state:'connecting'|'broker'|'peer'|'offline'|'error', detail?:string)=>void} o.onState
   * @param {()=>({rootHash:string})} [o.getIntegrity]
   * @param {(info:{rootHash:string, mismatch:boolean})=>void} [o.onHello]
   */
  class MqttLink {
    constructor(o) {
      this.o = o;
      this.client = null;
      this.topic = null;
      this.aesKey = null;
      this.seqBase = 0;
      this.seq = 0;
      this.lastSeqFrom = 0;
      this.peerSeenAt = 0;
      this.state = 'offline';
      this._hb = null;
      this._watch = null;
    }

    _set(state, detail) {
      if (this.state === state && !detail) return;
      this.state = state;
      this.o.onState(state, detail);
    }

    get peerAlive() { return Date.now() - this.peerSeenAt < PEER_TIMEOUT_MS; }

    async start() {
      this.stop(true);
      this._set('connecting');
      try {
        const id = Array.from(await sha256('topic|' + this.o.secret)).slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
        this.topic = 'taximetro-pachuca/v1/' + id;
        this.aesKey = await crypto.subtle.importKey('raw', await sha256('aes|' + this.o.secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
        await loadLib();
        this.seqBase = Date.now() * 1000; // monótono incluso tras recargar
        this.seq = 0;
        this.lastSeqFrom = 0;
        const clientId = 'tp_' + this.o.role + '_' + Math.random().toString(16).slice(2, 10);
        this.client = root.mqtt.connect(BROKER_URL, { clientId, clean: true, reconnectPeriod: 3000, connectTimeout: 10000, keepalive: 30 });
        this.client.on('connect', () => {
          this._set('broker');
          this.client.subscribe(this.topic, { qos: 0 });
          this._hello();
        });
        this.client.on('close', () => { if (this.state !== 'offline') this._set('connecting'); });
        this.client.on('error', (e) => this._set('error', String((e && e.message) || e)));
        this.client.on('message', (t, payload) => this._receive(payload));
        this._hb = setInterval(() => { this.send('ping', {}); }, HEARTBEAT_MS);
        this._watch = setInterval(() => {
          if (this.state === 'peer' && !this.peerAlive) this._set('broker');
        }, 2000);
      } catch (e) {
        this._set('error', String((e && e.message) || e));
      }
    }

    async _encrypt(obj) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.aesKey, enc.encode(JSON.stringify(obj))));
      return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
    }

    async _hello() {
      const info = this.o.getIntegrity ? this.o.getIntegrity() : { rootHash: '' };
      await this.send('hello', { rootHash: info.rootHash || '' });
    }

    /** Publica un mensaje cifrado (QoS 0, sin retención). */
    async send(type, data) {
      if (!this.client || !this.client.connected || !this.aesKey) return false;
      const msg = { s: this.o.role, q: this.seqBase + (++this.seq), ts: Date.now(), t: type, d: data };
      try {
        this.client.publish(this.topic, await this._encrypt(msg), { qos: 0, retain: false });
        return true;
      } catch (e) { return false; }
    }

    async _receive(payload) {
      try {
        const env = JSON.parse(dec.decode(payload));
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, this.aesKey, unb64(env.ct));
        const msg = JSON.parse(dec.decode(plain));
        if (msg.s === this.o.role) return; // mi propio eco
        if (Math.abs(Date.now() - msg.ts) > MAX_SKEW_MS) return; // mensaje viejo o reloj muy desfasado
        if (!(msg.q > this.lastSeqFrom)) return; // repetido
        this.lastSeqFrom = msg.q;
        const first = !this.peerAlive;
        this.peerSeenAt = Date.now();
        if (this.state !== 'peer') this._set('peer');
        if (msg.t === 'hello') {
          const mine = this.o.getIntegrity ? this.o.getIntegrity() : { rootHash: '' };
          if (this.o.onHello) this.o.onHello({ rootHash: msg.d.rootHash, mismatch: !!(msg.d.rootHash && mine.rootHash && msg.d.rootHash !== mine.rootHash) });
          if (first) this._hello(); // responde para que el que llegó después también me vea
          return;
        }
        if (msg.t === 'ping') return;
        this.o.onMessage(msg.t, msg.d);
      } catch (e) {
        // Mensaje que no se puede descifrar/validar (otra clave o manipulado): se ignora
      }
    }

    stop(silent) {
      clearInterval(this._hb); clearInterval(this._watch);
      if (this.client) { try { this.client.end(true); } catch (e) { /* noop */ } }
      this.client = null;
      this.peerSeenAt = 0;
      if (!silent) this._set('offline');
    }
  }

  const TP = root.TP = root.TP || {};
  TP.MqttLink = MqttLink;
})(window);
