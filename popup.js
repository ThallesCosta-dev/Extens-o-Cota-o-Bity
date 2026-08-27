const PERIODS = {
  '1h':  { interval: '1m',  limit: 60, timeOnly: true },
  '24h': { interval: '15m', limit: 96, timeOnly: true },
  '7d':  { interval: '2h',  limit: 84, timeOnly: false }
};

const STORE_KEYS = [
  'price', 'change', 'ticker', 'priceCurrency', 'usdtRate', 'timestamp',
  'error', 'wallet', 'hideWallet', 'alerts', 'badgeMode', 'currency'
];

let priceChart = null;
let currentPeriod = '1h';
let lastChartKey = null;
let store = {};

// ---------- Helpers ----------

function getCurrency() {
  return document.querySelector('.currency-btn.active').dataset.currency;
}

function symbolFor(currency) {
  return currency === 'BRL' ? 'R$' : '$';
}

function formatMoney(value, currency, decimals = 2) {
  const locale = currency === 'BRL' ? 'pt-BR' : 'en-US';
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function money(value, currency, decimals = 2) {
  return `${symbolFor(currency)}${formatMoney(value, currency, decimals)}`;
}

function signedMoney(value, currency) {
  return `${value >= 0 ? '+' : '-'}${money(Math.abs(value), currency)}`;
}

function setStatus(message) {
  const el = document.getElementById('status');
  if (message) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function setActivePill(groupSelector, matchFn) {
  document.querySelectorAll(groupSelector).forEach((btn) => {
    btn.classList.toggle('active', matchFn(btn));
  });
}

// ---------- Preço e estatísticas 24h ----------

function renderPriceInfo() {
  const currency = store.priceCurrency || getCurrency();
  document.querySelector('.currency-type').textContent = currency;

  const priceEl = document.getElementById('price');
  const changeEl = document.getElementById('price-change');

  if (!isFinite(store.price)) {
    priceEl.textContent = 'carregando…';
    changeEl.textContent = '';
    renderStats(null, currency);
  } else {
    priceEl.textContent = money(store.price, currency);
    const change = store.change || 0;
    changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
    changeEl.className = change < 0 ? 'negative' : 'positive';
    renderStats(store.ticker, currency);
  }

  if (store.error) {
    setStatus('Erro ao buscar o preço no BitPreço. Tentando novamente…');
  } else {
    setStatus(null);
  }

  renderWallet();
}

function renderStats(ticker, currency) {
  const cells = {
    'stat-high': ticker && ticker.high,
    'stat-low': ticker && ticker.low,
    'stat-buy': ticker && ticker.buy,
    'stat-sell': ticker && ticker.sell
  };
  for (const [id, value] of Object.entries(cells)) {
    document.getElementById(id).textContent =
      isFinite(value) ? money(value, currency, 0) : '—';
  }
}

// ---------- Carteira ----------

function maskable(text) {
  return store.hideWallet ? '••••' : text;
}

function renderWallet() {
  const currency = store.priceCurrency || getCurrency();
  const wallet = store.wallet || { amount: 0, paid: 0 };

  document.getElementById('eye-btn').textContent = store.hideWallet ? '🙈' : '👁';

  const valueEl = document.getElementById('wallet-value');
  const plEl = document.getElementById('wallet-pl');
  const dayEl = document.getElementById('wallet-day');

  if (!(wallet.amount > 0) || !isFinite(store.price)) {
    valueEl.textContent = '—';
    plEl.textContent = '—';
    plEl.className = 'wallet-stat-value';
    dayEl.textContent = '—';
    dayEl.className = 'wallet-stat-value';
    return;
  }

  const value = wallet.amount * store.price;
  valueEl.textContent = maskable(money(value, currency));

  // "Total pago" é sempre informado em R$; converte na exibição em USD
  const paidDisp = currency === 'BRL'
    ? wallet.paid
    : (store.usdtRate > 0 ? wallet.paid / store.usdtRate : 0);
  if (wallet.paid > 0 && paidDisp > 0) {
    const pl = value - paidDisp;
    const plPct = (pl / paidDisp) * 100;
    plEl.textContent = maskable(
      `${signedMoney(pl, currency)} (${pl >= 0 ? '+' : ''}${plPct.toFixed(1)}%)`
    );
    plEl.className = `wallet-stat-value ${pl < 0 ? 'negative' : 'positive'}`;
  } else {
    plEl.textContent = maskable('informe o total pago');
    plEl.className = 'wallet-stat-value muted';
  }

  const change = store.change || 0;
  const dayDelta = value - value / (1 + change / 100);
  dayEl.textContent = maskable(signedMoney(dayDelta, currency));
  dayEl.className = `wallet-stat-value ${dayDelta < 0 ? 'negative' : 'positive'}`;
}

function loadWalletInputs() {
  const wallet = store.wallet || { amount: '', paid: '' };
  document.getElementById('wallet-amount').value = wallet.amount > 0 ? wallet.amount : '';
  document.getElementById('wallet-paid').value = wallet.paid > 0 ? wallet.paid : '';
}

function saveWalletInputs() {
  const amount = parseFloat(document.getElementById('wallet-amount').value);
  const paid = parseFloat(document.getElementById('wallet-paid').value);
  store.wallet = {
    amount: isFinite(amount) && amount > 0 ? amount : 0,
    paid: isFinite(paid) && paid > 0 ? paid : 0
  };
  chrome.storage.local.set({ wallet: store.wallet });
  renderWallet();
}

// ---------- Alertas ----------

function renderAlerts() {
  const listEl = document.getElementById('alerts-list');
  const alerts = store.alerts || [];
  listEl.innerHTML = '';
  for (const a of alerts) {
    const item = document.createElement('div');
    item.className = 'alert-item';
    const dir = a.direction === 'above' ? 'acima de' : 'abaixo de';
    const label = document.createElement('span');
    label.textContent = `🔔 BTC ${dir} ${money(a.value, a.currency)}`;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'alert-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remover alerta';
    removeBtn.addEventListener('click', () => {
      store.alerts = (store.alerts || []).filter((x) => x.id !== a.id);
      chrome.storage.local.set({ alerts: store.alerts });
      renderAlerts();
    });
    item.appendChild(label);
    item.appendChild(removeBtn);
    listEl.appendChild(item);
  }
}

// ---------- Gráfico ----------

function chartCacheKey() {
  return `chart:${getCurrency()}:${currentPeriod}`;
}

async function fetchBinanceHistory() {
  const currency = getCurrency();
  const { interval, limit, timeOnly } = PERIODS[currentPeriod];
  const symbol = currency === 'BRL' ? 'BTCBRL' : 'BTCUSDT';
  const key = chartCacheKey();

  // Renderiza o cache na hora para o gráfico não abrir vazio
  if (key !== lastChartKey) {
    const cached = (await chrome.storage.local.get(key))[key];
    if (cached && key === chartCacheKey()) {
      renderChart(cached.labels, cached.prices, currency);
      lastChartKey = key;
    }
  }

  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const labels = data.map((candle) => {
      const date = new Date(candle[0]);
      const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (timeOnly) return time;
      return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
    });
    const prices = data.map((candle) => parseFloat(candle[4])); // preço de fechamento

    // O usuário pode ter trocado moeda/período enquanto a resposta chegava
    if (key !== chartCacheKey()) return;

    renderChart(labels, prices, currency);
    lastChartKey = key;
    chrome.storage.local.set({ [key]: { labels, prices } });
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    if (lastChartKey !== key) {
      setStatus('Não foi possível carregar o gráfico. Tentando novamente em instantes…');
    }
  }
}

function renderChart(labels, prices, currency) {
  const tooltipLabel = (context) => money(context.parsed.y, currency);
  const axisLabel = (value) => money(value, currency, 0);

  if (priceChart) {
    priceChart.data.labels = labels;
    priceChart.data.datasets[0].data = prices;
    priceChart.options.plugins.tooltip.callbacks.label = tooltipLabel;
    priceChart.options.scales.y.ticks.callback = axisLabel;
    priceChart.update();
    return;
  }

  const ctx = document.getElementById('priceChart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 170);
  gradient.addColorStop(0, 'rgba(247, 147, 26, 0.25)');
  gradient.addColorStop(1, 'rgba(247, 147, 26, 0)');
  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: prices,
        borderColor: '#F7931A',
        borderWidth: 2,
        fill: true,
        backgroundColor: gradient,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#F7931A',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { left: 0, right: 0, top: 10, bottom: 0 }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: '#0f1826',
          titleColor: '#8b9bb0',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (tooltipItems) => tooltipItems[0].label,
            label: tooltipLabel
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#8b9bb0',
            font: { size: 10 },
            maxRotation: 0,
            maxTicksLimit: 6
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.06)', drawBorder: false },
          ticks: {
            color: '#8b9bb0',
            font: { size: 10 },
            callback: axisLabel,
            maxTicksLimit: 5
          }
        }
      },
      animation: false,
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements && elements.length ? 'pointer' : 'default';
      }
    }
  });
}

