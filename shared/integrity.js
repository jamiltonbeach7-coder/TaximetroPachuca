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

  /**
   * @param {string} baseUrl ruta relativa a la raíz del sitio ('./' o '../')
   * @returns {Promise<{ok:boolean, rootHash:string, mismatches:string[], error?:string}>}
   */
  async function verify(baseUrl) {
    const base = new URL(baseUrl || './', location.href);
    try {
      if (!(crypto && crypto.subtle)) throw new Error('crypto.subtle no disponible (requiere HTTPS)');
      const manifest = await (await fetch(new URL('integrity.json', base), { cache: 'no-store' })).json();
      const mismatches = [];
      const actual = {};
      await Promise.all(Object.keys(manifest.files).map(async (path) => {
        try {
          const res = await fetch(new URL(path, base), { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          actual[path] = await sha256Hex(await res.arrayBuffer());
          if (actual[path] !== manifest.files[path]) mismatches.push(path);
        } catch (e) {
          mismatches.push(path);
        }
      }));
      const declaredRoot = await computeRootHash(manifest.files);
      if (declaredRoot !== manifest.rootHash) mismatches.push('integrity.json');
      return { ok: mismatches.length === 0, rootHash: manifest.rootHash, mismatches: mismatches.sort() };
    } catch (err) {
      return { ok: false, rootHash: '', mismatches: [], error: String(err.message || err) };
    }
  }

  const TP = root.TP = root.TP || {};
  TP.integrity = { verify, sha256Hex, computeRootHash };
})(window);
