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

const COIN_UPDATE_MINUTE = 47;
const FUNDING_UPDATE_START = 50;
const FUNDING_UPDATE_END = 59;

// ==================== EXCHANGE SERVICE ====================
const formatSymbol = (baseSymbol, exchange) => {
  switch(exchange) {
    case 'kucoin':
      return `${baseSymbol}USDTM`;
    case 'bitget':
      return `${baseSymbol}USDT`;
    case 'gateio':
      return `${baseSymbol}_USDT`;
    case 'htx':
      return `${baseSymbol}-USDT`;
    case 'mexc':
      return `${baseSymbol}_USDT`;
    case 'whitebit':
      return `${baseSymbol}_PERP`;
    case 'binance':
      return `${baseSymbol}USDT`;
	case 'bybit':
	  return `${baseSymbol}USDT`;
    default:
      return `${baseSymbol}USDT`;
  }
};

const fetchTop8Binance = async () => {
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    const data = await response.json();
    
    const sorted = data
      .filter(item => item.lastFundingRate)
      .sort((a, b) => parseFloat(a.lastFundingRate) - parseFloat(b.lastFundingRate))
      .slice(0, 8);
    
    return sorted.map(item => ({
      symbol: item.symbol.replace('USDT', ''),
      binanceFundingRate: parseFloat(item.lastFundingRate),
      nextFundingTime: item.nextFundingTime
    }));
  } catch (error) {
    console.error('❌ Lỗi Binance:', error);
    return [];
  }
};

const fetchBinance = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'binance');
    const response = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${formattedSymbol}`);
    const data = await response.json();
    if (data.lastFundingRate !== undefined) {
      return parseFloat(data.lastFundingRate);
    }
  } catch (error) {
    console.error(`❌ Binance lỗi ${symbol}:`, error.message);
  }
  return null;
};

const fetchKuCoin = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'kucoin');
    const response = await fetch(`https://api.kucoin.com/api/ua/v1/market/funding-rate?symbol=${formattedSymbol}`);
    const data = await response.json();
    if (data.code === '200000' && data.data) {
      return parseFloat(data.data.nextFundingRate);
    }
  } catch (error) {
    console.error(`❌ KuCoin lỗi ${symbol}:`, error);
  }
  return null;
};

const fetchBitget = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'bitget');
    const response = await fetch(
      `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${formattedSymbol}&productType=usdt-futures`
    );
    const data = await response.json();
    
    if (data.code === '00000' && data.data && data.data.length > 0) {
      return parseFloat(data.data[0].fundingRate);
    }
  } catch (error) {
    console.error(`❌ Bitget lỗi ${symbol}:`, error.message);
  }
  return null;
};

const fetchGateIO = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'gateio');
    const response = await fetch(
      `https://api.gateio.ws/api/v4/futures/usdt/contracts/${formattedSymbol}`
    );
    const data = await response.json();
    
    if (data.funding_rate) {
      return parseFloat(data.funding_rate);
    }
  } catch (error) {
    console.error(`❌ Gate.io lỗi ${symbol}:`, error.message);
  }
  return null;
};

const fetchHTX = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'htx');
    const response = await fetch(
      `https://api.hbdm.com/linear-swap-api/v1/swap_batch_funding_rate?contract_code=${formattedSymbol}`,
	  { dispatcher: agent }
    );
    const data = await response.json();
    
    if (data.status === 'ok' && data.data && data.data.length > 0) {
      return parseFloat(data.data[0].funding_rate);
    }
  } catch (error) {
    console.error(`❌ HTX lỗi ${symbol}:`, error.message);
  }
  return null;
};

const fetchMEXC = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'mexc');
    const response = await fetch(
      `https://contract.mexc.com/api/v1/contract/funding_rate/${formattedSymbol}`
    );
    const data = await response.json();
    
    if (data.success && data.data) {
      return parseFloat(data.data.fundingRate);
    }
  } catch (error) {
    console.error(`❌ MEXC lỗi ${symbol}:`, error.message);
  }
  return null;
};

const fetchByBit = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'bybit');
    const response = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${formattedSymbol}`
    );
    const data = await response.json();

    if (data.retCode === 0 && data.result?.list?.length) {
      const item = data.result.list[0];
      return parseFloat(item.fundingRate);
    }
  } catch (error) {
    console.error(`❌ Bybit lỗi ${symbol}:`, error.message);
  }
  return null;
};

const fetchAllWhiteBIT = async (symbolList) => {
  const resultMap = {};
  
  try {
    const response = await fetch('https://whitebit.com/api/v4/public/futures');
    const result = await response.json();

    if (!result?.success || !Array.isArray(result.result)) {
      console.error("❌ Dữ liệu WhiteBIT không hợp lệ:", result);
      return resultMap;
    }

    const marketMap = {};
    result.result.forEach((m) => {
      if (m.ticker_id && m.funding_rate !== undefined) {
        marketMap[m.ticker_id] = parseFloat(m.funding_rate);
      }
    });

    symbolList.forEach((symbol) => {
      const formattedSymbol = formatSymbol(symbol, 'whitebit');
      resultMap[symbol] = marketMap[formattedSymbol] || null;
    });

    console.log(`✅ WhiteBIT: Đã lấy ${Object.keys(resultMap).length} coins`);
  } catch (error) {
    console.error(`❌ WhiteBIT lỗi:`, error.message);
    symbolList.forEach((symbol) => {
      resultMap[symbol] = null;
    });
  }

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
  const whiteBitData = await fetchAllWhiteBIT(symbolList);

  const results = await Promise.all(
    coinList.map(async (coin) => {
      try {
        const [binance, kucoin, bitget, gateio, htx, mexc, bybit] = await Promise.all([
          fetchBinance(coin.symbol),
          fetchKuCoin(coin.symbol),
          fetchBitget(coin.symbol),
          fetchGateIO(coin.symbol),
          fetchHTX(coin.symbol),
          fetchMEXC(coin.symbol),
          fetchByBit(coin.symbol),
        ]);

        const rates = {
          binance,
          kucoin,
          bitget,
          gateio,
          htx,
          mexc,
		  bybit,
          whitebit: whiteBitData[coin.symbol] || null,
        };

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

  // ✅ Sort theo khoảng cách tăng dần (null => Infinity)
  const sortedCoins = coinsWithDiff.sort((a, b) => {
    const ad = a.diff ?? Infinity;
    const bd = b.diff ?? Infinity;
    return ad - bd;
  });

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
        mexc: 'MEXC',
        whitebit: 'WhiteBIT',
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
    await this.loadTop8Coins();
    this.startScheduler();
  }

  async loadTop8Coins() {
    console.log('📋 Đang load danh sách top 8 coins...');
    this.coins = await fetchTop8Binance();
	await this.bot.sendMessage(CHAT_ID, `✅ Đã đọc 8 symbols mới từ binance: ` + this.coins.map(c => c.symbol).join(', '));
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
        await this.loadTop8Coins();
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
console.log(`   - Phút ${COIN_UPDATE_MINUTE}: Load top 8 coins`);
console.log(`   - Phút ${FUNDING_UPDATE_START}-${FUNDING_UPDATE_END}: Gửi funding rates`);