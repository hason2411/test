/**
 * CTNC Financial Reports Diagnostic & Test Utility
 * Use these functions to diagnose and test the financial report system
 */

/**
 * Diagnostic function to check system health
 * @returns {Object} Diagnostic results
 */
function diagnosticCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    sheets: {},
    data: {},
    errors: []
  };
  
  try {
    const ss = getSpreadsheet();
    
    // Check if all required sheets exist
    const requiredSheets = ['Projects', 'Users', 'FinancialReports', 'InvoiceProjects', 'Tasks'];
    requiredSheets.forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      results.sheets[sheetName] = sheet ? 'EXISTS' : 'MISSING';
    });
    
    // Check data counts
    try {
      const projects = getProjectsData();
      results.data.projectCount = projects.length;
      Logger.log(`Projects: ${projects.length}`);
    } catch (e) {
      results.errors.push(`Error reading Projects: ${e.message}`);
    }
    
    try {
      const invoices = getFinancialReports();
      results.data.invoiceCount = invoices.length;
      Logger.log(`Invoices: ${invoices.length}`);
    } catch (e) {
      results.errors.push(`Error reading FinancialReports: ${e.message}`);
    }
    
    try {
      const links = getProjectFinancialReports(projects.length > 0 ? projects[0][0] : 'TEST');
      results.data.linkSampleCount = links.length;
      Logger.log(`Sample links: ${links.length}`);
    } catch (e) {
      results.errors.push(`Error reading links: ${e.message}`);
    }
    
    // Test type coercion
    results.typeCoercionTest = {
      stringComparison: String("123") === String(123),
      numberComparison: Number("456") === 456
    };
    
    Logger.log('Diagnostic Results: ' + JSON.stringify(results));
    return results;
  } catch (error) {
    results.errors.push(`Fatal error: ${error.message}`);
    Logger.log('Fatal diagnostic error: ' + error.toString());
    return results;
  }
}

/**
 * Initialize system with sample data for testing
 * Call this to populate the system with test data
 */
