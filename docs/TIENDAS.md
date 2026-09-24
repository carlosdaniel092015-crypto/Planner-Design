# Publicar Planner en Play Store y App Store

Planner es una PWA: la misma app web se empaqueta para cada tienda. El servidor ya trae lo necesario:
manifiesto con íconos y capturas, service worker (funciona sin conexión), páginas públicas de
privacidad (`/privacidad`) y términos (`/terminos`), borrado de cuenta desde la app (Mi cuenta) y
`/.well-known/assetlinks.json` para Android.

Antes de empezar necesitas la app **desplegada en tu dominio con https** (por ejemplo `https://app.tudominio.com`).

---

## Android · Google Play (Trusted Web Activity)

La app de Android abre tu sitio a pantalla completa, sin barra del navegador, y se actualiza sola cuando despliegas.

### 1. Cuenta
- Crea una cuenta en [Google Play Console](https://play.google.com/console) (pago único de US$25).

### 2. Generar el paquete (la forma más fácil: PWABuilder)
1. Entra a [pwabuilder.com](https://www.pwabuilder.com), escribe la dirección de tu app y pulsa **Start**.
2. Elige **Package for stores → Android → Generate**.
   - **Package ID**: por ejemplo `com.tudominio.planner` (no se puede cambiar después).
   - **App name**: `Planner` · **Launcher name**: `Planner`.
   - **Signing key**: *Create new* (o usa la tuya). **Guarda el archivo `.keystore` y sus contraseñas**: sin ellos no podrás publicar actualizaciones.
3. Descarga el ZIP. Trae el archivo **`.aab`** (el que se sube a Play) y un **`assetlinks.json`**.

   Alternativa por línea de comandos: `npx @bubblewrap/cli init --manifest https://app.tudominio.com/manifest.webmanifest` y luego `npx @bubblewrap/cli build`.

### 3. Vincular el dominio con la app
Abre el `assetlinks.json` descargado y copia el `package_name` y la huella `sha256_cert_fingerprints`. En Easypanel, en las variables del servicio:

```
ANDROID_PACKAGE_NAME=com.tudominio.planner
ANDROID_CERT_SHA256=AB:CD:...:EF
```

Si subes a Play con **firma de apps de Google Play** (recomendado), añade también la huella que Play Console muestra en
*Configuración → Integridad de la app → Firma de apps*, separada por coma:

```
ANDROID_CERT_SHA256=AB:CD:...:EF,12:34:...:56
```

Vuelve a desplegar y comprueba que `https://app.tudominio.com/.well-known/assetlinks.json` muestra tu paquete.
Sin este paso la app abre, pero con la barra del navegador arriba.

### 4. Ficha de la tienda
En Play Console crea la app y completa:
- **Nombre, descripción corta y larga**, ícono 512×512 (`frontend/public/icons/icon-512.png`) y capturas (puedes usar `frontend/public/screenshots/`).
- **Política de privacidad**: `https://app.tudominio.com/privacidad`.
- **Seguridad de los datos**: se recopilan nombre, correo y archivos que sube el usuario; se cifran en tránsito; el usuario puede borrar su cuenta desde la app (Mi cuenta → Borrar mi cuenta).
- **Clasificación de contenido** (cuestionario) y **público objetivo** (adultos, uso profesional).
- Sube el `.aab` a **Prueba interna** primero, pruébalo en tu teléfono y luego pásalo a **Producción**.

---

## iPhone y iPad · App Store

Apple revisa que la app no sea "solo una página web" (regla 4.2). Recomendación: envolver la app con
[Capacitor](https://capacitorjs.com) y aprovechar funciones del teléfono (cámara para fotografiar el espacio,
compartir el PDF, archivos).

### Requisitos
- Cuenta [Apple Developer](https://developer.apple.com/programs/) (US$99 al año).
- Una Mac con Xcode (o un servicio de compilación en la nube como Codemagic o Ionic Appflow).

### Pasos
1. Genera el proyecto de iOS: en [pwabuilder.com](https://www.pwabuilder.com) → **iOS → Generate** (proyecto Xcode listo), o con Capacitor:
   `npm i @capacitor/core @capacitor/cli @capacitor/ios` → `npx cap init Planner com.tudominio.planner --web-dir dist/web` → `npx cap add ios`.
2. Ábrelo en Xcode, pon tu equipo de firma, el ícono y el nombre, y súbelo con **Product → Archive → Distribute**.
3. En App Store Connect completa la ficha, la **URL de privacidad** (`/privacidad`), la sección de **privacidad de datos**
   y una **cuenta de prueba** para el revisor (crea un usuario de ejemplo en Administración → Usuarios).
4. **Pagos**: si cobras suscripciones *dentro* de la app de iPhone, Apple exige su sistema de compras (15–30 % de comisión).
   Lo habitual en apps para empresas es cobrar en la web y que en iPhone solo se inicie sesión, sin botones de compra.

---

## Actualizaciones
- **Android y web**: cada despliegue llega solo a la app instalada (la app abre tu sitio). Solo hay que subir un `.aab` nuevo
  si cambias el nombre, el ícono o el paquete.
- **iPhone**: con Capacitor la app carga el sitio desplegado; publica una versión nueva en App Store solo si cambias la parte nativa.
