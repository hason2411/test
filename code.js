/**
 * CTNC Strategic Management System - Backend v4.2
 * Designed for Coordinator: Ha Tri Son
 * Updates: Notification System, Detailed Resource Locking, Combined Feed
 */

// =============================================================================
// 1. WEB APP INITIALIZATION
// =============================================================================

/**
 * Main entry point for the web app.
 * @returns {HtmlOutput} The evaluated HTML template.
 */
function doGet() {
  try {
    // ensure Users sheet has at least coordinator account for testing
    try {
      syncUsersSheet();
    } catch (e) {
      Logger.log('syncUsersSheet failed: ' + e.toString());
    }
    return HtmlService.createTemplateFromFile('Index').evaluate()
      .setTitle('CTNC Strategic Portal')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    Logger.log('Error in doGet: ' + error.toString());
    throw new Error('Failed to initialize web app: ' + error.message);
  }
}

/**
 * Includes HTML content from a file.
 * @param {string} filename - The name of the file to include.
 * @returns {string} The HTML content.
 */
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (error) {
    Logger.log('Error in include: ' + error.toString());
    throw new Error('Failed to include file ' + filename + ': ' + error.message);
  }
}

/**
 * Gets page content from a file.
 * @param {string} filename - The name of the file to get content from.
 * @returns {string} The HTML content.
 */
function getPageContent(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (error) {
    Logger.log('Error in getPageContent: ' + error.toString());
    throw new Error('Failed to get page content from ' + filename + ': ' + error.message);
  }
}

// =============================================================================
// CONFIG & HELPERS
// =============================================================================

/**
 * Get the spreadsheet to operate on.
 * Uses Script Properties `SHEET_ID` if set, otherwise falls back to active spreadsheet.
 * This makes the code explicit about which spreadsheet is used and safer in webapp context.
 * @returns {Spreadsheet}
 */
function getSpreadsheet() {
  try {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('SHEET_ID');
    if (id) return SpreadsheetApp.openById(id);
  } catch (e) {
    Logger.log('getSpreadsheet: openById failed: ' + e.toString());
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Dev mode flag: set Script Property `DEV_MODE` to 'true' to enable sample-data creation.
 */
function isDevMode() {
  try { return PropertiesService.getScriptProperties().getProperty('DEV_MODE') === 'true'; } catch (e) { return false; }
}

/**
 * Simple role guard for server-side operations.
 * Throws if current user does not have required role.
 */
function requireRole(role) {
  const user = getCurrentUserInfo();
  if (!user || !user.role) throw new Error('Unauthorized: no user role');
  if (user.role !== role && user.role !== 'Admin') {
    throw new Error('Forbidden: requires role ' + role);
  }
}

// =============================================================================
// 2. CACHING UTILITIES
// =============================================================================

/**
 * Retrieves data from cache or fetches it if not cached.
 * @param {string} key - The cache key.
 * @param {function} fetchFunction - Function to fetch data if not cached.
 * @param {number} cacheMinutes - Cache duration in minutes (default: 5).
 * @returns {*} The cached or fetched data.
 */
function getCachedData(key, fetchFunction, cacheMinutes = 5) {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    const data = fetchFunction();
    cache.put(key, JSON.stringify(data), cacheMinutes * 60);
    return data;
  } catch (error) {
    Logger.log('Error in getCachedData: ' + error.toString());
    // Fallback to direct fetch if caching fails
    return fetchFunction();
  }
}

/**
 * Clears a specific cache entry.
 * @param {string} key - The cache key to clear.
 */
function clearCache(key) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(key);
  } catch (error) {
    Logger.log('Error in clearCache: ' + error.toString());
  }
}

/**
 * Clears inventory-related cache entries.
 * @returns {boolean} Always returns true.
 */
function clearInventoryCache() {
  clearCache('inventoryData');
  clearCache('borrowLogsData');
  return true;
}

