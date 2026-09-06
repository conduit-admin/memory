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

HERE = pathlib.Path(__file__).resolve().parent.parent
KNOWLEDGE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                         else r"C:\Users\Admin\Desktop\knowledge")

# Белый список: что вообще может уехать наружу.
INCLUDE = [
    "physics/**/*.md",
    "tex/documents/*.md",
    "tex/documents/*.pdf",
    "tex/*.md",
    "manim/*.md",
    "ml/**/*.md",
    "algo/*.md",
    "web/*.md",
    "assets/**/*",
]

# Изъятия внутри белого списка — по конкретной причине у каждого.
EXCLUDE = {
    # Конспект в соавторстве: публикация делает публичной и чужую часть.
    # Снять запрет можно только после разговора с соавтором.
    "tex/reference/veroyatnost.pdf",
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


def collect():
    seen, notes, files = set(), [], []
    for pattern in INCLUDE:
        for src in sorted(KNOWLEDGE.glob(pattern)):
            if not src.is_file():
                continue
            rel = src.relative_to(KNOWLEDGE).as_posix()
            if rel in EXCLUDE or rel in seen:
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
                })
    return notes, files


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

    notes, files = collect()
    build = datetime.now().strftime("%Y%m%d%H%M")

    (HERE / "data" / "index.json").write_text(
        json.dumps({"notes": notes, "files": files}, ensure_ascii=False, indent=1),
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
    print("сборка %s: заметок %d, PDF %d, вики-ссылок %d"
          % (build, len(notes), len(files), linked))
    if notes and not linked:
        print("связей между заметками нет — обратные ссылки будут пустыми")


if __name__ == "__main__":
    main()
