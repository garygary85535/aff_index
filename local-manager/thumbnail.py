import io, sys, warnings
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = 25_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
try:
    data = sys.stdin.buffer.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise ValueError('圖片不可超過 5 MB')
    with Image.open(io.BytesIO(data)) as source:
        if source.format not in ('PNG', 'JPEG', 'WEBP'):
            raise ValueError('請選擇 JPG、PNG 或 WebP 圖片')
        image = ImageOps.exif_transpose(source).convert('RGBA')
        image.thumbnail((360, 480), Image.Resampling.LANCZOS)
        image.save(sys.stdout.buffer, 'WEBP', quality=82, method=6)
except Exception:
    sys.stderr.write('圖片無法讀取，請使用 5 MB 以內的 JPG、PNG 或 WebP 圖片。')
    sys.exit(1)