// Log activity for notifications
function logActivity(type, message, user) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('ActivityLog');
  if (!sheet) {
    sheet = ss.insertSheet('ActivityLog');
    sheet.appendRow(['ID', 'Type', 'Message', 'Timestamp', 'User']);
  }
  const id = "ACT-" + Utilities.formatDate(new Date(), "GMT+7", "HHmmss");
  sheet.appendRow([id, type, message, new Date(), user]);
  clearCache('activityLogData');
}

// =============================================================================
// 4. USER MANAGEMENT (SESSION BASED)
// =============================================================================

/**
 * Gets information about the current user from session and user data.
 * @returns {Object} User information object.
 */
function getCurrentUserInfo() {
  try {
    const email = Session.getActiveUser().getEmail();
      const users = getCachedData('usersData', () => getSpreadsheet().getSheetByName('Users').getDataRange().getValues());
    let user = {
      name: email.split('@')[0],
      role: "Guest",
      email: email,
      department: "",
      status: "Active"
    };

    for (let i = 1; i < users.length; i++) {
      if (users[i][2] === email) { // Gmail column (index 2)
        user = {
          name: users[i][1], // Name column (index 1)
          role: users[i][3], // Role column (index 3)
          email: email,
          department: users[i][4], // Department column (index 4)
          status: users[i][5], // Status column (index 5)
          username: users[i][6] // Username column (index 6)
        };
        break;
      }
    }
    return user;
  } catch (error) {
    Logger.log('Error in getCurrentUserInfo: ' + error.toString());
    // Return default guest user if error occurs
    const email = Session.getActiveUser().getEmail();
    return {
      name: email.split('@')[0],
      role: "Guest",
      email: email,
      department: "",
      status: "Active"
    };
  }
}

// =============================================================================
// 5. DASHBOARD LOGIC (AGGREGATED REAL-TIME METRICS)
// =============================================================================

/**
 * Gets dashboard statistics including projects, equipment, tasks, workload, and feed.
 * @returns {Object} Dashboard statistics object.
 */
function getDashboardStats() {
  try {
      const ss = getSpreadsheet();
    const tasks = getCachedData('tasksData', () => ss.getSheetByName('Tasks').getDataRange().getValues().slice(1));
    const inv = getCachedData('inventoryData', () => ss.getSheetByName('Inventory').getDataRange().getValues().slice(1));
    const logs = getCachedData('borrowLogsData', () => ss.getSheetByName('BorrowLogs').getDataRange().getValues().slice(1));
    const activities = getCachedData('activityLogData', () => {
      const sheet = ss.getSheetByName('ActivityLog');
      return sheet ? sheet.getDataRange().getValues().slice(1) : [];
    });

    // Recent activities from ActivityLog (last 6)
    const recentActivities = activities
      .slice()
      .sort((a, b) => new Date(b[3]) - new Date(a[3])) // Sort by timestamp desc
      .slice(0, 6)
      .map(a => ({
        name: a[4] || 'System', // User
        timeRaw: new Date(a[3]),
        time: Utilities.formatDate(new Date(a[3]), "GMT+7", "HH:mm dd/MM"),
        content: a[2], // Message
        tag: a[1], // Type
        type: 'activity' // Mark as activity
      }));

    // Get weekly posts
    const weeklyPosts = getWeeklyPosts()
      .filter(p => !p.isDone) // Only show non-done posts
      .slice(0, 10) // Limit to 10 posts
      .map(p => ({
        id: p.id,
        name: p.author,
        timeRaw: new Date(p.timestamp),
        time: Utilities.formatDate(new Date(p.timestamp), "GMT+7", "HH:mm dd/MM"),
        content: p.content,
        isPinned: p.isPinned,
        type: 'post' // Mark as post
      }));

    // Combine and sort: pinned posts first, then activities
    const combinedFeed = [...weeklyPosts, ...recentActivities]
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const ta = a.timeRaw || new Date(a.time);
        const tb = b.timeRaw || new Date(b.time);
        return tb - ta;
      })
      .slice(0, 12); // Limit total items

    // Count unique projects from Tasks
    const uniqueProjects = [...new Set(tasks.map(t => t[1]))].length;

    // Project-level data: total projects and total budget
    let totalProjects = 0;
    let totalBudget = 0;
    try {
      const projects = getCachedData('projectsData', () => {
        const sheet = ss.getSheetByName('Projects');
        return sheet ? sheet.getDataRange().getValues().slice(1) : [];
      });
      totalProjects = projects.length;
      projects.forEach(p => { totalBudget += parseFloat(p[2]) || 0; });
    } catch (e) {
      totalProjects = uniqueProjects;
      totalBudget = 0;
    }

    // Calculate Workload (Number of tasks per staff member)
    const workloadMap = {};
    tasks.forEach(t => {
      const staff = t[3];
      workloadMap[staff] = (workloadMap[staff] || 0) + 1;
    });

    // Task completion stats
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(r => String(r[6]).toLowerCase() === 'done').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      // projects: legacy count based on tasks, keep for compatibility
      projects: uniqueProjects,
      totalProjects: totalProjects,
      totalBudget: totalBudget,
      equip: inv.filter(r => String(r[4]).toLowerCase() === 'borrowed').length,
      pending: tasks.filter(r => String(r[6]).toLowerCase() === 'todo').length,
      totalTasks: totalTasks,
      completedTasks: completedTasks,
      completionRate: completionRate,
      workload: {
        labels: Object.keys(workloadMap),
        values: Object.values(workloadMap)
      },
      feed: combinedFeed
    };
  } catch (error) {
    Logger.log('Error in getDashboardStats: ' + error.toString());
    throw new Error('Failed to get dashboard stats: ' + error.message);
  }
}

