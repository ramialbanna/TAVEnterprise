function setupTAVListingsTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "Listings";
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    Logger.log("Created new sheet: " + sheetName);
  } else {
    Logger.log("Sheet already exists: " + sheetName);
  }

  var headers = [
    "listing_id",
    "title",
    "price",
    "year",
    "make",
    "model",
    "mileage",
    "vin",
    "location_city",
    "location_state",
    "seller_name",
    "listing_url",
    "photo_url",
    "listed_at",
    "scraped_at",
    "source_task",
    "is_live",
    "is_sold",
    "mmr",
    "mmr_adjusted",
    "mmr_source",
    "mmr_confidence",
    "deal_grade",
    "mmr_outcome"
  ];

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#4A90D9");
  headerRange.setFontColor("#FFFFFF");

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  Logger.log("Headers written. Sheet is ready for Make.com appends.");
  SpreadsheetApp.getUi().alert("TAV Listings tab is ready!\n\n24 columns written to row 1.\nNow import the Make.com blueprint and wire up the Google Sheets connection.");
}
