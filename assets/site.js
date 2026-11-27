/* Small, optional enhancements. All content is delivered as static HTML. */
(() => {
  'use strict';
  const root = document.documentElement;
  const themeButton = document.querySelector('.theme-toggle');
  const syncTheme = () => {
    const light = root.dataset.theme === 'light';
    themeButton.setAttribute('aria-label', light ? themeButton.dataset.darkLabel : themeButton.dataset.lightLabel);
    themeButton.title = themeButton.getAttribute('aria-label');
    document.querySelector('meta[name="theme-color"]').content = light ? '#fafaf8' : '#101111';
  };
  if (themeButton) {
    themeButton.hidden = false;
    syncTheme();
    themeButton.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('artun-theme', root.dataset.theme); } catch { /* Storage is optional. */ }
      syncTheme();
      document.dispatchEvent(new Event('themechange'));
    });
    // Without a saved choice, follow the system setting as it changes.
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', event => {
      let saved = null;
      try { saved = localStorage.getItem('artun-theme'); } catch { /* Storage is optional. */ }
      if (saved === 'light' || saved === 'dark') return;
      root.dataset.theme = event.matches ? 'light' : 'dark';
      syncTheme();
      document.dispatchEvent(new Event('themechange'));
    });
  }

  const menuButton = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  if (menuButton && mobileNav) {
    menuButton.hidden = false;
    const closeMenu = () => {
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.textContent = menuButton.dataset.openLabel;
      mobileNav.hidden = true;
    };
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.textContent = open ? menuButton.dataset.closeLabel : menuButton.dataset.openLabel;
      mobileNav.hidden = !open;
    });
    mobileNav.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !mobileNav.hidden) {
        closeMenu();
        menuButton.focus();
      }
    });
    matchMedia('(min-width: 761px)').addEventListener('change', event => {
      if (event.matches) closeMenu();
    });
  }

  const copyButton = document.querySelector('.copy-email');
  if (copyButton && navigator.clipboard && window.isSecureContext) {
    copyButton.hidden = false;
    const status = document.querySelector('.copy-status');
    let clearTimer;
    copyButton.addEventListener('click', async () => {
      clearTimeout(clearTimer);
      try {
        await navigator.clipboard.writeText(copyButton.dataset.email);
        status.textContent = copyButton.dataset.success;
      } catch {
        status.textContent = copyButton.dataset.failure;
      }
      clearTimer = setTimeout(() => { status.textContent = ''; }, 5000);
    });
  }

  const list = document.getElementById('publication-list');
  if (list) {
    const search = document.getElementById('publication-search');
    const filters = [...document.querySelectorAll('[data-filter]')];
    const entries = [...list.querySelectorAll('.publication')];
    const count = document.querySelector('.result-count');
    const empty = document.querySelector('.empty-state');
    const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ı/g, 'i');
    const validTypes = filters.map(button => button.dataset.filter);
    const params = new URLSearchParams(location.search);
    let type = validTypes.includes(params.get('type')) ? params.get('type') : 'all';
    search.value = params.get('q') || '';
    entries.forEach(entry => { entry.searchText = normalize(entry.dataset.search); });
    const applyFilters = () => {
      const words = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
      let visible = 0;
      entries.forEach(entry => {
        const match = (type === 'all' || entry.dataset.type === type) && words.every(word => entry.searchText.includes(word));
        entry.hidden = !match;
        if (match) visible++;
      });
      filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === type)));
      count.textContent = `${visible} ${count.dataset.label}`;
      empty.hidden = visible !== 0;
      const url = new URL(location.href);
      if (search.value.trim()) url.searchParams.set('q', search.value.trim());
      else url.searchParams.delete('q');
      if (type !== 'all') url.searchParams.set('type', type);
      else url.searchParams.delete('type');
      history.replaceState(null, '', url);
    };
    document.querySelector('.archive-tools').hidden = false;
    filters.forEach(button => button.addEventListener('click', () => {
      type = button.dataset.filter;
      applyFilters();
    }));
    search.addEventListener('input', applyFilters);
    document.querySelector('.clear-search').addEventListener('click', () => {
      type = 'all';
      search.value = '';
      applyFilters();
      search.focus();
    });
    applyFilters();
  }

  /* The three artworks share a canvas, motion preference, theme, and scale control. */
  // About mark: irregular data points on a slowly moving surface. Same formula as surface_view in build.py.
  const surface = document.querySelector('.about-mark[data-surface]');
  if (surface && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const { waves, view: [yaw, tilt, focal, scale, ox, oy] } = JSON.parse(surface.dataset.surface);
    const dots = [...surface.querySelectorAll('circle[data-x]')].map(dot => [dot, +dot.dataset.x, +dot.dataset.y]);
    const place = (x, y, t) => {
      let z = 0;
      for (const [a, kx, ky, w, f] of waves) z += a * Math.sin(kx * x + ky * y - w * t + f);
      const xr = x * Math.cos(yaw) - y * Math.sin(yaw);
      const yr = x * Math.sin(yaw) + y * Math.cos(yaw);
      const up = z * Math.cos(tilt) + yr * Math.sin(tilt);
      const depth = yr * Math.cos(tilt) - z * Math.sin(tilt);
      const s = focal / (focal + depth);
      return [ox + scale * xr * s, oy - scale * up * s, 1.15 * s, Math.max(.15, Math.min(.95, .5 + 1.4 * z - .15 * depth))];
    };
    let surfaceFrame = 0;
    let surfaceVisible = false;
    let last = 0;
    let time = 0;
    const step = now => {
      time += Math.min(now - (last || now), 100) / 1000;
      last = now;
      for (const [dot, x, y] of dots) {
        const [px, py, r, alpha] = place(x, y, time);
        dot.setAttribute('cx', px.toFixed(1));
        dot.setAttribute('cy', py.toFixed(1));
        dot.setAttribute('r', r.toFixed(2));
        dot.setAttribute('fill-opacity', alpha.toFixed(2));
      }
      surfaceFrame = surfaceVisible && !document.hidden ? requestAnimationFrame(step) : 0;
    };
    const run = () => {
      if (surfaceVisible && !document.hidden && !surfaceFrame) { last = 0; surfaceFrame = requestAnimationFrame(step); }
    };
    document.addEventListener('visibilitychange', run);
    new IntersectionObserver(entries => { surfaceVisible = entries[0].isIntersecting; run(); }).observe(surface);
  }

  const canvas = document.getElementById('sculpture');
  if (!canvas) return;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;
  const slider = document.getElementById('complexity');
  const pause = document.querySelector('.pause-art');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches || Boolean(navigator.connection?.saveData);
  let visible = true;
  let width = 0;
  let height = 0;
  let frame = 0;
  let last = 0;
  let time = 0;
  let resolution = Number(slider.value) / 100;
  let pointerX = 0;
  let pointerY = 0;
  let color = getComputedStyle(root).getPropertyValue('--art').trim();
  let background = getComputedStyle(root).getPropertyValue('--bg').trim();
  const buttons = Array.from(document.querySelectorAll('[data-art]'));
  const values = { network: 0, spin: 65, diamond: 67 };
  let mode = 'diamond';
  const temperature = () => 5 * resolution ** 1.7;

  const sites = [[-1, 0, 0], [1, 0, 0]];
  const levels = [{ bonds: [[0, 1]], added: [] }];

  // Each parent bond has three equivalent two-bond paths around its axis.
  for (let depth = 1; depth <= 4; depth++) {
    const bonds = [];
    const added = [];
    for (const [start, end] of levels[depth - 1].bonds) {
      const a = sites[start], b = sites[end];
      const axis = b.map((value, i) => value - a[i]);
      const length = Math.hypot(...axis);
      const [dx, dy, dz] = axis.map(value => value / length);
      const horizontal = Math.hypot(dx, dz);
      const normal = horizontal > .0001 ? [-dz / horizontal, 0, dx / horizontal] : [1, 0, 0];
      const [nx, ny, nz] = normal;
      const tangent = [dy * nz - dz * ny, dz * nx - dx * nz, dx * ny - dy * nx];
      const middle = a.map((value, i) => (value + b[i]) / 2);
      for (let branch = 0; branch < 3; branch++) {
        const angle = branch * Math.PI * 2 / 3 + depth * .64;
        const offset = normal.map((v, i) =>
          length * .285 * (v * Math.cos(angle) + tangent[i] * Math.sin(angle)));
        const index = sites.length;
        sites.push(middle.map((value, i) => value + offset[i]));
        added.push({ index, start, end });
        bonds.push([start, index], [index, end]);
      }
    }
    levels.push({ bonds, added });
  }

  const drawDiamond = () => {
    const scale = Math.min(width, height) * .45;
    const depth = 1 + resolution * 3;
    const full = Math.floor(depth);
    const fraction = depth - full;
    const blend = fraction * fraction * (3 - 2 * fraction);
    const next = Math.min(full + 1, levels.length - 1);
    const rotation = .65 + time * .075 + pointerY * .3;
    const tilt = -.55 + pointerX * .18;
    const cr = Math.cos(rotation), sr = Math.sin(rotation);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const lastSite = levels[blend ? next : full].added.at(-1).index;
    const projected = [];
    for (let index = 0; index <= lastSite; index++) {
      const [x, y, z] = sites[index];
      const lateral = y * cr - z * sr;
      const distance = y * sr + z * cr;
      projected.push([
        width * .5 + scale * (x * ct - lateral * st),
        height * .50 + scale * (x * st + lateral * ct),
        distance
      ]);
    }

    context.strokeStyle = context.fillStyle = `rgb(${color})`;
    context.lineCap = 'round';
    const stroke = (bonds, opacity, lineWidth) => {
      context.globalAlpha = opacity;
      context.lineWidth = lineWidth;
      context.beginPath();
      for (const [start, end] of bonds) {
        context.moveTo(projected[start][0], projected[start][1]);
        context.lineTo(projected[end][0], projected[end][1]);
      }
      context.stroke();
    };
    if (blend) {
      for (const { index, start, end } of levels[next].added) {
        const point = projected[index];
        for (let axis = 0; axis < 3; axis++) {
          const middle = (projected[start][axis] + projected[end][axis]) / 2;
          point[axis] = middle + blend * (point[axis] - middle);
        }
      }
      stroke(levels[next].bonds, (.58 - .065 * next) * blend, 1);
    }
    stroke(levels[full].bonds, (.6 - .07 * full) * (1 - blend), 1.15);

    const size = Math.max(.7, Math.min(1.25, width / 570));
    const dot = (index, radius, opacity) => {
      const [x, y, distance] = projected[index];
      context.globalAlpha = Math.min(1, opacity * (.85 + .22 * distance));
      context.beginPath();
      context.arc(x, y, radius * size, 0, Math.PI * 2);
      context.fill();
    };
    dot(0, 4.8, 1);
    dot(1, 4.8, 1);
    for (let level = 1; level <= (blend ? next : full); level++) {
      const opacity = level <= full ? 1 : blend;
      for (const { index } of levels[level].added) {
        dot(index, 4 / Math.sqrt(level * 1.4), opacity);
      }
    }
    context.globalAlpha = 1;
  };
  // The hierarchy stays in world coordinates. A camera tracks one nested community.
  function seededRandom(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function makeNetwork() {
    const random = seededRandom(20261125);
    const points = [], edges = [];
    let focus;
    function community(x, y, radius, level, tracked) {
      const node = { x, y, level, radius };
      points.push(node);
      if (level === 3) {
        if (tracked) focus = node;
        return node;
      }
      const children = [];
      const phase = random() * Math.PI * 2;
      const count = level === 0 ? 6 : 7;
      for (let i = 0; i < count; i++) {
        const angle = phase + i * 2.39996;
        const distance = radius * Math.sqrt((i + .7) / count) * (.88 + .16 * random());
        const cx = x + distance * Math.cos(angle);
        const cy = y + distance * Math.sin(angle) * .74;
        const child = community(cx, cy, radius * .31, level + 1, tracked && i === 2);
        // Local links and a bridge to the parent keep the graph connected across scales.
        const nearest = children.slice().sort((a, b) =>
          Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
        for (const neighbour of nearest.slice(0, 2)) edges.push([child, neighbour]);
        if (i === 0) edges.push([child, node]);
        children.push(child);
      }
      return node;
    }
    community(0, 0, .88, 0, true);
    // The camera's closest neighbourhood has another level of fine structure.
    for (const leaf of points.filter(point => point.level === 3)) {
      const nearby = Math.hypot(leaf.x - focus.x, leaf.y - focus.y) < .18;
      const neighbours = [];
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.4 + random();
        const distance = leaf.radius * (.25 + .64 * random());
        const point = { level: 4, x: leaf.x + distance * Math.cos(angle), y: leaf.y + distance * Math.sin(angle) };
        points.push(point);
        edges.push([leaf, point]);
        if (neighbours.length > 2) edges.push([neighbours[i - 3], point]);
        neighbours.push(point);
        if (nearby) {
          for (let j = 0; j < 6; j++) {
            const theta = j * 2.4 + random();
            const spacing = leaf.radius * (.07 + .19 * random());
            const sample = { level: 5, x: point.x + spacing * Math.cos(theta), y: point.y + spacing * Math.sin(theta) };
            points.push(sample);
            edges.push([point, sample]);
          }
        }
      }
    }
    return { points, edges, focus };
  }

  const network = makeNetwork();
  function drawNetwork() {
    const zoom = 32 ** resolution;
    const extent = Math.min(width, height) * .47;
    const turn = -.38 + Math.sin(time * .09) * .1 + pointerX * .08;
    const cosine = Math.cos(turn), sine = Math.sin(turn);
    const camera = (1 - 1 / zoom) / (1 - 1 / 32);
    const size = Math.max(.7, extent / 280);
    for (const point of network.points) {
      const x = (point.x - camera * network.focus.x) * zoom;
      const y = (point.y - camera * network.focus.y) * zoom;
      point.px = width / 2 + extent * (x * cosine - y * sine);
      point.py = height / 2 + extent * (x * sine + y * cosine);
      point.fade = Math.max(0, Math.min(1, (1 - Math.hypot(x, y)) * 8));
      if (point.level === 5) point.fade *= Math.min(1, Math.max(0, (zoom - 2) / 6));
    }
    context.fillStyle = context.strokeStyle = `rgb(${color})`;
    for (const [a, b] of network.edges) {
      const fade = Math.min(a.fade, b.fade);
      if (fade === 0) continue;
      const prominence = Math.min(1, Math.hypot(a.px - b.px, a.py - b.py) / (30 * size));
      context.globalAlpha = fade * (.07 + .34 * prominence);
      context.lineWidth = size * (.55 + .4 * prominence);
      context.beginPath();
      context.moveTo(a.px, a.py);
      context.lineTo(b.px, b.py);
      context.stroke();
    }
    for (const point of network.points) {
      if (!point.fade) continue;
      const radius = Math.min(4.8, (4.6 / (1 + point.level ** 1.45)) * zoom ** .35);
      context.globalAlpha = point.fade * Math.min(.95, .28 + radius * .35);
      context.beginPath();
      context.arc(point.px, point.py, radius * size, 0, 2 * Math.PI);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  // Quenched continuous signed couplings on a finite patch of triangular lattice.
  // Metropolis updates change only the Ising spins, preserving sites and bonds.
  function makeSpinGlass() {
    const random = seededRandom(9281);
    const nodes = [], bonds = [], grid = new Map();
    const side = 6;
    for (let r = -side; r <= side; r++) {
      for (let q = -side; q <= side; q++) {
        if (Math.abs(q + r) > side) continue;
        const x = (q + r / 2) / side, y = r * Math.sqrt(3) / (2 * side);
        const node = { x, y, spin: random() < .5 ? 1 : -1, neighbours: [] };
        nodes.push(node);
        for (const [dq, dr] of [[-1, 0], [0, -1], [1, -1]]) {
          const neighbour = grid.get(`${q + dq},${r + dr}`);
          if (!neighbour) continue;
          const coupling = (.5 + random()) * (random() < .5 ? 1 : -1);
          bonds.push([node, neighbour, coupling]);
          node.neighbours.push([neighbour, coupling]);
          neighbour.neighbours.push([node, coupling]);
        }
        grid.set(`${q},${r}`, node);
      }
    }
    const flip = (node, temperature) => {
      let field = 0;
      for (const [neighbour, coupling] of node.neighbours) field += neighbour.spin * coupling;
      const cost = 2 * node.spin * field;
      if (cost < 0 || (temperature > 0 && random() < Math.exp(-cost / temperature))) {
        node.spin *= -1;
        return true;
      }
      return false;
    };
    function advance(temperature, trials) {
      for (let i = 0; i < trials; i++) flip(nodes[Math.floor(random() * nodes.length)], temperature);
    }
    function quench() {
      // Each accepted flip strictly lowers the energy. The sweep ends in a local minimum.
      let changed;
      do {
        changed = false;
        for (const node of nodes) if (flip(node, 0)) changed = true;
      } while (changed);
    }
    return { nodes, bonds, advance, quench };
  }
  const glass = makeSpinGlass();
  function drawGlass() {
    const scale = Math.min(width, height) * .39;
    const mark = Math.max(2.5, scale * .0195);
    const angle = -.28, c = Math.cos(angle), s = Math.sin(angle);
    for (const node of glass.nodes) {
      node.px = width / 2 + scale * (node.x * c - node.y * s);
      node.py = height / 2 + scale * (node.x * s + node.y * c) * .91;
    }
    context.strokeStyle = context.fillStyle = `rgb(${color})`;
    context.lineWidth = Math.max(.65, scale * .0038);
    for (const sign of [1, -1]) {
      context.setLineDash(sign > 0 ? [] : [2, 3]);
      context.globalAlpha = sign > 0 ? .45 : .3;
      context.beginPath();
      for (const [a, b, coupling] of glass.bonds) {
        if (Math.sign(coupling) !== sign) continue;
        context.moveTo(a.px, a.py);
        context.lineTo(b.px, b.py);
      }
      context.stroke();
    }
    context.setLineDash([]);
    context.globalAlpha = 1;
    context.lineWidth = Math.max(.9, mark * .31);
    for (const node of glass.nodes) {
      context.beginPath();
      context.arc(node.px, node.py, mark, 0, Math.PI * 2);
      context.fillStyle = node.spin > 0 ? `rgb(${color})` : background;
      context.fill();
      context.stroke();
    }
  }

  const draw = () => {
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    if (mode === 'network') drawNetwork();
    else if (mode === 'spin') drawGlass();
    else drawDiamond();
  };
  const tick = stamp => {
    frame = 0;
    if (paused || !visible || document.hidden) return;
    if (!last || stamp - last >= 32) {
      time += last ? Math.min((stamp - last) / 1000, .05) : .016;
      last = stamp;
      if (mode === 'spin' && resolution > 0) glass.advance(temperature(), 8);
      draw();
    }
    frame = requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const syncPause = () => {
    pause.dataset.paused = String(paused);
    pause.setAttribute('aria-label', paused ? pause.dataset.playLabel : pause.dataset.pauseLabel);
    pause.title = pause.getAttribute('aria-label');
    schedule();
  };
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  };
  const hints = document.querySelector('#art-hint');
  const sliderRow = slider.closest('.art-slider');
  const updateValue = () => {
    values[mode] = Number(slider.value);
    resolution = values[mode] / 100;
    const value = mode === 'network' ? `${(32 ** resolution).toFixed(1)}×` : `${slider.value}%`;
    slider.setAttribute('aria-valuetext', value);
  };
  function choose(button) {
    mode = button.dataset.art;
    for (const option of buttons) option.setAttribute('aria-pressed', String(option === button));
    canvas.setAttribute('aria-label', button.dataset.description);
    hints.textContent = button.dataset.caption;
    slider.setAttribute('aria-label', button.dataset.slider);
    sliderRow.firstElementChild.textContent = button.dataset.low;
    sliderRow.lastElementChild.textContent = button.dataset.high;
    slider.value = values[mode];
    updateValue();
    draw();
  }
  for (const button of buttons) button.addEventListener('click', () => choose(button));
  const requested = new URLSearchParams(location.search).get('art');
  const comparison = buttons.find(button => button.dataset.art === requested);
  const defaultButton = buttons.find(button => button.getAttribute('aria-pressed') === 'true');
  choose(comparison || defaultButton);
  if (comparison) {
    document.querySelector('.art-modes').hidden = false;
    document.querySelector('#art-title').hidden = true;
    hints.hidden = false;
  }
  sliderRow.hidden = false;
  pause.hidden = false;
  pause.addEventListener('click', () => { paused = !paused; syncPause(); });
  slider.addEventListener('input', () => {
    updateValue();
    if (mode === 'spin') {
      if (resolution === 0) glass.quench();
      else glass.advance(temperature(), glass.nodes.length);
    }
    draw();
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || reduced.matches || paused) return;
    const rect = canvas.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / width - .5;
    pointerY = (event.clientY - rect.top) / height - .5;
  });
  canvas.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
  reduced.addEventListener('change', event => { paused = event.matches; syncPause(); });
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('themechange', () => {
    color = getComputedStyle(root).getPropertyValue('--art').trim();
    background = getComputedStyle(root).getPropertyValue('--bg').trim();
    draw();
  });
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    schedule();
  }, { threshold: .01 }).observe(canvas);
  resize();
  syncPause();
})();
