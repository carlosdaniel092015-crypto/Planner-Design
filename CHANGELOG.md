# Novedades

Formato: versión (semver) · fecha. Cada cambio que llega a `main` sube la versión en `package.json` y añade su entrada aquí:
**parche** (1.0.x) para correcciones, **menor** (1.x.0) para funciones nuevas, **mayor** (x.0.0) para cambios que rompen algo.

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
