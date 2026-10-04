from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader
base = Path('/home/ubuntter/Projects/PewnySzlak/docs/pitch')
output = base / 'output' / 'PewnySzlak-Pitch-PL.pdf'
c = canvas.Canvas(str(output), pagesize=(960,540), pageCompression=1)
c.setTitle('PewnySzlak — Kraków w Twoim tempie')
c.setAuthor('Zespół PewnySzlak')
c.setSubject('HackYeah 2026 — Kraków bez barier. Problem, rozwiązanie i demo.')
for i in range(1,11):
    c.drawImage(ImageReader(str(base / '.build' / f'slide-{i:02}.png')),0,0,width=960,height=540)
    c.showPage()
c.save()
print(f'PDF: {output}; pages: {len(PdfReader(output).pages)}')
