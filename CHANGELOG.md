# Novedades

Formato: versión (semver) · fecha. Cada cambio que llega a `main` sube la versión en `package.json` y añade su entrada aquí:
**parche** (1.0.x) para correcciones, **menor** (1.x.0) para funciones nuevas, **mayor** (x.0.0) para cambios que rompen algo.

## 1.32.0 · 2026-10-08

### Instalaciones vistas desde atrás
- Nuevo botón **«Ver desde atrás (instalaciones)»** (tecla **V**) en el 3D. Pone la cámara detrás del muro con muebles o puntos y muestra las tuberías de agua y desagüe, el gas, la salida de campana y el tubo eléctrico de cada punto. Cada clic pasa al siguiente muro.
- En **Alzado**, el botón **«Instalaciones»** convierte el dibujo en el **plano de instalaciones**: cada punto lleva su distancia **desde la esquina izquierda** y su altura desde el piso, en mm. En **Aprobación** el plano sale en la galería y en el PDF, una página por muro.
- Los alzados acotan también **el ancho de las alacenas y la campana**, arriba del dibujo. Los muros B y D ya se dibujan como se ven de frente.

### Especificaciones
- **Paso 3:** la distancia de cada punto dice **«cm desde la izquierda»**, mirando el muro de frente, en todos los muros.
- **Paso 5:** nueva sección **«Colores y texturas»**. Tocas el color o la textura de frentes, cuerpo, encimera y jaladeras. Aparecen también las texturas que subiste a la biblioteca de tableros.

### Separación entre puertas
- Eliges cuánto **despegan las puertas y cajones** entre sí: **2, 3, 4 o 5 mm**. Está en el paso 5 y en **Materiales**. Se ve en el 3D y en los dibujos, y **se descuenta del tamaño de puertas y cajones** en el despiece y el corte. Por defecto son 4 mm, como hasta ahora.

### Muebles para electrodomésticos
- En el catálogo hay **Mueble para nevera** (columna con puertas arriba), **Mueble para lavadora** (bajo la encimera), **Mueble para microondas** y **Mueble para extractor** (alacenas). El electrodoméstico se ve dentro de su hueco en el 3D, el alzado y el isométrico. El hueco no lleva puerta en el despiece.
- En **Bibliotecas → módulos**, los frentes tienen las opciones **«Hueco para nevera / lavadora / microondas / extractor»** para crear tus propias versiones.

### Paredes y planchas
- En **Materiales → Paredes**, cada muro (A–D) puede llevar **un color de pintura o una textura** de la biblioteca de tableros.
- Con **«Agregar plancha»** cubres una zona del muro con un tablero, por ejemplo un salpicadero, un panel decorativo o un respaldo de TV. Indicas su distancia desde la izquierda, ancho, altura desde el piso y alto. Las planchas se ven en el 3D y en el alzado, y salen en el **despiece y la optimización de corte**.

## 1.31.0 · 2026-10-06

### 3D más realista
- Los renders de la **galería de vistas, el PDF y la página del cliente** llevan **oclusión ambiental**: sombras suaves de contacto en las esquinas, en la unión de la encimera con la pared, debajo de las alacenas y entre módulos. El diseño se ve con más profundidad, más parecido a una foto.
- El editor 3D no cambia de velocidad, porque el efecto solo se aplica a los renders. También funciona sin conexión. Si el equipo no lo soporta, el render sale como antes.

## 1.30.0 · 2026-10-06

### Exportar a SketchUp
- En **Aprobación → Exportar** está **«Modelo 3D para SketchUp» (DAE)**. Descarga el proyecto en 3D para abrirlo en SketchUp con **Archivo → Importar → Archivos COLLADA (*.dae)**.
- **Cada módulo llega como un grupo con su nombre** («M5 Columna horno»…), y la encimera como su propio grupo. Las medidas son reales y van en metros.
- Los materiales llevan **el nombre y el color del catálogo** (Roble natural, Blanco mate, Cuarzo blanco…). Las texturas de imagen no se exportan; cada material va con su color.

## 1.29.0 · 2026-10-06

### Biblioteca de la empresa y biblioteca personal
- En **Bibliotecas**, cada tablero y cada módulo tiene **«Visible para»**:
  - **Toda la empresa:** como hasta ahora.
  - **Solo yo:** solo tú lo ves en tu biblioteca, en la paleta del editor y en el asistente. Ni siquiera el administrador lo ve.