function initializeSampleData() {
  try {
    const currentUser = getCurrentUserInfo();
    
    // Get or create Projects sheet
    let projects = [];
    try {
      projects = getProjectsData();
    } catch (e) {
      Logger.log('Creating sample projects...');
      const ss = getSpreadsheet();
      let sheet = ss.getSheetByName('Projects');
      if (!sheet) {
        sheet = ss.insertSheet('Projects');
        sheet.appendRow(['id', 'title', 'budget', 'start_date', 'end_date', 'lead_id', 'description', 'status']);
      }
      
      // Add sample projects
      const projectIds = ['PROJ-001', 'PROJ-002', 'PROJ-003'];
      const projectNames = ['Q1 Infrastructure Upgrade', 'Community Outreach 2024', 'Training Program Development'];
      const budgets = [50000, 30000, 25000];
      
      for (let i = 0; i < projectIds.length; i++) {
        sheet.appendRow([
          projectIds[i],
          projectNames[i],
          budgets[i],
          new Date(),
          new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000),
          currentUser.id,
          `Sample project for testing`,
          'Active'
        ]);
      }
      
      projects = getProjectsData();
    }
    
    // Get or create FinancialReports sheet
    let invoices = [];
    try {
      invoices = getFinancialReports();
    } catch (e) {
      Logger.log('Creating sample invoices...');
      const ss = getSpreadsheet();
      let sheet = ss.getSheetByName('FinancialReports');
      if (!sheet) {
        sheet = ss.insertSheet('FinancialReports');
        sheet.appendRow(['id', 'invoice_number', 'vendor', 'amount', 'date', 'category', 'description', 'status']);
      }
      
      // Add sample invoices
      const invoiceNumbers = ['INV-2024-001', 'INV-2024-002', 'INV-2024-003', 'INV-2024-004', 'INV-2024-005'];
      const vendors = ['Tech Solutions Inc', 'Office Supplies Ltd', 'Training Services Co', 'Consulting Group', 'Equipment Vendor'];
      const amounts = [12000, 5000, 8000, 15000, 6000];
      const categories = ['Equipment', 'Supplies', 'Services', 'Consulting', 'Equipment'];
      
      for (let i = 0; i < invoiceNumbers.length; i++) {
        sheet.appendRow([
          `INV-SAM-${i + 1}`,
          invoiceNumbers[i],
          vendors[i],
          amounts[i],
          new Date(),
          categories[i],
          `Sample invoice for testing project allocation`,
          'Pending'
        ]);
      }
      
      invoices = getFinancialReports();
    }
    
    // Link some invoices to projects
    try {
      const ss = getSpreadsheet();
      let linkSheet = ss.getSheetByName('InvoiceProjects');
      if (!linkSheet) {
        linkSheet = ss.insertSheet('InvoiceProjects');
        linkSheet.appendRow(['id', 'invoice_id', 'project_id', 'cost_allocation', 'linked_date']);
      } else {
        const existingData = linkSheet.getDataRange().getValues();
        if (existingData.length <= 1) {
          // Sheet is empty except header, add sample links
          Logger.log('Adding sample invoice-project links...');
          linkInvoiceToProject(projects[0][0], invoices[0][0], 10000);
          linkInvoiceToProject(projects[0][0], invoices[1][0], 5000);
          linkInvoiceToProject(projects[1][0], invoices[2][0], 8000);
          linkInvoiceToProject(projects[1][0], invoices[3][0], 15000);
          linkInvoiceToProject(projects[2][0], invoices[4][0], 6000);
        }
      }
    } catch (e) {
      Logger.log('Skipping link initialization: ' + e.message);
    }
    
    Logger.log('Sample data initialization complete');
    return {
      success: true,
      projectsCount: projects.length,
      invoicesCount: invoices.length,
      message: 'Sample data initialized successfully'
    };
  } catch (error) {
    Logger.log('Error in initializeSampleData: ' + error.toString());
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Test the complete workflow
 * This tests:
 * 1. Creating invoices
 * 2. Linking them to projects
 * 3. Exporting reports
 */
function testCompleteWorkflow() {
  const results = {
    timestamp: new Date().toISOString(),
    tests: {}
  };
  
  try {
    // Test 1: Get projects
    const projects = getProjectsData();
    results.tests.getProjects = projects.length > 0 ? 'PASS' : 'FAIL - No projects found';
    Logger.log(`Test 1 (getProjects): ${results.tests.getProjects}`);
    
    if (projects.length === 0) {
      return { ...results, error: 'No projects found. Run initializeSampleData() first.' };
    }
    
    // Test 2: Get invoices
    const invoices = getFinancialReports();
    results.tests.getInvoices = invoices.length > 0 ? 'PASS' : 'FAIL - No invoices found';
    Logger.log(`Test 2 (getInvoices): ${results.tests.getInvoices}`);
    
    if (invoices.length === 0) {
      return { ...results, error: 'No invoices found. Run initializeSampleData() first.' };
    }
    
    // Test 3: Get project reports
    try {
      const projectReports = getProjectFinancialReports(projects[0][0]);
      results.tests.getProjectReports = 'PASS';
      results.projectReportsCount = projectReports.length;
      Logger.log(`Test 3 (getProjectReports): PASS - Found ${projectReports.length} linked invoices`);
    } catch (e) {
      results.tests.getProjectReports = `FAIL - ${e.message}`;
      Logger.log(`Test 3 (getProjectReports): ${results.tests.getProjectReports}`);
    }
    
    // Test 4: Export invoices CSV
    try {
      const invoicesCsv = exportInvoicesAsCSV();
      results.tests.exportInvoicesCsv = invoicesCsv && invoicesCsv.length > 0 ? 'PASS' : 'FAIL - Empty CSV';
      results.invoicesCsvLength = invoicesCsv ? invoicesCsv.length : 0;
      Logger.log(`Test 4 (exportInvoicesCsv): PASS - ${invoicesCsv.length} bytes`);
    } catch (e) {
      results.tests.exportInvoicesCsv = `FAIL - ${e.message}`;
      Logger.log(`Test 4 (exportInvoicesCsv): ${results.tests.exportInvoicesCsv}`);
    }
    
    // Test 5: Export project reports CSV
    try {
      const projectCsv = exportProjectFinancialReportsAsCSV(projects[0][0]);
      results.tests.exportProjectCsv = projectCsv && projectCsv.length > 0 ? 'PASS' : 'FAIL - Empty CSV';
      results.projectCsvLength = projectCsv ? projectCsv.length : 0;
      Logger.log(`Test 5 (exportProjectCsv): PASS - ${projectCsv.length} bytes`);
    } catch (e) {
      results.tests.exportProjectCsv = `FAIL - ${e.message}`;
      Logger.log(`Test 5 (exportProjectCsv): ${results.tests.exportProjectCsv}`);
    }
    
    // Test 6: Get invoice summary
    try {
      const summary = getInvoiceSummary();
      results.tests.getInvoiceSummary = summary && summary.length > 0 ? 'PASS' : 'FAIL - Empty summary';
      results.invoiceSummaryCount = summary ? summary.length : 0;
      Logger.log(`Test 6 (getInvoiceSummary): PASS - ${summary.length} invoices in summary`);
    } catch (e) {
      results.tests.getInvoiceSummary = `FAIL - ${e.message}`;
      Logger.log(`Test 6 (getInvoiceSummary): ${results.tests.getInvoiceSummary}`);
    }
    
    Logger.log('Workflow test complete: ' + JSON.stringify(results));
    return results;
  } catch (error) {
    Logger.log('Fatal error in testCompleteWorkflow: ' + error.toString());
    return { ...results, fatalError: error.message };
  }
}
