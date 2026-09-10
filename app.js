import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/tasks-vision_bundle.js";

// --- INDICES DE LANDMARKS CLAVE ---
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const LEFT_FACE = 234;
const RIGHT_FACE = 454;
const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;

const LEFT_IRIS = 468;
const LEFT_EYE_LEFT = 33;
const LEFT_EYE_RIGHT = 133;
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;

const RIGHT_IRIS = 473;
const RIGHT_EYE_LEFT = 362;
const RIGHT_EYE_RIGHT = 263;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

// --- ESTADO Y VARIABLES GLOBALES ---
let faceLandmarker;
let videoElement, canvasElement, ctx;
let lastVideoTime = -1;

let anchorCenter = null;
const maxAllowedDrift = 45;

const steps = [0.125, 0.375, 0.625, 0.875];
const calibrationTargets = [];
let idx = 1;
for (let row of steps) {
    for (let col of steps) {
        calibrationTargets.push({ name: `${idx}/16`, px: col, py: row });
        idx++;
    }
}

let calibIndex = 0;
let allCalibrationSamples = [];
let isSampling = false;
let sampleStartTime = 0;
let currentPointSamples = [];
const samplingDuration = 2.2;

let state = "CALIBRATION"; // "CALIBRATION" | "GAME"
let coeffX = null, coeffY = null;
let smoothX = null, smoothY = null;
const alpha = 0.15;

let targetZone = Math.floor(Math.random() * 16);
let gazeDwellStart = null;
let score = 0;
const dwellDuration = 1.0;

// --- EXTRACCIÓN DE CARACTERÍSTICAS MULTIVARIABLES ---
function extractMultivariableFeatures(landmarks, w, h) {
    const getP2 = (lm) => [lm.x * w, lm.y * h];

    // 1. OJOS (Ratios del Iris)
    const lIris = getP2(landmarks[LEFT_IRIS]);
    const lLeft = getP2(landmarks[LEFT_EYE_LEFT]);
    const lRight = getP2(landmarks[LEFT_EYE_RIGHT]);
    const lTop = getP2(landmarks[LEFT_EYE_TOP]);
    const lBottom = getP2(landmarks[LEFT_EYE_BOTTOM]);

    const lHRatio = (lIris[0] - lLeft[0]) / ((lRight[0] - lLeft[0]) + 1e-6);
    const lVRatio = (lIris[1] - lTop[1]) / ((lBottom[1] - lTop[1]) + 1e-6);

    const rIris = getP2(landmarks[RIGHT_IRIS]);
    const rLeft = getP2(landmarks[RIGHT_EYE_LEFT]);
    const rRight = getP2(landmarks[RIGHT_EYE_RIGHT]);
    const rTop = getP2(landmarks[RIGHT_EYE_TOP]);
    const rBottom = getP2(landmarks[RIGHT_EYE_BOTTOM]);

    const rHRatio = (rIris[0] - rLeft[0]) / ((rRight[0] - rLeft[0]) + 1e-6);
    const rVRatio = (rIris[1] - rTop[1]) / ((rBottom[1] - rTop[1]) + 1e-6);

    const hEye = (lHRatio + rHRatio) / 2.0;
    const vEye = (lVRatio + rVRatio) / 2.0;

    // 2. NARIZ
    const nose = landmarks[NOSE_TIP];

    // 3. CABEZA (Yaw y Pitch)
    const fLeft = landmarks[LEFT_FACE];
    const fRight = landmarks[RIGHT_FACE];
    const forehead = landmarks[FOREHEAD];
    const chin = landmarks[CHIN];

    const faceW = Math.abs(fRight.x - fLeft.x) + 1e-6;
    const faceH = Math.abs(chin.y - forehead.y) + 1e-6;

    const yaw = (nose.x - fLeft.x) / faceW;
    const pitch = (nose.y - forehead.y) / faceH;

    // 4. LABIOS (Roll)
    const mLeft = landmarks[MOUTH_LEFT];
    const mRight = landmarks[MOUTH_RIGHT];
    const roll = Math.atan2(mRight.y - mLeft.y, mRight.x - mLeft.x);

    return [
        1.0,
        hEye,
        vEye,
        yaw,
        pitch,
        roll,
        nose.x,
        nose.y,
        hEye * yaw,
        vEye * pitch,
        Math.pow(hEye, 2),
        Math.pow(vEye, 2)
    ];
}

