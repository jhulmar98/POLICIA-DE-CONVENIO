import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
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

/* ================= PUNTOS QR ================= */

const PUNTOS_CONTROL = {
  PARQUE_LA_PERA: {
    id: "PARQUE_LA_PERA",
    nombre: "Parque La Pera",
    lat: -12.106910,
    lng: -77.055361,
    radioMetros: 100
  }
};

/* ================= ELEMENTOS ================= */

const titulo = document.getElementById("titulo");
const msg = document.getElementById("msg");

const start = document.getElementById("start");
const scannerDiv = document.getElementById("scanner");
const datosDiv = document.getElementById("datos");
const fotoDiv = document.getElementById("foto");
const previewDiv = document.getElementById("preview");
const finalDiv = document.getElementById("final");
const estadoDiv = document.getElementById("estado");

const info = document.getElementById("info");
const video = document.getElementById("video");
const imgPreview = document.getElementById("imgPreview");

const btnContinuar = document.getElementById("continuar");
const btnCapturar = document.getElementById("capturar");
const btnRepetirFoto = document.getElementById("repetirFoto");
const btnEnviar = document.getElementById("enviar");

/* ================= VARIABLES ================= */

let puntoActual = null;
let ubicacionActual = null;
let direccionActual = "Dirección no disponible";
let datosPolicia = null;
let scanner = null;
let streamFoto = null;
let fotoBlob = null;
let horaServidor = null;
let guardando = false;

/* ================= UI ================= */

function mostrar(el) {
  el.classList.remove("hidden");
}

function ocultar(el) {
  el.classList.add("hidden");
}

function setMensaje(texto) {
  msg.textContent = texto;
}

function bloquear(btn, texto) {
  btn.disabled = true;
  btn.textContent = texto;
}

function liberar(btn, texto) {
  btn.disabled = false;
  btn.textContent = texto;
}

function mostrarFinal() {
  detenerCamara();

  ocultar(scannerDiv);
  ocultar(datosDiv);
  ocultar(fotoDiv);
  ocultar(previewDiv);
  ocultar(estadoDiv);

  mostrar(finalDiv);

  setTimeout(() => {
    location.reload();
  }, 3000);
}

/* ================= UTILIDADES ================= */

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function esperarHtml5Qrcode() {
  for (let i = 0; i < 30; i++) {
    if (window.Html5Qrcode) return window.Html5Qrcode;
    await esperar(150);
  }

  throw new Error("No se pudo cargar el lector QR.");
}

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

/* ================= HORA SERVIDOR ================= */

async function obtenerHoraServidor() {
  const tempRef = await addDoc(collection(db, "_server_time_requests"), {
    created_at: serverTimestamp()
  });

  for (let i = 0; i < 12; i++) {
    const snap = await getDoc(tempRef);

    if (snap.exists() && snap.data().created_at) {
      return snap.data().created_at.toDate();
    }

    await esperar(300);
  }

  throw new Error("No se pudo obtener hora del servidor.");
}

/* ================= GPS / DIRECCIÓN ================= */

function pedirUbicacion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este navegador no soporta ubicación."));
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
        let mensaje = "No se pudo obtener ubicación.";

        if (error.code === 1) mensaje = "Permiso de ubicación denegado.";
        if (error.code === 2) mensaje = "Active el GPS del teléfono.";
        if (error.code === 3) mensaje = "Tiempo agotado obteniendo ubicación.";

        reject(new Error(mensaje));
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      }
    );
  });
}

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

async function obtenerDireccion(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.address) {
      const calle =
        data.address.road ||
        data.address.pedestrian ||
        data.address.footway ||
        data.address.neighbourhood ||
        data.address.suburb ||
        "";

      const distrito =
        data.address.city_district ||
        data.address.city ||
        data.address.town ||
        "";

      return `${calle} ${distrito}`.trim() || data.display_name || "Dirección no disponible";
    }

    return data.display_name || "Dirección no disponible";
  } catch {
    return "Dirección no disponible";
  }
}

/* ================= PERMISOS ================= */

async function pedirCamaraTemporal() {
  const tempStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });

  tempStream.getTracks().forEach(track => track.stop());
}

/* ================= QR POLICÍA ================= */

