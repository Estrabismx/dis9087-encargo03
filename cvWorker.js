// cvWorker.js
importScripts('https://docs.opencv.org/4.8.0/opencv.js');

let prevFrameMat = null;

cv['onRuntimeInitialized'] = () => {
    postMessage({ type: 'STATUS', payload: '[OpenCV Worker] Inicializado.' });
    postMessage({ type: 'READY' });
};

onmessage = (e) => {
    if (e.data.type === 'PROCESS' && cv) {
        let movementPercentage = 0;
        const imageData = e.data.payload.imageData;
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

        postMessage({ type: 'RESULT', payload: { movement: movementPercentage } });
    }
};