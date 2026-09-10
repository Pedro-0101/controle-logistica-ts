"""Diagnóstico: o que o OCR realmente vê nas fotos reais."""

import os
from pathlib import Path

os.environ.setdefault("PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT", "False")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

import cv2
from paddleocr import PaddleOCR

PHOTOS_DIR = Path(__file__).parent / "photos"


def main() -> None:
    ocr = PaddleOCR(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        lang="en",
    )

    for Path_foto in sorted(PHOTOS_DIR.glob("*.jpg")):
        esperado = Path_foto.stem.upper()
        img = cv2.imread(str(Path_foto))
        h, w = img.shape[:2]
        print(f"\n{Path_foto.name} ({w}x{h}) esperado={esperado}")

        res = ocr.predict(img)
        if not res:
            print("  nenhum resultado")
            continue

        textos = res[0].get("rec_texts", [])
        scores = res[0].get("rec_scores", [])
        boxes = res[0].get("rec_boxes") or res[0].get("rec_polys", [])

        for i, (txt, score) in enumerate(zip(textos, scores)):
            box_info = ""
            if i < len(boxes):
                b = boxes[i]
                box_info = f" box={[round(v, 1) for v in b]}"
            print(f"  [{i}] \"{txt}\" conf={score:.4f}{box_info}")


if __name__ == "__main__":
    main()
