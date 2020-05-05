/**
 *  Simple Event Logger - Google Script Code v 1.5
 *
 *  Author: 
 *    Kevin LaFramboise (krlaframboise)
 *
 *  URL to documentation:
 *    https://github.com/krlaframboise/SmartThings/tree/master/smartapps/krlaframboise/simple-event-logger.src#simple-event-logger
 *
 *  Google Sheets S documentation
 *  https://developers.google.com/apps-script/reference/spreadsheet/embedded-line-chart-builder#addrangerange
 *
 *
 *  Changelog:
 *
 *    1.5 (02/19/2019)
 *      -  Replaced obsolete javascript code.
 *
 *    1.3 (02/26/2017)
 *      -  Fixed archive issue when invalid or missing date in first column.
 *      -  Added option for logging short date and hour columns.
 *
 *    1.2.1 (01/28/2017)
 *      - Fixed issue with archive process when rows are frozen.
 *
 *    1.2 (01/22/2017)
 *      - Added archive functional for out of space and event limit.
 *      - Changed Maximum rows to 500000 because the sheet becomes very slow once you reach that size.
 *
 *    1.1 (01/02/2017)
 *      - Fixed Log Size calculation and added option to delete extra columns which will drastically increase the amount of clolumns that can be stored.
 *
 *    1.0.0 (12/26/2016)
 *      - Initial Release
 *
 *  Licensed under the Apache License, Version 2.0 (the
 *  "License"); you may not use this file except in
 *  compliance with the License. You may obtain a copy of
 *  the License at:
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in
 *  writing, software distributed under the License is
 *  distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing
 *  permissions and limitations under the License.
 *
 */

function test() {
  var data = {
    "postBackUrl": "/api/token/${accessToken}/smartapps/installations/${app.id}/update-logging-status",
    "archiveOptions": {"logIsFull": true, "type": "Days", "interval": 1},
    "logDesc": false,
    "logReporting": false,
    "deleteExtraColumns": true,
    "roundOptions": {"roundTime": true, "roundMethod": "Nearest", "roundInterval": 15, "replaceDate": true},
    "events": [{ "time": "5/4/2020 14:39:40", "device": "Greenhouse Sensor", "name": "illuminance", "value": "1777", "desc": {"linkText":"", "displayName": "", "name": "1777", "value": "LUX", "unit": "1777LUX"}}],
    "status" : {
  		"result": "Successful",
		"start":  "5/4/2020 14:00:00",
		"end":  "5/4/2020 14:01:00",
		"runTime": "60 seconds",
		"eventsLogged": "1",
		"totalEventsLogged": "1",
      "freeSpace": "60%"}
  };
 //var json = {"contentLength": 1, "postData": {"contents": data}};
        
  processData(data);
}
   
var getVersion = function() { return "01.06.00"; }
 
function doGet(e) {
	var output = "Version " + getVersion()
	return ContentService.createTextOutput(output);
}

function doPost(e) {
	var result;
	if (e && e.contentLength > 0) {		
		var data = JSON.parse(e.postData.contents);
      result = procesData(data);
	}
	
	return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);	
}

var processData = function(data) {
  	var result = new Object();
	result.version = getVersion();
	result.eventsLogged = 0;
  		if (data) {	
			var sheet = SpreadsheetApp.getActiveSheet();
 			Logger.log(sheet.getName());
			
			// need to check for archive on each log line/entry to archive correctly
			var result = logEvents(sheet, data, result);
			
			result.freeSpace = calculateAvailableLogSpace(sheet);
			sendPostback(data.postBackUrl, result);
          return result;
		}
}

var logEvents = function(sheet, data, result) {
	try {
		//Logger.log(data);
		//Logger.log(result);
		result.totalEventsLogged = sheet.getLastRow() - 1;

		initializeHeaderRow(sheet, data.logDesc, data.logReporting, data.roundOptions)
		
		for (i=0; i < data.events.length; i++) {
			
			// need to check for archive on each entry to properly archive at the proper time
			//TODO: Test by logging now as log time in a column.  this can be moved out of the for loop if all events in this post have the same day.
			archiveCheck(sheet, data, result, data.roundOptions);
			logEvent(sheet, data.logDesc, data.logReporting, data.roundOptions, data.events[i]);
			result.eventsLogged++;
		}
				
		if (data.deleteExtraColumns) {
			deleteExtraColumns(sheet);
		}
				
		result.totalEventsLogged = sheet.getLastRow() - 1;
		result.success = true;
	}
	catch(e) {
		if (e.message.contains("above the limit")) {
			result.logIsFull = true
		}
		result.error = e.message;
		result.success = false;
	}
	return result;
}

