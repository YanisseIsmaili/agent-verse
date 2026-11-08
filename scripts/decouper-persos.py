#!/usr/bin/env python3
"""Sprites fixes des personnages livrés un par un (pas sur une planche) : Git et 3D Maker.

    python scripts/decouper-persos.py

Sources (copiées dans media/sources/) :
    media/sources/perso/git-assis.png, git-debout.png, git-marche.png   (une pose par image, fond transparent)
    media/sources/anim/3d-clavier.gif  → 3d-assis.png  (première image : la créatrice au bureau)
    media/sources/anim/3d-marche.gif   → 3d-debout.png (image aux jambes les plus serrées) et 3d-marche.png (la plus ouverte)
Chaque personnage est recadré sur son contour puis mis à l'échelle (même facteur pour ses trois poses, debout ≈ 300 px)
vers media/sprites/<role>-<pose>.png. Les bandes animées sont faites par preparer-images.py.
"""
import os
from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERSO = os.path.join(ROOT, 'media', 'sources', 'perso')
ANIM = os.path.join(ROOT, 'media', 'sources', 'anim')
OUT = os.path.join(ROOT, 'media', 'sprites')
DEBOUT_H = 300


def bbox(im):
    return im.getchannel('A').point(lambda p: 255 if p > 40 else 0).getbbox()


def crop(im):
    return im.crop(bbox(im))


def save(im, name, k):
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.png'), optimize=True)
    print(f'{name:12s} {im.width}x{im.height}')


def frames(path):
    return [crop(f.convert('RGBA')) for f in ImageSequence.Iterator(Image.open(path))]


def main():
    os.makedirs(OUT, exist_ok=True)
    # Git : trois PNG.
    poses = {p: crop(Image.open(os.path.join(PERSO, f'git-{p}.png')).convert('RGBA')) for p in ('assis', 'debout', 'marche')}
    k = DEBOUT_H / poses['debout'].height
    for p, im in poses.items():
        save(im, f'git-{p}', k)
    # 3D Maker : images tirées des GIF.
    walk = frames(os.path.join(ANIM, '3d-marche.gif'))
    debout = min(walk, key=lambda f: f.width)
    marche = max(walk, key=lambda f: f.width)
    assis = frames(os.path.join(ANIM, '3d-clavier.gif'))[0]
    k = DEBOUT_H / debout.height
    save(assis, '3d-assis', k)
    save(debout, '3d-debout', k)
    save(marche, '3d-marche', k)


if __name__ == '__main__':
    main()
