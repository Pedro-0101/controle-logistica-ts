"""Benchmark com YOLO + PaddleOCR."""

import os, sys
os.environ.setdefault('PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT', 'False')
os.environ.setdefault('PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'True')

import time, cv2
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.anpr.recognizer import PlacaRecognizer


def main():
    photos_dir = Path(__file__).parent / "photos"

    print("Carregando modelos (YOLO + PaddleOCR)...")
    t0 = time.perf_counter()
    recognizer = PlacaRecognizer(lang="en")
    print(f"Modelos carregados em {time.perf_counter() - t0:.2f}s\n")

    acertos = 0
    tempos = []
    fotos = sorted(photos_dir.glob("*.jpg"))

    print(f"{'='*70}")
    print(f" YOLO + PaddleOCR (pipeline em 2 estagios)")
    print(f"{'='*70}")

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


if __name__ == "__main__":
    main()