// =============================================================================
// 6. EQUIPMENT LOGIC (AUTOMATED BORROW/RETURN)
// =============================================================================

/**
 * Gets inventory data with current holder information.
 * Creates sample data if sheets don't exist.
 * @returns {Array} Array of inventory items with holder info.
 */
function getInventoryData() {
  try {
    const ss = getSpreadsheet();

    // Ensure Inventory sheet exists and has sample data (only create sample data in dev mode)
    let invSheet = ss.getSheetByName('Inventory');
    let dataCreated = false;
    if (!invSheet) {
      if (isDevMode()) {
        invSheet = ss.insertSheet('Inventory');
        // Add headers according to user's structure: id, name, serial_number, condition, status
        invSheet.appendRow(['id', 'name', 'serial_number', 'condition', 'status']);
        // Add sample data
        const sampleData = [
          ['EQ-001', 'GPS Tracker Pro', 'GPS001', 'Good', 'Available'],
          ['EQ-002', 'Field Radio X1', 'RAD001', 'Excellent', 'Borrowed'],
          ['EQ-003', 'Survey Drone Mini', 'DRN001', 'Good', 'Available'],
          ['EQ-004', 'Weather Station Pro', 'WTH001', 'Fair', 'Available'],
          ['EQ-005', 'Satellite Phone', 'SAT001', 'Good', 'Borrowed'],
          ['EQ-006', 'Thermal Camera', 'THM001', 'Needs Repair', 'Broken'],
          ['EQ-007', 'Field Computer', 'CMP001', 'Excellent', 'Available'],
          ['EQ-008', 'Power Generator 5KW', 'PWR001', 'Good', 'Available']
        ];
        sampleData.forEach(row => invSheet.appendRow(row));
        dataCreated = true;
      } else {
        Logger.log('Inventory sheet missing and DEV_MODE is false — returning empty inventory');
        return [];
      }
    }

    // Ensure BorrowLogs sheet exists
    let logsSheet = ss.getSheetByName('BorrowLogs');
    if (!logsSheet) {
      if (isDevMode()) {
        logsSheet = ss.insertSheet('BorrowLogs');
        // Headers according to user's structure: id, Equip_ID, User_Email, Borrow_Date, Return_Date, Days, Initial_Condition, Return_Condition, Status
        logsSheet.appendRow(['id', 'Equip_ID', 'User_Email', 'Borrow_Date', 'Return_Date', 'Days', 'Initial_Condition', 'Return_Condition', 'Status']);
        // Add sample borrow logs
        logsSheet.appendRow(['LOG-001', 'EQ-002', 'nguyenvana@ctnc.vn', new Date('2024-01-15'), '', '', 'Excellent', '', 'Pending']);
        logsSheet.appendRow(['LOG-002', 'EQ-005', 'tranhib@ctnc.vn', new Date('2024-01-10'), '', '', 'Good', '', 'Pending']);
        dataCreated = true;
      } else {
        Logger.log('BorrowLogs sheet missing and DEV_MODE is false — returning empty borrow logs');
        // Proceed with empty logs
        logsSheet = null;
      }
    }

    // Clear cache if new data was created
    if (dataCreated) {
      clearCache('inventoryData');
      clearCache('borrowLogsData');
    }

    const inv = getCachedData('inventoryData', () => invSheet.getDataRange().getValues().slice(1));
    const logs = getCachedData('borrowLogsData', () => logsSheet.getDataRange().getValues().slice(1));

    return inv.map(r => {
      let holder = "";
      if (r[4] === 'Borrowed') {
        const last = logs.filter(l => l[1] === r[0] && l[8] === 'Pending').pop();
        holder = last ? last[2] : "Unknown";
      }
      return [...r, holder];
    });
  } catch (error) {
    Logger.log('Error in getInventoryData: ' + error.toString());
    throw new Error('Failed to get inventory data: ' + error.message);
  }
}

