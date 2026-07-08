#!/usr/bin/env python3
"""
Gerador de QR code com estilos e logotipo central.
Usa a biblioteca C libqrencode (ja instalada no sistema) via ctypes para
codificar o QR (sem precisar de nenhum pacote externo de Python/Node),
e Pillow para desenhar a imagem final com o estilo escolhido.
"""
import argparse
import ctypes
import ctypes.util
import math
import os
import sys

from PIL import Image, ImageDraw

LIB_CANDIDATES = [
    "/usr/lib/x86_64-linux-gnu/libqrencode.so.4",
    "libqrencode.so.4",
    "libqrencode.so",
]


def load_lib():
    last_err = None
    for name in LIB_CANDIDATES:
        try:
            return ctypes.CDLL(name)
        except OSError as e:
            last_err = e
    raise RuntimeError(f"Nao foi possivel carregar libqrencode: {last_err}")


class QRcode(ctypes.Structure):
    _fields_ = [
        ("version", ctypes.c_int),
        ("width", ctypes.c_int),
        ("data", ctypes.POINTER(ctypes.c_ubyte)),
    ]


# QRecLevel
EC_LEVELS = {"L": 0, "M": 1, "Q": 2, "H": 3}
QR_MODE_8 = 2  # byte mode, aceita qualquer string (url, texto)


def encode_matrix(text: str, ec_level: str = "M"):
    lib = load_lib()
    lib.QRcode_encodeString.restype = ctypes.POINTER(QRcode)
    lib.QRcode_encodeString.argtypes = [
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
    ]
    lib.QRcode_free.argtypes = [ctypes.POINTER(QRcode)]

    version = 0  # automatico (o mais pequeno que caiba)
    level = EC_LEVELS[ec_level]
    qr_ptr = lib.QRcode_encodeString(
        text.encode("utf-8"), version, level, QR_MODE_8, 1
    )
    if not qr_ptr:
        raise RuntimeError("Falha ao codificar QR code")
    qr = qr_ptr.contents
    width = qr.width
    raw = [qr.data[i] for i in range(width * width)]
    matrix = [
        [(raw[y * width + x] & 1) == 1 for x in range(width)] for y in range(width)
    ]
    lib.QRcode_free(qr_ptr)
    return matrix, width


def is_finder_zone(x, y, n):
    """True se (x,y) esta dentro de um dos 3 quadrados 'olho' (finder patterns)."""
    zones = [(0, 0), (n - 7, 0), (0, n - 7)]
    for zx, zy in zones:
        if zx <= x < zx + 7 and zy <= y < zy + 7:
            return True
    return False


def hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i : i + 2], 16) for i in range(0, 6, 2))


def draw_finder_eye(draw, x0, y0, module_px, color, shape):
    """Desenha um 'olho' 7x7 do QR (moldura + centro)."""
    size = 7 * module_px
    outer_round = module_px * (2.2 if shape in ("rounded", "dots", "classy") else 0)
    inner_round = module_px * (1.6 if shape in ("rounded", "dots", "classy") else 0)

    # moldura exterior (7x7) com o interior 5x5 "vazado"
    draw.rounded_rectangle(
        [x0, y0, x0 + size, y0 + size], radius=outer_round, fill=color
    )
    draw.rounded_rectangle(
        [x0 + module_px, y0 + module_px, x0 + size - module_px, y0 + size - module_px],
        radius=max(outer_round - module_px, 0),
        fill="white",
    )
    # centro 3x3
    c0 = x0 + 2 * module_px
    c1 = x0 + size - 2 * module_px
    draw.rounded_rectangle([c0, y0 + 2 * module_px, c1, y0 + size - 2 * module_px], radius=inner_round, fill=color)


