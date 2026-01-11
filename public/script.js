// ============================================================
// 1. KONFIGURASI PETA & VARIABEL GLOBAL
// ============================================================
var map = L.map('map', {zoomControl: false}).setView([-7.05, 106.9], 10); 
L.control.zoom({ position: 'bottomright' }).addTo(map); 

// Base Maps
var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {attribution: 'Esri'});
var street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: 'OSM'});
var labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB', pane: 'shadowPane' });

satellite.addTo(map);
labels.addTo(map); 

// Layer Groups
let geoJsonLayer; 
let historyLayer = L.layerGroup().addTo(map); 
let safeLayer = L.layerGroup().addTo(map);
let routeLayer = L.layerGroup().addTo(map); // Layer khusus untuk garis rute

// Data Store
let mapData = []; 
let userLocation = null; // Menyimpan lokasi GPS pengguna
let modelDataMap = {}; // Menyimpan data lereng manual

// Data Manual Lereng (Database Kecil - Fallback)
const manualData = [
  {"nama":"Cisolok","lereng":40}, {"nama":"Pelabuhanratu","lereng":25},
  {"nama":"Cikidang","lereng":45}, {"nama":"Simpenan","lereng":15},
  {"nama":"Pabuaran","lereng":35}
];
manualData.forEach(d => modelDataMap[d.nama.toLowerCase()] = d);

// Data Riwayat Longsor (Tetap Hardcoded karena sedikit)
const landslideHistory = [
    { loc: [-6.95, 106.55], info: "Longsor Cisolok (2023)", status: "Sedang" },
    { loc: [-6.97, 106.56], info: "Longsor Tebing (2021)", status: "Berat" },
    { loc: [-7.02, 106.58], info: "Longsor Simpenan (2024)", status: "Ringan" },
    { loc: [-7.184481, 106.798601], info: "Longsor Pabuaran (2014)", status: "Ringan" }
];

// ============================================================
// 2. LOGIKA UTAMA (CUACA & RISIKO)
// ============================================================

