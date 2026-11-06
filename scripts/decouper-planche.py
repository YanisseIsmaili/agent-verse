#!/usr/bin/env python3
"""Découpe une planche de personnages (6 personnages × 3 poses + 5 icônes) en sprites PNG transparents.

Usage :
    python scripts/decouper-planche.py media/sources/planche-1.png
    python scripts/decouper-planche.py media/sources/manager-perso.png --ligne manager
        (un seul personnage, ses trois poses côte à côte sur une ligne : assis, debout, marche)

Sortie :
    media/sprites/<role>-<pose>.png     (roles : manager dev securite bugs readme autre ; poses : assis debout marche)
    media/icones/<nom>.png              (document enveloppe eclat-jaune eclat-vert pensee)
    media/sprites/contact.png           (aperçu de contrôle, toutes les découpes côte à côte)

La planche attendue : 3 lignes de personnages, 2 personnages par ligne, 3 poses chacun
(assis au bureau, debout de face, marche vers la droite), puis une 4e ligne de 5 icônes.
Le petit robot du rédacteur reste dans le même sprite que lui (découpe par bandes de colonnes,
pas par composantes connexes).
"""
import sys, os
from PIL import Image, ImageFilter
import numpy as np

ROLES = ['manager', 'dev', 'securite', 'bugs', 'readme', 'autre']
POSES = ['assis', 'debout', 'marche']
ICONS = ['document', 'enveloppe', 'eclat-jaune', 'eclat-vert', 'pensee']
GLOW_CUT = 90      # en dessous de cette alpha, c'est du halo lumineux : on l'enlève
SEG_ALPHA = 70     # alpha minimale pour qu'un pixel compte dans la segmentation
WHITE_CUT = 235
OUT_SCALE = 0.6    # taille d'export (les personnages font ~105 px à l'écran, ~150 px suffisent)    # si la planche n'a pas d'alpha : le blanc au-dessus de ce seuil devient transparent


