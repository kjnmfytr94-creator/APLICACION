# Quedamos 🗓️💗

App para el iPhone con la que tus amigas y tú marcáis cuándo estáis libres y veis
enseguida cuándo coincidís para quedar.

- **Mis huecos:** cada una toca los momentos (mañana, tarde o noche) en los que está libre
  durante las próximas seis semanas. Un número verde indica cuántas amigas más están libres en ese momento.
- **Quedar:** muestra los momentos en los que estáis todas libres, y los que más se acercan
  (y quién falta).
- **Planes:** propón un plan (qué, cuándo, dónde) y cada una dice "Me apunto" o "No puedo".
- **Grupo:** invita con un enlace o un código, mira quién ha marcado sus huecos y gestiona tus grupos.

Es una *app web instalable*: se abre un enlace en Safari, se añade a la pantalla de inicio y
desde ahí se usa como cualquier otra app, sin App Store y sin necesitar un Mac. También funciona en Android.

---

## Probarla ya (modo prueba)

Mientras no conectes Firebase, la app funciona en **modo prueba**: guarda los datos solo en tu
dispositivo y añade dos amigas de ejemplo para que veas cómo se usa.

En un ordenador, desde esta carpeta:

```bash
python3 -m http.server 8000
```

y abre <http://localhost:8000>.

---

## Ponerla en marcha de verdad (unos 15 minutos, gratis)

Hay que hacer dos cosas: **1)** crear una base de datos gratuita en Firebase para que veáis los
datos de las demás y **2)** publicar la app en internet con GitHub Pages para tener un enlace.

### 1. Crear el proyecto de Firebase

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google y pulsa
   **"Crear un proyecto"**. Ponle un nombre (por ejemplo `quedamos`). Puedes desactivar Google Analytics.
2. **Activa el inicio de sesión anónimo** (sirve para que solo la app pueda acceder a los datos;
   tus amigas no tienen que crear ninguna cuenta):
   - Menú izquierdo → **Compilación → Authentication** → **Comenzar**.
   - Pestaña **Método de inicio de sesión** → **Anónimo** → **Habilitar** → **Guardar**.
3. **Crea la base de datos:**
   - Menú izquierdo → **Compilación → Firestore Database** → **Crear base de datos**.
   - Elige una ubicación en Europa (por ejemplo `eur3` o `europe-southwest1`, que es Madrid).
   - Elige **"Iniciar en modo de producción"**.
4. **Pon las reglas de seguridad:**
   - En Firestore, pestaña **Reglas**, borra lo que haya, pega el contenido del archivo
     [`firestore.rules`](firestore.rules) de este repositorio y pulsa **Publicar**.
5. **Copia la configuración de la app:**
   - Pulsa el engranaje ⚙️ → **Configuración del proyecto**.
   - Abajo, en "Tus apps", pulsa el icono **`</>`** (Web), ponle un nombre y **Registrar app**
     (no hace falta Firebase Hosting).
   - Te mostrará un bloque `const firebaseConfig = { apiKey: "...", ... }`.
     Copia esos valores en el archivo [`config.js`](config.js) de este repositorio.

> Los datos de `firebaseConfig` no son secretos: Firebase está pensado para que vayan dentro de la
> app. Lo que protege vuestros datos son las reglas del paso 4.

### 2. Publicar la app con GitHub Pages

1. Lleva estos archivos a la rama principal (`main`) del repositorio.
2. En GitHub, abre el repositorio → **Settings → Pages**.
3. En "Build and deployment" elige **Source: Deploy from a branch**, rama **`main`**, carpeta
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
4. Abre la app desde el icono, crea el grupo y pulsa **"Compartir invitación"** para mandar el
   enlace a vuestro chat.

**Consejo:** en el iPhone, la app instalada y Safari guardan los datos por separado. Si alguna se
une primero desde Safari y luego la instala, solo tiene que volver a unirse con **el mismo código y
el mismo nombre**: la app le preguntará si es ella y recuperará sus huecos.

---

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Página principal |
| `app.js` | Toda la lógica y las pantallas de la app |
| `store.js` | Guarda y lee los datos (Firebase o modo prueba) |
| `config.js` | **Aquí pegas la configuración de Firebase** |
| `styles.css` | Diseño (modo claro y oscuro) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Lo necesario para instalarla como app y abrirla sin cobertura |
| `firestore.rules` | Reglas de seguridad para pegar en Firebase |

## Privacidad

- Nadie necesita cuenta ni correo: solo un nombre.
- Para entrar en un grupo hay que conocer su código (8 caracteres al azar); no se pueden listar
  los grupos que existen.
- Cualquiera que tenga el código puede ver y editar el grupo, así que compártelo solo con tus amigas.
