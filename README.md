# Nos vemos 📅💛

App para el iPhone con la que tus amigas y tú marcáis cuándo podéis quedar y veis enseguida
cuándo coincidís.

## Qué hace

- **📅 Calendario:** un calendario mensual en el que tocas un día y, para la mañana, la tarde y
  la noche, eliges **✅ Libre**, **🤔 Quizás** o **🙅 No puedo**. Puedes añadir una nota a cada día
  ("solo hasta las 19h"). Cada día muestra tres rayitas de colores con tu estado, un borde verde si
  podéis todas (✨), 🎉 si hay plan y 🎂 si es el cumple de alguien.
- **✨ Quedar:** lista los mejores momentos, primero cuando **podéis todas seguro**, luego cuando
  podéis todas con algún "quizás" y, por último, los que se acercan (y quién falta).
- **🎉 Planes:**
  - Plan con fecha fija: cada una dice **"Me apunto"** o **"No puedo"**.
  - **Votar fecha:** propones varias fechas, cada una vota las que le vienen bien y quien lo
    propuso elige la ganadora.
  - **Chat** dentro de cada plan.
  - **Fotos** del plan, y la pestaña **Recuerdos 📸** con el álbum de vuestras quedadas.
  - Botón **"Añadir a mi calendario"** (calendario del iPhone o Google Calendar).
- **🔔 Novedades:** un aviso con punto rojo dentro de la app cuando hay un plan o una votación
  nueva, un recordatorio el día antes y el mismo día de tus planes, y los **cumpleaños** (el mismo
  día y la semana antes).
- **👭 Grupos:** puedes estar en varios grupos (amigas, familia, trabajo…) y cambiar entre ellos
  tocando el nombre del grupo arriba.
- **🎨 Tu color:** cada persona elige su color y nadie más del grupo puede elegir el mismo.

Es una *app web instalable*: se abre un enlace en Safari, se añade a la pantalla de inicio y
desde ahí se usa como cualquier otra app, sin App Store y sin Mac. También funciona en Android.
Todo es **gratis** y no hace falta tarjeta.

---

## Probarla ya (modo prueba)

Mientras no conectes Firebase, la app funciona en **modo prueba**: guarda los datos solo en tu
dispositivo y añade dos amigas de ejemplo (Lucía y Marta) con un cumple y una votación para que
veas cómo funciona.

En un ordenador, desde esta carpeta:

```bash
python3 -m http.server 8000
```

y abre <http://localhost:8000>.

---

## Ponerla en marcha de verdad (unos 15 minutos, gratis)

Hay que hacer dos cosas: **1)** crear una base de datos gratuita en Firebase para que veáis los
datos de las demás y **2)** publicar la app en internet con GitHub Pages para tener un enlace.

### 1. Crear el proyecto de Firebase (plan gratuito "Spark", sin tarjeta)

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google y pulsa
   **"Crear un proyecto"**. Ponle un nombre (por ejemplo `nos-vemos`). Puedes desactivar Google Analytics.
2. **Activa el inicio de sesión anónimo**. Sirve para que solo la app pueda acceder a los datos,
   y tus amigas no tienen que crear ninguna cuenta:
   - Menú izquierdo → **Compilación → Authentication** → **Comenzar**.
   - Pestaña **Método de inicio de sesión** → **Anónimo** → **Habilitar** → **Guardar**.
3. **Crea la base de datos:**
   - Menú izquierdo → **Compilación → Firestore Database** → **Crear base de datos**.
   - Elige una ubicación en Europa (por ejemplo `europe-southwest1`, que es Madrid).
   - Elige **"Iniciar en modo de producción"**.
4. **Pon las reglas de seguridad:**
   - En Firestore, pestaña **Reglas**, borra lo que haya, pega el contenido del archivo
     [`firestore.rules`](firestore.rules) de este repositorio y pulsa **Publicar**.
5. **Copia la configuración de la app:**
   - Pulsa el engranaje ⚙️ → **Configuración del proyecto**.
   - Abajo, en "Tus apps", pulsa el icono **`</>`** (Web), ponle un nombre y pulsa **Registrar app**
     (no hace falta Firebase Hosting).
   - Te mostrará un bloque `const firebaseConfig = { apiKey: "...", ... }`.
     Copia esos valores en el archivo [`config.js`](config.js) de este repositorio.

> Los datos de `firebaseConfig` no son secretos: Firebase está pensado para que vayan dentro de la
> app. Lo que protege vuestros datos son las reglas del paso 4.

> Las fotos se comprimen en el móvil y se guardan en la propia base de datos, así que caben sin
> problema en el plan gratuito (1 GB, que son unas 4.000 fotos).

### 2. Publicar la app con GitHub Pages

1. Lleva estos archivos a la rama principal (`main`) del repositorio.
2. En GitHub, abre el repositorio → **Settings → Pages**.
3. En "Build and deployment" elige **Source: Deploy from a branch**, la rama **`main`** y la carpeta
   **`/ (root)`**, y pulsa **Save**.
4. En un par de minutos tendrás la app en una dirección como
   `https://TU-USUARIO.github.io/APLICACION/`.

> GitHub Pages es gratis en repositorios públicos. Si tu repositorio es privado, necesitarías
> GitHub Pro o hacerlo público. No pasa nada por que el código sea público: los datos del grupo
> están en Firebase, no en GitHub.

### 3. Instalarla en el iPhone

1. Abre el enlace en **Safari**.
2. Pulsa **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elige **"Añadir a pantalla de inicio"**.
4. Abre la app desde el icono, crea el grupo y pulsa **"Compartir"** para mandar la invitación a
   vuestro chat.

**Consejo:** en el iPhone, la app instalada y Safari guardan los datos por separado. Si alguna se
une primero desde Safari y luego la instala, solo tiene que volver a entrar con el código y tocar
**su nombre** en "¿Ya estabas en el grupo?" para recuperar todo.

---

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Página principal |
| `app.js` | Las pantallas y lo que pasa al tocar cada cosa |
| `util.js` | Franjas, estados, colores, fechas, calendario `.ics` y compresión de fotos |
| `store.js` | Guarda y lee los datos (Firebase o modo prueba) |
| `config.js` | **Aquí pegas la configuración de Firebase** |
| `styles.css` | Diseño en beiges y marrones (con modo oscuro) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Lo necesario para instalarla como app y abrirla sin cobertura |
| `firestore.rules` | Reglas de seguridad para pegar en Firebase |

## Privacidad

- Nadie necesita cuenta ni correo: solo un nombre.
- Para entrar en un grupo hay que conocer su código (8 caracteres al azar), y no se pueden
  ver los grupos que existen.
- Cualquiera que tenga el código puede ver y editar el grupo, así que compártelo solo con tus amigas.

## Más adelante

- **Notificaciones al móvil** (aunque la app esté cerrada): necesitan el plan "Blaze" de Firebase,
  que pide tarjeta aunque con un grupo de amigas salga a 0 €. Ahora la app avisa por dentro con 🔔.