- **«Guardar lo nuevo en»** elige dónde van tus subidas, importaciones y módulos nuevos: la biblioteca de la empresa o la tuya.
- **«Mostrar»** filtra la lista: todo, de la empresa o solo los míos.
- **Compartir con la empresa:** pasa algo tuyo a «Toda la empresa» cuando quieras. Quitarle algo a la empresa (pasarlo a «Solo yo») solo lo hace un administrador.
- Si alguien borra su cuenta o se cambia de organización, sus módulos y tableros personales se quedan en la biblioteca de la empresa.
- Un proyecto compartido que usa un módulo personal de otra persona se ve y se cotiza igual para todos. Ese módulo simplemente no aparece en tu paleta.

## 1.28.0 · 2026-10-06

### Lista de corte con el formato de cada empresa
- Nueva sección **Administración → Lista de corte** para armar **plantillas** con el formato que pide cada optimizador o formulario de pedido:
  - **Columnas:** eliges qué dato va en cada una, con el **nombre de encabezado** que quieras y en el orden que quieras. Puedes agregar cantos por lado (L1, L2, A1, A2), número de fila, proyecto, cliente, un texto fijo o columnas vacías.
  - **Formato del archivo:** unidad (mm, cm, m o pulgadas), punto o coma decimal, separador (coma, punto y coma o tabulador), una fila por pieza, y formato de veta y de cantos (texto, Sí/No o 1/0).
  - **Vista previa** al momento con una cocina de ejemplo.
- Vienen 4 plantillas listas: **Estándar Planner, Optimizador (largo, ancho, cantidad), Con cantos por lado y Excel en centímetros**. Duplica cualquiera para adaptarla.
- En **Aprobación → Lista de corte** eliges la plantilla antes de **Descargar CSV**. Cada dispositivo recuerda la última que usaste.

## 1.27.0 · 2026-10-06

### Nuevo: Mueble de TV
- En **Nuevo proyecto** aparece **Mueble de TV** (centro de entretenimiento), con su propio asistente:
  - **Paso 4, Equipos:** consola de videojuegos, barra de sonido, decodificador, chimenea eléctrica e iluminación LED.
  - **Paso 5, Preferencias:** tamaño de la TV en pulgadas (te dice la medida de la pantalla), altura del centro de la TV, 0, 1 o 2 torres laterales, número de repisas flotantes, panel detrás de la TV y alacena superior.
- **«Generar distribución»** arma el mueble: torres en los extremos, consola entre ellas, panel centrado detrás de la pantalla y a su altura, repisas a los lados y alacena encima. Si la TV es muy grande para el muro, o no caben las torres o las repisas, te avisa.
- Módulos nuevos en el catálogo: **Consola TV, Torre lateral, Panel para TV, Repisa flotante y Alacena superior**. Le llegan solos a todas las organizaciones.
- El panel y las repisas salen en la **lista de corte como un solo tablero**, no como una caja, y se dibujan con el material de los frentes.

### Bibliotecas
- Cada módulo tiene el campo **Proyecto** (Cocina, Closet y vestidor, o Mueble de TV). Así tus módulos se pueden usar y ubicar en cada tipo de proyecto, con ubicaciones de TV (consola, torre, panel, repisa, alacena superior).

## 1.26.0 · 2026-10-06

### Encender y apagar sombras
- En el editor 3D hay un botón **☀ Sombras** (o la tecla **S**) para apagarlas o encenderlas. Sin sombras la vista 3D va más fluida en teléfonos y computadoras lentas.
- La elección se recuerda en cada dispositivo. Los renders de la galería, el PDF y la página del cliente siempre salen con sombras.

## 1.25.0 · 2026-09-28

### Electrodomésticos en Especificaciones
- En **Fase 1 → Electrodomésticos** eliges el modelo de cada equipo y la distribución propuesta lo coloca:
  - **Refrigerador:** congelador arriba o **2 puertas (lado a lado)**.
  - **Estufa:** **empotrable** o **tradicional (de piso)**, de **4 o 6 hornillas**.
  - **Fregadero:** de **1 o 2 bocas**.
- En **Preferencias → Módulos de la propuesta** ya no aparecen electrodomésticos como si fueran muebles.

### Tu base de fregadero lleva su fregadero
- El módulo que elijas para **«Bajo fregadero»** recibe siempre el fregadero (con las bocas que elegiste), aunque tu módulo solo tenga el hueco. Lo mismo con **«Bajo parrilla»** y la parrilla.

## 1.24.0 · 2026-09-28

