"""Build the public resume from shared JSON using only the Python standard library."""
import json
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'src/data/resume.json').read_text())
output = ROOT / 'public/Riwaj-Mainali-Resume.pdf'
commands = ['1 1 1 rg 0 0 612 792 re f']
annotations = []
y = 748


def pdf_string(value):
    return '(' + value.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)') + ')'


def text(value, size=10, bold=False, color='0.12 0.14 0.15', x=45):
    global y
    font = 'F2' if bold else 'F1'
    commands.append(f'BT /{font} {size} Tf {color} rg 1 0 0 1 {x} {y} Tm {pdf_string(value)} Tj ET')
    y -= size + 4


def paragraph(value, bullet=False):
    global y
    width = 83 if bullet else 87
    lines = textwrap.wrap(value, width=width, break_long_words=False, break_on_hyphens=False)
    for index, line in enumerate(lines):
        text(('- ' if index == 0 else '  ') + line if bullet else line)
    y -= 3


def heading(value):
    global y
    y -= 7
    text(value, size=10, bold=True, color='0.12 0.32 0.25')
    commands.append(f'0.75 0.8 0.78 RG 0.5 w 45 {y + 4} m 567 {y + 4} l S')
    y -= 7


text(data['name'], size=24, bold=True, color='0.08 0.2 0.16')
text(data['headline'], size=10, bold=True)
for label, url, x in [('LinkedIn / contact', data['linkedin'], 45), ('riwaj.me', data['website'], 200), ('GitHub', data['github'], 290)]:
    commands.append(f'BT /F1 9 Tf 0.12 0.32 0.25 rg 1 0 0 1 {x} {y} Tm {pdf_string(label)} Tj ET')
    annotations.append(f'<< /Type /Annot /Subtype /Link /Rect [{x} {y - 2} {x + len(label) * 5.4} {y + 10}] /Border [0 0 0] /A << /S /URI /URI {pdf_string(url)} >> >>')
y -= 25
paragraph(data['summary'])
heading('EXPERIENCE')
for job in data['experience']:
    text(job['title'], size=10, bold=True)
    text(f"{job['organization']} | {job['dates']}", size=9)
    y -= 2
    for bullet in job['bullets']:
        paragraph(bullet, bullet=True)
    y -= 5
heading('EDUCATION')
for education in data['education']:
    text(education['institution'], size=10, bold=True)
    text(education['degree'], size=9)
    text(education['dates'] + (' | ' + education['detail'] if education['detail'] else ''), size=9)
    y -= 2
heading('TECHNICAL SKILLS')
paragraph(' | '.join(data['skills']))
heading('SELECTED PROJECTS')
for project in data['projects']:
    text(project['name'], size=10, bold=True)
    paragraph(project['description'])

if y < 36:
    raise ValueError(f'Resume overflows the one-page layout (bottom={y}); shorten content before building.')
stream = '\n'.join(commands).encode('cp1252')
annotation_refs = ' '.join(f'{8 + index} 0 R' for index in range(len(annotations)))
objects = [
    b'<< /Type /Catalog /Pages 2 0 R >>',
    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R /Annots [{annotation_refs}] >>'.encode(),
    b'<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    b'<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>',
    f'<< /Length {len(stream)} >>\nstream\n'.encode() + stream + b'\nendstream',
    f'<< /Title {pdf_string(data["name"] + " - Resume")} /Author {pdf_string(data["name"])} >>'.encode('cp1252'),
    *(item.encode('cp1252') for item in annotations),
]
pdf = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
offsets = [0]
for index, item in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf.extend(f'{index} 0 obj\n'.encode() + item + b'\nendobj\n')
xref = len(pdf)
pdf.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
for offset in offsets[1:]:
    pdf.extend(f'{offset:010d} 00000 n \n'.encode())
pdf.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R /Info 7 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
output.write_bytes(pdf)
print(f'{output}: 1 page, {len(pdf)} bytes, content bottom {y}pt')
