// === FILE MAIN.JS HOÀN CHỈNH (ĐÃ KẾT HỢP ĐẦY ĐỦ TÍNH NĂNG) ===

// 1. IMPORT CÁC THƯ VIỆN CẦN THIẾT
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import * as turf from "@turf/turf";

// 2. KHỞI TẠO CÁC BIẾN TOÀN CỤC
const loadedGeojson = {}; // Cache các file geojson của xã đã được tải
let ranhGioiFeatures = []; // Cache dữ liệu ranh giới hành chính
let labelElements = []; // Mảng chứa các nhãn kích thước

// 3. CÀI ĐẶT CÁC THÔNG SỐ VÀ KHỞI TẠO BẢN ĐỒ
const stadiaApiKey = '226d621e-003f-4982-bad0-5e2ca49617fd'; // <-- THAY THẾ BẰNG KEY THẬT CỦA BẠN
const retinaModifier = window.devicePixelRatio > 1 ? '@2x' : '';
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const map = new maplibregl.Map({
    container: "map",
    style: { // Khởi tạo với một style trống, chúng ta sẽ thêm mọi thứ sau khi map tải xong
        version: 8,
        sources: {},
        layers: []
    },
    center: [108.202167, 16.054456],
    zoom: 14
});

// 4. HÀM TẢI DỮ LIỆU RANH GIỚI HÀNH CHÍNH (TỪ CODE CŨ CỦA BẠN)
async function loadRanhGioi() {
    try {
        const res = await fetch("/ranhgioi.geojson");
        const data = await res.json();
        ranhGioiFeatures = data.features;
        console.log("Tải dữ liệu ranh giới thành công.");
    } catch (error) {
        console.error("Lỗi khi tải ranh giới.geojson:", error);
    }
}
loadRanhGioi(); // Tải ngay từ đầu

// 5. CÁC HÀM TIỆN ÍCH (TỪ CODE CŨ CỦA BẠN)
function clearPreviousHighlight() {
    if (map.getSource("highlight")) {
        map.getSource("highlight").setData({ type: 'FeatureCollection', features: [] });
    }
    document.querySelectorAll(".length-label").forEach((el) => el.remove());
    labelElements = [];
    map.off("move", updateLabelPositions);
    map.off("zoom", updateLabelPositions);
}

function updateLabelPositions() {
    labelElements.forEach(({ el, lngLat }) => {
        const pixel = map.project(lngLat);
        el.style.left = pixel.x + "px";
        el.style.top = pixel.y + "px";
    });
}

// 6. XỬ LÝ SỰ KIỆN KHI BẢN ĐỒ ĐÃ TẢI XONG
map.on("load", () => {
    // A. THÊM CÁC NGUỒN DỮ LIỆU (SOURCES)
    map.addSource('stadia-source', {
        type: 'raster',
        tiles: [`https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}${retinaModifier}.png?api_key=${stadiaApiKey}`],
        // Báo cho map biết kích thước tile tương ứng
        tileSize: window.devicePixelRatio > 1 ? 512 : 256, 
        attribution: '&copy; Stadia Maps, OpenMapTiles, OpenStreetMap'
    });
    map.addSource('satellite-source', {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '&copy; Esri'
    });
    map.addSource("parcels-pmtiles", {
        type: "vector",
        url: "pmtiles://tiles/danang_parcels_final.pmtiles",
        attribution: 'Dữ liệu phân lô tham khảo từ Sở TNMT Đà Nẵng'
    });
    map.addSource("highlight", { type: "geojson", data: null });

    // B. THÊM CÁC LỚP HIỂN THỊ (LAYERS)
    map.addLayer({
        id: 'stadia-layer',
        type: 'raster',
        source: 'stadia-source',
        layout: { visibility: 'none' } // Ẩn đi lúc đầu
    });
    map.addLayer({
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite-source',
        layout: { visibility: 'none' } // Ẩn đi lúc đầu
    });
    // Lớp phân lô của bạn sẽ luôn hiển thị ở trên cùng
    map.addLayer({
        id: "parcel-boundaries",
        type: "line",
        source: "parcels-pmtiles",
        "source-layer": "danang_full",
        paint: { "line-color": "#888", "line-width": 1 }
    });
    // Các lớp để highlight
    map.addLayer({ id: "highlight-fill", type: "fill", source: "highlight", paint: { "fill-color": "#3b82f6", "fill-opacity": 0.3 } });
    map.addLayer({ id: "highlight-line", type: "line", source: "highlight", paint: { "line-color": "#1d4ed8", "line-width": 2 } });
});

