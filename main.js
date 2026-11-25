// ==========================================
// 1. REFERENCIAS AL DOM
// ==========================================
const videoMp = document.getElementById('video-mp');
const videoCv = document.getElementById('video-cv');
const ventanaMp = document.getElementById('ventana-mp');
const pointer = document.getElementById('puntero');
const loadingText = document.getElementById('loading-text');

// ==========================================
// 2. CONFIGURACIÓN DE RENDIMIENTO
// ==========================================
const canvasLigero = document.createElement('canvas');
const ctx = canvasLigero.getContext('2d', { willReadFrequently: true });

let faceMesh;
let lastProcessTime = 0;
const FPS_LIMIT = 20;
const frameInterval = 1000 / FPS_LIMIT;
let isProcessingMp = false;

// Resolución reducida para el análisis de movimiento
const ALTO_ANALISIS = 240;

// Sensibilidad del sensor de movimiento
const UMBRAL_PIXEL = 15;          // Diferencia mínima de brillo por píxel (antes 25)
const UMBRAL_MOVIMIENTO = 0.8;    // % mínimo de píxeles cambiados para reaccionar (antes 2)
const FACTOR_OSCURECER = 12;      // Cuánto oscurece cada % de movimiento (antes 6)
const BLUR_KERNEL = 15;           // Desenfoque previo; menor = detecta movimientos más finos (antes 21)

// Estado de la cámara
const btnCamara = document.getElementById('btn-camara');
const carcasa = document.querySelector('.carcasa');
const avisoApagado = document.getElementById('aviso-apagado');
let streamActual = null;
let rafId = null;
let primeraCarga = true;
let anchoAnalisis = 0;

// Matrices de OpenCV reutilizadas (se crean una sola vez, no en cada frame)
let matSrc = null, matGray = null, matPrev = null, matDiff = null, matThresh = null;
let blurSize = null;
let hayFramePrevio = false;

// Tamaño del visor cacheado (evita leer el layout en cada actualización del puntero)
let ventanaW = ventanaMp.clientWidth;
let ventanaH = ventanaMp.clientHeight;
new ResizeObserver(([entry]) => {
    ventanaW = entry.contentRect.width;
    ventanaH = entry.contentRect.height;
}).observe(ventanaMp);

// ==========================================
// ESTADO DEL USUARIO (La conexión entre sistemas)
// ==========================================
let usuarioEnfocado = false;      // ¿Está mirando la pantalla?
let nivelMovimiento = 0;          // Porcentaje de movimiento en el entorno
let opacidadActual = 100;         // Opacidad actual (comienza visible)
let opacidadAplicada = -1;        // Último valor escrito en el DOM

// ==========================================
// 3. INICIALIZACIÓN DE MEDIAPIPE (Gaze Tracking)
// ==========================================
let lastPointerUpdate = 0;
const POINTER_DELAY_MS = 150;
const THRESHOLD_ENFOQUE = 0.4;    // Umbral para detectar si mira la pantalla

