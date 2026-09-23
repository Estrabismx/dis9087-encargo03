// 1. Polyfills obligatorios
if (typeof document === 'undefined') {
    globalThis.document = {
        createElement: (tag) => (tag === 'canvas' ? new OffscreenCanvas(1, 1) : {})
    };
}
if (typeof window === 'undefined') {
    globalThis.window = globalThis;
}

let faceLandmarker;
let prevFrameMat = null;
let cvReady = false;
let mpReady = false;

// 2. Importaciones Clásicas Síncronas
// Aquí cargamos todo mediante importScripts, evitando el choque de módulos.
importScripts(
    'https://docs.opencv.org/4.8.0/opencv.js',
    // Usamos el paquete de MediaPipe diseñado específicamente para importación clásica
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.js'
);

async function initialize() {
    try {
        postMessage({ type: 'STATUS', payload: '[Worker] Librerías base descargadas. Configurando motores...' });
        
        // --- INICIALIZAR OPENCV ---
        cv['onRuntimeInitialized'] = () => {
            cvReady = true;
            checkReady();
        };

        // --- INICIALIZAR MEDIAPIPE ---
        // Al usar vision_bundle.js (sin mjs), MediaPipe se expone globalmente.
        // Necesitamos extraer las clases del objeto global `undefined` (a veces expuesto en window/globalThis) 
        // o del espacio de nombres expuesto. En este caso, tasks-vision expone su contenido.
        
        const vision = await self.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        faceLandmarker = await self.FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                delegate: "CPU"
            },
            runningMode: "VIDEO",
            numFaces: 1
        });
        
        mpReady = true;
        checkReady();

    } catch (error) {
        postMessage({ type: 'STATUS', payload: 'Error FATAL en Worker: ' + (error.message || error.toString()) });
    }
}

function checkReady() {
    if (cvReady && mpReady) {
        postMessage({ type: 'STATUS', payload: '[Worker] OpenCV y MediaPipe listos. Ambos modelos están READY.' });
        postMessage({ type: 'READY' });
    }
}

// Iniciar
initialize();

// 3. Procesamiento de frames
onmessage = (e) => {
    if (e.data.type === 'PROCESS' && cvReady && mpReady && faceLandmarker) {
        const { imageData, timestamp } = e.data.payload;
        
        // --- MEDIAPIPE ---
        let pointerX = null, pointerY = null;
        const results = faceLandmarker.detectForVideo(imageData, timestamp);
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const nose = results.faceLandmarks[0][1]; 
            pointerX = nose.x; 
            pointerY = nose.y; 
        }

        // --- OPENCV ---
        let movementPercentage = 0;
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
            const totalPixels = imageData.width * imageData.height;
            movementPercentage = (nonZero / totalPixels) * 100;
            
            diff.delete();
            thresh.delete();
            prevFrameMat.delete(); 
        }

        prevFrameMat = gray.clone(); 
        src.delete();
        gray.delete();

        postMessage({ 
            type: 'RESULT', 
            payload: { movement: movementPercentage, pointerX, pointerY } 
        });
    }
};