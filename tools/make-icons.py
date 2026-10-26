"""生成 NCE StudyFree 的 PWA / favicon 图标（零设计依赖，只用 Pillow）。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

GREEN = "#14532d"
GREEN_2 = "#1d5f39"
CREAM = "#f7f1e4"
ORANGE = "#d97706"
MASTER = 1024


def font(size: int, bold: bool = True):
    candidates = [
        r"C:\Windows\Fonts\georgiab.ttf" if bold else r"C:\Windows\Fonts\georgia.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_master() -> Image.Image:
    image = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([0, 0, MASTER - 1, MASTER - 1], radius=220, fill=GREEN)
    # 左上角的柔和层次
    overlay = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse([-320, -380, 520, 460], fill=(40, 120, 72, 255))
    od.ellipse([640, 700, 1300, 1300], fill=(10, 55, 34, 130))
    image = Image.alpha_composite(image, overlay)
    draw = ImageDraw.Draw(image)
    # 内描边
    draw.rounded_rectangle(
        [30, 30, MASTER - 30, MASTER - 30],
        radius=196,
        outline=(247, 241, 228, 70),
        width=4,
    )
    # 主字母
    draw.text((MASTER // 2, 440), "NCE", font=font(300), fill=CREAM, anchor="mm")
    # 橙色下划线
    draw.rounded_rectangle(
        [MASTER // 2 - 150, 620, MASTER // 2 + 150, 632],
        radius=6,
        fill=ORANGE,
    )
    # 副标
    draw.text((MASTER // 2, 720), "1 – 4", font=font(58, bold=False), fill=(247, 241, 228, 190), anchor="mm")
    return image


def main():
    master = make_master()
    master.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png")
    master.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png")
    master.resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png")
    master.resize((32, 32), Image.LANCZOS).save(OUT / "favicon-32.png")
    master.resize((16, 16), Image.LANCZOS).save(OUT / "favicon-16.png")
    master.resize((48, 48), Image.LANCZOS).save(
        OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    (OUT / "favicon.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#14532d"/>
  <ellipse cx="10" cy="6" rx="26" ry="22" fill="#1d5f39" opacity=".8"/>
  <text x="32" y="38" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="19" font-weight="700" fill="#f7f1e4">NCE</text>
  <rect x="23" y="43" width="18" height="2.4" rx="1.2" fill="#d97706"/>
</svg>
""",
        encoding="utf-8",
    )
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
