"""Repeatable file benchmark. Excludes camera/network/queue latency; never a capacity claim."""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.anpr.recognizer import PlacaRecognizer
from app.anpr.plate import normalizar_placa
from app.services.imagem import decodificar


def expected_label(path, manifest=None):
    if manifest is not None:
        if path.name not in manifest:
            raise ValueError(f"Rótulo ausente no manifest: {path.name}")
        label = manifest[path.name]
        if label is None:
            return None
        if not isinstance(label, str):
            raise ValueError(f"Rótulo inválido: {path.name}")
        plate = normalizar_placa(label)
        if plate is None or plate.valor != label.upper():
            raise ValueError(f"Rótulo inválido: {path.name}")
        return plate.valor
    # A separated numeric suffix denotes another photo, not part of the plate.
    match = re.fullmatch(r"([A-Z]{3}[0-9][A-Z0-9][0-9]{2})(?:[ _-]+[0-9]+)?", path.stem.upper())
    if not match:
        raise ValueError(f"Nome sem rótulo inequívoco; forneça --manifest: {path.name}")
    return match[1]


def percentiles(values):
    return {"p50_ms": float(np.percentile(values, 50) * 1000),
            "p95_ms": float(np.percentile(values, 95) * 1000)}


def run_benchmark(recognizer, photos_dir, repeats=3, manifest=None, max_dim=None,
                  full_frame_fallback=True):
    photos = sorted(photos_dir.glob("*.jpg"))
    if not photos or repeats < 1:
        raise ValueError("São necessárias fotos e pelo menos uma repetição")
    labels = {photo.name: expected_label(photo, manifest) for photo in photos}
    warm_start = time.perf_counter()
    warm_image = decodificar(photos[0].read_bytes())
    # Includes lazy YOLO model initialization, before all recorded samples.
    recognizer.reconhecer_melhor(warm_image, full_frame_fallback=full_frame_fallback)
    warmup_seconds = time.perf_counter() - warm_start
    samples = []
    for _ in range(repeats):
        for photo in photos:
            start = time.perf_counter()
            content = photo.read_bytes()
            read_end = time.perf_counter()
            image = decodificar(content)
            if max_dim:
                height, width = image.shape[:2]
                scale = min(1, max_dim / max(width, height))
                image = cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))))
            decode_end = time.perf_counter()
            candidate = recognizer.reconhecer_melhor(image, full_frame_fallback=full_frame_fallback)
            end = time.perf_counter()
            plate = candidate.placa.valor if candidate else None
            samples.append(dict(file=photo.name, expected=labels[photo.name], recognized=plate,
                                correct=plate == labels[photo.name],
                                read_seconds=read_end-start, decode_seconds=decode_end-read_end,
                                inference_seconds=end-decode_end, total_seconds=end-start))
    stages = {stage: percentiles([sample[stage + "_seconds"] for sample in samples])
              for stage in ("read", "decode", "inference", "total")}
    return dict(scope="local files; excludes camera/network/queue/frontend", warmup_seconds=warmup_seconds,
                photo_count=len(photos), repeats=repeats, sample_count=len(samples),
                correct=sum(sample["correct"] for sample in samples),
                full_frame_fallback=full_frame_fallback, max_dim=max_dim, stages=stages, samples=samples)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--photos", type=Path, default=Path(__file__).parent / "photos")
    parser.add_argument("--manifest", type=Path, help="JSON filename -> plate, null for empty scenes")
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--max-dim", type=int)
    parser.add_argument("--background", action="store_true", help="Disable full-frame fallback like monitors")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.repeats < 1 or (args.max_dim is not None and args.max_dim < 1):
        parser.error("repeats e max-dim devem ser positivos")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8")) if args.manifest else None
    start = time.perf_counter()
    recognizer = PlacaRecognizer(lang="en")
    initialization = time.perf_counter() - start
    report = run_benchmark(recognizer, args.photos, args.repeats, manifest, args.max_dim, not args.background)
    report["initialization_seconds"] = initialization
    encoded = json.dumps(report, indent=2, ensure_ascii=False)
    print(encoded)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
