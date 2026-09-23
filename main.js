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
let prevFrameMat = null;
let lastProcessTime = 0;
const FPS_LIMIT = 20; 
const frameInterval = 1000 / FPS_LIMIT;
let isProcessingMp = false; 

// ==========================================
// ESTADO DEL USUARIO (La conexión entre sistemas)
// ==========================================
let usuarioEnfocado = false;      // ¿Está mirando la pantalla?
let nivelMovimiento = 0;          // Porcentaje de movimiento en el entorno
let opacidadActual = 100;         // Opacidad actual (comienza visible)

// ==========================================
// 3. INICIALIZACIÓN DE MEDIAPIPE (Gaze Tracking)
// ==========================================
let lastPointerUpdate = 0;
const POINTER_DELAY_MS = 150;
const THRESHOLD_ENFOQUE = 0.4;    // Umbral para detectar si mira la pantalla 

function iniciarMediaPipe() {
    loadingText.innerText = "Inicializando MediaPipe...";
    
    faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false, 
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            
            const currentTime = performance.now();
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
            if (currentTime - lastPointerUpdate > POINTER_DELAY_MS) {
                lastPointerUpdate = currentTime;

                let screenX = 0.5 - (yawRatio - 0.5) * 3; 
                let screenY = 0.5 + (pitchRatio - 0.5) * 3;

                screenX = Math.max(0, Math.min(1, screenX));
                screenY = Math.max(0, Math.min(1, screenY));

                pointer.style.left = `${screenX * ventanaMp.clientWidth}px`;
                pointer.style.top = `${screenY * ventanaMp.clientHeight}px`;
                
                // Cambiar color del puntero según si está enfocado
                pointer.style.borderColor = usuarioEnfocado ? '#00ffcc' : '#ff6b6b';
                pointer.style.boxShadow = usuarioEnfocado 
                    ? '0 0 10px rgba(0, 255, 204, 0.5), inset 0 0 10px rgba(0, 255, 204, 0.5)'
                    : '0 0 10px rgba(255, 107, 107, 0.5), inset 0 0 10px rgba(255, 107, 107, 0.5)';
            }
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
        setTimeout(verificarMotores, 500);
    }
}

// ==========================================
// 5. INICIALIZACIÓN DE LA CÁMARA
// ==========================================
async function iniciarCamara() {
    loadingText.innerText = "Iniciando Cámara...";
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720, facingMode: 'user' } 
        });
        
        videoMp.srcObject = stream;
        videoCv.srcObject = stream;
        
        videoMp.onloadedmetadata = () => {
            videoMp.play();
            videoCv.play();
            
            const loadingScreen = document.getElementById('loading');
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => loadingScreen.style.display = 'none', 500);
            }
            procesarFrame(); 
        };
    } catch (err) {
        console.error(err);
        loadingText.innerText = "Error de Cámara. Revisa permisos.";
    }
}

// ==========================================
// 6. BUCLE DE PROCESAMIENTO
// ==========================================
function procesarFrame() {
    requestAnimationFrame(procesarFrame);

    const currentTime = performance.now();
    if (currentTime - lastProcessTime < frameInterval) return;
    lastProcessTime = currentTime;

    if (videoMp.readyState !== videoMp.HAVE_ENOUGH_DATA || videoMp.videoWidth === 0) return;

    // --- A. MEDIA PIPE ---
    if (!isProcessingMp) {
        isProcessingMp = true;
        faceMesh.send({ image: videoMp })
            .catch(err => console.error("Error MP:", err))
            .finally(() => { isProcessingMp = false; });
    }

    // --- B. OPEN CV ---
    try {
        const alto = 240;
        const ancho = Math.floor(alto * (videoMp.videoWidth / videoMp.videoHeight));
        if (ancho === 0) return; 

        canvasLigero.width = ancho;
        canvasLigero.height = alto;
        ctx.drawImage(videoMp, 0, 0, ancho, alto);
        
        const imageData = ctx.getImageData(0, 0, ancho, alto);
        const src = cv.matFromImageData(imageData);
        const gray = new cv.Mat();
        
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, gray, new cv.Size(21, 21), 0);

        if (prevFrameMat) {
            const diff = new cv.Mat();
            const thresh = new cv.Mat();
            
            cv.absdiff(prevFrameMat, gray, diff);
            cv.threshold(diff, thresh, 25, 255, cv.THRESH_BINARY);
            
            const nonZero = cv.countNonZero(thresh);
            const totalPixels = ancho * alto;
            const movementPercentage = (nonZero / totalPixels) * 100;
            
            // Guardamos el nivel de movimiento para usar en otras partes
            nivelMovimiento = movementPercentage;
            
            // ==========================================
            // LA CONEXIÓN: MediaPipe + OpenCV
            // Solo oscurecemos si AMBAS condiciones son verdaderas:
            // 1. El usuario está enfocado en la pantalla (iris abajo)
            // 2. Hay movimiento en el entorno
            // ==========================================
            let opacidadObjetivo = 100; // Por defecto, visible
            
            if (usuarioEnfocado && movementPercentage > 2) {
                // El usuario está concentrado Y hay movimiento en el entorno
                // La pantalla debe oscurecerse para reflejar su desconexión del entorno
                opacidadObjetivo = Math.max(0, 100 - (movementPercentage * 6));
            }
            
            // Lógica de inercia (Ataque rápido, Liberación lenta)
            if (opacidadObjetivo < opacidadActual) {
                // Si hay movimiento (y el usuario está enfocado), oscurece rápido
                opacidadActual = opacidadObjetivo;
            } else {
                // Si desaparece el movimiento o el usuario deja de enfocarse, se aclara lentamente
                opacidadActual += 2.5;
                if (opacidadActual > 100) opacidadActual = 100;
            }

            videoCv.style.opacity = `${opacidadActual / 100}`;

            diff.delete();
            thresh.delete();
            prevFrameMat.delete(); 
        }

        prevFrameMat = gray.clone(); 
        src.delete();
        gray.delete();
        
    } catch (err) {
        console.error("Error en OpenCV:", err);
    }
}

// Ejecución
iniciarMediaPipe();