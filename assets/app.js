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
  var VIEW = "priyomy";
  var V = "";           /* метка сборки в адресах данных */

  /* Цвет папки. Список закреплён, а не выведен из хеша имени: цвет ничего не
     значит сам по себе, но прыгать при переименовании он не должен. */
  var SECTION = {
    "physics/priyomy": "var(--s1)",
    "physics/zadachi": "var(--s3)",
    "physics": "var(--s3)",
    "tex": "var(--s5)",
    "manim": "var(--s2)",
    "ml": "var(--s6)",
    "algo": "var(--s4)",
    "web": "var(--s7)"
  };

  function sectionColor(folder) {
    var f = folder || "";
    while (f) {
      if (SECTION[f]) return SECTION[f];
      var cut = f.lastIndexOf("/");
      if (cut < 0) break;
      f = f.slice(0, cut);
    }
    return "var(--s8)";
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ── разбор markdown ─────────────────────────────────────

     Порядок здесь важнее самого разбора. Формулы и код вынимаются из текста
     ДО marked: иначе `_` внутри $a_1$ становится курсивом, а `*` — списком,
     и формула разваливается ещё до того, как её увидит KaTeX. Приём стандартный
     — подменить кусок заглушкой, а после разбора вернуть на место. */

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
    /* [[имя]] и [[имя|подпись]]. Имя разрешается по файлу без расширения —
       так же, как оно пишется в заметках. Не нашлось — ссылка остаётся, но
       помечается: видно, куда база растёт. */
    return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, function (_, name, label) {
      var key = name.trim();
      var note = BY_SLUG[key];
      var text2 = (label || key).trim();
      if (!note) return "[" + text2 + "](#/missing 'заметки пока нет')";
      return "[" + text2 + "](#/n/" + encodeURI(note.path) + ")";
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
      a.removeAttribute("href");
    });

    /* Широкое прокручивается внутри себя: горизонтальной полосы у страницы
       быть не должно, иначе на телефоне уезжает вся вёрстка. */
    host.querySelectorAll("table").forEach(function (t) {
      var box = el("div", "scroll-x");
      t.parentNode.insertBefore(box, t);
      box.appendChild(t);
    });
  }

  /* ── списки ──────────────────────────────────────────── */

  function card(note, extra) {
    var a = el("a", "card");
    a.href = "#/n/" + encodeURI(note.path);
    a.style.setProperty("--sec", sectionColor(note.folder));

    var top = el("div", "card-top");
    if (extra && extra.count != null) top.appendChild(el("span", "count", String(extra.count)));
    top.appendChild(el("span", "card-title", note.title));
    if (extra && extra.tag) top.appendChild(el("span", "tag", extra.tag));
    a.appendChild(top);

    if (extra && extra.note) a.appendChild(el("div", "card-note", extra.note));
    return a;
  }

  function empty(text) {
    return el("div", "empty", text);
  }

  function viewPriyomy(main) {
    /* Главный список базы: порядок по числу встреч. Наверху то, что попадается
       чаще всего, — то есть то, что важно помнить. */
    var items = DATA.notes.filter(function (n) { return n.fm.type === "priyom"; });
    if (!items.length) {
      main.appendChild(empty("Приёмов пока нет."));
      return;
    }
    items.sort(function (a, b) {
      return (b.fm.vstrech || 1) - (a.fm.vstrech || 1) || a.title.localeCompare(b.title, "ru");
    });
    var list = el("div", "list");
    items.forEach(function (n) {
      list.appendChild(card(n, {
        count: n.fm.vstrech || 1,
        tag: n.fm.razdel || "",
        note: (BACK[n.path] || []).length
          ? "задач: " + BACK[n.path].length
          : "ни одной связанной задачи"
      }));
    });
    main.appendChild(list);
  }

  function viewZadachi(main) {
    var items = DATA.notes.filter(function (n) { return n.fm.type === "zadacha"; });
    if (!items.length) {
      main.appendChild(empty("Разборов пока нет."));
      return;
    }
    items.sort(function (a, b) { return (a.fm.nomer || 0) - (b.fm.nomer || 0); });
    var list = el("div", "list");
    items.forEach(function (n) {
      list.appendChild(card(n, {
        tag: n.fm.razdel || "",
        note: n.fm.slozhnost ? "сложность " + n.fm.slozhnost : ""
      }));
    });
    main.appendChild(list);
  }

  function viewVse(main) {
    /* Всё, что опубликовано, включая PDF: они и есть готовые конспекты. */
    var all = DATA.notes.concat(DATA.files);
    if (!all.length) {
      main.appendChild(empty("Пока пусто."));
      return;
    }
    var groups = {};
    all.forEach(function (n) { (groups[n.folder] = groups[n.folder] || []).push(n); });

    Object.keys(groups).sort().forEach(function (folder) {
      var head = el("div", "group-head", folder || "корень");
      head.style.setProperty("--sec", sectionColor(folder));
      main.appendChild(head);

      var list = el("div", "list");
      groups[folder]
        .sort(function (a, b) { return a.title.localeCompare(b.title, "ru"); })
        .forEach(function (n) {
          if (n.kind === "pdf") {
            var a = el("a", "card");
            a.href = "#/f/" + encodeURI(n.path);
            a.style.setProperty("--sec", sectionColor(n.folder));
            var top = el("div", "card-top");
            top.appendChild(el("span", "card-title", n.title));
            top.appendChild(el("span", "tag", "PDF"));
            a.appendChild(top);
            list.appendChild(a);
          } else {
            list.appendChild(card(n, { tag: n.fm.type || "" }));
          }
        });
      main.appendChild(list);
    });
  }

  /* ── заметка ─────────────────────────────────────────── */

  var META_FIELDS = [
    ["razdel", ""],
    ["vstrech", "встреч: "],
    ["nomer", "№"],
    ["slozhnost", "сложность "],
    ["sbornik", ""],
    ["tema", ""],
    ["istochnik", "источник: "],
    ["data", ""]
  ];

  function viewNote(main, path) {
    var note = DATA.notes.filter(function (n) { return n.path === path; })[0];
    if (!note) { main.appendChild(empty("Такой заметки нет.")); return; }

    main.appendChild(backButton());

    var box = el("article", "note");
    main.appendChild(box);

    var meta = el("div", "meta");
    META_FIELDS.forEach(function (f) {
      var v = note.fm[f[0]];
      if (v === undefined || v === null || v === "" ) return;
      meta.appendChild(el("span", "chip", f[1] + v));
    });

    fetch("data/notes/" + encodeURI(path) + V)
      .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
      .then(function (src) {
        var body = el("div");
        renderMarkdown(stripFrontmatter(src), body);

        /* Заголовок берём из самого текста, если он там есть: дублировать его
           над заметкой значит показать одно и то же дважды. */
        var h1 = body.querySelector("h1");
        if (h1) {
          box.appendChild(h1);
        } else {
          box.appendChild(el("h1", null, note.title));
        }
        if (meta.children.length) box.appendChild(meta);
        box.appendChild(body);
        renderBacklinks(main, note);
      })
      .catch(function () {
        box.appendChild(el("h1", null, note.title));
        box.appendChild(empty("Файл не открылся."));
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
      var n = DATA.notes.filter(function (x) { return x.path === p; })[0];
      if (n) list.appendChild(card(n, { tag: n.fm.type || "" }));
    });
    box.appendChild(list);
    main.appendChild(box);
  }

  function viewFile(main, path) {
    main.appendChild(backButton());
    var name = path.split("/").pop();

    var a = el("a", "back", "Открыть " + name);
    a.href = "data/notes/" + encodeURI(path) + V;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.marginBottom = "14px";
    main.appendChild(a);

    /* Показывает браузер сам: своя читалка PDF была бы хуже встроенной. */
    var frame = el("iframe", "pdf");
    frame.src = "data/notes/" + encodeURI(path) + V;
    frame.title = name;
    main.appendChild(frame);
  }

  function backButton() {
    var b = el("a", "back", "← Назад");
    b.href = "#/";
    return b;
  }

  function stripFrontmatter(src) {
    return src.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  }

  /* ── маршрутизация ───────────────────────────────────── */

  function route() {
    var main = document.getElementById("main");
    main.innerHTML = "";
    var hash = decodeURI(location.hash.replace(/^#/, ""));

    if (hash.indexOf("/n/") === 0) { viewNote(main, hash.slice(3)); return; }
    if (hash.indexOf("/f/") === 0) { viewFile(main, hash.slice(3)); return; }

    if (VIEW === "zadachi") viewZadachi(main);
    else if (VIEW === "vse") viewVse(main);
    else viewPriyomy(main);
  }

  function bindTabs() {
    document.getElementById("tabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".tab");
      if (!btn) return;
      VIEW = btn.dataset.view;
      document.querySelectorAll(".tab").forEach(function (t) {
        t.setAttribute("aria-selected", String(t === btn));
      });
      if (location.hash && location.hash !== "#/") location.hash = "#/";
      else route();
    });
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
      var slug = n.path.split("/").pop().replace(/\.md$/, "");
      /* При совпадении имён выигрывает более короткий путь: правило то же, что
         и в вики-ссылках, — имя разрешается в ближайший подходящий файл. */
      if (!BY_SLUG[slug] || n.path.length < BY_SLUG[slug].path.length) BY_SLUG[slug] = n;
    });
    DATA.notes.forEach(function (n) {
      (n.links || []).forEach(function (name) {
        var target = BY_SLUG[name];
        if (!target) return;
        (BACK[target.path] = BACK[target.path] || []).push(n.path);
      });
    });
  }

  /* Порядок нарочно последовательный, а не Promise.all. Конфиг — единственное,
     что берётся мимо кэша; из него приходит метка сборки, и всё остальное
     запрашивается уже с меткой в адресе. Промах кэша тогда гарантирован самим
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
    if (CFG.subtitle) document.getElementById("subtitle").textContent = CFG.subtitle;
    DATA.notes = DATA.notes || [];
    DATA.files = DATA.files || [];
    indexAll();
    bindTabs();
    window.addEventListener("hashchange", route);
    route();
  }).catch(function () {
    document.getElementById("main").appendChild(
      el("div", "empty", "Данные не загрузились.")
    );
  });
})();
