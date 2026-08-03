(() => {
  "use strict";

  const API_BASE = "https://api.adsb.lol/v2";

  const airlineNames = {
    BAW: "British Airways",
    EZY: "easyJet",
    RYR: "Ryanair",
    EXS: "Jet2",
    TOM: "TUI Airways",
    VIR: "Virgin Atlantic",
    UAE: "Emirates",
    QTR: "Qatar Airways",
    KLM: "KLM",
    DLH: "Lufthansa",
    AFR: "Air France",
    EIN: "Aer Lingus",
    WZZ: "Wizz Air",
    LOG: "Loganair",
    SAS: "SAS",
    AAL: "American Airlines",
    UAL: "United Airlines",
    DAL: "Delta Air Lines",
    SIA: "Singapore Airlines",
    THY: "Turkish Airlines",
    IBE: "Iberia",
    TAP: "TAP Air Portugal",
    SWR: "Swiss",
    BEL: "Brussels Airlines"
  };

  const ui = {
    panel: document.getElementById("aircraftPanel"),
    status: document.getElementById("statusText"),
    updated: document.getElementById("updatedText"),
    clock: document.getElementById("clock"),
    refreshButton: document.getElementById("refreshButton"),
    settingsButton: document.getElementById("settingsButton"),
    dialog: document.getElementById("settingsDialog"),
    radiusInput: document.getElementById("radiusInput"),
    refreshInput: document.getElementById("refreshInput"),
    radiusValue: document.getElementById("radiusValue"),
    refreshValue: document.getElementById("refreshValue"),
    saveSettings: document.getElementById("saveSettings")
  };

  let locationData = null;
  let refreshTimer = null;
  let wakeLock = null;

  let settings = {
    radius: Number(localStorage.getItem("nearestPlaneRadius")) || 75,
    interval: Number(localStorage.getItem("nearestPlaneInterval")) || 30
  };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function distanceInNauticalMiles(lat1, lon1, lat2, lon2) {
    const radians = degrees => degrees * Math.PI / 180;
    const earthRadiusNm = 3440.065;
    const latitudeDifference = radians(lat2 - lat1);
    const longitudeDifference = radians(lon2 - lon1);

    const value =
      Math.sin(latitudeDifference / 2) ** 2 +
      Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(longitudeDifference / 2) ** 2;

    return earthRadiusNm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function compassDirection(degrees) {
    if (!Number.isFinite(degrees)) return "—";
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return directions[Math.round(degrees / 45) % 8];
  }

  function airlineFromCallsign(callsign) {
    const code = (callsign || "").trim().slice(0, 3).toUpperCase();
    return airlineNames[code] || "Aircraft Overhead";
  }

  function normaliseAircraft(aircraft) {
    const latitude = Number(aircraft.lat);
    const longitude = Number(aircraft.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const barometricAltitude = Number(aircraft.alt_baro);
    const geometricAltitude = Number(aircraft.alt_geom);
    const speed = Number(aircraft.gs);
    const track = Number(aircraft.track);

    return {
      callsign: (aircraft.flight || aircraft.callsign || aircraft.hex || "Unknown").trim(),
      type: aircraft.t || aircraft.type || "Aircraft",
      altitude: Number.isFinite(barometricAltitude)
        ? barometricAltitude
        : Number.isFinite(geometricAltitude) ? geometricAltitude : null,
      speed: Number.isFinite(speed) ? speed : null,
      track: Number.isFinite(track) ? track : null,
      distance: distanceInNauticalMiles(
        locationData.latitude,
        locationData.longitude,
        latitude,
        longitude
      )
    };
  }

  function showMessage(message, isError = false) {
    ui.panel.innerHTML =
      `<div class="message ${isError ? "error" : ""}">${escapeHTML(message)}</div>`;
  }

  function renderAircraft(aircraft) {
    const altitude = aircraft.altitude === null
      ? "—"
      : `${Math.round(aircraft.altitude).toLocaleString("en-GB")} FT`;

    const speed = aircraft.speed === null
      ? "—"
      : `${Math.round(aircraft.speed * 1.15078)} MPH`;

    const distance = `${(aircraft.distance * 1.15078).toFixed(1)} MI`;

    const heading = aircraft.track === null
      ? "—"
      : `${Math.round(aircraft.track)}° ${compassDirection(aircraft.track)}`;

    ui.panel.innerHTML = `
      <div class="airline">${escapeHTML(airlineFromCallsign(aircraft.callsign))}</div>
      <div class="identity">
        <span>${escapeHTML(aircraft.callsign)}</span>
        <span class="aircraft-type">${escapeHTML(aircraft.type)}</span>
      </div>
      <div class="metrics">
        <div class="metric"><small>Altitude</small>${altitude}</div>
        <div class="metric"><small>Speed</small>${speed}</div>
        <div class="metric"><small>Distance</small>${distance}</div>
        <div class="metric"><small>Heading</small>${heading}</div>
      </div>
    `;
  }

  async function loadNearestAircraft() {
    if (!locationData) {
      requestLocation();
      return;
    }

    ui.status.textContent = "Updating…";

    try {
      const endpoint =
        `${API_BASE}/lat/${locationData.latitude}` +
        `/lon/${locationData.longitude}/dist/${settings.radius}`;

      const response = await fetch(endpoint, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Flight service returned ${response.status}`);
      }

      const data = await response.json();
      const aircraft = (Array.isArray(data.ac) ? data.ac : [])
        .map(normaliseAircraft)
        .filter(Boolean)
        .filter(item => item.distance <= settings.radius)
        .sort((first, second) => first.distance - second.distance);

      if (aircraft.length > 0) {
        renderAircraft(aircraft[0]);
      } else {
        showMessage("No aircraft detected within the selected radius. I’ll keep checking.");
      }

      ui.updated.textContent = `Updated ${new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })}`;

      ui.status.textContent = "Live";
    } catch (error) {
      console.error(error);
      showMessage(
        "The live aircraft service could not be reached. Tap Refresh to try again.",
        true
      );
      ui.status.textContent = "Offline";
    }
  }

  function restartRefreshTimer() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(loadNearestAircraft, settings.interval * 1000);
  }

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      showMessage("Location is unavailable in this browser.", true);
      ui.status.textContent = "Location unavailable";
      return;
    }

    ui.status.textContent = "Finding location…";

    navigator.geolocation.getCurrentPosition(
      position => {
        locationData = position.coords;
        loadNearestAircraft();
        restartRefreshTimer();
      },
      () => {
        showMessage(
          "Location permission is required. On the iPad open Settings → Privacy & Security → Location Services → Safari Websites and allow location.",
          true
        );
        ui.status.textContent = "Location blocked";
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000
      }
    );
  }

  function updateClock() {
    ui.clock.textContent = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async function keepScreenAwake() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch (error) {
      console.info("Screen wake lock is unavailable.", error);
    }
  }

  function populateSettings() {
    ui.radiusInput.value = settings.radius;
    ui.refreshInput.value = settings.interval;
    ui.radiusValue.textContent = settings.radius;
    ui.refreshValue.textContent = settings.interval;
  }

  ui.refreshButton.addEventListener("click", loadNearestAircraft);

  ui.settingsButton.addEventListener("click", () => {
    populateSettings();
    ui.dialog.showModal();
  });

  ui.radiusInput.addEventListener("input", () => {
    ui.radiusValue.textContent = ui.radiusInput.value;
  });

  ui.refreshInput.addEventListener("input", () => {
    ui.refreshValue.textContent = ui.refreshInput.value;
  });

  ui.saveSettings.addEventListener("click", event => {
    event.preventDefault();

    settings.radius = Number(ui.radiusInput.value);
    settings.interval = Number(ui.refreshInput.value);

    localStorage.setItem("nearestPlaneRadius", settings.radius);
    localStorage.setItem("nearestPlaneInterval", settings.interval);

    ui.dialog.close();
    loadNearestAircraft();
    restartRefreshTimer();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      keepScreenAwake();
      loadNearestAircraft();
    }
  });

  populateSettings();
  updateClock();
  setInterval(updateClock, 1000);
  keepScreenAwake();
  requestLocation();
})();
