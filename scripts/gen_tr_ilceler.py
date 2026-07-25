#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate js/tr-ilceler.js from TurkiyeAPI dataset."""
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "js" / "tr-ilceler.js"
DATA_JS = ROOT / "js" / "data.js"


def ascii_key(s: str) -> str:
    """Fold Turkish chars for province name matching."""
    s = s.upper().strip()
    tr = str.maketrans({
        "İ": "I", "I": "I", "ı": "I", "Ş": "S", "ş": "S", "Ğ": "G", "ğ": "G",
        "Ü": "U", "ü": "U", "Ö": "O", "ö": "O", "Ç": "C", "ç": "C",
        "Ä": "A", "â": "A", "Ã": "A",
    })
    s = s.translate(tr)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))


def load_sehirler():
    text = DATA_JS.read_text(encoding="utf-8")
    m = re.search(r"SEHIRLER:\s*\[(.*?)\]", text, re.S)
    if not m:
        raise SystemExit("SEHIRLER not found in data.js")
    return re.findall(r"'([^']+)'", m.group(1))


def fetch(url: str):
    with urllib.request.urlopen(url, timeout=60) as resp:
        return json.load(resp)


def main():
    sehirler = load_sehirler()
    by_ascii = {ascii_key(s): s for s in sehirler}

    provinces = fetch("https://api.turkiyeapi.dev/v2/datasets/provinces.json")
    districts = fetch("https://api.turkiyeapi.dev/v2/datasets/districts.json")

    pid_to_key = {}
    for p in provinces:
        key = by_ascii.get(ascii_key(p["name"]))
        if key:
            pid_to_key[p["id"]] = key

    result = {k: [] for k in sehirler}
    for d in districts:
        key = pid_to_key.get(d["provinceId"])
        if key:
            result[key].append(d["name"])

    for k in sehirler:
        result[k] = sorted(result[k], key=lambda x: x.upper())

    missing = [k for k in sehirler if not result[k]]
    if missing:
        raise SystemExit(f"Missing districts for: {missing}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        f.write("/** AURIX — Türkiye ilçe listesi (81 il). SEHIRLER anahtarlarıyla uyumlu. */\n")
        f.write("window.AURIX_ILCELER = ")
        json.dump(result, f, ensure_ascii=False, indent=4)
        f.write(";\n\n")
        f.write("window.AURIX_ilcelerFor = function (sehir) {\n")
        f.write("    if (!sehir || !window.AURIX_ILCELER) return [];\n")
        f.write('    var key = String(sehir).trim().toLocaleUpperCase("tr-TR");\n')
        f.write("    return window.AURIX_ILCELER[key] || [];\n")
        f.write("};\n")

    total = sum(len(v) for v in result.values())
    print(f"Wrote {OUT} — {len(sehirler)} cities, {total} districts")


if __name__ == "__main__":
    main()
