---
type: zadacha
sbornik: Серия 2
nomer: 2.2
razdel: Геометрия
slozhnost: средне
data: 2026-09-09
status: разобрана
priyomy: [seredina-dugi-kak-centr-okruzhnosti, stepen-obschey-tochki-dvuh-okruzhnostey]
---

# Задача 2.2

## Условие

Внутри треугольника $ABC$ выбрана точка $P$ так, что
$\angle PAB = \angle PCB = \tfrac14(\angle A + \angle C)$. Отрезок $BL$ —
биссектриса треугольника. Прямая $PL$ вторично пересекает описанную окружность
треугольника $APC$ в точке $Q$. Доказать, что $QB$ — биссектриса угла $AQC$.

Матцентр, серия 2 «Дуги и функции», задача 2.

## Ключевая идея

Середина дуги $AC$ оказывается центром окружности $(APC)$ — и сразу даёт и равные
радиусы, и вторую вписанную четвёрку через степень точки $L$.

## Решение

Обозначим $\varphi = \tfrac14(\angle A + \angle C)$, через $I$ инцентр, через $X$ —
середину дуги $AC$, не содержащей $B$. Конфигурация симметрична относительно
перестановки $A \leftrightarrow C$, поэтому считаем $\angle A \geqslant \angle C$;
других картинок нет. Отметим $\varphi = \tfrac14(180° - \angle B) < 45°$.

1. **$X$ — центр окружности $(APC)$.** Из условия $\angle PAC = \angle A - \varphi$
   и $\angle PCA = \angle C - \varphi$, откуда
   $$\angle APC = 180° - (\angle A + \angle C) + 2\varphi = 180° - 2\varphi .$$
   Угол тупой, значит центр лежит по другую сторону от $AC$, чем $P$, то есть
   по ту же сторону, что $X$; вписанный угол из дальней дуги равен $2\varphi$,
   значит центральный угол над $AC$ равен $4\varphi$. Но $ABCX$ вписан, поэтому
   $\angle AXC = 180° - \angle B = \angle A + \angle C = 4\varphi$. Обе точки лежат
   на серединном перпендикуляре к $AC$ по одну сторону, а угол зрения на $AC$ при
   удалении строго убывает — значит центр и есть $X$, и
   $$XA = XC = XP = XQ .$$
2. **$BPXQ$ вписан.** Окружности $(ABC)$ и $(APQC)$ проходят через $A$ и $C$,
   а $L$ лежит на прямой $AC$, то есть на их общей хорде. Прямая $PQ$ и прямая
   $BX$ проходят через $L$, поэтому
   $$LP \cdot LQ = LA \cdot LC = LB \cdot LX .$$
3. **Инцентр на окружности $(APQC)$.** По лемме о трезубце $XI = XA$, и $I$ лежит
   на луче $XB$ — порядок на биссектрисе есть $B$, $I$, $L$, $X$.
4. **Счёт углов.** В окружности $(APQC)$ углы $\angle AQP$ и $\angle ACP$ опираются
   на дугу $AP$, в окружности $(BPXQ)$ углы $\angle PQB$ и $\angle PXB$ опираются
   на $PB$, а $\angle PXB = \angle PXI$ — центральный, вдвое больше вписанного:
   $$\angle AQP = \angle C - \varphi, \qquad
   \angle PQB = \angle PXI = 2\angle PAI = 2\Bigl(\frac{\angle A}{2} - \varphi\Bigr)
   = \frac{\angle A - \angle C}{2} .$$
   Луч $QP$ лежит внутри угла $AQB$, поэтому
   $$\angle AQB = (\angle C - \varphi) + \frac{\angle A - \angle C}{2}
   = \frac{\angle A + \angle C}{2} - \varphi = \varphi .$$
5. **Финал.** Точка $L$ лежит на хорде $AC$ внутри окружности, значит $P$ и $Q$
   на разных дугах и $\angle AQC = 180° - \angle APC = 2\varphi$. Итого
   $\angle AQB = \varphi = \tfrac12 \angle AQC$.

Обе половины угла $AQC$ оказываются равны тому же $\varphi$, что в условии.

## Приёмы

- [[seredina-dugi-kak-centr-okruzhnosti]]
- [[stepen-obschey-tochki-dvuh-okruzhnostey]]

## Связанные

Нет.
