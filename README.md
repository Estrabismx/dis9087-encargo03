# encargo03 - MediaPipe + OpenCV


FOCUS SCROLL


###    ENCUENTRO   ###

Empezó con una pregunta simple: ¿Qué pasa cuando estamos tan enfocados en la pantalla que no vemos nada más?

Todos los días vemos a personas, scrolleando sin parar. El teléfono consume toda la atención. El mundo afuera podría desaparecer y no nos enteraríamos. Así que decidimos hacerlo literal.

La intención final fue: Construir un sistema que visualice esa paradoja: mientras más concentrado estés en tu pantalla, más desaparece el entorno. La pantalla se oscurece cuando hay movimiento a tu alrededor.

###     OBJETIVO   ###

Este proyecto fusiona dos comportamientos diarios presentes en la rutina de millones de personas, el cual requiere de 2 situaciones. 
    1. Una persona concentrada "Scrolleando en su celular", aislándose del entorno y toda acción que pase a su alrededor 
    2. El transcurso diario que está presente en situaciones cotidianas. 

Quisimos revelar el cómo se interpretaría de manera visual este comportamiento, activando derivantes de movimiento y concentración del sujeto mediante un punto fijo en la pantalla. 

###     ¿De qué se trata?   ###

Hay dos sistemas de inteligencia que se ejecutan al mismo tiempo, con la misma cámara detecta el movimiento constante que ocurre dentro de su rango y la detección del iris de los ojos

###     Sistema A: El Movimiento (Media Pipe) ###

Detectamos todo lo que se mueve en el rango de la cámara. Cualquier cambio, cualquier gesto, cualquier persona pasando. Si hay movimiento, la pantalla comienza a oscurecerse progresivamente.

Es como si el entorno estuviera desapareciendo mientras hablaba con tu teléfono.

###     Sistema B: El Iris (OpenCV)    ###

Pero necesitábamos ser más inteligente. Si detectamos movimiento porque *tú* te moviste (tu mano, tu cabeza), no debería contar. El sistema tiene que saber que eres tú.

Entonces rastreamos tu iris. Mientras tu vista esté fija en la pantalla el sistema entiende que ese movimiento sí te afecta. Que sí deberías verlo, pero no lo ves.

OpenCV válida lo que Media Pipe ve. Es como una segunda opinión que hace el sistema más sensible, más precisión.

###     ¿Cómo probarlo?    ##

Simplemente descargando el repositorio y haciendo doble click en el archivo de INDEX.HTML, este té abrirá una página externa en tu navegador predeterminado, solo tendrás que activar el permiso de cámara y podrás ver el resultado. 


###     Reflexión    ###

No te dice qué hacer con tu pantalla. No te juzga por mirar. Solo te muestra, de manera literal y visual, lo que sucede cuando lo haces: el mundo a tu alrededor desaparece.

Mientras más concentrado estés en la pantalla, más oscuro se vuelve todo lo demás. Y cuando levantas la vista, todo vuelve. Pero el tiempo se perdió.

No es una lección. Es una observación.

La mayoría de nosotros sabemos que las pantallas nos absorben. Lo vivimos. Pero ver cómo el entorno se desvanece físicamente en tiempo real es diferente. Es hacer visible lo invisible.

Y eso, simple, te hace pensar.

¿Qué estoy perdiendo mientras miro esto? ¿Quién está cerca que no veo? ¿Vale la pena?
