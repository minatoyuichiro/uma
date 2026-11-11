"use strict";
(() => {
  const SCENES = 6;
  const cache = {};
  const get = (f) => cache[f] || (cache[f] = fetch("data/" + f).then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }));
  window.UMA_NO_H3 = true;
  window.UMA_STATIC = async (path) => {
    const u = new URL(path, "https://x"), p = u.pathname, q = u.searchParams;
    let m;
    if (p === "/api/meta") return get("meta.json");
    if (p === "/api/races/today") return get("today.json");
    if (p === "/api/races/past") return get("past.json");
    if (p === "/api/jockeys") return get("jockeys.json");
    if (p === "/api/horses") {
      const s = q.get("q") || "", sort = q.get("sort") || "wins", lim = +(q.get("limit") || 50);
      const cmp = {
        wins: (a, b) => b.wins - a.wins || b.starts - a.starts,
        starts: (a, b) => b.starts - a.starts,
        name: (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
        rate: (a, b) => (b.win_rate || 0) - (a.win_rate || 0) || b.starts - a.starts
      }[sort] || ((a, b) => b.wins - a.wins);
      return (await get("horses.json")).filter((h) => h.name.includes(s)).sort(cmp).slice(0, lim);
    }
    if (m = p.match(/^\/api\/horse\/(\d+)$/)) return get(`horse/${m[1]}.json`);
    if (m = p.match(/^\/api\/race\/(\d+)$/)) return get(`race/${m[1]}.json`);
    if (m = p.match(/^\/api\/race\/(\d+)\/simulate$/)) return get(`sim/${m[1]}.json`);
    if (m = p.match(/^\/api\/race\/(\d+)\/sheet$/)) return get(`sheet/${m[1]}.json`);
    if (m = p.match(/^\/api\/race\/(\d+)\/scene$/)) {
      const seed = +(q.get("seed") || 0), k = seed ? seed % SCENES : Math.floor(Math.random() * SCENES);
      const f = `scene/${m[1]}_${k}.json`;
      const d = await fetch("data/" + f).then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
      return d;
    }
    throw new Error("404 " + p);
  };
})();
