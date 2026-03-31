# QR-Bill Fonts Intake

Place the QR-bill font files in this folder.

Recommended font files to provide:
- FrutigerLTStd-Roman.otf (or .ttf)
- FrutigerLTStd-Bold.otf (or .ttf)

Good fallback alternatives (if Frutiger licensing is not available):
- HelveticaNeue-Regular.ttf
- HelveticaNeue-Bold.ttf

Optional (only if you later want OCR-specific rendering for references):
- OCRB-Regular.ttf

Notes:
- Current template already falls back to Helvetica/Arial if Frutiger is not available.
- If you want these exact files embedded into PDF output, next step is wiring @font-face with local file loading from this folder.