### Mueve y gira tus muebles como quieras
- Con **«Mover muebles»** activo llevas un mueble **a donde quieras**: a lo largo de su muro, a otro muro (se pasa solo al que queda más cerca del dedo) o **al centro de la cocina**, donde queda libre (como isla o península). Arrímalo de espaldas a un muro, derecho, y se pega otra vez.
- Mientras arrastras en 3D se mueve todo con él: la encimera, el fregadero y la parrilla.
- **Gíralo a los grados que quieras**, a mano: con la barra de giro (0 a 359°), los botones **−15°, +15° y +90°**, o escribiendo los grados en Ubicación → Giro. Con «Mover muebles» activo aparece un control de giro sobre la vista 3D para el mueble seleccionado. Tecla **G** gira 15° (Mayús+G, −15°).
- Un mueble girado se ve girado en 3D, en la planta (con su frente marcado) y con su encimera, fregadero o parrilla girados con él.
- Los altos y campanas siguen siempre en un muro; al girarlos pasan al siguiente.

## 1.23.0 · 2026-09-28

### Mover y girar muebles en la vista 3D
- Nuevo botón **«Mover muebles»** en la barra de la vista 3D (tecla **M**). Con él activo, **arrastra un mueble con el dedo o el ratón** y se desliza por su muro (o libre si es de isla), alineándose solo con las esquinas y los muebles vecinos. Mientras lo mueves ves «Muro A · 63 cm desde la esquina». La cámara no gira mientras arrastras; tocar sin arrastrar lo sigue seleccionando.
- Nuevo botón **«Girar mueble 90°»** en la misma barra (tecla **G**) y en las propiedades del mueble (Ubicación → «Girar 90°»):
  - una **isla** gira sobre su centro (0°, 90°, 180°, 270°), con su encimera, su fregadero o parrilla y sus puertas;
  - un mueble de **muro** pasa al siguiente muro de la habitación (A → C → D → B), porque los muebles de muro siempre miran hacia adentro.
- Todo se puede deshacer con Ctrl+Z.

## 1.22.0 · 2026-09-28

### Más electrodomésticos
- **Estufa tradicional de 4 y de 6 hornillas** (de piso): cuerpo de acero con horno, perillas y parrillas. La encimera se corta a sus lados, no lleva zócalo y se cotiza a su precio, sin despiece.
- **Nevera de 2 puertas** (lado a lado), **Bajo fregadero de 2 bocas** (dos tinas con su hueco en la encimera) y **Estufa empotrable de 6 hornillas**.
- Están en **Módulos → Electro** (el fregadero doble, en Bajos) y se ven en 3D, planta, alzados, vista isométrica y PDF. Llegan solos a tu catálogo al abrir el editor.

### Optimización de corte
- En **Aprobación → Corte** aparece **«Optimización de corte»**: cada tablero dibujado con sus piezas acomodadas, cuántos tableros necesitas y el aprovechamiento. Ajusta el **ancho de sierra** y el **refilado de orilla**. En maderas, las piezas con veta no se giran.
- **Exportar → Optimización de corte**, en **PDF** (una página por tablero, con medidas y a qué módulo va cada pieza) o en **CSV** (posición X/Y de cada pieza).

### Biblioteca de tableros
- La biblioteca de texturas ahora es la **biblioteca de tableros**. En cada tablero anotas su **espesor**, el **tamaño de la plancha** (largo × ancho) y el **distribuidor**.
- El despiece corta con el espesor de cada tablero. La lista de corte y la optimización usan su plancha y muestran el distribuidor.

### Galería de vistas
- **«Agregar vista»** en la galería: encuadra otra toma en 3D, ponle nombre y queda en la galería, en el PDF y en la página que ve el cliente. Puedes ajustarla, renombrarla o quitarla (hasta 12).

## 1.21.0 · 2026-09-28

### Ubicación predeterminada de tus módulos
- En **Bibliotecas → Módulos**, cada módulo tiene **«Ubicación predeterminada»**: bajo encimera, bajo encimera esquina, bajo fregadero, bajo parrilla, cajonera, estrecho, isla, montaje alto, **montaje alto esquina**, **sobre nevera**, columnas; y en closets colgado largo o corto, cajonera, zapatero, entrepaños e isla. Las opciones dependen del montaje del módulo.
- «Generar distribución» coloca cada módulo en su ubicación **sin tener que elegirlo en el asistente**. En «Módulos de la propuesta» aparecen como «Automático»; puedes forzar el estándar con «Estándar».
- **Sobre nevera:** el módulo va justo encima del refrigerador, con su mismo ancho, y llega hasta la línea de las alacenas. **Montaje alto esquina:** va en la esquina donde se unen los muros.

