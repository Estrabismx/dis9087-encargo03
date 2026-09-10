/**
 * main.js - ORQUESTADOR PRINCIPAL
 * Este archivo se encarga de iniciar la cámara web y coordinar el envío de 
 * fotogramas a los procesadores externos (OpenCV y MediaPipe).
 */

// 1. OBTENER REFERENCIAS A LOS ELEMENTOS DEL HTML
// Guardamos en variables los elementos que creamos en index.html para poder controlarlos.
const videoOculto = document.getElementById('videoOculto');
const canvasOpenCV = document.getElementById('canvasOpenCV');
const canvasMediaPipe = document.getElementById('canvasMediaPipe');

// 2. CONFIGURACIÓN DE LA CÁMARA
// Aquí definimos qué tipo de video queremos (resolución, usar la cámara frontal, etc.)
/* EDITABLE: Puedes cambiar los valores de 'width' y 'height' si necesitas otra resolución base */
const restriccionesCamara = {
    video: {
        width: 640,
        height: 480,
        facingMode: "user" // "user" intenta usar la cámara frontal (webcam estándar)
    }
};

/**
 * Función para encender la cámara web.
 * Usa la API 'navigator.mediaDevices.getUserMedia' que es el estándar moderno.
 */
async function iniciarCamara() {
    try {
        // Pedimos permiso al usuario y obtenemos el "flujo" (stream) de video
        const stream = await navigator.mediaDevices.getUserMedia(restriccionesCamara);
        
        // Conectamos ese flujo de video al elemento <video> oculto en el HTML
        videoOculto.srcObject = stream;

        // Esperamos a que el video esté listo para reproducirse
        return new Promise((resolve) => {
            videoOculto.onloadedmetadata = () => {
                // Ajustamos el tamaño interno de los canvas para que coincida exactamente con la cámara
                canvasOpenCV.width = videoOculto.videoWidth;
                canvasOpenCV.height = videoOculto.videoHeight;
                canvasMediaPipe.width = videoOculto.videoWidth;
                canvasMediaPipe.height = videoOculto.videoHeight;
                
                resolve(); // Avisamos que la cámara ya está lista
            };
        });
    } catch (error) {
        console.error("Error al acceder a la cámara web:", error);
        alert("No se pudo acceder a la cámara. Revisa los permisos de tu navegador.");
    }
}

/**
 * El Bucle Principal (Game Loop / Processing Loop)
 * Esta función se llama a sí misma constantemente (muchas veces por segundo)
 * para capturar cada "foto" (frame) del video y procesarla.
 */
function procesarFrames() {
    // Si el video está pausado o terminó, detenemos el procesamiento
    if (videoOculto.paused || videoOculto.ended) return;

    // =========================================================================
    // AQUÍ ES DONDE SE CONECTAN TUS OTROS ARCHIVOS (OpenCV y MediaPipe)
    // =========================================================================
    
    // 1. LLAMADO A OPENCV (detectorMovimiento.js)
    // Verificamos si la función principal de tu archivo de OpenCV existe
    if (typeof procesarConOpenCV === 'function') {
        // Le pasamos el video original y el canvas donde debe dibujar
        procesarConOpenCV(videoOculto, canvasOpenCV); 
    } else {
        // Mensaje temporal por si aún no has conectado el archivo
        console.log("Esperando función procesarConOpenCV() desde detectorMovimiento.js");
    }

    // 2. LLAMADO A MEDIAPIPE (detector_ojos.js)
    // Verificamos si la función principal de tu archivo de MediaPipe existe
    if (typeof procesarConMediaPipe === 'function') {
        // Le pasamos el video original y el canvas donde debe dibujar
        procesarConMediaPipe(videoOculto, canvasMediaPipe);
    } else {
         // Mensaje temporal por si aún no has conectado el archivo
        console.log("Esperando función procesarConMediaPipe() desde detector_ojos.js");
    }

    // =========================================================================

    // requestAnimationFrame es el método óptimo para repetir funciones visuales.
    // Le dice al navegador: "antes de pintar la siguiente pantalla, vuelve a ejecutar procesarFrames"
    requestAnimationFrame(procesarFrames);
}

/**
 * Función de Arranque (Init)
 * Se ejecuta al cargar la página para poner todo en marcha.
 */
async function iniciarApp() {
    console.log("Iniciando aplicación...");
    
    // 1. Esperamos a que la cámara encienda correctamente
    await iniciarCamara();
    
    // 2. Una vez encendida, empezamos a procesar los fotogramas sin parar
    procesarFrames();
    
    console.log("Cámara iniciada y procesamiento en curso (oculto).");
}

// Escuchamos cuando todo el HTML haya terminado de cargar para arrancar la app
window.addEventListener('DOMContentLoaded', iniciarApp);