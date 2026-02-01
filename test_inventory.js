/**
 * Test script for Inventory backend functions
/**
 * Test script for Inventory backend functions (Google Apps Script compatible)
 * Run this in Google Apps Script editor to test the functions
 */

// Test 1: Test getInventoryData function
function testGetInventoryData() {
  Logger.log('=== Testing getInventoryData ===');
  try {
    const data = getInventoryData();
    Logger.log('✅ getInventoryData returned: ' + (data ? data.length : 0) + ' items');

    if (Array.isArray(data) && data.length > 0) {
      Logger.log('✅ Data structure check passed');
      const firstItem = data[0];
      if (firstItem && firstItem.length >= 6) {
        Logger.log('✅ Item structure: ID, Name, Serial, Condition, Status, Holder');
        Logger.log('Sample item: ' + JSON.stringify(firstItem));
      } else {
        Logger.log('❌ Invalid item structure');
      }
    } else {
      Logger.log('❌ No data returned or invalid format');
    }
  } catch (error) {
    Logger.log('❌ getInventoryData failed: ' + (error && error.message ? error.message : error));
  }
}

// Test 2: Test processBorrowing function
function testProcessBorrowing() {
  Logger.log('=== Testing processBorrowing ===');
  try {
    const data = getInventoryData();
    const availableItem = Array.isArray(data) ? data.find(item => item[4] === 'Available') : null;

    if (availableItem) {
      Logger.log('Found available equipment: ' + availableItem[1]);
      const result = processBorrowing(availableItem[0], 'Good condition for testing');
      Logger.log('✅ processBorrowing result: ' + result);

      const updatedData = getInventoryData();
      const updatedItem = updatedData.find(item => item[0] === availableItem[0]);
      if (updatedItem && updatedItem[4] === 'Borrowed') {
        Logger.log('✅ Equipment status updated to Borrowed');
      } else {
        Logger.log('❌ Equipment status not updated');
      }
    } else {
      Logger.log('❌ No available equipment found for testing');
    }
  } catch (error) {
    Logger.log('❌ processBorrowing failed: ' + (error && error.message ? error.message : error));
  }
}

// Test 3: Test returnEquipment function
function testReturnEquipment() {
  Logger.log('=== Testing returnEquipment ===');
  try {
    const data = getInventoryData();
    const borrowedItem = Array.isArray(data) ? data.find(item => item[4] === 'Borrowed') : null;

    if (borrowedItem) {
      Logger.log('Found borrowed equipment: ' + borrowedItem[1]);
      const result = returnEquipment(borrowedItem[0], 'Returned in good condition');
      Logger.log('✅ returnEquipment result: ' + result);

      const updatedData = getInventoryData();
      const updatedItem = updatedData.find(item => item[0] === borrowedItem[0]);
      if (updatedItem && updatedItem[4] === 'Available') {
        Logger.log('✅ Equipment status updated to Available');
      } else {
        Logger.log('❌ Equipment status not updated');
      }
    } else {
      Logger.log('❌ No borrowed equipment found for testing');
    }
  } catch (error) {
    Logger.log('❌ returnEquipment failed: ' + (error && error.message ? error.message : error));
  }
}

// Test 4: Test cache clearing
function testCacheClearing() {
  Logger.log('=== Testing cache clearing ===');
  try {
    const beforeClear = getInventoryData();
    Logger.log('Data before cache clear: ' + (beforeClear ? beforeClear.length : 0) + ' items');

    clearInventoryCache();
    Logger.log('✅ Cache cleared');

    const afterClear = getInventoryData();
    Logger.log('Data after cache clear: ' + (afterClear ? afterClear.length : 0) + ' items');

    if (beforeClear && afterClear && beforeClear.length === afterClear.length) {
      Logger.log('✅ Cache clearing test passed');
    } else {
      Logger.log('⚠️  Data length changed after cache clear (this may be normal)');
    }
  } catch (error) {
    Logger.log('❌ Cache clearing test failed: ' + (error && error.message ? error.message : error));
  }
}

// Test 5: Test error handling
function testErrorHandling() {
  Logger.log('=== Testing error handling ===');
  try {
    const result = processBorrowing('INVALID-ID', 'test');
    Logger.log('❌ Should have thrown error for invalid ID, but got: ' + result);
  } catch (error) {
    Logger.log('✅ Correctly handled invalid equipment ID: ' + (error && error.message ? error.message : error));
  }

  try {
    const result = returnEquipment('INVALID-ID', 'test');
    Logger.log('❌ Should have thrown error for invalid return, but got: ' + result);
  } catch (error) {
    Logger.log('✅ Correctly handled invalid return attempt: ' + (error && error.message ? error.message : error));
  }
}

// Main test runner
function runAllInventoryTests() {
  Logger.log('🚀 Starting Inventory Backend Tests');
  Logger.log('=====================================');

  testGetInventoryData();
  Logger.log('');

  testProcessBorrowing();
  Logger.log('');

  testReturnEquipment();
  Logger.log('');

  testCacheClearing();
  Logger.log('');

  testErrorHandling();
  Logger.log('');

  Logger.log('=====================================');
  Logger.log('🏁 Inventory Backend Tests Completed');
}
