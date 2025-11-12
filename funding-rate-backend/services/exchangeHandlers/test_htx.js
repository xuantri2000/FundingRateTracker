import 'dotenv/config';
import { htxHandler } from './htxHandler.js';

const SYMBOL = 'BTCUSDT'; // Thay đổi symbol bạn muốn test

async function testHtxHandler() {
    console.log(`===== STARTING HTX HANDLER TEST FOR ${SYMBOL} =====`);

    try {
        // 1. Get Price
        console.log('\n--- 1. Testing getPrice ---');
        const price = await htxHandler.getPrice(SYMBOL);
        console.log(`✅ [SUCCESS] Price for ${SYMBOL}: ${price}`);
    } catch (error) {
        console.error(`❌ [FAILURE] getPrice:`, error.message);
    }

    try {
        // 2. Get Symbol Info
        console.log('\n--- 2. Testing getSymbolInfo ---');
        const symbolInfo = await htxHandler.getSymbolInfo(SYMBOL);
        console.log(`✅ [SUCCESS] Symbol Info for ${SYMBOL}:`, symbolInfo);
    } catch (error) {
        console.error(`❌ [FAILURE] getSymbolInfo:`, error.message);
    }

    try {
        // 3. Get PNL
        console.log('\n--- 3. Testing getPNL ---');
        const pnlInfo = await htxHandler.getPNL(SYMBOL);
        console.log(`✅ [SUCCESS] PNL Info for ${SYMBOL}:`, pnlInfo);
    } catch (error) {
        console.error(`❌ [FAILURE] getPNL:`, error.message);
    }

    try {
        // 4. Set Leverage
        console.log('\n--- 4. Testing setLeverage ---');
        const leverage = 10;
        const leverageResponse = await htxHandler.setLeverage(SYMBOL, leverage);
        console.log(`✅ [SUCCESS] Set leverage to ${leverage} for ${SYMBOL}:`, leverageResponse);
    } catch (error) {
        console.error(`❌ [FAILURE] setLeverage:`, error.message);
    }

    try {
        // 5. Set Margin Type
        console.log('\n--- 5. Testing setMarginType ---');
        // HTX không có API riêng, hàm này chỉ log thông báo
        await htxHandler.setMarginType(SYMBOL, 'ISOLATED');
        console.log(`✅ [SUCCESS] setMarginType check completed for ${SYMBOL}.`);
    } catch (error) {
        console.error(`❌ [FAILURE] setMarginType:`, error.message);
    }

    try {
        // 6. Place Order (Cẩn thận, lệnh này sẽ được thực thi)
        console.log('\n--- 6. Testing placeOrder (BUY) ---');
        // Đặt số lượng nhỏ để test
        const quantityToBuy = 0.001;
        const orderResponse = await htxHandler.placeOrder(SYMBOL, 'BUY', quantityToBuy);
        console.log(`✅ [SUCCESS] Placed BUY order for ${quantityToBuy} ${SYMBOL}:`, orderResponse);
    } catch (error) {
        console.error(`❌ [FAILURE] placeOrder:`, error.message);
    }

    // Chờ một chút để vị thế được ghi nhận
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        // 7. Close Position (Cẩn thận, lệnh này sẽ đóng vị thế)
        console.log('\n--- 7. Testing closePosition ---');
        const closeResponse = await htxHandler.closePosition(SYMBOL);
        console.log(`✅ [SUCCESS] Closed position for ${SYMBOL}:`, closeResponse);
    } catch (error) {
        console.error(`❌ [FAILURE] closePosition:`, error.message);
    }

    console.log('\n===== HTX HANDLER TEST FINISHED =====');

}

testHtxHandler().catch(err => {
    console.error("\n🚨 An unexpected error occurred during the test run:", err);
    process.exit(1);
});