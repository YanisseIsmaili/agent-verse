#!/usr/bin/env python3
"""Prépare les images du mode « images » et écrit media/sprites.json.

    python scripts/preparer-images.py [dossier-des-bandes]

1. Convertit chaque GIF de media/sources/anim/<role>-<anim>.gif en bande media/anim/<role>-<anim>.png
   (une ligne de cases carrées de 256×256, fond transparent, une case par image du GIF).
2. Copie les bandes PNG déjà prêtes depuis le dossier donné (par défaut
   C:/Users/ntjum/Downloads/agen vers/animations) si elles ont bien des cases carrées de 256.
3. Mesure chaque sprite fixe (media/sprites/*.png) et chaque bande (media/anim/*.png) : taille,
   position de la tête (pour accrocher la bulle), haut et pieds du personnage dans la case.
   Résultat dans media/sprites.json, lu par le bureau.
"""
import io, json, os, shutil, sys
from PIL import Image, ImageSequence
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, 'media', 'sprites')
ANIM = os.path.join(ROOT, 'media', 'anim')
GIFS = os.path.join(ROOT, 'media', 'sources', 'anim')
CELL = 256
ANIMS = {'marche': 12, 'clavier': 8, 'attente': 6}


def head_x(alpha):
    """Centre horizontal des quelques premières lignes opaques (le haut de la tête), en fraction de la largeur."""
    mask = alpha > 40
    rows = np.nonzero(mask.any(axis=1))[0]
    if len(rows) == 0:
        return 0.5
    top = rows[0]
    band = mask[top: top + max(3, int(0.06 * mask.shape[0]))]
    xs = np.nonzero(band.any(axis=0))[0]
    return round(float((xs.min() + xs.max()) / 2 / mask.shape[1]), 3)


def measure_sprite(path):
    im = Image.open(path).convert('RGBA')
    return {'w': im.width, 'h': im.height, 'headX': head_x(np.array(im.getchannel('A')))}