## 1.20.0 · 2026-09-28

### Tus módulos en la distribución propuesta
- En **Especificaciones → Preferencias** aparece **«Módulos de la propuesta»**: para cada pieza (esquinero, fregadero, bases de 1 y 2 puertas, alacenas, columnas, campana, isla; en closets colgados, cajoneras, zapatero, entrepaños) eliges **tu módulo** de la biblioteca o dejas el estándar. «Generar distribución» los usa directamente, sin tener que cambiarlos uno por uno.
- Tus módulos aparecen primero, bajo «Mis módulos».
- Si un módulo tuyo no admite el ancho de algún hueco (por ejemplo, un modelo de ancho fijo), en ese hueco se usa el estándar y te avisamos.
- **«Usar siempre en proyectos nuevos»** (administradores) guarda tu selección para que cada proyecto nuevo empiece con tus módulos.

## 1.19.4 · 2026-09-28

### Inicio
- Se quitó el botón «Prototipo» de la pantalla principal.

## 1.19.3 · 2026-09-28

### Instalación
- Si la dirección de la base de datos está mal escrita (por ejemplo, una contraseña con `@`, `#` o `/`), el servidor ahora lo dice claramente al arrancar en lugar de mostrar un error técnico.

## 1.19.2 · 2026-09-28

### Dokploy con una base de datos externa
- La instalación en Dokploy puede usar una base de datos que esté en otro servidor (por ejemplo, la de Easypanel mientras mudas), poniendo `DATABASE_URL`.

## 1.19.1 · 2026-09-28

### Despliegue en Dokploy
- Planner también se puede instalar en **Dokploy**: un archivo listo (`docker-compose.dokploy.yml`) levanta la app y su base de datos de una vez, y la guía explica cómo pasar los datos desde Easypanel.

## 1.19.0 · 2026-09-26

### Crea y convierte tus módulos dentro de Planner
- **Crear módulo** (Bibliotecas → Módulos): nombre, montaje (bajo, alto o columna), categoría, ancho con su mínimo y máximo, alto, fondo, precio y **frentes**: puertas (1 a 4 por fila), gavetas, abierto con repisas o hueco de horno, cada uno con su alto en cm. Lo ves en una vista previa mientras lo armas, y el alto de los frentes se ajusta solo a la altura del módulo.
- **Convertir y frentes** en cada módulo que subes desde **Polyboard** (3DS o DAE) o **SketchUp** (.skp):
  - elige cómo se dibuja: **módulo nativo** (puertas y gavetas que abren, zócalo, jaladeras y tu material) o **modelo 3D tal cual**, con su forma y colores, útil para electrodomésticos o decoración;
  - corrige las puertas y gavetas que Planner detectó en tus piezas, o vuelve a las del modelo con un toque;
  - un modelo que no viene por tablas también se puede convertir a nativo, poniéndole tú sus frentes.
- Los módulos paramétricos de la biblioteca también tienen «Editar frentes».
- Consejo: para que Planner lea el despiece real, exporta cada tabla como pieza separada con su nombre (Puerta, Gaveta, Lateral, Suelo, Trasera…).

## 1.18.0 · 2026-09-26

### Lo que subes a la biblioteca funciona como un módulo nativo
- Los muebles que subes hechos por tablas (3DS, SketchUp, GLB) **se convierten en módulos nativos**: Planner lee sus puertas y gavetas de las piezas de frente (una puerta, dos puertas, tres gavetas…) y los dibuja con el mismo motor que los del catálogo. Así tienen **zócalo, el material y la textura que elijas, jaladeras, y puertas y gavetas que se abren**, en 3D, en planta, en los alzados, en la vista isométrica y en el PDF. También en islas.
- Sus **piezas reales** siguen yendo al despiece y a la lista de corte. Si cambias el número de puertas o gavetas en el editor, se despieza como un módulo estándar.
- Las piezas de la caja de una gaveta (laterales, trasera, fondo) ya no se toman como frentes.
- Los módulos que ya habías subido y los que ya tenías colocados se convierten solos al abrir el editor.

### Corrección
- Después de actualizar, el 3D podía seguir usando el motor anterior hasta cerrar la app (por eso tu módulo se veía como caja blanca sin zócalo). Ahora cada versión trae su propio motor 3D y nunca se mezclan.

## 1.17.0 · 2026-09-26

