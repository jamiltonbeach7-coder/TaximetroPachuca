/**
 * Taxímetro Pachuca - Verificación de integridad (SHA-256)
 * Descarga cada archivo listado en integrity.json, calcula su hash y lo compara.
 * El hash raíz = SHA-256 de las líneas "ruta:hash\n" ordenadas por ruta.
 */
(function (root) {
  async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function computeRootHash(files) {
    const lines = Object.keys(files).sort().map(p => `${p}:${files[p]}\n`).join('');
    return sha256Hex(new TextEncoder().encode(lines));
  }

  async function verifyOnce(base) {
    const bust = '?i=' + Date.now(); // evita cachés intermedias (CDN, Service Worker)
    const manifest = await (await fetch(new URL('integrity.json', base) + bust, { cache: 'no-store' })).json();
    const details = [];
    await Promise.all(Object.keys(manifest.files).map(async (path) => {
      try {
        const res = await fetch(new URL(path, base) + bust, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const got = await sha256Hex(await res.arrayBuffer());
        if (got !== manifest.files[path]) details.push({ path, reason: 'hash distinto (' + got.slice(0, 8) + ' ≠ ' + manifest.files[path].slice(0, 8) + ')' });
      } catch (e) {
        details.push({ path, reason: 'no se pudo descargar: ' + (e.message || e) });
      }
    }));
    const declaredRoot = await computeRootHash(manifest.files);
    if (declaredRoot !== manifest.rootHash) details.push({ path: 'integrity.json', reason: 'hash raíz inconsistente' });
    details.sort((x, y) => x.path.localeCompare(y.path));
    return { ok: details.length === 0, rootHash: manifest.rootHash, details };
  }

  /**
   * Verifica todos los archivos; si hay diferencias reintenta una vez tras unos segundos
   * (tras un despliegue las cachés pueden tardar en actualizarse).
   * @param {string} baseUrl ruta relativa a la raíz del sitio ('./' o '../')
   * @returns {Promise<{ok:boolean, rootHash:string, mismatches:string[], details:object[], error?:string}>}
   */
  async function verify(baseUrl) {
    const base = new URL(baseUrl || './', location.href);
    try {
      if (!(crypto && crypto.subtle)) throw new Error('crypto.subtle no disponible (requiere HTTPS)');
      let res = await verifyOnce(base);
      if (!res.ok) {
        await new Promise(r => setTimeout(r, 3000));
        res = await verifyOnce(base);
      }
      return { ok: res.ok, rootHash: res.rootHash, mismatches: res.details.map(d => d.path), details: res.details };
    } catch (err) {
      return { ok: false, rootHash: '', mismatches: [], details: [], error: String(err.message || err) };
    }
  }

  const TP = root.TP = root.TP || {};
  TP.integrity = { verify, sha256Hex, computeRootHash };
})(window);
