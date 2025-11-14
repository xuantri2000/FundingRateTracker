// test_kucoin.js - Test MEXC API
import 'dotenv/config';
import { kucoinHandler } from '../services/exchangeHandlers/kucoinHandler.js';
import { hasCredentials, MODE } from '../services/config.js';

// ====================================================================
// CÀI ĐẶT TEST
// ====================================================================
const TEST_SYMBOL = 'DOGEUSDT'; // Symbol để test (sẽ được chuyển thành BTC_USDT)
const TEST_LEVERAGE = 1;      // Đòn bẩy để test
const TEST_QUANTITY = 30;   // Số lượng để test (ví dụ: 0.001 BTC)
// ====================================================================

async function runMexcTests() {
  console.log('🚀 Bắt đầu test MEXC API...');
  console.log('====================================\n');

  // Kiểm tra credentials
//   if (!hasCredentials('kucoin')) {
//     console.error('❌ Vui lòng cung cấp MEXC_API_KEY và MEXC_SECRET_KEY trong file .env');
//     return;
//   }
//   console.log("✅ Credentials MEXC đã được cấu hình.");
//   console.log(`✅ Chế độ: ${MODE}\n`);

//   // 1. Test getPrice (Public)
//   try {
//     console.log(`1. 🏷️  Đang lấy giá cho ${TEST_SYMBOL}...`);
//     const price = await kucoinHandler.getPrice(TEST_SYMBOL);
//     console.log(`   ✅ Giá của ${TEST_SYMBOL}: $${price.toLocaleString()}\n`);
//   } catch (error) {
//     console.error(`   ❌ Lỗi: ${error.message}\n`);
//   }

  // 2. Test getSymbolInfo (Public)
  try {
    console.log(`2. ℹ️  Đang lấy thông tin ${TEST_SYMBOL}...`);
    const info = await kucoinHandler.getSymbolInfo(TEST_SYMBOL);
    console.log('   ✅ Thông tin symbol:');
    console.log(`      - Quantity Precision: ${info.quantityPrecision}`);
    console.log(`      - Max Leverage: ${info.maxLeverage}x\n`);
  } catch (error) {
    console.error(`   ❌ Lỗi: ${error.message}\n`);
  }

  // --- PRIVATE API TESTS - CẦN API KEY ---

  // 3. Test getPNL (Private)
//   try {
//     console.log(`3. 💰 Đang lấy PNL cho ${TEST_SYMBOL}...`);
//     const pnlInfo = await kucoinHandler.getPNL("POPCATUSDT");
//     console.log('   ✅ Thông tin PNL:');
//     console.log(`      - PNL: $${pnlInfo.pnl}`);
//     console.log(`      - Size: ${pnlInfo.size}`);
//     console.log(`      - Side: ${pnlInfo.holdSide || 'None'}\n`);
//   } catch (error) {
//     console.error(`   ❌ Lỗi: ${error.message}\n`);
//   }

//   // 4. Test setMarginType (Private)
//   try {
//     console.log(`4. 🛡️  Đang cài đặt Margin Type thành ISOLATED...`);
//     await kucoinHandler.setMarginType(TEST_SYMBOL, 'ISOLATED');
//     console.log(`   ✅ Đã gửi yêu cầu cài đặt Margin Type.\n`);
//   } catch (error) {
//     console.error(`   ❌ Lỗi: ${error.message}\n`);
//   }

//   // 5. Test setLeverage (Private)
//   try {
//     console.log(`5. ⚡️ Đang cài đặt đòn bẩy ${TEST_LEVERAGE}x...`);
//     await kucoinHandler.setLeverage(TEST_SYMBOL, TEST_LEVERAGE);
//     console.log(`   ✅ Đã gửi yêu cầu cài đặt đòn bẩy cho cả Long và Short.\n`);
//   } catch (error) {
//     console.error(`   ❌ Lỗi: ${error.message}\n`);
//   }

  // --- PHẦN NGUY HIỂM: ĐẶT & ĐÓNG LỆNH ---
  // Bỏ comment khối dưới nếu muốn test thật (SẼ ĐẶT LỆNH THẬT!)
//   let orderId = null;

//   // 6. Test placeOrder (Private) - NGUY HIỂM!
//   try {
//     console.log(`6. 🛒 Đang đặt lệnh MUA ${TEST_QUANTITY} ${TEST_SYMBOL}...`);
//     const orderResult = await kucoinHandler.placeOrder(TEST_SYMBOL, 'BUY', TEST_QUANTITY);
//     orderId = orderResult.orderId;
//     console.log(`   ✅ Đặt lệnh thành công! Order ID: ${orderId}\n`);

//     // Chờ vài giây
//     console.log('   ⏳ Chờ 5 giây...');
//     await new Promise(resolve => setTimeout(resolve, 5000));

//     // 7. Kiểm tra PNL sau khi mở lệnh
//     console.log(`7. 💰 Kiểm tra PNL sau khi mở lệnh...`);
//     const newPnlInfo = await kucoinHandler.getPNL(TEST_SYMBOL);
//     console.log('   ✅ PNL mới:');
//     console.log(`      - PNL: $${newPnlInfo.pnl}`);
//     console.log(`      - Size: ${newPnlInfo.size}\n`);

//   } catch (error) {
//     console.error(`   ❌ Lỗi đặt lệnh: ${error.message}\n`);
//   }

  // 8. Test closePosition (Private) - NGUY HIỂM!
//   if (orderId) {
    // try {
    //   console.log(`8. ❌ Đang đóng vị thế ${TEST_SYMBOL}...`);
    //   const closeResult = await kucoinHandler.closePosition("PEPEUSDT");
    //   console.log(`   ✅ Đóng vị thế thành công! Order ID: ${closeResult.orderId}\n`);
    // } catch (error) {
    //   console.error(`   ❌ Lỗi đóng vị thế: ${error.message}\n`);
    //   console.error('   🚨 VUI LÒNG KIỂM TRA VỊ THẾ TRÊN SÀN THỦ CÔNG! 🚨\n');
    // }
//   }

  console.log('====================================');
  console.log('🎉 Test hoàn tất!');
}

runMexcTests();