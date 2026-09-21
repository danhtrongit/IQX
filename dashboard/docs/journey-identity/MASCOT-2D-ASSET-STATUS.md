# IQX Mascot 2D Asset Status

**Audit scope:** runtime package `public/assets/mascots-2d/v2` for Bạch Hổ, Thanh Long, Lộc Hươu, Phụng Hoàng, and Kim Quy.  
**Reference:** `IQX-Asset-Checklist-Linh-Thu-2D-All5.md` and `IQX-Linh-Thu-2D-Visual-Guideline.md`.  
**Runtime asset version:** `2.0.1`.

## Status

The runtime package is complete for application integration:

- 5 mascot folders;
- 9 WebP images plus 1 manifest per mascot, for 50 runtime files;
- 1 shared fallback placeholder;
- all required static images and five animation states;
- correct dimensions, alpha channels, frame counts, strip boundaries, manifest paths, anchor, and timing ranges;
- every image and every mascot total remains below the checklist maximum budget.

This is a **runtime-complete package**, not a complete artist handoff. It has not received artist or Art Director approval.

## Automated QA

Run:

```bash
python3 dashboard/scripts/verify-mascot-assets.py
```

The post-cleanup result is **0 errors and 5 warnings**.

| Mascot | Runtime size | Frames | Largest detached alpha component | Main-body baseline drift |
|---|---:|---:|---:|---:|
| Bạch Hổ | 1.88 MiB | 27 | 7 px | 0 px |
| Thanh Long | 2.00 MiB | 27 | 17 px | 0 px |
| Lộc Hươu | 1.67 MiB | 27 | 29 px | 2 px |
| Phụng Hoàng | 2.15 MiB | 27 | 11 px | 2 px |
| Kim Quy | 1.58 MiB | 27 | 2 px | 3 px |

The remaining detached components are tiny antialias/resampling islands. None appears as a visible floating fragment at runtime scale. The warnings also report:

- Lộc Hươu alpha centroid drift of 19.2 px during the raised-foreleg motion;
- Phụng Hoàng alpha centroid drift of 17.3 px during the wing motion;
- Kim Quy idle silhouette-height variation of 3.7% from leaf/head pose changes.

These movements are visible pose changes rather than the earlier registration fault. Baseline drift remains within 3 px for all five mascots.

The before-cleanup measurement is preserved in `mascot-2d-asset-audit-before.json`. Before registration cleanup, 114 of 135 frames contained detached fragments; Phụng Hoàng had 44 px baseline drift and Kim Quy had 46.22 px centroid drift.

## Visual QA

Manual comparison of all 27 runtime frames for every mascot confirms:

- silhouette and species remain recognizable across all states;
- eyes, face, scarf, crystal, palette, outline, and shading remain within the same visual family;
- idle blink, greet, analyzing, updated, and tap poses are readable;
- no ear, horn, wing, tail, shell, leaf, or foot is clipped by a 640×640 runtime frame;
- the earlier floating color fringes and large horizontal/vertical jumps are gone;
- the five head avatars remain recognizable at 40 px.

Minor authored-source variation remains. The `IQX` scarf lettering changes subtly between some frames, and the 40 px avatars do not have perfectly equal visual weight across species. These are acceptable for the current runtime integration but should be reviewed in an artist polish pass.

## Source limitations

The source package does not meet the checklist's editable-source requirement:

- each mascot has one flattened RGBA PNG atlas, not separate layered master and animation files;
- atlas dimensions are 1374×1145 for four mascots and 1373×1146 for Kim Quy, not the requested 3840×3200 authoring canvas;
- each authored cell is therefore approximately 229×229 and is upscaled to the 640×640 runtime frame;
- no PSD, CLIP, or KRA file with editable line, color, face, scarf, crystal, species-part, and state/frame groups is available.

The flattened atlases are sufficient for the current WebP package and application fallback. They are not a replacement for the 10 layered source deliverables required by the production art checklist, and they limit future retouching or high-resolution export.

## Release interpretation

The package may be used for runtime integration and product QA. Do not label the overall art delivery as “asset complete” under the source checklist until all five mascots have layered master and animation source files and the required visual review gates have been approved by the responsible artist or Art Director.
