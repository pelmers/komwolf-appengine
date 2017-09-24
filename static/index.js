"use strict"

const resultsMap = new Map();
let sortField = "name";
let sortDesc = false;
let inflight = false;
let map, box, displaySegment;
const $spinner = $(".spinner");

function startSpinner() {
    $spinner.css("display", "block");
}

function stopSpinner() {
    $spinner.css("display", "none");
}

function boundPosition(lat, lng, radius) {
    return {
        north: lat+radius,
        south: lat-radius,
        east: lng+radius,
        west: lng-radius
    }
}

function initMap() {
    // Default starting location is uluru in Australia.
    const startLoc = {lat: -25.363, lng: 131.044};
    map = new google.maps.Map(document.querySelector("#map"), {
        zoom: 4,
        center: startLoc
    });
    box = new google.maps.Rectangle({
        bounds: boundPosition(startLoc, 0.05),
        editable: true,
    });
    displaySegment = new google.maps.Polyline({
        strokeColor: "red"
    });
    box.setMap(map);
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(pos => {
            console.log("detected location:", pos);
            const bounds = boundPosition(pos.coords.latitude, pos.coords.longitude, 0.05);
            map.fitBounds(bounds);
            box.setBounds(bounds);
            new google.maps.Marker({
                position: {lat: pos.coords.latitude, lng: pos.coords.longitude},
                map,
                title: "Current Location"
            });
        });
    }
}

// Return provided key, "default", or null. If there isn't display a required message on page.
function checkKey() {
    // clear previous messages
    const msgSpan = $("#token-required-span");
    const keyVal = $("#input-strava-token").val();
    const cbVal = $("#checkbox-strava-token").prop("checked");
    msgSpan.hide();
    if (keyVal.length === 0 && !cbVal) {
        // no key, show required message
        msgSpan.show();
        return null;
    }
    if (keyVal.length > 0) {
        return keyVal;
    }
    return "default";
}

// Update state with new explore results.
function exploreResults(results) {
    // Turn off display flag for anything currently in the table.
    for (const val of resultsMap.values()) {
        val.show = false;
    }
    for (let i = 0; i < results.length; i++) {
        const id = results[i].id;
        // If we already have the entry don't need to overwrite it because it may
        // already have leader timing information.
        if (resultsMap.has(id)) {
            resultsMap.get(id).show = true;
        } else {
            results[i].show = true;
            resultsMap.set(id, results[i])
        }
    }
    displayResults();
}

// Update state with new detail results.
function detailResults(results) {
    for (let id in results) {
        if (!results.hasOwnProperty(id)) {
            continue;
        }
        const leader = results[id];
        id = parseInt(id);
        if (resultsMap.has(id)) {
            resultsMap.get(id).leader = leader;
        }
    }
    displayResults();
}

// Format number of seconds to hh:mm:ss
function displayTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    seconds -= 3600 * hours;
    const minutes = Math.floor(seconds / 60);
    seconds -= 60 * minutes;
    seconds = Math.round(seconds);
    const pad = val => {
        return (val < 10)?"0"+val:""+val;
    }
    if (hours > 0) {
        return "" + hours + ":" + pad(minutes) + ":" + pad(seconds);
    }
    return "" + pad(minutes) + ":" + pad(seconds);
}

// Make a tr DOM node for the provided result.
function makeResultTr(result) {
    const segmentUrl = "https://www.strava.com/segments/" + result.id;
    const $row = $("<tr>");
    const tds = [];
    tds.push($("<td><a href=" + segmentUrl + ">" + result.name + "</a></td>"));
    tds.push($("<td>" + Number(result.distance / 1000).toFixed(2) + "</td>"));
    tds.push($("<td>" + result.elev_difference + "</td>"));
    if (result.leader) {
        const seconds = result.leader.moving_time;
        const hours = seconds / 3600;
        const kms = result.distance / 1000;
        tds.push($("<td>" + seconds + "</td>"));
        tds.push($("<td>" + Number(kms / hours).toFixed(2) + "</td>"));
        tds.push($("<td>" + displayTime(seconds / kms) + "</td>"));
    }
    for (let i = 0; i < tds.length; i++) {
        tds[i].appendTo($row);
    }
    return $row;
}

function displayResults() {
    // Clear all current rows in table.
    const resultsBody = document.getElementById("results-body");
    while (resultsBody.firstChild) {
        resultsBody.removeChild(resultsBody.firstChild);
    }
    const values = Array.from(resultsMap.values());
    values.sort((a, b) => {
        // If results do not have leader info add a filler value.
        const amt = (a.leader)?a.leader.moving_time : 1;
        const bmt = (b.leader)?b.leader.moving_time : 1;
        switch (sortField) {
            case "name":
                return (a.name < b.name)?-1:1;
            case "distance":
                return a.distance - b.distance;
            case "elev":
                return a.elev_difference - b.elev_difference;
            case "time":
                return amt - bmt;
            case "speed":
                return a.distance / amt - b.distance / bmt;
            case "pace":
                return b.distance / bmt - a.distance / amt;
        }
    });
    if (sortDesc) {
        values.reverse();
    }
    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        if (val.show) {
            // Add line for this result to the table.
            const $resultNode = makeResultTr(val);
            // Add hover event to row that shows the route on map.
            $resultNode.hover(() => {
                displaySegment.setMap(map);
                const path = google.maps.geometry.encoding.decodePath(val.points);
                displaySegment.setPath(path);
            }, () => {
                displaySegment.setMap(null);
            });
            $resultNode.appendTo($(resultsBody));
        }
    }
}
$("thead th").click((event) => {
    const $node = $(event.target);
    // If we clicked twice on same field then reverse direction.
    const newSort = $node.data('sort');
    if (newSort == sortField) {
        sortDesc = !sortDesc;
    } else {
        // Highlight new sort field.
        $node.addClass("selected");
        $("th[data-sort="+sortField+"]").removeClass("selected");
        sortDesc = false;
        sortField = newSort
    }
    displayResults();
});

document.querySelector("#btn-find-segments").addEventListener("click", () => {
    const key = checkKey();
    if (key === null) {
        return;
    }
    if (inflight) {
        return;
    }
    const data = box.getBounds().toJSON()
    data.key = key;
    data.depth = document.querySelector("#input-depth").value;
    data.type = document.querySelector("#select-activity-type").value;
    // TODO: have loading spinner/bar
    inflight = true;
    startSpinner();
    $.post("/explore", data, results => {
        inflight = false;
        stopSpinner();
        exploreResults(JSON.parse(results));
    });
});

document.querySelector("#btn-fetch-details").addEventListener("click", () => {
    const key = checkKey();
    if (key === null) {
        return;
    }
    if (inflight) {
        return;
    }
    // collect all currently displayed segment ids into a string
    // skip segments that already have details
    let segments = "";
    for (const [id, val] of resultsMap.entries()) {
        if (val.show && !val.leader) {
            segments += id + ",";
        }
    }
    // slice trailing comma
    segments = segments.slice(0, -1);
    inflight = true;
    startSpinner();
    $.post("/detail", {key, segments}, results => {
        inflight = false;
        stopSpinner();
        detailResults(JSON.parse(results));
    });
});

$("#usageA").on('click', () => $("#usageDiv").toggle());