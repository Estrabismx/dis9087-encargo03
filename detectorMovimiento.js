// detectorMovimiento.js

export function iniciarDetectorMovimiento(idVideo, idCanvas) {
    const video = document.getElementById(idVideo);
    const canvas = document.getElementById(idCanvas);

    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(function(stream) {
            video.srcObject = stream;
            video.play();
            video.addEventListener('canplay', () => {
                iniciarBucleOpenCV(video, canvas);
            });
        })
        .catch(function(err) {
            console.error("Error al acceder a la cámara: ", err);
        });
}

function iniciarBucleOpenCV(video, canvas) {
    if (typeof cv === 'undefined' || !cv.Mat) {
        setTimeout(() => iniciarBucleOpenCV(video, canvas), 100);
        return;
    }

    const cap = new cv.VideoCapture(video);
    const ancho = video.videoWidth;
    const alto = video.videoHeight;

    // Memoria estática para evitar fugas (Memory Leaks)
    const frameActual = new cv.Mat(alto, ancho, cv.CV_8UC4);
    const frameAnterior = new cv.Mat(alto, ancho, cv.CV_8UC1);
    const grisActual = new cv.Mat(alto, ancho, cv.CV_8UC1);
    const diferencia = new cv.Mat();
    const umbral = new cv.Mat();
    const mascaraCerrada = new cv.Mat();
    const mascaraDilatada = new cv.Mat();
    const mascaraSolida = new cv.Mat(alto, ancho, cv.CV_8UC1);
    const frameDesenfocado = new cv.Mat();
    const frameFinal = new cv.Mat();
    const hierarchy = new cv.Mat();

    const kernelCierre = cv.Mat.ones(25, 25, cv.CV_8U);
    const kernelDilatacion = cv.Mat.ones(11, 11, cv.CV_8U);

    // --- VARIABLES DE OPTIMIZACIÓN TEMPORAL ---
    const sensibilidadLuz = 25;
    const minimoPixelesActivacion = 5000;
    const movimientoEsperadoMax = 80000;
    
    // 1. Umbral de frames: ¿Cuántos frames seguidos debe haber movimiento para activar el efecto?
    const UMBRAL_FRAMES_VALIDOS = 8; 
    let contadorFramesMovimiento = 0; 
    
    const blurMinimo = 3;
    const blurMaximo = 101;
    let blurActualSuavizado = 3.0;
    const factorSuavizado = 0.08;

    cap.read(frameActual);
    cv.cvtColor(frameActual, frameAnterior, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(frameAnterior, frameAnterior, new cv.Size(21, 21), 0, 0, cv.BORDER_DEFAULT);

    function procesarFrame() {
        try {
            cap.read(frameActual); 

            // Filtro ligero para detección
            cv.cvtColor(frameActual, grisActual, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(grisActual, grisActual, new cv.Size(21, 21), 0, 0, cv.BORDER_DEFAULT);

            cv.absdiff(frameAnterior, grisActual, diferencia);
            cv.threshold(diferencia, umbral, sensibilidadLuz, 255, cv.THRESH_BINARY);

            let movimientoTotal = cv.countNonZero(umbral);

            // --- 2. LÓGICA DE ESTADO (DEBOUNCING) ---
            if (movimientoTotal > minimoPixelesActivacion) {
                // Si hay movimiento, sumamos al contador (hasta un límite para no desbordar)
                contadorFramesMovimiento = Math.min(contadorFramesMovimiento + 1, UMBRAL_FRAMES_VALIDOS + 10);
            } else {
                // Si se detiene, restamos lentamente para no cancelar el efecto por 1 frame malo
                contadorFramesMovimiento = Math.max(0, contadorFramesMovimiento - 1);
            }

            // --- 3. DECISIÓN DE PROCESAMIENTO PESADO ---
            let blurObjetivo = blurMinimo;
            
            // Solo calculamos el objetivo de desenfoque SI el movimiento ha sido constante por X frames
            if (contadorFramesMovimiento >= UMBRAL_FRAMES_VALIDOS) {
                let movRestringido = Math.min(movimientoTotal, movimientoEsperadoMax);
                let proporcion = movRestringido / movimientoEsperadoMax;
                blurObjetivo = blurMinimo + (proporcion * (blurMaximo - blurMinimo));
            }

            blurActualSuavizado = (blurObjetivo * factorSuavizado) + (blurActualSuavizado * (1.0 - factorSuavizado));
            let intensidadBlur = Math.floor(blurActualSuavizado);
            if (intensidadBlur % 2 === 0) intensidadBlur += 1;
            intensidadBlur = Math.max(3, Math.min(intensidadBlur, 99)); 

            // --- 4. CORTOCIRCUITO (EARLY EXIT) ---
            // Si el blur está en su mínimo, NO ejecutamos NADA de la matemática pesada
            if (intensidadBlur > 3) {
                // (Procesamiento pesado: Morfología, Contornos, GaussianBlur enorme)
                cv.morphologyEx(umbral, mascaraCerrada, cv.MORPH_CLOSE, kernelCierre);
                cv.dilate(mascaraCerrada, mascaraDilatada, kernelDilatacion, new cv.Point(-1, -1), 2);

                let contornos = new cv.MatVector();
                cv.findContours(mascaraDilatada, contornos, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                mascaraSolida.setTo(new cv.Scalar(0));
                for (let i = 0; i < contornos.size(); ++i) {
                    cv.drawContours(mascaraSolida, contornos, i, new cv.Scalar(255), -1, cv.LINE_8, hierarchy, 0);
                }
                contornos.delete(); 

                cv.GaussianBlur(frameActual, frameDesenfocado, new cv.Size(intensidadBlur, intensidadBlur), 0, 0, cv.BORDER_DEFAULT);

                frameDesenfocado.copyTo(frameFinal); 
                frameActual.copyTo(frameFinal, mascaraSolida); 
            } else {
                // AHORRO MASIVO DE CPU: Solo copiamos la imagen cruda a la salida
                frameActual.copyTo(frameFinal);
            }

            // --- INTERFAZ GRÁFICA ---
            const origenX = 30;
            const altoBarra = 20;
            const origenYMov = alto - 80;
            const origenYBlur = alto - 40;
            const anchoMaximoBarra = 250;

            const colorFondo = new cv.Scalar(50, 50, 50, 255);
            cv.rectangle(frameFinal, new cv.Point(origenX, origenYMov), new cv.Point(origenX + anchoMaximoBarra, origenYMov + altoBarra), colorFondo, -1);
            cv.rectangle(frameFinal, new cv.Point(origenX, origenYBlur), new cv.Point(origenX + anchoMaximoBarra, origenYBlur + altoBarra), colorFondo, -1);

            // La barra RAW ahora refleja el contador de frames (Estado de validación)
            const proporcionValidacion = Math.min(contadorFramesMovimiento / UMBRAL_FRAMES_VALIDOS, 1.0);
            const anchoBarraValidacion = Math.floor(proporcionValidacion * anchoMaximoBarra);
            
            const proporcionBlur = (intensidadBlur - blurMinimo) / (blurMaximo - blurMinimo);
            const anchoBarraBlur = Math.floor(Math.max(0, Math.min(proporcionBlur, 1.0)) * anchoMaximoBarra);

            // Naranja = Validando, Verde = Validado
            const colorValidacion = proporcionValidacion < 1.0 ? new cv.Scalar(255, 165, 0, 255) : new cv.Scalar(0, 255, 0, 255);
            
            cv.rectangle(frameFinal, new cv.Point(origenX, origenYMov), new cv.Point(origenX + anchoBarraValidacion, origenYMov + altoBarra), colorValidacion, -1);
            cv.rectangle(frameFinal, new cv.Point(origenX, origenYBlur), new cv.Point(origenX + anchoBarraBlur, origenYBlur + altoBarra), new cv.Scalar(0, 255, 255, 255), -1);

            const colorTexto = new cv.Scalar(200, 200, 200, 255);
            cv.putText(frameFinal, `Validacion: ${contadorFramesMovimiento}/${UMBRAL_FRAMES_VALIDOS} frames`, new cv.Point(origenX, origenYMov - 5), cv.FONT_HERSHEY_SIMPLEX, 0.4, colorTexto, 1);
            cv.putText(frameFinal, "Nivel Efecto", new cv.Point(origenX, origenYBlur - 5), cv.FONT_HERSHEY_SIMPLEX, 0.4, colorTexto, 1);

            cv.imshow(canvas.id, frameFinal);

            grisActual.copyTo(frameAnterior);

            // Usamos requestAnimationFrame en lugar de setTimeout para sincronizar con la GPU del navegador
            requestAnimationFrame(procesarFrame);

        } catch (err) {
            console.error("Error procesando frame: ", err);
        }
    }
    
    requestAnimationFrame(procesarFrame);
}