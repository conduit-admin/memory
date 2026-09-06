---
type: style
---

# Стили конспектов

Выжимка из пяти готовых документов — `cursor.tex`, `genfunc.tex`, `integrals.tex`,
`taylor.tex` — и вёрстки «Вероятности», от которой всё пошло.

Стиль устоявшийся: преамбулы пяти документов совпадают строка в строку, различаясь
только заголовочным комментарием, парой предметных макросов и именем файла рисунков.

## Каркас

```latex
% !TeX program = pdflatex
% !TeX encoding = UTF-8
%
%  Зачёт, подтема 1.2: Формула Тейлора, ряды и прочие пределы.
%  Ответы на вопросы 1--6.
%
\documentclass[12pt,a4paper]{article}
```

Всегда `pdflatex`, никакого XeLaTeX: кириллица идёт через `T2A` + `babel`,
а не через системные шрифты. Magic-комментарии сверху, за ними — что это за документ.

Преамбула разбита блоками с разделителями `%%%%` и русским заголовком. Порядок:

1. язык и кодировки — `cmap`, `[T2A]{fontenc}`, `[utf8]{inputenc}`,
   `[english,russian]{babel}`, `anyfontsize`
2. математика — `amsmath,amssymb,amsthm`, `mathtools`
3. оформление — `geometry` с полями 2.6 см, `xcolor`, `tikz`, `enumitem`,
   `titlesec`, `fancyhdr`
4. палитра
5. заголовки блоков
6. сокращения формул
7. разделы и колонтитул
8. рисунки — `\input{<имя>_figs}`

Предметные макросы конкретного документа дописываются в блок 6 **этого** документа,
а не в общую преамбулу.

## Палитра

```latex
\definecolor{cdef}{RGB}{31,60,200}      % Def.
\definecolor{crem}{RGB}{176,86,20}      % Замечание
\definecolor{cex}{RGB}{197,29,98}       % Пример
\definecolor{cth}{RGB}{124,50,190}      % Лемма, Th
\definecolor{cstat}{RGB}{20,110,70}     % Утверждение, Следствие
\definecolor{cname}{RGB}{0,133,113}     % название в скобках
\definecolor{cteal}{RGB}{0,133,113}     % основной цвет иллюстраций
\definecolor{cviolet}{RGB}{150,40,160}
\definecolor{corange}{RGB}{232,110,40}
\definecolor{cblue}{RGB}{40,90,200}
\definecolor{cgray}{RGB}{130,135,145}
```

Цвет несёт роль, а не украшает: по цвету заголовка видно тип утверждения, не читая слова.
**Цвет только в заголовках блоков и в рисунках.** Текст и формулы чёрные.
На иллюстрациях ведущий цвет `cteal`, оси и служебные подписи `cgray`.

## Заголовки блоков — ядро стиля

Всё оформление держится на одном макросе и обёртках над ним:

```latex
\NewDocumentCommand{\headline}{mmm}{%
  \par\smallskip\noindent
  {\bfseries\color{#1}#2\IfNoValueF{#3}{~{\color{cname}(#3)}\color{#1}}.}%
  \hspace{0.5em}\ignorespaces}

\NewDocumentCommand{\Def} {o}{\headline{cdef} {Def}         {#1}}
\NewDocumentCommand{\Rem} {o}{\headline{crem} {Замечание}   {#1}}
\NewDocumentCommand{\Exa} {o}{\headline{cex}  {Пример}      {#1}}
\NewDocumentCommand{\Lem} {o}{\headline{cth}  {Лемма}       {#1}}
\NewDocumentCommand{\Thm} {o}{\headline{cth}  {Th}          {#1}}
\NewDocumentCommand{\Stm} {o}{\headline{cstat}{Утверждение} {#1}}
\NewDocumentCommand{\Cor} {o}{\headline{cstat}{Следствие}   {#1}}
\NewDocumentCommand{\Prf} {o}{\headline{black}{Док-во}      {#1}}
\NewDocumentCommand{\Cond}{o}{\headline{black}{Условие}     {#1}}
\NewDocumentCommand{\Sol} {o}{\headline{black}{Решение}     {#1}}
\NewDocumentCommand{\Ans} {o}{\headline{black}{Ответ}       {#1}}
```

В тексте это выглядит так:

```latex
\Stm[рекуррентная формула] При $n \geq 2$ выполнено
$\displaystyle I_n = \frac{n-1}{n}\,I_{n-2}$.

\Prf Интегрируем по частям: ... \qedbox
```

