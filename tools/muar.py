"""Собирает assets/muar.svg: фон витрины — муар орденской ленты.

Запуск: python tools/muar.py. Без сторонних библиотек.

Муар — линии уровня функции v(x, y) = y + p(x, y): почти параллельные
волнистые линии, которые местами сходятся в разводы, как переливается
шёлк орденской ленты. Выбран владельцем 2026-10-08 из второго круга
вариантов («возвышенное, почти королевское»; из первого ему нравились
линии уровня и поле направлений — муар и есть линии уровня, текущие
как поле).

Плитка стыкуется без шва: p периодична по x с периодом W и по y
с периодом H, а шаг линий STEP делит H — тогда линии у нижнего края
продолжаются линиями у верхнего. dv/dy = 1 + dp/dy > 0 везде (|dp/dy|
не больше 0,36), поэтому каждая линия — график y = g(x), и её можно
найти для каждого x делением отрезка пополам, без трассировки контуров.
"""
import math
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "muar.svg"

W, H = 480, 360       # плитка
STEP = 7.2            # шаг между линиями; 360 / 7.2 = 50 линий на плитку
DX = 4                # шаг по x при построении линии
COLOR = "#D5D8DE"     # платина, как --plat
WIDTH = 1


def p(x, y):
    a = 2 * math.pi * x / W
    b = 2 * math.pi * y / H
    return 9 * math.sin(2 * a + 1.7 * math.sin(b)) + 5 * math.sin(3 * a - b)


def solve(c, x):
    """y, при котором y + p(x, y) = c."""
    lo, hi = c - 20, c + 20
    for _ in range(40):
        mid = (lo + hi) / 2
        if mid + p(x, mid) < c:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


paths = []
n0 = math.floor(-20 / STEP)
n1 = math.ceil((H + 20) / STEP)
for n in range(n0, n1 + 1):
    c = n * STEP
    pts = [(x, solve(c, x)) for x in range(0, W + 1, DX)]
    if all(y < -2 for _, y in pts) or all(y > H + 2 for _, y in pts):
        continue
    d = "M" + " ".join("%g %.1f" % (x, y) for x, y in pts)
    paths.append('<path d="%s"/>' % d)

svg = """<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">
  <!-- Муар орденской ленты: линии уровня y + p(x, y) с шагом %g.
       Собран скриптом tools/muar.py, руками не править. -->
  <rect width="%d" height="%d" fill="#fff"/>
  <g fill="none" stroke="%s" stroke-width="%g">
%s
  </g>
</svg>
""" % (W, H, W, H, STEP, W, H, COLOR, WIDTH, "\n".join("    " + s for s in paths))

OUT.write_text(svg, encoding="utf-8", newline="\n")
print(OUT, len(paths), "линий,", len(svg), "байт")