def gif_to_strip(src, dst):
    gif = Image.open(src)
    frames = []
    for fr in ImageSequence.Iterator(gif):
        f = fr.convert('RGBA')
        # Boîte commune : on garde la même échelle pour toutes les images (sinon ça tremble).
        frames.append(f)
    boxes = [f.getchannel('A').point(lambda p: 255 if p > 40 else 0).getbbox() for f in frames]
    boxes = [b for b in boxes if b]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes); x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    w, h = x1 - x0, y1 - y0
    k = (CELL * 0.92) / max(w, h)
    strip = Image.new('RGBA', (CELL * len(frames), CELL), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        piece = f.crop((x0, y0, x1, y1)).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
        strip.alpha_composite(piece, (i * CELL + (CELL - piece.width) // 2, CELL - piece.height - int(CELL * 0.04)))
    strip.save(dst, optimize=True)
    return len(frames)


def bands(v, min_gap, min_size):
    out, inside = [], False
    for i, x in enumerate(v):
        if x > 0 and not inside:
            start, inside = i, True
        elif x <= 0 and inside:
            out.append([start, i]); inside = False
    if inside:
        out.append([start, len(v)])
    merged = []
    for b in out:
        if merged and b[0] - merged[-1][1] < min_gap:
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    return [b for b in merged if b[1] - b[0] >= min_size]


def sheet_to_strip(src, dst, expected=12):
    """Bande irrégulière (N images de marche sur une ligne, cases non alignées) → bande de cases carrées de 256.
    Découpe par colonnes vides (seuil alpha haut pour ignorer un voile de fond), fusion des plus petits trous ou
    coupe des bandes trop larges aux colonnes les moins denses jusqu'à N images, puis recalage : même échelle pour
    toutes, personnage centré, pieds sur la même ligne de base (pas de sautillement)."""
    im = Image.open(src).convert('RGBA')
    alpha = np.array(im.getchannel('A')).astype(np.float32)
    haze = ((alpha > 30) & (alpha < 170)).mean() > 0.08
    if haze:
        # Voile semi-transparent sur tout le fond : on le retire et on redistribue le reste de l'alpha.
        alpha = np.clip((alpha - 150) * 255.0 / 105.0, 0, 255)
        im.putalpha(Image.fromarray(alpha.astype(np.uint8)))
    mask = alpha > 60
    dens = mask.sum(axis=0)
    cols = bands(dens, min_gap=4, min_size=20)
    while len(cols) > expected:
        gaps = [cols[i + 1][0] - cols[i][1] for i in range(len(cols) - 1)]
        i = gaps.index(min(gaps)); cols[i][1] = cols[i + 1][1]; del cols[i + 1]
    # Images qui se touchent : on coupe les bandes trop larges aux creux de densité.
    span = cols[-1][1] - cols[0][0]
    exp_w = span / expected
    changed = True
    while len(cols) < expected and changed:
        changed = False
        widths = [c[1] - c[0] for c in cols]
        i = widths.index(max(widths))
        x0, x1 = cols[i]
        n = max(2, round((x1 - x0) / exp_w))
        n = min(n, expected - len(cols) + 1)
        if n < 2:
            break
        cuts = []
        for j in range(1, n):
            cx = x0 + (x1 - x0) * j / n
            lo, hi = int(max(x0 + 10, cx - exp_w * 0.25)), int(min(x1 - 10, cx + exp_w * 0.25))
            if hi <= lo:
                continue
            cuts.append(lo + int(np.argmin(dens[lo:hi])))
        if cuts:
            parts = []
            prev = x0
            for c in sorted(set(cuts)):
                parts.append([prev, c]); prev = c
            parts.append([prev, x1])
            cols[i:i + 1] = parts
            changed = True
    if len(cols) != expected:
        print(f'  attention : {len(cols)} images trouvees au lieu de {expected} dans {os.path.basename(src)}')
    frames = []
    for x0, x1 in cols:
        sub = mask[:, x0:x1]
        rows = np.nonzero(sub.any(axis=1))[0]
        colsx = np.nonzero(sub.any(axis=0))[0]
        frames.append((x0 + colsx.min(), rows.min(), x0 + colsx.max() + 1, rows.max() + 1))
    hmax = max(b[3] - b[1] for b in frames); wmax = max(b[2] - b[0] for b in frames)
    k = (CELL * 0.92) / max(hmax, wmax)
    strip = Image.new('RGBA', (CELL * len(frames), CELL), (0, 0, 0, 0))
    base = CELL - int(CELL * 0.04)
    for i, (x0, y0, x1, y1) in enumerate(frames):
        piece = im.crop((x0, y0, x1, y1))
        piece = piece.resize((max(1, round(piece.width * k)), max(1, round(piece.height * k))), Image.LANCZOS)
        strip.alpha_composite(piece, (i * CELL + (CELL - piece.width) // 2, base - piece.height))
    strip.save(dst, optimize=True)
    return len(frames)


def measure_strip(path):
    im = Image.open(path).convert('RGBA')
    if im.height != CELL or im.width % CELL != 0:
        return None
    n = im.width // CELL
    alpha = np.array(im.getchannel('A'))
    tops, feet, heads = [], [], []
    for i in range(n):
        a = alpha[:, i * CELL:(i + 1) * CELL]
        rows = np.nonzero((a > 40).any(axis=1))[0]
        if len(rows) == 0:
            continue
        tops.append(rows[0]); feet.append(rows[-1]); heads.append(head_x(a))
    if not tops:
        return None
    return {'frames': n, 'cell': CELL, 'top': round(min(tops) / CELL, 3), 'feet': round(max(feet) / CELL, 3), 'headX': round(float(np.mean(heads)), 3)}


def main():
    os.makedirs(ANIM, exist_ok=True)
    downloads = sys.argv[1] if len(sys.argv) > 1 else r'C:/Users/ntjum/Downloads/agen vers/animations'
    if os.path.isdir(GIFS):
        for f in sorted(os.listdir(GIFS)):
            if f.lower().endswith('.gif'):
                n = gif_to_strip(os.path.join(GIFS, f), os.path.join(ANIM, f[:-4] + '.png'))
                print(f'GIF vers bande : {f} ({n} images)')
    # Bandes PNG irrégulières (12 images de marche sur une ligne) : passent après les GIF, donc les remplacent.
    if os.path.isdir(GIFS):
        for f in sorted(os.listdir(GIFS)):
            if f.lower().endswith('.png'):
                n = sheet_to_strip(os.path.join(GIFS, f), os.path.join(ANIM, f.lower()))
                print(f'bande recalee : {f} ({n} images)')
    if os.path.isdir(downloads):
        for f in sorted(os.listdir(downloads)):
            if not f.lower().endswith('.png'):
                continue
            src = os.path.join(downloads, f)
            try:
                im = Image.open(src)
                if im.height == CELL and im.width % CELL == 0:
                    shutil.copyfile(src, os.path.join(ANIM, f.lower()))
                    print(f'bande copiee : {f} ({im.width // CELL} cases)')
                else:
                    print(f'ignore (pas des cases de {CELL}) : {f} {im.size}')
            except Exception as e:
                print(f'ignore : {f} ({e})')
    # Images de la carte (immeuble) : copiées telles quelles dans media/map.
    mapdir = os.path.join(os.path.dirname(downloads.rstrip('/\\')), 'map') if downloads.rstrip('/\\').endswith('animations') else os.path.join(downloads, 'map')
    if os.path.isdir(mapdir):
        os.makedirs(os.path.join(ROOT, 'media', 'map'), exist_ok=True)
        for f in sorted(os.listdir(mapdir)):
            # Seulement les noms attendus par building.js : les autres images (planches, essais) restent dans Downloads.
            if f.lower().endswith('.png') and (f.lower().startswith('piece-') or f.lower()[:-4] in ('toit', 'ascenseur', 'ciel', 'rue', 'bureau-libre')):
                shutil.copyfile(os.path.join(mapdir, f), os.path.join(ROOT, 'media', 'map', f.lower()))
                print('carte copiee :', f)
    out = {'sprites': {}, 'anims': {}}
    for f in sorted(os.listdir(SPRITES)):
        if f.endswith('.png') and not f.startswith('contact'):
            out['sprites'][f[:-4]] = measure_sprite(os.path.join(SPRITES, f))
    for f in sorted(os.listdir(ANIM)):
        if f.endswith('.png'):
            m = measure_strip(os.path.join(ANIM, f))
            if m:
                out['anims'][f[:-4]] = m
    with io.open(os.path.join(ROOT, 'media', 'sprites.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"sprites.json : {len(out['sprites'])} sprites, {len(out['anims'])} animations", list(out['anims']))


if __name__ == '__main__':
    main()
