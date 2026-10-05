(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const memoryKey = 'dansk-boger:lotr:reading:v1';
  const settingsKey = 'dansk-boger:reader:v1';
  let chapterId = 'prolog';
  let currentId = '';
  let observer;
  let suppressTracking = false;
  let releaseTracking;
  let toastTimer;
  const storage = {
    read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
    write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };

  function toast(message) {
    const target = $('#toast');
    target.textContent = message;
    target.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { target.hidden = true; }, 6000);
  }
  window.studyToast = toast;

  function visibleParagraphs() { return all(`#${chapterId} .reading-paragraph`); }

  function remember(id) {
    const paragraph = document.getElementById(id);
    if (!paragraph || paragraph.closest('.chapter')?.id !== chapterId) return;
    currentId = id;
    const paragraphs = visibleParagraphs();
    const index = paragraphs.indexOf(paragraph);
    $('#reading-position').textContent = `${index + 1} / ${paragraphs.length} parágrafos`;
    $('#reading-progress').value = index + 1;
    $('#reading-progress').max = paragraphs.length;
    storage.write(memoryKey, { chapterId, paragraphId: id });
  }

  function showChapter(id, scroll = false, paragraphId = '') {
    if (!document.getElementById(id)?.classList.contains('chapter')) id = 'prolog';
    window.studyTts.stop();
    chapterId = id;
    all('.chapter').forEach(chapter => { chapter.hidden = chapter.id !== id; });
    all('[data-chapter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.chapter === id)));
    all('.toc-list').forEach(list => { list.hidden = list.dataset.for !== id; });
    const paragraphs = visibleParagraphs();
    remember(paragraphId && document.getElementById(paragraphId)?.closest('.chapter')?.id === id
      ? paragraphId : paragraphs[0].id);
    if (scroll) {
      suppressTracking = true;
      clearTimeout(releaseTracking);
      document.getElementById(currentId).scrollIntoView({ behavior: 'smooth', block: 'center' });
      releaseTracking = setTimeout(() => { suppressTracking = false; }, 900);
    }
    observer?.disconnect();
    paragraphs.forEach(paragraph => observer?.observe(paragraph));
    window.dispatchEvent(new CustomEvent('study:chapter-changed'));
  }

  function readFrom(id, continuous = false) {
    const paragraphs = visibleParagraphs();
    const index = paragraphs.findIndex(paragraph => paragraph.id === id);
    if (index < 0) return;
    const items = (continuous ? paragraphs.slice(index) : [paragraphs[index]])
      .map(paragraph => ({ id: paragraph.id, text: paragraph.querySelector('.paragraph-text').textContent }));
    $('#tts-engine').value && window.studyTts.configure({ engine: $('#tts-engine').value, rate: Number($('#tts-rate').value) });
    window.studyTts.playItems(items, item => {
      all('.reading-paragraph.is-speaking').forEach(paragraph => paragraph.classList.remove('is-speaking'));
      const paragraph = document.getElementById(item.id);
      paragraph.classList.add('is-speaking');
      remember(item.id);
      if ($('#follow-audio').checked) {
        suppressTracking = true;
        clearTimeout(releaseTracking);
        paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
        releaseTracking = setTimeout(() => { suppressTracking = false; }, 900);
      }
    });
  }

  window.addEventListener('study:tts-state', event => {
    const phase = event.detail;
    $('#pause-reading').disabled = phase === 'idle';
    $('#stop-reading').disabled = phase === 'idle';
    $('#pause-reading').textContent = phase === 'paused' ? '▶ Continuar' : 'Ⅱ Pausar';
    $('#audio-state').textContent = phase === 'playing' ? 'Lendo em voz alta' : phase === 'paused' ? 'Áudio pausado' : 'Pronto para ler';
    if (phase === 'idle') all('.is-speaking').forEach(paragraph => paragraph.classList.remove('is-speaking'));
  });
  window.addEventListener('study:tts-message', event => toast(event.detail));

  all('[data-chapter]').forEach(button => button.addEventListener('click', () => {
    history.replaceState(null, '', `#${button.dataset.chapter}`);
    showChapter(button.dataset.chapter, true);
  }));
  $('main').addEventListener('click', event => {
    const playButton = event.target.closest('[data-read]');
    if (playButton) readFrom(playButton.dataset.read);
    const bookmarkButton = event.target.closest('[data-bookmark]');
    if (bookmarkButton) { remember(bookmarkButton.dataset.bookmark); toast('Ponto de leitura salvo.'); }
  });
  $('#read-continuously').addEventListener('click', () => readFrom(currentId, true));
  $('#pause-reading').addEventListener('click', () => {
    if (window.studyTts.phase === 'paused') window.studyTts.resume(); else window.studyTts.pause();
  });
  $('#stop-reading').addEventListener('click', () => window.studyTts.stop());
  $('#resume-reading').addEventListener('click', () => {
    const saved = storage.read(memoryKey);
    if (saved) showChapter(saved.chapterId, true, saved.paragraphId);
  });

  all('.toc-list a').forEach(link => link.addEventListener('click', () => {
    const section = document.getElementById(link.hash.slice(1));
    const first = section?.querySelector('.reading-paragraph');
    suppressTracking = true;
    clearTimeout(releaseTracking);
    releaseTracking = setTimeout(() => { suppressTracking = false; }, 900);
    if (first) remember(first.id);
  }));

  function saveSettings() {
    storage.write(settingsKey, {
      engine: $('#tts-engine').value, rate: $('#tts-rate').value,
      font: $('#font-size').value, theme: $('#theme').value, follow: $('#follow-audio').checked,
    });
  }
  $('#font-size').addEventListener('input', () => {
    document.documentElement.style.setProperty('--reading-size', `${$('#font-size').value}px`);
    saveSettings();
  });
  $('#theme').addEventListener('change', () => {
    document.documentElement.dataset.theme = $('#theme').value;
    saveSettings();
  });
  $('#tts-rate').addEventListener('change', () => {
    window.studyTts.configure({ rate: Number($('#tts-rate').value) }); saveSettings();
  });
  $('#tts-engine').addEventListener('change', () => { window.studyTts.stop(); saveSettings(); });
  $('#follow-audio').addEventListener('change', saveSettings);
  const settings = storage.read(settingsKey);
  if (settings) {
    for (const [key, id] of [['engine', 'tts-engine'], ['rate', 'tts-rate'], ['font', 'font-size'], ['theme', 'theme']]) {
      if (settings[key]) $(`#${id}`).value = settings[key];
    }
    $('#follow-audio').checked = settings.follow !== false;
    document.documentElement.dataset.theme = $('#theme').value;
    document.documentElement.style.setProperty('--reading-size', `${$('#font-size').value}px`);
  }
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      if (suppressTracking || window.studyTts.phase !== 'idle') return;
      const top = entries.filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) remember(top.target.id);
    }, { rootMargin: '-22% 0px -58% 0px', threshold: 0 });
  }

  const saved = storage.read(memoryKey);
  const hashTarget = document.getElementById(location.hash.slice(1));
  const hashChapter = hashTarget?.classList.contains('chapter') ? hashTarget.id : hashTarget?.closest('.chapter')?.id;
  const initialChapter = hashChapter || saved?.chapterId || 'prolog';
  const hasSectionLink = hashTarget && !hashTarget.classList.contains('chapter');
  const restoreSaved = saved && initialChapter === saved.chapterId && !hasSectionLink;
  showChapter(initialChapter, Boolean(restoreSaved), restoreSaved ? saved.paragraphId : '');
  if (hasSectionLink) requestAnimationFrame(() => hashTarget.scrollIntoView());
  window.addEventListener('pagehide', () => window.studyTts.stop());
})();
