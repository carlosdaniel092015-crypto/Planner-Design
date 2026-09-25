# Novedades

Formato: versión (semver) · fecha. Cada cambio que llega a `main` sube la versión en `package.json` y añade su entrada aquí:
**parche** (1.0.x) para correcciones, **menor** (1.x.0) para funciones nuevas, **mayor** (x.0.0) para cambios que rompen algo.

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
