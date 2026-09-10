// detectorMovimiento.js

export function iniciarDetectorMovimiento(idVideo, idCanvas) {
    const video = document.getElementById(idVideo);
    const canvas = document.getElementById(idCanvas);

    // Pedir permisos de cámara al usuario
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(function(stream) {
            video.srcObject = stream;
            video.play();
            
            // Esperar a que el video tenga dimensiones antes de arrancar OpenCV
            video.addEventListener('canplay', () => {
                iniciarBucleOpenCV(video, canvas);
            });
        })
        .catch(function(err) {
            console.error("Error al acceder a la cámara: ", err);
        });
}

function iniciarBucleOpenCV(video, canvas) {
    // Verificamos si OpenCV.js terminó de cargar
    if (typeof cv === 'undefined' || !cv.Mat) {
        console.warn("OpenCV no está listo, reintentando en 100ms...");
        setTimeout(() => iniciarBucleOpenCV(video, canvas), 100);
        return;
    }

    const cap = new cv.VideoCapture(video);
    const ancho = video.videoWidth;
    const alto = video.videoHeight;
    const FPS = 30;

    // --- ASIGNACIÓN DE MEMORIA ESTATICA (Para evitar fugas de RAM) ---
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

    // Kernels morfológicos
    const kernelCierre = cv.Mat.ones(25, 25, cv.CV_8U);
    const kernelDilatacion = cv.Mat.ones(11, 11, cv.CV_8U);

    // Configuración Inicial
    const sensibilidadLuz = 25;
    const minimoPixelesActivacion = 5000;
    const movimientoEsperadoMax = 80000;
    const blurMinimo = 3;
    const blurMaximo = 61;
    let blurActualSuavizado = 3.0;
    const factorSuavizado = 0.08;

    // Preparar el primer frame
    cap.read(frameActual);
    cv.cvtColor(frameActual, frameAnterior, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(frameAnterior, frameAnterior, new cv.Size(21, 21), 0, 0, cv.BORDER_DEFAULT);

    // Función que se ejecutará frame por frame
    function procesarFrame() {
        try {
            let inicio = Date.now();
            cap.read(frameActual); // Lee en RGBA

            // Conversión y Blur preparatorio
            cv.cvtColor(frameActual, grisActual, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(grisActual, grisActual, new cv.Size(21, 21), 0, 0, cv.BORDER_DEFAULT);

            // Calcular diferencia (Movimiento)
            cv.absdiff(frameAnterior, grisActual, diferencia);
            cv.threshold(diferencia, umbral, sensibilidadLuz, 255, cv.THRESH_BINARY);

            let movimientoTotal = cv.countNonZero(umbral);

            // --- CÁLCULO DEL BLUR ---
            let blurObjetivo = blurMinimo;
            if (movimientoTotal > minimoPixelesActivacion) {
                let movRestringido = Math.min(movimientoTotal, movimientoEsperadoMax);
                let proporcion = movRestringido / movimientoEsperadoMax;
                blurObjetivo = blurMinimo + (proporcion * (blurMaximo - blurMinimo));
            }

            // --- SUAVIZADO TEMPORAL ---
            blurActualSuavizado = (blurObjetivo * factorSuavizado) + (blurActualSuavizado * (1.0 - factorSuavizado));
            let intensidadBlur = Math.floor(blurActualSuavizado);
            if (intensidadBlur % 2 === 0) intensidadBlur += 1;
            intensidadBlur = Math.max(3, Math.min(intensidadBlur, 99)); 

            // --- FUSIÓN Y MÁSCARAS ---
            if (intensidadBlur > 3) {
                // Morfología para cerrar huecos en la mano/cuerpo
                cv.morphologyEx(umbral, mascaraCerrada, cv.MORPH_CLOSE, kernelCierre);
                cv.dilate(mascaraCerrada, mascaraDilatada, kernelDilatacion, new cv.Point(-1, -1), 2);

                let contornos = new cv.MatVector();
                cv.findContours(mascaraDilatada, contornos, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                // Rellenar máscara sólida con negro
                mascaraSolida.setTo(new cv.Scalar(0));
                // Dibujar contornos rellenos en blanco
                for (let i = 0; i < contornos.size(); ++i) {
                    cv.drawContours(mascaraSolida, contornos, i, new cv.Scalar(255), -1, cv.LINE_8, hierarchy, 0);
                }
                
                // Limpiar vector de memoria C++ temporal
                contornos.delete(); 

                cv.GaussianBlur(frameActual, frameDesenfocado, new cv.Size(intensidadBlur, intensidadBlur), 0, 0, cv.BORDER_DEFAULT);

                // Equivalente a np.where de NumPy pero usando máscaras nativas:
                frameDesenfocado.copyTo(frameFinal); // Pinta el fondo borroso primero
                frameActual.copyTo(frameFinal, mascaraSolida); // Pega la persona nítida encima recortada por la máscara
            } else {
                frameActual.copyTo(frameFinal);
            }

            // --- INTERFAZ GRÁFICA ---
            const origenX = 30;
            const origenYMov = alto - 80;
            const origenYBlur = alto - 40;
            const anchoMaximoBarra = 250;
            const altoBarra = 20;

            const proporcionMov = Math.min(movimientoTotal / movimientoEsperadoMax, 1.0);
            const anchoBarraMov = Math.floor(proporcionMov * anchoMaximoBarra);
            const proporcionBlur = (intensidadBlur - blurMinimo) / (blurMaximo - blurMinimo);
            const anchoBarraBlur = Math.floor(Math.max(0, Math.min(proporcionBlur, 1.0)) * anchoMaximoBarra);

            // Fondos oscuros (Escala RGBA)
            const colorFondo = new cv.Scalar(50, 50, 50, 255);
            cv.rectangle(frameFinal, new cv.Point(origenX, origenYMov), new cv.Point(origenX + anchoMaximoBarra, origenYMov + altoBarra), colorFondo, -1);
            cv.rectangle(frameFinal, new cv.Point(origenX, origenYBlur), new cv.Point(origenX + anchoMaximoBarra, origenYBlur + altoBarra), colorFondo, -1);

            // Barras dinámicas (Naranja y Cian en RGBA)
            cv.rectangle(frameFinal, new cv.Point(origenX, origenYMov), new cv.Point(origenX + anchoBarraMov, origenYMov + altoBarra), new cv.Scalar(255, 165, 0, 255), -1);
            cv.rectangle(frameFinal, new cv.Point(origenX, origenYBlur), new cv.Point(origenX + anchoBarraBlur, origenYBlur + altoBarra), new cv.Scalar(0, 255, 255, 255), -1);

            // Texto (Blanco RGBA)
            const colorTexto = new cv.Scalar(200, 200, 200, 255);
            cv.putText(frameFinal, "Sensor RAW", new cv.Point(origenX, origenYMov - 5), cv.FONT_HERSHEY_SIMPLEX, 0.4, colorTexto, 1);
            cv.putText(frameFinal, "Nivel Efecto", new cv.Point(origenX, origenYBlur - 5), cv.FONT_HERSHEY_SIMPLEX, 0.4, colorTexto, 1);

            // Dibujar en el Canvas de HTML
            cv.imshow(canvas.id, frameFinal);

            // Actualizar frame anterior
            grisActual.copyTo(frameAnterior);

            // Calcular delay para mantener 30 FPS constantes
            let delay = (1000 / FPS) - (Date.now() - inicio);
            setTimeout(procesarFrame, delay > 0 ? delay : 0);

        } catch (err) {
            console.error("Error procesando frame: ", err);
        }
    }
    
    // Iniciar el bucle
    setTimeout(procesarFrame, 0);
}