/**
 * @file Code.gs
 * @description Google Apps Script functions for Web App.
 * Manages interactions with Google Sheets (CRUD operations),
 * serves HTML, and handles file inclusions.
 */

// Global variable for the Google Sheet ID (replace with your actual Sheet ID)
// หากต้องการใช้งาน ให้แทนที่ 'YOUR_SPREADSHEET_ID_HERE' ด้วย ID ของ Google Sheet ของคุณ
const SPREADSHEET_ID = '1Bo5YgT0WydyLJ9TI2TBeYXaLEqNIyRAjNOKtLgeuh6A'; 
const SHEET_NAME = 'CA'; // ชื่อชีทที่ใช้เก็บข้อมูล

/**
 * Serves the HTML content of the web application.
 * This function is called when the web app is accessed.
 * @returns {HtmlOutput} The HTML output to be displayed in the browser.
 */
function doGet() {
  Logger.log('doGet function called.');
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('CA Request') // ตั้งชื่อ Title ของ Web App
    .setFaviconUrl('https://raw.githubusercontent.com/dmcapps/google-sheets-web-app/main/img/favicon.png') // เพิ่ม Favicon
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0'); // ทำให้ Responsive
}

/**
 * Helper function to include external CSS/JS files into the HTML.
 * This keeps the HTML file clean and organized.
 * @param {string} filename The name of the file to include (e.g., 'style' for style.html).
 * @returns {string} The content of the specified file.
 */
