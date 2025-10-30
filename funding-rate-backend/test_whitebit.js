// test_whitebit_fixed.js - Test WhiteBIT API đã sửa lỗi
import 'dotenv/config';
import { whitebitHandler } from './services/exchangeHandlers/whitebitHandler.js';
import { hasCredentials, MODE } from './services/config.js';

// ====================================================================
// CÀI ĐẶT TEST
// ====================================================================
const TEST_SYMBOL = 'PENGUUSDT'; // Symbol để test
const TEST_LEVERAGE = 1;       // Đòn bẩy để test
const TEST_QUANTITY = 250;   // Số lượng để test (chỉ dùng khi uncomment phần đặt lệnh)
// ====================================================================

async function runWhitebitTests() {
  console.log('🚀 Bắt đầu test WhiteBIT API (Version 2.0 - Fixed)...');
  console.log('====================================\n');

  // Kiểm tra credentials
  if (!hasCredentials('whitebit')) {
    console.error('❌ Vui lòng cung cấp WHITEBIT_API_KEY và WHITEBIT_SECRET_KEY trong file .env');
    return;
  }
  console.log("✅ Credentials WhiteBIT đã được cấu hình.");
  console.log(`✅ Chế độ: ${MODE}\n`);

  // 1. Test getPrice (Public)
  try {
    console.log(`1. 🏷️  Đang lấy giá cho ${TEST_SYMBOL}...`);
    const price = await whitebitHandler.getPrice(TEST_SYMBOL);
    console.log(`   ✅ Giá của ${TEST_SYMBOL}: $${price.toLocaleString()}\n`);
  } catch (error) {
    console.error(`   ❌ Lỗi: ${error.message}\n`);
  }

  // 2. Test getSymbolInfo (Public)
  try {
    console.log(`2. ℹ️  Đang lấy thông tin ${TEST_SYMBOL}...`);
    const info = await whitebitHandler.getSymbolInfo(TEST_SYMBOL);
	// console.log(info);
	// console.log(111111111111111);
    console.log('   ✅ Thông tin symbol:');
    console.log(`      - Quantity Precision: ${info.quantityPrecision}`);
    console.log(`      - Max Leverage: ${info.maxLeverage}x\n`);
  } catch (error) {
    console.error(`   ❌ Lỗi: ${error.message}\n`);
  }

  // --- PRIVATE API TESTS - CẦN API KEY ---

  // 3. Test getAllPositions (Private)
  try {
    console.log(`3. 📂 Đang lấy tất cả vị thế...`);
    const allPositions = await whitebitHandler.getAllPositions();
    if (Array.isArray(allPositions) && allPositions.length > 0) {
        console.log(`   ✅ Tìm thấy ${allPositions.length} vị thế:`);
        allPositions.forEach(pos => {
            console.log(`      - ${pos.market}: Size ${pos.amount}, PNL $${pos.pnl}`);
        });
        console.log('');
    } else {
        console.log('   ✅ Không có vị thế đang mở.\n');
    }
  } catch (error) {
    console.error(`   ❌ Lỗi: ${error.message}\n`);
  }

  // 4. Test getPNL (Private)
  try {
    console.log(`4. 💰 Đang lấy PNL cho ${TEST_SYMBOL}...`);
    const pnlInfo = await whitebitHandler.getPNL(TEST_SYMBOL);
    console.log('   ✅ Thông tin PNL:');
    console.log(`      - PNL: $${pnlInfo.pnl}`);
    console.log(`      - Size: ${pnlInfo.size}`);
    console.log(`      - ROI: ${pnlInfo.roi}%\n`);
  } catch (error) {
    console.error(`   ❌ Lỗi: ${error.message}\n`);
  }

  // 5. Test setLeverage (Private)
  try {
    console.log(`5. ⚡️ Đang cài đặt đòn bẩy ${TEST_LEVERAGE}x...`);
    const leverageResult = await whitebitHandler.setLeverage(TEST_SYMBOL, TEST_LEVERAGE);
    console.log(`   ✅ ${leverageResult.message}\n`);
  } catch (error) {
    console.error(`   ❌ Lỗi: ${error.message}\n`);
  }

  // 6. Test setMarginType
  try {
    console.log(`6. 🛡️  Kiểm tra Margin Type...`);
    await whitebitHandler.setMarginType(TEST_SYMBOL, 'ISOLATED');
    console.log(`   ✅ WhiteBIT Futures mặc định là ISOLATED.\n`);
  } catch (error) {
    console.error(`   ❌ Lỗi: ${error.message}\n`);
  }

  // --- PHẦN NGUY HIỂM: ĐẶT & ĐÓNG LỆNH ---
  // Bỏ comment khối dưới nếu muốn test thật (SẼ ĐẶT LỆNH THẬT!)
//   let orderId = null;
  
//   // 7. Test placeOrder (Private) - NGUY HIỂM!
//   try {
//     console.log(`7. 🛒 Đang đặt lệnh MUA ${TEST_QUANTITY} ${TEST_SYMBOL}...`);
//     const orderResult = await whitebitHandler.placeOrder(TEST_SYMBOL, 'BUY', TEST_QUANTITY);
//     orderId = orderResult.orderId;
//     console.log(`   ✅ Đặt lệnh thành công! Order ID: ${orderId}\n`);

//     // Chờ vài giây
//     console.log('   ⏳ Chờ 5 giây...');
//     await new Promise(resolve => setTimeout(resolve, 5000));

//     // 8. Kiểm tra PNL sau khi mở lệnh
//     console.log(`8. 💰 Kiểm tra PNL sau khi mở lệnh...`);
//     const newPnlInfo = await whitebitHandler.getPNL(TEST_SYMBOL);
//     console.log('   ✅ PNL mới:');
//     console.log(`      - PNL: $${newPnlInfo.pnl}`);
//     console.log(`      - Size: ${newPnlInfo.size}\n`);

//   } catch (error) {
//     console.error(`   ❌ Lỗi đặt lệnh: ${error.message}\n`);
//   }

//   // 9. Test closePosition (Private) - NGUY HIỂM!
//   if (orderId) {
//     try {
//       console.log(`9. ❌ Đang đóng vị thế ${TEST_SYMBOL}...`);
//       const closeResult = await whitebitHandler.closePosition(TEST_SYMBOL);
//       console.log(`   ✅ Đóng vị thế thành công! Order ID: ${closeResult.orderId}\n`);
//     } catch (error) {
//       console.error(`   ❌ Lỗi đóng vị thế: ${error.message}\n`);
//       console.error('   🚨 VUI LÒNG KIỂM TRA VỊ THẾ TRÊN SÀN THỦ CÔNG! 🚨\n');
//     }
//   }
  

  console.log('====================================');
  console.log('🎉 Test hoàn tất!');
  console.log('\n📝 Ghi chú:');
  console.log('   - Các test 1-6 đã hoàn thành (public + private read-only)');
  console.log('   - Test 7-9 (đặt/đóng lệnh) đang bị comment để tránh đặt lệnh thật');
  console.log('   - Bỏ comment nếu muốn test đầy đủ (CẢNH BÁO: SẼ ĐẶT LỆNH THẬT!)');
}

runWhitebitTests();