/**
 * Processes equipment borrowing request.
 * @param {string} equipId - The equipment ID to borrow.
 * @param {string} initCond - The initial condition of the equipment.
 * @returns {string} Success or error message.
 */
function processBorrowing(equipId, initCond) {
  try {
    const user = getCurrentUserInfo();
    const ss = getSpreadsheet();
    const inv = ss.getSheetByName('Inventory');
    const logs = ss.getSheetByName('BorrowLogs');
    const data = inv.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == equipId && data[i][4] === 'Available') {
        // Update inventory: condition (column 4) and status (column 5)
        inv.getRange(i + 1, 4).setValue(initCond); // condition
        inv.getRange(i + 1, 5).setValue('Borrowed'); // status

        // Add to BorrowLogs: id, Equip_ID, User_Email, Borrow_Date, Return_Date, Days, Initial_Condition, Return_Condition, Status
        logs.appendRow([Utilities.getUuid().substring(0,8), equipId, user.email, new Date(), '', '', initCond, '', 'Pending']);

        // Log activity
        logActivity('Borrow', `Borrowed equipment ${equipId}`, user.name);

        // Clear cache
        clearCache('inventoryData');
        clearCache('borrowLogsData');
        return "Equipment borrowed successfully";
      }
    }
    return "Equipment not available or not found";
  } catch (error) {
    Logger.log('Error in processBorrowing: ' + error.toString());
    throw new Error('Failed to process borrowing: ' + error.message);
  }
}

function returnEquipment(equipId, retCond) {
  const ss = getSpreadsheet();
  const inv = ss.getSheetByName('Inventory');
  const logs = ss.getSheetByName('BorrowLogs');
  const logData = logs.getDataRange().getValues();
  const now = new Date();

  for (let j = logData.length - 1; j >= 1; j--) {
    if (logData[j][1] == equipId && logData[j][8] === 'Pending') {
      const days = Math.max(1, Math.ceil((now - new Date(logData[j][3])) / 86400000));
      
      // Update BorrowLogs: Return_Date (col 5), Days (col 6), Return_Condition (col 8), Status (col 9)
      logs.getRange(j + 1, 5).setValue(now); // Return_Date
      logs.getRange(j + 1, 6).setValue(days); // Days
      logs.getRange(j + 1, 8).setValue(retCond); // Return_Condition
      logs.getRange(j + 1, 9).setValue('Confirmed'); // Status
      
      const invData = inv.getDataRange().getValues();
      for (let i = 1; i < invData.length; i++) {
        if (invData[i][0] == equipId) {
          // Update inventory: condition (col 4) and status (col 5)
          inv.getRange(i + 1, 4).setValue(retCond); // condition
          inv.getRange(i + 1, 5).setValue('Available'); // status
          
          // Log activity
          logActivity('Return', `Trả thiết bị ${equipId}`, 'System');
          
          // Clear cache
          clearCache('inventoryData');
          clearCache('borrowLogsData');
          
          break;
        }
      }
      return `Đã nhập kho. Thiết bị mượn trong ${days} ngày.`;
    }
  }
}

