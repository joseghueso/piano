# Piano 🎹

Piano táctil para el móvil (pensado para el Samsung Galaxy S25 Ultra, funciona en cualquier Android/iPhone).
Es una app web instalable (PWA): no necesita Play Store, funciona sin conexión y se abre a pantalla completa en horizontal.

## Funciones

- **Multitáctil**: toca acordes con varios dedos a la vez.
- **Glissando**: desliza el dedo de una tecla a otra.
- **Octavas** ◀ ▶ para moverte por todo el rango del piano (La0 – Do8).
- **Zoom** − / + para ver de 8 a 29 teclas blancas.
- **Sustain** (pedal), **nombres de notas** (Do Re Mi / C D E / ocultos), **vibración** al pulsar y **volumen**.
- Sonido sintetizado con Web Audio (sin archivos de audio, latencia baja).
- Mantiene la pantalla encendida mientras tocas.

## Instalar en el S25 Ultra

1. Publica la web (ver abajo) y abre la URL en **Chrome** o **Samsung Internet**.
2. Menú ⋮ → **Añadir a pantalla de inicio** / **Instalar aplicación**.
3. Abre el icono «Piano»: arranca a pantalla completa y en horizontal.

## Publicar con GitHub Pages

El workflow `.github/workflows/pages.yml` publica la app al hacer push a la rama por defecto del repositorio.
Activa una vez: **Settings → Pages → Source: GitHub Actions**.
La app quedará en `https://<usuario>.github.io/piano/`.

## Probar en local

```bash
npx serve .        # o: python3 -m http.server 8000
```

En el ordenador puedes tocar con el teclado: `A W S E D F T G Y H U J K`.