// 7. GIỮ NGUYÊN TOÀN BỘ LOGIC CLICK CỐT LÕI CỦA BẠN
map.on("click", async (e) => {
    clearPreviousHighlight();
    if (ranhGioiFeatures.length === 0) { return alert("Dữ liệu ranh giới chưa sẵn sàng."); }

    const { lng, lat } = e.lngLat;
    const point = turf.point([lng, lat]);

    let foundXa = ranhGioiFeatures.find(xa => turf.booleanPointInPolygon(point, xa));
    if (!foundXa) { return; }

    const maXa = foundXa.properties.MaXa;
    if (!loadedGeojson[maXa]) {
        try {
            const res = await fetch(`/geojson/${maXa}.geojson`);
            if (!res.ok) throw new Error('File not found');
            loadedGeojson[maXa] = await res.json();
        } catch (error) {
            console.error(`Không thể tải GeoJSON cho xã ${maXa}`);
            return;
        }
    }

    const features = loadedGeojson[maXa].features;
    const foundThua = features.find((f) => f && f.geometry && turf.booleanPointInPolygon(point, f));
    if (!foundThua) { return; }

    map.getSource("highlight").setData(foundThua);

    const line = turf.polygonToLine(foundThua);
    const coords = line.geometry.coordinates;
    coords.forEach((c, i) => {
        if (i === coords.length - 1) return;
        const p1 = c;
        const p2 = coords[i + 1];
        const length = turf.length(turf.lineString([p1, p2]), { units: "meters" });
        if (length < 1) return;
        const mid = turf.midpoint(p1, p2).geometry.coordinates;
        const el = document.createElement("div");
        el.className = "length-label";
        el.style.position = "absolute";
        el.style.background = "rgba(255,255,255,0.8)";
        el.style.padding = "1px 3px";
        el.style.fontSize = "10px";
        el.style.borderRadius = "2px";
        el.style.pointerEvents = "none";
        el.innerText = `${length.toFixed(1)}`;
        document.body.appendChild(el);
        labelElements.push({ el, lngLat: mid });
    });
    map.on("move", updateLabelPositions);
    map.on("zoom", updateLabelPositions);
    updateLabelPositions();

    const props = foundThua.properties;
    const infoDiv = document.getElementById("parcel-info");
    infoDiv.innerHTML = `
      <h4>Thông tin thửa đất</h4>
      <ul>
        <li><strong>Số tờ:</strong> ${props.SoHieuToBanDo || '---'}</li>
        <li><strong>Số thửa:</strong> ${props.SoThuTuThua || '---'}</li>
        <li><strong>Diện tích:</strong> ${props.DienTich ? props.DienTich.toLocaleString() + ' m²' : '---'}</li>
        <li><strong>Loại đất:</strong> ${props.KyHieuMucDichSuDung || '---'}</li>
      </ul>
    `;
});

// 8. LOGIC CHO BỘ ĐIỀU KHIỂN CHỌN BẢN ĐỒ NỀN
const switcher = document.getElementById('basemap-switcher');
const buttons = switcher.querySelectorAll('button');

buttons.forEach(button => {
    button.addEventListener('click', (e) => {
        const styleId = e.target.dataset.style;
        buttons.forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        if (styleId === 'custom') {
            map.setLayoutProperty('stadia-layer', 'visibility', 'none');
            map.setLayoutProperty('satellite-layer', 'visibility', 'none');
        } else if (styleId === 'stadia') {
            map.setLayoutProperty('stadia-layer', 'visibility', 'visible');
            map.setLayoutProperty('satellite-layer', 'visibility', 'none');
        } else if (styleId === 'satellite') {
            map.setLayoutProperty('stadia-layer', 'visibility', 'none');
            map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
        }
    });
});