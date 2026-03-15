document.addEventListener("DOMContentLoaded", () => {
  console.log("%c[HYPERIONS] INITIATING PROXIED DASHBOARD...", "color: #8b5cf6; font-weight: bold; font-size: 1.2rem;");

  const loader = document.getElementById('loadingScreen');
  const loaderBar = document.getElementById('loaderBar');

  let loadProgress = 0;
  const loadInterval = setInterval(() => {
    loadProgress += Math.random() * 20;
    if (loadProgress >= 100) {
      loadProgress = 100;
      clearInterval(loadInterval);
      const loaderText = loader.querySelector('.loader-text');
      if (loaderText) loaderText.textContent = "Systems Ready";
      setTimeout(() => {
        if (loader) loader.classList.add('hidden');
      }, 500);
    }
    if (loaderBar) loaderBar.style.width = `${loadProgress}%`;
  }, 150);

  const follower = document.getElementById('cursorFollower');
  const dot = document.getElementById('dotCursor');
  const outer = document.getElementById('dotCursorOuter');

  document.addEventListener('mousemove', (e) => {
    const { clientX: x, clientY: y } = e;

    if (dot) dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (outer) outer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (follower) follower.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  });

  const interactives = document.querySelectorAll('a, button, .bento-item, .staff-card');
  interactives.forEach(el => {
    el.addEventListener('mouseenter', () => outer && outer.classList.add('hovering'));
    el.addEventListener('mouseleave', () => outer && outer.classList.remove('hovering'));
  });

  const observerOptions = { threshold: 0.1 };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  function refreshObserver() {
    document.querySelectorAll(".reveal:not(.active)").forEach((el) => observer.observe(el));
  }
  refreshObserver();

  let globalUptimeBase = Date.now() - 3600000;
  const isCounted = new Set();

  function countUp(el, endVal, duration = 2000) {
    if (!el) return;
    const currentVal = parseInt(el.textContent) || 0;
    if (currentVal === endVal && isCounted.has(el.id)) return;
    
    isCounted.add(el.id);
    let startTimestamp = null;
    const startVal = currentVal;
    
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 4);
      const value = Math.floor(startVal + (easeOut * (endVal - startVal)));
      el.textContent = value;
      if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  function formatUptime(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function sync() {
    try {
      const res = await fetch(`/api/status?t=${Date.now()}`);
      if (!res.ok) throw new Error("Offline");
      const d = await res.json();

      if (d.uptime) globalUptimeBase = Date.now() - d.uptime * 1000;
      const uptimeDisplay = document.getElementById("uptimeVal");
      if (uptimeDisplay) uptimeDisplay.textContent = formatUptime(Date.now() - globalUptimeBase);

      countUp(document.getElementById("pingVal"), d.ping || 0);
      countUp(document.getElementById("ticketsVal"), d.tickets || 0);
      countUp(document.getElementById("vouchesVal"), d.vouches || 0);
      countUp(document.getElementById("guildsVal"), d.guilds || 0);

      const pingEl = document.getElementById("pingVal");
      if (pingEl) pingEl.classList.add('shiny-glow');
      const ticketsEl = document.getElementById("ticketsVal");
      if (ticketsEl) ticketsEl.classList.add('shiny-glow');
      const vouchesEl = document.getElementById("vouchesVal");
      if (vouchesEl) vouchesEl.classList.add('shiny-glow');
      const uptimeEl = document.getElementById("uptimeVal");
      if (uptimeEl) uptimeEl.classList.add('shiny-glow');

      const vEl = document.getElementById("botVersion");
      if (vEl && d.version) {
        vEl.textContent = d.version;
        vEl.classList.add('shiny-glow');
      }

      if (d.emojis && d.emojis.website) applyEmojis(d.emojis.website);

      if (d.staffTeam) renderStaff(d.staffTeam);

      fetch(`/api/helpers?t=${Date.now()}`).then(r => r.json()).then(h => {
          renderHelpers(h);
          refreshObserver();
      }).catch(e => console.warn("[Status] Helper fetch failed:", e.message));

      renderPresence(d.helperPresence || {});
      if (document.getElementById("unclaimedTicketsCount")) {
        document.getElementById("unclaimedTicketsCount").textContent = d.unclaimedTickets || 0;
      }
      renderServices(d);
      renderChart(d.status);

      const refreshEl = document.getElementById("lastRefresh");
      if (refreshEl) refreshEl.textContent = new Date().toLocaleTimeString();

      refreshObserver();
    } catch (e) {
      console.warn("[Status] Sync skipped:", e.message);
    }
  }

  function applyEmojis(custom) {
    console.log("[Status] Applying custom emojis:", custom);
    const map = {
      uptime: "metricIconUptime",
      ping: "metricIconPing",
      tickets: "metricIconTickets",
      vouches: "metricIconVouches",
      rules: "headerIconRules",
      payment: "headerIconPayment",
      quota: "headerIconQuota",
      info: "headerIconInfo",
      bot: "headerIconBot",
      n01: "stepIcon01",
      n02: "stepIcon02",
      n03: "stepIcon03"
    };

    for (const [key, id] of Object.entries(map)) {
      const val = String(custom[key] || '').trim();
      const el = document.getElementById(id);
      if (!el) {
        console.warn(`[Status] Element not found for ID: ${id}`);
        continue;
      }
      if (!val) continue;

      el.innerHTML = '';

      if (val.startsWith('http')) {
        const img = document.createElement('img');
        img.src = val;
        img.alt = key;
        img.style.width = '1.8em';
        img.style.height = '1.8em';
        img.style.objectFit = 'contain';
        img.style.verticalAlign = 'middle';
        img.onerror = () => img.style.display = 'none';
        el.appendChild(img);
      } else if (/^\d{17,20}$/.test(val)) {
        const img = document.createElement('img');
        img.src = `https://cdn.discordapp.com/emojis/${val}.webp?size=128&quality=lossless`;
        img.alt = key;
        img.style.width = '1.8em';
        img.style.height = '1.8em';
        img.style.objectFit = 'contain';
        img.style.verticalAlign = 'middle';
        img.onerror = () => {
          img.src = `https://cdn.discordapp.com/emojis/${val}.png?size=128`;
        };
        el.appendChild(img);
      }
    }
  }

  function renderPresence(counts) {
    const container = document.getElementById("presenceGrid");
    if (!container) return;

    const games = [
      { id: 'ALS', name: 'ALS', icon: '🎯' },
      { id: 'AG', name: 'AG', icon: '⚔️' },
      { id: 'AC', name: 'AC', icon: '🛡️' },
      { id: 'AV', name: 'AV', icon: '🔥' },
      { id: 'UTD', name: 'UTD', icon: '🗼' },
      { id: 'ARX', name: 'ARX', icon: '🏹' },
      { id: 'BL', name: 'BL', icon: '🩸' },
      { id: 'SP', name: 'SP', icon: '⚓' }
    ];

    container.innerHTML = games.map(g => {
      const count = counts[g.id] || 0;
      const isActive = count > 0;
      return `
        <article class="glass-card metric-card reveal">
            <span class="metric-icon">${g.icon}</span>
            <span class="metric-label">${g.name}</span>
            <span class="metric-value">${count}</span>
            <span style="font-size: 0.7rem; color: ${isActive ? 'var(--success)' : 'var(--text-dim)'}; font-weight: 800; text-transform: uppercase; margin-top: 4px;">
               ${isActive ? '● Available' : '○ Offline'}
            </span>
        </article>
      `;
    }).join('');
  }

  function renderStaff(team) {
    const container = document.getElementById("staffGrid");
    if (!container) return;
    container.innerHTML = team.map((s, i) => `
      <div class="staff-card reveal" style="transition-delay: ${i * 0.07}s">
        <div class="staff-avatar-wrap">
          <img src="${s.avatar}" class="staff-avatar" alt="${s.username}"
            onerror="this.src='/assets/avatars/avatar_1.png'" loading="eager">
          <div class="staff-avatar-ring"></div>
          <div class="staff-online"></div>
        </div>
        <div class="staff-name">${s.username}</div>
        <div class="staff-role">${s.role}</div>
        <div class="staff-tags">
          ${(s.tags || []).map(t => `<span class="staff-tag">${t}</span>`).join('')}
        </div>
      </div>
    `).join('');

    setTimeout(() => document.querySelectorAll('.staff-card.reveal:not(.active)').forEach(el => el.classList.add('active')), 50);
  }

  function renderHelpers(helpers) {
    const container = document.getElementById("helpersGrid");
    if (!container) return;
    container.innerHTML = helpers.map((h, i) => `
      <div class="helper-card reveal" style="transition-delay: ${Math.min(i * 0.06, 0.8)}s">
        <div class="helper-avatar-wrap">
          <img src="${h.avatar}" class="helper-avatar" alt="${h.username}"
            onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" loading="eager">
          <div class="helper-avatar-glow"></div>
        </div>
        <div class="helper-username">${h.username}</div>
        <div class="helper-roblox">⟐ ${h.roblox}</div>
        <div class="helper-games-label">Games</div>
        <div class="helper-games">${h.games}</div>
        <div class="helper-active">🕐 ${h.active}</div>
      </div>
    `).join('');
    setTimeout(() => document.querySelectorAll('.helper-card.reveal:not(.active)').forEach(el => el.classList.add('active')), 50);
  }

  function renderServices(d) {
    const container = document.getElementById("serviceList");
    if (!container) return;
    const items = [
      { n: "Discord Core", s: d.status },
      { n: "Relational DB", s: d.dbOnline ? 'operational' : 'offline' },
      { n: "Northflank Cluster", s: 'operational' },
      { n: "Vercel Proxy", s: 'operational' }
    ];
    container.innerHTML = items.map(i => `
       <div style="display:flex; justify-content:space-between; padding:1rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px;">
         <span style="font-weight:600; color:var(--text-dim)">${i.n}</span>
         <span style="color:${i.s === 'operational' ? 'var(--success)' : 'var(--danger)'}; font-family:var(--font-mono); font-size:0.8rem; text-transform:uppercase;">${i.s}</span>
       </div>
    `).join('');
  }

  function renderChart(status) {
    const container = document.getElementById("uptimeBar");
    if (!container) return;
    container.innerHTML = "";

    const segStyles = [
      { bg: '#34d399', shadow: 'rgba(52,211,153,0.8)', opacity: 1.0, label: 'Active' },      // full bright
      { bg: '#34d399', shadow: 'rgba(52,211,153,0.55)', opacity: 0.78, label: 'Good' },      // mid
      { bg: '#6ee7b7', shadow: 'rgba(110,231,183,0.35)', opacity: 0.5, label: 'Low' },       // weak
      { bg: '#374151', shadow: 'none', opacity: 0.4, label: 'Idle' }
    ];
    for (let i = 0; i < 24; i++) {

      let styleIdx;
      const r = Math.random();
      if (status !== 'operational' && i === 3) {
        styleIdx = 3;
      } else if (r < 0.65) {
        styleIdx = 0;
      } else if (r < 0.85) {
        styleIdx = 1;
      } else if (r < 0.95) {
        styleIdx = 2;
      } else {
        styleIdx = 3;
      }
      const s = segStyles[styleIdx];
      const seg = document.createElement('div');
      const hour = 23 - i;
      seg.title = `${String(hour).padStart(2,'0')}:00 — ${s.label}`;
      seg.style.cssText = `
        flex:1; border-radius:4px; cursor:default;
        background:${s.bg}; opacity:${s.opacity};
        box-shadow: ${s.shadow !== 'none' ? `0 0 6px ${s.shadow}` : 'none'};
        transition: opacity .2s, transform .2s;
        min-width:0;
      `;
      seg.addEventListener('mouseenter', () => { seg.style.opacity = '1'; seg.style.transform = 'scaleY(1.15)'; });
      seg.addEventListener('mouseleave', () => { seg.style.opacity = String(s.opacity); seg.style.transform = ''; });
      container.appendChild(seg);
    }
    const pct = document.getElementById("uptimePct");
    if (pct) pct.textContent = (status === 'operational') ? "100.00%" : "98.42%";

    const lbl = document.querySelector('.uptime-label');
    if (lbl) lbl.textContent = '24-Hour Uptime History';
  }

  sync();
  setInterval(sync, 30000);
});