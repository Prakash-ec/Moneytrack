import io
import os
import shutil
from pathlib import Path
from PIL import Image, ImageDraw
import resvg_py

ROOT = Path(__file__).resolve().parent.parent
BRANDING_DIR = ROOT / "frontend" / "public" / "branding"
ICONS_DIR = ROOT / "frontend" / "public" / "icons"

# Read master SVGs
squircle_svg_path = BRANDING_DIR / "moneytrack-squircle.svg"
icon_svg_path = BRANDING_DIR / "moneytrack-icon.svg"

with open(squircle_svg_path, "r", encoding="utf-8") as f:
    SQUIRCLE_SVG = f.read()

with open(icon_svg_path, "r", encoding="utf-8") as f:
    ICON_SVG = f.read()

# Build Adaptive Foreground SVG (108dp canvas with centered safe-area symbol)
ADAPTIVE_FOREGROUND_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108" fill="none">
  <defs>
    <radialGradient id="fgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#6366F1" stop-opacity="0.32" />
      <stop offset="60%" stop-color="#4F46E5" stop-opacity="0.10" />
      <stop offset="100%" stop-color="#6366F1" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="fgLeft" x1="130" y1="360" x2="256" y2="160" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#4338CA" />
      <stop offset="50%" stop-color="#6366F1" />
      <stop offset="100%" stop-color="#818CF8" />
    </linearGradient>
    <linearGradient id="fgGrowth" x1="230" y1="280" x2="380" y2="120" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6366F1" />
      <stop offset="45%" stop-color="#3B82F6" />
      <stop offset="80%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#10B981" />
    </linearGradient>
    <linearGradient id="fgOrbit" x1="90" y1="400" x2="420" y2="100" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6366F1" stop-opacity="0.15" />
      <stop offset="30%" stop-color="#4F46E5" stop-opacity="0.75" />
      <stop offset="70%" stop-color="#06B6D4" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#10B981" stop-opacity="0.95" />
    </linearGradient>
    <radialGradient id="fgCore" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="1" />
      <stop offset="50%" stop-color="#6366F1" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#6366F1" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Scale and center symbol inside the 72dp safe circular zone (center=54,54) -->
  <g transform="translate(54, 54) scale(0.122) translate(-256, -256)">
    <!-- Ambient Glow -->
    <circle cx="256" cy="256" r="230" fill="url(#fgGlow)" />

    <!-- Orbit Tracking Arc -->
    <path
      d="M 126 386 A 184 184 0 1 1 396 366"
      stroke="url(#fgOrbit)"
      stroke-width="14"
      stroke-linecap="round"
      opacity="0.85"
    />
    <circle cx="396" cy="366" r="8" fill="#10B981" />
    <circle cx="396" cy="366" r="14" fill="#10B981" opacity="0.3" />

    <!-- Left Anchor & Arch -->
    <path
      d="M 148 360 V 208 C 148 181.5 169.5 160 196 160 C 211 160 224.5 167 233.5 178 L 256 208 L 221 254 L 196 220 C 190.5 212.5 180 216.5 180 225.5 V 360 C 180 366.6 174.6 372 168 372 L 160 372 C 153.4 372 148 366.6 148 360 Z"
      fill="url(#fgLeft)"
    />

    <!-- Right Growth Vector Arrow -->
    <path
      d="M 233.5 238 L 256 208 L 278.5 238 L 332 168 C 341 156.5 354.5 150 369.5 150 C 379.5 150 388.5 153 396 158.5 L 396 112 C 396 105.4 401.4 100 408 100 L 412 100 C 418.6 100 424 105.4 424 112 L 424 196 C 424 202.6 418.6 208 412 208 L 328 208 C 321.4 208 316 202.6 316 196 L 316 192 C 316 185.4 321.4 180 328 180 L 374 180 C 368 174 359 170 349 170 C 341.5 170 334.5 173.5 329.5 179.5 L 278 248 L 278 360 C 278 366.6 272.6 372 266 372 L 258 372 C 251.4 372 246 366.6 246 360 V 276 L 233.5 238 Z"
      fill="url(#fgGrowth)"
    />

    <!-- Central Fulcrum -->
    <circle cx="256" cy="242" r="14" fill="#0B0F19" />
    <circle cx="256" cy="242" r="10" fill="url(#fgCore)" />
    <circle cx="256" cy="242" r="4" fill="#FFFFFF" />
  </g>
