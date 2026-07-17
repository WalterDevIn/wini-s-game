# Wini's Overworld ASCII

Prototipo jugable de sandbox 2D ASCII inspirado en Minecraft. El proyecto implementa únicamente el layer de **Overworld** y no contiene Nether, End ni render 3D.

## Arranque con Live Server

1. Abrir el repositorio en VS Code o GitHub Codespaces.
2. Instalar la extensión **Live Server** si no está disponible.
3. Hacer clic derecho sobre `index.html`.
4. Seleccionar **Open with Live Server**.

No requiere npm, build, backend ni dependencias externas.

## Controles

- `A` / `D` o flechas: movimiento.
- `W`, `Espacio` o flecha arriba: salto.
- Click izquierdo: minar un bloque dentro del alcance.
- Click derecho: colocar el bloque seleccionado.
- `1` a `6` o rueda del mouse: seleccionar hotbar.
- `R`: generar un Overworld nuevo.

## Scope actual

- Mundo Overworld procedural y determinista por seed.
- Terreno, colinas, agua superficial, árboles y cuevas simples.
- Bloques de césped, tierra, piedra, carbón, hierro, madera, hojas, arena, agua y bedrock.
- Física lateral, gravedad, salto y colisión por tiles.
- Minería, drops, inventario mínimo y colocación de bloques.
- Cámara con seguimiento y renderer ASCII sobre Canvas 2D.

El juego está implementado con HTML, CSS y JavaScript ES Modules para funcionar directamente desde Live Server.
