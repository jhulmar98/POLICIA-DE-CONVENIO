import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/* ================= FIREBASE ================= */

const firebaseConfig = {
  apiKey: "AIzaSyCkNbamNjoe4HjTnu9XyiWojDFzO7KSNUA",
  authDomain: "municipalidad-msi.firebaseapp.com",
  projectId: "municipalidad-msi",
  storageBucket: "municipalidad-msi.firebasestorage.app",
  messagingSenderId: "200816039529",
  appId: "1:200816039529:web:83900cd4a0de208858b4f8",
  measurementId: "G-GDB4SNMMJL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

/* ================= PUNTOS FIJOS ================= */

const PUNTOS_CONTROL = {
  PARQUE_LA_PERA: {
    id: "PARQUE_LA_PERA",
    nombre: "Parque La Pera",
    lat: -12.106910,
    lng: -77.055361,
    direccion: "Parque La Pera",
    radioMetros: 100
  }
};

/* ================= ESTADO GLOBAL ================= */

let puntoActual = null;
let ubicacionActual = null;
let direccionActual = "Dirección no disponible";
let datosPolicia = null;
let qrScanner = null;
let streamFoto = null;
let horaServidor = null;

/* ================= ELEMENTOS ================= */

const tituloPunto = document.getElementById("tituloPunto");
const subtitulo = document.getElementById("subtitulo");

const estadoCard = document.getElementById("estadoCard");
const estadoIcon = document.getElementById("estadoIcon");
const estadoTitulo = document.getElementById("estadoTitulo");
const estadoTexto = document.getElementById("estadoTexto");

const scannerSection = document.getElementById("scannerSection");
const confirmSection = document.getElementById("confirmSection");
const fotoSection = document.getElementById("fotoSection");
const resultadoSection = document.getElementById("resultadoSection");

const dniText = document.getElementById("dniText");
const nombreText = document.getElementById("nombreText");
const cargoText = document.getElementById("cargoText");

const btnAbrirCamara = document.getElementById("btnAbrirCamara");
const btnTomarFoto = document.getElementById("btnTomarFoto");

const videoFoto = document.getElementById("videoFoto");
const canvasFoto = document.getElementById("canvasFoto");
const previewFoto = document.getElementById("previewFoto");

/* ================= UTILIDADES ================= */

function setEstado(tipo, icono, titulo, texto) {
  estadoCard.classList.remove("status-ok", "status-error", "status-warning");

  if (tipo === "ok") estadoCard.classList.add("status-ok");
  if (tipo === "error") estadoCard.classList.add("status-error");
  if (tipo === "warning") estadoCard.classList.add("status-warning");

  estadoIcon.textContent = icono;
  estadoTitulo.textContent = titulo;
  estadoTexto.textContent = texto;
}

function mostrar(section) {
  section.classList.remove("hidden");
}

function ocultar(section) {
  section.classList.add("hidden");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatoFechaDoc(fecha) {
  return `${pad(fecha.getDate())}-${pad(fecha.getMonth() + 1)}-${fecha.getFullYear()}`;
}

function formatoFechaVista(fecha) {
  return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
}

function formatoHoraVista(fecha) {
  return `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}

function turnoOperativo(fecha) {
  const h = fecha.getHours();

  if (h >= 7 && h < 15) {
    return {
      turno: "T1",
      nombre: "PRIMER TURNO",
      fechaTurno: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()),
      inicio: "07:00",
      fin: "15:00"
    };
  }

  if (h >= 15 && h < 23) {
    return {
      turno: "T2",
      nombre: "SEGUNDO TURNO",
      fechaTurno: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()),
      inicio: "15:00",
      fin: "23:00"
    };
  }

  if (h >= 23) {
    return {
      turno: "T3",
      nombre: "TERCER TURNO",
      fechaTurno: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()),
      inicio: "23:00",
      fin: "07:00"
    };
  }

  const ayer = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - 1);

  return {
    turno: "T3",
    nombre: "TERCER TURNO",
    fechaTurno: ayer,
    inicio: "23:00",
    fin: "07:00"
  };
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLambda = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(dLambda / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* ================= UBICACIÓN ================= */

function obtenerUbicacionGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este teléfono no soporta geolocalización."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy
        });
      },
      (err) => reject(err),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

async function obtenerDireccion(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url);
    const data = await res.json();

    return data.display_name || "Dirección no disponible";
  } catch (_) {
    return "Dirección no disponible";
  }
}

/* ================= HORA SERVIDOR FIREBASE ================= */

async function obtenerHoraServidor() {
  const refTemp = await addDoc(collection(db, "_server_time_requests"), {
    created_at: serverTimestamp()
  });

  for (let i = 0; i < 10; i++) {
    const snap = await getDoc(refTemp);

    if (snap.exists() && snap.data().created_at) {
      return snap.data().created_at.toDate();
    }

    await new Promise(resolve => setTimeout(resolve, 350));
  }

  throw new Error("No se pudo obtener hora del servidor.");
}

/* ================= QR DEL POLICÍA ================= */

function parsearQrPolicia(raw) {
  const partes = raw.split(",").map(x => x.trim()).filter(Boolean);

  if (partes.length < 3) {
    throw new Error("QR inválido. Debe tener: DNI, NOMBRE, CARGO");
  }

  const dni = partes[0];
  const nombre = partes[1];
  const cargo = partes.slice(2).join(", ");

  if (!/^\d{8}$/.test(dni)) {
    throw new Error("DNI inválido.");
  }

  return { dni, nombre, cargo };
}

async function iniciarScannerPolicia() {
  mostrar(scannerSection);

  qrScanner = new Html5Qrcode("qr-reader");

  await qrScanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1
    },
    async (decodedText) => {
      try {
        datosPolicia = parsearQrPolicia(decodedText);

        await qrScanner.stop();
        qrScanner.clear();

        dniText.textContent = datosPolicia.dni;
        nombreText.textContent = datosPolicia.nombre;
        cargoText.textContent = datosPolicia.cargo;

        ocultar(scannerSection);
        mostrar(confirmSection);

        setEstado(
          "ok",
          "✅",
          "QR del policía validado",
          "Ahora tome la foto de evidencia con la cámara frontal."
        );
      } catch (error) {
        setEstado("error", "❌", "QR inválido", error.message);
      }
    }
  );
}

/* ================= CÁMARA FRONTAL Y FOTO ================= */

async function abrirCamaraFrontal() {
  ocultar(confirmSection);
  mostrar(fotoSection);

  streamFoto = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });

  videoFoto.srcObject = streamFoto;
}

function detenerCamaraFrontal() {
  if (!streamFoto) return;

  streamFoto.getTracks().forEach(track => track.stop());
  streamFoto = null;
}

async function tomarFotoQuemada() {
  const w = videoFoto.videoWidth || 1280;
  const h = videoFoto.videoHeight || 720;

  canvasFoto.width = w;
  canvasFoto.height = h;

  const ctx = canvasFoto.getContext("2d");

  ctx.drawImage(videoFoto, 0, 0, w, h);

  const fecha = formatoFechaVista(horaServidor);
  const hora = formatoHoraVista(horaServidor);

  const lineas = [
    `PUNTO: ${puntoActual.nombre}`,
    `DNI: ${datosPolicia.dni}`,
    `NOMBRE: ${datosPolicia.nombre}`,
    `CARGO: ${datosPolicia.cargo}`,
    `FECHA: ${fecha}`,
    `HORA: ${hora}`,
    `LAT: ${ubicacionActual.lat.toFixed(6)}`,
    `LNG: ${ubicacionActual.lng.toFixed(6)}`,
    `DIR: ${direccionActual}`
  ];

  const padding = 18;
  const fontSize = Math.max(18, Math.floor(w * 0.018));
  const lineHeight = fontSize + 8;
  const boxHeight = lineas.length * lineHeight + padding * 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
  ctx.fillRect(0, h - boxHeight, w, boxHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${fontSize}px Arial`;
  ctx.textBaseline = "top";

  lineas.forEach((linea, i) => {
    const y = h - boxHeight + padding + i * lineHeight;
    ctx.fillText(linea, padding, y, w - padding * 2);
  });

  return new Promise((resolve) => {
    canvasFoto.toBlob(
      (blob) => resolve(blob),
      "image/jpeg",
      0.88
    );
  });
}

/* ================= GUARDADO FIREBASE ================= */

async function subirFoto(blob, ruta) {
  const storageRef = ref(storage, ruta);
  await uploadBytes(storageRef, blob, {
    contentType: "image/jpeg"
  });

  return await getDownloadURL(storageRef);
}

async function guardarRegistro() {
  if (!datosPolicia || !ubicacionActual || !puntoActual) {
    throw new Error("Faltan datos para guardar.");
  }

  btnTomarFoto.disabled = true;
  btnTomarFoto.textContent = "Guardando...";

  setEstado("warning", "⏳", "Guardando registro", "No cierre esta ventana.");

  horaServidor = await obtenerHoraServidor();

  const turno = turnoOperativo(horaServidor);
  const fechaDoc = formatoFechaDoc(turno.fechaTurno);
  const fechaVista = formatoFechaVista(horaServidor);
  const horaVista = formatoHoraVista(horaServidor);

  const fotoBlob = await tomarFotoQuemada();

  const docId = `${datosPolicia.dni}_TARDE_${turno.turno}_${horaServidor.getTime()}`;

  const rutaFoto = `policia_convenio_fotos/${fechaDoc}/${turno.turno}/${docId}.jpg`;

  const fotoUrl = await subirFoto(fotoBlob, rutaFoto);

  await setDoc(
    doc(db, "policia_convenio", fechaDoc, turno.turno, docId),
    {
      dni: datosPolicia.dni,
      nombre: datosPolicia.nombre,
      cargo: datosPolicia.cargo,

      tipo: "TARDE",
      mensaje: "Tarde",
      observacion: "Tarde",

      turno: turno.turno,
      turno_nombre: turno.nombre,
      fecha_turno: formatoFechaVista(turno.fechaTurno),

      fecha_registro: fechaVista,
      hora: horaVista,

      lat: ubicacionActual.lat,
      lng: ubicacionActual.lng,
      precision_gps_metros: ubicacionActual.precision,
      direccion: direccionActual,

      punto_id: puntoActual.id,
      punto_nombre: puntoActual.nombre,
      punto_lat: puntoActual.lat,
      punto_lng: puntoActual.lng,
      radio_permitido_metros: puntoActual.radioMetros,

      foto_url: fotoUrl,
      foto_storage_path: rutaFoto,
      foto_quemada: true,

      fuente_hora: "FIREBASE_SERVER_TIMESTAMP",
      timestamp: serverTimestamp(),
      timestamp_foto_referencial: Timestamp.fromDate(horaServidor),

      estado: "REGISTRADO",
      origen: "WEB_QR_PUNTO"
    }
  );

  detenerCamaraFrontal();

  previewFoto.src = URL.createObjectURL(fotoBlob);

  ocultar(fotoSection);
  mostrar(resultadoSection);

  setEstado(
    "ok",
    "✅",
    "Registro completado",
    "La asistencia tardía fue guardada correctamente."
  );
}

/* ================= INICIO ================= */

async function iniciar() {
  try {
    const params = new URLSearchParams(window.location.search);
    const puntoId = params.get("punto") || "PARQUE_LA_PERA";

    puntoActual = PUNTOS_CONTROL[puntoId];

    if (!puntoActual) {
      setEstado("error", "❌", "Punto no reconocido", "El QR del local no pertenece a un punto registrado.");
      return;
    }

    tituloPunto.textContent = puntoActual.nombre;
    subtitulo.textContent = `Radio permitido: ${puntoActual.radioMetros} metros.`;

    setEstado(
      "warning",
      "📍",
      "Validando ubicación",
      "Permita el acceso GPS para comprobar que está en el punto correcto."
    );

    ubicacionActual = await obtenerUbicacionGPS();

    const distancia = calcularDistanciaMetros(
      ubicacionActual.lat,
      ubicacionActual.lng,
      puntoActual.lat,
      puntoActual.lng
    );

    if (distancia > puntoActual.radioMetros) {
      setEstado(
        "error",
        "🚫",
        "Fuera del rango permitido",
        `Usted está aproximadamente a ${Math.round(distancia)} metros del punto. Debe estar dentro de ${puntoActual.radioMetros} metros.`
      );
      return;
    }

    direccionActual = await obtenerDireccion(
      ubicacionActual.lat,
      ubicacionActual.lng
    );

    setEstado(
      "ok",
      "✅",
      "Ubicación validada",
      `Está dentro del rango permitido. Distancia aproximada: ${Math.round(distancia)} metros.`
    );

    await iniciarScannerPolicia();

  } catch (error) {
    setEstado(
      "error",
      "❌",
      "No se pudo continuar",
      error.message || "Revise permisos de cámara, GPS e internet."
    );
  }
}

/* ================= EVENTOS ================= */

btnAbrirCamara.addEventListener("click", async () => {
  try {
    await abrirCamaraFrontal();
  } catch (_) {
    setEstado("error", "❌", "Error de cámara", "No se pudo abrir la cámara frontal.");
  }
});

btnTomarFoto.addEventListener("click", async () => {
  try {
    await guardarRegistro();
  } catch (error) {
    btnTomarFoto.disabled = false;
    btnTomarFoto.textContent = "Tomar foto y guardar";

    setEstado(
      "error",
      "❌",
      "Error al guardar",
      error.message || "No se pudo registrar la información."
    );
  }
});

window.addEventListener("beforeunload", () => {
  detenerCamaraFrontal();

  if (qrScanner) {
    try {
      qrScanner.stop();
    } catch (_) {}
  }
});

iniciar();