// =============================================================================
// 7. BASIC UTILITY FUNCTIONS
// =============================================================================

/**
 * Gets cached tasks data.
 * @returns {Array} Array of task data.
 */
function getTasksData() {
  return getCachedData('tasksData', () => getSpreadsheet().getSheetByName('Tasks').getDataRange().getValues().slice(1));
}

/**
 * Gets cached users data.
 * @returns {Array} Array of user data.
 */
function getUsersData() {
  return getCachedData('usersData', () => getSpreadsheet().getSheetByName('Users').getDataRange().getValues().slice(1));
}

/**
 * Ensure Users sheet exists and includes a coordinator account for testing.
 * Adds sample rows when missing or updates existing entry.
 * @returns {boolean}
 */
function syncUsersSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.appendRow(['id', 'name', 'email', 'role', 'department', 'status', 'username']);
  }
  const data = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === 'son.hatri@ctnc.org.vn') {
      found = true;
      // ensure role is Coordinator
      if (data[i][3] !== 'Coordinator') {
        sheet.getRange(i + 1, 4).setValue('Coordinator');
      }
      break;
    }
  }
  if (!found) {
    sheet.appendRow(['USR-' + Utilities.getUuid().substring(0,8), 'Ha Tri Son', 'son.hatri@ctnc.org.vn', 'Coordinator', '', 'Active', 'son.hatri']);
  }
  clearCache('usersData');
  return true;
}

/**
 * Adds a record to the specified sheet.
 * @param {string} sheetName - The name of the sheet.
 * @param {Array} rowData - The data to add.
 * @returns {string} Success message with ID.
 */
function addRecord(sheetName, rowData) {
  try {
    const s = getSpreadsheet().getSheetByName(sheetName);
    const id = sheetName.substring(0,3).toUpperCase() + "-" + Utilities.formatDate(new Date(), "GMT+7", "HHmmss");
    s.appendRow([id, ...rowData]);
    return "Record added successfully: " + id;
  } catch (error) {
    Logger.log('Error in addRecord: ' + error.toString());
    throw new Error('Failed to add record: ' + error.message);
  }
}

/**
 * Adds a new user to the system.
 * @param {Array} rowData - The user data to add.
 * @returns {string} Success message.
 */
function addUser(rowData) {
  try {
    const currentUser = getCurrentUserInfo();
    requireRole('Admin');
    const s = getSpreadsheet().getSheetByName('Users');
    const id = "USR-" + Utilities.formatDate(new Date(), "GMT+7", "HHmmss");
    s.appendRow([id, ...rowData]);

    // Log activity
    logActivity('User', `Added new staff: ${rowData[0]}`, currentUser.name);

    clearCache('usersData');
    return "Staff added: " + rowData[0];
  } catch (error) {
    Logger.log('Error in addUser: ' + error.toString());
    throw new Error('Failed to add user: ' + error.message);
  }
}

/**
 * Adds a new project to the system.
 * @param {Array} rowData - The project data: [title, budget, startDate, endDate, leadId].
 * @returns {string} Success message.
 */