### Mover módulos en el teléfono y la tableta
- **Arrastra los módulos en la vista Planta** con el dedo, el ratón o el lápiz: el módulo se desliza por su muro (o libremente si es de isla) y **se alinea solo** con las esquinas y con el borde de los módulos vecinos. Mientras lo mueves ves «Muro A · 120 cm desde la esquina». Un toque sin arrastrar lo sigue seleccionando.
- Nueva sección **«Ubicación»** en las propiedades del módulo: elige el **muro** (A, B, C, D o isla), escribe la **distancia desde la esquina** o usa los botones **‹ › « »** para moverlo 1 o 5 cm (si los mantienes presionados, sigue avanzando). En los de isla, X, Y y flechas.
- Todo se puede deshacer con Ctrl+Z o el botón deshacer.

### Módulos subidos: puertas, texturas y zócalo
- **Las puertas y cajones de tus modelos se abren** con el botón «Abrir puertas y cajones» de la vista 3D, girando sobre su bisagra como los del catálogo, con su jaladera.
- **La textura o el material de frente que eliges se ve en el 3D**, también en los modelos que no están hechos por tablas (antes solo cambiaba en el despiece).
- En los **alzados** los módulos subidos dibujan sus **puertas en su posición real**, con jaladera y línea de apertura.
- Los modelos que **ya habías subido** leen sus piezas solos la próxima vez que abres el editor, y los que ya estaban colocados en tus proyectos las toman al abrir el proyecto: **no hace falta volver a subirlos**. Su ancho deja de ser fijo.

## 1.16.0 · 2026-09-26

### Módulos y texturas que subes
- **Despiece real de tus muebles:** si el modelo que subes (3DS, SketchUp o GLB) está hecho por tablas, como los que exportan los programas de carpintería, Planner lee **cada pieza con su nombre y medida real** (laterales, suelo, trasera, entrepaños, divisiones, puertas…). Aparecen en **Planos de ensamblaje**, la **vista explosionada**, la **lista de corte** y el **PDF**. Las puertas y frentes toman el material de frentes y el resto el del cuerpo, incluidas las texturas que subas.
- En la **vista 3D** esos muebles se dibujan pieza por pieza con los materiales y texturas que elijas (la puerta con el de frentes, el resto con el del cuerpo), en lugar del color fijo del archivo.
- Si cambias el ancho, alto o fondo del módulo, las piezas se ajustan: los espesores no cambian, los laterales siguen en su lugar y las tablas que van de lado a lado crecen lo mismo que el mueble.
- Un modelo que no está hecho por tablas se despieza como una caja estándar con sus medidas.
- El **ancho** de un módulo subido ya se puede editar, de la mitad al doble de su ancho original, también en los que ya tenías.
- Lo que subes a la biblioteca aparece en el editor **al momento**; antes podía tardar hasta un minuto.
- Los módulos subidos se colocan **sobre el zócalo** como los demás (en 3D y en alzados), en lugar de estirarse hasta el piso.
- Al seleccionar un módulo subido aparece **«Materiales y herrajes»** (cuerpo, frente y herrajes), como en los módulos del catálogo.
- El precio de los módulos subidos no cambia.
- Los módulos que ya habías subido usan la caja estándar. Para que tomen sus piezas reales, vuelve a subir el modelo.

## 1.15.0 · 2026-09-26

### Presupuesto en una propuesta ya enviada
- En «Enviar al cliente» → «Envíos anteriores», cada enlace activo tiene el botón **«Ocultar presupuesto» / «Mostrar presupuesto»**: cambias lo que ve el cliente en la misma propuesta, sin mandarle otro enlace. Lo ve al recargar (mientras no haya respondido).

## 1.14.0 · 2026-09-26

### Enviar al cliente con o sin presupuesto
- Al crear el enlace para el cliente hay una casilla **«Incluir el presupuesto»**. Si la quitas, el cliente ve el diseño, los planos, los alzados y los materiales, **sin precios ni totales** (el servidor ni siquiera los manda a su teléfono), y el texto que acepta al firmar no menciona el presupuesto.
- En «Envíos anteriores» se marca qué enlaces se mandaron «sin presupuesto». Tu proyecto conserva sus precios igual.

## 1.13.1 · 2026-09-25

