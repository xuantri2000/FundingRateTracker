// src/services/exchangeService.js

/**
 * Format symbol cho từng sàn
 */
export const formatSymbol = (baseSymbol, exchange) => {
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
    default:
      return `${baseSymbol}USDT`;
  }
};

/**
 * Lấy top 8 coins có funding rate cao nhất từ Binance
 */
export const fetchTop8Binance = async () => {
  try {
    const response = await fetch('/binance-api/fapi/v1/premiumIndex');
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

/**
 * Fetch funding rate từ KuCoin
 */
export const fetchKuCoin = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'kucoin');
    const response = await fetch(`/kucoin-api/api/ua/v1/market/funding-rate?symbol=${formattedSymbol}`);
    const data = await response.json();
    if (data.code === '200000' && data.data) {
      return parseFloat(data.data.nextFundingRate);
    }
  } catch (error) {
    console.error(`❌ KuCoin lỗi ${symbol}:`, error);
  }
  return null;
};

/**
 * Fetch funding rate từ Bitget
 */
export const fetchBitget = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'bitget');
    const response = await fetch(
      `/bitget-api/api/v2/mix/market/current-fund-rate?symbol=${formattedSymbol}&productType=usdt-futures`
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

/**
 * Fetch funding rate từ Gate.io
 */
export const fetchGateIO = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'gateio');
    const response = await fetch(
      `/gate-api/api/v4/futures/usdt/contracts/${formattedSymbol}`
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

/**
 * Fetch funding rate từ htx
 */
export const fetchhtx = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'htx');
    const response = await fetch(
      `/htx-api/linear-swap-api/v1/swap_batch_funding_rate?contract_code=${formattedSymbol}`
    );
    const data = await response.json();
    
    if (data.status === 'ok' && data.data && data.data.length > 0) {
      return parseFloat(data.data[0].funding_rate);
    }
  } catch (error) {
    console.error(`❌ htx lỗi ${symbol}:`, error.message);
  }
  return null;
};

/**
 * Fetch funding rate từ MEXC
 */
export const fetchMEXC = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'mexc');
    const response = await fetch(
      `/mexc-api/api/v1/contract/funding_rate/${formattedSymbol}`
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

/**
 * Fetch tất cả funding rates từ WhiteBIT một lần
 * Trả về Map: symbol -> funding_rate
 */
export const fetchAllWhiteBIT = async (symbolList) => {
  const resultMap = {};
  
  try {
    const response = await fetch(`/whitebit-api/futures`);
    const result = await response.json();

    if (!result?.success || !Array.isArray(result.result)) {
      console.error("❌ Dữ liệu WhiteBIT không hợp lệ:", result);
      return resultMap;
    }

    // Tạo map từ ticker_id -> funding_rate
    const marketMap = {};
    result.result.forEach((m) => {
      if (m.ticker_id && m.funding_rate !== undefined) {
        marketMap[m.ticker_id] = parseFloat(m.funding_rate);
      }
    });

    // Map symbols từ danh sách input
    symbolList.forEach((symbol) => {
      const formattedSymbol = formatSymbol(symbol, 'whitebit');
      resultMap[symbol] = marketMap[formattedSymbol] || null;
    });

    console.log(`✅ WhiteBIT: Đã lấy ${Object.keys(resultMap).length} coins`);
  } catch (error) {
    console.error(`❌ WhiteBIT lỗi:`, error.message);
    // Trả về null cho tất cả symbols
    symbolList.forEach((symbol) => {
      resultMap[symbol] = null;
    });
  }

  return resultMap;
};

export const fetchBinance = async (symbol) => {
  try {
    const formattedSymbol = formatSymbol(symbol, 'binance');
    const response = await fetch(`/binance-api/fapi/v1/premiumIndex?symbol=${formattedSymbol}`);
    const data = await response.json();
    console.log(data.lastFundingRate);
    if (data.lastFundingRate !== undefined) {
      return parseFloat(data.lastFundingRate);
    }
  } catch (error) {
    console.error(`❌ Binance lỗi ${symbol}:`, error.message);
  }
  return null;
};

/**
 * Fetch funding rates từng coin một (bất đồng bộ)
 * Callback được gọi mỗi khi có coin hoàn thành
 * 
 * CẢI TIẾN:
 * - Gọi fetchAllWhiteBIT 1 lần duy nhất trước
 * - Mỗi coin hoàn thành ngay lập tức gọi callback (không chờ tất cả)
 */
export const fetchFundingRatesAsync = async (coinList, onCoinComplete) => {
  // Bước 1: Fetch WhiteBIT một lần cho tất cả coins
  const symbolList = coinList.map(c => c.symbol);
  const whiteBitData = await fetchAllWhiteBIT(symbolList);

  // Bước 2: Fetch từng coin bất đồng bộ
  const promises = coinList.map(async (coin) => {
    try {
      // Fetch các sàn khác song song (trừ WhiteBIT đã có sẵn)
      const [binance, kucoin, bitget, gateio, htx, mexc] = await Promise.all([
        fetchBinance(coin.symbol),
        fetchKuCoin(coin.symbol),
        fetchBitget(coin.symbol),
        fetchGateIO(coin.symbol),
        fetchhtx(coin.symbol),
        fetchMEXC(coin.symbol),
      ]);

      const coinData = {
        symbol: coin.symbol,
        rates: { 
          binance, 
          kucoin, 
          bitget, 
          gateio, 
          htx, 
          mexc, 
          whitebit: whiteBitData[coin.symbol] || null
        },
      };

      // ✨ Gọi callback NGAY KHI coin này hoàn thành
      if (onCoinComplete) onCoinComplete(coinData);

      return coinData;
    } catch (error) {
      console.error(`❌ Lỗi khi fetch ${coin.symbol}:`, error);
      return null;
    }
  });

  await Promise.all(promises);
};