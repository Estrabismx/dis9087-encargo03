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
// 3. INICIALIZACIÓN DE MEDIAPIPE (Gaze Tracking con Delay)
// ==========================================
let lastPointerUpdate = 0;
const POINTER_DELAY_MS = 150; // Milisegundos de espera entre cada movimiento

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
            
            // Retraso para reducir sensibilidad
            if (currentTime - lastPointerUpdate > POINTER_DELAY_MS) {
                lastPointerUpdate = currentTime;

                const landmarks = results.multiFaceLandmarks[0];
                
                const nose = landmarks[1];        
                const leftEdge = landmarks[234];  
                const rightEdge = landmarks[454]; 
                const topEdge = landmarks[10];    
                const bottomEdge = landmarks[152];

                // YAW (Giro Izquierda - Derecha) 
                const faceWidth = rightEdge.x - leftEdge.x;
                const yawRatio = (nose.x - leftEdge.x) / faceWidth; 

                // PITCH (Inclinación Arriba - Abajo)
                const faceHeight = bottomEdge.y - topEdge.y;
                const pitchRatio = (nose.y - topEdge.y) / faceHeight;

                // MAPEO A LA PANTALLA
                let screenX = 0.5 - (yawRatio - 0.5) * 3; 
                let screenY = 0.5 + (pitchRatio - 0.5) * 3;

                screenX = Math.max(0, Math.min(1, screenX));
                screenY = Math.max(0, Math.min(1, screenY));

                // Aplicar coordenadas
                pointer.style.left = `${screenX * ventanaMp.clientWidth}px`;
                pointer.style.top = `${screenY * ventanaMp.clientHeight}px`;
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
// 6. BUCLE DE PROCESAMIENTO (THROTTLED)
// ==========================================
function procesarFrame() {
    requestAnimationFrame(procesarFrame);

    const currentTime = performance.now();
    if (currentTime - lastProcessTime < frameInterval) return;
    lastProcessTime = currentTime;

    if (videoMp.readyState !== videoMp.HAVE_ENOUGH_DATA || videoMp.videoWidth === 0) return;

    // --- A. MEDIA PIPE (Con candado) ---
    if (!isProcessingMp) {
        isProcessingMp = true;
        faceMesh.send({ image: videoMp })
            .catch(err => console.error("Error MP:", err))
            .finally(() => { isProcessingMp = false; });
    }

    // --- B. OPEN CV (Alta Sensibilidad y Opacidad a 0) ---
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
            
            // Umbral en 15 (Alta sensibilidad)
            cv.absdiff(prevFrameMat, gray, diff);
            cv.threshold(diff, thresh, 20, 255, cv.THRESH_BINARY);
            
            const nonZero = cv.countNonZero(thresh);
            const totalPixels = ancho * alto;
            const movementPercentage = (nonZero / totalPixels) * 100;
            
            // Multiplicador agresivo para llegar a negro total rápidamente
            const opacidad = Math.max(0, 100 - (movementPercentage * 8)); 
            videoCv.style.opacity = `${opacidad / 100}`;

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