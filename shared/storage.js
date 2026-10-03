/**
 * Taxímetro Pachuca - Almacenamiento local (solo en este dispositivo, nada se envía a la nube)
 * Historial de viajes y viaje en curso, en localStorage con tope y manejo de errores.
 */
(function (root) {
  const MAX_TRIPS = 300;
  const role = location.pathname.indexOf('/conductor') !== -1 ? 'd' : 'p'; // un almacén por app
  const HIST_KEY = 'tp_hist_' + role;
  const ACTIVE_KEY = 'tp_active_' + role;

  function read(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v === null || v === undefined ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  const store = {
    history() { return read(HIST_KEY, []); },
    /** Agrega o actualiza (por id) un viaje; el más reciente primero. */
    addTrip(trip) {
      const h = read(HIST_KEY, []);
      const i = h.findIndex(t => t.id === trip.id);
      if (i >= 0) h[i] = Object.assign({}, h[i], trip); else h.unshift(trip);
      return write(HIST_KEY, h.slice(0, MAX_TRIPS));
    },
    removeTrip(id) { write(HIST_KEY, read(HIST_KEY, []).filter(t => t.id !== id)); },
    clearHistory() { try { localStorage.removeItem(HIST_KEY); } catch (e) { /* noop */ } },
    saveActive(obj) { return write(ACTIVE_KEY, obj); },
    loadActive() { return read(ACTIVE_KEY, null); },
    clearActive() { try { localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* noop */ } },

    exportJson() {
      return JSON.stringify({ app: 'taximetro-pachuca', rol: role === 'd' ? 'conductor' : 'pasajero', exportado: new Date().toISOString(), viajes: read(HIST_KEY, []) }, null, 2);
    },
    download(filename, text) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },

    /** Pinta la lista (con textContent, sin HTML) y enlaza borrar/exportar. */
    render(listEl, summaryEl) {
      const trips = store.history();
      listEl.textContent = '';
      let sum = 0;
      trips.forEach((t) => {
        sum += Number(t.total) || 0;
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs';
        const info = document.createElement('div');
        const d = new Date(t.ts || t.id);
        const l1 = document.createElement('div');
        l1.className = 'font-bold text-slate-100';
        l1.textContent = `$${Number(t.total).toFixed(2)} · ${Number(t.distanceKm).toFixed(2)} km · ${Math.round((t.elapsedSeconds || 0) / 60)} min`;
        const l2 = document.createElement('div');
        l2.className = 'text-slate-400';
        l2.textContent = `${d.toLocaleString('es-MX')}${t.tariffName ? ' · ' + t.tariffName : ''}${t.source ? ' · ' + t.source : ''}`;
        info.appendChild(l1); info.appendChild(l2);
        const del = document.createElement('button');
        del.className = 'text-red-300 hover:text-red-200 font-bold px-2';
        del.textContent = '✕';
        del.setAttribute('aria-label', 'Borrar este viaje');
        del.addEventListener('click', () => { store.removeTrip(t.id); store.render(listEl, summaryEl); });
        row.appendChild(info); row.appendChild(del);
        listEl.appendChild(row);
      });
      if (!trips.length) {
        const empty = document.createElement('p');
        empty.className = 'text-xs text-slate-400';
        empty.textContent = 'Aún no hay viajes guardados en este dispositivo.';
        listEl.appendChild(empty);
      }
      if (summaryEl) summaryEl.textContent = trips.length ? `${trips.length} viaje(s) · total acumulado $${sum.toFixed(2)}` : '';
    }
  };

  const TP = root.TP = root.TP || {};
  TP.store = store;
})(window);