**`amsthm`-окружения не используются.** Стиль абзацный: заголовок втянут в первую строку,
нумерации у утверждений нет, ссылки идут по смыслу.

Конец доказательства — `\qedbox` в тексте, `\qedtag` внутри `equation*`/`align*`.
Разбор случая — `\case{...}`. Главный результат параграфа можно обвести `\resbox{...}`.

## Формулы

- Выключная формула — **`\[ ... \]`**, никогда `$$`.
- Многострочный вывод — `aligned` **внутри** `\[ ... \]`, а не окружение `align`.
  Выравнивание по `&=`, между строками `\\[2pt]`.
- Определение величины — `\overset{\text{def}}{=}`.
- Занулившийся кусок помечается прямо в формуле: `\underbrace{...}_{=\,0}`.
- В выключных `\dfrac`, в строке `\tfrac` или `$\displaystyle ...$`.
- Тонкий пробел перед дифференциалом: `\sin^n x\,dx`.
- Условие справа через `\qquad`, точка в конце формулы через пробел: `I_1 = 1 .`

## Рисунки

Все картинки — в отдельном файле `<документ>_figs.tex`, подключаемом последним
блоком преамбулы. Каждая — именованная команда, вызываемая одним словом:

```latex
\newcommand{\figWallis}{%
\par\medskip
\begin{center}
\begin{tikzpicture}[x=6.1cm,y=3.1cm]
  ...
\end{tikzpicture}
\end{center}
\par\medskip}
```

Общие стили объявляются один раз в начале файла рисунков:

```latex
\tikzset{
  lb/.style={font=\small},
  lbs/.style={font=\footnotesize},
  bul/.style={circle,inner sep=0pt,minimum size=3.4pt,fill},
  ax/.style={cgray!75,-{Stealth[length=4pt]}},
}
```

Повторяющиеся приёмы: масштаб через `[x=6.1cm,y=3.1cm]` с координатами в математических
единицах; семейства кривых через `\foreach \n/\c in {1/cteal, 2/cblue}`; заливка под
кривой `\fill[cteal,opacity=0.12]`; подпись поверх кривой с подложкой
`fill=white,fill opacity=0.8,text opacity=1`; обрезка через `\clip` внутри `scope`.

**Две пойманные грабли pgfmath:**

```latex
%  Аргумент всюду в радианах; 57.2958 = 180/pi переводит в градусы,
%  которых ждёт pgfmath.
\pgfmathdeclarefunction{sinpow}{2}{\pgfmathparse{pow(sin(57.2958*#1),#2)}}
%  ctg^2 считаем как (cos/sin)^2: 1/tan^2 переполняет pgfmath около pi/2.
\pgfmathdeclarefunction{ctgsq}{1}{\pgfmathparse{pow(cos(57.2958*#1)/sin(57.2958*#1),2)}}
```

## Разделы и титул

Параграфы нумеруются знаком `\S`, линейки под колонтитулом нет.
Титульный лист — крупное название по центру вертикали, без рамок:

```latex
\begin{titlepage}
  \thispagestyle{empty}
  \vspace*{\fill}
  \begin{center}
    {\fontsize{40}{48}\selectfont\bfseries Формула Тейлора,}\\[0.5\baselineskip]
    {\fontsize{40}{48}\selectfont\bfseries ряды и прочие пределы}
  \end{center}
  \vspace*{\fill}
\end{titlepage}
```

Между разделами в исходнике — полоса `%%%%` во всю ширину. Она нужна: файлы переваливают
за тысячу строк, и глазами по ним ходят именно по этим полосам.

**Вариант «конспект»** (как «Вероятность»): добавляются оглавление с цветными номерами,
авторы и место-год на титуле, колонтитул слева с номером и названием параграфа,
нумерованные примеры, ненумерованные разделы «Отступление: …».
Исходника «Вероятности» нет, так что детали сверять по PDF, а не по памяти.

## Правила текста

Сформулированы в `notes/cursor-plan.md` и выдержаны везде:

- Каждый абзац либо двигает вывод, либо не нужен.
- Определения даются сразу, без подводки и мотивировок.
- Подписей «на рисунке изображено…» нет: картинка говорит за себя.
- Заметка — не статья: без аннотации и лишних отступлений.
  Оглавление появляется только в больших конспектах.
- Если две близкие величины путают читателя — убрать одну, а не пояснять разницу.
