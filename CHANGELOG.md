# Novedades

Formato: versión (semver) · fecha. Cada cambio que llega a `main` sube la versión en `package.json` y añade su entrada aquí:
**parche** (1.0.x) para correcciones, **menor** (1.x.0) para funciones nuevas, **mayor** (x.0.0) para cambios que rompen algo.

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