### Aprobación en el teléfono
- El aviso «Aprobado por…» ya no se amontona: el texto ocupa todo el ancho y debajo quedan la firma y el botón «Reabrir para cambios».
- Las pestañas **Vistas, Planos, Corte y PDF** siempre se ven: antes, en un proyecto sin aprobar, los botones Exportar / Enviar / Aprobar las tapaban y no se podía cambiar de vista. Ahora las pestañas van arriba y las acciones debajo.
- El menú Exportar ya no se sale de la pantalla.
- En Planos, el módulo se elige con una lista y flechas ‹ › en lugar de una columna larga; en PDF y Planos la página baja completa en vez de tener recuadros con su propio desplazamiento.
- En computadora, las pestañas usan nombres cortos cuando no cabe todo y el despiece de Planos muestra todas sus columnas.

## 1.13.0 · 2026-09-25

### Correos desde Gmail
- La app puede enviar sus correos (código de registro, invitaciones, recuperar contraseña) **desde una cuenta de Gmail**, sin necesidad de dominio propio. Llegan con el nombre de tu organización como remitente y las respuestas van a quien los envió.

## 1.12.0 · 2026-09-25

### Enviar al cliente por WhatsApp
- **Enviar al cliente** ya no pide correo ni envía correos: pones (si quieres) el nombre y el WhatsApp del cliente, pulsas **Crear enlace** y luego **Enviar por WhatsApp**, que abre el chat con el mensaje y el enlace listos. También puedes copiar el enlace.
- Con el número se abre directo el chat del cliente (10 dígitos se toman como República Dominicana/EE. UU., +1); sin número eliges el contacto en WhatsApp.
- En «Envíos anteriores» se ve a quién lo compartiste.

## 1.11.0 · 2026-09-25

### Crear cuenta con código por correo
- Nueva pantalla **«Crear cuenta»** (enlace en el inicio de sesión): nombre, correo y contraseña. Te llega un **código de 6 dígitos** al correo y la cuenta se crea solo cuando lo confirmas (vence en 15 minutos, 5 intentos; puedes pedir otro).
- Si el correo ya tiene cuenta no se crea otra: le llega un aviso con el enlace para entrar o recuperar la contraseña.

### Planes de verdad
- Las cuentas nuevas empiezan en **Gratis** (2 usuarios, 5 proyectos activos) y **los límites se aplican siempre**, aunque todavía no haya pago en línea.
- La página **Plan** muestra tu uso (usuarios y proyectos activos), dice «Precio a consultar» y trae **«Solicitar Profesional / Empresa»** para pedir el cambio por correo. Si el plan te lo asignó la plataforma lo verás como «asignado por la plataforma».

### Panel de la plataforma
- Los administradores de la plataforma ven en **Plataforma** (menú de usuario) todas las organizaciones con su plan, usuarios, proyectos activos y último acceso, y **asignan el plan** de cada una.

### Invitar a quien ya usa Planner
- Si invitas un correo que ya tiene cuenta (por ejemplo, alguien que entró con Google), en vez de «ya existe» le llega una **solicitud para unirse** a tu organización. La ve en su correo y al entrar a Planner; al aceptarla pasa a tu equipo con el rol que elegiste y ya puedes **compartirle proyectos**.

### Reabrir un proyecto aprobado
- En **Aprobación**, «**Reabrir para cambios**» devuelve un proyecto aprobado a Diseño con los precios vigentes para editarlo y volver a enviarlo al cliente. La aprobación anterior y su firma quedan en el historial.

### Correos con el nombre de tu organización
- Las propuestas e invitaciones llegan con **el nombre de tu organización como remitente**, y si el cliente responde, **la respuesta te llega a ti** (al correo de quien lo envió).

### Correcciones
- **Enviar al cliente** y **Aprobar** ya no fallan con error 500 cuando el correo no sale (por ejemplo, remitente sin verificar): el proyecto se envía/aprueba y la pantalla avisa que el correo no salió para que compartas el enlace por WhatsApp o copiándolo.
- Compartir: si no hay más personas en tu organización, el diálogo explica cómo invitarlas.

## 1.10.0 · 2026-09-25

### Entrar con Google o Microsoft
- En la pantalla de acceso aparecen **«Continuar con Google»** y **«Continuar con Microsoft»** (cuando la instalación tiene configuradas sus credenciales).
- **¿Primera vez?** Se crea tu cuenta con tu propio espacio de trabajo (plan Gratis), con el catálogo base listo para diseñar. Si ya tenías cuenta con ese correo, se vincula; si te invitaron, entrar con el correo invitado acepta la invitación.
- Por seguridad, solo se aceptan correos que Google o Microsoft confirman como tuyos.
- Si entras así no necesitas contraseña; puedes crear una en **Mi cuenta** para entrar también con tu correo.

