"""Benchmark correto: usa reconhecer_melhor (filtra por formato de placa)."""

import os, sys, tempfile, shutil
os.environ.setdefault('PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT', 'False')
os.environ.setdefault('PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'True')

import time, cv2
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.anpr.recognizer import PlacaRecognizer


def run_benchmark(recognizer, photos_dir: Path, label: str):
    fotos = sorted(photos_dir.glob("*.jpg"))
    acertos = 0
    tempos = []

    print(f"\n{'='*60}")
    print(f" {label}")
    print(f"{'='*60}")

    for f in fotos:
        esperado = f.stem.upper().replace(" ", "")
        img = cv2.imread(str(f))

        t0 = time.perf_counter()
        melhor = recognizer.reconhecer_melhor(img)
        dt = time.perf_counter() - t0
        tempos.append(dt)

        if melhor:
            resultado = melhor.placa.valor
            ok = resultado == esperado
            conf = melhor.confianca
        else:
            resultado = "(nenhum)"
            ok = False
            conf = 0

        if ok:
            acertos += 1

        status = "OK" if ok else "FALHOU"
        print(f"  {f.name:20s} esperado={esperado:8s} obtido={resultado:8s} conf={conf:.4f} tempo={dt:.2f}s [{status}]")

    print(f"\n  Acertos: {acertos}/{len(fotos)}")
    if tempos:
        print(f"  Tempo medio: {sum(tempos)/len(tempos):.2f}s | min: {min(tempos):.2f}s | max: {max(tempos):.2f}s")
    return acertos, tempos


def main():
    photos_dir = Path(__file__).parent / "photos"

    print("Carregando modelo...")
    recognizer = PlacaRecognizer(lang="en")

    # Benchmark 1: fotos originais
    run_benchmark(recognizer, photos_dir, "Fotos originais")

    # Benchmark 2: fotos redimensionadas para 640px
    max_dim = 640
    tmpdir = Path(tempfile.mkdtemp())
    for f in sorted(photos_dir.glob("*.jpg")):
        img = cv2.imread(str(f))
        h, w = img.shape[:2]
        scale = min(1, max_dim / w, max_dim / h)
        small = cv2.resize(img, (round(w * scale), round(h * scale)))
        cv2.imwrite(str(tmpdir / f.name), small)
        print(f"  Resize: {w}x{h} -> {small.shape[1]}x{small.shape[0]}")

    run_benchmark(recognizer, tmpdir, f"Fotos redimensionadas (max {max_dim}px)")

    shutil.rmtree(tmpdir)


if __name__ == "__main__":
    main()
