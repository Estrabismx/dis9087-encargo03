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
    const anchoOriginal = video.videoWidth;
    const altoOriginal = video.videoHeight;
    
    // --- OPTIMIZACIÓN A: Downscaling (Resolución interna 1/4) ---
    const escala = 4;
    const anchoPeq = Math.floor(anchoOriginal / escala);
    const altoPeq = Math.floor(altoOriginal / escala);

    // Memoria estática - Resolución Original
    const frameRGBA = new cv.Mat(altoOriginal, anchoOriginal, cv.CV_8UC4);
    // OPTIMIZACIÓN D: Usaremos frameRGB (3 canales) como base para todo y ahorramos 25% de peso
    const frameRGB = new cv.Mat(altoOriginal, anchoOriginal, cv.CV_8UC3); 
    const frameDesenfocado = new cv.Mat();
    const frameFinal = new cv.Mat();
    const mascaraGrande = new cv.Mat(altoOriginal, anchoOriginal, cv.CV_8UC1);
    
    // Memoria estática - Baja Resolución (Para procesamiento matemático rápido)
    const framePeqRGB = new cv.Mat(altoPeq, anchoPeq, cv.CV_8UC3);
    const frameAnteriorPeq = new cv.Mat(altoPeq, anchoPeq, cv.CV_8UC1);
    const grisActualPeq = new cv.Mat(altoPeq, anchoPeq, cv.CV_8UC1);
    const diferenciaPeq = new cv.Mat();
    const umbralPeq = new cv.Mat();
    const mascaraSolidaPeq = new cv.Mat(altoPeq, anchoPeq, cv.CV_8UC1);
    const hierarchy = new cv.Mat();

    // OPTIMIZACIÓN E: Consolidación morfológica. Un solo Kernel masivo adaptado a baja resolución.
    const kernelMasivo = cv.Mat.ones(11, 11, cv.CV_8U); 

    // Configuración base
    const sensibilidadLuz = 20;
    // Ajustamos el mínimo de píxeles porque la imagen es 16 veces más pequeña
    const minimoPixelesActivacion = 1000 / (escala * escala); 
    const movimientoEsperadoMax = 20000 / (escala * escala); 
    
    const UMBRAL_FRAMES_VALIDOS = 4; 
    let contadorFramesMovimiento = 0; 
    
    const blurMinimo = 3;
    const blurMaximo = 121;
    let blurActualSuavizado = 3.0;
    const factorSuavizado = 0.08;

    // OPTIMIZACIÓN B: Variables para Frame Skipping
    const FRAMES_SALTO = 3; // Calcula el movimiento 1 de cada 3 frames
    let contadorFrameGeneral = 0;

    // Preparar el primer frame
    cap.read(frameRGBA);
    cv.cvtColor(frameRGBA, frameRGB, cv.COLOR_RGBA2RGB);
    cv.resize(frameRGB, framePeqRGB, new cv.Size(anchoPeq, altoPeq), 0, 0, cv.INTER_NEAREST);
    cv.cvtColor(framePeqRGB, frameAnteriorPeq, cv.COLOR_RGB2GRAY);
    cv.blur(frameAnteriorPeq, frameAnteriorPeq, new cv.Size(7, 7), new cv.Point(-1, -1), cv.BORDER_DEFAULT);

    function procesarFrame() {
        try {
            cap.read(frameRGBA); 
            // Eliminamos Alpha inmediatamente
            cv.cvtColor(frameRGBA, frameRGB, cv.COLOR_RGBA2RGB); 
            
            contadorFrameGeneral++;

            // --- BLOQUE MATEMÁTICO (Ejecutado con salto de frames y en baja resolución) ---
            if (contadorFrameGeneral % FRAMES_SALTO === 0) {
                // Reducir imagen actual
                cv.resize(frameRGB, framePeqRGB, new cv.Size(anchoPeq, altoPeq), 0, 0, cv.INTER_NEAREST);
                
                // Preparar grises
                cv.cvtColor(framePeqRGB, grisActualPeq, cv.COLOR_RGB2GRAY);
                // OPTIMIZACIÓN C: Box filter en lugar de Gaussiano para limpiar ruido
                cv.blur(grisActualPeq, grisActualPeq, new cv.Size(7, 7), new cv.Point(-1, -1), cv.BORDER_DEFAULT);

                // Calcular diferencia en baja resolución
                cv.absdiff(frameAnteriorPeq, grisActualPeq, diferenciaPeq);
                cv.threshold(diferenciaPeq, umbralPeq, sensibilidadLuz, 255, cv.THRESH_BINARY);

                let movimientoTotal = cv.countNonZero(umbralPeq);

                // Debouncing de estado
                if (movimientoTotal > minimoPixelesActivacion) {
                    contadorFramesMovimiento = Math.min(contadorFramesMovimiento + 1, UMBRAL_FRAMES_VALIDOS + 5);
                } else {
                    contadorFramesMovimiento = Math.max(0, contadorFramesMovimiento - 1);
                }

                // Calcular objetivo de blur
                let blurObjetivo = blurMinimo;
                if (contadorFramesMovimiento >= UMBRAL_FRAMES_VALIDOS) {
                    let movRestringido = Math.min(movimientoTotal, movimientoEsperadoMax);
                    let proporcion = movRestringido / movimientoEsperadoMax;
                    blurObjetivo = blurMinimo + (proporcion * (blurMaximo - blurMinimo));
                }

                // Suavizado temporal
                blurActualSuavizado = (blurObjetivo * factorSuavizado) + (blurActualSuavizado * (1.0 - factorSuavizado));

                if (blurActualSuavizado > 3.5) {
                    // Procesar máscara solo si hay efecto
                    // Una sola dilatación pesada (Opt. E)
                    cv.dilate(umbralPeq, umbralPeq, kernelMasivo, new cv.Point(-1, -1), 1);
                    
                    let contornos = new cv.MatVector();
                    cv.findContours(umbralPeq, contornos, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                    mascaraSolidaPeq.setTo(new cv.Scalar(0));
                    for (let i = 0; i < contornos.size(); ++i) {
                        cv.drawContours(mascaraSolidaPeq, contornos, i, new cv.Scalar(255), -1, cv.LINE_8, hierarchy, 0);
                    }
                    contornos.delete();
                    
                    // Upscale: Estiramos la máscara procesada al tamaño real
                    cv.resize(mascaraSolidaPeq, mascaraGrande, new cv.Size(anchoOriginal, altoOriginal), 0, 0, cv.INTER_LINEAR);
                }
                
                // Actualizamos el frame anterior (pequeño)
                grisActualPeq.copyTo(frameAnteriorPeq);
            }

            // --- BLOQUE DE RENDERIZADO (Ejecutado cada frame en tamaño real) ---
            let intensidadBlur = Math.floor(blurActualSuavizado);
            if (intensidadBlur % 2 === 0) intensidadBlur += 1;
            intensidadBlur = Math.max(3, Math.min(intensidadBlur, 99));

            if (intensidadBlur > 3) {
                // OPTIMIZACIÓN C: Box filter para el fondo borroso general
                cv.blur(frameRGB, frameDesenfocado, new cv.Size(intensidadBlur, intensidadBlur), new cv.Point(-1, -1), cv.BORDER_DEFAULT);
                
                frameDesenfocado.copyTo(frameFinal); 
                frameRGB.copyTo(frameFinal, mascaraGrande); 
            } else {
                frameRGB.copyTo(frameFinal);
            }

            // Interfaz Gráfica Minimalista
            const origenX = 30;
            const altoBarra = 20;
            const origenYMov = altoOriginal - 80;
            const anchoMaximoBarra = 250;

            const proporcionValidacion = Math.min(contadorFramesMovimiento / UMBRAL_FRAMES_VALIDOS, 1.0);
            const anchoBarraValidacion = Math.floor(proporcionValidacion * anchoMaximoBarra);
            const colorValidacion = proporcionValidacion < 1.0 ? new cv.Scalar(255, 165, 0) : new cv.Scalar(0, 255, 0);
            
            // Usamos frameFinal que ahora es de 3 canales (RGB), por lo que los escalares son de 3 valores.
           // cv.rectangle(frameFinal, new cv.Point(origenX, origenYMov), new cv.Point(origenX + anchoMaximoBarra, origenYMov + altoBarra), new cv.Scalar(50, 50, 50), -1);
            //cv.rectangle(frameFinal, new cv.Point(origenX, origenYMov), new cv.Point(origenX + anchoBarraValidacion, origenYMov + altoBarra), colorValidacion, -1);
            //cv.putText(frameFinal, `Blur Level: ${intensidadBlur}`, new cv.Point(origenX, origenYMov - 5), cv.FONT_HERSHEY_SIMPLEX, 0.5, new cv.Scalar(255, 255, 255), 1);

            cv.imshow(canvas.id, frameFinal);

            requestAnimationFrame(procesarFrame);

        } catch (err) {
            console.error("Error procesando frame: ", err);
        }
    }
    
    requestAnimationFrame(procesarFrame);
}