function addProject(rowData) {
  try {
    const currentUser = getCurrentUserInfo();
    // Allow Coordinators and Admins to create projects
    requireRole('Coordinator');
    const ss = getSpreadsheet();

    // Ensure Projects sheet exists
    let sheet = ss.getSheetByName('Projects');
    if (!sheet) {
      sheet = ss.insertSheet('Projects');
      // Add headers: id, title, budget, start_date, end_date, lead_id
      sheet.appendRow(['id', 'title', 'budget', 'start_date', 'end_date', 'lead_id']);
    }

    // Data from front-end: [title, budget(string|number), startDate(string), endDate(string), leadId]
    const [title, budgetInput, startDateInput, endDateInput, leadId] = rowData;
    const budget = Number(budgetInput) || 0;

    // Validate inputs
    if (!title || !leadId) {
      throw new Error('Title and Project Lead are required');
    }
    if (budget <= 0) {
      throw new Error('Budget must be a positive number');
    }
    const startDate = new Date(startDateInput);
    const endDate = new Date(endDateInput);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error('Invalid start or end date');
    }
    if (startDate > endDate) {
      throw new Error('Start date must be before or equal to End date');
    }

    // Verify lead exists and is active in Users sheet (if Users sheet present)
    try {
      const usersSheet = ss.getSheetByName('Users');
      if (usersSheet) {
        const users = usersSheet.getDataRange().getValues().slice(1);
        const leadRow = users.find(r => r[0] === leadId);
        if (!leadRow) throw new Error('Selected project lead not found');
        const status = (leadRow[5] || '').toString().toLowerCase();
        if (status === 'inactive' || status === 'disabled') throw new Error('Selected project lead is not active');
      }
    } catch (e) {
      // If users lookup fails, proceed but warn in logs
      Logger.log('Warning while validating lead: ' + e.toString());
    }

    const id = "PRJ-" + Utilities.formatDate(new Date(), "GMT+7", "HHmmss");
    const finalRow = [id, title, budget, startDate, endDate, leadId];
    sheet.appendRow(finalRow);

    // Log activity
    logActivity('Project', `Created new project: ${title}`, currentUser.name);

    // Clear cache for projects data
    clearCache('projectsData');

    return "Project created successfully: " + title;
  } catch (error) {
    Logger.log('Error in addProject: ' + error.toString());
    throw new Error('Failed to add project: ' + error.message);
  }
}

/**
 * Gets projects data with lead information.
 * @returns {Array} Array of project data with lead names.
 */
function getProjectsData() {
  try {
    const ss = getSpreadsheet();

    // Ensure Projects sheet exists with sample data (only in dev mode)
    let sheet = ss.getSheetByName('Projects');
    if (!sheet) {
      if (isDevMode()) {
        sheet = ss.insertSheet('Projects');
        // Add headers
        sheet.appendRow(['id', 'title', 'budget', 'start_date', 'end_date', 'lead_id']);
        // Add sample data
        const sampleData = [
          ['PRJ-001', 'GPS Mapping Project', 50000, new Date('2024-02-01'), new Date('2024-06-30'), 'USR-001'],
          ['PRJ-002', 'Field Survey Equipment', 75000, new Date('2024-03-15'), new Date('2024-08-15'), 'USR-002'],
          ['PRJ-003', 'Data Analysis System', 30000, new Date('2024-01-20'), new Date('2024-05-20'), 'USR-003']
        ];
        sampleData.forEach(row => sheet.appendRow(row));
      } else {
        Logger.log('Projects sheet missing and DEV_MODE is false — returning empty projects');
        return [];
      }
    }

    const projects = getCachedData('projectsData', () => sheet.getDataRange().getValues().slice(1));
    const users = getCachedData('usersData', () => {
      const userSheet = ss.getSheetByName('Users');
      return userSheet ? userSheet.getDataRange().getValues().slice(1) : [];
    });

    // Return projects data (6 columns: id, title, budget, start_date, end_date, lead_id)
    return projects;
  } catch (error) {
    Logger.log('Error in getProjectsData: ' + error.toString());
    throw new Error('Failed to get projects data: ' + error.message);
  }
}

/**
 * Gets detailed information for a specific project.
 * @param {string} projectId - The project ID to get details for.
 * @returns {Object} Project details object.
 */