function iniciarMediaPipe() {
    loadingText.innerText = "Inicializando MediaPipe...";

    faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

        const landmarks = results.multiFaceLandmarks[0];

        const nose = landmarks[1];
        const leftEdge = landmarks[234];
        const rightEdge = landmarks[454];
        const topEdge = landmarks[10];
        const bottomEdge = landmarks[152];

        const faceWidth = rightEdge.x - leftEdge.x;
        const yawRatio = (nose.x - leftEdge.x) / faceWidth;

        const faceHeight = bottomEdge.y - topEdge.y;
        const pitchRatio = (nose.y - topEdge.y) / faceHeight;

        // ==========================================
        // DETECCIÓN DE ENFOQUE EN PANTALLA
        // ==========================================
        // Si el pitch es alto (mirando hacia abajo) y el yaw es centrado = mirando la pantalla
        const mirandoAbajo = pitchRatio > THRESHOLD_ENFOQUE;
        const mirandoCentrado = Math.abs(yawRatio - 0.5) < 0.3;
        usuarioEnfocado = mirandoAbajo && mirandoCentrado;

        // ==========================================
        // VISUALIZACIÓN DEL PUNTERO
        // ==========================================
        const currentTime = performance.now();
        if (currentTime - lastPointerUpdate > POINTER_DELAY_MS) {
            lastPointerUpdate = currentTime;

            let screenX = 0.5 - (yawRatio - 0.5) * 3;
            let screenY = 0.5 + (pitchRatio - 0.5) * 3;

            screenX = Math.max(0, Math.min(1, screenX));
            screenY = Math.max(0, Math.min(1, screenY));

            // transform se compone en GPU; top/left forzaban recalcular layout
            pointer.style.transform =
                `translate3d(${(screenX * ventanaW).toFixed(1)}px, ${(screenY * ventanaH).toFixed(1)}px, 0)`;

            // Color del puntero según si está enfocado (definido en CSS)
            pointer.classList.toggle('desenfocado', !usuarioEnfocado);
        }
    });

    verificarMotores();
}

// ==========================================
// 4. VERIFICACIÓN DE OPENCV
// ==========================================
function verificarMotores() {
    if (typeof cv !== 'undefined' && cv.Mat) {
        iniciarCamara();
    } else {
        loadingText.innerText = "Esperando OpenCV...";
        setTimeout(verificarMotores, 250);
    }
}

// ==========================================
// 5. INICIALIZACIÓN DE LA CÁMARA
// ==========================================
async function iniciarCamara() {
    loadingText.innerText = "Iniciando Cámara...";
    btnCamara.disabled = true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, max: 30 },
                facingMode: 'user'
            }
        });

        streamActual = stream;
        videoMp.srcObject = stream;
        videoCv.srcObject = stream;

        videoMp.onloadedmetadata = () => {
            videoMp.play();
            videoCv.play();

            prepararAnalisis();

            if (primeraCarga) {
                primeraCarga = false;
                const loadingScreen = document.getElementById('loading');
                if (loadingScreen) {
                    loadingScreen.style.opacity = '0';
                    setTimeout(() => loadingScreen.remove(), 500);
                }
            }

            actualizarUICamara(true);
            if (rafId === null) rafId = requestAnimationFrame(procesarFrame);
        };
    } catch (err) {
        console.error(err);
        if (primeraCarga) {
            loadingText.innerText = "Error de Cámara. Revisa permisos.";
        } else {
            actualizarUICamara(false);
            avisoApagado.querySelector('p').textContent = "No se pudo encender la cámara";
        }
    }
}

// Detiene la cámara (se apaga también la luz del dispositivo) y el bucle
function apagarCamara() {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    if (streamActual) {
        streamActual.getTracks().forEach(track => track.stop());
        streamActual = null;
    }
    videoMp.srcObject = null;
    videoCv.srcObject = null;

    // Reiniciar estado para que al volver no arrastre valores viejos
    hayFramePrevio = false;
    usuarioEnfocado = false;
    opacidadActual = 100;
    opacidadAplicada = -1;
    videoCv.style.opacity = '1';

    actualizarUICamara(false);
}

function actualizarUICamara(encendida) {
    btnCamara.disabled = false;
    const etiqueta = encendida ? "Apagar cámara" : "Encender cámara";
    btnCamara.querySelector('.btn-texto').textContent = etiqueta;
    btnCamara.title = etiqueta;
    carcasa.classList.toggle('apagado', !encendida);
    avisoApagado.hidden = encendida;
    if (encendida) avisoApagado.querySelector('p').textContent = "Cámara apagada";
}

btnCamara.addEventListener('click', () => {
    if (streamActual) {
        apagarCamara();
    } else {
        iniciarCamara();
    }
});

