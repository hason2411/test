# Inventory Backend & Frontend Test Plan

## Backend Tests (Google Apps Script Functions)
### 1. getInventoryData()
- **Test**: Verify function returns array of inventory items with holder info
- **Expected**: Array with equipment data including ID, name, serial, condition, status, holder
- **Edge Cases**: Empty sheet, missing sheets, corrupted data

### 2. processBorrowing(equipId, initCond)
- **Test**: Borrow available equipment
- **Expected**: Success message, equipment status changes to "Borrowed"
- **Edge Cases**: Equipment not available, invalid ID, missing condition

### 3. returnEquipment(equipId, retCond)
- **Test**: Return borrowed equipment
- **Expected**: Success message, equipment status changes to "Available"
- **Edge Cases**: Equipment not borrowed, invalid ID, missing condition

### 4. clearInventoryCache()
- **Test**: Clear cache and verify data reloads
- **Expected**: Cache cleared, fresh data loaded

## Frontend Tests (HTML/JavaScript)
### 1. Page Load
- **Test**: Inventory page loads correctly
- **Expected**: Stats cards show numbers, equipment list renders

### 2. Equipment List Rendering
- **Test**: Equipment items display with correct status and actions
- **Expected**: Available items show "Checkout" button, borrowed show "Return"

### 3. Search & Filter
- **Test**: Search by name/serial, filter by status
- **Expected**: List updates dynamically

### 4. Modal Operations
- **Test**: Open/close modals, form validation
- **Expected**: Modals work, required fields validated

### 5. Borrow/Return Flow
- **Test**: Complete borrow and return cycle
- **Expected**: UI updates after operations, success messages

## Test Execution Steps
1. Deploy GAS project
2. Load Inventory page
3. Test data loading
4. Test search/filter functionality
5. Test borrow operation
6. Test return operation
7. Verify backend data changes
