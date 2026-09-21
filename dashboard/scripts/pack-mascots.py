"""Package authored ImageGen atlases; no synthesized poses or character redraws."""
from pathlib import Path
import json, shutil
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/mascots-2d/v2'
SOURCE = ROOT / 'docs/journey-identity/mascot-2d-source'
SOURCE.mkdir(parents=True, exist_ok=True)
entries = json.loads((ROOT / 'docs/journey-identity/mascot-2d-imagegen-prompts.json').read_text())
def retain_character(frame):
    """Remove stray atlas fragments before measuring the character's registration."""
    alpha = frame.getchannel('A')
    width, height = frame.size
    pixels = np.asarray(alpha)
    count, labels, stats, _ = cv2.connectedComponentsWithStats((pixels > 32).astype(np.uint8), 8)
    assert count > 1, "Authored frame is empty"
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    mask=Image.fromarray(np.where(labels==largest,255,0).astype(np.uint8))
    # One source pixel of antialiasing is retained around the authored contour.
    mask=mask.filter(ImageFilter.MaxFilter(3))
    frame.putalpha(ImageChops.multiply(alpha,mask))
    return frame

report = []
for entry in entries:
    slug = entry['id'].replace('_', '-')
    master = SOURCE / f'{slug}-atlas.png'
    if not master.exists():
        shutil.copy2(entry['source'], master)
    image = Image.open(master).convert('RGBA')
    width, height = image.size
    frames = []
    bounds = []
    for row in range(5):
        for col in range(6):
            cell = image.crop((round(col * width / 6), round(row * height / 5), round((col + 1) * width / 6), round((row + 1) * height / 5)))
            cell = retain_character(cell)
            bound = cell.getchannel('A').getbbox()
            assert bound, f'Empty authored frame: {slug}/{row}/{col}'
            frames.append(cell)
            bounds.append(bound)
    # Uniform per-species scale, shared bottom anchor, 8% minimum safe area.
    # Registration positions frames; it does not manufacture animation from a poster.
    scale = min(510 / max(b[3] - b[1] for b in bounds), 530 / max(b[2] - b[0] for b in bounds))
    registered = []
    for frame, bound in zip(frames, bounds):
        full = frame.crop(bound)
        full = full.resize((round(full.width * scale), round(full.height * scale)), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (640, 640))
        canvas.alpha_composite(full, (320 - full.width // 2, 589 - full.height))
        registered.append(canvas)
    folder = ASSETS / slug
    manifest = json.loads((folder / 'manifest.json').read_text())
    manifest['assetVersion'] = '2.0.1'
    def save(img, name):
        img.save(folder / name, quality=88, method=4)
    save(registered[0].resize((1024, 1024), Image.Resampling.LANCZOS), 'poster.webp')
    save(registered[0].resize((512, 512), Image.Resampling.LANCZOS), 'avatar-body.webp')
    # Dedicated head framing retains the author's face and scarf.
    head_regions = {'bach-ho': (155, 75, 550, 415), 'thanh-long': (180, 75, 550, 410),
                    'loc-huou': (175, 70, 510, 410), 'phung-hoang': (190, 80, 550, 410),
                    'kim-quy': (120, 115, 460, 445)}
    head = registered[0].crop(head_regions[slug]); square = Image.new('RGBA', (max(head.size), max(head.size)))
    square.alpha_composite(head, ((square.width-head.width)//2, (square.height-head.height)//2))
    save(square.resize((256,256), Image.Resampling.LANCZOS), 'avatar-head.webp')
    silhouette = Image.new('RGBA', (640,640), (23,52,95,255));silhouette.putalpha(registered[0].getchannel('A'))
    save(silhouette, 'reveal-silhouette.webp')
    for row, name in enumerate(['idle','greet','analyzing','updated','tap_reaction']):
        state = manifest['states'][name]
        strip = Image.new('RGBA', (640 * state['frameCount'],640))
        for col in range(state['frameCount']):strip.alpha_composite(registered[row*6+col], (640*col,0))
        filename = 'tap-strip.webp' if name == 'tap_reaction' else f'{name}-strip.webp'
        save(strip, filename)
        state['file'] = filename
    old_tap = folder / 'tap_reaction-strip.webp'
    if old_tap.exists():old_tap.unlink()
    (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    entry['workspace_source'] = str(master.relative_to(ROOT))
    entry['source_dimensions'] = [width, height]
    entry['runtime_frame_dimensions'] = [640,640]
    sizes = {p.name:p.stat().st_size for p in folder.glob('*.webp')}
    assert max(sizes.values()) < 650*1024
    assert sum(sizes.values()) < 2.8*1024*1024
    report.append({'mascot':slug,'master_dimensions':[width,height],'total_bytes':sum(sizes.values()),'runtime_images':len(sizes),'sizes':sizes})
# A neutral shared UI glyph, deliberately not any animal or alternative species.
placeholder = Image.new('RGBA', (640,640));draw=ImageDraw.Draw(placeholder)
draw.ellipse((140,140,500,500), fill=(42,58,83,220), outline=(126,145,175,180), width=3)
draw.polygon([(320,224),(390,320),(320,416),(250,320)], outline=(169,189,216,230), width=4)
placeholder.save(ASSETS/'shared/fallback-placeholder.webp',quality=90,method=6)
# The generated stage concept is a design reference; live effects stay CSS.
concept=ASSETS/'shared/technical-blue-stage.png'
if concept.exists():shutil.move(str(concept),str(SOURCE/'stage-effect-concept.png'))
(ROOT/'docs/journey-identity/mascot-2d-imagegen-prompts.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
(ROOT/'docs/journey-identity/mascot-2d-asset-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
