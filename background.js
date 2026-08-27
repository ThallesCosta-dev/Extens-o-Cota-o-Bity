const FETCH_ALARM = 'fetch-price';

let fetching = false;

function formatCompactNumber(number) {
    number = Math.round(number);
    if (number >= 1000) {
        if (number < 100000) {
            return (number / 1000).toFixed(1) + 'k';
        }
        return Math.floor(number / 1000) + 'k';
    }
    return number.toString();
}

function formatMoney(value, currency) {
    const locale = currency === 'BRL' ? 'pt-BR' : 'en-US';
    return value.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

async function fetchTicker(pair) {
    const response = await fetch(`https://api.bitpreco.com/${pair}/ticker`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao buscar ${pair}`);
    }
    return response.json();
}

async function updateBadge(data) {
    const stored = data || await chrome.storage.local.get(
        ['price', 'change', 'priceCurrency', 'badgeMode', 'hideWallet', 'wallet']
    );
    const {
        price, change = 0, priceCurrency = 'BRL',
        badgeMode = 'price', hideWallet = false, wallet = {}
    } = stored;

    if (!isFinite(price)) return;

    const symbol = priceCurrency === 'BRL' ? 'R$' : '$';
    let text = formatCompactNumber(price);

    if (badgeMode === 'change') {
        text = `${change >= 0 ? '+' : ''}${change.toFixed(1)}`;
    } else if (badgeMode === 'wallet' && !hideWallet && wallet.amount > 0) {
        text = formatCompactNumber(wallet.amount * price);
    }

    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: change >= 0 ? '#0a7d33' : '#b3261e' });
    chrome.action.setTitle({
        title: `BTC ${symbol}${formatMoney(price, priceCurrency)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}% em 24h)`
    });
}

async function checkAlerts(price, currency, alerts) {
    if (!alerts || !alerts.length) return;
    const remaining = [];
    for (const alert of alerts) {
        if (alert.currency !== currency) {
            remaining.push(alert);
            continue;
        }
        const hit = alert.direction === 'above' ? price >= alert.value : price <= alert.value;
        if (!hit) {
            remaining.push(alert);
            continue;
        }
        const symbol = currency === 'BRL' ? 'R$' : '$';
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon128.png',
            title: 'Alerta de preço — Bitcoin',
            message: `BTC atingiu ${symbol}${formatMoney(price, currency)} (alvo: ${symbol}${formatMoney(alert.value, currency)})`
        });
    }
    if (remaining.length !== alerts.length) {
        chrome.storage.local.set({ alerts: remaining });
    }
}

async function fetchPrice() {
    if (fetching) return;
    fetching = true;
    try {
        const {
            currency = 'BRL', wallet = {}, alerts = [],
            badgeMode = 'price', hideWallet = false
        } = await chrome.storage.local.get(
            ['currency', 'wallet', 'alerts', 'badgeMode', 'hideWallet']
        );

        const btcData = await fetchTicker('btc-brl');
        let price = Number(btcData.last);
        let change = Number(btcData.var); // variação 24h em %, direto da API
        let ticker = {
            high: Number(btcData.high),
            low: Number(btcData.low),
            buy: Number(btcData.buy),
            sell: Number(btcData.sell)
        };
        let usdtRate = null;

        // Se for USD, converte usando USDT-BRL (o "total pago" da carteira também usa essa taxa)
        if (currency === 'USD') {
            const usdtData = await fetchTicker('usdt-brl');
            usdtRate = Number(usdtData.last);
            const usdtVar = Number(usdtData.var);
            price = price / usdtRate;
            ticker = {
                high: ticker.high / usdtRate,
                low: ticker.low / usdtRate,
                buy: ticker.buy / usdtRate,
                sell: ticker.sell / usdtRate
            };
            if (isFinite(change) && isFinite(usdtVar)) {
                change = ((1 + change / 100) / (1 + usdtVar / 100) - 1) * 100;
            }
        }

        if (!isFinite(price)) throw new Error('Preço inválido recebido da API');
        if (!isFinite(change)) change = 0;

        await chrome.storage.local.set({
            price,
            change,
            ticker,
            priceCurrency: currency,
            usdtRate,
            error: false,
            timestamp: Date.now()
        });

        await updateBadge({ price, change, priceCurrency: currency, badgeMode, hideWallet, wallet });
        await checkAlerts(price, currency, alerts);
    } catch (error) {
        console.error('Erro ao buscar preço:', error);
        chrome.storage.local.set({ error: true });
    } finally {
        fetching = false;
    }
}

// Migra dados de formatos anteriores (carteira única, alerta único, multi-moeda)
async function migrate() {
    const old = await chrome.storage.local.get(['walletBtc', 'alert', 'holdings', 'wallet', 'alerts']);
    const updates = {};

    if (!old.wallet) {
        if (old.holdings && old.holdings.BTC && old.holdings.BTC.amount > 0) {
            updates.wallet = old.holdings.BTC;
        } else if (old.walletBtc > 0) {
            updates.wallet = { amount: old.walletBtc, paid: 0 };
        }
    }
    if (old.alert && old.alert.value) {
        const alerts = old.alerts || [];
        alerts.push({ id: String(Date.now()), ...old.alert });
        updates.alerts = alerts;
    }
    if (Object.keys(updates).length) {
        await chrome.storage.local.set(updates);
    }
    chrome.storage.local.remove(['walletBtc', 'alert', 'holdings', 'prices', 'coin', 'currentPrice', 'priceChange']);
}

function ensureAlarm() {
    chrome.alarms.get(FETCH_ALARM, (alarm) => {
        if (!alarm) {
            chrome.alarms.create(FETCH_ALARM, { periodInMinutes: 1 });
        }
    });
}

chrome.runtime.onInstalled.addListener(async () => {
    ensureAlarm();
    await migrate();
    fetchPrice();
});

chrome.runtime.onStartup.addListener(() => {
    ensureAlarm();
    fetchPrice();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FETCH_ALARM) fetchPrice();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.currency || changes.alerts) {
        fetchPrice();
        return;
    }
    if (changes.wallet || changes.badgeMode || changes.hideWallet) {
        updateBadge();
    }
});

// O popup pede uma atualização imediata ao abrir
chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'refresh') {
        ensureAlarm();
        fetchPrice();
    }
});