function parsearQrPolicia(raw) {
  const partes = raw.split(",").map(v => v.trim()).filter(Boolean);

  if (partes.length < 3) {
    throw new Error("QR inválido. Formato: DNI, NOMBRE, CARGO");
  }

  const dni = partes[0];
  const nombre = partes[1];
  const cargo = partes.slice(2).join(", ");

  if (!/^\d{8}$/.test(dni)) {
    throw new Error("DNI inválido. Debe tener 8 dígitos.");
  }

  return { dni, nombre, cargo };
}

async function iniciarScannerPolicia() {
  setMensaje("Escanee el QR del policía.");
  mostrar(scannerDiv);

  const Html5Qrcode = await esperarHtml5Qrcode();
  scanner = new Html5Qrcode("qr-reader");

  await scanner.start(
    { facingMode: "environment" },
    {
      fps: 20,
      qrbox: { width: 340, height: 340 },
      aspectRatio: 1,
      disableFlip: false
    },
    async decodedText => {
      try {
        if (navigator.vibrate) navigator.vibrate(100);

        datosPolicia = parsearQrPolicia(decodedText);

        await scanner.stop();
        scanner.clear();

        ocultar(scannerDiv);

        info.innerHTML = `
          <strong>${datosPolicia.nombre}</strong>
          DNI: ${datosPolicia.dni}<br>
          Cargo: ${datosPolicia.cargo}
        `;

        mostrar(datosDiv);
        setMensaje("QR validado correctamente.");
      } catch (error) {
        setMensaje(error.message);
      }
    },
    () => {}
  );
}

/* ================= CÁMARA FRONTAL ================= */

async function abrirCamaraFrontal() {
  ocultar(datosDiv);
  mostrar(fotoDiv);

  setMensaje("Tome la foto de evidencia.");

  streamFoto = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 1280 }
    },
    audio: false
  });

  video.srcObject = streamFoto;
}

function detenerCamara() {
  if (!streamFoto) return;

  streamFoto.getTracks().forEach(track => track.stop());
  streamFoto = null;
}

/* ================= FOTO QUEMADA ================= */

