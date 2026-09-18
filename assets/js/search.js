/* Documentation search.
 *
 * Lunr over a JSON index that Jekyll builds from its own pages at /search.json,
 * which is the same mechanism just-the-docs uses and needs nothing beyond the
 * default GitHub Pages build. The index is fetched on the first keystroke
 * rather than on page load, so a reader who never searches never pays for it.
 */
(function () {
  var input = document.getElementById('docs-search-input');
  var results = document.getElementById('docs-search-results');
  if (!input || !results) { return; }

  var index = null;
  var docs = null;
  var loading = null;

  function loadIndex() {
    if (loading) { return loading; }
    loading = fetch(window.ECTLOGGER_SEARCH_INDEX)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        docs = {};
        data.forEach(function (doc) { docs[doc.url] = doc; });
        index = lunr(function () {
          this.ref('url');
          this.field('title', { boost: 10 });
          this.field('section', { boost: 4 });
          this.field('summary', { boost: 3 });
          this.field('body');
          data.forEach(function (doc) { this.add(doc); }, this);
        });
      })
      .catch(function () {
        // A failed index fetch must not leave the box looking broken.
        results.hidden = false;
        results.innerHTML = '<li class="search-empty">Search is unavailable right now.</li>';
      });
    return loading;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(matches) {
    if (!matches.length) {
      results.hidden = false;
      results.innerHTML = '<li class="search-empty">No pages matched.</li>';
      return;
    }
    results.hidden = false;
    results.innerHTML = matches.slice(0, 10).map(function (m) {
      var doc = docs[m.ref];
      return '<li><a href="' + escapeHtml(doc.url) + '">' +
        '<span class="result-title">' + escapeHtml(doc.title) + '</span>' +
        '<span class="result-section">' + escapeHtml(doc.section || 'Documentation') + '</span>' +
        '</a></li>';
    }).join('');
  }

  function search(term) {
    if (!index) { return; }
    var matches;
    try {
      // Prefix search, so "check" finds "checking in" before the word is done.
      matches = index.search(term + '*');
      if (!matches.length) { matches = index.search(term); }
    } catch (e) {
      // Lunr throws on incomplete query syntax mid-typing; treat it as no match.
      matches = [];
    }
    render(matches);
  }

  var timer = null;
  input.addEventListener('input', function () {
    var term = input.value.trim();
    if (term.length < 2) {
      results.hidden = true;
      results.innerHTML = '';
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(function () {
      loadIndex().then(function () { search(term); });
    }, 120);
  });

  input.addEventListener('focus', loadIndex);

  document.addEventListener('click', function (e) {
    if (!results.contains(e.target) && e.target !== input) {
      results.hidden = true;
    }
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      results.hidden = true;
      input.blur();
    }
  });
})();
