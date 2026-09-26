# Novedades

Formato: versión (semver) · fecha. Cada cambio que llega a `main` sube la versión en `package.json` y añade su entrada aquí:
**parche** (1.0.x) para correcciones, **menor** (1.x.0) para funciones nuevas, **mayor** (x.0.0) para cambios que rompen algo.

## 1.16.0 · 2026-09-26

### Módulos y texturas que subes
- **Despiece real de tus muebles:** si el modelo que subes (3DS, SketchUp o GLB) está hecho por tablas, como los que exportan los programas de carpintería, Planner lee **cada pieza con su nombre y medida real** (laterales, suelo, trasera, entrepaños, divisiones, puertas…). Aparecen en **Planos de ensamblaje**, la **vista explosionada**, la **lista de corte** y el **PDF**. Las puertas y frentes toman el material de frentes y el resto el del cuerpo, incluidas las texturas que subas.
- En la **vista 3D** esos muebles se dibujan pieza por pieza con los materiales y texturas que elijas (la puerta con el de frentes, el resto con el del cuerpo), en lugar del color fijo del archivo.
- Si cambias el ancho, alto o fondo del módulo, las piezas se ajustan: los espesores no cambian, los laterales siguen en su lugar y las tablas que van de lado a lado crecen lo mismo que el mueble.
- Un modelo que no está hecho por tablas se despieza como una caja estándar con sus medidas.
- El **ancho** de un módulo subido ya se puede editar, de la mitad al doble de su ancho original, también en los que ya tenías.
- Lo que subes a la biblioteca aparece en el editor **al momento**; antes podía tardar hasta un minuto.
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
