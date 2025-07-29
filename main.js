
import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import * as turf from "@turf/turf";

const loadedGeojson = {}; // Lưu cache theo mã xã đã load
let highlightLayer = null;

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      parcels: {
        type: "vector",
        url: "pmtiles://tiles/danang_parcels_final.pmtiles"
      }
    },
    layers: [
      {
        id: "parcel-boundaries",
        type: "line",
        source: "parcels",
        "source-layer": "danang_full",
        paint: {
          "line-color": "#ef4444",
          "line-width": 1
        }
      }
    ]
  },
  center: [108.202167, 16.054456],
  zoom: 14
});

import * as pmtiles from "pmtiles";

let ranhGioiFeatures = [];

async function loadRanhGioi() {
  const res = await fetch("/ranhgioi.geojson");
  const data = await res.json();
  ranhGioiFeatures = data.features;
}

// Gọi load trước khi tương tác
loadRanhGioi();


map.on("load", () => {  

  // Khởi tạo source dạng vector từ .pmtiles
  map.addSource("danang", {
    type: "vector",
    url: "pmtiles:///tiles/danang_parcels_final.pmtiles"
  });

  // Thêm layer hiển thị với source-layer là danang_full
  map.addLayer({
    id: "danang_full",
    type: "line",
    source: "danang",
    "source-layer": "danang_full",
    paint: {
      "line-color": "#ff0000",
      "line-width": 1
    }
  });
  
  fetch("/ranhgioi.geojson")
    .then((res) => res.json())
    .then((data) => {
      ranhGioiFeatures = data.features;
    });

});

function clearPreviousHighlight() {
  if (map.getLayer("highlight-fill")) map.removeLayer("highlight-fill");
  if (map.getLayer("highlight-line")) map.removeLayer("highlight-line");
  if (map.getSource("highlight")) map.removeSource("highlight");

  document.querySelectorAll(".length-label").forEach((el) => el.remove());
  labelElements = []; // clear bộ nhớ nhãn
  map.off("move", updateLabelPositions);
  map.off("zoom", updateLabelPositions);
}



map.on("click", async (e) => {
  clearPreviousHighlight(); // ← THÊM DÒNG NÀY Ở ĐÂU TIÊN!
   if (ranhGioiFeatures.length === 0) {
    alert("Dữ liệu ranh giới chưa sẵn sàng. Vui lòng thử lại sau.");
    return;
  }
  const { lng, lat } = e.lngLat;
  const point = turf.point([lng, lat]);
  
  // 1. Tìm xã chứa điểm
  let foundXa = null;
  for (const xa of ranhGioiFeatures) {
    if (turf.booleanPointInPolygon(point, xa)) {
      foundXa = xa;
      break;
    }
  }

  if (!foundXa) {
    alert("Không xác định được xã/phường.");
    return;
  }

  const maXa = foundXa.properties.MaXa;
  const filePath = `/geojson/${maXa}.geojson`;

  // 2. Load GeoJSON xã nếu chưa có
  if (!loadedGeojson[maXa]) {
    const res = await fetch(filePath);
    const data = await res.json();
    loadedGeojson[maXa] = data;
  }

  // 3. Tìm thửa chứa điểm
  const features = loadedGeojson[maXa].features;
  const foundThua = features.find((f) => f && f.geometry && turf.booleanPointInPolygon(point, f));
  

  if (!foundThua) {
    alert("Không tìm thấy thửa đất.");
    return;
  }

  // 4. Vẽ polygon thửa đất
  if (map.getSource("highlight")) {
    map.getSource("highlight").setData(foundThua);
  } else {
    map.addSource("highlight", {
      type: "geojson",
      data: foundThua,
    });

    map.addLayer({
      id: "highlight-fill",
      type: "fill",
      source: "highlight",
      paint: {
        "fill-color": "#3b82f6",
        "fill-opacity": 0.3,
      },
    });

    map.addLayer({
      id: "highlight-line",
      type: "line",
      source: "highlight",
      paint: {
        "line-color": "#1d4ed8",
        "line-width": 2,
      },
    });
  }

  // 5. Vẽ kích thước các cạnh
  const line = turf.polygonToLine(foundThua);
  const coords = line.geometry.coordinates;
  const labels = []; // lưu thông tin nhãn (tọa độ + text)

  coords.forEach((c, i) => {
    if (i === coords.length - 1) return;

    const p1 = c;
    const p2 = coords[i + 1];

    const length = turf.length(turf.lineString([p1, p2]), { units: "meters" });
    const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

    const el = document.createElement("div");
    el.className = "length-label";
    el.style.position = "absolute";
    el.style.background = "white";
    el.style.padding = "2px 4px";
    el.style.fontSize = "10px";
    el.style.pointerEvents = "none";
    el.innerText = `${length.toFixed(1)}`;

    document.body.appendChild(el);
    labels.push({ el, lngLat: mid });
    // 6. Hiển thị thông tin thuộc tính
    const props = foundThua.properties;
    const infoDiv = document.getElementById("parcel-info");

    infoDiv.innerHTML = `
      <ul style="margin: 0; padding: 0 0 0 1em;">
        <li><strong>Số tờ:</strong> ${props.SoHieuToBanDo || '---'}</li>
        <li><strong>Số thửa:</strong> ${props.SoThuTuThua || '---'}</li>
        <li><strong>Diện tích:</strong> ${props.DienTich ? props.DienTich.toLocaleString() + ' m²' : '---'}</li>
        <li><strong>Loại đất:</strong> ${props.KyHieuMucDichSuDung || '---'}</li>
        <li><strong>Địa chỉ:</strong> ${props.DiaChi || '---'}</li>
      </ul>
    `;

    labelElements = labels; // gán vào biến toàn cục
    updateLabelPositions(); // gọi ngay sau khi vẽ nhãn

  });

  // Xóa nhãn cũ nếu có khi pan
  const removeOldLabels = () => {
    document.querySelectorAll(".length-label").forEach((el) => el.remove());
  };

  

});

let labelElements = [];

function updateLabelPositions() {
  labelElements.forEach(({ el, lngLat }) => {
    const pixel = map.project(lngLat);
    el.style.left = pixel.x + "px";
    el.style.top = pixel.y + "px";
  });
  map.on("move", updateLabelPositions);
  map.on("zoom", updateLabelPositions);
}




