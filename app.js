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

/* ================= PUNTO FIJO ================= */

const PUNTOS_CONTROL = {
  PARQUE_LA_PERA: {
    id: "PARQUE_LA_PERA",
    nombre: "Parque La Pera",
    lat: -12.106910,
    lng: -77.055361,
    direccionReferencia: "Parque La Pera",
    radioMetros: 100
  }
};

/* ================= VARIABLES ================= */

let puntoActual = null;
let ubicacionActual = null;
let direccionActual = "Dirección no disponible";
let datosPolicia = null;
let scanner = null;
let streamFoto = null;
let horaServidor = null;

/* ================= HTML ================= */

const tituloPunto = document.getElementById("tituloPunto");
const subtituloPunto = document.getElementById("subtituloPunto");

const estadoCard = document.getElementById("estadoCard");
const estadoIcon = document.getElementById("estadoIcon");
const estadoTitulo = document.getElementById("estadoTitulo");
const estadoTexto = document.getElementById("estadoTexto");

const btnIniciar = document.getElementById("btnIniciar");
const btnAbrirCamara = document.getElementById("btnAbrirCamara");
const btnTomarFoto = document.getElementById("btnTomarFoto");

const scannerSection = document.getElementById("scannerSection");
const datosSection = document.getElementById("datosSection");
const fotoSection = document.getElementById("fotoSection");
const finalSection = document.getElementById("finalSection");

const dniText = document.getElementById("dniText");
const nombreText = document.getElementById("nombreText");
const cargoText = document.getElementById("cargoText");

const videoFoto = document.getElementById("videoFoto");
const canvasFoto = document.getElementById("canvasFoto");
const previewFoto = document.getElementById("previewFoto");

/* ================= UI ================= */

function mostrar(el) {
  el.classList.remove("hidden");
}

function ocultar(el) {
  el.classList.add("hidden");
}

function setEstado(tipo, icono, titulo, texto) {
  estadoCard.classList.remove("status-ok", "status-error", "status-warning");

  if (tipo === "ok") estadoCard.classList.add("status-ok");
  if (tipo === "error") estadoCard.classList.add("status-error");
  if (tipo === "warning") estadoCard.classList.add("status-warning");

  estadoIcon.textContent = icono;
  estadoTitulo.textContent = titulo;
  estadoTexto.textContent = texto;
}

/* ================= FECHA / TURNO ================= */

function pad(n) {
  return String(n).padStart(2, "0");
}

function fechaDoc(fecha) {
  return `${pad(fecha.getDate())}-${pad(fecha.getMonth() + 1)}-${fecha.getFullYear()}`;
}

function fechaVista(fecha) {
  return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
}

