#!/usr/bin/env python3
"""Thêm chữ số đều (tính năng OpenType `tnum`) vào Be Vietnam Pro.

Font gốc không có `tnum`, nên `font-variant-numeric: tabular-nums` không có tác
dụng. Script đọc bản latin của @fontsource/be-vietnam-pro rồi thêm mười glyph
`zero.tf` ... `nine.tf` (glyph ghép, dùng lại nét của chữ số gốc, căn giữa trong
ô rộng bằng nhau) và một lookup GSUB `tnum`. Chữ số mặc định giữ nguyên.

Chạy lại khi nâng cấp @fontsource/be-vietnam-pro:

    pip install fonttools brotli
    python3 scripts/patch-be-vietnam-tnum.py    # chạy từ frontend/

Font dùng giấy phép SIL OFL 1.1, không có Reserved Font Name; bản sửa giữ nguyên
giấy phép, xem src/assets/fonts/be-vietnam-pro/OFL.txt.
"""
from pathlib import Path

from fontTools.otlLib.builder import buildLookup, buildSingleSubstSubtable
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables as ot

FRONTEND = Path(__file__).resolve().parent.parent
SOURCE = FRONTEND / "node_modules/@fontsource/be-vietnam-pro/files"
TARGET = FRONTEND / "src/assets/fonts/be-vietnam-pro"
WEIGHTS = (400, 500, 600, 700)
DIGITS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine")
# Khoảng trắng tối thiểu của chữ số rộng nhất, tính trên 1000 đơn vị em.
MIN_SIDE_BEARINGS = 60


def ink_bounds(glyph_set, name):
    pen = BoundsPen(glyph_set)
    glyph_set[name].draw(pen)
    return pen.bounds


def tabular_width(font, glyph_set):
    """Rộng bằng trung bình các chữ số trừ số 1, để bảng số gần như không rộng thêm."""
    advances = [font["hmtx"][name][0] for name in DIGITS if name != "one"]
    widest_ink = max(ink_bounds(glyph_set, name)[2] - ink_bounds(glyph_set, name)[0] for name in DIGITS)
    return max(round(sum(advances) / len(advances)), round(widest_ink) + MIN_SIDE_BEARINGS)


def add_tabular_glyphs(font, width):
    glyph_set = font.getGlyphSet()
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = font.getGlyphOrder()
    mapping = {}
    for name in DIGITS:
        x_min, _, x_max, _ = ink_bounds(glyph_set, name)
        dx = round((width - (x_max - x_min)) / 2 - x_min)
        pen = TTGlyphPen(glyph_set)
        pen.addComponent(name, (1, 0, 0, 1, dx, 0))
        tabular = f"{name}.tf"
        order.append(tabular)
        glyf[tabular] = pen.glyph()
        hmtx[tabular] = (width, round(x_min + dx))
        mapping[name] = tabular
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    if "GDEF" in font and font["GDEF"].table.GlyphClassDef:
        font["GDEF"].table.GlyphClassDef.classDefs.update({name: 1 for name in mapping.values()})
    return mapping


def add_tnum_feature(font, mapping):
    gsub = font["GSUB"].table
    assert "tnum" not in {record.FeatureTag for record in gsub.FeatureList.FeatureRecord}
    assert gsub.Version == 1.0 or not getattr(gsub, "FeatureVariations", None)

    lookup = buildLookup([buildSingleSubstSubtable(mapping)])
    gsub.LookupList.Lookup.append(lookup)
    gsub.LookupList.LookupCount = len(gsub.LookupList.Lookup)

    feature = ot.Feature()
    feature.FeatureParams = None
    feature.LookupListIndex = [gsub.LookupList.LookupCount - 1]
    feature.LookupCount = 1
    record = ot.FeatureRecord()
    record.FeatureTag = "tnum"
    record.Feature = feature

    # FeatureList phải xếp theo tag, nên chèn xong phải đánh lại chỉ số ở mọi LangSys.
    records = gsub.FeatureList.FeatureRecord
    position = sum(1 for existing in records if existing.FeatureTag < "tnum")
    records.insert(position, record)
    gsub.FeatureList.FeatureCount = len(records)

    for script_record in gsub.ScriptList.ScriptRecord:
        script = script_record.Script
        lang_systems = [script.DefaultLangSys] if script.DefaultLangSys else []
        lang_systems += [lang.LangSys for lang in script.LangSysRecord]
        for lang_sys in lang_systems:
            shifted = [index + 1 if index >= position else index for index in lang_sys.FeatureIndex]
            lang_sys.FeatureIndex = sorted([*shifted, position])
            lang_sys.FeatureCount = len(lang_sys.FeatureIndex)


def tag_version(font):
    for record in font["name"].names:
        if record.nameID == 5:
            record.string = f"{record.toUnicode()}; IQX tnum patch"


def main():
    TARGET.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        filename = f"be-vietnam-pro-latin-{weight}-normal.woff2"
        font = TTFont(SOURCE / filename)
        width = tabular_width(font, font.getGlyphSet())
        add_tnum_feature(font, add_tabular_glyphs(font, width))
        tag_version(font)
        font.flavor = "woff2"
        font.save(TARGET / filename)
        before, after = (SOURCE / filename).stat().st_size, (TARGET / filename).stat().st_size
        print(f"{weight}: tnum width {width}/1000 em, {before} -> {after} bytes (+{after - before})")


if __name__ == "__main__":
    main()
