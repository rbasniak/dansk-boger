#!/usr/bin/env python3
"""Build one self-contained HTML reader from the Danish Markdown sources."""
from html import escape
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
CHAPTERS = [('prolog', 'Prolog', 'texts/prolog.md'),
            ('kapitel-1', 'Kapitel 1 · A Long-expected Party', 'texts/kapitel-1.md')]

def slug(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', text).strip('-')

def render_chapter(chapter_id, title, filename):
    blocks = (ROOT / filename).read_text(encoding='utf-8').strip().split('\n\n')
    output, toc = [], []
    section_open = False
    paragraph_count = 0
    for block in blocks:
        if block.startswith('# '):
            continue
        if block.startswith('## '):
            if section_open:
                output.append('</section>')
            heading = block[3:].strip()
            section_id = f'{chapter_id}-{slug(heading)}'
            toc.append(f'<li><a href="#{section_id}">{escape(heading)}</a></li>')
            output.append(f'<section class="story-section" id="{section_id}"><h2>{escape(heading)}</h2>')
            section_open = True
            continue
        paragraph_count += 1
        paragraph_id = f'{chapter_id}-p{paragraph_count:03d}'
        poem = block.startswith('> ')
        text = '<br>'.join(escape(line.removeprefix('> ')) for line in block.splitlines()) if poem else escape(' '.join(block.splitlines()))
        output.append(f'''<div class="reading-paragraph{' poem' if poem else ''}" id="{paragraph_id}">
          <div class="paragraph-controls" lang="pt-BR">
            <button type="button" data-read="{paragraph_id}" aria-label="Ouvir parágrafo {paragraph_count}" title="Ouvir este parágrafo">▶</button>
            <button type="button" data-bookmark="{paragraph_id}" aria-label="Salvar ponto de leitura no parágrafo {paragraph_count}" title="Guardar meu ponto de leitura">◇</button>
          </div>
          <p class="paragraph-text">{text}</p>
        </div>''')
    if section_open:
        output.append('</section>')
    words = len(re.findall(r"\S+", ' '.join(block for block in blocks if not block.startswith('#'))))
    next_button = '<button type="button" data-chapter="kapitel-1">Próximo: Kapitel 1 →</button>' if chapter_id == 'prolog' else '<button type="button" data-chapter="prolog">← Voltar ao prólogo</button>'
    article = f'''<article class="chapter" id="{chapter_id}" data-title="{escape(title, quote=True)}" lang="da">
      <header class="chapter-heading">
        <span class="eyebrow" lang="pt-BR">The Lord of the Rings · Dinamarquês simplificado</span>
        <h1>{escape(title)}</h1>
        <p lang="pt-BR">{words:,} palavras · {paragraph_count} parágrafos · Nomes originais preservados</p>
      </header>
      {''.join(output)}
      <footer class="chapter-footer" lang="pt-BR">{next_button}<span>Fim do texto adaptado fornecido.</span></footer>
    </article>'''.replace(f'{words:,} palavras', f'{words:,}'.replace(',', '.') + ' palavras')
    return article, f'<ul class="toc-list" data-for="{chapter_id}">{"".join(toc)}</ul>'

def build():
    rendered = [render_chapter(*chapter) for chapter in CHAPTERS]
    css = (ROOT / 'assets/styles.css').read_text(encoding='utf-8')
    scripts = '\n'.join(f'<script>\n{(ROOT / f"assets/{filename}").read_text(encoding="utf-8")}\n</script>' for filename in
                        ['tts.js', 'reader.js', 'firebase-client.js', 'custom-words.js'])
    template = (ROOT / 'tools/reader-template.html').read_text(encoding='utf-8')
    for key, value in {'STYLES': css, 'STORIES': '\n'.join(item[0] for item in rendered),
                       'CONTENTS': '\n'.join(item[1] for item in rendered), 'SCRIPTS': scripts}.items():
        template = template.replace(f'{{{{{key}}}}}', value)
    (ROOT / 'index.html').write_text(template, encoding='utf-8')
    print(f'Built index.html ({len(template.encode()) // 1024} KiB).')

if __name__ == '__main__':
    build()
