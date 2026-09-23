// mpWorker.js

importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');

let faceMesh;
let mpReady = false;

async function init() {
    try {
        postMessage({ type: 'STATUS', payload: '[MediaPipe Worker] Inicializando Face Mesh Clásico...' });
        
        faceMesh = new FaceMesh({
            // CRITICAL FIX: Force all internal files (.wasm, .data) to load from the CDN
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults((results) => {
            let pointerX = null, pointerY = null;
            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                const nose = results.multiFaceLandmarks[0][1]; 
                pointerX = nose.x; 
                pointerY = nose.y; 
            }
            postMessage({ type: 'RESULT', payload: { pointerX, pointerY } });
        });
        
        const dummyCanvas = new OffscreenCanvas(1, 1);
        await faceMesh.send({ image: dummyCanvas });

        mpReady = true;
        postMessage({ type: 'READY' });
    } catch (e) {
        postMessage({ type: 'STATUS', payload: 'Error MP: ' + (e.message || e.toString()) });
    }
}

init();

onmessage = async (e) => {
    if (e.data.type === 'PROCESS' && mpReady) {
        try {
            await faceMesh.send({ image: e.data.payload.imageData });
        } catch (err) {
            console.error("Error procesando frame en MediaPipe:", err);
        }
    }
};