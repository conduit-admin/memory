/* Лучезарность (до 2026-10-07 — «Хранилище») — читалка заметок.
   Сборки нет: Pages раздаёт репозиторий как есть, страница читает data/ прямо в
   браузере. Всё, что нужно знать о базе заранее, лежит в data/index.json —
   его пишет tools/publish.py, потому что каталог браузеру не перечислить. */

(function () {
  "use strict";

  var DATA = null;      /* index.json */
  var CFG = null;       /* config.json */
  var BY_SLUG = {};     /* имя файла без расширения → заметка */
  var BY_FILE = {};     /* имя файла без расширения → приложенный файл */
  var DOC_BY_PDF = {};  /* путь PDF → документ TeX, у которого есть название */
  var BACK = {};        /* путь → кто на него ссылается */
  var VIEW = "proekty";
  var V = "";           /* метка сборки в адресах данных */

  /* Стадии производства ролика по порядку: класс берётся по месту в списке,
     чтобы цвет не приходилось задавать в двух местах. */
  var STAGES = ["не начат", "программируется",
                "озвучивается и монтируется", "готов", "выложен"];

  /* Цвет раздела. Список закреплён, а не выведен из хеша имени: цвет ничего
     не значит сам по себе, но прыгать при переименовании он не должен. */
  var SECTION = {
    "physics": "var(--s1)",
    "math": "var(--s5)",
    "ml": "var(--s6)",
    "manim": "var(--s2)",
    "web": "var(--s7)",
    "tex": "var(--s4)",
    "tutoring": "var(--s8)",
    "algo": "var(--s3)"
  };

  function sectionColor(folder) {
    var root = String(folder || "").split("/")[0];
    return SECTION[root] || "var(--s8)";
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function noteAt(path) {
    for (var i = 0; i < DATA.notes.length; i++) {
      if (DATA.notes[i].path === path) return DATA.notes[i];
    }
    return null;
  }

  /* ── прямые ссылки ───────────────────────────────────────

     С 2026-10-07 файл открывается по первому нажатию: строка, карточка
     и вики-ссылка ведут прямо в PDF, сайт — прямо на сайт, ролик — прямо
     на видео. Промежуточная страница «о файле» снята: за файлом приходят,
     чтобы его читать, а справку о нём не открывал никто (владелец).
     Всё, что уводит с сайта, открывается в новой вкладке — сам сайт
     остаётся на месте, и вернуться к списку можно без «назад». */
  function pdfHref(path) {
    return "data/notes/" + encodeURI(path) + V;
  }

  function outward(a) {
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function isOut(href) {
    return href.charAt(0) !== "#";
  }

  /* ── разбор markdown ─────────────────────────────────────

     Порядок здесь важнее самого разбора. Формулы и код вынимаются из текста
     ДО marked: иначе `_` внутри $a_1$ становится курсивом, а `*` — списком,
     и формула разваливается ещё до того, как её увидит KaTeX. */

  function splitCode(src) {
    /* Ограждённые блоки и код в строке отдаются marked нетронутыми: внутри них
       ни формул, ни вики-ссылок искать нельзя. Чётные куски — обычный текст. */
    return src.split(/(```[\s\S]*?```|`[^`\n]*`)/);
  }

  function extractMath(text, store) {
    /* Сначала выключные, потом строчные — иначе $$ съедается как два пустых $. */
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (_, tex) {
      store.push({ tex: tex, display: true });
      return '<span class="math" data-i="' + (store.length - 1) + '"></span>';
    });
    return text.replace(/\$([^\$\n]+?)\$/g, function (_, tex) {
      store.push({ tex: tex, display: false });
      return '<span class="math" data-i="' + (store.length - 1) + '"></span>';
    });
  }

  function wikiLinks(text) {
    /* [[имя]] и [[имя|подпись]]. Имя разрешается по файлу без расширения — так
       же, как оно пишется в заметках. Не нашлось — ссылка остаётся, но
       помечается: видно, куда база растёт. */
    return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, function (_, name, label) {
      var key = name.trim();
      var note = BY_SLUG[key];
      /* Не заметка — может быть приложенный файл: PDF лежит рядом с заметками
         и линкуется тем же `[[имя]]`. Иначе каждый новый задачник или листок
         требовал бы правки кода, а сайт обязан справляться с ними сам. */
      var file = note ? null : BY_FILE[key];
      /* Без явной подписи показываем заголовок заметки, а не слаг: в тексте
         разбора «pvo-na-perpendikulyarnoy-grani» читается как имя файла,
         которым оно и является, а нужно название приёма. У PDF, собранного
         из TeX, название берётся из титула документа — тем же, что стоит
         в списках; у прочих PDF названия, кроме имени файла, нет. */
      var doc = file ? DOC_BY_PDF[file.path] : null;
      var shown = label ? label.trim()
        : (note ? note.title : (doc ? doc.title : (file ? file.title : key.trim())));
      if (note) return "[" + shown + "](#/n/" + encodeURI(note.path) + ")";
      if (file) return "[" + shown + "](" + pdfHref(file.path) + ")";
      return "[" + shown + "](#/missing)";
    });
  }

  function renderMath(host, math) {
    host.querySelectorAll("span.math").forEach(function (node) {
      var m = math[+node.dataset.i];
      try {
        katex.render(m.tex, node, { displayMode: m.display, throwOnError: false });
      } catch (e) {
        /* Неверная формула не должна уносить страницу: показываем исходник. */
        node.textContent = "$" + m.tex + "$";
      }
    });
  }

  /* Одна строка markdown без абзаца вокруг — для подписей, собранных из ячеек
     таблицы: формулы и код в них те же, что и в тексте заметки. */
  function renderInline(src, host) {
    var math = [];
    var parts = splitCode(src);
    for (var i = 0; i < parts.length; i += 2) {
      parts[i] = extractMath(parts[i], math);
    }
    host.innerHTML = marked.parseInline(parts.join(""), { breaks: false, gfm: true });
    renderMath(host, math);
  }

  function renderMarkdown(src, host) {
    var math = [];
    var parts = splitCode(src);
    for (var i = 0; i < parts.length; i += 2) {
      parts[i] = wikiLinks(extractMath(parts[i], math));
    }
    host.innerHTML = marked.parse(parts.join(""), { breaks: false, gfm: true });
    renderMath(host, math);

    host.querySelectorAll('a[href="#/missing"]').forEach(function (a) {
      a.className = "missing";
      a.title = "заметки пока нет";
      a.removeAttribute("href");
    });

    /* Ссылки наружу и на файлы — в новой вкладке: заметка остаётся открытой. */
    host.querySelectorAll("a[href]").forEach(function (a) {
      if (isOut(a.getAttribute("href"))) outward(a);
    });

    /* Над каждым блоком кода — «Копировать»: в заметках так лежат промпты
       ролей и команды, и выделять их пальцем на телефоне мучительно.
       Кнопка над блоком, а не поверх него: поверх она закрывала бы конец
       первой строки. */
    host.querySelectorAll("pre").forEach(function (pre) {
      var wrap = el("div", "pre-wrap");
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(copyButton(function () { return pre.innerText.replace(/\n$/, ""); },
                                  "Скопировать блок"));
      wrap.appendChild(pre);
    });

    /* Широкое прокручивается внутри себя: горизонтальной полосы у страницы быть
       не должно, иначе на телефоне уезжает вся вёрстка. */
    host.querySelectorAll("table").forEach(function (t) {
      var box = el("div", "scroll-x");
      t.parentNode.insertBefore(box, t);
      box.appendChild(t);
    });
  }

  /* ── разбивка заметки на блоки ───────────────────────────

     Разбор задачи — не сплошной текст: условие, идея, решение и то, где всё
     сломалось, читаются по-разному и ищутся по-разному. Поэтому каждый раздел
     второго уровня становится отдельным блоком с цветной линией слева.

     Цвет здесь ровно то же, что и везде на сайте: он отличает одно от другого
     и ничего не значит сам по себе. Панелей внутри панели не заводим — вложенное
     стекло выглядит коробкой в коробке; хватает линии и заголовка.

     Названия разделов заданы списком, а не угаданы: у задачи и у приёма они
     разные, но роль совпадает — «Суть» приёма это то же место, что «Ключевая
     идея» задачи. Незнакомый заголовок получает нейтральный блок, поэтому
     новый раздел в шаблоне не требует правки кода. */
  var SECTION_KIND = {
    "условие": "cond",
    "триггер": "cond",
    "ключевая идея": "idea",
    "суть": "idea",
    "решение": "sol",
    "пример": "sol",
    "проблемы": "prob",
    "где застрял": "prob",
    "моя ошибка": "prob",
    "границы применимости": "prob",
    "типичная ошибка": "prob",
    "приёмы": "bare",
    "связанные": "bare",
    "задачи": "bare"
  };

  function groupSections(host) {
    var kids = Array.prototype.slice.call(host.childNodes);
    var current = null;
    kids.forEach(function (node) {
      if (node.nodeType === 1 && node.tagName === "H2") {
        var key = node.textContent.trim().toLowerCase();
        current = el("section", "blk blk-" + (SECTION_KIND[key] || "plain"));
        host.insertBefore(current, node);
        current.appendChild(node);
        return;
      }
      /* Всё до первого заголовка — вводный текст, он остаётся как есть. */
      if (current) current.appendChild(node);
    });
  }

  /* ── сборка блоков ───────────────────────────────────── */

  /* На плашке только название и, если передано, число документов справа.
     Пояснения оттуда убраны: они удлиняли строку — на узком экране плашка
     вылезала за край, — а сказать что-то важное всё равно не успевали. */
  /* Значок раздела — по его названию, чёрным на золотой плашке заголовка.
     Раздел без своего значка получает солнце из лучей знака — так новый
     блок появляется и без правки этого списка. */
  var BLOCK_ICON = {
    "Свежее": "sparkles", "Найдено": "search", "Анимации": "clapper", "Сайты": "globe",
    "Репетиторство": "board", "Статьи": "book", "Стили": "palette",
    "Шпаргалки": "bookmark", "Конспекты": "book", "Серии": "sigma",
    "Гробарий": "archive", "План обучения": "map", "Разборы": "listcheck",
    "Эксперимент": "flask", "Теория": "book", "Роли": "compass"
  };

  /* «Серии» есть и в «Математике», и в «Физике»: у физики свой значок. */
  function blockIcon(title) {
    if (VIEW === "physics" && title === "Серии") return "atom";
    return BLOCK_ICON[title] || "sun";
  }

  function block(main, title, tone, count) {
    var box = el("section", "block");
    var head = el("div", "block-head " + tone);
    var mark = el("span", "block-icon");
    mark.appendChild(icon(blockIcon(title)));
    head.appendChild(mark);
    head.appendChild(el("h2", null, title));
    if (count != null) head.appendChild(el("span", "block-count", String(count)));
    box.appendChild(head);
    var list = el("div", "list");
    box.appendChild(list);
    main.appendChild(box);
    return list;
  }

  /* ── раскрывающиеся группы ───────────────────────────────

     Группа — родной <details>: раскрывается без скрипта, клавиатурой
     и читалкой экрана, и работает раньше, чем страница досчитает остальное.
     В закрытом виде экран — оглавление: строка на тему, у каждой видно,
     сколько внутри и когда последний раз менялось.

     Внутри не карточки, а строки на той же панели: стекло в стекле
     выглядит коробкой в коробке. Какие группы открыты, помнит браузер
     читателя — это его удобство, а не данные: в приватном окне всё просто
     закрыто, и страница от этого не ломается. */
  function isOpen(id) {
    try { return localStorage.getItem("open:" + id) === "1"; } catch (e) { return false; }
  }

  function remember(id, on) {
    try {
      if (on) localStorage.setItem("open:" + id, "1");
      else localStorage.removeItem("open:" + id);
    } catch (e) { /* хранилище недоступно — помнить просто нечем */ }
  }

  function group(list, id, title, meta, sub) {
    var box = el("details", "group");
    box.open = isOpen(id);
    var head = el("summary", "group-head");
    var name = el("span", "group-title");
    name.appendChild(el("span", null, title));
    if (sub) name.appendChild(el("span", "group-sub", sub));
    head.appendChild(name);
    if (meta) head.appendChild(el("span", "group-meta", meta));
    head.appendChild(el("span", "chev"));
    box.appendChild(head);
    var body = el("div", "group-body");
    box.appendChild(body);
    box.addEventListener("toggle", function () { remember(id, box.open); });
    list.appendChild(box);
    return body;
  }

  /* Строка группы: подпись, под ней при нужде вторая строка, справа тихая
     пометка — номер подтемы или дата. Точка слева — цвет вида документа
     (урок, домашка, разбор) или стадии ролика: различать, не читая слова.
       o.aside — справа, o.sub — вторая строка, o.dot — класс цвета точки,
       o.color — цвет точки прямо (раздел в «Свежем» и в поиске),
       o.thumb — миниатюра первой страницы, она встаёт на место точки,
       o.label — подпись для читалки экрана, если видимой мало. */
  function row(body, href, label, o) {
    o = o || {};
    var a = el("a", "row" + (o.dot ? " " + o.dot : "") + (o.thumb ? " has-thumb" : ""));
    a.href = href;
    if (isOut(href)) outward(a);
    if (o.label) a.setAttribute("aria-label", o.label);
    if (o.color) a.style.setProperty("--dot", o.color);
    if (o.thumb) a.appendChild(thumbImg(o.thumb, "row-thumb"));
    else if (o.icon) {
      var tile = el("span", "row-icon");
      tile.appendChild(icon(o.icon));
      a.appendChild(tile);
    } else if (o.dot || o.color) a.appendChild(el("span", "row-dot"));
    var text = el("span", "row-label");
    text.appendChild(el("span", null, label));
    if (o.sub) text.appendChild(el("span", "row-sub", o.sub));
    a.appendChild(text);
    if (o.aside) a.appendChild(el("span", "row-aside", o.aside));
    body.appendChild(a);
    return a;
  }

  /* Миниатюра первой страницы — у каждого PDF (рисует tools/publish.py);
     у документов A5 это обложка, у A4 — лист с началом текста. Размеры заданы в разметке,
     чтобы строка не прыгала, пока картинка едет; подпись пустая — рядом
     стоит название, и читалке повторять его незачем. */
  function thumbImg(src, cls) {
    var img = el("img", "thumb " + cls);
    img.src = src + V;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 200;
    img.height = 283;
    return img;
  }

  /* Панель без раскрытия — та же группа, только всегда открытая и без шапки:
     для коротких блоков, где прятать нечего, а семь отдельных карточек
     съедали полтора экрана. */
  function panel(list) {
    var box = el("div", "group panel");
    var body = el("div", "group-body");
    box.appendChild(body);
    list.appendChild(box);
    return body;
  }

  function files(n) {
    return n + " " + plural(n, "файл", "файла", "файлов");
  }

  function shortDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? m[3] + "." + m[2] : "";
  }


  function fileName(path) {
    return String(path).split("/").pop();
  }

  function card(note, opts) {
    opts = opts || {};
    var a = el("a", "card");
    a.href = "#/n/" + encodeURI(note.path);
    a.style.setProperty("--sec", sectionColor(note.folder));

    var top = el("div", "card-top");
    top.appendChild(el("span", "card-title", note.title));

    /* Метки и имя файла лежат в одной обойме: перенесясь на узком экране, они
       уходят вниз вместе и остаются прижатыми вправо, а не рассыпаются
       по краям строки. */
    var meta = el("div", "card-meta");
    if (opts.stage != null) {
      var i = STAGES.indexOf(opts.stage);
      meta.appendChild(el("span", "stage stage-" + (i < 0 ? 0 : i), opts.stage));
    }
    if (opts.tag) meta.appendChild(el("span", "tag", opts.tag));
    /* Имени файла на карточке нет: слаг — это транслитерация заголовка, который
       уже стоит рядом, и второй раз он только сорит. Тип заметки не показываем
       тоже: это служебное слово из фронтматтера, читателю оно ничего не
       говорит, а место в списке и так объясняет, что перед ним. */
    top.appendChild(meta);
    a.appendChild(top);

    if (opts.note) a.appendChild(el("div", "card-note", opts.note));
    return a;
  }

  /* Карточка документа открывает сам PDF. С миниатюрой обложки — слева
     картинка, справа то же, что было: название, метка, имя файла. */
  function texCard(d) {
    var a = el("a", "card" + (d.thumb ? " has-thumb" : ""));
    a.href = d.pdf ? pdfHref(d.pdf) : "#/";
    if (d.pdf) outward(a);
    a.style.setProperty("--sec", docColor(d));
    var top = el("div", "card-top");
    top.appendChild(el("span", "card-title", d.title));
    var meta = el("div", "card-meta");
    if (d.pdf) meta.appendChild(el("span", "tag", "PDF"));
    meta.appendChild(el("span", "fname", d.tex));
    top.appendChild(meta);
    if (d.thumb) {
      a.appendChild(thumbImg(d.thumb, "card-thumb"));
      var body = el("div", "card-body");
      body.appendChild(top);
      a.appendChild(body);
    } else a.appendChild(top);
    return a;
  }

  /* Цвет документа — цвет раздела, где он живёт. Листки репетиторства
     и физики лежат не в tex/ — и цвет у них свой; шпаргалки кружка ML лежат
     в tex/, но живут во вкладке «ИИ» и красятся её цветом. */
  function docColor(d) {
    return sectionColor(d.group === "tutoring" ? "tutoring"
      : (isPhysics(d) ? "physics" : (isMl(d) ? "ml" : "tex")));
  }

  /* Что это за документ — одной строкой, для «Свежего» и поиска, где
     документы из всех разделов идут вперемешку и место их не объясняет. */
  function docKind(d) {
    if (d.group === "tutoring") {
      return kindOf(d.tex.replace(/\.tex$/, "")).label + " · репетиторство";
    }
    if (isPhysics(d)) return "Физика";
    if (isMl(d)) return "Шпаргалка";
    var readme = d.group ? noteAt("tex/documents/" + d.group + "/README.md") : null;
    return readme ? readme.title : "Статья";
  }

  /* ── значки ──────────────────────────────────────────────

     Набор маленький и свой: линия 1.8 на сетке 24, скругления — как у букв
     гарнитуры. Значок выбирается полем `znachok` во фронтматтере, цвет
     приходит вместе с ним — краска из набора сайта. Незнакомое имя даёт
     нейтральную точку: новая роль появится и без нового рисунка. */
  var SVG_NS = "http://www.w3.org/2000/svg";

  var ICONS = {
    atom: { c: "var(--s1)", d: '<ellipse cx="12" cy="12" rx="10" ry="4"/>' +
      '<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/>' +
      '<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>' +
      '<circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>' },
    sigma: { c: "var(--s5)", d: '<path d="M17.5 5H6.5l6.5 7-6.5 7h11"/>' },
    nodes: { c: "var(--s6)", d: '<path d="M5 7l7 0M5 7l7 10M5 17l7-10M5 17l7 0M12 7l7 5M12 17l7-5"/>' +
      '<g fill="currentColor" stroke="none"><circle cx="5" cy="7" r="2.2"/>' +
      '<circle cx="5" cy="17" r="2.2"/><circle cx="12" cy="7" r="2.2"/>' +
      '<circle cx="12" cy="17" r="2.2"/><circle cx="19" cy="12" r="2.2"/></g>' },
    board: { c: "var(--s3)", d: '<rect x="3" y="4" width="18" height="12" rx="1.6"/>' +
      '<path d="M12 16v4M8.5 20h7M7 12l3-3 2.5 2.5L17 7"/>' },
    page: { c: "var(--s7)", d: '<path d="M6.5 3h7.5l4.5 4.5V21h-12z"/>' +
      '<path d="M14 3v4.5h4.5M9.5 12.5h6M9.5 16.5h6"/>' },
    film: { c: "var(--s2)", d: '<rect x="3" y="5" width="18" height="14" rx="2.2"/>' +
      '<path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/>' },
    megaphone: { c: "var(--s4)", d: '<path d="M3.5 10v4h3l7 4.5v-13l-7 4.5z"/>' +
      '<path d="M16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/>' },
    shield: { c: "var(--s8)", d: '<path d="M12 3l7 3v5.2c0 4.4-2.9 7.9-7 9.8-4.1-1.9-7-5.4-7-9.8V6z"/>' +
      '<path d="M9 12.2l2.1 2.1L15.2 10"/>' },
    compass: { c: "var(--s8)", d: '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/>' },
    map: { c: "var(--s8)", d: '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/>' +
      '<path d="M9 4v13.5M15 6.5V20"/>' },
    sun: { c: "var(--gold)", d: '<circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/>' +
      '<path d="M12 2v3.4M12 18.6V22M2 12h3.4M18.6 12H22M4.9 4.9l2.4 2.4M16.7 16.7l2.4 2.4M4.9 19.1l2.4-2.4M16.7 7.3l2.4-2.4"/>' },
    globe: { c: "var(--violet)", d: '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>' },
    palette: { c: "var(--violet)", d: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2.1a4.5 4.5 0 0 0 4.5-4.5C21 6.6 17 3 12 3z"/>' +
      '<g fill="currentColor" stroke="none"><circle cx="7.6" cy="11" r="1.2"/><circle cx="10" cy="7.3" r="1.2"/>' +
      '<circle cx="14.3" cy="7.3" r="1.2"/></g>' },
    book: { c: "var(--violet)", d: '<path d="M3 5.6c3-1.2 6-1.1 9 .6v13.6c-3-1.7-6-1.8-9-.6zM21 5.6c-3-1.2-6-1.1-9 .6v13.6c3-1.7 6-1.8 9-.6z"/>' },
    bookmark: { c: "var(--violet)", d: '<path d="M7 3.5h10V21l-5-4-5 4z"/>' },
    archive: { c: "var(--violet)", d: '<rect x="3" y="4" width="18" height="4.5" rx="1.2"/>' +
      '<path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M10 12.5h4"/>' },
    flask: { c: "var(--violet)", d: '<path d="M9 3h6M10 3v6.2L4.8 18.6A1.6 1.6 0 0 0 6.2 21h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3M7.4 15h9.2"/>' },
    listcheck: { c: "var(--violet)", d: '<path d="M3.8 6.6l1.6 1.6L8.2 5.4M3.8 12.6l1.6 1.6 2.8-2.8M3.8 18.6l1.6 1.6 2.8-2.8M11.5 7h8.5M11.5 13h8.5M11.5 19h8.5"/>' },
    search: { c: "var(--violet)", d: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>' },
    layers: { c: "var(--violet)", d: '<path d="M12 3.5l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>' },
    file: { c: "var(--violet)", d: '<path d="M6.5 3h7.5l4.5 4.5V21h-12z"/><path d="M14 3v4.5h4.5"/>' },
    copy: { c: "currentColor", d: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/>' +
      '<path d="M15.5 8.5V6.2a2.2 2.2 0 0 0-2.2-2.2H6.2A2.2 2.2 0 0 0 4 6.2v7.1a2.2 2.2 0 0 0 2.2 2.2h2.3"/>' },
    check: { c: "currentColor", d: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' },
    /* Хлопушка — «Анимации» с 2026-10-08, вместо экрана с треугольником
       (film; владелец попросил заменить). film оставлен: его может назвать
       поле znachok у роли. */
    clapper: { c: "currentColor", d: '<rect x="3" y="10" width="18" height="10" rx="1.8"/>' +
      '<path d="M3 10l16.4-4.4-.8-3.1L2.2 6.9z"/>' +
      '<path d="M8.4 8.6l.7-3.5M13.3 7.3l.7-3.5"/>' +
      '<path d="M3 13.6h18M8 10l-1.8 3.6M13 10l-1.8 3.6M18 10l-1.8 3.6"/>' },
    /* Искры — «Свежее» с 2026-10-08: новое, только что появилось. Солнце
       осталось значком по умолчанию для разделов без своего. */
    sparkles: { c: "currentColor", d: '<path d="M10 5c.6 4.5 2.4 6.4 7 7-4.6.6-6.4 2.5-7 7-.6-4.5-2.4-6.4-7-7 4.6-.6 6.4-2.5 7-7z"/>' +
      '<path d="M18.5 2.5c.2 1.5.8 2.1 2.3 2.3-1.5.2-2.1.8-2.3 2.3-.2-1.5-.8-2.1-2.3-2.3 1.5-.2 2.1-.8 2.3-2.3z" fill="currentColor"/>' +
      '<path d="M19 16.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2z" fill="currentColor"/>' }
  };

  function icon(name) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = (ICONS[name] || { d: '<circle cx="12" cy="12" r="4" fill="currentColor"/>' }).d;
    return svg;
  }

  /* ── копирование ─────────────────────────────────────────

     Буфер обмена — через Clipboard API, а где его нет (старый браузер,
     страница не по https) — через выделенное скрытое поле. Текст обязан
     быть под рукой в момент нажатия: после ожидания сети браузер копировать
     уже не разрешает, поэтому промпты ролей лежат прямо в индексе. */
  function copyText(text) {
    function legacy() {
      var area = el("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(area);
      return ok ? Promise.resolve() : Promise.reject();
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(legacy);
    }
    return legacy();
  }

  /* Кнопка «Копировать»: значок и слово, после нажатия — галочка
     и «Скопировано» на полторы секунды. Слово объявляется читалке экрана.
     На узком экране слово прячется, остаётся значок — название кнопки
     для читалки задано отдельно и полностью. */
  function copyButton(getText, label) {
    var b = el("button", "copy");
    b.type = "button";
    b.setAttribute("aria-label", label);
    var mark = icon("copy");
    var word = el("span", "copy-label", "Копировать");
    word.setAttribute("aria-live", "polite");
    b.appendChild(mark);
    b.appendChild(word);
    var timer = null;
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      copyText(getText()).then(function () {
        b.classList.add("done");
        b.replaceChild(icon("check"), b.firstChild);
        word.textContent = "Скопировано";
      }, function () {
        word.textContent = "Не вышло";
      }).then(function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          b.classList.remove("done");
          b.replaceChild(icon("copy"), b.firstChild);
          word.textContent = "Копировать";
        }, 1500);
      });
    });
    return b;
  }

  /* ── роли ────────────────────────────────────────────────

     Карточка роли: значок в тихой плитке её цвета, название, строка
     `kratko` и кнопка «Копировать» — за промптом сюда и приходят, и открывать
     файл ради него не надо. Нажатие на саму карточку открывает файл роли:
     там пояснения, что читать и почему. Отбор по типу, а не по папке:
     новый файл роли появляется сам; порядок — поле `poryadok`. */
  function roleCard(n) {
    var ic = ICONS[n.fm.znachok] || { c: "var(--s8)" };
    var box = el("div", "card role");
    box.style.setProperty("--c", ic.c);
    var a = el("a", "role-main");
    a.href = "#/n/" + encodeURI(n.path);
    var tile = el("span", "role-icon");
    tile.appendChild(icon(n.fm.znachok));
    a.appendChild(tile);
    var text = el("span", "role-text");
    text.appendChild(el("span", "card-title", n.title));
    if (n.fm.kratko) text.appendChild(el("span", "card-note", n.fm.kratko));
    a.appendChild(text);
    box.appendChild(a);
    if (n.prompt) {
      box.appendChild(copyButton(function () { return n.prompt; },
                                 "Скопировать промпт: " + n.title));
    }
    return box;
  }

  function roleOrder(n) {
    var p = +n.fm.poryadok;
    return isFinite(p) && p > 0 ? p : 999;
  }

  function empty(list, text) {
    list.appendChild(el("div", "empty", text));
  }

  /* ── вкладка «Проекты» ───────────────────────────────── */

  function byVid(vid) {
    return DATA.notes.filter(function (n) { return n.fm.vid === vid; })
      .sort(function (a, b) { return a.title.localeCompare(b.title, "ru"); });
  }

  /* Репетиторство — по темам. Вид документа и тема читаются из имени файла,
     как их и заводят: `sravneniya`, `sravneniya-dz`, `sravneniya-razbor`,
     `parametr-dz-01`, `parametr-zanyatie-01-razbor`. Тема — то, что осталось
     без хвоста; новый урок, домашка или разбор встают в свою тему сами.

     Внутри темы — в порядке цикла: урок, его разбор, занятия, домашки и их
     разборы. Темы — свежие сверху: открывают обычно последнюю. */
  var KIND = /^(.*?)(-zanyatie-(\d+))?(-dz(?:-(\d+))?)?(-razbor)?$/;

  function kindOf(stem) {
    var m = KIND.exec(stem);
    var razbor = !!m[6], num = +(m[3] || m[5] || 0);
    var k;
    if (m[2]) k = { label: (razbor ? "Разбор занятия " : "Занятие ") + num, rank: razbor ? 3 : 2 };
    else if (m[4]) k = { label: (razbor ? "Разбор домашки" : "Домашка") + (num ? " " + num : ""),
                         rank: razbor ? 5 : 4 };
    else k = { label: razbor ? "Разбор урока" : "Урок", rank: razbor ? 1 : 0 };
    k.base = m[1];
    k.num = num;
    /* Цвет точки: урок и занятие — одно, домашка — другое, любой разбор — третье. */
    k.kind = razbor ? "r" : (m[4] ? "d" : "u");
    return k;
  }

  function tutoringGroups(list, docs) {
    var topics = {}, order = [];
    docs.forEach(function (d) {
      var k = kindOf(d.tex.replace(/\.tex$/, ""));
      if (!topics[k.base]) { topics[k.base] = []; order.push(k.base); }
      topics[k.base].push({ d: d, k: k });
    });
    function latest(base) {
      return topics[base].reduce(function (m, x) { return (x.d.date || "") > m ? x.d.date : m; }, "");
    }
    order.sort(function (a, b) { return latest(b).localeCompare(latest(a)) || a.localeCompare(b); });
    order.forEach(function (base) {
      var items = topics[base].sort(function (x, y) {
        return x.k.rank - y.k.rank || x.k.num - y.k.num;
      });
      var lesson = items.filter(function (x) { return x.k.rank === 0; })[0] || items[0];
      var day = shortDate(latest(base));
      /* «Комбинаторика: два правила, сочетания, дополнение» — тема и что
         в ней: до двоеточия названием, после — второй строкой. В одну строку
         такое название занимало на телефоне три. */
      var t = lesson.d.title.split(": ");
      var body = group(list, "tutoring:" + base, t[0],
                       files(items.length) + (day ? " · " + day : ""),
                       t.slice(1).join(": "));
      items.forEach(function (x) {
        row(body, pdfHref(x.d.pdf), x.k.label,
            { aside: shortDate(x.d.date), dot: "kind-" + x.k.kind, thumb: x.d.thumb });
      });
    });
  }

  function stageOf(n) {
    return Math.max(0, STAGES.indexOf(n.fm.stadiya || STAGES[0]));
  }

  /* Серия матцентра по имени листка: math/serii/seriya-08.pdf — «Серия 8».
     Названия у самого файла нет, а таблица серий лежит в заметке, которую
     ради одной подписи пришлось бы грузить. */
  function seriesTitle(path) {
    var m = /^math\/serii\/seriya-0*(\d+)\.pdf$/.exec(path);
    return m ? "Серия " + m[1] : "";
  }

  /* Всё, что открывается файлом: документы TeX с PDF и серии матцентра.
     Общий список для «Свежего» и поиска. */
  function fileItems() {
    var out = (DATA.tex || []).filter(function (d) { return d.pdf; }).map(function (d) {
      return { title: d.title, sub: docKind(d), href: pdfHref(d.pdf),
               color: docColor(d), date: d.date, thumb: d.thumb, key: d.tex };
    });
    DATA.files.forEach(function (f) {
      var t = seriesTitle(f.path);
      if (t) out.push({ title: t, sub: "Математика", href: pdfHref(f.path), thumb: f.thumb,
                        color: sectionColor("math"), date: f.date, key: fileName(f.path) });
    });
    return out;
  }

  /* Свежее — пять последних изменённых файлов из всех разделов, наверху
     первой вкладки: открывая сайт, чаще всего ищут то, что появилось только
     что, — новую серию, новый листок. Заголовок тихий, без плашки: это
     полка, а не раздел, и плашек на вкладке и так пять. При равных датах
     порядок как в списках. */
  var FRESH = 5;

  function freshShelf(main) {
    var items = fileItems().filter(function (x) { return x.date; });
    items = items.map(function (x, i) { x.i = i; return x; }).sort(function (a, b) {
      return b.date.localeCompare(a.date) || a.i - b.i;
    }).slice(0, FRESH);
    if (!items.length) return;
    var shelf = panel(block(main, "Свежее", "quiet"));
    items.forEach(function (x) {
      row(shelf, x.href, x.title,
          { sub: x.sub, aside: shortDate(x.date), color: x.color, thumb: x.thumb });
    });
  }

  function viewProekty(main) {
    /* Оглавление вкладки: блок и сколько в нём. Нажатие доводит до блока —
       на телефоне вкладка в несколько экранов, и листать к «Стилям» через
       весь зачёт незачем. Тихие пилюли без рамки: плашек на экране и так
       столько, сколько их терпит приём. */
    var toc = el("nav", "toc");
    toc.setAttribute("aria-label", "Блоки вкладки");
    main.appendChild(toc);
    function tocAdd(list, title, n) {
      var box = list.parentNode;
      var b = el("button", "toc-pill");
      b.type = "button";
      b.appendChild(icon(blockIcon(title)));
      b.appendChild(el("span", null, title));
      b.appendChild(el("span", "toc-n", String(n)));
      b.addEventListener("click", function () {
        var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
        box.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      });
      toc.appendChild(b);
    }

    freshShelf(main);

    /* Анимации. Кроме названия — стадия производства: по списку должно быть
       видно, что снято, а что ещё только пишется. Дальше продвинутые — выше. */
    var anim = byVid("animatsiya").sort(function (a, b) {
      return stageOf(b) - stageOf(a) || a.title.localeCompare(b.title, "ru");
    });
    var list = block(main, "Анимации", "warm", anim.length);
    tocAdd(list, "Анимации", anim.length);
    /* Одной панелью строк: стадия — точкой её цвета и подписью под
       названием. У ролика с адресом видео (поле `video` карточки) строка
       ведёт прямо на видео, справа ▶ — за готовым роликом сюда и приходят;
       без адреса — в карточку проекта. */
    if (anim.length) {
      var reel = panel(list);
      anim.forEach(function (n) {
        var st = n.fm.stadiya || STAGES[0];
        var video = n.fm.video;
        row(reel, video || "#/n/" + encodeURI(n.path), n.title,
            { sub: st, dot: "st-" + stageOf(n), aside: video ? "▶" : "",
              label: video ? "Смотреть ролик: " + n.title : "" });
      });
    } else empty(list, "Роликов пока нет.");

    /* Сайты. Строка ведёт прямо на сайт (поле `ssylka`): за ним и приходят,
       а описание в заметке читают раз. У кондуитов под строкой — тихая
       строка «Редактор»: писать туда может только владелец, и с главной
       сайта туда не попасть, она про это не знает. Без неё редактор стал бы
       недоступен совсем: прежде кнопка жила в заметке, а заметку теперь
       не открывают. */
    var sites = byVid("sait");
    list = block(main, "Сайты", "cold", sites.length);
    tocAdd(list, "Сайты", sites.length);
    if (sites.length) {
      var web = panel(list);
      sites.forEach(function (n) {
        row(web, n.fm.ssylka || "#/n/" + encodeURI(n.path), n.title,
            { sub: n.fm.repo || "", icon: "globe" });
        if (n.fm.redaktor) {
          row(web, n.fm.redaktor, "Редактор", { aside: "↗", label: "Редактор: " + n.title })
            .classList.add("row-aux");
        }
      });
    } else empty(list, "Сайтов пока нет.");

    /* Документы TeX. Список берётся прямо из файлов: исходник и собранный PDF
       рядом. Группа документа — его папка: листки репетиторства — своим
       блоком, всё остальное — статьи. Документ без PDF здесь не показывается:
       открыть его нечем — это служебные ответы к листкам и всё, что выкладка
       не отдаёт наружу.

       Зачёта здесь нет с 2026-10-07: он прошёл, его документы — в архиве
       на сайте кружка, а выкладка их больше не отдаёт (EXCLUDE_DIRS
       в tools/publish.py).

       Тона блоков все разные — соседние плашки одного оттенка сливаются. */
    var docs = (DATA.tex || []).filter(function (d) { return d.pdf; });

    var tut = docs.filter(function (d) { return d.group === "tutoring"; });
    list = block(main, "Репетиторство", "moss", tut.length);
    tocAdd(list, "Репетиторство", tut.length);
    tutoringGroups(list, tut);
    if (!tut.length) empty(list, "Листков пока нет.");

    /* Статьи: документы из корня tex/documents/ — одной панелью строк,
       любая его подпапка — своей группой, с README вместо заголовка
       и строкой «как устроено» внутри. Новая подпапка появится без правки
       кода. Шпаргалки кружка ML (tex/documents/ml/) сюда не идут: они
       во вкладке «ИИ», как листки физики — во «Физике». */
    var rest = docs.filter(function (d) {
      return d.group !== "tutoring" && !isPhysics(d) && !isMl(d);
    });
    list = block(main, "Статьи", "rose", rest.length);
    tocAdd(list, "Статьи", rest.length);
    var loose = rest.filter(function (d) { return !d.group; });
    if (loose.length) {
      var shelf = panel(list);
      loose.forEach(function (d) {
        row(shelf, pdfHref(d.pdf), d.title, { aside: shortDate(d.date), thumb: d.thumb });
      });
    }
    var subs = [];
    rest.forEach(function (d) {
      if (d.group && subs.indexOf(d.group) < 0) subs.push(d.group);
    });
    subs.forEach(function (g) {
      var mine = rest.filter(function (d) { return d.group === g; });
      var readme = noteAt("tex/documents/" + g + "/README.md");
      var body = group(list, "tex:" + g, readme ? readme.title : g, files(mine.length));
      mine.forEach(function (d) {
        row(body, pdfHref(d.pdf), d.title, { aside: shortDate(d.date), thumb: d.thumb });
      });
      if (readme) row(body, "#/n/" + encodeURI(readme.path), "Как устроено", { aside: "→" })
        .classList.add("row-aux");
    });
    if (!rest.length) empty(list, "Статей пока нет.");

    /* Стили всех проектов — своим блоком в конце: это справочник,
       а не работы, и в списках работ он только мешался. Отбор по типу
       `style`, из какой бы папки заметка ни была: прежде каждый стиль лежал
       в конце своего проекта, путь был зашит, и вики-ссылка `[[style]]`
       вела не туда. Новый стиль появится здесь без правки кода; строка
       под названием — поле `kratko`. */
    var styles = DATA.notes
      .filter(function (n) { return n.fm.type === "style"; })
      .sort(function (a, b) { return a.title.localeCompare(b.title, "ru"); });
    list = block(main, "Стили", "slate", styles.length);
    tocAdd(list, "Стили", styles.length);
    if (styles.length) {
      var book = panel(list);
      styles.forEach(function (n) {
        row(book, "#/n/" + encodeURI(n.path), n.title, { sub: n.fm.kratko || "", icon: "palette" });
      });
    } else empty(list, "Стилей пока нет.");
  }

  /* ── вкладка «Роли» ──────────────────────────────────── */

  /* Своя вкладка, а не блок в конце «Проектов»: промпт копируют перед тем,
     как завести сессию, и искать его прокруткой чужого списка — ровно то,
     из-за чего он раньше и не находился. */
  function viewRoli(main) {
    var all = DATA.notes.filter(function (n) { return n.fm.type === "rol"; });
    var readme = all.filter(function (n) { return /README\.md$/.test(n.path); })[0];
    var roles = all.filter(function (n) { return n !== readme; }).sort(function (a, b) {
      return roleOrder(a) - roleOrder(b) || a.title.localeCompare(b.title, "ru");
    });
    var list = block(main, "Роли", "ans", roles.length);
    roles.forEach(function (n) { list.appendChild(roleCard(n)); });
    if (!roles.length) empty(list, "Ролей пока нет.");
    /* Как всем этим пользоваться — тихой строкой внизу, а не первой
       карточкой: читают это один раз, а промпты копируют каждый день. */
    if (readme) {
      row(panel(list), "#/n/" + encodeURI(readme.path), "Как устроены роли",
          { aside: "→" }).classList.add("row-aux");
    }
  }

  /* ── вкладка «Физика» ────────────────────────────────── */

  /* С октября 2026 физика ведётся листками, а не базой разборов и приёмов:
     прежние разборы и приёмы лежат в physics/arhiv/ и на сайт не идут.
     Наверху план обучения — заметки раздела с `type: plan`, — ниже листки
     блоками по подпапкам physics/listki/. Четыре известные подпапки идут
     в своём порядке и со своими названиями; любая новая появится следом
     отдельным блоком, с заголовком из своего README или по имени папки. */

  var PHYS_GROUPS = [
    ["serii", "Серии", "ans"],
    ["razbory", "Разборы", "moss"],
    ["eksperiment", "Эксперимент", "warm"],
    ["teoriya", "Теория", "cold"]
  ];

  function isPhysics(d) {
    return d.group === "physics" || String(d.group).indexOf("physics/") === 0;
  }

  function viewPhysics(main) {
    var plan = DATA.notes.filter(function (n) {
      return n.folder === "physics" && n.fm.type === "plan";
    }).sort(function (a, b) { return a.title.localeCompare(b.title, "ru"); });
    var list = block(main, "План обучения", "sheet");
    plan.forEach(function (n) { list.appendChild(card(n, { note: n.fm.kratko || "" })); });
    if (!plan.length) empty(list, "Плана пока нет.");

    var docs = (DATA.tex || []).filter(isPhysics);
    var known = PHYS_GROUPS.map(function (g) { return g[0]; });

    PHYS_GROUPS.forEach(function (g) {
      var mine = docs.filter(function (d) { return d.group === "physics/" + g[0]; });
      list = block(main, g[1], g[2]);
      mine.forEach(function (d) { list.appendChild(texCard(d)); });
      if (!mine.length) empty(list, "Листков пока нет.");
    });

    var extra = [];
    docs.forEach(function (d) {
      var sub = d.group.replace(/^physics\/?/, "");
      if (known.indexOf(sub) < 0 && extra.indexOf(sub) < 0) extra.push(sub);
    });
    extra.forEach(function (sub) {
      var readme = noteAt("physics/listki/" + (sub ? sub + "/" : "") + "README.md");
      list = block(main, readme ? readme.title : (sub || "Листки"), "slate");
      docs.filter(function (d) { return d.group.replace(/^physics\/?/, "") === sub; })
        .forEach(function (d) { list.appendChild(texCard(d)); });
    });
  }

  /* ── вкладка «Математика» ────────────────────────────── */

  /* С октября 2026 математика — серии матцентра и отметки о решённом, без
     разборов и приёмов (они в math/arhiv/ и на сайт не идут). Всё берётся из
     двух таблиц math/serii.md: «Прогресс» даёт наборы, даты и имя листка,
     «Задачи» — номера и отметки. Обе пишет синхронизация с кондуитом, поэтому
     новая серия появляется здесь сама. Свежая серия наверху: смотрят её. */

  var SERII = "math/serii.md";

  /* Строки таблицы, у которой первая колонка шапки называется `first`. */
  function mdRows(src, first) {
    var out = [], on = false;
    src.split("\n").forEach(function (line) {
      if (line.charAt(0) !== "|") { on = false; return; }
      var cells = line.replace(/^\||\|\s*$/g, "").split("|")
        .map(function (c) { return c.trim(); });
      if (cells[0] === first) { on = true; return; }
      if (on && !/^-+$/.test(cells[0])) out.push(cells);
    });
    return out;
  }

  function isExercise(t) { return /\(упр\)/.test(t[3] || ""); }

  /* Карточка набора: листок по нажатию, даты, счёт и задачи кружками.
     Решённая залита цветом раздела, упражнение обведено пунктиром. */
  function setCard(r, tasks) {
    var name = r[0], file = r[6];
    var path = file && file !== "—" ? "math/serii/" + file : "";
    var sheet = path && DATA.files.filter(function (f) { return f.path === path; })[0];
    var has = !!sheet;
    /* С миниатюрой листка слева — серия узнаётся по первой странице. Всё
       остальное карточки уходит в тело справа от неё. */
    var card = el(has ? "a" : "div", "card" + (sheet && sheet.thumb ? " has-thumb" : ""));
    if (has) outward(card).href = pdfHref(path);
    card.style.setProperty("--sec", sectionColor("math"));
    var a = card;
    if (sheet && sheet.thumb) {
      card.appendChild(thumbImg(sheet.thumb, "card-thumb"));
      a = el("div", "card-body");
      card.appendChild(a);
    }

    var mine = tasks.filter(function (t) { return t[1] === name; });
    var counted = mine.filter(function (t) { return !isExercise(t); });
    var done = counted.filter(function (t) { return t[4] === "да"; }).length;

    var top = el("div", "card-top");
    top.appendChild(el("span", "card-title", name));
    var meta = el("div", "card-meta");
    meta.appendChild(el("span", "tag", done + " из " + counted.length));
    top.appendChild(meta);
    a.appendChild(top);

    /* Полоска решённого — та же доля, что «7 из 8» рядом, поэтому читалке
       экрана она не нужна. */
    if (counted.length) {
      var bar = el("div", "progress");
      bar.setAttribute("aria-hidden", "true");
      var fill = el("span");
      fill.style.width = Math.round(100 * done / counted.length) + "%";
      /* Доля — для цвета: чем полнее, тем гуще фиолетовый. В кубе: почти все
         серии решены на 3/4 и больше, и при прямой шкале 6 из 8 и 8 из 8
         сливались по цвету. Куб растягивает именно этот верхний край. */
      fill.style.setProperty("--p", Math.pow(done / counted.length, 3).toFixed(3));
      bar.appendChild(fill);
      a.appendChild(bar);
    }

    var dates = [];
    if (r[4] && r[4] !== "—") dates.push("выдана " + r[4]);
    if (r[5] && r[5] !== "—") dates.push("занятие " + r[5]);
    if (dates.length) a.appendChild(el("div", "card-note", dates.join(" · ")));

    var marks = el("div", "marks");
    mine.forEach(function (t) {
      var on = t[4] === "да";
      var m = el("span", "mark" + (on ? " on" : "") + (isExercise(t) ? " ex" : ""),
        t[0].replace(/^\d+\./, ""));
      m.title = t[3].replace(/ \(упр\)$/, "") + (on ? " · решена" : "");
      marks.appendChild(m);
    });
    if (mine.length) a.appendChild(marks);
    return card;
  }

  function fillMath(host, src) {
    var sets = mdRows(src, "Набор").filter(function (r) { return r[0].indexOf("**") !== 0; });
    var tasks = mdRows(src, "№");
    var series = sets.filter(function (r) { return /^Серия/.test(r[0]); }).reverse();

    var list = block(host, "Серии", "ans");
    series.forEach(function (r) { list.appendChild(setCard(r, tasks)); });
    if (!series.length) empty(list, "Серий пока нет.");

    /* Всё, что не серия, — гробарий и что появится ещё, — своим блоком. */
    sets.filter(function (r) { return !/^Серия/.test(r[0]); }).forEach(function (r) {
      block(host, r[0], "slate").appendChild(setCard(r, tasks));
    });
  }

  function viewMath(main) {
    if (SRC[SERII] != null) return fillMath(main, SRC[SERII]);
    var host = el("div");
    main.appendChild(host);
    loadNote(SERII).then(function (src) { fillMath(host, src); }).catch(function () {
      empty(block(host, "Серии", "ans"), "Таблица серий не загрузилась.");
    });
  }

  /* ── вкладка «ИИ» ────────────────────────────────────── */

  /* Шпаргалки кружка — PDF из tex/documents/ml/ и любой его подпапки,
     карточкой, которая открывает сам файл. Новая шпаргалка появится здесь
     без правки кода. */
  function isMl(d) {
    return d.group === "ml" || String(d.group).indexOf("ml/") === 0;
  }

  /* Ниже — конспекты и описание раздела: все заметки из ml/, по названию.
     Задач и приёмов здесь больше нет: с октября 2026 эта схема снята везде. */
  function viewMl(main) {
    var docs = (DATA.tex || []).filter(function (d) { return d.pdf && isMl(d); });
    var list = block(main, "Шпаргалки", "warm", docs.length);
    docs.forEach(function (d) { list.appendChild(texCard(d)); });
    if (!docs.length) empty(list, "Шпаргалок пока нет.");

    var mine = DATA.notes.filter(function (n) {
      return n.folder === "ml" || n.folder.indexOf("ml/") === 0;
    }).sort(function (a, b) { return a.title.localeCompare(b.title, "ru"); });
    list = block(main, "Конспекты", "cold");
    mine.forEach(function (n) { list.appendChild(card(n, {})); });
    if (!mine.length) empty(list, "Конспектов пока нет.");
  }

  /* ── заметка ─────────────────────────────────────────── */

  var META = [["sbornik", ""], ["stadiya", ""], ["tema", ""], ["data", ""]];

  function viewNote(main, path) {
    var note = noteAt(path);
    if (!note) { main.appendChild(el("div", "empty", "Такой заметки нет.")); return; }

    main.appendChild(backButton());

    /* Ссылки наружу — отдельными кнопками: по самой карточке уходить со страницы
       нельзя, иначе описания не прочитать. Готовый ролик лежит не в репозитории,
       а на Диске или видеохостинге — сюда попадает только адрес.

       У кондуитов есть вторая страница, редактор: читать может кто угодно,
       а писать — только владелец репозитория, и попасть туда с главной нельзя,
       она про это не знает. Поле `redaktor` и есть тот адрес. */
    [["ssylka", "Открыть сайт ↗"],
     ["redaktor", "Редактор ↗"],
     ["video", "Смотреть ролик ↗"]].forEach(function (f) {
      var url = note.fm[f[0]];
      if (!url) return;
      var out = el("a", "ext", f[1]);
      out.href = url;
      out.target = "_blank";
      out.rel = "noopener";
      main.appendChild(out);
    });

    var box = el("article", "note");
    main.appendChild(box);

    var meta = el("div", "meta");
    META.forEach(function (f) {
      var v = note.fm[f[0]];
      if (v === undefined || v === null || v === "") return;
      meta.appendChild(el("span", "chip", f[1] + v));
    });
    /* Путь в knowledge — тоже поле шапки, по нему заметку ищут в репозитории. */
    meta.appendChild(el("span", "chip mono", note.fm.fail || note.path));

    function fill(src) {
      var body = el("div");
      renderMarkdown(stripFrontmatter(src), body);
      box.innerHTML = "";
      /* Заголовок берём из самого текста, если он там есть: дублировать его
         над заметкой значит показать одно и то же дважды. */
      var h1 = body.querySelector("h1");
      box.appendChild(h1 || el("h1", null, note.title));
      box.appendChild(meta);
      groupSections(body);
      box.appendChild(body);
      renderBacklinks(main, note);
    }

    /* Текст обычно уже лежит в памяти: его запросили до начала перехода.
       Тогда рисуем сразу, без единого кадра пустоты — даже каркас показать
       не успеваем, и его тут быть не должно. */
    if (SRC[path] != null) return fill(SRC[path]);

    /* Не успел приехать — значит, сеть медленная, и каркас уместен. */
    box.appendChild(el("h1", null, note.title));
    var wait = el("div", "skeleton");
    for (var k = 0; k < 4; k++) wait.appendChild(el("span", "skel-row"));
    box.appendChild(wait);

    loadNote(path).then(fill).catch(function () {
      box.innerHTML = "";
      box.appendChild(el("h1", null, note.title));
      box.appendChild(el("div", "empty", "Файл не открылся."));
    });
  }

  function renderBacklinks(main, note) {
    var from = BACK[note.path] || [];
    var notes = [];
    from.forEach(function (p) { var n = noteAt(p); if (n) notes.push(n); });
    if (!notes.length) return;

    var box = el("section", "backlinks");
    box.appendChild(el("h2", null, "Ссылаются сюда"));
    var list = el("div", "list");
    notes.forEach(function (n) { list.appendChild(card(n, {})); });
    box.appendChild(list);
    main.appendChild(box);
  }

  /* Страницы «о файле» больше нет: всё открывает файл сразу. Старый адрес
     #/f/… — из закладки или пересланной ссылки — ведёт прямо в PDF, а не
     в никуда. replace, а не переход: кнопка «назад» вернёт туда, откуда
     пришли, а не на этот промежуточный адрес. */
  function viewFile(main, path) {
    location.replace(pdfHref(path));
  }

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    return b === 1 ? one : many;
  }

  function backButton() {
    var b = el("a", "back", "← Назад");
    b.href = "#/";
    return b;
  }

  function stripFrontmatter(src) {
    return src.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  }

  /* ── поиск ───────────────────────────────────────────────

     По названиям, а не по тексту: за полнотекстовым поиском пришлось бы
     держать индекс, а ищут обычно то, что помнят по имени, — «трёхчлен»,
     «серия 7», «инволюции». Поле над вкладками, потому что ищет по всем
     сразу; пока в нём что-то написано, вместо вкладки — найденное.

     Слова запроса должны найтись все, в любом порядке, в названии, подписи
     или имени файла; «ё» и «е» не различаются. Выше — то, что начинается
     с запроса, потом то, где он в названии, потом остальное. Каждый пункт
     ведёт туда же, куда и в своей вкладке: файл — в файл, сайт — на сайт. */
  var QUERY = "";
  var CORPUS = null;
  var FOUND_MAX = 60;

  var ROOT_LABEL = {
    "physics": "Физика", "math": "Математика", "ml": "ИИ",
    "manim": "Канал и ролики", "web": "Сайты", "tex": "TeX", "roli": "Роли"
  };

  function norm(s) {
    return String(s || "").toLowerCase().replace(/ё/g, "е");
  }

  function noteHref(n) {
    if (n.fm.vid === "sait" && n.fm.ssylka) return n.fm.ssylka;
    if (n.fm.vid === "animatsiya" && n.fm.video) return n.fm.video;
    return "#/n/" + encodeURI(n.path);
  }

  function noteKind(n) {
    if (n.fm.vid === "animatsiya") return "Ролик · " + (n.fm.stadiya || STAGES[0]);
    if (n.fm.vid === "sait") return "Сайт";
    if (n.fm.type === "rol") return "Роль";
    if (n.fm.type === "style") return "Стиль";
    return ROOT_LABEL[n.folder.split("/")[0]] || "Заметка";
  }

  function corpus() {
    if (CORPUS) return CORPUS;
    var all = fileItems().concat(DATA.notes.map(function (n) {
      return { title: n.title, sub: noteKind(n), href: noteHref(n),
               color: sectionColor(n.folder), key: fileName(n.path) };
    }));
    all.forEach(function (x, i) {
      x.i = i;
      x.t = norm(x.title);
      x.hay = norm(x.title + " " + x.sub + " " + x.key);
    });
    return (CORPUS = all);
  }

  function search(q) {
    var words = norm(q).split(/\s+/).filter(Boolean);
    var whole = words.join(" ");
    function rank(x) {
      if (x.t.indexOf(whole) === 0) return 0;
      return words.every(function (w) { return x.t.indexOf(w) >= 0; }) ? 1 : 2;
    }
    return corpus()
      .filter(function (x) { return words.every(function (w) { return x.hay.indexOf(w) >= 0; }); })
      .map(function (x) { return { x: x, r: rank(x) }; })
      .sort(function (a, b) { return a.r - b.r || a.x.i - b.x.i; })
      .map(function (p) { return p.x; });
  }

  function viewSearch(main) {
    var found = search(QUERY);
    var list = block(main, "Найдено", "quiet", found.length);
    if (!found.length) { empty(list, "Ничего не нашлось."); return; }
    var shelf = panel(list);
    found.slice(0, FOUND_MAX).forEach(function (x) {
      row(shelf, x.href, x.title,
          { sub: x.sub, aside: shortDate(x.date), color: x.color, thumb: x.thumb });
    });
    if (found.length > FOUND_MAX) {
      list.appendChild(el("div", "empty", "Показаны первые " + FOUND_MAX + " — уточните запрос."));
    }
  }

  /* Набор в поле перерисовывает экран сразу, без перехода: движение на каждую
     букву читалось бы как мигание. */
  function showSearch() {
    var main = document.getElementById("main");
    main.classList.remove("leaving", "entering");
    main.innerHTML = "";
    if (QUERY) viewSearch(main);
    else paint();
  }

  /* Сброс без перерисовки — когда дальше всё равно будет переход. */
  function dropSearch() {
    QUERY = "";
    var input = document.getElementById("search");
    if (input) input.value = "";
  }

  function bindSearch() {
    var form = document.getElementById("search-form");
    var input = document.getElementById("search");
    if (!form || !input) return;
    input.addEventListener("input", function () {
      var q = input.value.trim();
      if (q === QUERY) return;
      QUERY = q;
      showSearch();
    });
    /* Enter — первое найденное: чаще всего за ним и пришли. */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var first = document.querySelector("#main .row");
      if (QUERY && first) first.click();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && input.value) {
        dropSearch();
        showSearch();
      }
    });
    /* Ссылка на тот же адрес, где уже стоим, — название сайта или найденная
       заметка, открытая под полем, — перехода не вызывает, и найденное
       осталось бы на экране. Сбрасываем его сами. */
    document.addEventListener("click", function (e) {
      if (!QUERY) return;
      var a = e.target.closest && e.target.closest("a[href^='#']");
      if (!a) return;
      var href = a.getAttribute("href");
      if (href === location.hash || (href === "#/" && !location.hash)) {
        dropSearch();
        showSearch();
      }
    });
  }

  /* ── указатель вкладок ───────────────────────────────── */

  /* Указатель один на всю полосу и переезжает с вкладки на вкладку. Положение
     берётся по месту самой вкладки, поэтому верно при любой ширине экрана
     и любой длине подписей. Координата — в системе содержимого полосы, вместе
     с её прокруткой, чтобы указатель ехал заодно с ней. */
  var thumbReady = false;

  function moveThumb() {
    var tabs = document.querySelector(".tabs");
    if (!tabs) return;
    var active = tabs.querySelector('.tab[aria-selected="true"]');
    if (!active) return;

    var t = tabs.getBoundingClientRect();
    var a = active.getBoundingClientRect();
    var edge = parseFloat(getComputedStyle(tabs).borderLeftWidth) || 0;

    if (!thumbReady) tabs.classList.add("no-anim");
    tabs.style.setProperty("--thumb-x", (a.left - t.left - edge + tabs.scrollLeft) + "px");
    tabs.style.setProperty("--thumb-w", a.width + "px");
    if (!thumbReady) {
      void tabs.offsetWidth;
      tabs.classList.remove("no-anim");
      thumbReady = true;
    }

    /* Вкладок может быть больше, чем помещается: подвозим выбранную к краю,
       чтобы указатель не уезжал за пределы видимого. */
    var pad = 12;
    if (a.left < t.left + pad) {
      tabs.scrollBy({ left: a.left - t.left - pad - 8, behavior: "smooth" });
    } else if (a.right > t.right - pad) {
      tabs.scrollBy({ left: a.right - t.right + pad + 8, behavior: "smooth" });
    }
  }

  /* ── смена экрана ────────────────────────────────────── */

  /* Куда уходит старое содержимое и откуда приходит новое. Смысл в направлении:
     открыли заметку — она приходит снизу, будто шагнули вглубь; вернулись
     в список — он опускается сверху, тем же путём назад; сменили вкладку —
     движение нейтральное, соседний экран не глубже и не выше. Величины
     намеренно маленькие: это подсказка о направлении, а не переезд. */
  var OUT_DY = { tab: "-4px", open: "-6px", back: "6px" };
  var IN_DY = { tab: "8px", open: "12px", back: "-9px" };

  var swapToken = 0;
  var enterBound = false;

  function bindEnter(main) {
    if (enterBound) return;
    enterBound = true;
    /* Класс держится только на время движения: оставленный навсегда, он держал
       бы отдельный слой отрисовки под весь экран. Чужое движение всплывает сюда
       же изнутри, поэтому проверяем, что доиграло именно наше. */
    main.addEventListener("animationend", function (e) {
      if (e.target === main) main.classList.remove("entering");
    });
  }

  /* Класс снимается и ставится заново в один заход: без этого повторная смена
     на тот же экран не переиграла бы анимацию. Обращение к offsetWidth нужно
     затем, чтобы браузер заметил снятие и счёл постановку новой анимацией. */
  function enter(main, dy) {
    bindEnter(main);
    main.style.setProperty("--in-dy", dy);
    main.classList.remove("entering");
    void main.offsetWidth;
    main.classList.add("entering");
  }

  /* Текст заметок держим в памяти: второй раз к той же заметке — уже без сети. */
  var SRC = {};

  function loadNote(path) {
    if (SRC[path] != null) return Promise.resolve(SRC[path]);
    return fetch("data/notes/" + encodeURI(path) + V)
      .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
      .then(function (t) { SRC[path] = t; return t; });
  }

  /* Вкладка «Математика» тоже читает заметку — таблицы серий, и её стоит
     подтянуть заранее так же, как открываемую заметку. */
  function pendingPath() {
    var hash = decodeURI(location.hash.replace(/^#/, ""));
    if (hash.indexOf("/n/") === 0) return hash.slice(3);
    return VIEW === "math" && !isDetail(location.hash) ? SERII : "";
  }

  /* Содержимое сначала уходит, и только потом подменяется. Метка нужна на
     случай двух быстрых нажатий подряд: рисует только последнее.

     Файл заметки запрашивается ДО того, как начнётся движение: пока он едет,
     на экране остаётся прежнее содержимое, и переход играет уже с готовым
     текстом. Иначе получалось обидно — красивый переход, а под ним пустая
     панель, которая только потом наполняется. Ждём не дольше четверти секунды:
     на медленной сети честнее показать каркас, чем держать старый экран. */
  function swap(mode) {
    var path = pendingPath();
    var ready = path
      ? Promise.race([loadNote(path).catch(function () {}), after(250)])
      : Promise.resolve();
    ready.then(function () { runSwap(mode); });
  }

  function after(ms) {
    return new Promise(function (ok) { setTimeout(ok, ms); });
  }

  function runSwap(mode) {
    var main = document.getElementById("main");
    var mine = ++swapToken;
    main.style.setProperty("--out-dy", OUT_DY[mode]);
    main.classList.remove("entering");
    main.classList.add("leaving");
    setTimeout(function () {
      if (mine !== swapToken) return;
      /* Прыжок к началу делаем на погасшем экране: его не видно. */
      window.scrollTo(0, 0);
      main.classList.remove("leaving");
      paint();
      enter(main, IN_DY[mode]);
    }, 80);
  }

  /* ── отрисовка и маршруты ────────────────────────────── */

  function paint() {
    var main = document.getElementById("main");
    main.innerHTML = "";
    var hash = decodeURI(location.hash.replace(/^#/, ""));

    if (QUERY) return viewSearch(main);
    if (hash.indexOf("/n/") === 0) return viewNote(main, hash.slice(3));
    if (hash.indexOf("/f/") === 0) return viewFile(main, hash.slice(3));

    if (VIEW === "physics") return viewPhysics(main);
    if (VIEW === "math") return viewMath(main);
    if (VIEW === "ml") return viewMl(main);
    if (VIEW === "roli") return viewRoli(main);
    return viewProekty(main);
  }

  function isDetail(hash) {
    return hash.indexOf("#/n/") === 0 || hash.indexOf("#/f/") === 0;
  }

  var lastHash = location.hash;

  function onHashChange() {
    var was = isDetail(lastHash), now = isDetail(location.hash);
    lastHash = location.hash;
    /* Переход из найденного — выбор сделан, поле больше не нужно. */
    dropSearch();
    swap(now && !was ? "open" : (!now && was ? "back" : "tab"));
  }

  function bindTabs() {
    document.getElementById("tabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".tab");
      if (!btn) return;
      /* Нажатие на вкладку убирает найденное. Если она и так выбрана,
         только это и нужно сделать — вернуть её содержимое. */
      var searching = !!QUERY;
      dropSearch();
      if (btn.getAttribute("aria-selected") === "true") {
        if (searching) swap("tab");
        return;
      }
      VIEW = btn.dataset.view;
      document.querySelectorAll(".tab").forEach(function (t) {
        t.setAttribute("aria-selected", String(t === btn));
      });
      moveThumb();
      /* Смена вкладки из карточки возвращает в список: адрес меняется, и всё
         остальное доделает обработчик хеша. */
      if (isDetail(location.hash)) { location.hash = "#/"; return; }
      swap("tab");
    });
  }

  /* Отклик на касание. Класс ставится на pointerdown, а не через :active:
     браузер придерживает :active, пока не убедится, что палец не поехал
     прокручивать, и на быстром тапе состояние не успевает появиться. */
  function enableTapFeedback() {
    document.addEventListener("pointerdown", function (e) {
      var node = e.target.closest &&
        e.target.closest(".tab, .chip, a.card, a.back, a.ext, a.row, .group-head, .toc-pill, " +
                         "a.brand, button.copy, a.role-main");
      if (!node) return;
      /* Карточка роли — не ссылка целиком: в ней ссылка и кнопка. Нажатие
         на ссылку отзывается всей карточкой, как у обычной карточки. */
      if (node.classList.contains("role-main")) node = node.parentNode;
      node.classList.remove("tap");
      void node.offsetWidth;
      node.classList.add("tap");
    }, { passive: true });
  }

  /* ── запуск ──────────────────────────────────────────── */

  /* Если страница пришла из кэша, а данные уже новее — перезагружаемся по адресу
     с новой меткой: тот же кэш по нему промахнётся и отдаст свежий HTML. Метка
     в адресе заодно защищает от петли: второй раз условие не сработает. */
  function checkStale(config) {
    var meta = document.querySelector('meta[name="build"]');
    var page = meta ? meta.content : null;
    var fresh = config.build;
    if (!page || !fresh || page === fresh) return false;
    if (new URLSearchParams(location.search).get("b") === fresh) return false;
    location.replace(location.pathname + "?b=" + fresh + location.hash);
    return true;
  }

  function indexAll() {
    DATA.notes.forEach(function (n) {
      var slug = fileName(n.path).replace(/\.md$/, "");
      /* При совпадении имён выигрывает более короткий путь: правило то же, что
         и в вики-ссылках — имя разрешается в ближайший подходящий файл. */
      if (!BY_SLUG[slug] || n.path.length < BY_SLUG[slug].path.length) BY_SLUG[slug] = n;
    });
    /* Приложенные файлы — отдельным списком: заметка с тем же именем всегда
       выигрывает, потому что читают её, а файл к ней приложен. */
    (DATA.files || []).forEach(function (f) {
      var slug = fileName(f.path).replace(/\.[^.]+$/, "");
      if (!BY_FILE[slug] || f.path.length < BY_FILE[slug].path.length) BY_FILE[slug] = f;
    });
    (DATA.tex || []).forEach(function (d) { if (d.pdf) DOC_BY_PDF[d.pdf] = d; });
    DATA.notes.forEach(function (n) {
      (n.links || []).forEach(function (name) {
        var target = BY_SLUG[name];
        if (!target || target.path === n.path) return;
        (BACK[target.path] = BACK[target.path] || []).push(n.path);
      });
    });
  }

  /* Порядок нарочно последовательный, а не Promise.all. Конфиг — единственное,
     что берётся мимо кэша; из него приходит метка сборки, и всё остальное
     запрашивается уже с меткой в адресе. Промах кэша тогда обеспечен самим
     адресом, а не просьбой к браузеру: просьбу он вправе истолковать по-своему,
     и первая же проверка это показала — индекс пришёл старым при свежей метке. */
  fetch("data/config.json", { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      CFG = cfg;
      if (checkStale(CFG)) return null;
      V = "?v=" + (CFG.build || "0");
      return fetch("data/index.json" + V).then(function (r) { return r.json(); });
    })
    .then(function (idx) {
      if (!idx) return;
      DATA = idx;
      DATA.notes = DATA.notes || [];
      DATA.files = DATA.files || [];
      DATA.tex = DATA.tex || [];
      indexAll();
      bindTabs();
      bindSearch();
      enableTapFeedback();
      window.addEventListener("hashchange", onHashChange);
      /* При повороте экрана вкладки меняют ширину — указатель должен успеть. */
      window.addEventListener("resize", moveThumb);
      paint();
      moveThumb();
      /* Пока своя гарнитура не пришла, подписи набраны запасной и меряются
         короче: указатель встал бы уже вкладки и обрезал бы ей текст. */
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveThumb);
    })
    .catch(function () {
      document.getElementById("main").appendChild(
        el("div", "empty", "Данные не загрузились.")
      );
    });
})();