def render(matrix, n, style, out_path, logo_path=None, box=680, logo_scale=0.22):
    shape = style.get("shape", "classico")
    fg = hex_to_rgb(style.get("fg", "#111111"))
    bg = hex_to_rgb(style.get("bg", "#ffffff"))

    quiet = 4  # zona de silencio obrigatoria (em modulos)
    total_modules = n + quiet * 2
    module_px = max(6, box // total_modules)
    img_size = module_px * total_modules

    img = Image.new("RGB", (img_size, img_size), bg)
    draw = ImageDraw.Draw(img)

    offset = quiet * module_px

    # desenhar os 3 "olhos" (finder patterns) primeiro, com estilo proprio
    finder_origins = [(0, 0), (n - 7, 0), (0, n - 7)]
    for fx, fy in finder_origins:
        draw_finder_eye(
            draw, offset + fx * module_px, offset + fy * module_px, module_px, fg, shape
        )

    # desenhar os restantes modulos de dados
    for y in range(n):
        for x in range(n):
            if is_finder_zone(x, y, n):
                continue
            if not matrix[y][x]:
                continue
            px = offset + x * module_px
            py = offset + y * module_px

            if shape == "pontos":
                r = module_px * 0.5
                cx, cy = px + module_px / 2, py + module_px / 2
                draw.ellipse([cx - r * 0.92, cy - r * 0.92, cx + r * 0.92, cy + r * 0.92], fill=fg)
            elif shape == "arredondado":
                pad = module_px * 0.06
                draw.rounded_rectangle(
                    [px + pad, py + pad, px + module_px - pad, py + module_px - pad],
                    radius=module_px * 0.35,
                    fill=fg,
                )
            elif shape == "elegante":
                # quadrados com cantos cortados (estilo "classy")
                pad = module_px * 0.05
                x0, y0, x1, y1 = px + pad, py + pad, px + module_px - pad, py + module_px - pad
                cut = module_px * 0.32
                draw.polygon(
                    [
                        (x0 + cut, y0), (x1, y0), (x1, y1 - cut),
                        (x1 - cut, y1), (x0, y1), (x0, y0 + cut),
                    ],
                    fill=fg,
                )
            else:  # classico
                draw.rectangle([px, py, px + module_px - 1, py + module_px - 1], fill=fg)

    # logotipo central (opcional)
    if logo_path and os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGBA")
        logo_scale = max(0.10, min(0.38, logo_scale))
        target = int(img_size * logo_scale)
        logo.thumbnail((target, target), Image.LANCZOS)
        pad = int(target * 0.18)
        plate_w, plate_h = logo.width + pad * 2, logo.height + pad * 2
        plate = Image.new("RGBA", (plate_w, plate_h), (255, 255, 255, 255))
        pd = ImageDraw.Draw(plate)
        pd.rounded_rectangle([0, 0, plate_w - 1, plate_h - 1], radius=plate_w * 0.18, fill=(255, 255, 255, 255))
        plate.paste(logo, (pad, pad), logo)
        cx, cy = img_size // 2, img_size // 2
        img.paste(plate, (cx - plate_w // 2, cy - plate_h // 2), plate)

    img.save(out_path, "PNG")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--text", required=True, help="Conteudo a codificar (ex: URL curto)")
    p.add_argument("--out", required=True, help="Caminho do PNG de saida")
    p.add_argument("--shape", default="classico", choices=["classico", "arredondado", "pontos", "elegante"])
    p.add_argument("--fg", default="#111111")
    p.add_argument("--bg", default="#ffffff")
    p.add_argument("--logo", default=None)
    p.add_argument("--logo-scale", type=float, default=0.22)
    p.add_argument("--box", type=int, default=680)
    args = p.parse_args()

    ec_level = "H" if args.logo else "Q"
    matrix, n = encode_matrix(args.text, ec_level=ec_level)
    style = {"shape": args.shape, "fg": args.fg, "bg": args.bg}
    render(matrix, n, style, args.out, logo_path=args.logo, box=args.box, logo_scale=args.logo_scale)
    print(f"OK modules={n} out={args.out}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        sys.exit(1)
