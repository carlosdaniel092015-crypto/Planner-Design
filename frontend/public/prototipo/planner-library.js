(function () {
  const DB = 'stephanny-planner-library', ST = 'items';
  let dbp = null;
  function open() {
    return dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  }
  function tx(mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(ST, mode), req = fn(t.objectStore(ST));
      t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
      t.onerror = () => rej(t.error);
    }));
  }
  function avgColor(url) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 16;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 16, 16);
        const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4, hx = v => Math.round(v / n).toString(16).padStart(2, '0');
        res('#' + hx(r) + hx(gg) + hx(b));
      };
      img.onerror = () => res('#b0a898');
      img.src = url;
    });
  }
  window.SPLib = {
    all: () => tx('readonly', s => s.getAll()).catch(() => []),
    put: item => tx('readwrite', s => s.put(item)).catch(() => null),
    del: id => tx('readwrite', s => s.delete(id)).catch(() => null),
    avgColor
  };
})();
