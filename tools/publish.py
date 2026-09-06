# -*- coding: utf-8 -*-
"""Собирает витрину: копирует человеческую зону knowledge в data/ и пишет индекс.

Поток строго в одну сторону: knowledge → memory. Здесь ничего не правится руками,
всё содержимое data/notes перезаписывается при каждом запуске.

    python tools/publish.py [путь-до-knowledge]

Что публикуется, задано белым списком, а не чёрным. Это принципиально: при чёрном
списке новая папка в knowledge уезжает наружу молча, а забыть добавить строку
в белый список — значит всего лишь не опубликовать её.
"""
import json
import pathlib
import re
import shutil
import sys
from datetime import datetime

# Консоль здесь в кодировке Windows: без этого русский вывод в лучшем случае
# нечитаем, а в худшем роняет скрипт с UnicodeEncodeError.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = pathlib.Path(__file__).resolve().parent.parent
KNOWLEDGE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                         else r"C:\Users\Admin\Desktop\knowledge")

# Белый список: что вообще может уехать наружу.
# Шаблоны идут вглубь нарочно. Плоский список уже подвёл однажды: зачётные работы
# переехали в `tex/documents/zachet/`, и три опубликованных документа молча
# исчезли с сайта — шаблон смотрел только в саму `documents`.
#
# Правило теперь такое: раздел перечисляется здесь один раз и целиком, а новая
# подпапка внутри него работает сама, без единой правки кода. Новый раздел
# верхнего уровня по-прежнему требует строки — это и есть остаток защиты
# от того, чтобы что-то уехало наружу молча.
INCLUDE = [
    "physics/**/*.md",
    "math/**/*.md",
    "ml/**/*.md",
    "manim/**/*.md",
    "web/**/*.md",
    "tex/**/*.md",
    "tex/**/*.pdf",
    "assets/**/*",
]

# algo/ наружу не идёт: это архив решённого, а не то, что читают с телефона.
# Приём из решения, оказавшийся общим, попадает на сайт через базу приёмов.

# Не публикуется намеренно. Список нужен не только сборке: без него отчёт о том,
# что не попало на сайт, каждый раз показывал бы одни и те же семь строк — а
# предупреждение, которое горит всегда, читать перестают. Здесь всё, про что уже
# решено «наружу не идёт», и тогда непустой отчёт означает настоящую пропажу.
EXCLUDE_DIRS = (
    "tex/drafts",     # черновики, вытесненные чистовиком
    "tex/notes",      # планы работ, а не работы
    "tex/reference",  # чужие материалы, см. EXCLUDE
    "templates",      # заготовки для новых заметок, читать их незачем
    "publish",        # как устроена публикация — служебное
    "algo",           # архив решённого; приёмы оттуда идут через базу приёмов
    "math/serii",     # условия серий: материалы кружка, а не свои
)

# Изъятия внутри белого списка — по конкретной причине у каждого.
EXCLUDE = {
    # Конспект в соавторстве: публикация делает публичной и чужую часть.
    # Снять запрет можно только после разговора с соавтором.
    "tex/reference/veroyatnost.pdf",
    # README самого репозитория — про его устройство, а не про знания.
    "README.md",
    # Сам сборник — изданная книга под копирайтом МЦНМО. В приватном репозитории
    # она лежит для личной работы, на публичный сайт ей нельзя.
    "physics/sbornik.pdf",
}

# Служебное и черновое наружу не идёт вовсе — этого нет и в белом списке,
# перечислено для ясности: .claude/, publish/, templates/, tex/drafts/, tex/notes/.


