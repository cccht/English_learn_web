"""Regenerate small, original PDF fixtures; requires reportlab and Pillow."""
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib.pdfencrypt import StandardEncryption

ROOT = Path(__file__).parent
LINES = [
    "PDF Import Test",
    "Part III Reading Comprehension",
    "Passage One",
    "The library opens at nine and closes at six.",
    "Students visit the library to read and study together.",
    "1. When does the library open?",
    "A) At eight. B) At nine. C) At ten. D) At eleven.",
    "2. When does the library close?",
    "A) At four.",
    "B) At five.",
    "C) At six.",
    "D) At seven.",
    "3. What do students do in the library?",
    "A) Read. B) Swim. C) Drive. D) Cook.",
]

def text_page(pdf, lines):
    pdf.setFont("Helvetica", 12)
    for index, line in enumerate(lines):
        pdf.drawString(48, 790 - index * 28, line)
    pdf.showPage()

pdf = canvas.Canvas(str(ROOT / "text-paper.pdf"), pagesize=(595, 842), invariant=1)
text_page(pdf, LINES)
text_page(pdf, ["Part I Writing", "Directions: Write a short paragraph about learning.", "Describe one benefit of reading books.", "Answer Key", "1. B   2. C"])
pdf.save()

image = Image.new("RGB", (1654, 2339), "white")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
for index, line in enumerate(LINES):
    draw.text((100, 130 + index * 76), line, font=font, fill="black")
pdf = canvas.Canvas(str(ROOT / "scanned-paper.pdf"), pagesize=(595, 842), invariant=1)
pdf.drawImage(ImageReader(image), 0, 0, width=595, height=842)
pdf.showPage()
pdf.save()

pdf = canvas.Canvas(str(ROOT / "encrypted-paper.pdf"), pagesize=(595, 842), invariant=1, encrypt=StandardEncryption("fixture-password"))
text_page(pdf, LINES)
pdf.save()

pdf = canvas.Canvas(str(ROOT / "too-many-pages.pdf"), pagesize=(595, 842), invariant=1)
for _ in range(81):
    pdf.drawString(48, 790, "An intentionally oversized page-count fixture.")
    pdf.showPage()
pdf.save()