### Servidor
- La imagen de Docker usa **Node 24** (LTS) con npm 11.

## 1.9.0 · 2026-09-25

### Diseño: selección múltiple y atajos de teclado
- **Ctrl + clic** (⌘ en Mac) agrega o quita módulos de la selección en el 3D, la planta y el alzado; todos se resaltan.
- **Ctrl+A** selecciona todos los módulos · **Ctrl+C** copiar · **Ctrl+X** cortar · **Ctrl+V** pegar (se acomodan en el espacio libre; también entre proyectos) · **Ctrl+D** o Supr eliminar los seleccionados · **Esc** soltar la selección · Ctrl+Z deshace cualquiera de ellos.
- **Ctrl+P** imprime el diseño: vista 3D, planta acotada, alzados de cada muro y la lista de módulos con sus medidas e importes.

### Aprobación: cámara a tu gusto
- **Render en perspectiva:** «Ajustar cámara» abre el 3D en vivo para girar, acercar y mover la vista; «Usar esta vista» la guarda para la galería, el PDF, la impresión y la página del cliente. «Vista automática» vuelve a la de siempre.
- **Vista de detalle:** elige qué módulo mostrar (en closets empieza por el colgado largo) y ajusta también su cámara.

## 1.8.1 · 2026-09-25

### Despliegue más resistente
- Si la conexión con el registro de npm se corta durante el despliegue, la instalación se reintenta sola en lugar de fallar, y los paquetes descargados se reutilizan en los siguientes despliegues (más rápidos y con menos descargas).

## 1.8.0 · 2026-09-25

### Especificaciones totalmente editables: crea el proyecto desde cero
- **Empezar en blanco:** un botón en Especificaciones quita puertas, ventanas, instalaciones, electrodomésticos y muebles para armar todo desde cero (se puede deshacer).
- **Distribución personalizada:** elige tú qué muros llevan muebles (A, B, C, D en cualquier combinación). En cualquier forma puedes cambiar el fondo y la altura de los bajos, el fondo de las alacenas, el pasillo mínimo y la isla o península (incluirla o no, con su ancho y fondo).
- **Puertas y ventanas:** ahora también cambias el tipo (una puerta puede pasar a ventana) y puedes quitarlas todas.
- **Instalaciones:** agrega un punto sin hacer clic en la planta y quita todos de una vez.
- **Electrodomésticos y accesorios propios:** agrega los tuyos con nombre, instalación y medidas; la distribución los coloca según su instalación (bajo encimera, en columna, de piso o colgado entre las alacenas).
- **Estilo personalizado:** elige el material de cuerpo, frentes, encimera y jaladeras, incluidas tus texturas.
- La distribución automática resuelve las esquinas entre los muros B-D y C-D (reserva el fondo del refrigerador) y avisa cuando la toma de agua queda en un muro sin muebles.

## 1.7.0 · 2026-09-24

### PDF con despiece por módulo
- Cada página «Plano módulo» del PDF trae, junto a la vista explosionada, la tabla de despiece con **cada pieza numerada**: material, cantidad, **largo × ancho × espesor en mm**, veta y cantos. Los números coinciden con los del dibujo.

## 1.6.0 · 2026-09-24

### Especificaciones más flexibles
- **Ventanas:** nueva columna «Del piso» para indicar a qué altura empieza cada ventana; se refleja en el alzado y el 3D.
- **Instalaciones:** ahora puedes cambiar el muro y la distancia de cada punto, o tocar «Mover» y luego el muro en la planta.
- **Preferencias:** además de las opciones rápidas, puedes escribir la altura de alacenas (30–120 cm), el zócalo (5–30 cm) y el presupuesto exacto. En closets y vestidores, los colgados y zapateras también aceptan el número escrito.

## 1.5.1 · 2026-09-24

### Correcciones (revisión completa del código)
- Editar solo el nombre de un módulo, material o herraje del catálogo ya no reinicia su precio, moneda y demás datos.
- Al aprobar internamente, el enlace que tenía el cliente deja de funcionar y ya no puede cambiar un proyecto aprobado.
- Seguridad de archivos: una organización ya no puede registrar ni borrar archivos de otra, y la portada solo acepta imágenes propias.
- Desactivar a un usuario cierra sus sesiones y anula su invitación pendiente.
- Pagos: los avisos de Stripe viejos o fuera de orden ya no cambian el plan.
- Borrar un archivo de un proyecto privado exige poder editar ese proyecto.
- Sin conexión: tras un conflicto o al subir un proyecto nuevo, un borrador viejo ya no sobrescribe cambios más recientes.
- Un proyecto borrado mientras se subía ya no reaparece. Si el servidor rechaza un proyecto nuevo, se avisa en lugar de reintentarlo sin fin.
- «Inicia sesión para sincronizar» ahora abre el inicio de sesión.
- Respaldos: se toman de una sola vez (sin datos a medias), la restauración es todo o nada y conserva las fechas, y un valor no válido en `BACKUP_KEEP` o `BACKUP_INTERVAL_HOURS` ya no borra respaldos ni satura el servidor.
- Al redesplegar, el servidor termina las peticiones en curso antes de apagarse.

