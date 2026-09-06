/* Хранилище — читалка заметок.
   Сборки нет: Pages раздаёт репозиторий как есть, страница читает data/ прямо в
   браузере. Всё, что нужно знать о базе заранее, лежит в data/index.json —
   его пишет tools/publish.py, потому что каталог браузеру не перечислить. */

(function () {
  "use strict";

  var DATA = null;      /* index.json */
  var CFG = null;       /* config.json */
  var BY_SLUG = {};     /* имя файла без расширения → заметка */
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
      var shown = (label || key).trim();
      if (!note) return "[" + shown + "](#/missing)";
      return "[" + shown + "](#/n/" + encodeURI(note.path) + ")";
    });
  }

  function renderMarkdown(src, host) {
    var math = [];
    var parts = splitCode(src);
    for (var i = 0; i < parts.length; i += 2) {
      parts[i] = wikiLinks(extractMath(parts[i], math));
    }
    host.innerHTML = marked.parse(parts.join(""), { breaks: false, gfm: true });

    host.querySelectorAll("span.math").forEach(function (node) {
      var m = math[+node.dataset.i];
      try {
        katex.render(m.tex, node, { displayMode: m.display, throwOnError: false });
      } catch (e) {
        /* Неверная формула не должна уносить страницу: показываем исходник. */
        node.textContent = "$" + m.tex + "$";
      }
    });

    host.querySelectorAll('a[href="#/missing"]').forEach(function (a) {
      a.className = "missing";
      a.title = "заметки пока нет";
      a.removeAttribute("href");
    });

    /* Широкое прокручивается внутри себя: горизонтальной полосы у страницы быть
       не должно, иначе на телефоне уезжает вся вёрстка. */
    host.querySelectorAll("table").forEach(function (t) {
      var box = el("div", "scroll-x");
      t.parentNode.insertBefore(box, t);
      box.appendChild(t);
    });
  }

  /* ── сборка блоков ───────────────────────────────────── */

  /* На плашке только название. Пояснения оттуда убраны: они удлиняли строку —
     на узком экране плашка вылезала за край, — а сказать что-то важное всё
     равно не успевали. */
  function block(main, title, tone) {
    var box = el("section", "block");
    var head = el("div", "block-head " + tone);
    head.appendChild(el("h2", null, title));
    box.appendChild(head);
    var list = el("div", "list");
    box.appendChild(list);
    main.appendChild(box);
    return list;
  }

  /* Подзаголовок внутри блока — для групп конспектов. Тихий, потому что плашек
     на экране уже столько, сколько их терпит приём. Ссылка на описание группы
     стоит прямо в нём: отдельной карточкой README повторял бы этот же заголовок
     строкой ниже. */
  function subhead(list, text, href) {
    var row = el("div", "subhead");
    row.appendChild(el("span", null, text));
    if (href) {
      var a = el("a", "subhead-link", "правила →");
      a.href = href;
      row.appendChild(a);
    }
    list.appendChild(row);
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
    if (opts.count != null) top.appendChild(el("span", "count", String(opts.count)));
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
    /* Имя файла в knowledge стоит на каждой карточке: по нему заметку находят
       в репозитории, не гадая, как она там называется. */
    meta.appendChild(el("span", "fname", opts.fname || fileName(note.path)));
    top.appendChild(meta);
    a.appendChild(top);

    if (opts.note) a.appendChild(el("div", "card-note", opts.note));
    return a;
  }

  function texCard(d) {
    var a = el("a", "card");
    a.href = d.pdf ? "#/f/" + encodeURI(d.pdf) : "#/";
    a.style.setProperty("--sec", sectionColor("tex"));
    var top = el("div", "card-top");
    top.appendChild(el("span", "card-title", d.title));
    var meta = el("div", "card-meta");
    if (d.pdf) meta.appendChild(el("span", "tag", "PDF"));
    meta.appendChild(el("span", "fname", d.tex));
    top.appendChild(meta);
    a.appendChild(top);
    return a;
  }

  function styleCard(list, path, text) {
    var n = noteAt(path);
    if (!n) return;
    list.appendChild(card(n, { note: text, tag: "стиль" }));
  }

  function empty(list, text) {
    list.appendChild(el("div", "empty", text));
  }

  /* ── вкладка «Проекты» ───────────────────────────────── */

  function byVid(vid) {
    return DATA.notes.filter(function (n) { return n.fm.vid === vid; })
      .sort(function (a, b) { return a.title.localeCompare(b.title, "ru"); });
  }

  function viewProekty(main) {
    /* Анимации. Кроме названия — имя файла со сценами и стадия производства:
       по списку должно быть видно, что снято, а что ещё только пишется. */
    var anim = byVid("animatsiya");
    var list = block(main, "Анимации", "warm");
    anim.forEach(function (n) {
      list.appendChild(card(n, {
        stage: n.fm.stadiya || STAGES[0],
        /* готовый ролик виден прямо в списке — за ним сюда и приходят */
        tag: n.fm.video ? "видео" : "",
        fname: n.fm.fail || fileName(n.path)
      }));
    });
    styleCard(list, "manim/style.md", "палитра, темп, сборка формул, концовка");
    if (!anim.length) empty(list, "Роликов пока нет.");

    /* Сайты. Ссылка ведёт наружу, поэтому открывается отдельной кнопкой внутри
       заметки, а не по самой карточке: иначе описание не прочитать. */
    var sites = byVid("sait");
    list = block(main, "Сайты", "cold");
    sites.forEach(function (n) {
      list.appendChild(card(n, { note: n.fm.repo || "" }));
    });
    styleCard(list, "web/style.md", "подложка, стекло, цвет, движение");
    if (!sites.length) empty(list, "Сайтов пока нет.");

    /* TeX. Список берётся прямо из файлов: исходник и собранный PDF рядом.
       Конспекты собираются в подпапки-проекты — зачёт, например, — и каждая
       такая папка идёт своей группой со своим README вместо заголовка. */
    var docs = DATA.tex || [];
    list = block(main, "Конспекты в TeX", "sheet");

    var groups = [""];
    docs.forEach(function (d) {
      if (d.group && groups.indexOf(d.group) < 0) groups.push(d.group);
    });

    groups.forEach(function (g) {
      var mine = docs.filter(function (d) { return (d.group || "") === g; });
      if (!mine.length) return;
      if (g) {
        var readme = noteAt("tex/documents/" + g + "/README.md");
        subhead(list, readme ? readme.title : g,
                readme ? "#/n/" + encodeURI(readme.path) : "");
      }
      mine.forEach(function (d) { list.appendChild(texCard(d)); });
    });

    styleCard(list, "tex/style.md", "преамбула, макросы, рисунки, правила набора");
    if (!docs.length) empty(list, "Документов пока нет.");
  }

  /* ── предметные вкладки ──────────────────────────────── */

  /* Физика, математика и ИИ устроены одинаково: список задач и список приёмов.
     Различает их только папка, поэтому вид один на три вкладки. */
  function viewSubject(main, root, label) {
    var mine = DATA.notes.filter(function (n) {
      return n.folder === root || n.folder.indexOf(root + "/") === 0;
    });

    var zad = mine.filter(function (n) { return n.fm.type === "zadacha"; })
      .sort(function (a, b) { return (a.fm.nomer || 0) - (b.fm.nomer || 0); });

    var list = block(main, "Задачи", "ans");
    zad.forEach(function (n) {
      list.appendChild(card(n, {
        tag: n.fm.razdel || "",
        note: n.fm.slozhnost ? "сложность " + n.fm.slozhnost : ""
      }));
    });
    if (!zad.length) empty(list, "Разборов пока нет.");

    /* Приёмы по числу встреч: наверху то, что попадается чаще всего, — то есть
       то, что важно помнить. */
    var pri = mine.filter(function (n) { return n.fm.type === "priyom"; })
      .sort(function (a, b) {
        return (b.fm.vstrech || 1) - (a.fm.vstrech || 1) ||
               a.title.localeCompare(b.title, "ru");
      });

    list = block(main, "Приёмы", "moss");
    pri.forEach(function (n) {
      var links = (BACK[n.path] || []).length;
      list.appendChild(card(n, {
        count: n.fm.vstrech || 1,
        tag: n.fm.razdel || "",
        note: links ? "задач: " + links : "ни одной связанной задачи"
      }));
    });
    if (!pri.length) empty(list, "Приёмов пока нет.");

    /* Всё прочее в разделе — конспекты, описание сборника, правила. */
    var rest = mine.filter(function (n) {
      return n.fm.type !== "zadacha" && n.fm.type !== "priyom";
    }).sort(function (a, b) { return a.title.localeCompare(b.title, "ru"); });

    /* Заголовок здесь тихий, а не плашкой: плашка держится на редкости, и три
       штуки на экран — уже предел. Это служебный хвост раздела, он и не должен
       спорить за внимание с задачами и приёмами. */
    if (rest.length) {
      list = block(main, "Ещё в разделе " + label, "quiet");
      rest.forEach(function (n) { list.appendChild(card(n, {})); });
    }
  }

  /* ── заметка ─────────────────────────────────────────── */

  var META = [
    ["razdel", ""], ["vstrech", "встреч: "], ["nomer", "№"],
    ["slozhnost", "сложность "], ["sbornik", ""], ["stadiya", ""],
    ["tema", ""], ["istochnik", "источник: "], ["data", ""]
  ];

  function viewNote(main, path) {
    var note = noteAt(path);
    if (!note) { main.appendChild(el("div", "empty", "Такой заметки нет.")); return; }

    main.appendChild(backButton());

    /* Ссылки наружу — отдельными кнопками: по самой карточке уходить со страницы
       нельзя, иначе описания не прочитать. Готовый ролик лежит не в репозитории,
       а на Диске или видеохостинге — сюда попадает только адрес. */
    [["ssylka", "Открыть сайт ↗"], ["video", "Смотреть ролик ↗"]].forEach(function (f) {
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
    /* Имя файла — тоже поле шапки: заметку ищут в knowledge по нему. */
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
    /* Ради этого всё и затевалось: приём ценен не текстом, а тем, что видно,
       где он уже срабатывал. */
    var from = BACK[note.path] || [];
    if (!from.length) return;
    var box = el("section", "backlinks");
    box.appendChild(el("h2", null, "Ссылаются сюда"));
    var list = el("div", "list");
    from.forEach(function (p) {
      var n = noteAt(p);
      if (n) list.appendChild(card(n, { tag: n.fm.type || "" }));
    });
    box.appendChild(list);
    main.appendChild(box);
  }

  /* Страница документа. Встроенного просмотра нет нарочно: рамка с чужой
     читалкой внутри стеклянной вёрстки выглядит заплатой, а на телефоне ещё
     и листается хуже, чем тот же файл, открытый целиком. Поэтому здесь —
     короткая справка о документе и кнопка. */
  function viewFile(main, path) {
    main.appendChild(backButton());

    var doc = (DATA.tex || []).filter(function (d) { return d.pdf === path; })[0];
    var meta = (DATA.files || []).filter(function (f) { return f.path === path; })[0] || {};
    var name = fileName(path);

    var box = el("article", "note");
    box.appendChild(el("h1", null, doc ? doc.title : meta.title || name));

    var chips = el("div", "meta");
    if (meta.pages) chips.appendChild(el("span", "chip", meta.pages + " " + plural(
      meta.pages, "страница", "страницы", "страниц")));
    if (meta.size) chips.appendChild(el("span", "chip", Math.round(meta.size / 1024) + " КБ"));
    if (doc) chips.appendChild(el("span", "chip mono", doc.tex));
    chips.appendChild(el("span", "chip mono", path));
    box.appendChild(chips);

    /* Если документ входит в проект, его правила лежат в README рядом —
       это единственное осмысленное описание, которое здесь есть. */
    var readme = doc && doc.group
      ? noteAt("tex/documents/" + doc.group + "/README.md") : null;
    if (readme) {
      var p = el("p");
      p.appendChild(document.createTextNode("Часть проекта «"));
      var link = el("a", null, readme.title);
      link.href = "#/n/" + encodeURI(readme.path);
      p.appendChild(link);
      p.appendChild(document.createTextNode("» — там устройство и правила."));
      box.appendChild(p);
    }

    var a = el("a", "ext big", "Открыть PDF ↗");
    a.href = "data/notes/" + encodeURI(path) + V;
    a.target = "_blank";
    a.rel = "noopener";
    box.appendChild(a);

    main.appendChild(box);
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

  function pendingPath() {
    var hash = decodeURI(location.hash.replace(/^#/, ""));
    return hash.indexOf("/n/") === 0 ? hash.slice(3) : "";
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

    if (hash.indexOf("/n/") === 0) return viewNote(main, hash.slice(3));
    if (hash.indexOf("/f/") === 0) return viewFile(main, hash.slice(3));

    if (VIEW === "physics") return viewSubject(main, "physics", "«Физика»");
    if (VIEW === "math") return viewSubject(main, "math", "«Математика»");
    if (VIEW === "ml") return viewSubject(main, "ml", "«ИИ»");
    return viewProekty(main);
  }

  function isDetail(hash) {
    return hash.indexOf("#/n/") === 0 || hash.indexOf("#/f/") === 0;
  }

  var lastHash = location.hash;

  function onHashChange() {
    var was = isDetail(lastHash), now = isDetail(location.hash);
    lastHash = location.hash;
    swap(now && !was ? "open" : (!now && was ? "back" : "tab"));
  }

  function bindTabs() {
    document.getElementById("tabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".tab");
      if (!btn || btn.getAttribute("aria-selected") === "true") return;
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
      var node = e.target.closest && e.target.closest(".tab, .chip, a.card, a.back, a.ext");
      if (!node) return;
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
      if (CFG.subtitle) document.getElementById("subtitle").textContent = CFG.subtitle;
      indexAll();
      bindTabs();
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