function include(filename) {
  Logger.log(`Including file: ${filename}`);
  // Use createHtmlOutputFromFile().getContent() for HTML files containing CSS/JS
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Processes form data for creating new records or updating existing ones in Google Sheets.
 * @param {Object} formData An object containing form field data.
 * @returns {Object} A status object with success/error message and data.
 */
function processForm(formData) {
  Logger.log('processForm function called with data:');
  Logger.log(JSON.stringify(formData));

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.error(`Sheet named '${SHEET_NAME}' not found.`);
    return { success: false, message: `ไม่พบชีท '${SHEET_NAME}' โปรดตรวจสอบชื่อชีทใน Google Sheets.` };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getDataRange().getValues();
  const email = Session.getActiveUser().getEmail(); // Get current user's email

  try {
    let rowToUpdate = -1;
    if (formData.id) { // If formData.id exists, it's an update operation
      rowToUpdate = parseInt(formData.id); // rowToUpdate is the actual row index (1-based)
      Logger.log(`Attempting to update row: ${rowToUpdate}`);
      if (rowToUpdate < 2 || rowToUpdate > data.length) {
        throw new Error(`Row ID ${rowToUpdate} ไม่ถูกต้องสำหรับการอัปเดต.`);
      }
    }

    const newRecord = {};
    const now = new Date();
    const timeZone = ss.getSpreadsheetTimeZone();

    // Auto-fill Auditor email
    newRecord['Auditor email'] = email;

    // Generate/Validate Date and Number only for new records
    if (rowToUpdate === -1) {
      newRecord['Date'] = Utilities.formatDate(now, timeZone, "d-MMM-yyyy");
      newRecord['number'] = generateNextNumber(sheet, data);
    } else {
      // For updates, retain existing Date and Number from the sheet
      // Ensure the correct column index is used to retrieve existing values
      const existingRow = data[rowToUpdate - 1]; // data is 0-indexed, rowToUpdate is 1-indexed
      const dateColIndex = headers.indexOf('Date');
      const numberColIndex = headers.indexOf('number');

      if (dateColIndex === -1 || numberColIndex === -1) {
          throw new Error('ไม่พบหัวข้อ "Date" หรือ "number" ในชีท Google Sheets. โปรดตรวจสอบโครงสร้างชีท.');
      }
      
      newRecord['Date'] = Utilities.formatDate(existingRow[dateColIndex], timeZone, "d-MMM-yyyy");
      newRecord['number'] = existingRow[numberColIndex];
    }

    // Populate other fields from formData
    headers.forEach(header => {
      if (header !== 'Date' && header !== 'number' && header !== 'Auditor email' && header !== 'Update') {
        newRecord[header] = formData[header] || '';
      }
    });

    // Auto-fill Update timestamp
    newRecord['Update'] = Utilities.formatDate(now, timeZone, "d-MMM-yyyy HH:mm:ss");

    const rowValues = headers.map(header => newRecord[header]);

    if (rowToUpdate === -1) {
      // Add new row
      sheet.appendRow(rowValues);
      Logger.log('New record added successfully.');
      return { success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว!', data: newRecord };
    } else {
      // Update existing row
      sheet.getRange(rowToUpdate, 1, 1, rowValues.length).setValues([rowValues]);
      Logger.log(`Record updated in row ${rowToUpdate} successfully.`);
      return { success: true, message: 'อัปเดตข้อมูลเรียบร้อยแล้ว!', data: newRecord };
    }

  } catch (e) {
    Logger.error(`Error processing form: ${e.message}`);
    return { success: false, message: `เกิดข้อผิดพลาดในการบันทึกข้อมูล: ${e.message}` };
  }
}

/**
 * Generates the next sequential number for a new request based on the current year.
 * Format: CA-YY/XXX (e.g., CA-24/001, CA-25/001).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The Google Sheet object.
 * @param {Array<Array<any>>} data All data from the sheet.
 * @returns {string} The next generated number.
 */
function generateNextNumber(sheet, data) {
  Logger.log('Generating next number...');
  const currentYear = new Date().getFullYear() % 100; // Get last two digits of current year
  let maxNum = 0;

  // Find the 'number' column index
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const numberColIndex = headers.indexOf('number');

  if (numberColIndex === -1) {
    throw new Error('ไม่พบหัวข้อ "number" ในชีท Google Sheets ของคุณ. โปรดตรวจสอบโครงสร้างชีท.');
  }

  if (data.length > 1) { // If there's more than just the header row
    for (let i = 1; i < data.length; i++) { // Start from second row (index 1)
      const numString = data[i][numberColIndex];
      if (typeof numString === 'string' && numString.startsWith(`CA-${currentYear}/`)) {
        const parts = numString.split('/');
        if (parts.length === 2) {
          const num = parseInt(parts[1]);
          if (!isNaN(num)) {
            maxNum = Math.max(maxNum, num);
          }
        }
      }
    }
  }

  const nextNum = maxNum + 1;
  const formattedNextNum = String(nextNum).padStart(3, '0');
  const result = `CA-${currentYear}/${formattedNextNum}`;
  Logger.log(`Next generated number: ${result}`);
  return result;
}

/**
 * Fetches all records from the Google Sheet.
 * @returns {Object} An object containing headers and all data rows.
 */
function getAllRecords() {
  Logger.log('Fetching all records...');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.error(`Sheet named '${SHEET_NAME}' not found.`);
    return { success: false, message: `ไม่พบชีท '${SHEET_NAME}' โปรดตรวจสอบชื่อชีทใน Google Sheets.` };
  }

  const range = sheet.getDataRange();
  const values = range.getValues();

  if (values.length === 0) {
    Logger.log('No data found in the sheet.');
    // Return empty headers if only header row exists
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return { success: true, headers: headers, records: [] };
  }

  const headers = values[0];
  const records = values.slice(1).map((row, index) => {
    const record = {};
    headers.forEach((header, colIndex) => {
      record[header] = row[colIndex];
    });
    // Add row index for client-side reference (for update/delete)
    record.id = index + 2; // +2 because headers are row 1, and array is 0-indexed.
    return record;
  });

  Logger.log(`Fetched ${records.length} records.`);
  return { success: true, headers: headers, records: records };
}

/**
 * Deletes a record from the Google Sheet by row index.
 * @param {number} rowId The 1-based row index of the record to delete.
 * @returns {Object} A status object with success/error message.
 */
function deleteRecord(rowId) {
  Logger.log(`deleteRecord function called for rowId: ${rowId}`);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.error(`Sheet named '${SHEET_NAME}' not found.`);
    return { success: false, message: `ไม่พบชีท '${SHEET_NAME}' โปรดตรวจสอบชื่อชีทใน Google Sheets.` };
  }

  if (rowId < 2 || rowId > sheet.getLastRow()) {
    Logger.error(`Invalid row ID for deletion: ${rowId}`);
    return { success: false, message: 'รหัสแถวไม่ถูกต้องสำหรับการลบ.' };
  }

  try {
    sheet.deleteRow(rowId);
    Logger.log(`Row ${rowId} deleted successfully.`);
    return { success: true, message: 'ลบข้อมูลเรียบร้อยแล้ว!' };
  } catch (e) {
    Logger.error(`Error deleting record in row ${rowId}: ${e.message}`);
    return { success: false, message: `เกิดข้อผิดพลาดในการลบข้อมูล: ${e.message}` };
  }
}

/**
 * Initializes the web app with required data (Auditor Email, Date, Next Number).
 * @returns {Object} An object containing initial data.
 */
function getInitialAppData() {
  Logger.log('getInitialAppData function called.');
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      Logger.error(`Sheet named '${SHEET_NAME}' not found.`);
      return {
        auditorEmail: Session.getActiveUser().getEmail(),
        currentDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "d-MMM-yyyy"),
        nextNumber: 'N/A', // Placeholder if sheet not found
        success: false,
        message: `ไม่พบชีท '${SHEET_NAME}' โปรดตรวจสอบชื่อชีทใน Google Sheets.`
      };
    }

    const data = sheet.getDataRange().getValues();
    const nextNum = generateNextNumber(sheet, data);

    return {
      auditorEmail: Session.getActiveUser().getEmail(),
      currentDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "d-MMM-yyyy"),
      nextNumber: nextNum,
      success: true
    };
  } catch (e) {
    Logger.error(`Error in getInitialAppData: ${e.message}`);
    return {
      auditorEmail: Session.getActiveUser().getEmail(), // Still try to get email
      currentDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "d-MMM-yyyy"),
      nextNumber: 'N/A (Error)',
      success: false,
      message: `เกิดข้อผิดพลาดในการโหลดข้อมูลเริ่มต้น: ${e.message}`
    };
  }
}

