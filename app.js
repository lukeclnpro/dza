const INITIAL_CASH = 1000;
const STORAGE_KEY = 'simtrade-demo-v3';
const seedAssets = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'ACTION', price: 190, close: 190, change: 0 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'ACTION', price: 420, close: 420, change: 0 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'ACTION', price: 150, close: 150, change: 0 },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', type: 'ACTION', price: 190, close: 190, change: 0 },
  { symbol: 'TSLA', name: 'Tesla, Inc.', type: 'ACTION', price: 300, close: 300, change: 0 },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', type: 'ETF', price: 500, close: 500, change: 0 },
  { symbol: 'BTC-USD', name: 'Bitcoin / USD', type: 'CRYPTO', price: 60000, close: 60000, change: 0 },
  { symbol: 'ETH-USD', name: 'Ethereum / USD', type: 'CRYPTO', price: 2500, close: 2500, change: 0 },
  { symbol: 'BNB-USD', name: 'BNB', type: 'CRYPTO', price: 600, close: 600, change: 0 },
  { symbol: 'XRP-USD', name: 'XRP', type: 'CRYPTO', price: 2.5, close: 2.5, change: 0 },
  { symbol: 'SOL-USD', name: 'Solana', type: 'CRYPTO', price: 150, close: 150, change: 0 },
  { symbol: 'ADA-USD', name: 'Cardano', type: 'CRYPTO', price: 0.8, close: 0.8, change: 0 },
  { symbol: 'DOGE-USD', name: 'Dogecoin', type: 'CRYPTO', price: 0.15, close: 0.15, change: 0 },
  { symbol: 'DOT-USD', name: 'Polkadot', type: 'CRYPTO', price: 7, close: 7, change: 0 },
  { symbol: 'LTC-USD', name: 'Litecoin', type: 'CRYPTO', price: 100, close: 100, change: 0 },
  { symbol: 'BCH-USD', name: 'Bitcoin Cash', type: 'CRYPTO', price: 400, close: 400, change: 0 },
  { symbol: 'LINK-USD', name: 'Chainlink', type: 'CRYPTO', price: 20, close: 20, change: 0 },
  { symbol: 'AVAX-USD', name: 'Avalanche', type: 'CRYPTO', price: 35, close: 35, change: 0 },
  { symbol: 'TRX-USD', name: 'TRON', type: 'CRYPTO', price: 0.2, close: 0.2, change: 0 },
  { symbol: 'SHIB-USD', name: 'Shiba Inu', type: 'CRYPTO', price: 0.00002, close: 0.00002, change: 0 },
  { symbol: 'XLM-USD', name: 'Stellar', type: 'CRYPTO', price: 0.3, close: 0.3, change: 0 },
  { symbol: 'ATOM-USD', name: 'Cosmos Hub', type: 'CRYPTO', price: 8, close: 8, change: 0 },
  { symbol: 'UNI-USD', name: 'Uniswap', type: 'CRYPTO', price: 10, close: 10, change: 0 },
  { symbol: 'ETC-USD', name: 'Ethereum Classic', type: 'CRYPTO', price: 25, close: 25, change: 0 },
  { symbol: 'ICP-USD', name: 'Internet Computer', type: 'CRYPTO', price: 12, close: 12, change: 0 },
  { symbol: 'FIL-USD', name: 'Filecoin', type: 'CRYPTO', price: 6, close: 6, change: 0 },
  { symbol: 'NEAR-USD', name: 'NEAR Protocol', type: 'CRYPTO', price: 6, close: 6, change: 0 },
  { symbol: 'APT-USD', name: 'Aptos', type: 'CRYPTO', price: 9, close: 9, change: 0 },
  { symbol: 'OP-USD', name: 'Optimism', type: 'CRYPTO', price: 2, close: 2, change: 0 },
  { symbol: 'ARB-USD', name: 'Arbitrum', type: 'CRYPTO', price: 1, close: 1, change: 0 },
  { symbol: 'HBAR-USD', name: 'Hedera', type: 'CRYPTO', price: 0.1, close: 0.1, change: 0 },
  { symbol: 'VET-USD', name: 'VeChain', type: 'CRYPTO', price: 0.04, close: 0.04, change: 0 },
  { symbol: 'ALGO-USD', name: 'Algorand', type: 'CRYPTO', price: 0.3, close: 0.3, change: 0 },
  { symbol: 'AAVE-USD', name: 'Aave', type: 'CRYPTO', price: 150, close: 150, change: 0 }
];
const defaultState = () => ({
  cash: INITIAL_CASH,
  assets: seedAssets.map(asset => ({ ...asset, history: [], quoteFresh: false, estimated: true })),
  positions: [],
  orders: [],
  trades: [],
  favorites: ['AAPL', 'NVDA', 'SPY', 'BTC-USD'],
  alerts: [],
  notifications: [{ title: 'Bienvenue sur SIMTRADE', message: 'Votre compte est prêt avec 1 000 euros virtuels.', date: new Date().toISOString() }],
  equityHistory: Array(48).fill(INITIAL_CASH)
});
let currentUser = null;
function userStorageKey() { return `${STORAGE_KEY}:${currentUser?.id || 'guest'}`; }
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(userStorageKey()));
    if (saved && typeof saved === 'object') {
      const defaults = defaultState();
      return { ...defaults, ...saved, assets: defaults.assets.map(seed => {
        const cached = saved.assets?.find(item => item.symbol === seed.symbol) || {};
        const hasCachedPrice = Number.isFinite(cached.price) && cached.price > 0;
        return { ...seed, ...cached, price: hasCachedPrice ? cached.price : seed.price, quoteFresh: false, estimated: true };
      }) };
    }
  } catch (_) { /* Storage may be unavailable in private browsing. */ }
  return defaultState();
}
let state = defaultState();
let currentView = 'dashboard';
let selectedRange = '1D';
let chartSeries = state.equityHistory;
let tradeDraft = { symbol: 'AAPL', side: 'BUY', confirm: false };
let marketFilter = '';
let quoteState = 'loading';
let quoteFetchedAt = null;
let quoteRequestPending = false;
let marketTypeFilter = 'ALL';
let marketSort = 'CHANGE_DESC';
let marketFavoritesOnly = false;
let communityTab = 'DISCOVER';
let communityPeople = [];
let communityFeed = [];
let communityFollowingCount = 0;
let communityLoading = false;
let communityError = '';
let adminOverview = null;
let adminError = '';
const pageContent = document.getElementById('pageContent');
const money = value => `${Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small>EUR</small>`;
const number = value => Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quoteNumber = value => Number.isFinite(Number(value)) && Number(value) > 0 ? number(value) : '—';
const signed = value => `${value >= 0 ? '+' : ''}${number(value)}`;
const asset = symbol => state.assets.find(item => item.symbol === symbol);
const position = symbol => state.positions.find(item => item.symbol === symbol);
const openOrders = () => state.orders.filter(order => order.status === 'OPEN');
const reservedCash = () => openOrders().filter(order => order.side === 'BUY').reduce((sum, order) => sum + order.reserved, 0);
const cashAvailable = () => Math.max(0, state.cash - reservedCash());
const positionsValue = () => state.positions.reduce((sum, item) => sum + item.quantity * (asset(item.symbol)?.price || 0), 0);
const totalEquity = () => state.cash + positionsValue();
const unrealizedPnl = () => state.positions.reduce((sum, item) => sum + ((asset(item.symbol)?.price || item.average) - item.average) * item.quantity, 0);
const realizedPnl = () => state.trades.reduce((sum, trade) => sum + (trade.side === 'SELL' ? trade.pnl : 0), 0);
const feeFor = gross => Math.max(1, gross * .001);
function save() {
  const preferences = {
    favorites: state.favorites,
    alerts: state.alerts,
    notifications: state.notifications,
    equityHistory: state.equityHistory,
    assets: state.assets.map(({ symbol, price, close, change, high, low, volume, currency, marketTime, history }) => ({ symbol, price, close, change, high, low, volume, currency, marketTime, history }))
  };
  try { localStorage.setItem(userStorageKey(), JSON.stringify(preferences)); } catch (_) { /* Continue with an in-memory demo session. */ }
}
function applyPortfolio(portfolio) {
  state.cash = portfolio.wallet.cashAvailable + portfolio.wallet.cashReserved;
  state.positions = portfolio.positions;
  state.orders = portfolio.orders;
  state.trades = portfolio.trades;
}
async function refreshPortfolio() {
  const response = await fetch('/api/portfolio', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Impossible de charger le portefeuille du serveur.');
  applyPortfolio(await response.json());
}
function setQuoteBadge(status, timestamp = null) {
  quoteState = status;
  quoteFetchedAt = timestamp || quoteFetchedAt;
  const badge = document.getElementById('quoteStatus');
  if (!badge) return;
  const labels = {
    loading: 'Connexion au flux…',
    live: 'Yahoo Finance · cours reçus',
    stale: 'Estimation locale · flux Yahoo partiel',
    estimated: 'Estimation locale · Yahoo actualisé périodiquement',
    failed: 'Cours indisponible · estimation impossible'
  };
  badge.textContent = labels[status] || labels.failed;
  badge.classList.toggle('stale', ['stale', 'estimated'].includes(status));
  badge.classList.toggle('failed', status === 'failed');
  badge.title = quoteFetchedAt ? `Dernière réponse du serveur : ${new Date(quoteFetchedAt).toLocaleString('fr-FR')}` : 'Les cours peuvent être différés.';
  document.getElementById('sideMarketLabel').textContent = status === 'live' ? 'Flux marché reçu' : ['stale', 'estimated'].includes(status) ? 'Estimation locale du marché' : status === 'failed' ? 'Flux indisponible' : 'Connexion au marché';
  document.getElementById('sideMarketTime').textContent = quoteFetchedAt ? `Yahoo · ${new Date(quoteFetchedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Yahoo Finance · cotations différées';
}
async function showWorkspace(user) {
  currentUser = user;
  state = loadState();
  chartSeries = state.equityHistory;
  document.getElementById('userDisplayName').textContent = user.displayName;
  document.getElementById('userEmail').textContent = user.email;
  document.getElementById('userInitials').textContent = user.displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  document.getElementById('authGate').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  await refreshPortfolio();
  render();
}
let authMode = 'register';
function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === mode));
  document.getElementById('authNameField').classList.toggle('hidden', !registering);
  document.getElementById('authDisplayName').required = registering;
  document.getElementById('authPassword').autocomplete = registering ? 'new-password' : 'current-password';
  document.getElementById('authPassword').placeholder = registering ? '10 caractères minimum' : 'Ton mot de passe';
  document.getElementById('authTitle').textContent = registering ? 'Créer mon accès' : 'Ravi de te revoir';
  document.getElementById('authDescription').textContent = registering ? 'Crée un compte et commence avec 1 000 EUR.' : 'Connecte-toi pour retrouver ton portefeuille.';
  document.getElementById('authSubmit').innerHTML = `${registering ? 'Créer mon compte' : 'Ouvrir ma session'} <span>→</span>`;
  document.getElementById('authMessage').textContent = '';
}
function showAuthMessage(message, success = false) {
  const element = document.getElementById('authMessage');
  element.textContent = message;
  element.classList.toggle('success', success);
}
async function initializeSession() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (response.ok) {
      const result = await response.json();
      await showWorkspace(result.user);
      await updateMarket();
      return;
    }
    setQuoteBadge('loading');
  } catch (_) {
    showAuthMessage('Service local introuvable. Lance le site avec « node server.js ».');
  }
}
function cleanTradingCopy(value) {
  return String(value)
    .replace(/Profondeur simulée/gi, 'Profondeur synthétique')
    .replace(/Compte de démonstration/gi, 'Compte')
    .replace(/Compte de simulation/gi, 'Compte')
    .replace(/Ordre de simulation/gi, 'Ordre')
    .replace(/EUR EUR/gi, 'EUR')
    .replace(/démonstration/gi, '')
    .replace(/\bfictifs?\b|\bfictives?\b/gi, '')
    .replace(/\bvirtuels?\b|\bvirtuelles?\b/gi, '')
    .replace(/\bsimulation\b/gi, '')
    .replace(/\bsimulés?\b|\bsimulées?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+\./g, '.')
    .trim();
}
function cleanTradingTree(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) walker.currentNode.nodeValue = cleanTradingCopy(walker.currentNode.nodeValue);
  root.querySelectorAll('[aria-label], [title]').forEach(element => {
    for (const attribute of ['aria-label', 'title']) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, cleanTradingCopy(element.getAttribute(attribute)));
    }
  });
}
function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = `toast${error ? ' error' : ''}`;
  item.textContent = cleanTradingCopy(message);
  document.getElementById('toastRegion').append(item);
  window.setTimeout(() => item.remove(), 3600);
}
function addNotification(title, message) {
  state.notifications.unshift({ title, message, date: new Date().toISOString() });
  state.notifications = state.notifications.slice(0, 30);
}
function setView(view) {
  currentView = view;
  const labels = { dashboard: 'Vue d’ensemble', markets: 'Marchés', portfolio: 'Portefeuille', orders: 'Ordres', trades: 'Transactions', watchlist: 'Favoris', community: 'Communauté', alerts: 'Alertes', settings: 'Paramètres', admin: 'Administration' };
  document.getElementById('pageCrumb').textContent = labels[view] || 'Vue d’ensemble';
  document.querySelectorAll('.nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('.mobile-nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  document.getElementById('sidebar').classList.remove('open');
  render();
  if (view === 'community') loadCommunity();
  if (view === 'admin') loadAdminOverview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function pageTitle(title, subtitle, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${currentUser?.displayName || 'Compte'} · EUR · Yahoo Finance</p><h1>${title}</h1><p class="subheading">${subtitle}</p></div>${action}</div>`;
}
function metricCard(label, value, meta, icon, metaClass = '') {
  return `<article class="metric-card"><div class="metric-label">${label}<span class="metric-icon">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-meta ${metaClass}">${meta}</div></article>`;
}
function assetIdentity(symbol, name) {
  return `<div class="asset-id"><span class="asset-logo">${symbol.slice(0, 2)}</span><span><b>${symbol}</b><small>${name || asset(symbol)?.name || ''}</small></span></div>`;
}
function changeClass(value) { return value >= 0 ? 'positive' : 'negative'; }
function sparklineMarkup(item, className = 'watch-sparkline') {
  const values = (item?.history || []).filter(Number.isFinite).slice(-48);
  if (values.length < 2) return `<svg class="market-sparkline ${className}" viewBox="0 0 100 38" role="img" aria-label="Historique de ${item?.symbol || 'l’actif'} en attente"><path class="sparkline-path" d="M 0 19 L 100 19"></path></svg>`;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || Math.abs(maximum) * 0.001 || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 34 - ((value - minimum) / span) * 29;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const direction = values.at(-1) >= values[0] ? 'rising' : 'falling';
  return `<svg class="market-sparkline ${className} ${direction}" viewBox="0 0 100 38" preserveAspectRatio="none" role="img" aria-label="Courbe récente de ${item.symbol}"><path class="sparkline-area" d="M 0 38 L ${points} L 100 38 Z"></path><polyline class="sparkline-path" points="${points}"></polyline></svg>`;
}
function sparkBars(seed) {
  return sparklineMarkup(asset(seed));
}
function chartPanel(title, subtitle, values, quote = '') {
  return `<section class="panel chart-panel"><div class="panel-head"><div class="panel-title"><h2>${title}</h2><span class="panel-subtitle">${subtitle}</span></div><span class="chart-legend"><i class="legend-dot"></i>Valeur EUR</span></div><div class="chart-summary"><div><span class="chart-price">${quote || `${number(totalEquity())} <small style="font:10px var(--mono);color:var(--muted)">EUR</small>`}</span><span class="chart-change ${changeClass(unrealizedPnl())}">${signed(unrealizedPnl())} EUR</span></div><div class="chart-range">${['1H', '4H', '1D', '1W', '1M', '1Y'].map(range => `<button class="range-button${selectedRange === range ? ' active' : ''}" data-range="${range}">${range}</button>`).join('')}</div></div><div class="chart-wrap"><canvas id="priceChart" aria-label="Graphique de performance"></canvas></div><div class="chart-foot"><span>09:30</span><span>12:00</span><span>14:30</span><span>16:00</span></div></section>`;
}
function quickStartGuide() {
  const lessons = [
    { title: '1. Explorer les marchés', description: 'Ouvre la vue Marchés, filtre par action, ETF ou crypto, puis clique sur un actif pour lire sa fiche.', action: '✅ Voir les cours et les tendances' },
    { title: '2. Acheter ou vendre', description: 'Sélectionne un actif, choisis le côté Achat/Vente, puis valide la quantité et le type d’ordre.', action: '📈 Passer un ordre pas à pas' },
    { title: '3. Gérer les ordres', description: 'Dans Ordres, vérifie les ordres ouverts, leur statut et annule ceux que tu ne veux plus tenir.', action: '🔄 Suivre et annuler' },
    { title: '4. Surveiller ton portefeuille', description: 'Va sur Portefeuille pour suivre la valeur totale, les positions et le P&L actuel en temps réel.', action: '💼 Contrôler tes performances' },
    { title: '5. Créer des alertes', description: 'Dans Alertes, fixe un seuil de prix pour recevoir un rappel en cas d’atteinte.', action: '🔔 Mettre un seuil d’alerte' },
    { title: '6. Suivre la communauté', description: 'Active le partage de ton profil dans Paramètres, puis suis d’autres profils publics.', action: '👥 Découvrir et suivre' }
  ];
  return `<div class="guide-grid">${lessons.map(item => `<article class="guide-card"><span class="guide-badge">${item.title.split('.')[0]}</span><h3>${item.title}</h3><p>${item.description}</p><span class="guide-action">${item.action}</span></article>`).join('')}</div>`;
}
function openHelp() {
  const modal = document.getElementById('tradeModal');
  modal.classList.remove('asset-details-modal');
  modal.classList.add('help-modal');
  modal.innerHTML = `<div class="modal-head"><div><p class="eyebrow">SIMTRADE · AIDE</p><h2 id="modalTitle">Cours d’initiation</h2><p class="subheading">Comment utiliser chaque fonctionnalité du site</p></div><button class="modal-close" data-close-modal aria-label="Fermer l’aide" title="Fermer">×</button></div><div class="modal-body">${quickStartGuide()}</div>`;
  document.getElementById('modalBackdrop').classList.remove('hidden');
  modal.querySelector('[data-close-modal]').focus();
}
function positionsTable(items = state.positions) {
  const rows = items.map(item => {
    const quote = asset(item.symbol);
    const price = quote?.price || 0;
    const value = price * item.quantity;
    const pnl = (price - item.average) * item.quantity;
    return `<tr><td>${assetIdentity(item.symbol, quote?.name)}</td><td>${number(item.quantity)}</td><td>${number(item.average)}</td><td>${quoteNumber(price)}</td><td>${number(value)}</td><td class="${changeClass(pnl)}">${signed(pnl)}</td><td><button class="button small" data-trade="${item.symbol}" data-side="SELL" ${quote?.quoteFresh ? '' : 'disabled'}>Vendre</button></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="position-table"><thead><tr><th>ACTIF</th><th>QUANTITÉ</th><th>PRIX MOYEN</th><th>COURS</th><th>VALEUR</th><th>P&amp;L LATENT</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="table-empty">Aucune position pour le moment. Découvrez les marchés pour passer votre premier ordre.</td></tr>`}</tbody></table></div>`;
}
function watchRows(symbols) {
  return symbols.map(symbol => {
    const item = asset(symbol);
    if (!item) return '';
    return `<div class="watch-row">${assetIdentity(item.symbol, item.name)}${sparkBars(item.symbol)}<div class="watch-price"><b>${quoteNumber(item.price)}</b><div class="${changeClass(item.change)}" style="margin-top:4px">${item.price ? `${signed(item.change)}%` : '—'}</div></div><div class="watch-actions"><button class="button small" data-trade="${item.symbol}" data-side="BUY" ${item.quoteFresh ? '' : 'disabled'}>Acheter</button><button class="text-button" data-favorite="${item.symbol}" aria-label="Retirer ${item.symbol} des favoris">×</button></div></div>`;
  }).join('');
}
function bookRows(item, side) {
  const isBid = side === 'bid';
  return Array.from({ length: 3 }, (_, index) => {
    const spread = item.price * (.0002 + index * .00008);
    const price = item.price + (isBid ? -spread : spread);
    const size = Math.round(8 + ((index + item.symbol.length) * 17) % 80);
    const depth = 30 + ((index * 21 + item.symbol.length * 5) % 60);
    return `<div class="book-row"><i class="book-depth" style="width:${depth}%;background:${isBid ? '#6bc987' : '#df7168'}"></i><span>${number(price)}</span><span>${size}</span><span>${number(price * size)}</span></div>`;
  }).join('');
}
function dashboardView() {
  const pnl = unrealizedPnl() + realizedPnl();
  const marketLeader = [...state.assets].sort((a, b) => b.change - a.change)[0];
  return `${pageTitle(`Bonjour, ${currentUser?.displayName?.split(' ')[0] || 'trader'}`, 'Voici un aperçu de votre compte virtuel et des marchés.', `<button class="button ghost" data-open-help aria-haspopup="dialog">? Aide</button><span class="date-line">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>`)}
    <div class="metric-grid">${metricCard('CAPITAL TOTAL', money(totalEquity()), `<span class="${changeClass(pnl)}">${signed(pnl)} EUR</span> depuis le début`, '◈')}${metricCard('CASH DISPONIBLE', money(cashAvailable()), `${number(reservedCash())} EUR réservés`, '＄')}${metricCard('VALEUR DES POSITIONS', money(positionsValue()), `${state.positions.length} actif${state.positions.length > 1 ? 's' : ''} détenu${state.positions.length > 1 ? 's' : ''}`, '◫')}${metricCard('P&amp;L LATENT', `${signed(unrealizedPnl())} <small>EUR</small>`, `${state.positions.length} position${state.positions.length > 1 ? 's' : ''} ouverte${state.positions.length > 1 ? 's' : ''}`, '↗', changeClass(unrealizedPnl()))}</div>
    <div class="dashboard-grid"><div><div style="margin-bottom:14px">${chartPanel('Performance du portefeuille', 'Capital virtuel · aujourd’hui', chartSeries)}</div><section class="panel"><div class="panel-head"><div class="panel-title"><h2>Positions</h2><span class="panel-subtitle">${state.positions.length} ouverte${state.positions.length === 1 ? '' : 's'}</span></div><button class="button ghost small" data-view="portfolio">Tout voir <span class="icon-inline">→</span></button></div>${positionsTable()}</section>
      <section class="panel"><div class="panel-head"><div class="panel-title"><h2>Dernières transactions</h2><span class="panel-subtitle">Exécutions simulées</span></div><button class="button ghost small" data-view="trades">Historique <span class="icon-inline">→</span></button></div>${state.trades.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ACTIF</th><th>SENS</th><th>QUANTITÉ</th><th>PRIX</th><th>DATE</th></tr></thead><tbody>${state.trades.slice(0, 4).map(trade => `<tr><td>${assetIdentity(trade.symbol, asset(trade.symbol)?.name)}</td><td class="${trade.side === 'BUY' ? 'positive' : 'negative'}">${trade.side === 'BUY' ? 'ACHAT' : 'VENTE'}</td><td>${number(trade.quantity)}</td><td>${number(trade.price)}</td><td>${new Date(trade.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><b>Pas encore de transaction</b><p>Vos exécutions apparaîtront ici.</p></div>`}</section></div>
      <div><section class="panel"><div class="panel-head"><div class="panel-title"><h2>Favoris</h2><span class="panel-subtitle">Watchlist</span></div><button class="button ghost small" data-view="watchlist">Voir tout →</button></div><div class="panel-body" style="padding-top:4px;padding-bottom:4px">${watchRows(state.favorites.slice(0, 4))}</div></section>
      <section class="panel"><div class="panel-head"><div class="panel-title"><h2>Carnet d'ordres</h2><span class="panel-subtitle">${marketLeader.symbol} · marché</span></div><span class="live-dot"></span></div><div class="panel-body"><div class="orderbook"><div class="orderbook-header"><span>PRIX (EUR)</span><span>QUANTITÉ</span><span>VALEUR</span></div>${bookRows(marketLeader, 'ask')}<div class="book-spread">Spread estimé · ${number(marketLeader.price * .0004)} EUR</div>${bookRows(marketLeader, 'bid')}</div><button class="button primary" style="width:100%;margin-top:13px" data-trade="${marketLeader.symbol}" data-side="BUY">Nouvel ordre <span class="icon-inline">↗</span></button></div></section>
      <section class="panel"><div class="panel-head"><div class="panel-title"><h2>Ordres ouverts</h2><span class="panel-subtitle">${openOrders().length} en attente</span></div><button class="button ghost small" data-view="orders">Voir →</button></div>${openOrders().length ? `<div class="panel-body" style="padding-top:4px;padding-bottom:4px">${openOrders().slice(0, 3).map(order => `<div class="watch-row"><div>${assetIdentity(order.symbol, `${order.side === 'BUY' ? 'Achat' : 'Vente'} · ${order.type === 'LIMIT' ? 'limite' : order.type === 'STOP_LOSS' ? 'stop-loss' : 'take-profit'}`)}</div><div class="watch-price">${number(order.quantity)} × ${number(order.trigger)}</div><button class="text-button" data-cancel="${order.id}" aria-label="Annuler l'ordre">×</button></div>`).join('')}</div>` : `<div class="empty-state"><p>Aucun ordre en attente.</p></div>`}</section></div></div>`;
}
function compactVolume(value) {
  return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}
function estimateMarketPrices() {
  let hasEstimates = false;
  for (const item of state.assets) {
    if (!Number.isFinite(item.price) || item.price <= 0) continue;
    const volatility = item.type === 'CRYPTO' ? 0.00008 : 0.00002;
    item.price = Math.max(0.01, item.price * (1 + (Math.random() - 0.5) * volatility));
    item.change = item.close ? (item.price / item.close - 1) * 100 : item.change;
    item.high = Math.max(item.high || item.price, item.price);
    item.low = Math.min(item.low || item.price, item.price);
    item.history = [...(item.history || []), item.price].slice(-48);
    item.estimated = true;
    hasEstimates = true;
  }
  if (!hasEstimates) return;
  setQuoteBadge('estimated');
  if (['dashboard', 'portfolio', 'markets', 'watchlist'].includes(currentView)) render();
}
function marketsView() {
  let matching = state.assets.filter(item => `${item.symbol} ${item.name}`.toLowerCase().includes(marketFilter.toLowerCase()));
  if (marketTypeFilter !== 'ALL') matching = matching.filter(item => item.type === marketTypeFilter);
  if (marketFavoritesOnly) matching = matching.filter(item => state.favorites.includes(item.symbol));
  const sorters = {
    CHANGE_DESC: (left, right) => right.change - left.change,
    CHANGE_ASC: (left, right) => left.change - right.change,
    PRICE_DESC: (left, right) => (right.price || 0) - (left.price || 0),
    PRICE_ASC: (left, right) => (left.price || 0) - (right.price || 0),
    VOLUME_DESC: (left, right) => (right.volume || 0) - (left.volume || 0)
  };
  matching.sort(sorters[marketSort] || sorters.CHANGE_DESC);
  const kinds = [['ALL', 'Tout'], ['ACTION', 'Actions'], ['ETF', 'ETF'], ['CRYPTO', 'Crypto']];
  return `${pageTitle('Marchés', 'Cotations, tendances et profondeur de marché en un coup d’œil.', `<button class="button ghost" id="marketSearchFocus"><span class="icon-inline">⌕</span> Rechercher</button>`)}
    <div class="market-toolbar"><div class="segmented">${kinds.map(([value, label]) => `<button class="${marketTypeFilter === value ? 'active' : ''}" data-market-type="${value}">${label}</button>`).join('')}</div><button class="favorite-filter${marketFavoritesOnly ? ' active' : ''}" data-market-favorites aria-pressed="${marketFavoritesOnly}">☆ Favoris</button><select class="filter-select" id="marketSort" aria-label="Trier les actifs"><option value="CHANGE_DESC" ${marketSort === 'CHANGE_DESC' ? 'selected' : ''}>Plus fortes hausses</option><option value="CHANGE_ASC" ${marketSort === 'CHANGE_ASC' ? 'selected' : ''}>Plus fortes baisses</option><option value="PRICE_DESC" ${marketSort === 'PRICE_DESC' ? 'selected' : ''}>Prix décroissant</option><option value="PRICE_ASC" ${marketSort === 'PRICE_ASC' ? 'selected' : ''}>Prix croissant</option><option value="VOLUME_DESC" ${marketSort === 'VOLUME_DESC' ? 'selected' : ''}>Volume élevé</option></select><span class="market-count">${matching.length} actifs</span></div>
    <div class="asset-grid">${matching.map(item => `<article class="asset-card"><div class="asset-card-top">${assetIdentity(item.symbol, item.name)}<button class="text-button" data-favorite="${item.symbol}" aria-label="${state.favorites.includes(item.symbol) ? 'Retirer' : 'Ajouter'} ${item.symbol} des favoris">${state.favorites.includes(item.symbol) ? '★' : '☆'}</button></div><div class="asset-card-price">${quoteNumber(item.price)} <small>${item.currency || 'EUR'}</small></div><div class="asset-card-chart">${sparklineMarkup(item, 'asset-sparkline')}</div><div class="asset-card-meta"><span>Bas ${quoteNumber(item.low)} · Haut ${quoteNumber(item.high)}</span><span>Vol. ${compactVolume(item.volume)}</span></div><div class="asset-card-bottom"><span class="${changeClass(item.change)}">${item.price ? `${signed(item.change)}% aujourd’hui${item.estimated ? ' · estimé' : ''}` : 'Cours indisponible'}</span><span>${item.type}</span></div><button class="market-card-details" data-details="${item.symbol}">Fiche de l’actif <span aria-hidden="true">→</span></button><div class="asset-card-actions"><button class="button primary small" data-trade="${item.symbol}" data-side="BUY" ${item.quoteFresh ? '' : 'disabled'}>Acheter</button><button class="button small" data-trade="${item.symbol}" data-side="SELL" ${item.quoteFresh ? '' : 'disabled'}>Vendre</button></div></article>`).join('') || `<div class="panel empty-state"><span class="empty-icon">⌕</span><b>Aucun actif correspondant</b><p>Modifiez vos filtres ou votre recherche.</p></div>`}</div>`;
}
function openAssetDetails(symbol) {
  const item = asset(symbol);
  if (!item) return;
  const currency = item.currency || 'EUR';
  const modal = document.getElementById('tradeModal');
  modal.classList.add('asset-details-modal');
  modal.innerHTML = `<div class="modal-head"><div><p class="eyebrow">${item.type} · ${item.symbol}</p><h2 id="modalTitle">${item.name}</h2><p class="subheading">Cotation ${quoteState === 'live' ? 'reçue' : 'à vérifier'} · source Yahoo Finance</p></div><button class="modal-close" data-close-modal aria-label="Fermer">×</button></div><div class="modal-body"><div class="asset-detail-context"><span>Dernier cours</span><span>${item.marketTime ? new Date(item.marketTime).toLocaleString('fr-FR') : 'En attente'}</span></div><div class="asset-detail-price"><strong>${quoteNumber(item.price)}</strong><span>${currency}</span><b class="${changeClass(item.change)}">${item.price ? `${signed(item.change)}%` : 'Indisponible'}</b></div><div class="asset-detail-chart">${sparklineMarkup(item, 'detail-sparkline')}</div><div class="asset-detail-stats"><div class="asset-detail-stat"><span>Ouverture précédente</span><b>${quoteNumber(item.close)} ${currency}</b></div><div class="asset-detail-stat"><span>Plus haut du jour</span><b>${quoteNumber(item.high)} ${currency}</b></div><div class="asset-detail-stat"><span>Plus bas du jour</span><b>${quoteNumber(item.low)} ${currency}</b></div><div class="asset-detail-stat"><span>Volume</span><b>${compactVolume(item.volume)}</b></div><div class="asset-detail-stat"><span>Marché</span><b>${item.type}</b></div><div class="asset-detail-stat"><span>Devise source</span><b>${currency}</b></div></div><p class="asset-detail-context"><span>Variation par rapport à la clôture précédente</span><span>${number(item.change)} ${currency}</span></p></div><div class="modal-actions"><button class="button ghost" data-close-modal>Fermer</button><button class="button" data-detail-trade="${item.symbol}" data-side="SELL" ${item.quoteFresh ? '' : 'disabled'}>Vendre</button><button class="button primary" data-detail-trade="${item.symbol}" data-side="BUY" ${item.quoteFresh ? '' : 'disabled'}>Acheter</button></div>`;
  cleanTradingTree(modal);
  document.getElementById('modalBackdrop').classList.remove('hidden');
}
function portfolioView() {
  const pnl = unrealizedPnl() + realizedPnl();
  return `${pageTitle('Portefeuille', 'Suivez vos positions ouvertes et leur performance simulée.', `<button class="button primary" data-view="markets"><span class="icon-inline">＋</span> Explorer les marchés</button>`)}<div class="metric-grid">${metricCard('CAPITAL TOTAL', money(totalEquity()), 'Cash + valeur des positions', '◈')}${metricCard('CASH DISPONIBLE', money(cashAvailable()), `${number(reservedCash())} EUR réservés`, '＄')}${metricCard('P&amp;L LATENT', `${signed(unrealizedPnl())} <small>EUR</small>`, 'Positions ouvertes', '↗', changeClass(unrealizedPnl()))}${metricCard('P&amp;L RÉALISÉ', `${signed(realizedPnl())} <small>EUR</small>`, 'Transactions clôturées', '✓', changeClass(realizedPnl()))}</div><div style="margin-bottom:14px">${chartPanel('Évolution du portefeuille', 'Capital virtuel · aujourd’hui', chartSeries)}</div><section class="panel"><div class="panel-head"><div class="panel-title"><h2>Positions ouvertes</h2><span class="panel-subtitle">${state.positions.length} actif${state.positions.length > 1 ? 's' : ''}</span></div></div>${positionsTable()}</section>`;
}
function ordersView() {
  const rows = [...state.orders].sort((a, b) => new Date(b.date) - new Date(a.date)).map(order => `<tr><td>${assetIdentity(order.symbol, asset(order.symbol)?.name)}</td><td class="${order.side === 'BUY' ? 'positive' : 'negative'}">${order.side === 'BUY' ? 'ACHAT' : 'VENTE'}</td><td>${order.type === 'STOP_LOSS' ? 'STOP-LOSS' : order.type === 'TAKE_PROFIT' ? 'TAKE-PROFIT' : order.type === 'LIMIT' ? 'LIMITE' : 'MARCHÉ'}</td><td>${number(order.quantity)}</td><td>${number(order.trigger || asset(order.symbol).price)}</td><td><span class="${order.status === 'OPEN' ? 'neutral' : order.status === 'FILLED' ? 'positive' : 'negative'}">${order.status === 'OPEN' ? 'OUVERT' : order.status === 'FILLED' ? 'EXÉCUTÉ' : order.status === 'CANCELLED' ? 'ANNULÉ' : 'REJETÉ'}</span></td><td>${new Date(order.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${order.status === 'OPEN' ? `<button class="button danger small" data-cancel="${order.id}">Annuler</button>` : '—'}</td></tr>`).join('');
  return `${pageTitle('Ordres', 'Consultez et gérez vos ordres de simulation.', `<button class="button primary" data-view="markets"><span class="icon-inline">＋</span> Nouvel ordre</button>`)}<div class="filters"><select class="filter-select" id="orderStatusFilter"><option value="ALL">Tous les statuts</option><option value="OPEN">Ouverts</option><option value="FILLED">Exécutés</option><option value="CANCELLED">Annulés</option></select><span class="panel-subtitle">${state.orders.length} ordre${state.orders.length !== 1 ? 's' : ''} au total</span></div><section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>ACTIF</th><th>SENS</th><th>TYPE</th><th>QUANTITÉ</th><th>PRIX DÉCLENCHEUR</th><th>STATUT</th><th>DATE</th><th></th></tr></thead><tbody id="ordersTableBody">${rows || `<tr><td colspan="8" class="table-empty">Aucun ordre. Les ordres que vous passerez apparaîtront ici.</td></tr>`}</tbody></table></div></section>`;
}
function tradesView() {
  const rows = [...state.trades].sort((a, b) => new Date(b.date) - new Date(a.date)).map(trade => `<tr><td>${new Date(trade.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td>${assetIdentity(trade.symbol, asset(trade.symbol)?.name)}</td><td class="${trade.side === 'BUY' ? 'positive' : 'negative'}">${trade.side === 'BUY' ? 'ACHAT' : 'VENTE'}</td><td>${number(trade.quantity)}</td><td>${number(trade.price)}</td><td>${number(trade.fee)}</td><td>${number(trade.gross)}</td><td class="${changeClass(trade.pnl)}">${trade.side === 'SELL' ? signed(trade.pnl) : '—'}</td></tr>`).join('');
  return `${pageTitle('Transactions', 'Historique de vos exécutions et frais de transaction.', `<button class="button ghost" id="exportCsv"><span class="icon-inline">↓</span> Exporter CSV</button>`)}<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>DATE</th><th>ACTIF</th><th>SENS</th><th>QUANTITÉ</th><th>PRIX</th><th>FRAIS</th><th>VALEUR BRUTE</th><th>P&amp;L RÉALISÉ</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="table-empty">Aucune transaction pour le moment.</td></tr>`}</tbody></table></div></section>`;
}
function watchlistView() {
  const assets = state.assets.filter(item => state.favorites.includes(item.symbol));
  return `${pageTitle('Favoris', 'Gardez vos actifs fictifs préférés à portée de main.', `<button class="button" data-view="markets"><span class="icon-inline">＋</span> Ajouter un actif</button>`)}<section class="panel"><div class="panel-head"><div class="panel-title"><h2>Ma watchlist</h2><span class="panel-subtitle">${assets.length} actifs</span></div></div>${assets.length ? `<div class="panel-body" style="padding-top:4px;padding-bottom:4px">${watchRows(assets.map(item => item.symbol))}</div>` : `<div class="empty-state"><span class="empty-icon">☆</span><b>Votre watchlist est vide</b><p>Ajoutez des actifs fictifs depuis la page Marchés.</p><button class="button small" style="margin-top:13px" data-view="markets">Explorer les marchés</button></div>`}</section>`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function communityTradesMarkup(trades) {
  if (!trades.length) return '<span class="community-no-activity">Aucune transaction publiée</span>';
  return trades.map(trade => `<div class="community-activity-row"><span><b class="${trade.side === 'BUY' ? 'positive' : 'negative'}">${trade.side === 'BUY' ? 'ACHAT' : 'VENTE'}</b> · ${escapeHtml(trade.symbol)} · ${number(trade.quantity)} × ${number(trade.price)} EUR</span><time>${new Date(trade.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</time></div>`).join('');
}
function communityView() {
  const following = communityTab === 'FOLLOWING';
  const people = following ? communityPeople.filter(person => person.isFollowing) : communityPeople;
  const activity = communityFeed.map(item => `<article class="community-person community-feed-item"><div class="community-person-main"><span class="avatar">${escapeHtml(item.displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase())}</span><span><b>${escapeHtml(item.displayName)}</b><small>${new Date(item.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span></div><div class="community-activity-row"><span><b class="${item.side === 'BUY' ? 'positive' : 'negative'}">${item.side === 'BUY' ? 'ACHAT' : 'VENTE'}</b> · ${escapeHtml(item.symbol)} · ${number(item.quantity)} × ${number(item.price)} EUR</span><b>${number(item.fee)} EUR de frais</b></div>${item.side === 'SELL' ? `<span class="community-result ${changeClass(item.pnl)}">P&amp;L réalisé ${signed(item.pnl)} EUR</span>` : '<span class="community-result">Position ouverte</span>'}</article>`).join('');
  const cards = people.map(person => `<article class="community-person"><div class="community-person-main"><span class="avatar">${escapeHtml(person.displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase())}</span><span><b>${escapeHtml(person.displayName)}</b><small>${person.tradeCount} transaction${person.tradeCount === 1 ? '' : 's'} publiée${person.tradeCount === 1 ? '' : 's'}</small></span></div><div class="community-stats"><span>RÉSULTAT RÉALISÉ<b class="${changeClass(person.realizedPnl)}">${signed(person.realizedPnl)} EUR</b></span><span>DERNIÈRE ACTIVITÉ<b>${person.lastActivity ? new Date(person.lastActivity).toLocaleDateString('fr-FR') : '—'}</b></span><div class="community-activity">${communityTradesMarkup(person.recentTrades)}</div></div><button class="button ${person.isFollowing ? 'ghost' : 'primary'} small" data-follow-person="${person.id}" data-is-following="${person.isFollowing}">${person.isFollowing ? 'Suivi' : 'Suivre'}</button></article>`).join('');
  let content = '<div class="community-loading">Chargement des profils publics…</div>';
  if (communityError) content = `<div class="community-empty"><b>La communauté est indisponible</b><p>${escapeHtml(communityError)}</p><button class="button small" data-community-retry>Réessayer</button></div>`;
  else if (!communityLoading && following && communityFeed.length) content = `<div class="community-list">${activity}</div>`;
  else if (!communityLoading && following) content = '<div class="community-empty"><b>Pas encore d’activité suivie</b><p>Découvre des profils publics pour voir leurs transactions exécutées et résultats.</p><button class="button small" data-community-tab="DISCOVER">Découvrir des profils</button></div>';
  else if (!communityLoading && cards) content = `<div class="community-list">${cards}</div>`;
  else if (!communityLoading) content = '<div class="community-empty"><b>Aucun profil public pour le moment</b><p>Les membres choisissent eux-mêmes de publier leur nom, leur résultat réalisé et leurs transactions exécutées.</p><button class="button small" data-view="settings">Gérer mon partage</button></div>';
  return `${pageTitle('Communauté', 'Découvre des profils et suis leurs transactions exécutées.', `<button class="button ghost" data-view="settings">Confidentialité</button>`)}<div class="community-tabs"><button class="${!following ? 'active' : ''}" data-community-tab="DISCOVER">Découvrir</button><button class="${following ? 'active' : ''}" data-community-tab="FOLLOWING">Suivis <span class="nav-count">${communityFollowingCount}</span></button></div><section class="panel"><div class="panel-head"><div class="panel-title"><h2>${following ? 'Activité des profils suivis' : 'Profils publics'}</h2><span class="panel-subtitle">${following ? `${communityFeed.length} activité${communityFeed.length === 1 ? '' : 's'}` : `${communityPeople.length} membre${communityPeople.length === 1 ? '' : 's'}`}</span></div><button class="button ghost small" data-community-retry aria-label="Actualiser">↻ Actualiser</button></div>${content}</section><p class="community-footnote">Seuls les profils ayant activé le partage apparaissent. Aucune transaction n’est copiée sur votre compte.</p>`;
}
async function loadCommunity() {
  if (!currentUser || communityLoading) return;
  communityLoading = true;
  communityError = '';
  render();
  try {
    const peopleResponse = await fetch('/api/community/people', { credentials: 'same-origin', cache: 'no-store' });
    if (!peopleResponse.ok) throw new Error('Impossible de charger les profils publics.');
    const peopleResult = await peopleResponse.json();
    communityPeople = peopleResult.people;
    communityFollowingCount = peopleResult.followingCount;
    const feedResponse = await fetch('/api/community/feed', { credentials: 'same-origin', cache: 'no-store' });
    if (!feedResponse.ok) throw new Error('Impossible de charger le fil d’activité.');
    communityFeed = (await feedResponse.json()).activity;
  } catch (error) {
    communityError = error.message || 'Service communautaire indisponible.';
  } finally {
    communityLoading = false;
    render();
  }
}
async function setPersonFollow(personId, shouldFollow) {
  try {
    const response = await fetch(`/api/follows/${encodeURIComponent(personId)}`, {
      method: shouldFollow ? 'POST' : 'DELETE', credentials: 'same-origin'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Action de suivi impossible.');
    toast(shouldFollow ? 'Profil ajouté à vos suivis.' : 'Profil retiré de vos suivis.');
    await loadCommunity();
  } catch (error) {
    toast(error.message || 'Service communautaire indisponible.', true);
  }
}
function alertsView() {
  const rows = state.alerts.map(alert => `<div class="watch-row"><div>${assetIdentity(alert.symbol, `${alert.kind === 'ABOVE' ? 'Au-dessus de' : 'En dessous de'} ${number(alert.threshold)} EUR`)}</div><span class="${alert.active ? 'positive' : 'neutral'}">${alert.active ? 'ACTIVE' : 'DÉCLENCHÉE'}</span><button class="text-button" data-remove-alert="${alert.id}" aria-label="Supprimer l'alerte">×</button></div>`).join('');
  return `${pageTitle('Alertes de prix', 'Soyez averti lorsqu’un cours atteint votre seuil.', `<button class="button primary" id="newAlert"><span class="icon-inline">＋</span> Créer une alerte</button>`)}<section class="panel"><div class="panel-head"><div class="panel-title"><h2>Mes alertes</h2><span class="panel-subtitle">${state.alerts.filter(item => item.active).length} actives</span></div></div>${rows ? `<div class="panel-body" style="padding-top:4px;padding-bottom:4px">${rows}</div>` : `<div class="empty-state"><span class="empty-icon">◉</span><b>Aucune alerte configurée</b><p>Créez une alerte pour suivre un seuil de prix.</p></div>`}</section>`;
}
function settingsView() {
  const adminAccess = currentUser?.isAdmin
    ? '<div class="notice" style="margin-top:16px">Mode administrateur activé.<button class="button small" style="width:100%;margin-top:12px" data-view="admin">Ouvrir le tableau admin</button></div>'
    : '<form id="adminUnlockForm" style="margin-top:18px"><label class="field-label" for="adminCode">Code administrateur</label><input class="field-input" id="adminCode" name="code" type="password" inputmode="numeric" autocomplete="off" required><button class="button" style="width:100%;margin-top:10px" type="submit">Déverrouiller le mode admin</button><p class="field-hint" id="adminAccessMessage" role="status" aria-live="polite">Accès protégé par un code vérifié par le serveur.</p></form>';
  return `${pageTitle('Paramètres', 'Préférences du compte et de la confidentialité.') }<div class="settings-grid"><section class="panel"><div class="panel-head"><div class="panel-title"><h2>Préférences</h2></div></div><div class="panel-body"><div class="setting-row"><span><b>Notifications de prix</b><small>Alertes lors du déclenchement d’un seuil</small></span><input class="switch" type="checkbox" checked aria-label="Notifications de prix"></div><div class="setting-row"><span><b>Mises à jour du marché</b><small>Cotations Yahoo actualisées toutes les 60 secondes</small></span><input class="switch" type="checkbox" checked aria-label="Mises à jour du marché"></div><div class="setting-row"><span><b>Devise du compte</b><small>Montants affichés en EUR</small></span><strong class="neutral" style="font:11px var(--mono)">EUR</strong></div><div class="setting-row"><span><b>Frais de transaction</b><small>0,10 % · minimum 1,00 EUR</small></span><strong class="neutral" style="font:11px var(--mono)">0,10 %</strong></div></div></section><section class="panel"><div class="panel-head"><div class="panel-title"><h2>Compte local</h2></div></div><div class="panel-body"><div class="notice">Cette session utilise des données locales et fictives. Aucun service bancaire, courtier ou marché réel n’est connecté.</div><div style="margin-top:17px"><div class="metric-label">Solde initial</div><div class="metric-value" style="font-size:19px">1 000,00 <small>EUR</small></div></div><button class="button danger" style="width:100%;margin-top:18px" id="resetAccount">Réinitialiser le compte</button><p class="field-hint" style="line-height:1.6">Cette action annule les ordres, ferme les positions et efface l’historique local de simulation.</p>${adminAccess}</div></section></div>`;
}
function adminView() {
  if (adminError) return `${pageTitle('Administration', 'Vue de contrôle SIMTRADE.') }<section class="panel"><div class="panel-body"><p>${escapeHtml(adminError)}</p><button class="button" data-admin-retry>Réessayer</button></div></section>`;
  if (!adminOverview) return `${pageTitle('Administration', 'Chargement des données administratives…') }<section class="panel"><div class="panel-body">Chargement…</div></section>`;
  const { stats, accounts, cryptos } = adminOverview;
  const accountRows = accounts.map(account => `<tr><td>${escapeHtml(account.displayName)}</td><td>${escapeHtml(new Date(account.createdAt).toLocaleDateString('fr-FR'))}</td><td>${account.isPublic ? 'Public' : 'Privé'}</td><td>${number(account.cashAvailable)} EUR</td><td><form class="admin-credit-form" data-admin-cash-form data-user-id="${account.id}"><input class="field-input" type="number" name="amount" min="0.01" max="1000000" step="0.01" placeholder="Montant" aria-label="Montant à créditer pour ${escapeHtml(account.displayName)}" required><button class="button small" type="submit">Ajouter</button></form></td></tr>`).join('');
  const cryptoRows = cryptos.map(crypto => `<tr><td>${escapeHtml(crypto.symbol)}</td><td>${escapeHtml(crypto.name)}</td><td>Crypto</td></tr>`).join('');
  return `${pageTitle('Administration', 'Comptes, soldes virtuels et catalogue de marché.') }<div class="metric-grid">${metricCard('COMPTES', stats.users, 'Comptes enregistrés', '♙')}${metricCard('SESSIONS', stats.sessions, 'Sessions actives', '◎')}${metricCard('ORDRES', stats.orders, 'Ordres enregistrés', '⇄')}${metricCard('CRYPTOS', stats.cryptos, 'Actifs disponibles', '₿')}</div><section class="panel" style="margin-bottom:14px"><div class="panel-head"><div class="panel-title"><h2>Comptes récents</h2><span class="panel-subtitle">Crédit maximal : 1 000 000 EUR par opération</span></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>COMPTE</th><th>CRÉÉ LE</th><th>PROFIL</th><th>CASH DISPONIBLE</th><th>AJOUTER DU CASH (EUR)</th></tr></thead><tbody>${accountRows || '<tr><td colspan="5" class="table-empty">Aucun compte.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-head"><div class="panel-title"><h2>Catalogue crypto</h2><span class="panel-subtitle">${cryptos.length} actifs depuis SQLite</span></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>SYMBOLE</th><th>NOM</th><th>TYPE</th></tr></thead><tbody>${cryptoRows}</tbody></table></div></section>`;
}
async function loadAdminOverview() {
  adminOverview = null;
  adminError = '';
  try {
    const response = await fetch('/api/admin/overview', { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Accès administrateur indisponible.');
    adminOverview = result;
  } catch (error) {
    adminError = error.message || 'Accès administrateur indisponible.';
  }
  if (currentView === 'admin') render();
}
function render() {
  const renderers = { dashboard: dashboardView, markets: marketsView, portfolio: portfolioView, orders: ordersView, trades: tradesView, watchlist: watchlistView, community: communityView, alerts: alertsView, settings: settingsView, admin: adminView };
  document.getElementById('adminNavItem').classList.toggle('hidden', !currentUser?.isAdmin);
  pageContent.innerHTML = (renderers[currentView] || dashboardView)()
    .replace(/\s{2,}/g, ' ')
    .replaceAll('instruments fictifs', 'instruments cotés')
    .replaceAll('actifs fictifs', 'actifs cotés')
    .replaceAll('cours fictif', 'cours de marché')
    .replaceAll('actif fictif', 'actif de marché')
    .replaceAll('Préférences de votre session de démonstration.', 'Préférences et confidentialité.')
    .replaceAll('Crédits de démonstration', 'Montants affichés en EUR')
    .replaceAll('USD EUR', 'EUR')
    .replaceAll('100 000,00', '1 000,00')
    .replaceAll('Variation simulée toutes les deux secondes', 'Cotations Yahoo actualisées toutes les 60 secondes')
    .replaceAll('Cette session utilise des données locales et fictives. Aucun service bancaire, courtier ou marché réel n’est connecté.', 'Cours Yahoo actualisés périodiquement. Aucun courtier n’est connecté et les ordres ne sont pas transmis.')
    .replaceAll('Cette action annule les ordres, ferme les positions et efface l’historique local de simulation.', 'Cette action annule les ordres, ferme les positions et efface l’historique enregistré.');
  if (currentView === 'settings') {
    const accountSettings = pageContent.querySelector('.settings-grid .panel-body');
    if (accountSettings) {
      const row = document.createElement('div');
      row.className = 'setting-row community-privacy-setting';
      row.innerHTML = `<span><b>Publier mon profil</b><small>Votre nom, votre résultat réalisé et vos transactions exécutées seront visibles aux membres connectés.</small></span><input class="switch" id="publicProfileToggle" type="checkbox" aria-label="Publier mon profil" ${currentUser?.isPublic ? 'checked' : ''}>`;
      accountSettings.prepend(row);
    }
    const feeSetting = [...pageContent.querySelectorAll('.setting-row')].find(row => row.querySelector('b')?.textContent === 'Frais simulés' || row.querySelector('b')?.textContent === 'Frais par transaction');
    if (feeSetting) {
      feeSetting.querySelector('b').textContent = 'Frais par transaction';
      feeSetting.querySelector('small').textContent = '0,10 % du montant · minimum 1,00 EUR';
    }
  }
  pageContent.querySelectorAll('.asset-card').forEach(card => {
    const symbol = card.querySelector('.asset-id b')?.textContent;
    const quote = asset(symbol);
    if (!quote) return;
    card.querySelector('.asset-card-price').innerHTML = `${quoteNumber(quote.price)} <small>${quote.currency || 'EUR'}</small>`;
    const change = card.querySelector('.asset-card-bottom span');
    change.textContent = quote.price ? `${signed(quote.change)}% aujourd’hui${quote.estimated ? ' · estimé' : ''}` : 'Cours indisponible';
    card.querySelectorAll('[data-trade]').forEach(button => { button.disabled = !quote.quoteFresh; });
  });
  pageContent.querySelectorAll('.chart-legend').forEach(legend => { legend.lastChild.textContent = 'Valeur EUR'; });
  pageContent.querySelectorAll('.chart-price small').forEach(currency => { currency.textContent = 'EUR'; });
  pageContent.querySelectorAll('.chart-change').forEach(change => { change.textContent = `${signed(unrealizedPnl())} EUR`; });
  pageContent.querySelectorAll('.metric-value small').forEach(currency => { currency.textContent = 'EUR'; });
  pageContent.querySelectorAll('.metric-card').forEach(card => {
    if (card.textContent.includes('CASH DISPONIBLE')) card.querySelector('.metric-icon').textContent = '€';
  });
  pageContent.querySelectorAll('.metric-meta').forEach(meta => {
    meta.textContent = meta.textContent.replace(/\s{2,}/g, ' ');
  });
  pageContent.querySelectorAll('.watch-row').forEach(row => {
    const symbol = row.querySelector('.asset-id b')?.textContent;
    const quote = asset(symbol);
    if (!quote) return;
    const price = row.querySelector('.watch-price b');
    const change = row.querySelector('.watch-price div');
    if (price) price.textContent = quoteNumber(quote.price);
    if (change) change.textContent = quote.price ? `${signed(quote.change)}%${quote.estimated ? ' · estimé' : ''}` : 'Cours indisponible';
  });
  pageContent.querySelectorAll('.orderbook').forEach(book => {
    const panel = book.closest('.panel');
    const symbol = panel?.querySelector('.panel-subtitle')?.textContent.split(' · ')[0];
    const quote = asset(symbol);
    const priceHeading = book.querySelector('.orderbook-header span');
    const spreadLabel = book.querySelector('.book-spread');
    if (priceHeading) priceHeading.textContent = 'PRIX (EUR)';
    if (spreadLabel && quote?.price) spreadLabel.textContent = `Spread synthétique · ${number(quote.price * 0.0004)} EUR`;
    const subtitle = panel?.querySelector('.panel-subtitle');
    if (subtitle) subtitle.textContent = 'Profondeur simulée';
  });
  if (currentView === 'portfolio') {
    const headers = pageContent.querySelectorAll('.position-table th');
    if (headers[2]) headers[2].textContent = 'PRIX MOYEN (EUR)';
    if (headers[3]) headers[3].textContent = 'COURS (EUR)';
    if (headers[4]) headers[4].textContent = 'VALEUR (EUR)';
    if (headers[5]) headers[5].textContent = 'P&L LATENT (EUR)';
  }
  if (currentView === 'orders') {
    const triggerHeader = [...pageContent.querySelectorAll('.data-table th')].find(header => header.textContent.includes('DÉCLENCHEUR'));
    if (triggerHeader) triggerHeader.textContent = 'PRIX DÉCLENCHEUR (EUR)';
  }
  if (currentView === 'trades') {
    const labels = ['DATE', 'ACTIF', 'SENS', 'QUANTITÉ', 'PRIX (EUR)', 'FRAIS (EUR)', 'VALEUR BRUTE (EUR)', 'P&L RÉALISÉ (EUR)'];
    pageContent.querySelectorAll('.data-table th').forEach((header, index) => { if (labels[index]) header.textContent = labels[index]; });
  }
  if (currentView === 'alerts') {
    pageContent.querySelectorAll('.watch-row').forEach((row, index) => {
      const alert = state.alerts[index];
      const label = row.querySelector('.asset-id small');
      if (alert && label) label.textContent = `${alert.kind === 'ABOVE' ? 'Au-dessus de' : 'En dessous de'} ${number(alert.threshold)} EUR`;
    });
  }
  document.getElementById('openOrderCount').textContent = openOrders().length;
  if (document.getElementById('priceChart')) drawChart();
  cleanTradingTree(pageContent);
}
function drawChart() {
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  const values = chartSeries.slice(-48);
  const min = Math.min(...values) - 90;
  const max = Math.max(...values) + 90;
  const y = value => height - 13 - ((value - min) / (max - min || 1)) * (height - 26);
  const x = index => 3 + index * (width - 6) / Math.max(values.length - 1, 1);
  context.strokeStyle = '#29342e';
  context.lineWidth = 1;
  for (let index = 0; index < 4; index++) {
    const row = 12 + index * (height - 24) / 3;
    context.beginPath(); context.moveTo(0, row); context.lineTo(width, row); context.stroke();
  }
  const rising = values[values.length - 1] >= values[0];
  const color = rising ? '#a5e887' : '#f18479';
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, rising ? 'rgba(165,232,135,.17)' : 'rgba(241,132,121,.15)');
  gradient.addColorStop(1, 'rgba(165,232,135,0)');
  context.beginPath();
  values.forEach((value, index) => index ? context.lineTo(x(index), y(value)) : context.moveTo(x(index), y(value)));
  context.lineTo(x(values.length - 1), height);
  context.lineTo(x(0), height);
  context.closePath(); context.fillStyle = gradient; context.fill();
  context.beginPath();
  values.forEach((value, index) => index ? context.lineTo(x(index), y(value)) : context.moveTo(x(index), y(value)));
  context.strokeStyle = color; context.lineWidth = 1.8; context.stroke();
  context.setLineDash([4, 5]); context.beginPath(); context.moveTo(0, y(values[values.length - 1])); context.lineTo(width, y(values[values.length - 1])); context.strokeStyle = `${color}55`; context.lineWidth = 1; context.stroke(); context.setLineDash([]);
  context.beginPath(); context.arc(x(values.length - 1), y(values[values.length - 1]), 3, 0, Math.PI * 2); context.fillStyle = color; context.fill();
}
function openTrade(symbol = 'AAPL', side = 'BUY') {
  tradeDraft = { symbol, side, confirm: false };
  renderTradeModal();
  document.getElementById('modalBackdrop').classList.remove('hidden');
  document.querySelector('#tradeModal input[name="quantity"]')?.focus();
}
function renderTradeModalMarkup() {
  const item = asset(tradeDraft.symbol);
  const currentPosition = position(item.symbol);
  const side = tradeDraft.side;
  const isSell = side === 'SELL';
  const currentType = document.querySelector('#tradeModal select[name="type"]')?.value || 'MARKET';
  const quantity = Number(document.querySelector('#tradeModal input[name="quantity"]')?.value || 1);
  const limitValue = Number(document.querySelector('#tradeModal input[name="trigger"]')?.value || item.price);
  const selectedType = ['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT'].includes(currentType) ? currentType : 'MARKET';
  const estimatedPrice = selectedType === 'MARKET' ? item.price * (isSell ? .9996 : 1.0004) : limitValue;
  const gross = Math.max(0, quantity * estimatedPrice);
  const fee = feeFor(gross);
  const types = isSell ? [['MARKET', 'Au marché'], ['LIMIT', 'Ordre limite'], ['STOP_LOSS', 'Stop-loss'], ['TAKE_PROFIT', 'Take-profit']] : [['MARKET', 'Au marché'], ['LIMIT', 'Ordre limite']];
  const needsTrigger = selectedType !== 'MARKET';
  const triggerLabel = selectedType === 'STOP_LOSS' ? 'Seuil stop-loss' : selectedType === 'TAKE_PROFIT' ? 'Seuil take-profit' : 'Prix limite';
  const confirmation = tradeDraft.confirm;
  document.getElementById('tradeModal').innerHTML = `<div class="modal-head"><div><p class="eyebrow">Ordre de simulation · ${item.symbol}</p><h2 id="modalTitle">${confirmation ? 'Confirmer votre ordre' : `Passer un ordre ${isSell ? 'de vente' : 'd’achat'}`}</h2><p class="subheading">${item.name} · cours ${number(item.price)} EUR</p></div><button class="modal-close" data-close-modal aria-label="Fermer">×</button></div><div class="modal-body">${confirmation ? `<div class="notice" style="margin-bottom:15px">${isSell ? 'VENTE' : 'ACHAT'} · ${number(quantity)} ${item.symbol}<br>Type : ${types.find(option => option[0] === selectedType)?.[1]}${needsTrigger ? ` à ${number(limitValue)} EUR` : ` · prix estimé ${number(estimatedPrice)} EUR`}<br>Valeur brute estimée : ${number(gross)} EUR · frais : ${number(fee)} EUR</div><div class="modal-warning">Prix estimé. Le prix d’exécution simulé peut varier. Aucun ordre réel ne sera transmis.</div>` : `<div class="modal-tabs"><button class="${!isSell ? 'active buy' : ''}" data-side-switch="BUY">ACHETER</button><button class="${isSell ? 'active sell' : ''}" data-side-switch="SELL">VENDRE</button></div><div class="field-group"><label class="field-label" for="orderAsset">Actif fictif</label><select class="field-select" name="symbol" id="orderAsset">${state.assets.map(assetItem => `<option value="${assetItem.symbol}" ${assetItem.symbol === item.symbol ? 'selected' : ''}>${assetItem.symbol} · ${assetItem.name}</option>`).join('')}</select></div><div class="form-grid"><div class="field-group"><label class="field-label" for="orderQuantity">Quantité</label><input class="field-input" id="orderQuantity" name="quantity" type="number" min="0.01" step="0.01" value="${quantity}" required></div><div class="field-group"><label class="field-label" for="orderType">Type d’ordre</label><select class="field-select" name="type" id="orderType">${types.map(([value, label]) => `<option value="${value}" ${selectedType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div>${needsTrigger ? `<div class="field-group"><label class="field-label" for="orderTrigger">${triggerLabel} (EUR)</label><input class="field-input" id="orderTrigger" name="trigger" type="number" min="0.01" step="0.01" value="${limitValue}" required><p class="field-hint">${selectedType === 'LIMIT' ? isSell ? 'Exécution simulée lorsque le cours atteint ou dépasse ce prix.' : 'Exécution simulée lorsque le cours atteint ou passe sous ce prix.' : selectedType === 'STOP_LOSS' ? 'Vente simulée lorsque le cours passe sous ce seuil.' : 'Vente simulée lorsque le cours atteint ce seuil.'}</p></div>` : ''}<div class="estimate-box"><div class="estimate-line"><span>Prix ${selectedType === 'MARKET' ? 'estimé' : 'déclencheur'}</span><b>${number(estimatedPrice)} EUR</b></div><div class="estimate-line"><span>Valeur estimée</span><b>${number(gross)} EUR</b></div><div class="estimate-line"><span>Frais simulés</span><b>${number(fee)} EUR</b></div><div class="estimate-line total"><span>${isSell ? 'Produit net estimé' : 'Total estimé'}</span><b>${number(isSell ? gross - fee : gross + fee)}</b></div></div>${isSell ? `<p class="field-hint">Position disponible : ${number(Math.max(0, (currentPosition?.quantity || 0) - reservedQuantity(item.symbol)))} ${item.symbol}</p>` : `<p class="field-hint">Solde disponible : ${number(cashAvailable())} EUR · commission 0,10 %, minimum 1 EUR.</p>`}<div class="modal-warning">Prix estimé — le prix d’exécution simulé peut varier. Crédits virtuels uniquement.</div>`}</div><div class="modal-actions"><button class="button ghost" data-close-modal>${confirmation ? 'Modifier' : 'Annuler'}</button><button class="button ${isSell ? 'danger' : 'primary'}" id="submitTrade">${confirmation ? 'Confirmer l’ordre EUR' : 'Continuer'}</button></div>`;
}
function renderTradeModal() {
  renderTradeModalMarkup();
  const item = asset(tradeDraft.symbol);
  const modal = document.getElementById('tradeModal');
  const currency = item.currency || 'EUR';
  const type = tradeDraft.confirm ? tradeDraft.type : modal.querySelector('[name="type"]')?.value || 'MARKET';
  const quantity = tradeDraft.confirm ? tradeDraft.quantity : Number(modal.querySelector('[name="quantity"]')?.value || 1);
  const trigger = tradeDraft.confirm ? tradeDraft.trigger : Number(modal.querySelector('[name="trigger"]')?.value || item.price);
  const price = type === 'MARKET' ? item.price * (tradeDraft.side === 'BUY' ? 1.0004 : .9996) : trigger;
  const gross = price * quantity;
  const fee = feeFor(gross);
  const rows = modal.querySelectorAll('.estimate-line b');
  const triggerLabel = modal.querySelector('label[for="orderTrigger"]');
  const submitButton = modal.querySelector('#submitTrade');
  const balanceHint = [...modal.querySelectorAll('.field-hint')].find(hint => hint.textContent.includes('Solde disponible'));
  modal.querySelector('.modal-head .subheading').textContent = `${item.name} · dernier cours ${quoteNumber(item.price)} ${currency}`;
  const assetLabel = modal.querySelector('label[for="orderAsset"]');
  if (assetLabel) assetLabel.textContent = 'Instrument';
  if (balanceHint) balanceHint.textContent = `Solde disponible : ${number(cashAvailable())} EUR · frais 0,10 % du montant, minimum 1,00 EUR.`;
  if (triggerLabel) triggerLabel.textContent = `${type === 'STOP_LOSS' ? 'Seuil stop-loss' : type === 'TAKE_PROFIT' ? 'Seuil take-profit' : 'Prix limite'} (${currency})`;
  if (rows.length) {
    rows[0].textContent = `${number(price)} ${currency}`;
    rows[1].textContent = `${number(gross)} ${currency}`;
    rows[2].textContent = `${number(fee)} EUR`;
    rows[3].textContent = `${number(tradeDraft.side === 'SELL' ? gross - fee : gross + fee)} EUR`;
  }
  const confirmation = modal.querySelector('.notice');
  if (confirmation) confirmation.innerHTML = `${tradeDraft.side === 'SELL' ? 'VENTE' : 'ACHAT'} · ${number(quantity)} ${item.symbol}<br>Prix estimé : ${number(price)} ${currency}<br>Valeur brute : ${number(gross)} ${currency} · frais : ${number(fee)} EUR<br>Total virtuel : ${number(tradeDraft.side === 'SELL' ? gross - fee : gross + fee)} EUR`;
  if (submitButton && !item.quoteFresh) submitButton.disabled = true;
  cleanTradingTree(modal);
}
function updateTradeEstimate() {
  const modal = document.getElementById('tradeModal');
  if (tradeDraft.confirm) return;
  const item = asset(modal.querySelector('[name="symbol"]')?.value || tradeDraft.symbol);
  if (!item) return;
  const side = modal.querySelector('[data-side-switch].active')?.dataset.sideSwitch || tradeDraft.side;
  const type = modal.querySelector('[name="type"]')?.value || 'MARKET';
  const quantity = Number(modal.querySelector('[name="quantity"]')?.value || 0);
  const trigger = type === 'MARKET' ? item.price : Number(modal.querySelector('[name="trigger"]')?.value || item.price);
  const price = type === 'MARKET' ? item.price * (side === 'BUY' ? 1.0004 : .9996) : trigger;
  const gross = quantity * price;
  const fee = feeFor(gross);
  const rows = modal.querySelectorAll('.estimate-line b');
  if (rows.length) {
    rows[0].textContent = `${number(price)} ${item.currency || 'EUR'}`;
    rows[1].textContent = `${number(gross)} ${item.currency || 'EUR'}`;
    rows[2].textContent = `${number(fee)} EUR`;
    rows[3].textContent = `${number(side === 'SELL' ? gross - fee : gross + fee)} EUR`;
  }
}
function reservedQuantity(symbol) {
  return openOrders().filter(order => order.symbol === symbol && order.side === 'SELL').reduce((sum, order) => sum + order.quantity, 0);
}
function closeModal() {
  document.getElementById('modalBackdrop').classList.add('hidden');
  document.getElementById('tradeModal').classList.remove('asset-details-modal', 'help-modal');
}
function validateOrder() {
  const item = asset(tradeDraft.symbol);
  if (!item?.quoteFresh) return 'Cours indisponible ou périmé : aucun ordre ne peut être simulé.';
  const side = tradeDraft.side;
  const type = document.querySelector('#tradeModal select[name="type"]')?.value || 'MARKET';
  const quantity = Number(document.querySelector('#tradeModal input[name="quantity"]')?.value);
  const trigger = type === 'MARKET' ? null : Number(document.querySelector('#tradeModal input[name="trigger"]')?.value);
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Saisissez une quantité supérieure à zéro.';
  if (type !== 'MARKET' && (!Number.isFinite(trigger) || trigger <= 0)) return 'Saisissez un prix de déclenchement valide.';
  if (side === 'SELL' && quantity > Math.max(0, (position(item.symbol)?.quantity || 0) - reservedQuantity(item.symbol))) return 'Position insuffisante pour cette vente.';
  if (side === 'BUY' && type === 'MARKET' && quantity * item.price * 1.0004 + feeFor(quantity * item.price) > cashAvailable()) return 'Solde virtuel insuffisant pour cet achat.';
  if (side === 'BUY' && type === 'LIMIT' && quantity * trigger + feeFor(quantity * trigger) > cashAvailable()) return 'Solde virtuel insuffisant pour réserver cet ordre limite.';
  return '';
}
async function submitTrade() {
  if (!tradeDraft.confirm) {
    tradeDraft.symbol = document.querySelector('#tradeModal select[name="symbol"]').value;
    const problem = validateOrder();
    if (problem) { toast(problem, true); return; }
    tradeDraft.type = document.querySelector('#tradeModal select[name="type"]').value;
    tradeDraft.quantity = Number(document.querySelector('#tradeModal input[name="quantity"]').value);
    tradeDraft.trigger = tradeDraft.type === 'MARKET' ? null : Number(document.querySelector('#tradeModal input[name="trigger"]').value);
    tradeDraft.confirm = true;
    renderTradeModal();
    return;
  }
  const item = asset(tradeDraft.symbol);
  if (!item?.quoteFresh) { toast('Le cours n’est plus à jour. Réessaie après actualisation.', true); closeModal(); return; }
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: item.symbol, side: tradeDraft.side, type: tradeDraft.type, quantity: tradeDraft.quantity, trigger: tradeDraft.trigger })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Ordre refusé.');
    applyPortfolio(result.portfolio);
    closeModal(); save(); render();
    toast(result.order.status === 'FILLED' ? `Ordre ${item.symbol} exécuté.` : `Ordre ${item.symbol} placé en attente.`);
  } catch (error) {
    toast(error.message || 'Service d’ordres indisponible.', true);
  }
}
async function cancelOrder(id) {
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', credentials: 'same-origin' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Annulation impossible.');
    applyPortfolio(result.portfolio);
    render(); toast('Ordre annulé. Le montant réservé est libéré.');
  } catch (error) {
    toast(error.message || 'Service d’ordres indisponible.', true);
  }
}
async function updateMarket() {
  if (quoteRequestPending || !currentUser) return;
  quoteRequestPending = true;
  let changed = false;
  try {
    const response = await fetch('/api/quotes', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Le service de cotation ne répond pas.');
    const payload = await response.json();
    let freshCount = 0;
    for (const quote of payload.items) {
      const item = asset(quote.symbol);
      if (!item) continue;
      if (!quote.available) {
        item.quoteFresh = false;
        item.estimated = Number.isFinite(item.price) && item.price > 0;
        continue;
      }
      item.price = quote.price;
      item.close = quote.previousClose;
      item.change = quote.changePercent;
      item.high = quote.high;
      item.low = quote.low;
      item.volume = quote.volume;
      item.currency = quote.currency;
      item.marketTime = quote.marketTime;
      item.quoteFresh = !quote.stale;
      item.estimated = Boolean(quote.stale);
      if (quote.history?.length) item.history = quote.history.map(point => point.price);
      if (item.quoteFresh) freshCount += 1;
    }
    const hasUnavailable = payload.items.some(item => !item.available || item.stale);
    const hasEstimate = state.assets.some(item => item.estimated && Number.isFinite(item.price) && item.price > 0);
    const status = freshCount === 0 ? hasEstimate ? 'estimated' : 'failed' : hasUnavailable ? 'stale' : 'live';
    setQuoteBadge(status, payload.fetchedAt);
    const equity = totalEquity();
    state.equityHistory.push(equity);
    if (state.equityHistory.length > 60) state.equityHistory.shift();
    chartSeries = state.equityHistory;
    for (const alert of state.alerts.filter(item => item.active)) {
      const quote = asset(alert.symbol);
      if (!quote?.quoteFresh || quote.estimated) continue;
      if (alert.kind === 'ABOVE' ? quote.price >= alert.threshold : quote.price <= alert.threshold) {
        alert.active = false;
        addNotification(`Alerte ${alert.symbol} déclenchée`, `Le cours de marché a atteint ${number(quote.price)} ${quote.currency}.`);
        changed = true;
      }
    }
    await refreshPortfolio();
    if (changed || freshCount) save();
  } catch (_) {
    for (const item of state.assets) {
      item.quoteFresh = false;
      item.estimated = Number.isFinite(item.price) && item.price > 0;
    }
    const hasCache = state.assets.some(item => Number.isFinite(item.price) && item.price > 0);
    setQuoteBadge(hasCache ? 'estimated' : 'failed');
  } finally {
    quoteRequestPending = false;
    if (changed || ['dashboard', 'portfolio', 'markets', 'watchlist'].includes(currentView)) render();
  }
}
function exportCsv() {
  const rows = [['Simulation · EUR'], ['Date', 'Symbol', 'Side', 'Quantity', 'Price EUR', 'Fees EUR', 'Gross EUR', 'PnL EUR'], ...state.trades.map(trade => [trade.date, trade.symbol, trade.side, trade.quantity, trade.price, trade.fee, trade.gross, trade.pnl])];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = 'simtrade-transactions.csv'; link.click(); URL.revokeObjectURL(link.href);
}
async function resetDemoAccount() {
  try {
    const response = await fetch('/api/demo/reset', { method: 'POST', credentials: 'same-origin' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Réinitialisation impossible.');
    applyPortfolio(result.portfolio);
    state.alerts = [];
    state.notifications = [];
    state.equityHistory = Array(48).fill(INITIAL_CASH);
    chartSeries = state.equityHistory;
    save(); render(); toast('Compte réinitialisé à 1 000 EUR virtuels.');
  } catch (error) {
    toast(error.message || 'Service de compte indisponible.', true);
  }
}
function createAlert() {
  const symbol = window.prompt('Symbole de marché (ex. AAPL, NVDA, BTC-USD) :', 'AAPL')?.trim().toUpperCase();
  if (!symbol) return;
  if (!asset(symbol)) { toast('Symbole de marché non pris en charge.', true); return; }
  const kind = window.confirm('OK : alerter au-dessus du seuil. Annuler : alerter en dessous.') ? 'ABOVE' : 'BELOW';
  const threshold = Number(window.prompt(`Seuil de prix EUR pour ${symbol} :`, number(asset(symbol).price)));
  if (!Number.isFinite(threshold) || threshold <= 0) { toast('Seuil invalide.', true); return; }
  state.alerts.unshift({ id: `ALT-${Date.now()}`, symbol, kind, threshold, active: true });
  save(); render(); toast(`Alerte ${symbol} créée.`);
}
pageContent.addEventListener('click', event => {
  if (event.target.closest('[data-open-help]')) { openHelp(); return; }
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { setView(viewButton.dataset.view); return; }
  const communityTabButton = event.target.closest('[data-community-tab]');
  if (communityTabButton) { communityTab = communityTabButton.dataset.communityTab; loadCommunity(); return; }
  const followButton = event.target.closest('[data-follow-person]');
  if (followButton) { setPersonFollow(Number(followButton.dataset.followPerson), followButton.dataset.isFollowing !== 'true'); return; }
  if (event.target.closest('[data-community-retry]')) { loadCommunity(); return; }
  if (event.target.closest('[data-admin-retry]')) { loadAdminOverview(); return; }
  const marketKindButton = event.target.closest('[data-market-type]');
  if (marketKindButton) { marketTypeFilter = marketKindButton.dataset.marketType; render(); return; }
  if (event.target.closest('[data-market-favorites]')) { marketFavoritesOnly = !marketFavoritesOnly; render(); return; }
  const detailsButton = event.target.closest('[data-details]');
  if (detailsButton) { openAssetDetails(detailsButton.dataset.details); return; }
  const tradeButton = event.target.closest('[data-trade]');
  if (tradeButton) { openTrade(tradeButton.dataset.trade, tradeButton.dataset.side); return; }
  const cancelButton = event.target.closest('[data-cancel]');
  if (cancelButton) { cancelOrder(cancelButton.dataset.cancel); return; }
  const favoriteButton = event.target.closest('[data-favorite]');
  if (favoriteButton) {
    const symbol = favoriteButton.dataset.favorite;
    state.favorites = state.favorites.includes(symbol) ? state.favorites.filter(item => item !== symbol) : [...state.favorites, symbol];
    save(); render(); return;
  }
  const rangeButton = event.target.closest('[data-range]');
  if (rangeButton) { selectedRange = rangeButton.dataset.range; render(); return; }
  const sideButton = event.target.closest('[data-side-switch]');
  if (sideButton) { tradeDraft.side = sideButton.dataset.sideSwitch; renderTradeModal(); return; }
  if (event.target.closest('[data-close-modal]')) { closeModal(); return; }
  if (event.target.closest('#submitTrade')) { submitTrade(); return; }
  if (event.target.closest('#marketSearchFocus')) { document.getElementById('globalSearch').focus(); return; }
  if (event.target.closest('#newAlert')) { createAlert(); return; }
  if (event.target.closest('#exportCsv')) { exportCsv(); return; }
  const removeAlert = event.target.closest('[data-remove-alert]');
  if (removeAlert) { state.alerts = state.alerts.filter(item => item.id !== removeAlert.dataset.removeAlert); save(); render(); return; }
  if (event.target.closest('#resetAccount')) {
    if (window.confirm('Réinitialiser le compte ? Les ordres, positions et transactions seront supprimés.')) {
      resetDemoAccount();
    }
  }
});
document.getElementById('tradeModal').addEventListener('click', event => {
  const detailTrade = event.target.closest('[data-detail-trade]');
  if (detailTrade) { const symbol = detailTrade.dataset.detailTrade; const side = detailTrade.dataset.side; closeModal(); openTrade(symbol, side); return; }
  const sideButton = event.target.closest('[data-side-switch]');
  if (sideButton) { tradeDraft.side = sideButton.dataset.sideSwitch; renderTradeModal(); return; }
  if (event.target.closest('[data-close-modal]')) { closeModal(); return; }
  if (event.target.closest('#submitTrade')) submitTrade();
});
document.getElementById('tradeModal').addEventListener('change', event => {
  if (event.target.name === 'symbol') {
    tradeDraft.symbol = event.target.value;
    const trigger = document.querySelector('#tradeModal [name="trigger"]');
    if (trigger) trigger.value = asset(tradeDraft.symbol)?.price || '';
  }
  if (event.target.name === 'symbol' || event.target.name === 'type') renderTradeModal();
});
document.getElementById('tradeModal').addEventListener('input', event => {
  if (event.target.name === 'quantity' || event.target.name === 'trigger') updateTradeEstimate();
});
pageContent.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id === 'adminUnlockForm') {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const message = form.querySelector('#adminAccessMessage');
    button.disabled = true;
    message.textContent = 'Vérification du code…';
    try {
      const response = await fetch('/api/admin/unlock', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: new FormData(form).get('code') })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Déverrouillage impossible.');
      currentUser = result.user;
      adminOverview = null;
      toast('Mode administrateur activé.');
      setView('admin');
    } catch (error) {
      message.textContent = error.message || 'Déverrouillage impossible.';
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (!form.matches('[data-admin-cash-form]')) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch(`/api/admin/users/${form.dataset.userId}/cash`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(new FormData(form).get('amount')) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Crédit impossible.');
    form.reset();
    toast(`${number(result.amount)} EUR ajoutés au compte ${result.user.displayName}.`);
    await loadAdminOverview();
  } catch (error) {
    toast(error.message || 'Crédit impossible.', true);
  } finally {
    button.disabled = false;
  }
});
document.querySelectorAll('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('.mobile-nav-item[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
pageContent.addEventListener('change', event => {
  if (event.target.id === 'marketSort') { marketSort = event.target.value; render(); }
  if (event.target.id === 'publicProfileToggle') {
    const toggle = event.target;
    const previous = Boolean(currentUser?.isPublic);
    toggle.disabled = true;
    fetch('/api/users/me', {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublic: toggle.checked })
    }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible d’enregistrer ce réglage.');
      currentUser = result.user;
      toast(currentUser.isPublic ? 'Votre profil est maintenant visible aux membres.' : 'Votre profil est de nouveau privé.');
      if (currentView === 'community') loadCommunity();
    }).catch(error => {
      toggle.checked = previous;
      toast(error.message || 'Service de compte indisponible.', true);
    }).finally(() => { toggle.disabled = false; });
  }
});
document.getElementById('globalSearch').addEventListener('input', event => {
  marketFilter = event.target.value;
  if (marketFilter && currentView !== 'markets') setView('markets');
  else if (currentView === 'markets') render();
});
document.getElementById('globalSearch').addEventListener('keydown', event => { if (event.key === 'Escape') { event.target.value = ''; marketFilter = ''; render(); event.target.blur(); } });
document.getElementById('menuButton').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('notificationButton').addEventListener('click', () => {
  const latest = state.notifications[0];
  toast(latest ? `${latest.title} · ${latest.message}` : 'Aucune notification.');
});
document.getElementById('modalBackdrop').addEventListener('click', event => { if (event.target.id === 'modalBackdrop') closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.getElementById('globalSearch').focus(); } });
window.addEventListener('resize', () => { if (document.getElementById('priceChart')) drawChart(); });
document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
document.getElementById('authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = document.getElementById('authSubmit');
  const message = document.getElementById('authMessage');
  button.disabled = true;
  message.textContent = '';
  try {
    const response = await fetch(`/api/auth/${authMode}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: form.get('displayName'),
        email: form.get('email'),
        password: form.get('password')
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Connexion impossible.');
    await showWorkspace(result.user);
    setQuoteBadge('loading');
    await updateMarket();
  } catch (error) {
    showAuthMessage(error.message || 'Service local indisponible.');
  } finally {
    button.disabled = false;
  }
});
document.getElementById('logoutButton').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  currentUser = null;
  state = defaultState();
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('authGate').classList.remove('hidden');
  document.getElementById('authForm').reset();
  setAuthMode('login');
  showAuthMessage('Session terminée.', true);
});
setAuthMode('register');
window.setInterval(() => { if (currentUser) estimateMarketPrices(); }, 1_000);
window.setInterval(() => { if (currentUser) updateMarket(); }, 30_000);
initializeSession();