## 1.5.0 · 2026-09-24

### Respaldos y monitoreo
- **Respaldo automático diario** de toda la base de datos en el volumen (`/data/backups`), conservando los 14 más recientes.
- Respaldo y restauración manuales: `node dist/backup.js` y `node dist/restore.js <archivo>`.
- Los errores de la app en los dispositivos de los usuarios se reportan al servidor y aparecen en los logs.
- Guía de respaldos, restauración y monitor de disponibilidad en el README.

## 1.4.0 · 2026-09-24

### Planes y pagos
- Planes por organización: **Gratis** (2 usuarios, 5 proyectos activos), **Profesional** (10 usuarios, proyectos ilimitados, enlace al cliente con firma, tu logo y color, CSV y DXF) y **Empresa** (todo ilimitado, auditoría y ajuste masivo de precios).
- Pago seguro con **Stripe** desde Administración → Plan, y portal para tarjeta, facturas, cambiar o cancelar.
- Sin Stripe configurado no hay límites. Las organizaciones existentes quedan en el plan Empresa.
- Si un proyecto creado sin conexión no cabe en el plan, queda guardado en el dispositivo y se avisa.

## 1.3.0 · 2026-09-24

### Tiendas de apps
- Lista para publicarse en **Play Store**: el servidor publica `/.well-known/assetlinks.json` con `ANDROID_PACKAGE_NAME` y `ANDROID_CERT_SHA256`, así la app de Android abre a pantalla completa.
- Guía paso a paso para Play Store y App Store en `docs/TIENDAS.md`.

## 1.2.0 · 2026-09-24

### Mi cuenta
- Nueva página **Mi cuenta** (menú de cuenta): cambiar el nombre y la contraseña (cierra la sesión en los demás dispositivos).
- **Borrar mi cuenta**: elimina tus proyectos, accesos compartidos, sesiones y contraseña y anonimiza tu nombre y correo. El último administrador debe nombrar a otro antes.

### Legal
- Páginas públicas de **Política de privacidad** (`/privacidad`) y **Términos de uso** (`/terminos`), enlazadas desde el inicio de sesión y Mi cuenta.

## 1.1.0 · 2026-09-24

### Administración
- Nueva sección **Administración** (menú de cuenta): organización, usuarios, precios, catálogo, clientes y auditoría.
- Organización: nombre, **logo**, color de marca y texto que acepta el cliente; se ven en la página de aprobación y en el PDF.
- Usuarios: invitar por correo, cambiar rol y activar o desactivar.
- Precios: tasa de cambio, ITBIS, merma, margen y redondeo; ajuste masivo con vista previa.
- Catálogo: precio y activo de cada módulo, material y herraje.
- Clientes: crear, editar y eliminar (los diseñadores también tienen acceso).
- Auditoría: quién hizo qué y cuándo.

## 1.0.0 · 2026-09-24

### Diseño
- Asistente de especificaciones en 6 pasos y distribución automática, con alternativas sugeridas.
- Editor 3D, planta y alzado; puertas y cajones que se abren; materiales, propiedades y validación de instalaciones.
- Historial de versiones del proyecto: guardar una versión con nota y restaurar una anterior.

### Clientes y aprobación
- Presupuesto en RD$ con ITBIS editable por proyecto.
- Envío al cliente por enlace y aprobación con firma; aprobación interna; PDF, lista de corte (CSV) y piezas (DXF).

### Bibliotecas
- Texturas propias y módulos 3D: GLB/glTF, 3DS, OBJ, COLLADA, FBX y SketchUp (.skp), convertidos a GLB.

### Equipo
- Proyectos privados: cada quien ve los suyos y los que le comparten (solo ver o editar).

### App
- Se instala en celular, tablet y computadora (PWA) y funciona sin conexión; los cambios se suben solos al volver internet.
- Adaptada al celular.