var logEvent = function(sheet, logDesc, logReporting, round, event) {
	
	if (round.roundTime && round.replaceDate) {
		var roundInterval = getRoundIntervalAsString(round.roundInterval);
		event.time = roundDate(round.roundMethod, roundInterval, event.time);
	}
	
	var newRow = [
		event.time,
		event.device,
		event.name,
		event.value
	];
	if (round.roundTime && !round.replaceDate) {
		var dateCell = event.time;//"A" + (sheet.getLastRow() + 1).toString();
		var roundInterval = getRoundIntervalAsString(round.roundInterval);
		var roundedDate = roundDate(roundInterval, dateCell);
		newRow.push(roundedDate);
	}
	if (logReporting) {
		var dateCell = "A" + (sheet.getLastRow() + 1).toString();
		newRow.push("=INT(" + dateCell + ")");
		newRow.push("=TIME(" + dateCell + ")");
		newRow.push("=HOUR(" + dateCell + ")");
	}
	if (logDesc) {//(logDesc || logReporting) {
		newRow.push(event.desc);
	}
	sheet.appendRow(newRow);
}

var roundDate = function(roundMethod, roundInterval, date) {
	var roundedDate;
	switch (roundMethod) {
		case "Floor":
			roundedDate = "=FLOOR(\"" + date + "\", " + roundInterval + ")";
		case "Ceiling":
			roundedDate = "=CEIlING(\"" + date + "\", " + roundInterval + ")";
		default: //case "Nearest":
			roundedDate = "=MROUND(\"" + date + "\", " + roundInterval + ")";
	}
	return roundedDate;
	//=MROUND(Sheet1!A:A,"0:15")
	//=TEXT(MONTH(Sheet1!A:A) & "/" & DAY(Sheet1!A:A) & "/" & YEAR(Sheet1!A:A),"m/dd/yy") & " " & TEXT(MROUND(HOUR(Sheet1!A:A) & ":" & RIGHT("0" & MINUTE(Sheet1!A:A),2),"0:15"),"hh:mm"
}

var getRoundIntervalAsString = function(roundInterval) {
	var interval = "\"0:15\"";
	switch (roundInterval) {
		case 1:
			interval = "\"0:01\"";
		case 5:
			interval = "\"0:05\"";
		case 10:
			interval = "\"0:10\"";
		case 30:
			interval = "\"0:30\"";
		case 60:
			interval = "\"1:00\"";
		default : //15:
			interval = "\"0:15\"";
	}
	return interval;
}

var initializeHeaderRow = function(sheet, logDesc, logReporting, round) {		
	if (sheet.getLastRow() == 0) { // initialize all data on initialization of new document
		var header = [
			"Date/Time",
			"Device",
			"Event Name",
			"Event Value"
		];
		sheet.appendRow(header);
		sheet.getRange("A:A").setNumberFormat('MM/dd/yyyy HH:mm:ss');
		if (round.roundTime && !round.replaceDate) {
			sheet.getRange("E1").setValue("Rounded Date/Time");
			sheet.getRange("E:E").setNumberFormat('MM/dd/yyyy HH:mm:ss');
			//sheet.setValue("=IF(ISBLANK(Sheet1!A:A), , MROUND(" + dateCell + ", " + getRoundIntervalAsString(round.roundInterval) + ")"));
		}
		if (logReporting) {//(logReporting && sheet.getRange("F1").getValue() != "Date") {
			sheet.getRange("F1").setValue("Date");
			sheet.getRange("F:F").setNumberFormat('MM/dd/yyyy');
			sheet.getRange("G1").setValue("Hour")
			sheet.getRange("G:G").setNumberFormat('00');
			sheet.getRange("H1").setValue("Time")
			sheet.getRange("H:H").setNumberFormat('HH:mm:ss');
		}
		if (logDesc) {//(logDesc || logReporting) {
			sheet.getRange("I1").setValue("Description");
		}
	}
}

var deleteExtraColumns = function(sheet) {
	try {
		sheet.deleteColumns((sheet.getLastColumn() + 1), (sheet.getMaxColumns() - sheet.getLastColumn()))
	}
	catch (e) {
	
	}
}

var calculateAvailableLogSpace = function(sheet) {
	var cellsUsed = (sheet.getMaxRows() * sheet.getMaxColumns());
	var spaceUsed = (cellsUsed / getLogCapacity()) * 100;
	return (100 - spaceUsed).toFixed(2) + "%";
}

var sendPostback = function(url, result) {
	var options = {
			'method': 'post',
			'headers': {"Content-Type": "application/json"},
			'payload': JSON.stringify(result)
	};
		
	var response = UrlFetchApp.fetch(url, options);	
}

var getLogCapacity = function() { return 500000; }

