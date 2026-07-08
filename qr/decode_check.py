#!/usr/bin/env python3
"""Utilitario de verificacao: descodifica um PNG de QR code usando libzbar
(ja instalada no sistema) para confirmar que fica legivel por um leitor real."""
import ctypes
import sys

from PIL import Image

lib = ctypes.CDLL("/usr/lib/x86_64-linux-gnu/libzbar.so.0")

lib.zbar_image_scanner_create.restype = ctypes.c_void_p
lib.zbar_image_create.restype = ctypes.c_void_p
lib.zbar_image_first_symbol.restype = ctypes.c_void_p
lib.zbar_image_first_symbol.argtypes = [ctypes.c_void_p]
lib.zbar_symbol_get_data.restype = ctypes.c_char_p
lib.zbar_symbol_get_data.argtypes = [ctypes.c_void_p]
lib.zbar_symbol_next.restype = ctypes.c_void_p
lib.zbar_symbol_next.argtypes = [ctypes.c_void_p]
lib.zbar_image_set_data.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p]
lib.zbar_scan_image.argtypes = [ctypes.c_void_p, ctypes.c_void_p]


def fourcc(s):
    return sum(ord(c) << (8 * i) for i, c in enumerate(s))


def decode(png_path):
    img = Image.open(png_path).convert("L")
    w, h = img.size
    data = img.tobytes()
    buf = ctypes.create_string_buffer(data, len(data))

    scanner = lib.zbar_image_scanner_create()
    lib.zbar_image_scanner_set_config(scanner, 0, 0, 1)  # ZBAR_CFG_ENABLE=0 no-op fallback

    image = lib.zbar_image_create()
    lib.zbar_image_set_format(ctypes.c_void_p(image), fourcc("Y800"))
    lib.zbar_image_set_size(ctypes.c_void_p(image), w, h)
    lib.zbar_image_set_data(ctypes.c_void_p(image), buf, len(data), None)

    lib.zbar_scan_image(ctypes.c_void_p(scanner), ctypes.c_void_p(image))

    sym = lib.zbar_image_first_symbol(ctypes.c_void_p(image))
    results = []
    while sym:
        text = lib.zbar_symbol_get_data(ctypes.c_void_p(sym))
        results.append(text.decode("utf-8", errors="replace"))
        sym = lib.zbar_symbol_next(ctypes.c_void_p(sym))

    lib.zbar_image_destroy(ctypes.c_void_p(image))
    lib.zbar_image_scanner_destroy(ctypes.c_void_p(scanner))
    return results


if __name__ == "__main__":
    res = decode(sys.argv[1])
    if res:
        for r in res:
            print(f"DECODED: {r}")
    else:
        print("DECODE_FAILED")
        sys.exit(1)