def parse_frontmatter(text):
    """Минимальный разбор YAML-шапки: скаляры и плоские списки.

    Свой, а не PyYAML: полей десяток, они описаны в templates/, и лишняя
    зависимость ради них не окупается.
    """
    m = re.match(r"^\ufeff?---\r?\n(.*?)\r?\n---\r?\n?", text, re.S)
    if not m:
        return {}, text
    body = text[m.end():]
    fm = {}
    key = None
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        if line.startswith("-") and key:                      # пункт списка
            fm.setdefault(key, [])
            if isinstance(fm[key], list):
                fm[key].append(line.lstrip("- ").strip())
            continue
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key, val = key.strip(), val.strip()
        if val in ("", "[]"):
            fm[key] = [] if val == "[]" else ""
        elif val.startswith("[") and val.endswith("]"):
            fm[key] = [v.strip() for v in val[1:-1].split(",") if v.strip()]
        elif re.fullmatch(r"-?\d+", val):
            fm[key] = int(val)
        else:
            fm[key] = val.strip("\"'")
    return fm, body


CODE = re.compile(r"```.*?```|`[^`\n]*`", re.S)
WIKI = re.compile(r"\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]")


def wiki_targets(body):
    """Имена, на которые заметка ссылается. Код вырезается: в примерах кода
    квадратные скобки означают что угодно, только не ссылку."""
    return sorted({m.group(1).strip() for m in WIKI.finditer(CODE.sub("", body))})


def title_of(fm, body, path):
    m = re.search(r"^#\s+(.+)$", body, re.M)
    if m:
        return m.group(1).strip()
    for field in ("tema", "title"):
        if fm.get(field):
            return str(fm[field])
    return path.stem


def pdf_pages(path):
    """Сколько страниц в PDF.

    Считаем объекты страниц прямо в файле. Способ грубый: если PDF сжат в объектные
    потоки, объекты в тексте не видны и счёт даст ноль. Для latexmk этого хватает,
    а ноль на странице просто не показывается — врать числом хуже, чем молчать.
    """
    try:
        raw = path.read_bytes()
    except OSError:
        return 0
    return len(re.findall(rb"/Type\s*/Page[^s]", raw))


def tex_title(path):
    """Название конспекта из титульного блока.

    Команды \\title в этих документах нет: титул набран вручную — центрированный
    блок, где название разбито на строки, и у каждой строки свой размер шрифта.
    Поэтому берём текст всех кусков после \\bfseries внутри первого титульного
    блока и склеиваем. Не нашлось — вернём пусто, и подписью станет имя файла.
    """
    src = path.read_text(encoding="utf-8", errors="replace")
    start = src.find(r"\begin{document}")
    if start < 0:
        return ""

    body = src[start:]
    end = min((body.find(m) for m in (r"\end{titlepage}", r"\end{center}",
                                      r"\section") if body.find(m) > 0),
              default=len(body))
    parts = re.findall(r"\\bfseries\s+([^}\\]+)", body[:end])
    return " ".join(p.strip() for p in parts if p.strip())[:80]


def tex_documents():
    """Список конспектов: исходник и собранный PDF рядом.

    Берётся прямо из папки, а не из заметок: заводить карточку на каждый документ
    значило бы держать в двух местах то, что и так видно в файлах.
    """
    src = KNOWLEDGE / "tex" / "documents"
    if not src.is_dir():
        return []

    out = []
    # вглубь: конспекты собираются в подпапки-проекты, и каждая такая папка —
    # своя группа в списке, со своим README вместо заголовка
    for tex in sorted(src.rglob("*.tex")):
        # рисунки подключаются в основной документ, отдельным конспектом не являются
        if tex.stem.endswith("_figs") or tex.stem == "template":
            continue
        rel = tex.relative_to(KNOWLEDGE).as_posix()
        group = tex.parent.relative_to(src).as_posix()
        rel_pdf = rel[:-4] + ".pdf"
        out.append({
            "title": tex_title(tex) or tex.stem,
            "tex": tex.name,
            "group": "" if group == "." else group,
            # PDF показывается, только если он собран и не изъят белым списком
            "pdf": rel_pdf if (tex.with_suffix(".pdf").exists()
                               and rel_pdf not in EXCLUDE) else "",
        })
    return out


def skipped(rel):
    """Файл под шаблон попал, но публиковать его не надо."""
    return rel in EXCLUDE or rel.startswith(tuple(d + "/" for d in EXCLUDE_DIRS))


