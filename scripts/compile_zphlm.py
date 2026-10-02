#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Compile ZP HLM EPUB into Reader Content & Metadata
Strictly preserves verbatim Traditional Chinese text.
"""

import os
import sys
import json
import re
from html.parser import HTMLParser

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SCRATCH_DIR = '/Users/ylsuen/.gemini/antigravity/brain/ec51b1ad-1a4f-4cc4-8116-2daf86189adc/scratch/hlm_epub'
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
CHAPTERS_DIR = os.path.join(PUBLIC_DIR, 'chapters')
SRC_DIR = os.path.join(BASE_DIR, 'src')

os.makedirs(CHAPTERS_DIR, exist_ok=True)
os.makedirs(SRC_DIR, exist_ok=True)

class ChapterHTMLParser(HTMLParser):
    def __init__(self, chapter_id):
        super().__init__()
        self.chapter_id = chapter_id
        self.segments = []
        self.current_tag = None
        self.current_attrs = {}
        self.current_html = []
        self.current_text = []
        self.in_p = False
        self.in_heading = False
        self.heading_tag = ''
        self.heading_html = []
        self.heading_text = []
        self.chapter_title = ''
        self.p_class = ''
        self.span_stack = []
        self.seg_index = 0
        self.current_img_alt = ''

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        self.current_tag = tag
        self.current_attrs = attrs_dict

        if tag in ['h2', 'h3', 'h4']:
            self.in_heading = True
            self.heading_tag = tag
            self.heading_html = []
            self.heading_text = []
        elif tag == 'p':
            self.in_p = True
            self.p_class = attrs_dict.get('class', '')
            self.current_html = []
            self.current_text = []
            self.current_img_alt = ''
        elif self.in_p:
            if tag == 'span':
                cls = attrs_dict.get('class', '')
                self.span_stack.append(cls)
                if any(k in cls for k in ['small', 'small1', 'small2', 'small3', 'red']):
                    self.current_html.append('<span class="zp-comment">')
                else:
                    self.current_html.append('<span>')
            elif tag == 'sup':
                self.current_html.append('<sup class="zp-note-ref">')
            elif tag == 'img':
                src = attrs_dict.get('src', '')
                alt = attrs_dict.get('alt', '')
                base_img = os.path.basename(src)
                if base_img in ['00018.jpeg', '00018.webp']:
                    self.current_img_alt = alt or '通靈寶玉正面圖'
                    self.current_html.append(f'<img src="/assets/images/00018.webp" class="zp-illustration" alt="{self.current_img_alt}"/>')
                elif base_img in ['00019.jpeg', '00019.webp']:
                    self.current_img_alt = alt or '通靈寶玉反面圖'
                    self.current_html.append(f'<img src="/assets/images/00019.webp" class="zp-illustration" alt="{self.current_img_alt}"/>')
                elif alt in ['甲戌本', '己卯本', '庚辰本', '戚序本', '蒙府本', '列藏本', '楊藏本', '甲辰本']:
                    self.current_html.append(f'<span class="zp-version-tag">{alt}</span>')
                elif alt in ['眉批', '側批', '夾批', '雙行夾批', '回末總評', '回前總評']:
                    self.current_html.append(f'<span class="zp-type-tag">{alt}</span>')
                else:
                    self.current_html.append(f'<img src="/assets/images/{base_img}" class="zp-glyph" alt="{alt}"/>')
            elif tag == 'strong':
                self.current_html.append('<strong>')
            elif tag == 'em':
                self.current_html.append('<em>')
            elif tag == 'br':
                self.current_html.append('<br/>')

    def handle_endtag(self, tag):
        if tag in ['h2', 'h3', 'h4']:
            self.in_heading = False
            h_text = ''.join(self.heading_text).strip()
            h_html = ''.join(self.heading_html).strip()
            if not self.chapter_title:
                self.chapter_title = h_text
            else:
                if h_text:
                    self.seg_index += 1
                    self.segments.append({
                        'id': f'{self.chapter_id}-{self.seg_index}',
                        'type': 'heading',
                        'heading_level': self.heading_tag,
                        'zh': h_text,
                        'zh_hant': h_text,
                        'zh_hans': h_text,
                        'html': f'<{self.heading_tag} class="zp-subheading">{h_html}</{self.heading_tag}>',
                        'en': ''
                    })
        elif tag == 'p':
            if self.in_p:
                self.in_p = False
                html_str = ''.join(self.current_html).strip()
                text_str = ''.join(self.current_text).strip()
                # Clean pure whitespace / fullwidth space
                clean_text = re.sub(r'[\s\u3000]+', '', text_str)

                if not clean_text:
                    if self.current_img_alt:
                        clean_text = f"〔{self.current_img_alt}〕"
                        text_str = clean_text

                if clean_text:
                    seg_type = 'text'
                    if 'msonormal' in self.p_class:
                        seg_type = 'poem'
                    elif '〔' in text_str and ('〕' in text_str or '原作' in text_str):
                        seg_type = 'note'
                    elif 'right' in self.p_class:
                        seg_type = 'sign'
                    elif 'quote' in self.p_class:
                        seg_type = 'box'

                    self.seg_index += 1
                    self.segments.append({
                        'id': f'{self.chapter_id}-{self.seg_index}',
                        'type': seg_type,
                        'zh': text_str,
                        'zh_hant': text_str,
                        'zh_hans': text_str,
                        'html': html_str,
                        'en': ''
                    })
        elif self.in_p:
            if tag == 'span':
                if self.span_stack:
                    self.span_stack.pop()
                self.current_html.append('</span>')
            elif tag == 'sup':
                self.current_html.append('</sup>')
            elif tag == 'strong':
                self.current_html.append('</strong>')
            elif tag == 'em':
                self.current_html.append('</em>')

    def handle_data(self, data):
        if self.in_heading:
            self.heading_html.append(data)
            self.heading_text.append(data)
        if self.in_p:
            self.current_html.append(data)
            self.current_text.append(data)


UNIT_DEFS = [
    {
        'id': 'intro',
        'file': 'text/part0002.html',
        'section': '整理說明',
        'label': '序',
        'title': '《紅樓夢脂評匯校本》整理說明',
        'author': '吳銘恩',
        'year': '2014',
        'blurb': '本書校勘體例、底本選取依據及參校本詳細說明。'
    },
    {
        'id': 'fanli',
        'file': 'text/part0004.html',
        'section': '凡例',
        'label': '凡例',
        'title': '脂硯齋重評石頭記凡例',
        'author': '脂硯齋',
        'year': '清',
        'blurb': '紅樓夢早期抄本卷首凡例五則與題詩。'
    }
]

for i in range(1, 81):
    part_file = f'text/part{i+4:04d}.html'
    UNIT_DEFS.append({
        'id': f'c{i:02d}',
        'file': part_file,
        'section': '前八十回正文',
        'label': f'第{i}回',
        'title': '', # will extract from h2
        'author': '曹雪芹 著 / 脂硯齋 評',
        'year': '清',
        'blurb': f'紅樓夢第{i}回，匯集脂硯齋諸本批語對勘。'
    })

UNIT_DEFS.extend([
    {
        'id': 'app01',
        'file': 'text/part0085_split_001.html',
        'section': '附錄文獻',
        'label': '附一',
        'title': '附錄一　《紅樓夢》各抄本收藏者序跋',
        'author': '劉銓福 / 戚蓼生 / 舒元煒 / 夢覺主人',
        'year': '清',
        'blurb': '存世主要脂評抄本收藏者題跋與序言彙編。'
    },
    {
        'id': 'app02',
        'file': 'text/part0086_split_001.html',
        'section': '附錄文獻',
        'label': '附二',
        'title': '附錄二　存世脂評系統《紅樓夢》版本簡介',
        'author': '吳銘恩',
        'year': '2014',
        'blurb': '甲戌、己卯、庚辰、戚本、蒙府、列藏等十種脂本詳細源流。'
    },
    {
        'id': 'app03',
        'file': 'text/part0087_split_001.html',
        'section': '附錄文獻',
        'label': '附三',
        'title': '附錄三　毛國瑤抄錄靖藏本批語一百五十條',
        'author': '毛國瑤 輯 / 吳銘恩 校',
        'year': '2014',
        'blurb': '靖藏本失蹤前抄錄存世之150條珍貴批語輯錄。'
    },
    {
        'id': 'notes',
        'file': 'text/part0088.html',
        'section': '校讀札記',
        'label': '札記',
        'title': '《紅樓夢脂評匯校本》校讀札記',
        'author': '吳銘恩',
        'year': '2014',
        'blurb': '吳銘恩先生校讀過程中的十三篇專題考證與辨析。'
    },
    {
        'id': 'about',
        'file': 'text/part0001.html',
        'section': '出版說明',
        'label': '版權',
        'title': '版權與出版說明',
        'author': '浙江出版集團',
        'year': '2014',
        'blurb': '本書數字出版沿革、校點製作與版權說明。'
    }
])

def main():
    chapters_meta = []
    learning_units = []
    page_index_chapters = []
    segment_index = []
    allowlist_segments = []
    segment_chapter_map = {}

    total_words = 0
    total_segments = 0

    for idx, udef in enumerate(UNIT_DEFS, start=1):
        fpath = os.path.join(SCRATCH_DIR, udef['file'])
        with open(fpath, 'r', encoding='utf-8') as f:
            raw_html = f.read()

        parser = ChapterHTMLParser(udef['id'])
        parser.feed(raw_html)

        title = parser.chapter_title or udef['title']
        title = re.sub(r'\s+', '　', title.strip())
        udef['title'] = title

        seg_count = len(parser.segments)
        word_count = sum(len(s['zh']) for s in parser.segments)
        total_segments += seg_count
        total_words += word_count

        # Write chapter JSON
        chap_out = os.path.join(CHAPTERS_DIR, f"{udef['id']}.json")
        with open(chap_out, 'w', encoding='utf-8') as f:
            json.dump(parser.segments, f, ensure_ascii=False, indent=2)

        # Meta for content.js
        chapters_meta.append({
            'id': udef['id'],
            'section': udef['section'],
            'section_hant': udef['section'],
            'section_hans': udef['section'],
            'label': udef['label'],
            'label_hant': udef['label'],
            'label_hans': udef['label'],
            'zh': title,
            'zh_hant': title,
            'zh_hans': title,
            'author': udef['author'],
            'author_hant': udef['author'],
            'author_hans': udef['author'],
            'year': udef['year'],
            'blurb': udef['blurb'],
            'blurb_hant': udef['blurb'],
            'blurb_hans': udef['blurb'],
            'en': '',
            'segmentCount': seg_count,
            'wordCount': word_count
        })

        # Learning manifest unit
        req_segs = max(1, int(seg_count * 0.8))
        learning_units.append({
            'id': udef['id'],
            'title': title,
            'title_hans': title,
            'section': udef['section'],
            'section_hans': udef['section'],
            'order': idx,
            'segmentCount': seg_count,
            'wordCount': word_count,
            'requiredSegments': req_segs
        })

        # Page index
        page_index_chapters.append({
            'id': udef['id'],
            'title': title,
            'section': udef['section'],
            'segmentCount': seg_count
        })

        # Segment index & allowlist
        for seg in parser.segments:
            allow_id = f"zphlm:{udef['id']}:{seg['id']}"
            allowlist_segments.append(allow_id)
            segment_chapter_map[allow_id] = udef['id']
            segment_index.append({
                'id': seg['id'],
                'allowId': allow_id,
                'chapterId': udef['id'],
                'type': seg['type'],
                'chars': len(seg['zh'])
            })

    # Generate content.js
    book_meta = {
        'meta': {
            'id': 'zphlm',
            'zhTitle': '紅樓夢脂評匯校本',
            'zhTitle_hant': '紅樓夢脂評匯校本',
            'zhTitle_hans': '紅樓夢脂評匯校本',
            'enTitle': 'The Story of the Stone: Zhiyanzhai Annotated & Collated Master Edition',
            'author': '曹雪芹 著 / 脂硯齋 評 / 吳銘恩 匯校',
            'author_hant': '曹雪芹 著 / 脂硯齋 評 / 吳銘恩 匯校',
            'author_hans': '曹雪芹 著 / 脂硯齋 評 / 吳銘恩 匯校',
            'year': '清 · 2014',
            'totalChapters': len(UNIT_DEFS),
            'totalSegments': total_segments,
            'totalWords': total_words,
            'tagline': '「滿紙荒唐言，一把辛酸淚。都云作者痴，誰解其中味？」脂硯齋、畸笏叟評語全輯，吳銘恩八十回匯校善本。',
            'about': [
                '《紅樓夢脂評匯校本》由吳銘恩先生歷時數載匯校而成，以甲戌本、己卯本、庚辰本、戚序本、蒙府本、列藏本、楊藏本、甲辰本等八種主要脂評抄本對勘，擇優而從。',
                '全書完整收錄脂硯齋、畸笏叟、梅溪、松齋等人的全部朱批、墨批、側批、眉批、雙行夾批與回末回前總評，是研讀《紅樓夢》脂本藝術與紅學考證的權威善本。',
                '本站嚴格保留繁體原貌，完整收錄卷首凡例、前八十回正文、各抄本收藏者序跋、版本源流考、靖藏本批語150條及校讀札記，支持雙擊評點、朱墨批語切換與純淨閱讀。'
            ],
            'howto': '輕點朱墨評點查看批語，點擊段落右側可添加心得。支持字體縮放、羊皮紙底色與純淨模式。',
            'credit': '文字內容校勘版權屬吳銘恩先生所有，數字版權屬浙江出版集團數字傳媒有限公司。本站由北大附中經典閱讀共讀平台維護，僅供校園教學與學術研討。',
            'layout': 'prose',
            'theme': {
                'paper': '#faf6ed',
                'paper_2': '#ede3d2',
                'card': '#fdfaf2',
                'cinnabar': '#991b1e',
                'cinnabar_2': '#7f1d1d',
                'cinnabar_glow': 'rgba(153,27,30,.15)',
                'ink': '#1c1917',
                'ink_soft': '#44403c',
                'ink_faint': '#78716c',
                'line': '#e5dcce',
                'line_soft': '#eee7db'
            }
        },
        'chapters': chapters_meta
    }

    with open(os.path.join(PUBLIC_DIR, 'content.js'), 'w', encoding='utf-8') as f:
        f.write('window.BOOK = ' + json.dumps(book_meta, ensure_ascii=False, indent=2) + ';\n')

    # Generate learning-manifest.json & .js
    learning_manifest_data = {
        'edition': '2014',
        'bookId': 'zphlm',
        'totalChapters': len(UNIT_DEFS),
        'totalSegments': total_segments,
        'totalWords': total_words,
        'units': learning_units
    }
    with open(os.path.join(PUBLIC_DIR, 'learning-manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(learning_manifest_data, f, ensure_ascii=False, indent=2)

    with open(os.path.join(PUBLIC_DIR, 'learning-manifest.js'), 'w', encoding='utf-8') as f:
        f.write('window.LEARNING_MANIFEST = ' + json.dumps(learning_manifest_data, ensure_ascii=False, indent=2) + ';\n')

    # Generate page-index.json
    page_index_data = {
        'book': 'zphlm',
        'chapters': page_index_chapters
    }
    with open(os.path.join(PUBLIC_DIR, 'page-index.json'), 'w', encoding='utf-8') as f:
        json.dump(page_index_data, f, ensure_ascii=False, indent=2)

    # Generate segment-index.json
    with open(os.path.join(PUBLIC_DIR, 'segment-index.json'), 'w', encoding='utf-8') as f:
        json.dump(segment_index, f, ensure_ascii=False, indent=2)

    # Generate manifest.json
    pwa_manifest = {
        'name': '紅樓夢脂評匯校本',
        'short_name': '脂評紅樓夢',
        'key': 'zphlm',
        'description': '曹雪芹著 · 脂硯齋評 · 吳銘恩匯校《紅樓夢脂評匯校本》八十回全本共讀',
        'start_url': '/',
        'display': 'standalone',
        'background_color': '#faf6ed',
        'theme_color': '#991b1e',
        'coverAsset': {
            'publicFile': 'assets/cover.webp'
        },
        'publicationBoundary': {
            'sourceDocumentsPublished': False,
            'fullPageRendersPublished': False
        },
        'counts': {
            'chapters': len(UNIT_DEFS),
            'segments': total_segments
        },
        'icons': [
            {
                'src': 'https://img.bdfz.net/20250503004.webp',
                'sizes': '192x192',
                'type': 'image/webp'
            }
        ]
    }
    with open(os.path.join(PUBLIC_DIR, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(pwa_manifest, f, ensure_ascii=False, indent=2)

    # Generate src/content-allowlist.js
    with open(os.path.join(SRC_DIR, 'content-allowlist.js'), 'w', encoding='utf-8') as f:
        f.write('// Auto-generated content allowlist for zphlm\n')
        f.write('export const ALLOWED_SEGMENTS = new Set([\n')
        for seg_id in allowlist_segments:
            f.write(f'  {json.dumps(seg_id)},\n')
        f.write(']);\n\n')
        f.write('export const SEGMENT_CHAPTER = {\n')
        for seg_id, ch_id in segment_chapter_map.items():
            f.write(f'  {json.dumps(seg_id)}: {json.dumps(ch_id)},\n')
        f.write('};\n')

    print(f"Compilation finished successfully!")
    print(f"Total Chapters/Units: {len(UNIT_DEFS)}")
    print(f"Total Segments: {total_segments}")
    print(f"Total Words/Chars: {total_words}")

if __name__ == '__main__':
    main()
