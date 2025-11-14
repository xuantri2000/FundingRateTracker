import TelegramBot from 'node-telegram-bot-api';
import { Agent } from 'undici';
import dotenv from 'dotenv';
dotenv.config();

// Agent để bỏ qua SSL verification cho các API có vấn đề certificate
const agent = new Agent({
  connect: { rejectUnauthorized: false }
});


// ==================== CẤU HÌNH ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const COIN_UPDATE_MINUTE = 19;
const FUNDING_UPDATE_START = 20;
const FUNDING_UPDATE_END = 59;

// ==================== EXCHANGE SERVICE ====================

const EXCHANGE_HANDLERS = {
  binance: {
    symbolSuffix: 'USDT',
    allTickers: {
      url: 'https://fapi.binance.com/fapi/v1/premiumIndex',
      extract: (data) => data.map(item => ({
        symbol: item.symbol.replace('USDT', ''),
        rate: parseFloat(item.lastFundingRate)
      })).filter(item => item.symbol && !isNaN(item.rate))
    },
    buildUrl: (symbol) => `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
    extractRate: (data) => data.lastFundingRate !== undefined ? parseFloat(data.lastFundingRate) : null,
  },
  kucoin: {
    symbolSuffix: 'USDTM',
    allTickers: {
      url: 'https://api-futures.kucoin.com/api/v1/contracts/active',
      extract: (data) => data.code === '200000' ? data.data.map(item => ({
        symbol: item.symbol.replace('USDTM', ''),
        rate: parseFloat(item.fundingRate)
      })).filter(item => item.symbol && !isNaN(item.rate)) : []
    },
    buildUrl: (symbol) => `https://api.kucoin.com/api/ua/v1/market/funding-rate?symbol=${symbol}`,
    extractRate: (data) => data.code === '200000' && data.data ? parseFloat(data.data.nextFundingRate) : null,
  },
  bitget: {
    symbolSuffix: 'USDT',
    allTickers: {
      url: 'https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures',
      extract: (data) => data.code === '00000' ? data.data.map(item => ({
        symbol: item.symbol.replace('USDT', ''),
        rate: parseFloat(item.fundingRate)
      })).filter(item => item.symbol && !isNaN(item.rate)) : []
    },
    buildUrl: (symbol) => `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=usdt-futures`,
    extractRate: (data) => data.code === '00000' && data.data?.length > 0 ? parseFloat(data.data[0].fundingRate) : null,
  },
  gateio: {
    symbolSuffix: '_USDT',
    allTickers: {
      url: 'https://api.gateio.ws/api/v4/futures/usdt/contracts',
      extract: (data) => Array.isArray(data) ? data.map(item => ({
        symbol: item.name.replace('_USDT', ''),
        rate: parseFloat(item.funding_rate)
      })).filter(item => item.symbol && !isNaN(item.rate)) : []
    },
    buildUrl: (symbol) => `https://api.gateio.ws/api/v4/futures/usdt/contracts/${symbol}`,
    extractRate: (data) => data.funding_rate ? parseFloat(data.funding_rate) : null,
  },
  htx: {
    symbolSuffix: '-USDT',
    allTickers: {
      url: 'https://api.hbdm.com/linear-swap-api/v1/swap_batch_funding_rate',
      fetchOptions: { dispatcher: agent },
      extract: (data) => data.status === 'ok' ? data.data.map(item => ({
        symbol: item.contract_code.replace('-USDT', ''),
        rate: parseFloat(item.funding_rate)
      })).filter(item => item.symbol && !isNaN(item.rate)) : []
    },
    buildUrl: (symbol) => `https://api.hbdm.com/linear-swap-api/v1/swap_batch_funding_rate?contract_code=${symbol}`,
    extractRate: (data) => data.status === 'ok' && data.data?.length > 0 ? parseFloat(data.data[0].funding_rate) : null,
    fetchOptions: { dispatcher: agent },
  },
  bybit: {
    symbolSuffix: 'USDT',
    allTickers: {
      url: 'https://api.bybit.com/v5/market/tickers?category=linear',
      extract: (data) => data.retCode === 0 ? data.result.list.map(item => ({
        symbol: item.symbol.replace('USDT', ''),
        rate: parseFloat(item.fundingRate)
      })).filter(item => item.symbol && !isNaN(item.rate)) : []
    },
    buildUrl: (symbol) => `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
    extractRate: (data) => data.retCode === 0 && data.result?.list?.length ? parseFloat(data.result.list[0].fundingRate) : null,
  },
};

const fetchFromExchange = async (exchange, baseSymbol) => {
  const handler = EXCHANGE_HANDLERS[exchange];
  if (!handler) return null;

  try {
    const formattedSymbol = `${baseSymbol}${handler.symbolSuffix}`;
    const url = handler.buildUrl(formattedSymbol);
    const response = await fetch(url, handler.fetchOptions || {});
    const data = await response.json();
    return handler.extractRate(data);
  } catch (error) {
    console.error(`❌ ${exchange} lỗi ${baseSymbol}:`, error.message);
    return null;
  }
};

const fetchTickersFromExchange = async (exchange) => {
  const handler = EXCHANGE_HANDLERS[exchange];
  if (!handler?.allTickers) return [];

  try {
    const { url, fetchOptions, extract } = handler.allTickers;
    const response = await fetch(url, fetchOptions || {});
    const data = await response.json();
    return extract(data);
  } catch (error) {
    console.error(`❌ Lỗi fetch all tickers từ ${exchange}:`, error.message);
    return [];
  }
};

const loadWatchlistCoins = async () => {
  console.log('📋 Đang tạo watchlist từ các sàn...');
  const exchanges = Object.keys(EXCHANGE_HANDLERS);
  
  // Thêm WhiteBIT vào logic chung
  const whitebitTickers = (await fetchAllWhiteBIT([])).allTickers;

  const promises = exchanges.map(ex => fetchTickersFromExchange(ex));
  const results = await Promise.all(promises);
  results.push(whitebitTickers); // Thêm kết quả của WhiteBIT

  const allSelectedCoins = new Set();

  results.forEach((tickers, index) => {
    if (tickers.length === 0) return;

    const exchangeName = index < exchanges.length ? exchanges[index] : 'whitebit';
    console.log(`🔍 Sàn ${exchangeName} có ${tickers.length} tickers.`);

    // Sắp xếp theo funding rate
    tickers.sort((a, b) => a.rate - b.rate);

    // Lấy 8 coin thấp nhất và 8 coin cao nhất
    const selected = [...tickers.slice(0, 8), ...tickers.slice(-8)];
    selected.forEach(coin => allSelectedCoins.add(coin.symbol));
  });

  console.log(`✅ Watchlist được tạo với ${allSelectedCoins.size} coins duy nhất.`);
  return Array.from(allSelectedCoins).map(symbol => ({ symbol }));
};

const fetchAllWhiteBIT = async (symbolList) => {
  const resultMap = {};
  let allTickers = [];
  try {
    const response = await fetch('https://whitebit.com/api/v4/public/futures');
    const result = await response.json();

    if (!result?.success || !Array.isArray(result.result)) {
      console.error("❌ Dữ liệu WhiteBIT không hợp lệ:", result);
      return resultMap;
    }

    allTickers = result.result.map(m => ({
      symbol: m.ticker_id.replace('_PERP', ''),
      rate: parseFloat(m.funding_rate)
    })).filter(item => item.symbol && !isNaN(item.rate));

    const marketMap = {};
    allTickers.forEach(ticker => {
      // Dùng để tra cứu cho symbolList (nếu có)
      const formattedSymbol = `${ticker.symbol}_PERP`;
      marketMap[formattedSymbol] = ticker.rate;
    });

    symbolList.forEach((symbol) => {
      const formattedSymbol = `${symbol}_PERP`;
      resultMap[symbol] = marketMap[formattedSymbol] || null;
    });

    if (symbolList.length > 0) {
      console.log(`✅ WhiteBIT: Đã lấy ${Object.keys(resultMap).length} coins`);
    }
  } catch (error) {
    console.error(`❌ WhiteBIT lỗi:`, error.message);
    symbolList.forEach((symbol) => {
      resultMap[symbol] = null;
    });
  }
  
  if (symbolList.length === 0) return { allTickers };
  return resultMap;
};

const sortRatesByValue = (rates) => {
  const entries = Object.entries(rates).map(([exchange, rate]) => ({
    exchange,
    rate,
  }));

  // sort tăng dần, null hoặc undefined đẩy xuống cuối
  const sorted = entries.sort((a, b) => {
    const ar = a.rate ?? Infinity;
    const br = b.rate ?? Infinity;
    return ar - br;
  });

  // trả về lại object theo thứ tự mới
  return sorted.reduce((acc, item) => {
    acc[item.exchange] = item.rate;
    return acc;
  }, {});
};


const fetchAllFundingRates = async (coinList) => {
  const symbolList = coinList.map(c => c.symbol);
  // WhiteBIT có API lấy tất cả cùng lúc, nên giữ lại logic riêng
  const whiteBitData = await fetchAllWhiteBIT(symbolList); // Chỉ lấy rate cho các coin trong list
  const exchangesToFetch = Object.keys(EXCHANGE_HANDLERS);

  const results = await Promise.all(
    coinList.map(async (coin) => {
      try {
        const ratePromises = exchangesToFetch.map(exchange => 
          fetchFromExchange(exchange, coin.symbol)
        );
        const ratesArray = await Promise.all(ratePromises);

        const rates = {};
        exchangesToFetch.forEach((exchange, index) => {
          rates[exchange] = ratesArray[index];
        });
        rates.whitebit = whiteBitData[coin.symbol] || null;

        // ✅ Sort thứ tự các sàn theo funding tăng dần
        return {
          symbol: coin.symbol,
          rates: sortRatesByValue(rates),
        };
      } catch (error) {
        console.error(`❌ Lỗi khi fetch ${coin.symbol}:`, error);
        return null;
      }
    })
  );

  return results.filter(r => r !== null);
};


// ==================== TELEGRAM FORMATTER ====================
const escapeMarkdown = (text) => {
	return text;
  	return text.toString().replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
};

const formatRate = (rate) => {
  if (rate === null || rate === undefined) return '-';
  const percentage = (rate * 100).toFixed(6);
  const emoji = rate > 0 ? '🟢' : rate < 0 ? '🔴' : '⚪';
  return `${emoji} ${escapeMarkdown(percentage)}`;
};

const formatMessage = (coinsData) => {
  // ✅ Tính khoảng cách và gán thêm vào mỗi coin
  const coinsWithDiff = coinsData.map((coin) => {
    const entries = Object.entries(coin.rates).filter(([_, r]) => r !== null && r !== undefined);

    let diff = null;
    if (entries.length >= 2) {
      const firstRate = entries[0][1];
      let lastRate = null;

      for (let i = entries.length - 1; i >= 0; i--) {
        if (typeof entries[i][1] === 'number') {
          lastRate = entries[i][1];
          break;
        }
      }

      if (lastRate !== null) diff = firstRate - lastRate;
    }

    return { ...coin, diff };
  });

  // ✅ Sort theo khoảng cách tuyệt đối lớn nhất và chỉ lấy top 10
  const sortedCoins = coinsWithDiff
    .sort((a, b) => {
      // Sắp xếp theo giá trị tuyệt đối của diff, giảm dần.
      // Coin không có diff (null) sẽ bị đẩy xuống cuối.
      const ad = a.diff !== null ? Math.abs(a.diff) : -1;
      const bd = b.diff !== null ? Math.abs(b.diff) : -1;
      return bd - ad;
    })
    .slice(0, 10); // Lấy 10 coin có khoảng cách lớn nhất

  // ✅ Format message sau khi sort
  let message = '📊 FUNDING RATES UPDATE\n';
  message += `⏰ ${escapeMarkdown(new Date().toLocaleString('vi-VN'))}\n`;
  message += '━━━━━━━━━━━━━━━━━━━\n';

  sortedCoins.forEach((coin, index) => {
    message += `${index + 1}. ${escapeMarkdown(coin.symbol)}USDT\n`;

    const entries = Object.entries(coin.rates);
    const lastIndex = entries.length - 1;

    entries.forEach(([exchange, rate], i) => {
      const prefix = i === lastIndex ? '└' : '├';
      const label = {
        binance: 'Binance',
        kucoin: 'KuCoin',
        bitget: 'Bitget',
        gateio: 'Gate.io',
        htx: 'HTX',
        bybit: 'ByBIT',
      }[exchange] || exchange;

      message += `${prefix} ${escapeMarkdown(label)}: ${formatRate(rate)}\n`;
    });

    const diffText = coin.diff !== null ? (coin.diff * 100).toFixed(4) : '-';
    message += `* Khoảng cách: ${diffText}\n\n`;
  });

//   console.log(message);
  return message;
};

// ==================== MAIN BOT LOGIC ====================
class FundingRateBot {
  constructor() {
    this.bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
    this.coins = [];
    this.lastSentMinute = -1;
  }

  async initialize() {
    console.log('🤖 Bot khởi động...');
    await this.loadWatchlist();
    this.startScheduler();
  }

  async loadWatchlist() {
    console.log('📋 Đang load danh sách coins...');
    this.coins = await loadWatchlistCoins();
	await this.bot.sendMessage(CHAT_ID, `✅ Đã đọc ${this.coins.length} symbols mới: ` + this.coins.map(c => c.symbol).join(', '));
  }

  async sendFundingUpdate() {
    if (this.coins.length === 0) {
      console.log('⚠️ Chưa có danh sách coins');
      return;
    }

    console.log('📤 Đang fetch funding rates...');
    const fundingData = await fetchAllFundingRates(this.coins);
    
    const message = formatMessage(fundingData);
    
    try {
      await this.bot.sendMessage(CHAT_ID, message, { 
        //parse_mode: 'MarkdownV2' 
      });
      console.log('✅ Đã gửi message lên Telegram');
    } catch (error) {
        console.error('❌ Lỗi gửi Telegram:', error.response?.body || error.message);
		console.log('--- Message lỗi ---');
		console.log(message)
    }
  }

  startScheduler() {
    console.log('⏰ Bắt đầu scheduler...');
    
    setInterval(async () => {
      const now = new Date();
      const minute = now.getMinutes();
      const second = now.getSeconds();

      // Chỉ check ở giây 0
      if (second !== 10) return;

      console.log(`⏱️ ${now.toLocaleTimeString('vi-VN')} - Minute: ${minute}`);

      // Phút 47: Load danh sách coins mới
      if (minute === COIN_UPDATE_MINUTE) {
        console.log('🔄 Thời gian load coins mới!');
        await this.loadWatchlist();
      }
      
      // Phút 50-59: Gửi funding rates
      if (minute >= FUNDING_UPDATE_START && minute <= FUNDING_UPDATE_END) {
        // Tránh gửi trùng lặp trong cùng 1 phút
        if (this.lastSentMinute !== minute) {
          console.log('💰 Thời gian gửi funding rates!');
          await this.sendFundingUpdate();
          this.lastSentMinute = minute;
        }
      }
    }, 1000);
  }
}

// ==================== START BOT ====================
const bot = new FundingRateBot();
bot.initialize().catch(console.error);

console.log('✅ Bot đã sẵn sàng!');
console.log(`📅 Lịch trình:`);
console.log(`   - Phút ${COIN_UPDATE_MINUTE}: Tạo watchlist mới`);
console.log(`   - Phút ${FUNDING_UPDATE_START}-${FUNDING_UPDATE_END}: Gửi funding rates`);