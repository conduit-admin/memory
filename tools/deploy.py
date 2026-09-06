# -*- coding: utf-8 -*-
"""Обновляет сайт: пересобирает витрину, коммитит и пушит — одной командой.

    python tools/deploy.py

Раньше это были три шага руками, и сайт отставал от knowledge ровно настолько,
насколько легко забыть второй и третий. Один шаг забыть нельзя: либо ты его
сделал, либо нет.

Берётся рабочее дерево knowledge, а не последний коммит. То есть на сайт уедет
и то, что ещё не закоммичено. Это сделано нарочно — обновлять сайт хочется сразу,
не дожидаясь, пока сложится осмысленный коммит, — но помнить об этом стоит:
публичный сайт может опережать приватную историю.

Сообщение коммита ссылается на состояние knowledge: по нему видно, какому
содержимому соответствует эта сборка.
"""
import pathlib
import subprocess
import sys

# Консоль здесь в кодировке Windows, и печать русского текста роняет скрипт
# целиком — не «показывает кракозябры», а падает с UnicodeEncodeError.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = pathlib.Path(__file__).resolve().parent.parent
KNOWLEDGE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                         else r"C:\Users\Admin\Desktop\knowledge")


def run(args, cwd, check=True):
    r = subprocess.run(args, cwd=str(cwd), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if check and r.returncode:
        sys.exit("не выполнилось: %s\n%s%s" % (" ".join(args), r.stdout, r.stderr))
    return r


def knowledge_state():
    """Короткое описание того, что сейчас в knowledge: коммит и грязное ли дерево."""
    if not (KNOWLEDGE / ".git").exists():
        return "без git"
    sha = run(["git", "rev-parse", "--short", "HEAD"], KNOWLEDGE).stdout.strip()
    subject = run(["git", "log", "-1", "--format=%s"], KNOWLEDGE).stdout.strip()
    dirty = bool(run(["git", "status", "--porcelain"], KNOWLEDGE).stdout.strip())
    return "%s %s%s" % (sha, subject, " + несохранённое" if dirty else "")


def main():
    # 1. пересборка витрины
    r = run([sys.executable, str(HERE / "tools" / "publish.py"), str(KNOWLEDGE)], HERE)
    print(r.stdout.strip())

    # 2. есть ли что коммитить
    run(["git", "add", "-A"], HERE)
    staged = run(["git", "diff", "--cached", "--name-only"], HERE).stdout.strip()
    if not staged:
        print("сайт уже соответствует knowledge — коммитить нечего")
        return

    n = len(staged.splitlines())
    print("изменилось файлов: %d" % n)

    # 3. коммит со ссылкой на состояние источника
    msg = "витрина: %s" % knowledge_state()
    run(["git", "commit", "-m", msg], HERE)
    print("коммит: %s" % msg)

    # 4. push, если есть куда
    if not run(["git", "remote"], HERE).stdout.strip():
        print("ремоута нет — push пропущен")
        return

    r = run(["git", "push"], HERE, check=False)
    if r.returncode:
        # push может упасть по сети или по правам; коммит при этом уже сделан
        # и никуда не денется — поэтому не считаем это провалом всей сборки
        print("push не прошёл:\n%s%s" % (r.stdout, r.stderr))
        print("коммит на месте, повторить: git push")
        return

    print("опубликовано, обновится через минуту")


if __name__ == "__main__":
    main()