</svg>"""

with open(BRANDING_DIR / "moneytrack-adaptive-foreground.svg", "w", encoding="utf-8") as f:
    f.write(ADAPTIVE_FOREGROUND_SVG)


def svg_to_image(svg_content: str, width: int, height: int) -> Image.Image:
    # Scale SVG attributes to match requested resolution
    content = svg_content
    # resvg_py parses the SVG. Let's create an in-memory render
    png_bytes = resvg_py.svg_to_bytes(content)
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    if img.size != (width, height):
        img = img.resize((width, height), Image.Resampling.LANCZOS)
    return img


def make_round_icon(image: Image.Image) -> Image.Image:
    """Takes an image, puts it inside an Obsidian circular background with border."""
    size = image.size[0]
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.ellipse((0, 0, size - 1, size - 1), fill=255)

    # Obsidian background circle
    bg = Image.new("RGBA", (size, size), (11, 15, 25, 255))  # #0B0F19
    out.paste(bg, (0, 0), mask)

    # Resize input slightly to fit nicely in the circle
    padding = max(2, int(size * 0.08))
    inner_size = size - (padding * 2)
    resized = image.resize((inner_size, inner_size), Image.Resampling.LANCZOS)

    # Composite inner icon
    inner_x = (size - inner_size) // 2
    inner_y = (size - inner_size) // 2
    out.alpha_composite(resized, (inner_x, inner_y))

    # Add subtle border ring
    border_draw = ImageDraw.Draw(out)
    border_draw.ellipse((0, 0, size - 1, size - 1), outline=(35, 43, 59, 200), width=max(1, int(size * 0.03)))
    return out


def make_splash(width: int, height: int) -> Image.Image:
    """Creates a high-res splash image with obsidian background and centered branding lockup."""
    splash = Image.new("RGBA", (width, height), (11, 15, 25, 255))  # #0B0F19

    # Scale logo proportionally based on screen dimensions
    target_logo_size = int(min(width, height) * 0.38)
    target_logo_size = max(96, min(target_logo_size, 384))

    logo_img = svg_to_image(SQUIRCLE_SVG, target_logo_size, target_logo_size)
    lx = (width - target_logo_size) // 2
    ly = (height - target_logo_size) // 2 - int(height * 0.04)

    splash.alpha_composite(logo_img, (lx, max(0, ly)))
    return splash


def main():
    print("1. Generating Web PWA icons...")
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    
    # 512x512 squircle
    icon_512 = svg_to_image(SQUIRCLE_SVG, 512, 512)
    icon_512.save(ICONS_DIR / "icon-512.png", "PNG")
    
    # 192x192 squircle
    icon_192 = icon_512.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save(ICONS_DIR / "icon-192.png", "PNG")

    # Apple touch icon (180x180)
    apple_touch = icon_512.resize((180, 180), Image.Resampling.LANCZOS)
    apple_touch.save(ICONS_DIR / "apple-touch-icon.png", "PNG")

    # Maskable icon (512x512 with safe padding)
    maskable = Image.new("RGBA", (512, 512), (11, 15, 25, 255))
    inner_sq = icon_512.resize((410, 410), Image.Resampling.LANCZOS)
    maskable.alpha_composite(inner_sq, (51, 51))
    maskable.save(ICONS_DIR / "maskable-512.png", "PNG")
    print("   [OK] PWA icons generated.")

    # Android Densities
    MIPMAP_SPECS = {
        "mipmap-mdpi": {"launcher": 48, "foreground": 108},
        "mipmap-hdpi": {"launcher": 72, "foreground": 162},
        "mipmap-xhdpi": {"launcher": 96, "foreground": 216},
        "mipmap-xxhdpi": {"launcher": 144, "foreground": 324},
        "mipmap-xxxhdpi": {"launcher": 192, "foreground": 432},
    }

    SPLASH_SPECS = {
        "drawable/splash.png": (1080, 1920),
        "drawable-land-mdpi/splash.png": (480, 320),
        "drawable-land-hdpi/splash.png": (800, 480),
        "drawable-land-xhdpi/splash.png": (1280, 720),
        "drawable-land-xxhdpi/splash.png": (1600, 960),
        "drawable-land-xxxhdpi/splash.png": (1920, 1280),
        "drawable-port-mdpi/splash.png": (320, 480),
        "drawable-port-hdpi/splash.png": (480, 800),
        "drawable-port-xhdpi/splash.png": (720, 1280),
        "drawable-port-xxhdpi/splash.png": (960, 1600),
        "drawable-port-xxxhdpi/splash.png": (1280, 1920),
    }

    android_res_targets = [
        ROOT / "android" / "app" / "src" / "main" / "res",
        ROOT / "frontend" / "android" / "app" / "src" / "main" / "res",
    ]

    for res_dir in android_res_targets:
        if not res_dir.exists():
            continue
        print(f"\n2. Updating Android Resources at: {res_dir}")

        # Generate Mipmap Icons
        for folder, spec in MIPMAP_SPECS.items():
            target_folder = res_dir / folder
            target_folder.mkdir(parents=True, exist_ok=True)
            
            l_size = spec["launcher"]
            fg_size = spec["foreground"]

            # 1. ic_launcher.png (squircle)
            launcher_img = icon_512.resize((l_size, l_size), Image.Resampling.LANCZOS)
            launcher_img.save(target_folder / "ic_launcher.png", "PNG")

            # 2. ic_launcher_round.png (circle)
            round_img = make_round_icon(launcher_img)
            round_img.save(target_folder / "ic_launcher_round.png", "PNG")

            # 3. ic_launcher_foreground.png (108dp adaptive foreground)
            fg_img = svg_to_image(ADAPTIVE_FOREGROUND_SVG, fg_size, fg_size)
            fg_img.save(target_folder / "ic_launcher_foreground.png", "PNG")
            print(f"   [OK] {folder}: launcher {l_size}px, foreground {fg_size}px")

        # Generate Splash Screens
        print("   Generating native splash screens...")
        for splash_rel, (w, h) in SPLASH_SPECS.items():
            dest = res_dir / splash_rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            splash_img = make_splash(w, h)
            splash_img.save(dest, "PNG")
        print("   [OK] All splash screens generated.")

        # Update XML configs
        # 1. values/ic_launcher_background.xml
        vals_bg = res_dir / "values" / "ic_launcher_background.xml"
        vals_bg.parent.mkdir(parents=True, exist_ok=True)
        vals_bg.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B0F19</color>\n</resources>\n',
            encoding="utf-8"
        )

        # 2. drawable/ic_launcher_background.xml
        draw_bg = res_dir / "drawable" / "ic_launcher_background.xml"
        draw_bg.parent.mkdir(parents=True, exist_ok=True)
        draw_bg.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            '    android:width="108dp"\n'
            '    android:height="108dp"\n'
            '    android:viewportWidth="108"\n'
            '    android:viewportHeight="108">\n'
            '    <path\n'
            '        android:fillColor="#0B0F19"\n'
            '        android:pathData="M0,0h108v108h-108z" />\n'
            '</vector>\n',
            encoding="utf-8"
        )

        # 3. Remove or replace bugdroid drawable-v24/ic_launcher_foreground.xml
        # Since adaptive foreground is now provided in mipmap-*/ic_launcher_foreground.png,
        # having drawable-v24/ic_launcher_foreground.xml with the old bugdroid overrides it!
        bugdroid_v24 = res_dir / "drawable-v24" / "ic_launcher_foreground.xml"
        if bugdroid_v24.exists():
            bugdroid_v24.unlink()
            print("   [OK] Removed legacy bugdroid drawable-v24/ic_launcher_foreground.xml")

        # 4. Check mipmap-anydpi-v26/ic_launcher.xml
        anydpi_launcher = res_dir / "mipmap-anydpi-v26" / "ic_launcher.xml"
        anydpi_launcher.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_background"/>\n'
            '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
            '</adaptive-icon>\n',
            encoding="utf-8"
        )

        anydpi_round = res_dir / "mipmap-anydpi-v26" / "ic_launcher_round.xml"
        anydpi_round.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_background"/>\n'
            '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
            '</adaptive-icon>\n',
            encoding="utf-8"
        )
        print("   [OK] Updated adaptive icon XML manifests.")

    print("\n[OK] ALL BRAND ANDROID ASSETS AND WEB ICONS GENERATED SUCCESSFULLY.")


if __name__ == "__main__":
    main()
