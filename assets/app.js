/* app.js - static SPA auctions powered by localStorage */

// ---------- Utilities ----------
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const fmtMoney = (n, cur='$') => `${cur}${Number(n).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();
const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));

// LocalStorage keys
const LS_KEYS = {
  settings: 'auction_admin_settings_v1',
  auctions: 'auction_list_v1',
  bidsPrefix: 'auction_bids_v1_', // + slug
};

// Default credentials (change in Admin > Settings)
const DEFAULT_SETTINGS = {
  adminUser: 'admin',
  // store password hash
  adminPassHash: null, // set on first boot to hash('password123')
  currency: '$',
  snipingExtensionSeconds: 120, // auto-extend if bid happens within last 120s
  extensionAmountSeconds: 120,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// Simple SHA-256 hash using Web Crypto
async function sha256(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function getSettings() {
  const raw = localStorage.getItem(LS_KEYS.settings);
  let s = raw ? JSON.parse(raw) : {...DEFAULT_SETTINGS};
  if (!s.adminPassHash) {
    // default password
    // NOTE: don't store plaintext
    // default: password123
    return (async ()=>{
      s.adminPassHash = await sha256('password123');
      localStorage.setItem(LS_KEYS.settings, JSON.stringify(s));
      return s;
    })();
  }
  return s;
}

function setSettings(s) {
  localStorage.setItem(LS_KEYS.settings, JSON.stringify(s));
}

function listAuctions() {
  const raw = localStorage.getItem(LS_KEYS.auctions);
  return raw ? JSON.parse(raw) : [];
}

function saveAuctions(arr) {
  localStorage.setItem(LS_KEYS.auctions, JSON.stringify(arr));
}

function getBids(slug) {
  const raw = localStorage.getItem(LS_KEYS.bidsPrefix + slug);
  return raw ? JSON.parse(raw) : [];
}

function saveBids(slug, bids) {
  localStorage.setItem(LS_KEYS.bidsPrefix + slug, JSON.stringify(bids));
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}

function routePath() {
  // return pathname only, no trailing slash
  let p = window.location.pathname;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0,-1);
  return p;
}

// ---------- Router ----------
async function render() {
  const container = document.getElementById('app');
  const path = routePath();
  const settingsMaybe = getSettings();
  const settings = settingsMaybe.then ? await settingsMaybe : settingsMaybe;

  const nav = `
    <div class="nav container">
      <div><a href="/">🏷️ Auctions</a></div>
      <div class="flex">
        <span class="badge">TZ: ${settings.timezone}</span>
        <a href="/admin">Admin</a>
      </div>
    </div>
  `;

  if (path === '' || path === '/') {
    container.innerHTML = nav + renderHome();
    attachHome();
    return;
  }
  if (path === '/admin') {
    container.innerHTML = nav + renderAdminLogin();
    attachAdminLogin();
    return;
  }
  // auction page: /:slug
  const slug = decodeURIComponent(path.slice(1));
  const a = listAuctions().find(x => x.slug === slug);
  if (!a) {
    container.innerHTML = nav + notFound(slug);
    return;
  }
  container.innerHTML = nav + renderAuction(a, settings);
  attachAuction(a, settings);
}

function notFound(slug) {
  return `
    <div class="container">
      <div class="card">
        <div class="heading">Not Found</div>
        <p class="hint">No auction at <code>/${slug}</code>. <a href="/">Back to list</a></p>
      </div>
    </div>
  `;
}

// ---------- Home (list auctions) ----------
function renderHome() {
  const auctions = listAuctions().sort((a,b)=> a.startsAt.localeCompare(b.startsAt));
  const items = auctions.map(a => {
    const status = auctionStatus(a);
    const badge = status === 'upcoming' ? 'warning' : (status === 'live' ? 'ok' : 'danger');
    return `
      <a class="card" href="/${a.slug}" style="text-decoration:none">
        <div class="flex" style="justify-content:space-between">
          <div>
            <div class="badge">/${a.slug}</div>
            <div class="heading" style="margin:4px 0 8px">${a.title}</div>
            <div class="hint">${a.description.slice(0,120)}${a.description.length>120?'…':''}</div>
          </div>
          <div class="kpi" style="min-width:280px">
            <div class="tile">
              <span>Status</span>
              <strong class="tag">${status.toUpperCase()}</strong>
            </div>
            <div class="tile">
              <span>Start</span>
              <strong>${new Date(a.startsAt).toLocaleString()}</strong>
            </div>
            <div class="tile">
              <span>Duration</span>
              <strong>${a.durationMins} min</strong>
            </div>
          </div>
        </div>
      </a>
    `;
  }).join('');

  return `
    <div class="container">
      <div class="hero">
        <span class="badge">Simple Static Auctions</span>
        <h1 class="heading">Available Auctions</h1>
        <p class="hint">Created via the Admin panel. Click one to view & bid.</p>
      </div>
      <div class="grid">
        ${items || `<div class="card"><p>No auctions yet. <a href="/admin">Create one in Admin</a>.</p></div>`}
      </div>
    </div>
  `;
}

function attachHome(){}

// ---------- Admin ----------
function renderAdminLogin() {
  return `
    <div class="container">
      <div class="card center" style="max-width:520px; margin: 0 auto;">
        <h1 class="heading">Admin</h1>
        <p class="hint">Sign in to manage auctions.</p>
        <div style="width:100%;">
          <label>Username</label>
          <input class="input" id="user" placeholder="admin" />
          <label style="margin-top:10px; display:block;">Password</label>
          <input class="input" id="pass" placeholder="••••••••" type="password" />
          <div class="actions" style="margin-top:14px;">
            <button class="button primary" id="loginBtn">Sign in</button>
            <a class="button ghost" href="/">Cancel</a>
          </div>
          <p class="hint" style="margin-top:8px;">Default: <code>admin</code> / <code>password123</code></p>
        </div>
      </div>
    </div>
  `;
}

function attachAdminLogin() {
  $('#loginBtn').addEventListener('click', async () => {
    const u = $('#user').value.trim();
    const p = $('#pass').value;
    const sMaybe = getSettings();
    const s = sMaybe.then ? await sMaybe : sMaybe;
    if (u === s.adminUser && await sha256(p) === s.adminPassHash) {
      sessionStorage.setItem('admin_logged_in', '1');
      renderAdminPanel();
    } else {
      alert('Invalid credentials');
    }
  });
  // if already logged in
  if (sessionStorage.getItem('admin_logged_in') === '1') {
    renderAdminPanel();
  }
}

function requireAdmin() {
  if (sessionStorage.getItem('admin_logged_in') !== '1') {
    window.location.href = '/admin';
    return false;
  }
  return true;
}

function renderAdminPanel() {
  if (!requireAdmin()) return;
  const container = $('.container') || $('#app');
  const auctions = listAuctions();
  const list = auctions.map(a => `
    <tr>
      <td><code>/${a.slug}</code></td>
      <td>${a.title}</td>
      <td>${new Date(a.startsAt).toLocaleString()}</td>
      <td>${a.durationMins} min</td>
      <td>${fmtMoney(a.startingBid, a.currency||'$')}</td>
      <td>
        <button class="button" data-edit="${a.slug}">Edit</button>
        <button class="button danger" data-del="${a.slug}">Delete</button>
      </td>
    </tr>
  `).join('');

  const sMaybe = getSettings();
  (async () => {
    const s = sMaybe.then ? await sMaybe : sMaybe;
    $('#app').innerHTML = `
      <div class="nav container">
        <div><a href="/">🏷️ Auctions</a></div>
        <div class="flex">
          <span class="badge">Logged in</span>
          <button class="button" id="logoutBtn">Log out</button>
        </div>
      </div>
      <div class="container">
        <div class="card" style="margin-bottom:16px;">
          <div class="flex" style="justify-content:space-between">
            <h2 class="heading" style="margin:0">Auctions</h2>
            <button class="button primary" id="newAuctionBtn">+ New Auction</button>
          </div>
          <table class="table" style="margin-top:12px;">
            <thead>
              <tr><th>Path</th><th>Title</th><th>Starts</th><th>Duration</th><th>Start Bid</th><th>Actions</th></tr>
            </thead>
            <tbody>${list || `<tr><td colspan="6" class="hint">No auctions yet.</td></tr>`}</tbody>
          </table>
        </div>

        <div class="card">
          <h3 class="heading" style="margin:0 0 8px;">Settings</h3>
          <div class="grid">
            <div>
              <label>Admin Username</label>
              <input id="setUser" class="input" value="${s.adminUser}"/>
            </div>
            <div>
              <label>New Admin Password</label>
              <input id="setPass" type="password" class="input" placeholder="Leave blank to keep current"/>
            </div>
            <div>
              <label>Currency Symbol</label>
              <input id="setCur" class="input" value="${s.currency}"/>
            </div>
            <div>
              <label>Time Zone</label>
              <input id="setTZ" class="input" value="${s.timezone}"/>
            </div>
            <div>
              <label>Anti-sniping: extend by (seconds)</label>
              <input id="setExtAmt" type="number" class="input" value="${s.extensionAmountSeconds}"/>
            </div>
            <div>
              <label>Anti-sniping: trigger if inside last (seconds)</label>
              <input id="setExtTrig" type="number" class="input" value="${s.snipingExtensionSeconds}"/>
            </div>
          </div>
          <div class="actions" style="margin-top:12px;">
            <button class="button primary" id="saveSettings">Save Settings</button>
          </div>
        </div>
      </div>
    `;

    // wire actions
    $('#logoutBtn').onclick = () => { sessionStorage.removeItem('admin_logged_in'); window.location.href='/admin'; };
    $('#newAuctionBtn').onclick = () => openAuctionEditor();
    $$('#app [data-edit]').forEach(b => b.onclick = () => {
      const slug = b.getAttribute('data-edit');
      const a = listAuctions().find(x=>x.slug===slug);
      openAuctionEditor(a);
    });
    $$('#app [data-del]').forEach(b => b.onclick = () => {
      const slug = b.getAttribute('data-del');
      if (confirm(`Delete /${slug}? This removes bids too.`)) {
        const arr = listAuctions().filter(x=>x.slug!==slug);
        saveAuctions(arr);
        localStorage.removeItem(LS_KEYS.bidsPrefix+slug);
        renderAdminPanel();
      }
    });

    $('#saveSettings').onclick = async () => {
      s.adminUser = $('#setUser').value.trim() || s.adminUser;
      const newPass = $('#setPass').value;
      if (newPass) s.adminPassHash = await sha256(newPass);
      s.currency = $('#setCur').value || s.currency;
      s.timezone = $('#setTZ').value || s.timezone;
      s.extensionAmountSeconds = clamp(parseInt($('#setExtAmt').value||s.extensionAmountSeconds,10), 0, 3600);
      s.snipingExtensionSeconds = clamp(parseInt($('#setExtTrig').value||s.snipingExtensionSeconds,10), 0, 3600);
      setSettings(s);
      alert('Saved.');
      renderAdminPanel();
    };
  })();
}

function openAuctionEditor(existing) {
  const container = $('#app');
  const a = existing || {
    title: '',
    slug: '',
    description: '',
    startsAt: new Date(Date.now() + 60*60*1000).toISOString().slice(0,16),
    durationMins: 30,
    startingBid: 10,
    minIncrement: 1,
    maxIncrement: 1000,
    currency: getSettings().currency || '$',
    reservePrice: null,
    buyNowPrice: null,
  };

  container.innerHTML = `
    <div class="nav container">
      <div><a href="/">🏷️ Auctions</a></div>
      <div class="flex">
        <a href="/admin">Back to Admin</a>
      </div>
    </div>
    <div class="container">
      <div class="card">
        <h2 class="heading" style="margin:0 0 12px;">${existing? 'Edit':'New'} Auction</h2>
        <div class="grid">
          <div><label>Title</label><input id="title" class="input" value="${a.title||''}"/></div>
          <div><label>Slug (path after .com)</label><input id="slug" class="input" value="${a.slug||''}" placeholder="e.g., my-cool-item"/></div>
          <div><label>Starts At (local)</label><input id="starts" class="input" type="datetime-local" value="${a.startsAt}"/></div>
          <div><label>Duration (minutes)</label><input id="dur" class="input" type="number" value="${a.durationMins}"/></div>
          <div><label>Starting Bid</label><input id="startBid" class="input" type="number" step="0.01" value="${a.startingBid}"/></div>
          <div><label>Min Increment</label><input id="minInc" class="input" type="number" step="0.01" value="${a.minIncrement}"/></div>
          <div><label>Max Increment</label><input id="maxInc" class="input" type="number" step="0.01" value="${a.maxIncrement}"/></div>
          <div><label>Currency Symbol</label><input id="cur" class="input" value="${a.currency||'$'}"/></div>
          <div><label>Reserve Price (optional)</label><input id="reserve" class="input" type="number" step="0.01" value="${a.reservePrice??''}"/></div>
          <div><label>Buy It Now (optional)</label><input id="buy" class="input" type="number" step="0.01" value="${a.buyNowPrice??''}"/></div>
        </div>
        <label style="margin-top:12px; display:block;">Description (shown under the bid section)</label>
        <textarea id="desc" class="textarea">${a.description||''}</textarea>
        <div class="actions" style="margin-top:12px;">
          <button class="button primary" id="saveAuction">Save</button>
          <a class="button ghost" href="/admin">Cancel</a>
          ${existing ? `<a class="button" href="/${a.slug}" target="_blank">Open /${a.slug}</a>` : ''}
        </div>
      </div>
    </div>
  `;

  $('#saveAuction').onclick = () => {
    const obj = {
      title: $('#title').value.trim(),
      slug: slugify($('#slug').value.trim() || $('#title').value.trim() || 'auction'),
      description: $('#desc').value.trim(),
      startsAt: new Date($('#starts').value).toISOString(),
      durationMins: parseInt($('#dur').value,10) || 30,
      startingBid: parseFloat($('#startBid').value)||0,
      minIncrement: parseFloat($('#minInc').value)||1,
      maxIncrement: parseFloat($('#maxInc').value)||1000,
      currency: $('#cur').value || '$',
      reservePrice: $('#reserve').value ? parseFloat($('#reserve').value) : null,
      buyNowPrice: $('#buy').value ? parseFloat($('#buy').value) : null,
    };
    let arr = listAuctions();
    const idx = arr.findIndex(x=>x.slug===obj.slug);
    if (existing) {
      // if slug changed, migrate bids key
      if (existing.slug !== obj.slug) {
        const oldBids = getBids(existing.slug);
        saveBids(obj.slug, oldBids);
        localStorage.removeItem(LS_KEYS.bidsPrefix + existing.slug);
        arr = arr.filter(x=>x.slug!==existing.slug);
      } else {
        arr = arr.filter(x=>x.slug!==existing.slug);
      }
    } else if (idx !== -1) {
      alert('Slug already exists. Choose another.');
      return;
    }
    arr.push(obj);
    saveAuctions(arr);
    alert('Saved.');
    window.location.href='/admin';
  };
}

// ---------- Auction Page ----------
function auctionStatus(a) {
  const start = new Date(a.startsAt).getTime();
  const end = start + a.durationMins*60*1000;
  const t = Date.now();
  if (t < start) return 'upcoming';
  if (t >= start && t <= end) return 'live';
  return 'ended';
}

function timeLeft(a) {
  const start = new Date(a.startsAt).getTime();
  const end = start + a.durationMins*60*1000;
  const t = Date.now();
  return { untilStart: Math.max(0, start - t), untilEnd: Math.max(0, end - t) };
}

function highestBid(a) {
  const bids = getBids(a.slug);
  if (!bids.length) return a.startingBid;
  return bids[bids.length-1].amount;
}

function renderAuction(a, settings) {
  const status = auctionStatus(a);
  const hi = highestBid(a);
  const tl = timeLeft(a);
  const live = status === 'live';
  const upcoming = status === 'upcoming';
  const ended = status === 'ended';

  return `
    <div class="container">
      <div class="card center">
        <div class="badge">/${a.slug}</div>
        <h1 class="heading" style="margin:8px 0 0;">${a.title}</h1>
        <div class="kpi" style="max-width:680px; width:100%; margin-top:16px;">
          <div class="tile"><span>Starts</span><strong>${new Date(a.startsAt).toLocaleString()}</strong></div>
          <div class="tile"><span>Duration</span><strong>${a.durationMins} min</strong></div>
          <div class="tile"><span>Status</span><strong class="tag">${status.toUpperCase()}</strong></div>
        </div>

        <hr class="sep"/>

        <div class="current-bid">${fmtMoney(hi, a.currency||settings.currency)}</div>
        <div class="countdown" id="countdown">${upcoming? 'Starts in…' : (live? 'Ends in…' : 'Ended')}</div>

        <div style="max-width:560px; width:100%; margin-top:12px;">
          <label>Bidder Name</label>
          <input id="bidder" class="input" placeholder="e.g., Jane D." ${ended?'disabled':''}/>
          <label style="margin-top:8px; display:block;">Your Bid</label>
          <input id="bidAmount" class="input" type="number" step="0.01" placeholder="${(hi + a.minIncrement).toFixed(2)}" ${(!live)?'disabled':''}/>
          <div class="actions" style="margin-top:10px;">
            <button class="button primary" id="placeBid" ${(!live)?'disabled':''}>Place Bid</button>
            ${a.buyNowPrice ? `<button class="button" id="buyNow" ${(!live)?'disabled':''}>Buy It Now for ${fmtMoney(a.buyNowPrice, a.currency||settings.currency)}</button>` : ''}
          </div>
          <p class="hint" style="margin-top:6px;">Min increment: ${fmtMoney(a.minIncrement, a.currency)} • Max increment: ${fmtMoney(a.maxIncrement, a.currency)}${a.reservePrice?` • Reserve: ${fmtMoney(a.reservePrice,a.currency)}`:''}</p>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h2 class="heading" style="margin:0 0 8px;">About this item</h2>
        <div>${a.description.replace(/\n/g,'<br/>')}</div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3 class="heading" style="margin:0 0 8px;">Bid History</h3>
        <table class="table">
          <thead><tr><th>When</th><th>Bidder</th><th>Amount</th></tr></thead>
          <tbody id="bidTable">${renderBidRows(a)}</tbody>
        </table>
      </div>

      <footer>Static demo • Data saved in your browser • For shared, real auctions use a server backend.</footer>
    </div>
  `;
}

function renderBidRows(a) {
  const bids = getBids(a.slug);
  if (!bids.length) return `<tr><td colspan="3" class="hint">No bids yet.</td></tr>`;
  return bids.map(b => `
    <tr><td>${new Date(b.time).toLocaleString()}</td><td>${b.bidder}</td><td>${fmtMoney(b.amount, b.currency || '$')}</td></tr>
  `).join('');
}

function attachAuction(a, settings) {
  // countdown
  const c = $('#countdown');
  const tick = () => {
    const st = new Date(a.startsAt).getTime();
    const end = st + a.durationMins*60*1000;
    const t = Date.now();
    let msg = '';
    if (t < st) {
      const s = st - t;
      msg = 'Starts in ' + fmtDuration(s);
    } else if (t <= end) {
      const s = end - t;
      msg = 'Ends in ' + fmtDuration(s);
    } else {
      msg = 'Auction ended';
      $('#placeBid')?.setAttribute('disabled','');
      $('#buyNow')?.setAttribute('disabled','');
    }
    c.textContent = msg;
  };
  tick();
  const timer = setInterval(tick, 1000);

  // place bid
  $('#placeBid')?.addEventListener('click', () => {
    const bidder = $('#bidder').value.trim() || 'Anonymous';
    const amount = parseFloat($('#bidAmount').value);
    const current = highestBid(a);
    if (!Number.isFinite(amount)) { alert('Enter a bid amount.'); return; }
    const inc = amount - current;
    if (amount <= current) { alert('Bid must be higher than current bid.'); return; }
    if (inc < a.minIncrement || inc > a.maxIncrement) {
      alert(`Bid increment must be between ${fmtMoney(a.minIncrement,a.currency)} and ${fmtMoney(a.maxIncrement,a.currency)}.`);
      return;
    }
    // if within sniping window, extend
    const st = new Date(a.startsAt).getTime();
    let end = st + a.durationMins*60*1000;
    const t = Date.now();
    const sLeft = end - t;
    const s = getSettings();
    const extTrig = s.snipingExtensionSeconds || DEFAULT_SETTINGS.snipingExtensionSeconds;
    if (sLeft > 0 && sLeft <= (extTrig*1000)) {
      a.durationMins += Math.ceil((s.extensionAmountSeconds || DEFAULT_SETTINGS.extensionAmountSeconds) / 60);
      // persist updated duration
      const arr = listAuctions().map(x => x.slug===a.slug ? a : x);
      saveAuctions(arr);
    }

    const bid = { bidder, amount: Math.round(amount*100)/100, time: now(), currency: a.currency||'$' };
    const bids = getBids(a.slug);
    bids.push(bid);
    saveBids(a.slug, bids);

    // reset UI
    $('#bidAmount').value = '';
    $('.current-bid').textContent = fmtMoney(bid.amount, a.currency||settings.currency);
    $('#bidTable').innerHTML = renderBidRows(a);
    alert('Bid placed!');
  });

  $('#buyNow')?.addEventListener('click', () => {
    if (!a.buyNowPrice) return;
    const bidder = $('#bidder').value.trim() || 'Anonymous';
    const bids = getBids(a.slug);
    bids.push({ bidder, amount: a.buyNowPrice, time: now(), currency: a.currency||'$', buyNow: true });
    saveBids(a.slug, bids);
    // end auction now
    const st = new Date(a.startsAt).getTime();
    a.durationMins = Math.ceil((Date.now() - st)/60000);
    const arr = listAuctions().map(x => x.slug===a.slug ? a : x);
    saveAuctions(arr);
    $('#bidTable').innerHTML = renderBidRows(a);
    alert('Purchased at Buy It Now price! Auction ended.');
  });

  window.addEventListener('beforeunload', () => clearInterval(timer), {once:true});
}

function fmtDuration(ms) {
  const sec = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = sec%60;
  const pad = (n)=>String(n).padStart(2,'0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ---------- Boot ----------
window.addEventListener('DOMContentLoaded', render);
