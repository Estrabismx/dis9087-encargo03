# FOCUS SCROLL

encargo03 · MediaPipe + OpenCV

> Mientras más concentrado estés en tu pantalla, más desaparece el entorno.

---

## Índice

1. [Encuentro](#encuentro)
2. [Objetivo](#objetivo)
3. [¿De qué se trata?](#de-qué-se-trata)
4. [Instructivo de uso](#instructivo-de-uso)
5. [Cómo funciona (referencia técnica)](#cómo-funciona-referencia-técnica)
6. [Ajustar la herramienta](#ajustar-la-herramienta)
7. [Solución de problemas](#solución-de-problemas)
8. [Estructura del proyecto](#estructura-del-proyecto)
9. [Reflexión](#reflexión)

---

## Encuentro

Empezó con una pregunta simple: ¿Qué pasa cuando estamos tan enfocados en la pantalla que no vemos nada más?

Todos los días vemos a personas scrolleando sin parar. El teléfono consume toda la atención. El mundo afuera podría desaparecer y no nos enteraríamos. Así que decidimos hacerlo literal.

La intención final fue construir un sistema que visualice esa paradoja: mientras más concentrado estés en tu pantalla, más desaparece el entorno. La pantalla se oscurece cuando hay movimiento a tu alrededor.

## Objetivo

Este proyecto fusiona dos comportamientos diarios presentes en la rutina de millones de personas:

1. Una persona concentrada "scrolleando en su celular", aislándose del entorno y de toda acción que pase a su alrededor.
2. El transcurso diario que está presente en situaciones cotidianas.

Quisimos revelar cómo se interpretaría de manera visual este comportamiento, activando detectores de movimiento y de concentración del sujeto mediante un punto fijo en la pantalla.

## ¿De qué se trata?

Hay dos sistemas de inteligencia que se ejecutan al mismo tiempo con la misma cámara: uno detecta el movimiento que ocurre dentro de su rango y el otro detecta hacia dónde está mirando la persona.

### Sistema A: El Movimiento (OpenCV)

Detectamos todo lo que se mueve en el rango de la cámara. Cualquier cambio, cualquier gesto, cualquier persona pasando. Si hay movimiento, la pantalla comienza a oscurecerse progresivamente.

Es como si el entorno estuviera desapareciendo mientras hablas con tu teléfono.

### Sistema B: La Mirada (MediaPipe)

Pero necesitábamos ser más inteligentes. El movimiento solo debería importar cuando *tú* no lo estás viendo. El sistema tiene que saber dónde está tu atención.

Entonces rastreamos tu rostro. Mientras tu vista esté fija en la pantalla, el sistema entiende que ese movimiento sí te afecta: que deberías verlo, pero no lo ves.

MediaPipe valida lo que OpenCV ve. Es como una segunda opinión que hace al sistema más preciso.

---

## Instructivo de uso

### Requisitos

| Necesitas | Detalle |
| --- | --- |
| Navegador actualizado | Chrome, Edge, Firefox o Safari (escritorio o móvil). Se recomienda Chrome/Edge. |
| Cámara | Webcam del computador o cámara frontal del celular. |
| Conexión a internet | Las librerías (MediaPipe y OpenCV) se descargan desde CDN la primera vez. |
| Permiso de cámara | El navegador lo pedirá al abrir la página. |

### Abrir la herramienta

Elige una de estas opciones:

- **Opción rápida:** descarga el repositorio y haz doble clic en `index.html`. Se abrirá en tu navegador predeterminado.
- **Opción recomendada (servidor local):** abre la carpeta en VS Code y usa la extensión **Live Server** ("Go Live"). El proyecto ya está configurado para el puerto `5501`, así que se abrirá en `http://127.0.0.1:5501`. Así el navegador recuerda el permiso de cámara y no lo pide cada vez.
- **En celular:** la página debe estar publicada con `https://` (por ejemplo, con GitHub Pages). Los navegadores móviles bloquean la cámara en páginas sin HTTPS.

### Paso a paso

1. **Abre la página.** Verás una pantalla de carga con mensajes de estado ("Inicializando MediaPipe…", "Esperando OpenCV…", "Iniciando Cámara…"). La primera vez puede tardar entre 5 y 20 segundos según tu conexión.
2. **Acepta el permiso de cámara** cuando el navegador lo pida.
3. **Ubícate frente a la cámara**, con el rostro completo visible y buena iluminación.
4. **Observa los dos visores:**
   - **Tu Iris (¿Dónde Mirás?)**: muestra tu imagen y una **mira** que sigue la orientación de tu cabeza.
     - Mira **verde** = estás enfocado en la pantalla.
     - Mira **roja** = no estás enfocado.
   - **El Entorno (Oscurece si mirás)**: muestra la misma cámara, pero esta imagen **se oscurece** cuando estás enfocado *y* hay movimiento alrededor.
5. **Prueba la experiencia:**
   - Baja levemente la vista hacia la pantalla, como si estuvieras leyendo el celular (la mira se pone verde).
   - Pide a alguien que pase por detrás o mueve objetos en el fondo.
   - El visor del entorno se oscurece de inmediato.
   - Levanta la vista o mira hacia un lado: la imagen vuelve a aparecer **lentamente**, a propósito.
6. **Apaga o enciende la cámara** con el botón de encendido:
   - **Escritorio:** botón **"Apagar cámara / Encender cámara"** en el marco inferior derecho del televisor. La luz de la izquierda se pone verde (encendida) o roja (apagada).
   - **Móvil:** botón circular en la parte inferior de la pantalla del celular.
   - Al apagarla se detiene la cámara por completo (se apaga también la luz física de la webcam) y se pausa el análisis.

### Vista escritorio vs. móvil

| | Escritorio (más de 768 px) | Móvil (768 px o menos) |
| --- | --- | --- |
| Marco | Televisor con soporte | Celular |
| Visores | Uno al lado del otro | Uno encima (mirada) y otro debajo (entorno) |
| Botón de cámara | Botón con texto en el marco del TV | Botón circular en pantalla |

### Privacidad

Todo el procesamiento ocurre **en tu propio navegador**. El video **no se envía ni se guarda** en ningún servidor; internet solo se usa para descargar las librerías.

---

## Cómo funciona (referencia técnica)

```text
            ┌──────────── Cámara (getUserMedia) ────────────┐
            │                                                │
   ┌────────▼─────────┐                          ┌───────────▼───────────┐
   │ MediaPipe        │                          │ OpenCV.js             │
   │ Face Mesh        │                          │ Diferencia de frames  │
   │ ¿Está mirando    │                          │ ¿Cuánto se mueve el   │
   │ la pantalla?     │                          │ entorno? (%)          │
   └────────┬─────────┘                          └───────────┬───────────┘
            │ usuarioEnfocado (sí/no)                        │ nivelMovimiento (%)
            └──────────────────────┬─────────────────────────┘
                                   ▼
                 Si enfocado Y movimiento > umbral → oscurecer
                 Si no → recuperar la imagen poco a poco
```

### 1. Detección de enfoque (MediaPipe Face Mesh)

- MediaPipe ubica 468 puntos del rostro en cada frame.
- Con la **nariz** y los **bordes de la cara** (izquierdo, derecho, frente y mentón) se calculan dos proporciones:
  - **Yaw** (giro horizontal): posición de la nariz entre los bordes izquierdo y derecho.
  - **Pitch** (inclinación vertical): posición de la nariz entre la frente y el mentón.
- La persona se considera **enfocada** cuando mira levemente hacia abajo (`pitch > 0.4`) y está centrada (`|yaw − 0.5| < 0.3`), que es la postura típica de quien mira su celular.
- La mira del visor superior/izquierdo es la representación visual de esos valores.

> Nota: aunque en el proyecto lo llamamos "iris", técnicamente se estima la **orientación de la cabeza**, que es más estable con webcams comunes.

### 2. Detección de movimiento (OpenCV.js)

En cada ciclo (máximo 20 por segundo):

1. Se reduce el frame a 240 px de alto (más rápido de analizar).
2. Se convierte a escala de grises y se suaviza con un desenfoque gaussiano (para ignorar el ruido de la cámara).
3. Se compara con el frame anterior (`absdiff`) y se marcan los píxeles que cambiaron más que el umbral.
4. El **% de píxeles cambiados** es el nivel de movimiento del entorno.

### 3. La conexión entre ambos sistemas

- Si la persona **está enfocada** y el movimiento supera el umbral, la opacidad del visor del entorno baja **de inmediato** en proporción al movimiento.
- Si deja de haber movimiento o la persona levanta la vista, la imagen se **recupera lentamente** (+2,5 % por ciclo). Esa lentitud representa el tiempo que "se perdió".

---

## Ajustar la herramienta

Todos los parámetros están al inicio de [main.js](main.js):

| Constante | Valor | Qué hace | Si lo subes… | Si lo bajas… |
| --- | --- | --- | --- | --- |
| `UMBRAL_PIXEL` | `15` | Diferencia mínima de brillo para que un píxel cuente como movimiento | Ignora cambios leves y el ruido | Más sensible (puede reaccionar al ruido con poca luz) |
| `UMBRAL_MOVIMIENTO` | `0.8` | % mínimo del cuadro que debe moverse para oscurecer | Necesita movimientos más grandes | Reacciona a movimientos pequeños |
| `FACTOR_OSCURECER` | `12` | Cuánto se oscurece por cada % de movimiento | Oscurece más rápido | Oscurece más suave |
| `BLUR_KERNEL` | `15` | Tamaño del desenfoque previo (debe ser **impar**) | Ignora detalles finos | Detecta movimientos más finos |
| `THRESHOLD_ENFOQUE` | `0.4` | Qué tanto hay que bajar la vista para estar "enfocado" | Hay que mirar más hacia abajo | Se activa casi mirando al frente |
| `FPS_LIMIT` | `20` | Análisis por segundo | Más fluido, más uso de CPU | Menos consumo (útil en equipos lentos) |
| `ALTO_ANALISIS` | `240` | Resolución del análisis de movimiento | Más preciso, más pesado | Más liviano |

**Recomendación:** si la imagen se oscurece sin que nadie se mueva (habitación oscura, cámara con ruido), sube primero `UMBRAL_PIXEL` a 18–20.

---

## Solución de problemas

| Problema | Causa probable | Solución |
| --- | --- | --- |
| Se queda en "Esperando OpenCV…" | Conexión lenta o bloqueada | Espera unos segundos más o recarga. Verifica que no haya bloqueadores de contenido. |
| "Error de Cámara. Revisa permisos." | Permiso denegado o cámara usada por otra app | Permite la cámara desde el ícono de candado de la barra de direcciones y cierra otras apps que la usen (Zoom, Teams, etc.). |
| No funciona en el celular | La página no está en HTTPS | Publícala con GitHub Pages u otro hosting con HTTPS. |
| La mira no aparece | No se detecta el rostro | Mejora la iluminación y ubica el rostro completo frente a la cámara. |
| La mira está siempre roja | No se detecta la postura "mirando hacia abajo" | Baja un poco más la vista, o baja `THRESHOLD_ENFOQUE` (por ejemplo, a `0.35`). |
| Se oscurece sin movimiento | Ruido de la cámara | Sube `UMBRAL_PIXEL` o `UMBRAL_MOVIMIENTO`. |
| Va lento o con saltos | Equipo con poca CPU | Baja `FPS_LIMIT` a 12–15 o `ALTO_ANALISIS` a 180. |

---

## Estructura del proyecto

```text
├── index.html   Estructura de la página: marco (TV/celular), visores y botón de cámara
├── style.css    Diseño: marco de TV (escritorio), celular (móvil), mira y estados
├── main.js      Lógica: cámara, MediaPipe, OpenCV, conexión entre sistemas y botón
├── README.md    Este documento
└── LICENSE
```

**Librerías externas** (se cargan desde CDN, no requieren instalación):
- [MediaPipe Face Mesh](https://github.com/google-ai-edge/mediapipe) `0.4.1633559619`
- [OpenCV.js](https://docs.opencv.org/4.8.0/) `4.8.0`

---

## Reflexión

No te dice qué hacer con tu pantalla. No te juzga por mirar. Solo te muestra, de manera literal y visual, lo que sucede cuando lo haces: el mundo a tu alrededor desaparece.

Mientras más concentrado estés en la pantalla, más oscuro se vuelve todo lo demás. Y cuando levantas la vista, todo vuelve. Pero el tiempo se perdió.

No es una lección. Es una observación.

La mayoría de nosotros sabemos que las pantallas nos absorben. Lo vivimos. Pero ver cómo el entorno se desvanece físicamente en tiempo real es diferente. Es hacer visible lo invisible.

Y eso, simple, te hace pensar.

¿Qué estoy perdiendo mientras miro esto? ¿Quién está cerca que no veo? ¿Vale la pena?