def load(path):
    im = Image.open(path)
    if im.mode != 'RGBA' or im.getchannel('A').getextrema()[0] > 250:
        # Pas de transparence réelle : on retire le fond blanc avec un seuil et un lissage des bords.
        rgb = np.array(im.convert('RGB')).astype(np.int16)
        white = (rgb.min(axis=2) >= WHITE_CUT)
        alpha = Image.fromarray(np.where(white, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
        im = im.convert('RGB')
        im.putalpha(alpha)
        return im
    # Transparence réelle : on supprime le halo (alpha faible) et on redistribue le reste.
    a = np.array(im.getchannel('A')).astype(np.float32)
    a = np.clip((a - GLOW_CUT) * 255.0 / (255 - GLOW_CUT), 0, 255).astype(np.uint8)
    im = im.copy()
    im.putalpha(Image.fromarray(a))
    return im


def bands(v, min_gap, min_size):
    """Intervalles où v > 0, en fusionnant les trous plus petits que min_gap et en jetant les miettes."""
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


def fit_count(bs, n, proj):
    """Ramène la liste de bandes à n éléments en fusionnant les voisins les plus proches (ou échoue)."""
    bs = [list(b) for b in bs]
    while len(bs) > n:
        gaps = [bs[i + 1][0] - bs[i][1] for i in range(len(bs) - 1)]
        i = gaps.index(min(gaps))
        bs[i][1] = bs[i + 1][1]; del bs[i + 1]
    if len(bs) < n:
        raise SystemExit(f'segmentation : {len(bs)} éléments trouvés au lieu de {n} ({bs})')
    return bs


def label(mask):
    """Composantes connexes (8-voisinage) sans scipy : parcours en largeur, assez rapide pour une planche."""
    from collections import deque
    h, w = mask.shape
    lab = np.zeros((h, w), dtype=np.int32); n = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1; lab[y0, x0] = n; q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for ny in (y - 1, y, y + 1):
                if ny < 0 or ny >= h:
                    continue
                for nx in (x - 1, x, x + 1):
                    if 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n; q.append((ny, nx))
    return lab


def seam_cut(cost):
    """Chemin vertical de coût minimal (coût = alpha), déplacement de ±2 px par ligne. Retourne x par ligne."""
    h, w = cost.shape
    C = cost.astype(np.float64).copy(); back = np.zeros((h, w), dtype=np.int8)
    for y in range(1, h):
        prev = C[y - 1]
        cand = np.stack([np.concatenate([[np.inf] * k, prev[:w - k]]) if k > 0 else (prev if k == 0 else np.concatenate([prev[-k:], [np.inf] * -k])) for k in (-2, -1, 0, 1, 2)])
        k = cand.argmin(axis=0); back[y] = k - 2; C[y] += cand[k, np.arange(w)]
    x = int(C[-1].argmin()); seam = np.zeros(h, dtype=np.int32)
    for y in range(h - 1, -1, -1):
        seam[y] = x; x -= int(back[y, x])
    return seam


def crop_alpha(im):
    bbox = im.getchannel('A').point(lambda p: 255 if p > 8 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'media/sources/planche-1.png'
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_sprites = os.path.join(root, 'media', 'sprites')
    out_icons = os.path.join(root, 'media', 'icones')
    os.makedirs(out_sprites, exist_ok=True); os.makedirs(out_icons, exist_ok=True)

    im = load(src)
    A = np.array(im.getchannel('A')) > SEG_ALPHA
    if '--ligne' in sys.argv:
        # Un personnage, trois poses côte à côte. Les poses peuvent se chevaucher en x (chaise contre la veste) :
        # on sépare par composantes connexes, et quand deux poses se touchent, par une couture verticale
        # passant par les pixels les plus transparents.
        role = sys.argv[sys.argv.index('--ligne') + 1]
        alpha = np.array(im.getchannel('A')).astype(np.int32)
        lab = label(A)
        comps = sorted([c for c in range(1, lab.max() + 1) if (lab == c).sum() > 2000], key=lambda c: np.nonzero(lab == c)[1].mean())
        masks = [lab == c for c in comps]
        print('composantes :', [(int(np.nonzero(m)[1].min()), int(np.nonzero(m)[1].max())) for m in masks])
        while len(masks) < 3:
            # On coupe la composante la plus large en deux par une couture.
            i = max(range(len(masks)), key=lambda k: np.ptp(np.nonzero(masks[k])[1]))
            m = masks[i]; xs = np.nonzero(m)[1]; x0, x1 = xs.min(), xs.max()
            lo, hi = x0 + (x1 - x0) * 3 // 10, x0 + (x1 - x0) * 7 // 10
            seam = seam_cut(np.where(m, alpha, 0)[:, lo:hi]) + lo
            cols = np.arange(m.shape[1])[None, :]
            left, right = m & (cols < seam[:, None]), m & (cols >= seam[:, None])
            print(f'couture entre x={int(seam.min())} et x={int(seam.max())}')
            masks[i:i + 1] = [left, right]
        masks = masks[:3]
        for c, m in enumerate(masks):
            piece = im.copy()
            piece.putalpha(Image.fromarray(np.where(m, alpha, 0).astype(np.uint8)))
            piece = crop_alpha(piece)
            piece = piece.resize((max(1, round(piece.width * OUT_SCALE)), max(1, round(piece.height * OUT_SCALE))), Image.LANCZOS)
            name = f'{role}-{POSES[c]}'
            piece.save(os.path.join(out_sprites, name + '.png'), optimize=True)
            print(f'    {name:22s} {piece.size[0]}×{piece.size[1]}')
        return
    rows = fit_count(bands(A.sum(axis=1), min_gap=4, min_size=40), 4, A.sum(axis=1))
    print('lignes :', rows)
    pieces = []  # (nom, image)
    for r, (y0, y1) in enumerate(rows):
        sub = A[y0:y1]
        expected = 6 if r < 3 else 5
        cols = fit_count(bands(sub.sum(axis=0), min_gap=10, min_size=30), expected, sub.sum(axis=0))
        print(f'  ligne {r} : {len(cols)} colonnes', cols)
        for c, (x0, x1) in enumerate(cols):
            piece = crop_alpha(im.crop((x0, y0, x1, y1)))
            piece = piece.resize((max(1, round(piece.width * OUT_SCALE)), max(1, round(piece.height * OUT_SCALE))), Image.LANCZOS)
            if r < 3:
                name = f'{ROLES[r * 2 + c // 3]}-{POSES[c % 3]}'
                piece.save(os.path.join(out_sprites, name + '.png'), optimize=True)
            else:
                name = ICONS[c]
                piece.save(os.path.join(out_icons, name + '.png'), optimize=True)
            pieces.append((name, piece))
            print(f'    {name:22s} {piece.size[0]}×{piece.size[1]}')

    # Planche de contrôle.
    scale = 0.75
    thumbs = [(n, p.resize((max(1, int(p.width * scale)), max(1, int(p.height * scale))), Image.LANCZOS)) for n, p in pieces]
    per_row = 6
    cw = max(t.width for _, t in thumbs) + 10
    chh = max(t.height for _, t in thumbs) + 10
    sheet = Image.new('RGBA', (per_row * cw, ((len(thumbs) + per_row - 1) // per_row) * chh), (40, 30, 60, 255))
    for i, (n, t) in enumerate(thumbs):
        sheet.alpha_composite(t, ((i % per_row) * cw + 5, (i // per_row) * chh + 5))
    sheet.convert('RGB').save(os.path.join(out_sprites, 'contact.png'))
    print('aperçu :', os.path.join(out_sprites, 'contact.png'))


if __name__ == '__main__':
    main()