var archiveCheck = function(sheet, data, result) {
	if (needToArchive(sheet, data.archiveOptions, data)) { 
		result = archiveSheet(sheet, result);
		initializeHeaderRow(sheet, data.logDesc, data.logReporting, data.roundOptions)
	}
}

var needToArchive = function(sheet, archiveOptions, data) {
	var newEvents = data.events.length;
	var eventDate = data.events[i].time;
	// is this google script or javascript dates https://developers.google.com/apps-script/reference/contacts/date-field#getDay()
	// getDay is different between the two
	
	var sheetFirstDate = sheet.getRange(2, 1).getValue();
    	// do this first to handle the case of a new file with header row only
	if (sheet.getLastRow()<=1 || typeof sheetFirstDate == "undefined")
      		return false;
	var sheetLastDate = sheet.getRange(sheet.getLastRow(), 1).getValue();
  	var daysSinceFirstLog = getDaysSince(eventDate, sheetFirstDate);

	//Logger.log(archiveOptions);
	switch (archiveOptions.type) {
		case "Out of Space":
			return (archiveOptions.logIsFull || ((sheet.getMaxRows() + newEvents) >= (getLogCapacity() / sheet.getMaxColumns())));
		case "Events":
			return (archiveOptions.logIsFull || ((sheet.getLastRow() + newEvents) >= archiveOptions.interval));
		case "Days":
			return (daysSinceFirstLog >= archiveOptions.interval);
		case "Weekly":  // restart on Sunday
			//getDay()
			return (new Date(eventDate).getDay() != sheetLastDate.getDay() && getDaysSince(eventDate, sheetLastDate) > 7);
		case "Monthly": // restart on 1st of month
			//getMonth() //getDate()
			return (new Date(eventDate).getMonth() != sheetLastDate.getMonth());		
		case "Yearly": // restart on 1st of the year
			return (new Date(eventDate).getYear() != sheetLastDate.getYear());
		default:
			return false;
	}
}

var getDaysSince = function(eventDt, firstDt) {
    /*if (typeof firstDt=='undefined') {
      return 0;
      //var currentDT = new Date();
      //firstDt = Date.UTC(currentDT.getFullYear(), currentDT.getMonth(), currentDT.getDate());
    }*/
    var eventDate = new Date(eventDt);
	var firstDate = Date.UTC(firstDt.getFullYear(), firstDt.getMonth(), firstDt.getDate());
	var dayMS = 1000 * 60 * 60 * 24;
	var diffMS = Math.abs(eventDate - firstDate);
	return Math.floor(diffMS / dayMS);
}

var archiveSheet = function(sheet, result) {	
	try {
		var archiveSheet = createArchiveSheet(sheet);
		if (archiveSheet) {
			if (verifyArchiveSheet(sheet, archiveSheet)) {
				clearSheet(sheet);
				result.eventsArchived = true;
				result.success = true;
			}
			else {
				result.success = false;
				result.error = "The number of rows and columsn in thea archive Sheet do not match the original sheet so the original file was not cleared.";				
			}
		}
		else {
			result.success = false;
			result.error = "Unable to create archive file.";			
		}
		result.totalEventsLogged = sheet.getLastRow() - 1;		
	}
	catch(e) {
		result.error = e.message;
		result.success = false;
	}
	return result;
}

var createArchiveSheet = function(sheet) {
	var archiveSheetName = getArchiveSheetName(SpreadsheetApp.getActive().getName(), sheet);
	var archiveFile = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).makeCopy(archiveSheetName);
	return SpreadsheetApp.open(archiveFile);
}


var getArchiveSheetName = function(name, sheet) {
	var firstDate = sheet.getRange("A2").getValue();
	var lastDate = sheet.getRange(sheet.getLastRow(), 1).getValue();
	return name + "_" + getFormattedDate(firstDate) + "_" + getFormattedDate(lastDate);
}

var getFormattedDate = function(dt) {
	try {
		var yyyy = dt.getFullYear().toString();
		var mm = (dt.getMonth()+1).toString();
		var dd = dt.getDate().toString();
		return yyyy + "-" + (mm[1] ? mm : ("0" + mm[0])) + "-" + (dd[1] ? dd : ("0" + dd[0])); 
	}
	catch (ex) {
		return "undetermined"
	}
}

var verifyArchiveSheet = function(sheet, archiveSheet) {
	return (sheet.getLastRow() == archiveSheet.getLastRow() && sheet.getLastColumn() == archiveSheet.getLastColumn());
}

var clearSheet = function(sheet) {
	if (sheet.getMaxRows() > 2) {
		sheet.deleteRows(3, (sheet.getMaxRows() - 2));
	}
	sheet.getRange(2, 1, 1, sheet.getLastColumn()).clearContent();
}


