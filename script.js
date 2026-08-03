(() => {
"use strict";
const API="https://api.airplanes.live/v2";
const MAN={lat:53.3537,lon:-2.27495,name:"Manchester Airport",icao:"EGCC",iata:"MAN"};
const carriers={
 BAW:"British Airways",EZY:"easyJet",RYR:"Ryanair",EXS:"Jet2",TOM:"TUI Airways",
 VIR:"Virgin Atlantic",UAE:"Emirates",QTR:"Qatar Airways",KLM:"KLM",DLH:"Lufthansa",
 AFR:"Air France",EIN:"Aer Lingus",WZZ:"Wizz Air",LOG:"Loganair",SAS:"SAS",
 AAL:"American Airlines",UAL:"United Airlines",DAL:"Delta Air Lines",SIA:"Singapore Airlines",
 THY:"Turkish Airlines",IBE:"Iberia",TAP:"TAP Air Portugal",SWR:"Swiss",
 BEL:"Brussels Airlines",RUK:"Ryanair UK",UKP:"UK Police",NPT:"West Atlantic UK",
 CLF:"Centreline",REV:"RVL Aviation",GMA:"Gama Aviation"
};
const $=id=>document.getElementById(id);
const ui={display:$("display"),status:$("statusText"),updated:$("updatedText"),clock:$("clock"),
 refresh:$("refreshButton"),settings:$("settingsButton"),dialog:$("settingsDialog"),
 radius:$("radiusInput"),interval:$("refreshInput"),radiusValue:$("radiusValue"),
 refreshValue:$("refreshValue"),save:$("saveSettings")};
let loc=null,timer=null,planes=[],view="nearest";
let settings={radius:Number(localStorage.getItem("npRadius"))||75,interval:Number(localStorage.getItem("npInterval"))||30};
let stats=JSON.parse(localStorage.getItem("npStats")||'{"date":"","seen":{},"closest":null,"highest":0,"fastest":0}');
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function dist(a,b,c,d){const r=x=>x*Math.PI/180,R=3440.065,dl=r(c-a),dn=r(d-b),q=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;return R*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q))}
function compass(d){return Number.isFinite(d)?["N","NE","E","SE","S","SW","W","NW"][Math.round(d/45)%8]:"—"}
function carrier(call){return carriers[(call||"").trim().slice(0,3).toUpperCase()]||"Private / General Aviation"}
function norm(a){const lat=Number(a.lat),lon=Number(a.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
 const ab=Number(a.alt_baro),ag=Number(a.alt_geom),gs=Number(a.gs),tr=Number(a.track);
 return{call:(a.flight||a.callsign||"No callsign").trim(),reg:a.r||"Unknown",hex:(a.hex||"Unknown").toUpperCase(),
 type:a.t||a.type||"Unknown aircraft",desc:a.desc||"",operator:a.ownOp||a.operator||"",
 altitude:Number.isFinite(ab)?ab:Number.isFinite(ag)?ag:null,speed:Number.isFinite(gs)?gs:null,
 track:Number.isFinite(tr)?tr:null,distance:dist(loc.latitude,loc.longitude,lat,lon)}}
function updateStats(){
 const today=new Date().toISOString().slice(0,10);if(stats.date!==today)stats={date:today,seen:{},closest:null,highest:0,fastest:0};
 planes.forEach(p=>{stats.seen[p.hex]=1;if(stats.closest===null||p.distance<stats.closest)stats.closest=p.distance;
 if(p.altitude&&p.altitude>stats.highest)stats.highest=p.altitude;if(p.speed&&p.speed>stats.fastest)stats.fastest=p.speed});
 localStorage.setItem("npStats",JSON.stringify(stats))
}
function renderNearest(){
 if(!planes.length){ui.display.innerHTML='<div class="message">No aircraft detected nearby. I’ll keep checking.</div>';return}
 const p=planes[0],airline=p.operator||carrier(p.call);
 ui.display.innerHTML=`<div class="airline">${esc(airline)}</div>
 <div class="identity"><span>${esc(p.call)}</span><span class="aircraft-type">${esc(p.type)}</span></div>
 ${p.desc?`<div class="operator-line">${esc(p.desc)}</div>`:""}
 <div class="identifiers"><span>REG: ${esc(p.reg)}</span><span>ICAO: ${esc(p.hex)}</span><span>CARRIER ID: ${esc((p.call||"---").slice(0,3))}</span></div>
 <div class="metrics">
 <div class="metric"><small>Altitude</small>${p.altitude===null?"—":Math.round(p.altitude).toLocaleString("en-GB")+" FT"}</div>
 <div class="metric"><small>Speed</small>${p.speed===null?"—":Math.round(p.speed*1.15078)+" MPH"}</div>
 <div class="metric"><small>Distance</small>${(p.distance*1.15078).toFixed(1)} MI</div>
 <div class="metric"><small>Heading</small>${p.track===null?"—":Math.round(p.track)+"° "+compass(p.track)}</div></div>`
}
function renderNearby(){
 const rows=planes.slice(0,8).map(p=>`<div class="nearby-row"><strong>${esc(p.call)}</strong><span>${esc(p.operator||carrier(p.call))}</span><span>${(p.distance*1.15078).toFixed(1)} mi</span><span>${p.altitude?Math.round(p.altitude).toLocaleString("en-GB")+" ft":"—"}</span></div>`).join("");
 ui.display.innerHTML=`<div class="nearby-title">NEARBY AIRCRAFT</div><div class="nearby-list">${rows||'<div class="message">No aircraft detected.</div>'}</div>`
}
async function renderWeather(){
 ui.display.innerHTML='<div class="message">Loading Manchester Airport weather…</div>';
 try{
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${MAN.lat}&longitude=${MAN.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,visibility,cloud_cover&wind_speed_unit=mph&timezone=Europe%2FLondon`;
  const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw Error(r.status);const d=await r.json(),c=d.current;
  ui.display.innerHTML=`<div class="weather-title">MANCHESTER AIRPORT · EGCC</div><div class="weather-grid">
  <div class="card"><small>Temperature</small><strong>${Math.round(c.temperature_2m)}°C</strong></div>
  <div class="card"><small>Feels like</small><strong>${Math.round(c.apparent_temperature)}°C</strong></div>
  <div class="card"><small>Wind</small><strong>${Math.round(c.wind_speed_10m)} MPH</strong></div>
  <div class="card"><small>Wind direction</small><strong>${Math.round(c.wind_direction_10m)}° ${compass(c.wind_direction_10m)}</strong></div>
  <div class="card"><small>Visibility</small><strong>${(c.visibility/1609.344).toFixed(1)} MI</strong></div>
  <div class="card"><small>Cloud cover</small><strong>${Math.round(c.cloud_cover)}%</strong></div></div>`
 }catch(e){ui.display.innerHTML='<div class="message error">Manchester weather could not be loaded.</div>'}
}
function renderStats(){ui.display.innerHTML=`<div class="weather-title">TODAY'S AIRCRAFT</div><div class="stats-grid">
 <div class="card"><small>Unique aircraft seen</small><strong>${Object.keys(stats.seen).length}</strong></div>
 <div class="card"><small>Closest</small><strong>${stats.closest===null?"—":(stats.closest*1.15078).toFixed(1)+" MI"}</strong></div>
 <div class="card"><small>Highest</small><strong>${stats.highest?Math.round(stats.highest).toLocaleString("en-GB")+" FT":"—"}</strong></div>
 <div class="card"><small>Fastest</small><strong>${stats.fastest?Math.round(stats.fastest*1.15078)+" MPH":"—"}</strong></div></div>`}
function render(){if(view==="nearest")renderNearest();else if(view==="nearby")renderNearby();else if(view==="weather")renderWeather();else renderStats()}
async function load(){
 if(!loc)return locate();ui.status.textContent="Updating…";
 try{const r=await fetch(`${API}/point/${loc.latitude}/${loc.longitude}/${settings.radius}`,{cache:"no-store"});if(!r.ok)throw Error(r.status);
 const d=await r.json(),list=Array.isArray(d.ac)?d.ac:(Array.isArray(d.aircraft)?d.aircraft:[]);
 planes=list.map(norm).filter(Boolean).sort((a,b)=>a.distance-b.distance);updateStats();render();
 ui.updated.textContent="Updated "+new Date().toLocaleTimeString("en-GB");ui.status.textContent="Live"
 }catch(e){ui.display.innerHTML='<div class="message error">The live aircraft service could not be reached. Tap Refresh to try again.</div>';ui.status.textContent="Offline"}
}
function locate(){navigator.geolocation.getCurrentPosition(p=>{loc=p.coords;load();clearInterval(timer);timer=setInterval(load,settings.interval*1000)},()=>{ui.display.innerHTML='<div class="message error">Please allow location access for this website.</div>';ui.status.textContent="Location blocked"},{enableHighAccuracy:true,timeout:15000,maximumAge:300000})}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");view=b.dataset.view;render()}));
ui.refresh.addEventListener("click",load);ui.settings.addEventListener("click",()=>{ui.radius.value=settings.radius;ui.interval.value=settings.interval;ui.radiusValue.textContent=settings.radius;ui.refreshValue.textContent=settings.interval;ui.dialog.showModal()});
ui.radius.addEventListener("input",()=>ui.radiusValue.textContent=ui.radius.value);ui.interval.addEventListener("input",()=>ui.refreshValue.textContent=ui.interval.value);
ui.save.addEventListener("click",e=>{e.preventDefault();settings.radius=+ui.radius.value;settings.interval=+ui.interval.value;localStorage.setItem("npRadius",settings.radius);localStorage.setItem("npInterval",settings.interval);ui.dialog.close();load();clearInterval(timer);timer=setInterval(load,settings.interval*1000)});
setInterval(()=>ui.clock.textContent=new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),1000);
locate();
})();