// ══════════════════════════════════════════════════════════════════
//  APPS SCRIPT — Lead Generator for BBE
//  Paste this entire code into your Google Sheet's Apps Script editor.
//  Then deploy as Web App (see setup instructions below).
// ══════════════════════════════════════════════════════════════════

/**
 * Handles POST requests from the Node.js scraper.
 * Receives lead data and writes it to the active sheet.
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === 'addLeads') {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
      
      // Write headers if sheet is empty
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(data.headers);
        
        // Style the header row
        const headerRange = sheet.getRange(1, 1, 1, data.headers.length);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#1a73e8');
        headerRange.setFontColor('#ffffff');
        headerRange.setHorizontalAlignment('center');
        
        // Freeze header row
        sheet.setFrozenRows(1);
      }
      
      // Append each lead as a new row
      const rows = data.data;
      for (let i = 0; i < rows.length; i++) {
        sheet.appendRow(rows[i]);
      }
      
      // Auto-resize columns
      for (let col = 1; col <= data.headers.length; col++) {
        sheet.autoResizeColumn(col);
      }
      
      // Color-code the Chance column (last column)
      const lastRow = sheet.getLastRow();
      const chanceCol = data.headers.length; // Last column
      const scoreCol = data.headers.length - 1; // Second to last
      
      for (let row = 2; row <= lastRow; row++) {
        const chance = sheet.getRange(row, chanceCol).getValue();
        const score = sheet.getRange(row, scoreCol).getValue();
        
        // Color Chance column
        if (chance === 'High') {
          sheet.getRange(row, chanceCol).setBackground('#d4edda').setFontColor('#155724');
        } else if (chance === 'Medium') {
          sheet.getRange(row, chanceCol).setBackground('#fff3cd').setFontColor('#856404');
        } else {
          sheet.getRange(row, chanceCol).setBackground('#f8d7da').setFontColor('#721c24');
        }
        
        // Color Lead Score column
        if (score >= 4) {
          sheet.getRange(row, scoreCol).setBackground('#d4edda').setFontColor('#155724');
        } else if (score >= 2) {
          sheet.getRange(row, scoreCol).setBackground('#fff3cd').setFontColor('#856404');
        } else {
          sheet.getRange(row, scoreCol).setBackground('#f8d7da').setFontColor('#721c24');
        }
      }
      
      return ContentService
        .createTextOutput(JSON.stringify({ 
          success: true, 
          message: `Added ${rows.length} leads`,
          totalRows: lastRow 
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles GET requests (for testing).
 * Visit the deployed URL in a browser to test.
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ 
      status: 'ok', 
      message: 'Lead Generator API is running! Use POST to send data.' 
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Optional: Menu item to clear all leads from the sheet.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏪 Lead Generator')
    .addItem('Clear All Leads', 'clearLeads')
    .addItem('Add Sample Lead (Test)', 'addSampleLead')
    .addToUi();
}

function clearLeads() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  sheet.clear();
  SpreadsheetApp.getUi().alert('All leads cleared!');
}

function addSampleLead() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  
  // Add headers if empty
  if (sheet.getLastRow() === 0) {
    const headers = [
      'Company Name', 'Website', 'Email', 'Country', 'City',
      'Business Type', 'Product Style', 'Target Audience',
      'Instagram', 'Phone', 'Notes', 'Lead Score', 'Chance'
    ];
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1a73e8');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  
  // Add sample data
  sheet.appendRow([
    'Sample Decor Co', 'https://example.com', 'hello@example.com',
    'USA', 'New York', 'Home Decor Store', 'Handmade, Boho',
    'Premium Buyers', 'https://instagram.com/sample', '+1-555-0123',
    'Premium handmade home decor boutique', 5, 'High'
  ]);
  
  SpreadsheetApp.getUi().alert('Sample lead added! Check Sheet1.');
}
