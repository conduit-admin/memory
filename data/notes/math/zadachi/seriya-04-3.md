---
type: zadacha
sbornik: Серия 4
nomer: 4.3
razdel: Алгебра
slozhnost: средне
data: 2026-09-14
status: разобрана
priyomy: []
---

# Задача 4.3

## Условие

Комплексные числа $a_1, \ldots, a_n, b_1, \ldots, b_n$ по модулю равны $1$;
$a$ и $b$ — средние арифметические первых и вторых. Положим
$c_k = a_k b + a b_k - a_k b_k$. Доказать, что $|c_1| + \cdots + |c_n| \leqslant n$.

Матцентр, серия 4 «Много метро», задача 3.

## Ключевая идея

Сумму модулей не раскрыть, а сумму квадратов модулей — можно: по
среднему квадратическому достаточно $\sum |c_k|^2 \leqslant n$, а квадрат
модуля — это произведение на сопряжённое, где $a_k \bar a_k = 1$ съедает
почти всё.

## Решение

1. По неравенству между средними
   $\sum |c_k| \leqslant \sqrt{n \sum |c_k|^2}$, так что достаточно доказать
   $\sum |c_k|^2 \leqslant n$.
2. Раскрываем $|c_k|^2 = c_k \bar c_k$; из $a_k \bar a_k = b_k \bar b_k = 1$
   получаем
   $$|c_k|^2 = 1 + |a|^2 + |b|^2
   - 2\operatorname{Re}(a \bar a_k) - 2\operatorname{Re}(b \bar b_k)
   + 2\operatorname{Re}(a \bar b\, \bar a_k b_k).$$
3. Суммируем по $k$: $\sum \bar a_k = n \bar a$, поэтому
   $\sum \operatorname{Re}(a \bar a_k) = n|a|^2$, симметрично для $b$, и
   $$\sum |c_k|^2 = n\bigl(1 - |a|^2 - |b|^2\bigr)
   + 2\operatorname{Re}\Bigl(a \bar b \sum \bar a_k b_k\Bigr).$$
4. Сумма $n$ чисел модуля $1$ по модулю не больше $n$, значит последнее
   слагаемое не больше $2n|a||b| \leqslant n\bigl(|a|^2 + |b|^2\bigr)$.
   Итого $\sum |c_k|^2 \leqslant n$.

## Приёмы

Нет.

## Связанные

Нет.