function horaVista(fecha) {
  return `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}

function turnoOperativo(fecha) {
  const h = fecha.getHours();

  if (h >= 7 && h < 15) {
    return {
      turno: "T1",
      nombre: "PRIMER TURNO",
      fechaTurno: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
    };
  }

  if (h >= 15 && h < 23) {
    return {
      turno: "T2",
      nombre: "SEGUNDO TURNO",
      fechaTurno: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
    };
  }

  if (h >= 23) {
    return {
      turno: "T3",
      nombre: "TERCER TURNO",
      fechaTurno: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
    };
  }

  return {
    turno: "T3",
    nombre: "TERCER TURNO",
    fechaTurno: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - 1)
  };
}

/* ================= DISTANCIA ================= */

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) *
    Math.sin(dl / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ================= GPS ================= */

function pedirUbicacion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este navegador no soporta ubicación GPS."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy
        });
      },
      error => {
        let msg = "No se pudo obtener la ubicación.";

        if (error.code === 1) {
          msg = "Permiso de ubicación denegado. Actívalo en los permisos del navegador.";
        }

        if (error.code === 2) {
          msg = "Ubicación no disponible. Activa el GPS del teléfono.";
        }

        if (error.code === 3) {
          msg = "Tiempo agotado obteniendo ubicación. Intenta nuevamente al aire libre.";
        }

        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
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

/* ================= HORA SERVIDOR ================= */

async function obtenerHoraServidor() {
  const tempRef = await addDoc(collection(db, "_server_time_requests"), {
    created_at: serverTimestamp()
  });

  for (let i = 0; i < 10; i++) {
    const snap = await getDoc(tempRef);

    if (snap.exists() && snap.data().created_at) {
      return snap.data().created_at.toDate();
    }

    await new Promise(resolve => setTimeout(resolve, 350));
  }

  throw new Error("No se pudo obtener hora del servidor.");
}

/* ================= QR POLICÍA ================= */

function parsearQrPolicia(raw) {
  const partes = raw.split(",").map(v => v.trim()).filter(Boolean);

  if (partes.length < 3) {
    throw new Error("QR inválido. Debe ser: DNI, NOMBRE, CARGO");
  }

  const dni = partes[0];
  const nombre = partes[1];
  const cargo = partes.slice(2).join(", ");

  if (!/^\d{8}$/.test(dni)) {
    throw new Error("El DNI debe tener 8 dígitos.");
  }

  return { dni, nombre, cargo };
}

async function iniciarScannerPolicia() {
  mostrar(scannerSection);

  scanner = new Html5Qrcode("qr-reader");

  await scanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1
    },
    async decodedText => {
      try {
        datosPolicia = parsearQrPolicia(decodedText);

        await scanner.stop();
        scanner.clear();

        dniText.textContent = datosPolicia.dni;
        nombreText.textContent = datosPolicia.nombre;
        cargoText.textContent = datosPolicia.cargo;

        ocultar(scannerSection);
        mostrar(datosSection);

        setEstado(
          "ok",
          "✅",
          "QR del policía validado",
          "Ahora active la cámara frontal para tomar la foto."
        );
      } catch (error) {
        setEstado("error", "❌", "QR inválido", error.message);
      }
    }
  );
}

/* ================= CÁMARA FRONTAL ================= */

async function abrirCamaraFrontal() {
  streamFoto = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });

  videoFoto.srcObject = streamFoto;

  ocultar(datosSection);
  mostrar(fotoSection);

  setEstado(
    "warning",
    "📷",
    "Foto requerida",
    "Centre el rostro y presione tomar foto."
  );
}

function detenerCamara() {
  if (streamFoto) {
    streamFoto.getTracks().forEach(track => track.stop());
    streamFoto = null;
  }
}

/* ================= FOTO QUEMADA ================= */

function dibujarTexto(ctx, texto, x, y, maxWidth, lineHeight) {
  const palabras = texto.split(" ");
  let linea = "";

  for (let i = 0; i < palabras.length; i++) {
    const prueba = linea + palabras[i] + " ";
    const medida = ctx.measureText(prueba).width;

    if (medida > maxWidth && i > 0) {
      ctx.fillText(linea, x, y);
      linea = palabras[i] + " ";
      y += lineHeight;
    } else {
      linea = prueba;
    }
  }

  ctx.fillText(linea, x, y);
  return y + lineHeight;
}

async function tomarFotoQuemada() {
  const w = videoFoto.videoWidth || 1280;
  const h = videoFoto.videoHeight || 720;

  canvasFoto.width = w;
  canvasFoto.height = h;

  const ctx = canvasFoto.getContext("2d");
  ctx.drawImage(videoFoto, 0, 0, w, h);

  const lineas = [
    `PUNTO: ${puntoActual.nombre}`,
    `DNI: ${datosPolicia.dni}`,
    `NOMBRE: ${datosPolicia.nombre}`,
    `CARGO: ${datosPolicia.cargo}`,
    `FECHA: ${fechaVista(horaServidor)}`,
    `HORA: ${horaVista(horaServidor)}`,
    `LAT: ${ubicacionActual.lat.toFixed(6)}`,
    `LNG: ${ubicacionActual.lng.toFixed(6)}`,
    `DIRECCIÓN: ${direccionActual}`
  ];

  const fontSize = Math.max(18, Math.floor(w * 0.018));
  const lineHeight = fontSize + 8;
  const padding = 18;
  const boxHeight = Math.min(h * 0.48, lineas.length * lineHeight + padding * 3);

  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, h - boxHeight, w, boxHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${fontSize}px Arial`;
  ctx.textBaseline = "top";

  let y = h - boxHeight + padding;

  for (const linea of lineas) {
    y = dibujarTexto(ctx, linea, padding, y, w - padding * 2, lineHeight);
  }

  return new Promise(resolve => {
    canvasFoto.toBlob(blob => resolve(blob), "image/jpeg", 0.88);
  });
}

/* ================= GUARDAR ================= */

async function subirFoto(blob, ruta) {
  const fotoRef = ref(storage, ruta);

  await uploadBytes(fotoRef, blob, {
    contentType: "image/jpeg"
  });

  return await getDownloadURL(fotoRef);
}