// ---------- "Atualizado há X" ----------

function renderUpdatedAgo() {
  const el = document.getElementById('updated-ago');
  if (!store.timestamp) {
    el.textContent = '';
    return;
  }
  const secs = Math.max(0, Math.round((Date.now() - store.timestamp) / 1000));
  if (secs < 5) el.textContent = 'Atualizado agora';
  else if (secs < 60) el.textContent = `Atualizado há ${secs}s`;
  else el.textContent = `Atualizado há ${Math.floor(secs / 60)}min`;
}

// ---------- Eventos ----------

document.querySelectorAll('.currency-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    setActivePill('.currency-btn', (b) => b === btn);
    chrome.storage.local.set({ currency: btn.dataset.currency }); // o background refaz o fetch
    renderPriceInfo();
    fetchBinanceHistory();
  });
});

document.querySelectorAll('.period-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    setActivePill('.period-btn', (b) => b === btn);
    currentPeriod = btn.dataset.period;
    fetchBinanceHistory();
  });
});

document.querySelectorAll('.badge-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    setActivePill('.badge-btn', (b) => b === btn);
    store.badgeMode = btn.dataset.mode;
    chrome.storage.local.set({ badgeMode: store.badgeMode });
  });
});

document.getElementById('wallet-amount').addEventListener('input', saveWalletInputs);
document.getElementById('wallet-paid').addEventListener('input', saveWalletInputs);

