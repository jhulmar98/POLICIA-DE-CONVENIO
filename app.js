import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ================= FIREBASE =================
const firebaseConfig = {
  apiKey: "AIzaSyCkNbamNjoe4HjTnu9XyiWojDFzO7KSNUA",
  authDomain: "municipalidad-msi.firebaseapp.com",
  projectId: "municipalidad-msi",
  storageBucket: "municipalidad-msi.firebasestorage.app",
  messagingSenderId: "200816039529",
  appId: "1:200816039529:web:83900cd4a0de208858b4f8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================= CONFIG PUNTO =================
const PUNTO = {
    nombre: "PARQUE LA PERA",
    lat: -12.106910,
    lng: -77.055361,
    radio: 100 // metros
};

// ================= UI =================
const estado = document.getElementById("estado");
const scannerContainer = document.getElementById("scannerContainer");

// ================= DISTANCIA (HAVERSINE) =================
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// ================= GPS =================
async function obtenerUbicacion() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            pos => resolve(pos),
            err => reject(err),
            { enableHighAccuracy: true }
        );
    });
}

// ================= VALIDACIÓN =================
async function validarUbicacion() {

    try {

        const pos = await obtenerUbicacion();

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        const distancia = calcularDistancia(
            lat, lng,
            PUNTO.lat, PUNTO.lng
        );

        console.log("Distancia:", distancia);

        if (distancia <= PUNTO.radio) {

            estado.innerText = "✔ Dentro del punto: " + PUNTO.nombre;
            estado.classList.add("ok");

            // 🔥 ACTIVA SIGUIENTE FASE
            scannerContainer.classList.remove("hidden");

        } else {

            estado.innerText = "❌ Fuera del rango permitido (100m)";
            estado.classList.add("error");

        }

    } catch (error) {

        estado.innerText = "Error obteniendo ubicación";
        estado.classList.add("error");

    }
}

// ================= INIT =================
validarUbicacion();