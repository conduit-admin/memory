"""Собирает assets/veer.svg: фон витрины, веер ар-деко с редкими цветными веерами.

Запуск: python tools/veer.py. Места и цвета цветных вееров — в ACCENT.
"""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "veer.svg"

W, H = 480, 240          # плитка: 5 вееров в ширину, 10 рядов в высоту
STEP_X, STEP_Y = 96, 24  # шаг вееров в ряду и шаг рядов
R = (47.4, 31.6, 15.8)   # дуги веера

PLAT = "#D5D8DE"
# Цветные веера: (x, y) центра внутри плитки → (линия, заливка серединки).
ACCENT = {
    (96, 48): ("#A483E0", "#EEE6FB"),    # фиолетовый
    (336, 168): ("#4FBDB5", "#DDF3F1"),  # бирюзовый
}


def fan(x, y):
    line, core = ACCENT.get((x % W, y % H), (PLAT, None))
    parts = ['<circle cx="%g" cy="%g" r="%g" fill="#fff" stroke="%s" stroke-width="1.2"/>'
             % (x, y, R[0], line)]
    for r in R[1:]:
        fill = core if (core and r == R[-1]) else "none"
        parts.append('<circle cx="%g" cy="%g" r="%g" fill="%s" stroke="%s" stroke-width="1.1"/>'
                     % (x, y, r, fill, line))
    return "".join(parts)


rows = []
for j in range(-1, H // STEP_Y + 2):          # от ряда над плиткой до ряда под ней
    y = j * STEP_Y
    x0 = STEP_X // 2 if j % 2 else 0
    xs = range(x0 - STEP_X, W + STEP_X + 1, STEP_X)
    rows.append("".join(fan(x, y) for x in xs if -R[0] < x < W + R[0]))

svg = """<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">
  <!-- Веер ар-деко: ряды вееров из концентрических дуг, каждый следующий ряд
       накрывает нижнюю половину предыдущего. Плоские платиновые линии на белом,
       без объёма; веер радиусом 48, три дуги, ряды через 24.

       Украшения (владелец, 2026-10-08: «совсем чуть-чуть, в фиолетовых
       и бирюзовых тонах»): на плитку 480 на 240 — пятьдесят вееров — один
       фиолетовый и один бирюзовый: дуги цветом и светлая серединка того же
       тона, как вставка смальты.

       Файл собран скриптом: каждый веер, заходящий в плитку, нарисован в ней
       целиком, ряды сверху вниз, — плитки рисуются по отдельности и
       обрезаются по краю. Цвет веера берётся по его месту внутри плитки,
       поэтому соседние плитки стыкуются без шва. -->
  <rect width="%d" height="%d" fill="#fff"/>
%s
</svg>
""" % (W, H, W, H, W, H, "\n".join("  " + r for r in rows))

OUT.write_text(svg, encoding="utf-8", newline="\n")
print(OUT, len(svg), "байт")