function getProjectDetails(projectId) {
  try {
    const projects = getProjectsData();
    const project = projects.find(p => p[0] === projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    const [id, title, budget, startDate, endDate, leadId] = project;
    // Try to resolve leadName from Users sheet if available
    let leadName = '';
    try {
      const users = getUsersData();
      const leadRow = users.find(u => u[0] === leadId);
      if (leadRow) leadName = leadRow[1] || '';
    } catch (e) {
      leadName = '';
    }
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate progress
    let status = 'upcoming';
    let progress = 0;

    if (now < start) {
      status = 'upcoming';
      progress = 0;
    } else if (now <= end) {
      status = 'active';
      const totalDuration = end - start;
      const elapsed = now - start;
      progress = Math.round((elapsed / totalDuration) * 100);
    } else {
      status = 'completed';
      progress = 100;
    }

    return {
      id: id,
      title: title,
      budget: budget,
      startDate: startDate,
      endDate: endDate,
      leadId: leadId,
      leadName: leadName,
      progress: progress,
      status: status
    };
  } catch (error) {
    Logger.log('Error in getProjectDetails: ' + error.toString());
    throw new Error('Failed to get project details: ' + error.message);
  }
}

// =========================================================
// 6. LOGIC MỚI: QUẢN LÝ NHIỆM VỤ & KHÓA NHÂN SỰ
// =========================================================

/**
 * Lấy danh sách nhân sự và kiểm tra chi tiết trạng thái
 * Trả về: Tên, Role, Email, Trạng thái bận (kèm tên task, người giao, deadline)
 */
function getStaffAvailability() {
  const taskData = getCachedData('tasksDataFull', () => getSpreadsheet().getSheetByName('Tasks').getDataRange().getValues());
  const userData = getCachedData('usersData', () => getSpreadsheet().getSheetByName('Users').getDataRange().getValues());
  
  const tasks = taskData.length > 1 ? taskData.slice(1) : [];
  const users = userData.length > 1 ? userData.slice(1) : [];
  const now = new Date();

  return users.map(u => {
    // Tìm task đang làm (chưa Done) của user này
    // Tasks: id[0], pj[1], title[2], assigned_to[3], priority[4], deadline[5], status[6], created_by[7]
    const activeTask = tasks.find(t => t[3] === u[1] && t[6] !== 'Done');
    
    let busyInfo = null;
    if (activeTask) {
      // Tính số ngày còn lại đến deadline
      const deadline = new Date(activeTask[5]);
      const diffTime = deadline - now;
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      busyInfo = {
        taskName: activeTask[2],
        assigner: activeTask[7] || "System", // Cột H: Người giao
        daysLeft: daysLeft
      };
    }

    return {
      name: u[1], // Cột B Name
      role: u[2], // Cột C Role
      email: u[5], // Cột F Email (Theo cấu trúc chuẩn)
      isBusy: !!activeTask,
      busyDetails: busyInfo
    };
  });
}

/**
 * Adds a new task with locking mechanism, assigner tracking, and email notification.
 * @param {Array} rowData - Task data from client: [pj_id, title, assigned_to, priority, deadline, status].
 * @returns {string} Success message.
 */
function addTaskWithLock(rowData) {
  try {
    // rowData from client: [pj_id, title, assigned_to, priority, deadline, status]
    const assignedTo = rowData[2];
    const currentUser = getCurrentUserInfo(); // Get current user
    // Require that the caller is at least a coordinator or Admin
    requireRole('Coordinator');

    // 1. Check status again (Server side validation)
    const staffList = getStaffAvailability();
    const staffMember = staffList.find(s => s.name === assignedTo);

    if (staffMember && staffMember.isBusy) {
      throw new Error(`CANNOT ASSIGN: ${assignedTo} is busy with task "${staffMember.busyDetails.taskName}". Please wait for completion.`);
    }

    // 2. Add to Sheet (Add ID and CreatedBy at the end)
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Tasks');
    const id = "TSK-" + Utilities.formatDate(new Date(), "GMT+7", "HHmmss");

    // Row to save in sheet: [ID, ...ClientData, CreatedBy]
    // ClientData: [pj_id, title, assigned_to, priority, deadline, status]
    const finalRow = [id, ...rowData, currentUser.name];
    sheet.appendRow(finalRow);

    // Log activity
    logActivity('Task', `New task: "${rowData[1]}" assigned to ${assignedTo}`, currentUser.name);

    // Clear cache for updated data
    clearCache('tasksData');
    clearCache('tasksDataFull');

    // 3. Send notification email
    try {
      if (staffMember && staffMember.email) {
        const subject = `[CTNC] New Task: ${rowData[1]}`;
        const body = `
          Hello ${assignedTo},

          You have been assigned a new task in the system.

          📌 Task: ${rowData[1]}
          📂 Project/Context: ${rowData[0]}
          📅 Deadline: ${rowData[4]}
          ⚡ Priority: ${rowData[3]}
          👤 Assigned by: ${currentUser.name}

          Please check the Dashboard to update progress.
          Best regards,
          CTNC Management System
        `;
        MailApp.sendEmail({to: staffMember.email, subject: subject, body: body});
      }
    } catch (e) {
      Logger.log("Email sending error: " + e.toString()); // Don't block process if email fails
    }

    return `Task assigned to ${assignedTo} & notification sent successfully!`;
  } catch (error) {
    Logger.log('Error in addTaskWithLock: ' + error.toString());
    throw new Error('Failed to add task: ' + error.message);
  }
}

/**
 * Admin xác nhận hoàn thành Task
 */
function confirmTaskCompletion(taskId) {
  requireRole('Admin');
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) { 
      sheet.getRange(i + 1, 7).setValue("Done");
      
      // Log activity
      logActivity('Task Complete', `Hoàn thành nhiệm vụ ${taskId}`, 'Admin');
      
      // Clear cache
      clearCache('tasksData');
      clearCache('tasksDataFull');
      
      return "Đã Confirm hoàn thành! Nhân sự đã sẵn sàng cho nhiệm vụ mới.";
    }
  }
  throw new Error("Lỗi: Không tìm thấy Task ID.");
}