document.getElementById('eye-btn').addEventListener('click', () => {
  store.hideWallet = !store.hideWallet;
  chrome.storage.local.set({ hideWallet: store.hideWallet });
  renderWallet();
});

document.getElementById('alert-btn').addEventListener('click', () => {
  const input = document.getElementById('alert-value');
  const value = parseFloat(input.value);
  if (!isFinite(value) || value <= 0) return;

  const direction = isFinite(store.price) && value <= store.price ? 'below' : 'above';
  const alerts = store.alerts || [];
  alerts.push({
    id: crypto.randomUUID(),
    value,
    direction,
    currency: getCurrency()
  });
  store.alerts = alerts;
  chrome.storage.local.set({ alerts });
  input.value = '';
  renderAlerts();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let touched = false;
  for (const key of ['price', 'change', 'ticker', 'priceCurrency', 'usdtRate', 'timestamp', 'error', 'wallet', 'alerts']) {
    if (changes[key]) {
      store[key] = changes[key].newValue;
      touched = true;
    }
  }
  if (!touched) return;
  renderPriceInfo();
  renderUpdatedAgo();
  if (changes.alerts) renderAlerts();
});

// Efeito de brilho que segue o cursor no gráfico
const chartContainer = document.querySelector('.chart-container');
chartContainer.addEventListener('mousemove', (e) => {
  const rect = chartContainer.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  chartContainer.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(247, 147, 26, 0.10), rgba(255, 255, 255, 0.04))`;
});
chartContainer.addEventListener('mouseleave', () => {
  chartContainer.style.background = '';
});

// ---------- Inicialização ----------

chrome.storage.local.get(STORE_KEYS, (data) => {
  store = data;

  setActivePill('.currency-btn', (b) => b.dataset.currency === (data.currency || 'BRL'));
  setActivePill('.badge-btn', (b) => b.dataset.mode === (data.badgeMode || 'price'));

  loadWalletInputs();
  renderPriceInfo();
  renderAlerts();
  renderUpdatedAgo();
  fetchBinanceHistory();
});

// Pede ao background um preço fresco ao abrir o popup
chrome.runtime.sendMessage({ type: 'refresh' }, () => chrome.runtime.lastError);

// O gráfico usa candles de ≥1 minuto, então 60s de intervalo bastam
setInterval(fetchBinanceHistory, 60000);
setInterval(renderUpdatedAgo, 1000);