def collect():
    seen, notes, files = set(), [], []
    for pattern in INCLUDE:
        for src in sorted(KNOWLEDGE.glob(pattern)):
            if not src.is_file():
                continue
            rel = src.relative_to(KNOWLEDGE).as_posix()
            if skipped(rel) or rel in seen:
                continue
            seen.add(rel)

            dst = HERE / "data" / "notes" / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)

            folder = str(pathlib.PurePosixPath(rel).parent)
            folder = "" if folder == "." else folder

            if src.suffix == ".md":
                fm, body = parse_frontmatter(src.read_text(encoding="utf-8"))
                notes.append({
                    "path": rel,
                    "folder": folder,
                    "title": title_of(fm, body, src),
                    "fm": fm,
                    "links": wiki_targets(body),
                })
            elif src.suffix == ".pdf":
                files.append({
                    "path": rel,
                    "folder": folder,
                    "title": src.stem,
                    "kind": "pdf",
                    "pages": pdf_pages(src),
                    "size": src.stat().st_size,
                })
    return notes, files, seen


def unpublished(seen):
    """Файлы зоны владельца, не попавшие ни под один шаблон.

    Нужно затем, чтобы «на сайте этого нет» перестало быть тихой пропажей.
    Раздел, забытый в белом списке, ничем себя не выдаёт: сайт просто не
    показывает содержимое, и заметить это можно только случайно.
    """
    out = []
    for src in sorted(KNOWLEDGE.rglob("*")):
        if not src.is_file():
            continue
        rel = src.relative_to(KNOWLEDGE).as_posix()
        # служебная зона и внутренности git наружу не идут по устройству
        if rel.startswith((".claude/", ".git/", ".idea/")):
            continue
        if src.suffix.lower() not in (".md", ".pdf"):
            continue
        if rel in seen or skipped(rel):
            continue
        out.append(rel)
    return out


def stamp_html(build):
    """Метка сборки в странице. По ней страница из кэша понимает, что она старая:
    сверяет себя с config.json, который тянется мимо кэша, и перезагружается."""
    page = HERE / "index.html"
    text = page.read_text(encoding="utf-8")
    text = re.sub(r'(\?v=)[0-9A-Za-z]+', r"\g<1>" + build, text)
    text = re.sub(r'(<meta name="build" content=")[0-9A-Za-z]+(")',
                  r"\g<1>" + build + r"\g<2>", text)
    page.write_text(text, encoding="utf-8", newline="\n")


def main():
    if not KNOWLEDGE.is_dir():
        sys.exit("не найден knowledge: %s" % KNOWLEDGE)

    out = HERE / "data" / "notes"
    if out.exists():
        shutil.rmtree(out)          # копия целиком перестраивается: удалённое в
    out.mkdir(parents=True)          # knowledge должно исчезнуть и здесь

    notes, files, seen = collect()
    tex = tex_documents()
    build = datetime.now().strftime("%Y%m%d%H%M")

    (HERE / "data" / "index.json").write_text(
        json.dumps({"notes": notes, "files": files, "tex": tex},
                   ensure_ascii=False, indent=1),
        encoding="utf-8", newline="\n")

    config = {
        "title": "Хранилище",
        "subtitle": "приёмы, разборы, конспекты",
        "noindex": True,
        "build": build,
    }
    (HERE / "data" / "config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8", newline="\n")

    stamp_html(build)

    linked = sum(len(n["links"]) for n in notes)
    print("сборка %s: заметок %d, PDF %d, конспектов TeX %d, вики-ссылок %d"
          % (build, len(notes), len(files), len(tex), linked))
    if notes and not linked:
        print("связей между заметками нет — обратные ссылки будут пустыми")

    # Содержимое есть, а на сайте его нет — это должно быть видно сразу,
    # а не выясняться через месяц.
    lost = unpublished(seen)
    if lost:
        print("\nне попало на сайт (%d):" % len(lost))
        for rel in lost[:20]:
            print("   " + rel)
        if len(lost) > 20:
            print("   ... и ещё %d" % (len(lost) - 20))
        print("если это должно публиковаться — нужен шаблон в INCLUDE")


if __name__ == "__main__":
    main()