/**
 * Posts a weekly update.
 * @param {string} content - The post content.
 * @param {boolean} isPinned - Whether the post is pinned.
 * @param {string} userName - The author of the post.
 */
function postWeeklyUpdate(content, isPinned, userName) {
  try {
    requireRole('Coordinator');
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('WeeklyPosts');
    if (!sheet) {
      sheet = ss.insertSheet('WeeklyPosts');
      sheet.appendRow(['ID', 'Content', 'Author', 'Timestamp', 'IsPinned', 'IsDone']);
    }

    const id = "POST-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMddHHmmss");
    sheet.appendRow([id, content, userName, new Date(), isPinned, false]);

    // Log activity
    logActivity('Post', `Posted update: ${content.substring(0, 50)}...`, userName);

    // Clear cache
    clearCache('weeklyPostsData');
  } catch (error) {
    Logger.log('Error in postWeeklyUpdate: ' + error.toString());
    throw new Error('Failed to post weekly update: ' + error.message);
  }
}

function getWeeklyPosts() {
  return getCachedData('weeklyPostsData', () => {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('WeeklyPosts');
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues().slice(1);
    return data.map(row => ({
      id: row[0],
      content: row[1],
      author: row[2],
      timestamp: row[3],
      isPinned: row[4],
      isDone: row[5]
    })).sort((a, b) => {
      // Pinned posts first, then by timestamp desc
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
  });
}

function togglePostPin(postId) {
  requireRole('Coordinator');
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('WeeklyPosts');
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === postId) {
      const currentPin = data[i][4];
      sheet.getRange(i + 1, 5).setValue(!currentPin);
      break;
    }
  }
  
  clearCache('weeklyPostsData');
}

function markPostAsDone(postId) {
  requireRole('Coordinator');
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('WeeklyPosts');
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === postId) {
      sheet.getRange(i + 1, 6).setValue(true);
      break;
    }
  }
  
  clearCache('weeklyPostsData');
}