// --- RESOLUCIÓN MATRICIAL POR MÍNIMOS CUADRADOS ---
function solveLeastSquares(A, B) {
    const M = A.length;
    const N = A[0].length;

    // A^T * A
    const ATA = Array.from({ length: N }, () => new Float64Array(N));
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            let sum = 0;
            for (let k = 0; k < M; k++) sum += A[k][i] * A[k][j];
            ATA[i][j] = sum;
        }
    }

    // A^T * B
    const ATB = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let k = 0; k < M; k++) sum += A[k][i] * B[k];
        ATB[i] = sum;
    }

    // Eliminación Gaussiana
    for (let i = 0; i < N; i++) {
        let maxRow = i;
        for (let k = i + 1; k < N; k++) {
            if (Math.abs(ATA[k][i]) > Math.abs(ATA[maxRow][i])) maxRow = k;
        }
        [ATA[i], ATA[maxRow]] = [ATA[maxRow], ATA[i]];
        [ATB[i], ATB[maxRow]] = [ATB[maxRow], ATB[i]];

        for (let k = i + 1; k < N; k++) {
            const c = -ATA[k][i] / ATA[i][i];
            for (let j = i; j < N; j++) {
                if (i === j) ATA[k][j] = 0;
                else ATA[k][j] += c * ATA[i][j];
            }
            ATB[k] += c * ATB[i];
        }
    }

    const x = new Float64Array(N);
    for (let i = N - 1; i >= 0; i--) {
        let sum = ATB[i];
        for (let j = i + 1; j < N; j++) sum -= ATA[i][j] * x[j];
        x[i] = ATA[i][i] !== 0 ? sum / ATA[i][i] : 0;
    }
    return x;
}

function filterOutliers(samples) {
    if (samples.length < 10) return samples;
    const numFeatures = samples[0][0].length;
    const means = new Float64Array(numFeatures);
    const stds = new Float64Array(numFeatures);

    for (let j = 0; j < numFeatures; j++) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i][0][j];
        means[j] = sum / samples.length;

        let varSum = 0;
        for (let i = 0; i < samples.length; i++) varSum += Math.pow(samples[i][0][j] - means[j], 2);
        stds[j] = Math.sqrt(varSum / samples.length) + 1e-6;
    }

    return samples.filter(s => {
        return s[0].every((val, j) => Math.abs(val - means[j]) <= 1.5 * stds[j]);
    });
}

function trainMultivariableRegression(samples) {
    const A = samples.map(s => s[0]);
    const X = samples.map(s => s[1]);
    const Y = samples.map(s => s[2]);

    const coeffX = solveLeastSquares(A, X);
    const coeffY = solveLeastSquares(A, Y);
    return { coeffX, coeffY };
}

function predictScreenPosition(features, cX, cY) {
    let predX = 0, predY = 0;
    for (let i = 0; i < features.length; i++) {
        predX += features[i] * cX[i];
        predY += features[i] * cY[i];
    }
    return [predX, predY];
}

// --- RENDERING Y HUD ---
function drawHUDCrosshair(width, height, alpha = 0.65) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgb(230, 230, 230)";
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 8]);

    const cx = width / 2;
    const cy = height / 2;

    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(width, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = "rgb(0, 255, 255)";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
    ctx.fill();

    ctx.restore();
}

