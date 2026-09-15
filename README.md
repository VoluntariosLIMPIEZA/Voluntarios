# Voluntarios de Limpieza

PWA para organizar turnos semanales de voluntarios de limpieza, asignar capitanes y exportar la planilla.

Los datos viven en **Supabase** (compartidos entre dispositivos). El navegador guarda una copia local para poder abrir la app sin conexión.

## 1. Crear la base en Supabase

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto.
2. Abre **SQL Editor → New query**.
3. Pega todo el archivo `sql/schema.sql` y pulsa **Run**.
4. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public** key

## 2. Conectar la app

Pega esas dos claves en `js/supabase-config.js`:

```js
window.SUPABASE_URL = 'https://xxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJ...';
```

También puedes pegarlas en la pantalla **Conectar Supabase** la primera vez que abras la app (quedan en ese dispositivo).

La clave `anon` está pensada para usarse en el cliente. Quien tenga la URL de la PWA podrá leer y editar los turnos. Si más adelante quieres usuarios y contraseña, se puede añadir Auth.

Si ya tenías datos en el navegador, la primera conexión los copia a Supabase.

## 3. Publicar en GitHub Pages

1. Sube este repositorio a GitHub (con `js/supabase-config.js` ya rellenado).
2. En el repo: **Settings → Pages**.
3. En **Source** elige la rama `main` (o `master`) y la carpeta `/ (root)`.
4. La app quedará en `https://TU-USUARIO.github.io/VOLUNTARIOS/`.

La PWA **requiere HTTPS**. GitHub Pages ya lo ofrece.

## Instalar en el teléfono o el escritorio

- **Android / Chrome:** menú → **Instalar aplicación**, o el aviso de la propia app.
- **iPhone / iPad (Safari):** compartir → **Añadir a pantalla de inicio**.
- **Escritorio (Chrome / Edge):** icono de instalación en la barra de direcciones.

## Archivos importantes

| Archivo | Función |
| --- | --- |
| `sql/schema.sql` | Tablas, permisos y tiempo real en Supabase |
| `js/supabase-config.js` | URL y clave anon del proyecto |
| `js/db.js` | Lectura y escritura en Supabase |
| `manifest.webmanifest` | Nombre, colores, iconos e instalación |
| `sw.js` | Caché y modo sin conexión |
| `js/pwa.js` | Service worker y botón de instalar |

## Desarrollo local

Sirve la carpeta con un servidor HTTP (el service worker no se registra en `file://`):

```bash
npx serve .
```