// A. Fetch Cuaca Global (Untuk Header)
async function fetchGlobalWeather() {
    const lat = -7.05; const lng = 106.9; // Tengah Sukabumi
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,windspeed_10m_max,temperature_2m_mean&timezone=Asia%2FBangkok`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        // Update DOM Header
        const rain = data.daily.precipitation_sum[0];
        document.getElementById('global-rain').innerText = rain + " mm";
        document.getElementById('global-wind').innerText = data.daily.windspeed_10m_max[0] + " km/h";
        document.getElementById('global-temp').innerText = data.daily.temperature_2m_mean[0] + " °C";
    } catch(e) { console.log("Gagal load cuaca global"); }
}

// B. Rumus Risiko
function calculateRisk(hujan, lereng, tanah) {
    let score = 0;
    if (hujan > 50) score += 3; else if (hujan > 20) score += 2; else score += 1;
    let s = lereng || 0; 
    if (s > 30) score += 3; else if (s > 15) score += 2; else score += 1;
    if (tanah > 0.5) score += 1;
    return score;
}

function getRiskColor(score) {
    if (score >= 5) return '#e74c3c'; 
    if (score >= 3) return '#f39c12'; 
    return '#2ecc71';
}

function getRiskStatus(score) {
    if (score >= 5) return { text: "BAHAYA", class: "danger", bg: "#e74c3c" };
    if (score >= 3) return { text: "WASPADA", class: "warning", bg: "#f39c12" };
    return { text: "AMAN", class: "safe", bg: "#2ecc71" };
}

// ============================================================
// 3. FUNGSI SIDEBAR & UI
// ============================================================

// Helper: Buka Sidebar di Mobile
function openSidebarOnMobile() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebar-toggle');
    if (window.innerWidth < 768) {
        sidebar.classList.add('open');
        // Pastikan tombol toggle ada sebelum akses classList
        if(btn) btn.classList.add('bergeser'); 
    }
}

function resetSidebar() {
    document.getElementById('detail-info').style.display = 'none';
    document.getElementById('default-info').style.display = 'block';
    routeLayer.clearLayers(); // Hapus garis rute jika ditutup
}

// A. Sidebar Wilayah (Risiko)
function updateSidebar(props, hujan, angin, tanah, lereng, riskScore) {
    const status = getRiskStatus(riskScore);
    const detailDiv = document.getElementById('detail-info');
    document.getElementById('default-info').style.display = 'none';
    detailDiv.style.display = 'block';

    detailDiv.innerHTML = `
        <div class="detail-header">
            <h3 class="detail-title">${props.NAME_3 || props.KECAMATAN || "Wilayah"}</h3>
            <span class="detail-status" style="background:${status.bg}">${status.text}</span>
        </div>
        <div class="stat-grid">
            <div class="stat-item"><span class="stat-icon">🌧️</span><span class="stat-val">${hujan}<small>mm</small></span><span class="stat-lbl">Hujan</span></div>
            <div class="stat-item"><span class="stat-icon">⛰️</span><span class="stat-val">${lereng}°</span><span class="stat-lbl">Lereng</span></div>
            <div class="stat-item"><span class="stat-icon">💧</span><span class="stat-val">${tanah}</span><span class="stat-lbl">Tanah</span></div>
            <div class="stat-item"><span class="stat-icon">📊</span><span class="stat-val">${riskScore}/7</span><span class="stat-lbl">Skor</span></div>
        </div>
        <div class="info-card">
            <h4><i class="fa-solid fa-triangle-exclamation"></i> Analisis</h4>
            <p>Status <b>${status.text}</b> ditentukan dari kombinasi curah hujan dan kemiringan lereng di wilayah ini.</p>
        </div>
        <button class="btn-back" onclick="resetSidebar()"><i class="fa-solid fa-arrow-left"></i> Kembali</button>
    `;
    openSidebarOnMobile();
}

// B. Sidebar Titik Aman (+ Fitur Rute)
function updateSidebarSafe(data) {
    const detailDiv = document.getElementById('detail-info');
    document.getElementById('default-info').style.display = 'none';
    detailDiv.style.display = 'block';

    // Hitung Jarak & Gambar Garis (Jika GPS Aktif)
    let distanceInfo = "-";
    routeLayer.clearLayers(); // Hapus garis lama
    
    if (userLocation) {
        // Hitung jarak (meter ke km)
        const dist = (map.distance(userLocation, [data.lat, data.lng]) / 1000).toFixed(1);
        distanceInfo = `${dist} km`;

        // Gambar Garis Putus-putus
        const routeLine = L.polyline([userLocation, [data.lat, data.lng]], {
            color: 'blue', dashArray: '10, 10', weight: 4, opacity: 0.6
        });
        routeLayer.addLayer(routeLine);
        map.fitBounds(routeLine.getBounds(), {padding: [50,50]});
    }

    detailDiv.innerHTML = `
        <div class="detail-header">
            <h3 class="detail-title">${data.nama_tempat}</h3>
            <span class="detail-status" style="background:#27ae60">TITIK AMAN</span>
        </div>
        <div class="info-card" style="text-align:center; padding:15px;">
            <i class="fa-solid fa-person-shelter" style="font-size:30px; color:#27ae60; margin-bottom:5px;"></i>
            <p style="margin:0; font-weight:bold; color:#555;">${data.tipe}</p>
        </div>
        <div class="stat-grid">
            <div class="stat-item"><span class="stat-icon">👥</span><span class="stat-val">${data.kapasitas}</span><span class="stat-lbl">Kapasitas</span></div>
            <div class="stat-item"><span class="stat-icon">📏</span><span class="stat-val">${distanceInfo}</span><span class="stat-lbl">Jarak Anda</span></div>
        </div>
        
        <a href="https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lng}" target="_blank" style="text-decoration:none;">
            <button class="btn-back" style="background:#3498db; color:white; border:none; margin-bottom:10px;">
                <i class="fa-solid fa-diamond-turn-right"></i> Rute Google Maps
            </button>
        </a>

        <button class="btn-back" onclick="resetSidebar()"><i class="fa-solid fa-arrow-left"></i> Kembali</button>
    `;
    openSidebarOnMobile();
}

// ============================================================
// 4. INISIALISASI PETA (INIT)
// ============================================================
async function initMap() {
    try {
        // Panggil Cuaca Global
        fetchGlobalWeather();

        // 1. Load Batas Wilayah
        const res = await fetch('BatasSukabumi.json');
        const geoJsonData = await res.json();

        geoJsonLayer = L.geoJSON(geoJsonData, {
            style: { color: 'white', weight: 1, fillOpacity: 0.6, fillColor: '#95a5a6' },
            onEachFeature: function(feature, layer) {
                var rawNama = feature.properties.NAME_3 || "Wilayah";
                var namaKec = rawNama.toLowerCase();
                var center = turf.centroid(feature).geometry.coordinates;
                mapData.push({ name: rawNama, layer: layer });

                // Fetch Cuaca Per Wilayah
                var url = `https://api.open-meteo.com/v1/forecast?latitude=${center[1]}&longitude=${center[0]}&daily=precipitation_sum,precipitation_probability_max,windspeed_10m_max&current=soil_moisture_0_to_1cm&timezone=Asia%2FBangkok`;

                fetch(url).then(r => r.json()).then(w => {
                    var hujan = w.daily.precipitation_sum[0];
                    var peluang = w.daily.precipitation_probability_max[0];
                    var angin = w.daily.windspeed_10m_max[0];
                    var tanah = w.current ? w.current.soil_moisture_0_to_1cm : 0;
                    
                    if (hujan === 0 && peluang > 40) hujan = 1;

                    var dataKecamatan = modelDataMap[namaKec] || { lereng: 10 };
                    var lereng = dataKecamatan.lereng;
                    var riskScore = calculateRisk(hujan, lereng, tanah);

                    layer.setStyle({ fillColor: getRiskColor(riskScore), fillOpacity: 0.7 });
                    layer.bindTooltip(`<b>${rawNama}</b>`, { direction: 'center', permanent: false, className: 'my-label' });

                    layer.on('click', function() {
                        geoJsonLayer.resetStyle();
                        layer.setStyle({ weight: 3, color: '#2c3e50', fillOpacity: 0.8, fillColor: getRiskColor(riskScore) });
                        layer.bringToFront();
                        map.flyToBounds(layer.getBounds(), { padding: [50, 50] });
                        updateSidebar(feature.properties, hujan, angin, tanah, lereng, riskScore);
                    });
                }).catch(e => console.log("Skip API"));
            }
        }).addTo(map);

        // 2. Load Titik Aman (JSON Eksternal)
        try {
            const resSafe = await fetch('titik_aman.json');
            const safePoints = await resSafe.json();
            
            safePoints.forEach(item => {
                var safeIcon = L.divIcon({ className: 'custom-div-icon', html: `<div class="safe-icon"><i class="fa-solid fa-shield-halved"></i></div>` });
                var marker = L.marker([item.lat, item.lng], {icon: safeIcon});
                
                marker.on('click', function() {
                    map.flyTo([item.lat, item.lng], 15);
                    updateSidebarSafe(item);
                });
                marker.bindTooltip(`<b>${item.nama_tempat}</b>`, { direction: 'top', offset: [0, -10] });
                safeLayer.addLayer(marker);
            });
        } catch(e) { console.error("Gagal load titik_aman.json", e); }

        // 3. Load Riwayat (Hardcoded)
        landslideHistory.forEach(item => {
            var icon = L.divIcon({ className: 'custom-div-icon', html: `<div class="history-icon"><i class="fa-solid fa-exclamation"></i></div>` });
            var marker = L.marker(item.loc, {icon: icon});
            marker.bindPopup(`<b>Riwayat Longsor</b><br>${item.info}<br>Status: ${item.status}`);
            historyLayer.addLayer(marker);
        });

        // 4. Layer Controls
        L.control.layers(
            {"Satelit": satellite, "Jalan": street},
            {"Risiko": geoJsonLayer, "Titik Aman": safeLayer, "Riwayat": historyLayer},
            { position: 'topright' }
        ).addTo(map);

        // Matikan Loading Screen
        setTimeout(() => {
            const loader = document.getElementById('map-loader');
            if(loader) loader.style.display = 'none';
        }, 2000);

    } catch (err) { console.error(err); }
}

