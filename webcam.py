import cv2
import numpy as np

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

ret, frame_inicial = cap.read()
if not ret:
    print("Error: No se puede recibir señal.")
    exit()

frame_anterior = cv2.cvtColor(frame_inicial, cv2.COLOR_BGR2GRAY)
frame_anterior = cv2.GaussianBlur(frame_anterior, (21, 21), 0)

kernel_cierre = np.ones((25, 25), np.uint8)
kernel_dilatacion = np.ones((11, 11), np.uint8)

# =====================================================================
# VARIABLES DE MEMORIA TEMPORAL (NUEVO)
# =====================================================================
# Guardamos el estado del blur en el ciclo anterior. Inicializa en el mínimo.
blur_actual_suavizado = 3.0 

# Velocidad de desvanecimiento (Alpha). Rango [0.0 a 1.0]
# 1.0 = Cambio instantáneo (Sin delay)
# 0.05 = Desvanecimiento muy lento y fluido (Mucho delay)
factor_suavizado = 0.08 
# =====================================================================

while True:
    ret, frame_actual = cap.read()
    if not ret: break
    
    # Obtenemos las dimensiones de la ventana para dibujar las barras correctamente
    alto_ventana, ancho_ventana, _ = frame_actual.shape

    sensibilidad_luz = 20 
    minimo_pixeles_activacion = 3000 
    movimiento_esperado_max = 80000 
    blur_minimo = 3
    blur_maximo = 91  

    gris_actual = cv2.cvtColor(frame_actual, cv2.COLOR_BGR2GRAY)
    gris_actual_blur = cv2.GaussianBlur(gris_actual, (21, 21), 0)
    
    diferencia = cv2.absdiff(frame_anterior, gris_actual_blur)
    _, umbral = cv2.threshold(diferencia, sensibilidad_luz, 255, cv2.THRESH_BINARY)
    
    movimiento_total = cv2.countNonZero(umbral)

    # --- 1. CÁLCULO DEL BLUR OBJETIVO (El que debería ser en este instante) ---
    if movimiento_total > minimo_pixeles_activacion:
        movimiento_restringido = min(movimiento_total, movimiento_esperado_max)
        proporcion = movimiento_restringido / movimiento_esperado_max
        blur_objetivo = blur_minimo + (proporcion * (blur_maximo - blur_minimo))
    else:
        blur_objetivo = blur_minimo

    # --- 2. APLICAR SUAVIZADO TEMPORAL (La magia del Fade) ---
    # Fórmula de interpolación lineal: (Nuevo_Valor * velocidad) + (Valor_Anterior * (1 - velocidad))
    blur_actual_suavizado = (blur_objetivo * factor_suavizado) + (blur_actual_suavizado * (1.0 - factor_suavizado))
    
    # Convertimos a entero para usarlo en el kernel
    intensidad_blur = int(blur_actual_suavizado)
    
    # Aseguramos que sea impar
    if intensidad_blur % 2 == 0:
        intensidad_blur += 1
        
    # Limitamos por seguridad
    intensidad_blur = max(3, intensidad_blur)

    # --- 3. GENERACIÓN DE LA MÁSCARA ---
    if intensidad_blur > 3: # Si hay efecto activo
        mascara_cerrada = cv2.morphologyEx(umbral, cv2.MORPH_CLOSE, kernel_cierre)
        mascara_dilatada = cv2.dilate(mascara_cerrada, kernel_dilatacion, iterations=2)
        contornos, _ = cv2.findContours(mascara_dilatada, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        mascara_solida = np.zeros_like(mascara_dilatada)
        cv2.drawContours(mascara_solida, contornos, -1, (255), thickness=-1)
        mascara_3_canales = cv2.cvtColor(mascara_solida, cv2.COLOR_GRAY2BGR)

        frame_desenfocado = cv2.GaussianBlur(frame_actual, (intensidad_blur, intensidad_blur), 0)
        frame_final = np.where(mascara_3_canales == 255, frame_actual, frame_desenfocado)
    else:
        frame_final = frame_actual

    # --- 4. INTERFAZ GRÁFICA (Barras indicadoras) ---
    # Coordenadas de las barras (X, Y)
    origen_x = 30
    origen_y_mov = alto_ventana - 80
    origen_y_blur = alto_ventana - 40
    ancho_maximo_barra = 250
    alto_barra = 20

    # Calcular el ancho en píxeles basado en las proporciones
    proporcion_mov = min(movimiento_total / movimiento_esperado_max, 1.0)
    ancho_barra_mov = int(proporcion_mov * ancho_maximo_barra)
    
    proporcion_blur = (intensidad_blur - blur_minimo) / (blur_maximo - blur_minimo)
    ancho_barra_blur = int(max(0, min(proporcion_blur, 1.0)) * ancho_maximo_barra)

    # Fondos oscuros de las barras
    cv2.rectangle(frame_final, (origen_x, origen_y_mov), (origen_x + ancho_maximo_barra, origen_y_mov + alto_barra), (50, 50, 50), -1)
    cv2.rectangle(frame_final, (origen_x, origen_y_blur), (origen_x + ancho_maximo_barra, origen_y_blur + alto_barra), (50, 50, 50), -1)

    # Barras de llenado dinámico (BGR)
    # Barra de Movimiento (Cruda, sin delay) -> Naranja
    cv2.rectangle(frame_final, (origen_x, origen_y_mov), (origen_x + ancho_barra_mov, origen_y_mov + alto_barra), (0, 165, 255), -1)
    
    # Barra de Efecto Blur (Con delay) -> Cian
    cv2.rectangle(frame_final, (origen_x, origen_y_blur), (origen_x + ancho_barra_blur, origen_y_blur + alto_barra), (255, 255, 0), -1)

    # Etiquetas de texto minimalistas
    cv2.putText(frame_final, "Sensor RAW", (origen_x, origen_y_mov - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
    cv2.putText(frame_final, "Nivel Efecto", (origen_x, origen_y_blur - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

    cv2.imshow('Desenfoque con Delay Temporal', frame_final)
    frame_anterior = gris_actual_blur

    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()