// Dimensiona el canvas y reserva las matrices una sola vez
function prepararAnalisis() {
    anchoAnalisis = Math.floor(ALTO_ANALISIS * (videoMp.videoWidth / videoMp.videoHeight)) || 320;
    canvasLigero.width = anchoAnalisis;
    canvasLigero.height = ALTO_ANALISIS;

    [matSrc, matGray, matPrev, matDiff, matThresh].forEach(m => m && m.delete());
    matSrc = new cv.Mat(ALTO_ANALISIS, anchoAnalisis, cv.CV_8UC4);
    matGray = new cv.Mat();
    matPrev = new cv.Mat();
    matDiff = new cv.Mat();
    matThresh = new cv.Mat();
    blurSize = new cv.Size(BLUR_KERNEL, BLUR_KERNEL);
    hayFramePrevio = false;
}

// ==========================================
// 6. BUCLE DE PROCESAMIENTO
// ==========================================
function procesarFrame(currentTime) {
    rafId = requestAnimationFrame(procesarFrame);

    if (currentTime - lastProcessTime < frameInterval) return;
    lastProcessTime = currentTime;

    if (videoMp.readyState < videoMp.HAVE_ENOUGH_DATA || videoMp.videoWidth === 0) return;

    // --- A. MEDIA PIPE ---
    if (!isProcessingMp) {
        isProcessingMp = true;
        faceMesh.send({ image: videoMp })
            .catch(err => console.error("Error MP:", err))
            .finally(() => { isProcessingMp = false; });
    }

    // --- B. OPEN CV ---
    try {
        ctx.drawImage(videoMp, 0, 0, anchoAnalisis, ALTO_ANALISIS);
        const imageData = ctx.getImageData(0, 0, anchoAnalisis, ALTO_ANALISIS);
        matSrc.data.set(imageData.data);

        cv.cvtColor(matSrc, matGray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(matGray, matGray, blurSize, 0);

        if (hayFramePrevio) {
            cv.absdiff(matPrev, matGray, matDiff);
            cv.threshold(matDiff, matThresh, UMBRAL_PIXEL, 255, cv.THRESH_BINARY);

            const nonZero = cv.countNonZero(matThresh);
            const movementPercentage = (nonZero / (anchoAnalisis * ALTO_ANALISIS)) * 100;

            // Guardamos el nivel de movimiento para usar en otras partes
            nivelMovimiento = movementPercentage;

            // ==========================================
            // LA CONEXIÓN: MediaPipe + OpenCV
            // Solo oscurecemos si AMBAS condiciones son verdaderas:
            // 1. El usuario está enfocado en la pantalla (iris abajo)
            // 2. Hay movimiento en el entorno
            // ==========================================
            let opacidadObjetivo = 100; // Por defecto, visible

            if (usuarioEnfocado && movementPercentage > UMBRAL_MOVIMIENTO) {
                // El usuario está concentrado Y hay movimiento en el entorno
                opacidadObjetivo = Math.max(0, 100 - (movementPercentage * FACTOR_OSCURECER));
            }

            // Lógica de inercia (Ataque rápido, Liberación lenta)
            if (opacidadObjetivo < opacidadActual) {
                opacidadActual = opacidadObjetivo;
            } else {
                opacidadActual = Math.min(100, opacidadActual + 2.5);
            }

            // Solo tocamos el DOM si el valor cambió
            const redondeada = Math.round(opacidadActual);
            if (redondeada !== opacidadAplicada) {
                opacidadAplicada = redondeada;
                videoCv.style.opacity = `${redondeada / 100}`;
            }
        }

        // Intercambio de buffers en lugar de clonar (sin nuevas reservas de memoria)
        const tmp = matPrev;
        matPrev = matGray;
        matGray = tmp;
        hayFramePrevio = true;

    } catch (err) {
        console.error("Error en OpenCV:", err);
    }
}

// Ejecución
iniciarMediaPipe();