function dibujarTexto(ctx, texto, x, y, maxWidth, lineHeight) {
  const palabras = texto.split(" ");
  let linea = "";

  for (let i = 0; i < palabras.length; i++) {
    const prueba = linea + palabras[i] + " ";

    if (ctx.measureText(prueba).width > maxWidth && i > 0) {
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

async function capturarFotoQuemada() {
  const videoW = video.videoWidth || 1280;
  const videoH = video.videoHeight || 1280;
  const size = Math.min(videoW, videoH);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");

  const sx = (videoW - size) / 2;
  const sy = (videoH - size) / 2;

  ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

  const lineas = [
    `LAT: ${ubicacionActual.lat.toFixed(6)}  LONG: ${ubicacionActual.lng.toFixed(6)}`,
    direccionActual,
    `${fechaVista(horaServidor)} ${horaVista(horaServidor)}`
  ];

  const fontSize = Math.max(10, Math.floor(size * 0.016));
  const lineHeight = fontSize + 4;
  const padding = 10;
  const boxHeight = lineas.length * lineHeight + padding * 2;

  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(0, size - boxHeight, size, boxHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${fontSize}px Arial`;
  ctx.textBaseline = "top";

  let y = size - boxHeight + padding;

  for (const linea of lineas) {
    y = dibujarTexto(ctx, linea, padding, y, size - padding * 2, lineHeight);
  }

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.9);
  });
}

/* ================= ENTRADA / SALIDA ================= */

async function obtenerTipoRegistro(dni, fechaDocTexto) {
  const turnos = ["T1", "T2", "T3"];

  for (const turno of turnos) {
    const snap = await getDocs(
      collection(db, "policia_convenio", fechaDocTexto, turno)
    );

    for (const d of snap.docs) {
      if (d.data().dni === dni) {
        return "SALIDA";
      }
    }
  }

  return "ENTRADA";
}

/* ================= STORAGE ================= */

async function subirFoto(blob, ruta) {
  const fotoRef = ref(storage, ruta);

  await uploadBytes(fotoRef, blob, {
    contentType: "image/jpeg"
  });

  return await getDownloadURL(fotoRef);
}

/* ================= BOTONES ================= */

start.addEventListener("click", async () => {
  bloquear(start, "VALIDANDO...");

  try {
    const params = new URLSearchParams(window.location.search);
    const puntoId = params.get("punto") || "PARQUE_LA_PERA";

    puntoActual = PUNTOS_CONTROL[puntoId];

    if (!puntoActual) {
      throw new Error("QR del local no reconocido.");
    }

    titulo.textContent = puntoActual.nombre;

    setMensaje("Solicitando cámara y ubicación...");

    await pedirCamaraTemporal();

    ubicacionActual = await pedirUbicacion();

    const distancia = calcularDistanciaMetros(
      ubicacionActual.lat,
      ubicacionActual.lng,
      puntoActual.lat,
      puntoActual.lng
    );

    if (distancia > puntoActual.radioMetros) {
      throw new Error(`Fuera del rango permitido. Distancia aproximada: ${Math.round(distancia)} metros.`);
    }

    direccionActual = await obtenerDireccion(ubicacionActual.lat, ubicacionActual.lng);

    setMensaje(`Ubicación validada. Distancia: ${Math.round(distancia)} m`);

    ocultar(estadoDiv);

    await iniciarScannerPolicia();
  } catch (error) {
    liberar(start, "INICIAR VALIDACIÓN");
    setMensaje(error.message || "No se pudo iniciar.");
  }
});

btnContinuar.addEventListener("click", async () => {
  try {
    await abrirCamaraFrontal();
  } catch {
    setMensaje("No se pudo abrir la cámara frontal.");
  }
});

btnCapturar.addEventListener("click", async () => {
  try {
    bloquear(btnCapturar, "PROCESANDO...");

    horaServidor = await obtenerHoraServidor();

    fotoBlob = await capturarFotoQuemada();

    detenerCamara();

    imgPreview.src = URL.createObjectURL(fotoBlob);

    ocultar(fotoDiv);
    mostrar(previewDiv);

    setMensaje("Revise la foto y presione enviar.");
  } catch (error) {
    liberar(btnCapturar, "TOMAR FOTO");
    setMensaje(error.message || "No se pudo capturar la foto.");
  }
});

btnRepetirFoto.addEventListener("click", async () => {
  fotoBlob = null;
  imgPreview.removeAttribute("src");

  ocultar(previewDiv);
  liberar(btnCapturar, "TOMAR FOTO");

  await abrirCamaraFrontal();
});

btnEnviar.addEventListener("click", async () => {
  if (guardando) return;

  guardando = true;
  bloquear(btnEnviar, "ENVIANDO...");

  try {
    if (!fotoBlob) throw new Error("Primero capture la foto.");

    if (!horaServidor) {
      horaServidor = await obtenerHoraServidor();
    }

    const turno = turnoOperativo(horaServidor);
    const fechaDocumento = fechaDoc(turno.fechaTurno);
    const tipoRegistro = await obtenerTipoRegistro(datosPolicia.dni, fechaDocumento);

    const docId = `${datosPolicia.dni}_${tipoRegistro}_${turno.turno}_${horaServidor.getTime()}`;

    const rutaFoto = `policia_convenio_fotos/${fechaDocumento}/${turno.turno}/${docId}.jpg`;
    const fotoUrl = await subirFoto(fotoBlob, rutaFoto);

    const data = {
      dni: datosPolicia.dni,
      nombre: datosPolicia.nombre,
      cargo: datosPolicia.cargo,

      tipo: tipoRegistro,
      turno: turno.turno,
      turno_nombre: turno.nombre,

      fecha_turno: fechaVista(turno.fechaTurno),
      fecha_registro: fechaVista(horaServidor),
      hora: horaVista(horaServidor),

      lat: ubicacionActual.lat,
      lng: ubicacionActual.lng,
      direccion: direccionActual,

      observacion: `Registro web - ${puntoActual.nombre}`,
      mensaje: `Registro web - ${puntoActual.nombre}`,

      foto_url: fotoUrl,
      foto_storage_path: rutaFoto,

      fuente: "WEB_QR",
      punto_id: puntoActual.id,
      punto_nombre: puntoActual.nombre,

      timestamp: serverTimestamp(),
      timestamp_referencial_servidor: Timestamp.fromDate(horaServidor)
    };

    await setDoc(
      doc(db, "policia_convenio", fechaDocumento, turno.turno, docId),
      data
    );

    ocultar(previewDiv);
    mostrarFinal();
  } catch (error) {
    guardando = false;
    liberar(btnEnviar, "ENVIAR REGISTRO");
    setMensaje(error.message || "No se pudo guardar.");
  }
});

window.addEventListener("beforeunload", () => {
  detenerCamara();

  if (scanner) {
    try {
      scanner.stop();
    } catch {}
  }
});
