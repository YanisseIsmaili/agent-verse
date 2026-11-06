#!/usr/bin/env python3
"""Découpe la planche d'assets provisoire de l'immeuble (media/sources/map/planche-assets.png, 1536×1024).

    python scripts/decouper-assets.py

Sorties :
    media/map/piece-*.png, toit.png, ascenseur.png, ciel.png, rue.png   (pièces ~350 px de large, pas agrandies ;
        chaque pièce est complétée en haut pour avoir le ratio 2:1 des modules de l'immeuble)
    media/map/places.json   une place par bureau dessiné dans chaque pièce (fractions de la largeur / hauteur de l'image)
    media/visages/<role>-<n>.png   la grille de visages (4 expressions × 4 personnages)

Les coordonnées sont celles de la planche fournie (fond texturé, pas blanc : découpe à coordonnées fixes).
Si de vraies images piece-*.png (1536×768) arrivent dans Downloads/agen vers/map, `preparer-images.py` les copie
par-dessus.
"""
import io, json, os
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'media', 'sources', 'map', 'planche-assets.png')
MAP = os.path.join(ROOT, 'media', 'map')
FACES = os.path.join(ROOT, 'media', 'visages')

# Pièces : (x0, y0, x1, y1) sur la planche, puis les places (fractions de la largeur et de la hauteur de la pièce,
# le point = pieds du personnage assis, posé sur le bureau dessiné).
ROWS = [(320, 433), (448, 560), (575, 690)]
COLS = [(10, 366), (382, 720), (738, 1083)]
PIECES = {
    'piece-dev':       (0, 0, {'slots': [(0.24, 0.86), (0.52, 0.86), (0.80, 0.86)]}),
    'piece-manager':   (0, 1, {'desk': (0.47, 0.86), 'visitors': [(0.22, 0.9), (0.74, 0.9), (0.12, 0.9), (0.86, 0.9), (0.32, 0.9), (0.64, 0.9), (0.47, 0.92)]}),
    'piece-securite':  (0, 2, {'slots': [(0.32, 0.86), (0.60, 0.86)]}),
    'piece-test':      (1, 0, {'slots': [(0.33, 0.86), (0.72, 0.86)]}),
    'piece-redaction': (1, 1, {'slots': [(0.56, 0.86)]}),
    'piece-git':       (1, 2, {'slots': [(0.50, 0.86)]}),
    'piece-reunion':   (2, 0, {'table': (0.49, 0.62), 'head': (0.49, 0.72), 'seats': [(0.24, 0.88), (0.74, 0.88), (0.36, 0.80), (0.62, 0.80), (0.49, 0.92), (0.12, 0.88)]}),
    'piece-hall':      (2, 1, {'counter': (0.47, 0.86)}),
    'piece-openspace': (2, 2, {'slots': [(0.34, 0.86), (0.66, 0.86)]}),
}
OTHERS = {
    'toit':      (1108, 320, 1524, 433),
    'ascenseur': (1108, 448, 1202, 563),
    'ciel':      (1210, 448, 1524, 563),
    'rue':       (1108, 575, 1524, 690),
}
FACE_ROLES = ['securite', 'bugs', 'readme', 'autre']
FACE_X = [(1176, 1258), (1264, 1348), (1354, 1438), (1444, 1528)]
FACE_Y = [(2, 70), (76, 144), (150, 220), (226, 294)]


def pad_to_2_1(piece):
    """Complète la pièce en haut (bande de plafond) pour obtenir le ratio largeur:hauteur = 2:1 des modules."""
    w, h = piece.size
    target_h = w // 2
    if h >= target_h:
        return piece, 0
    pad = target_h - h
    top = piece.crop((0, 0, w, 6)).resize((w, pad), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
    out = Image.new('RGBA', (w, target_h))
    out.paste(top, (0, 0))
    out.paste(piece, (0, pad))
    return out, pad


def main():
    os.makedirs(MAP, exist_ok=True); os.makedirs(FACES, exist_ok=True)
    sheet = Image.open(SRC).convert('RGBA')
    places = {}
    for name, (row, col, pl) in PIECES.items():
        y0, y1 = ROWS[row]; x0, x1 = COLS[col]
        piece = sheet.crop((x0, y0, x1, y1))
        padded, pad = pad_to_2_1(piece)
        padded.save(os.path.join(MAP, name + '.png'), optimize=True)
        # Les places sont données pour la pièce brute : on les convertit pour l'image complétée.
        h, H = piece.height, padded.height
        conv = lambda p: [round(p[0], 3), round((pad + p[1] * h) / H, 3)]
        entry = {}
        for k, v in pl.items():
            entry[k] = [conv(p) for p in v] if isinstance(v, list) else conv(v)
        places[name] = entry
        print(f'{name:16s} {padded.size[0]}x{padded.size[1]}  places={entry}')
    for name, box in OTHERS.items():
        sheet.crop(box).save(os.path.join(MAP, name + '.png'), optimize=True)
        print(f'{name:16s} {box[2] - box[0]}x{box[3] - box[1]}')
    with io.open(os.path.join(MAP, 'places.json'), 'w', encoding='utf-8') as fh:
        json.dump(places, fh, ensure_ascii=False, indent=1)
    for r, role in enumerate(FACE_ROLES):
        for c, (x0, x1) in enumerate(FACE_X):
            y0, y1 = FACE_Y[r]
            sheet.crop((x0, y0, x1, y1)).save(os.path.join(FACES, f'{role}-{c + 1}.png'), optimize=True)
    print('visages :', len(FACE_ROLES) * len(FACE_X))


if __name__ == '__main__':
    main()