async function guardarRegistro() {
  btnTomarFoto.disabled = true;
  btnTomarFoto.textContent = "Guardando...";

  setEstado("warning", "⏳", "Guardando", "No cierre esta ventana.");

  horaServidor = await obtenerHoraServidor();

  const turno = turnoOperativo(horaServidor);
  const fechaDocumento = fechaDoc(turno.fechaTurno);

  const docId = `${datosPolicia.dni}_TARDE_${turno.turno}_${horaServidor.getTime()}`;

  const blobFoto = await tomarFotoQuemada();

  const rutaFoto = `policia_convenio_fotos/${fechaDocumento}/${turno.turno}/${docId}.jpg`;
  const fotoUrl = await subirFoto(blobFoto, rutaFoto);

  await setDoc(
    doc(db, "policia_convenio", fechaDocumento, turno.turno, docId),
    {
      dni: datosPolicia.dni,
      nombre: datosPolicia.nombre,
      cargo: datosPolicia.cargo,

      tipo: "TARDE",
      mensaje: "Tarde",
      observacion: "Tarde",

      turno: turno.turno,
      turno_nombre: turno.nombre,
      fecha_turno: fechaVista(turno.fechaTurno),

      fecha_registro: fechaVista(horaServidor),
      hora: horaVista(horaServidor),

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
      origen: "WEB_QR_LOCAL"
    }
  );

  detenerCamara();

  previewFoto.src = URL.createObjectURL(blobFoto);

  ocultar(fotoSection);
  mostrar(finalSection);

  setEstado(
    "ok",
    "✅",
    "Registro completado",
    "La información fue guardada correctamente."
  );
}

/* ================= FLUJO PRINCIPAL ================= */

async function iniciarFlujo() {
  btnIniciar.disabled = true;
  btnIniciar.textContent = "Validando...";

  try {
    const params = new URLSearchParams(window.location.search);
    const puntoId = params.get("punto") || "PARQUE_LA_PERA";

    puntoActual = PUNTOS_CONTROL[puntoId];

    if (!puntoActual) {
      throw new Error("El QR del local no corresponde a un punto registrado.");
    }

    tituloPunto.textContent = puntoActual.nombre;
    subtituloPunto.textContent = `Radio permitido: ${puntoActual.radioMetros} metros.`;

    setEstado(
      "warning",
      "📍",
      "Validando GPS",
      "Acepta el permiso de ubicación del teléfono."
    );

    

    const distancia = calcularDistanciaMetros(
      ubicacionActual.lat,
      ubicacionActual.lng,
      puntoActual.lat,
      puntoActual.lng
    );

    if (distancia > puntoActual.radioMetros) {
      throw new Error(
        `Fuera del rango permitido. Distancia aproximada: ${Math.round(distancia)} metros.`
      );
    }

    direccionActual = await obtenerDireccion(
      ubicacionActual.lat,
      ubicacionActual.lng
    );

    ocultar(btnIniciar);

    setEstado(
      "ok",
      "✅",
      "Ubicación validada",
      `Está dentro del rango permitido. Distancia aproximada: ${Math.round(distancia)} metros.`
    );

    await iniciarScannerPolicia();

  } catch (error) {
    btnIniciar.disabled = false;
    btnIniciar.textContent = "Intentar nuevamente";

    setEstado(
      "error",
      "❌",
      "No se pudo continuar",
      error.message || "Revise permisos de ubicación, cámara e internet."
    );
  }
}

/* ================= EVENTOS ================= */

btnIniciar.addEventListener("click", async () => {

  btnIniciar.disabled = true;
  btnIniciar.textContent = "Activando sistema...";

  try {

    // 🔥 1. FORZAR PERMISO CÁMARA
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());

    // 🔥 2. PEDIR GPS UNA SOLA VEZ
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true
      });
    });

    ubicacionActual = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      precision: pos.coords.accuracy
    };

    // 🔥 3. CONTINUAR
    await iniciarFlujo();

  } catch (error) {

    btnIniciar.disabled = false;
    btnIniciar.textContent = "Reintentar";

    setEstado(
      "error",
      "🚫",
      "Permisos bloqueados",
      "Debes activar cámara y ubicación en el navegador."
    );
  }

});

btnAbrirCamara.addEventListener("click", async () => {
  try {
    await abrirCamaraFrontal();
  } catch (_) {
    setEstado(
      "error",
      "❌",
      "Cámara bloqueada",
      "Permite el acceso a la cámara desde el navegador."
    );
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
      error.message || "No se pudo guardar el registro."
    );
  }
});

window.addEventListener("beforeunload", () => {
  detenerCamara();

  if (scanner) {
    try {
      scanner.stop();
    } catch (_) {}
  }
});