initMap();

// ============================================================
// 5. FITUR UI & UTILS
// ============================================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebar-toggle');
    sidebar.classList.toggle('open');
    if(btn) btn.classList.toggle('bergeser');
}

function filterSearch() {
    const input = document.getElementById('search-input').value.toLowerCase();
    const resultDiv = document.getElementById('search-results');
    resultDiv.innerHTML = '';

    if (input.length < 2) { resultDiv.style.display = 'none'; return; }
    
    const filtered = mapData.filter(d => d.name.toLowerCase().includes(input));
    if (filtered.length > 0) {
        resultDiv.style.display = 'block';
        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${item.name}`;
            div.onclick = () => {
                item.layer.fireEvent('click');
                resultDiv.style.display = 'none';
                document.getElementById('search-input').value = item.name;
            };
            resultDiv.appendChild(div);
        });
    } else { resultDiv.style.display = 'none'; }
}

// GPS Control
L.Control.Locate = L.Control.extend({
    onAdd: function(map) {
        var div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        div.style.backgroundColor = 'white'; div.style.width = '34px'; div.style.height = '34px';
        div.style.cursor = 'pointer'; div.style.display = 'flex'; justify='center'; div.style.alignItems='center';
        div.style.marginBottom = '10px';
        div.innerHTML = '<i class="fa-solid fa-crosshairs" style="font-size:18px; color:#333; margin:auto;"></i>';
        
        div.onclick = function() { 
            div.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin:auto;"></i>'; 
            map.locate({setView: true, maxZoom: 15}); 
        }
        return div;
    }
});
map.addControl(new L.Control.Locate({ position: 'topright' }));

map.on('locationfound', function(e) {
    userLocation = e.latlng; // Simpan lokasi
    document.querySelector('.leaflet-control .fa-spinner').parentElement.innerHTML = '<i class="fa-solid fa-crosshairs" style="font-size:18px; color:#3498db; margin:auto;"></i>';
    L.circle(e.latlng, { radius: e.accuracy/2, color:'#3498db', fillOpacity:0.2 }).addTo(map);
    L.marker(e.latlng).addTo(map).bindPopup("Lokasi Anda").openPopup();
});

map.on('locationerror', function(e) {
    alert("Gagal mendeteksi lokasi.");
    document.querySelector('.leaflet-control .fa-spinner').parentElement.innerHTML = '<i class="fa-solid fa-crosshairs" style="font-size:18px; color:#333; margin:auto;"></i>';
});