// --- BUCLE PRINCIPAL DE DIBUJO ---
async function renderLoop() {
    const width = canvasElement.width = window.innerWidth;
    const height = canvasElement.height = window.innerHeight;

    if (videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;
        const results = faceLandmarker.detectForVideo(videoElement, performance.now());

        // Efecto digital de mejora de luz/contraste vía Canvas Filter (Equivalente a CLAHE)
        ctx.filter = "contrast(135%) brightness(110%)";
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, -width, 0, width, height);
        ctx.restore();
        ctx.filter = "none";

        let features = null;
        let isCentered = false;
        let offsetX = 0, offsetY = 0;
        let nosePx = [0, 0], foreheadPx = [0, 0];

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const landmarks = results.faceLandmarks[0];
            features = extractMultivariableFeatures(landmarks, width, height);

            nosePx = [landmarks[NOSE_TIP].x * width, landmarks[NOSE_TIP].y * height];
            foreheadPx = [landmarks[FOREHEAD].x * width, landmarks[FOREHEAD].y * height];

            // Espejar coordenada X debido a la vista de la cámara
            nosePx[0] = width - nosePx[0];
            foreheadPx[0] = width - foreheadPx[0];

            if (!anchorCenter) anchorCenter = [...nosePx];

            offsetX = nosePx[0] - anchorCenter[0];
            offsetY = nosePx[1] - anchorCenter[1];
            const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
            isCentered = distance <= maxAllowedDrift;
        }

        drawHUDCrosshair(width, height, 0.65);

        // BALANZA DE CABEZA
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const statusColor = isCentered ? "#00FF00" : "#FF0000";

            ctx.strokeStyle = statusColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(anchorCenter[0] - maxAllowedDrift, anchorCenter[1] - maxAllowedDrift, maxAllowedDrift * 2, maxAllowedDrift * 2);

            const barCx = foreheadPx[0];
            const barCy = Math.max(30, foreheadPx[1] - 35);
            const barW = 120;

            ctx.strokeStyle = "#C8C8C8";
            ctx.beginPath();
            ctx.moveTo(barCx - barW / 2, barCy); ctx.lineTo(barCx + barW / 2, barCy);
            ctx.stroke();

            let indicatorX = Math.min(Math.max(barCx + (offsetX * 0.8), barCx - barW / 2), barCx + barW / 2);
            ctx.fillStyle = statusColor;
            ctx.beginPath();
            ctx.arc(indicatorX, barCy, 7, 0, 2 * Math.PI); ctx.fill();
        }

        // ESTADO 1: CALIBRACIÓN EXTENSA MULTIVARIABLE
        if (state === "CALIBRATION") {
            const target = calibrationTargets[calibIndex];
            const tx = target.px * width;
            const ty = target.py * height;

            if (isSampling) {
                if (!isCentered) {
                    ctx.fillStyle = "#FF0000";
                    ctx.font = "bold 20px sans-serif";
                    ctx.fillText("¡MANTEN LA CABEZA CENTRADA EN LA BALANZA!", 30, 80);
                    sampleStartTime = performance.now() / 1000 - (currentPointSamples.length * (samplingDuration / 60));
                } else {
                    const elapsed = (performance.now() / 1000) - sampleStartTime;
                    const progress = Math.min(1.0, elapsed / samplingDuration);

                    if (features) currentPointSamples.push([features, tx, ty]);

                    const rAnim = Math.floor(35 * (1 - progress * 0.5));
                    ctx.fillStyle = "#00FF00";
                    ctx.beginPath(); ctx.arc(tx, ty, rAnim, 0, 2 * Math.PI); ctx.fill();

                    ctx.strokeStyle = "#FFFFFF";
                    ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.arc(tx, ty, 40, 0, 2 * Math.PI); ctx.stroke();

                    ctx.fillStyle = "#00FF00";
                    ctx.font = "bold 22px sans-serif";
                    ctx.fillText(`CALIBRANDO MULTIVARIABLE ${target.name}... ${Math.floor(progress * 100)}%`, 30, 40);

                    if (elapsed >= samplingDuration) {
                        isSampling = false;
                        const cleaned = filterOutliers(currentPointSamples);
                        allCalibrationSamples.push(...cleaned);
                        currentPointSamples = [];
                        calibIndex++;

                        if (calibIndex >= calibrationTargets.length) {
                            const trained = trainMultivariableRegression(allCalibrationSamples);
                            coeffX = trained.coeffX;
                            coeffY = trained.coeffY;
                            state = "GAME";
                        }
                    }
                }
            } else {
                ctx.fillStyle = "#FF0000";
                ctx.beginPath(); ctx.arc(tx, ty, 22, 0, 2 * Math.PI); ctx.fill();
                ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(tx, ty, 26, 0, 2 * Math.PI); ctx.stroke();

                ctx.fillStyle = "#00FFFF";
                ctx.font = "bold 22px sans-serif";
                ctx.fillText(`Punto Multivariable ${target.name}`, 30, 40);
                ctx.fillStyle = "#FAFAFA";
                ctx.font = "18px sans-serif";
                ctx.fillText("Mira el punto fijo y presiona 'ESPACIO' ('C' para recentrar)", 30, 80);
            }
        }
        // ESTADO 2: JUEGO GRILLA 4x4
        else if (state === "GAME") {
            ctx.strokeStyle = "#464646";
            ctx.lineWidth = 1;
            for (let i = 1; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(i * width / 4, 0); ctx.lineTo(i * width / 4, height);
                ctx.moveTo(0, i * height / 4); ctx.lineTo(width, i * height / 4);
                ctx.stroke();
            }

            let activeCol = 0, activeRow = 0;
            if (features) {
                const [rawX, rawY] = predictScreenPosition(features, coeffX, coeffY);

                if (smoothX === null) {
                    smoothX = rawX; smoothY = rawY;
                } else {
                    smoothX = alpha * rawX + (1 - alpha) * smoothX;
                    smoothY = alpha * rawY + (1 - alpha) * smoothY;
                }

                const clampX = Math.min(Math.max(smoothX, 0), width - 1);
                const clampY = Math.min(Math.max(smoothY, 0), height - 1);

                activeCol = Math.min(Math.floor(clampX / (width / 4)), 3);
                activeRow = Math.min(Math.floor(clampY / (height / 4)), 3);

                ctx.fillStyle = "#00FF00";
                ctx.beginPath(); ctx.arc(clampX, clampY, 10, 0, 2 * Math.PI); ctx.fill();
                ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(clampX, clampY, 14, 0, 2 * Math.PI); ctx.stroke();
            }

            const currentZoneIndex = activeRow * 4 + activeCol;
            const tCol = targetZone % 4;
            const tRow = Math.floor(targetZone / 4);
            const tx1 = tCol * width / 4, ty1 = tRow * height / 4;
            const tx2 = (tCol + 1) * width / 4, ty2 = (tRow + 1) * height / 4;

            ctx.fillStyle = "rgba(0, 255, 255, 0.25)";
            ctx.fillRect(tx1, ty1, tx2 - tx1, ty2 - ty1);

            ctx.fillStyle = "#00FFFF";
            ctx.font = "18px sans-serif";
            ctx.fillText(`OBJETIVO #${targetZone + 1}`, tx1 + 10, ty1 + 35);

            if (currentZoneIndex === targetZone && isCentered) {
                if (!gazeDwellStart) gazeDwellStart = performance.now() / 1000;
                const elapsed = (performance.now() / 1000) - gazeDwellStart;
                const progress = Math.min(1.0, elapsed / dwellDuration);

                ctx.fillStyle = "#00FF00";
                ctx.fillRect(tx1, ty2 - 12, (tx2 - tx1) * progress, 12);

                if (elapsed >= dwellDuration) {
                    score++;
                    gazeDwellStart = null;
                    targetZone = (targetZone + Math.floor(Math.random() * 15) + 1) % 16;
                }
            } else {
                gazeDwellStart = null;
            }

            ctx.fillStyle = "#00FF00";
            ctx.font = "bold 28px sans-serif";
            ctx.fillText(`PUNTOS: ${score}`, 30, 40);

            if (!isCentered) {
                ctx.fillStyle = "#FF0000";
                ctx.font = "bold 20px sans-serif";
                ctx.fillText("MANTEN LA CABEZA CENTRADA EN LA BALANZA!", 30, 80);
            }
        }
    }

    requestAnimationFrame(renderLoop);
}

// --- INICIALIZACIÓN DE MEDIAPIPE Y TECLADO ---
async function init() {
    videoElement = document.createElement("video");
    canvasElement = document.getElementById("output_canvas");
    ctx = canvasElement.getContext("2d");

    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numFaces: 1
    });

    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    videoElement.srcObject = stream;
    await videoElement.play();

    window.addEventListener("keydown", (e) => {
        if (e.key === "c" || e.key === "C") anchorCenter = null;
        if (e.code === "Space" && state === "CALIBRATION" && !isSampling) {
            isSampling = true;
            sampleStartTime = performance.now() / 1000;
            currentPointSamples = [];
        }
        if (e.key === "r" || e.key === "R") {
            state = "CALIBRATION";
            calibIndex = 0;
            allCalibrationSamples = [];
            isSampling = false;
            score = 0;
        }
    });

    renderLoop();
}

init();