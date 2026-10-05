/* Shared ov-dansk customWords vocabulary; each query is scoped to auth.uid. */
(() => {
  'use strict';
  const client = window.studyFirebase;
  const $ = selector => document.querySelector(selector);
  const toast = message => window.studyToast(message);
  const state = {
    user: null, words: [], unsubscribe: null, ticket: 0,
    ready: Promise.resolve(false), selected: '', editing: null,
    overlayId: null, overlayAnchor: null, hideTimer: null, selectionTimer: null,
  };
  const normalizeText = value => String(value).replace(/\s+/g, ' ').trim();
  const termKey = value => normalizeText(value).toLocaleLowerCase('da');
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRef = (uid, id) => client.db.collection('users').doc(uid).collection('customWords').doc(id);
  const collectionRef = uid => client.db.collection('users').doc(uid).collection('customWords');
  const timestamps = () => firebase.firestore.FieldValue.serverTimestamp();

  function hideOverlay() {
    $('#word-overlay').hidden = true;
    state.overlayId = null;
    state.overlayAnchor = null;
    clearTimeout(state.hideTimer);
  }

  function unwrapHighlights() {
    document.querySelectorAll('main mark.study-word').forEach(mark => {
      const parent = mark.parentNode;
      mark.replaceWith(document.createTextNode(mark.textContent));
      parent.normalize();
    });
  }

  function applyHighlights() {
    hideOverlay();
    unwrapHighlights();
    const map = new Map();
    state.words.filter(item => item.term && item.meaning)
      .sort((a, b) => b.term.length - a.term.length)
      .forEach(item => { if (!map.has(termKey(item.term))) map.set(termKey(item.term), item); });
    if (!map.size) return;
    const pattern = [...map.keys()].map(escapeRegExp).join('|');
    const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])`, 'giu');
    // Only the Danish story: exclude navigation, controls, dialogs and notes.
    document.querySelectorAll('main .paragraph-text').forEach(paragraph => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        const text = node.nodeValue;
        regex.lastIndex = 0;
        const matches = [...text.matchAll(regex)];
        if (!matches.length) return;
        const fragment = document.createDocumentFragment();
        let last = 0;
        matches.forEach(match => {
          fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
          const item = map.get(termKey(match[0]));
          const mark = document.createElement('mark');
          mark.className = 'study-word';
          mark.dataset.wordId = item.id;
          mark.tabIndex = 0;
          mark.setAttribute('role', 'button');
          mark.setAttribute('aria-label', `${match[0]}: ver significado`);
          mark.textContent = match[0];
          fragment.appendChild(mark);
          last = match.index + match[0].length;
        });
        fragment.appendChild(document.createTextNode(text.slice(last)));
        node.replaceWith(fragment);
      });
    });
  }

  function renderWords() {
    $('#saved-count').textContent = `${state.words.length} palavras`;
    const list = $('#saved-list');
    list.replaceChildren();
    const query = termKey($('#word-search').value);
    const items = state.words.filter(item => !query || termKey(`${item.term} ${item.meaning}`).includes(query))
      .sort((a, b) => a.term.localeCompare(b.term, 'da'));
    $('#words-empty').hidden = items.length > 0;
    $('#words-empty').textContent = state.user
      ? 'Nenhuma palavra encontrada. Selecione uma palavra ou frase no texto para salvar.'
      : 'Entre com a mesma conta Google do ov-dansk para ver suas palavras.';
    items.forEach(item => {
      const li = document.createElement('li');
      const text = document.createElement('div');
      const term = document.createElement('strong');
      term.textContent = item.term;
      const meaning = document.createElement('p');
      meaning.textContent = item.meaning;
      text.append(term, meaning);
      const actions = document.createElement('div');
      actions.className = 'word-actions';
      for (const [label, action] of [['Ouvir', () => window.studyTts.play(item.term)], ['Editar', () => openEditor(item)], ['Excluir', () => askDelete(item)]]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', action);
        actions.appendChild(button);
      }
      li.append(text, actions);
      list.appendChild(li);
    });
  }

  function attachUser(user) {
    if (state.user?.uid === user?.uid && state.unsubscribe) return;
    state.unsubscribe?.();
    state.unsubscribe = null;
    const ticket = ++state.ticket;
    state.user = user;
    client.user = user;
    state.words = [];
    $('#word-editor').close();
    $('#delete-dialog').close();
    $('#auth-button').textContent = user ? 'Sair' : 'Entrar com Google';
    $('#account-name').textContent = user ? (user.displayName || 'Conta conectada') : 'Mesmo login do ov-dansk';
    $('#vocabulary-state').textContent = user ? 'Carregando palavras…' : 'Entre para sincronizar palavras';
    applyHighlights();
    renderWords();
    if (!user) { state.ready = Promise.resolve(false); return; }
    let settle;
    state.ready = new Promise(resolve => { settle = resolve; });
    state.unsubscribe = collectionRef(user.uid).onSnapshot(snapshot => {
      if (ticket !== state.ticket) return;
      state.words = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
        .filter(item => typeof item.term === 'string' && typeof item.meaning === 'string');
      $('#vocabulary-state').textContent = 'Palavras sincronizadas com ov-dansk';
      applyHighlights();
      renderWords();
      settle(true);
    }, error => {
      if (ticket !== state.ticket) return;
      $('#vocabulary-state').textContent = 'Não foi possível sincronizar';
      settle(false);
      toast('Não foi possível carregar as palavras. Verifique a conexão e tente entrar novamente.');
      console.warn('Vocabulary subscription:', error.code || error.message);
    });
  }

  function authError(error) {
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code)) return;
    if (error.code === 'auth/unauthorized-domain') toast('Este domínio ainda precisa ser autorizado no Firebase do ov-dansk.');
    else if (error.code === 'auth/popup-blocked') toast('Permita a janela de login do Google e tente novamente.');
    else toast('Não foi possível entrar com Google. Verifique a conexão e tente novamente.');
  }

  async function ensureUser() {
    if (!client) { toast('O login não foi carregado. Abra a página online e verifique sua conexão.'); return false; }
    if (!state.user) {
      try {
        const credential = await client.signIn();
        if (state.user?.uid !== credential.user.uid) attachUser(credential.user);
      } catch (error) { authError(error); return false; }
    }
    const uid = state.user.uid;
    const ready = await state.ready;
    return ready && state.user?.uid === uid;
  }

  function selectedText() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return '';
    const range = selection.getRangeAt(0);
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
    if (!start?.closest('main .paragraph-text') || !end?.closest('main .paragraph-text')) return '';
    const text = normalizeText(selection.toString());
    return text.length > 0 && text.length <= 500 ? text : '';
  }

  function updateSelectionButton() {
    const text = selectedText();
    const button = $('#save-selection');
    button.hidden = !text || $('#word-editor').open;
    if (!text) return;
    state.selected = text;
    button.textContent = state.user ? '＋ Salvar palavra ou frase' : '＋ Entrar para salvar seleção';
    if (window.matchMedia('(pointer: coarse)').matches) {
      button.classList.add('selection-touch');
      return;
    }
    button.classList.remove('selection-touch');
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    button.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - 270))}px`;
    button.style.top = `${Math.max(12, Math.min(rect.top - 48, innerHeight - 58))}px`;
  }
  function scheduleSelection() {
    clearTimeout(state.selectionTimer);
    state.selectionTimer = setTimeout(updateSelectionButton, 150);
  }
  document.addEventListener('selectionchange', scheduleSelection);
  document.addEventListener('mouseup', scheduleSelection);
  document.addEventListener('touchend', scheduleSelection);
  $('#save-selection').addEventListener('pointerdown', event => event.preventDefault());
  $('#save-selection').addEventListener('click', async () => {
    const term = state.selected;
    $('#save-selection').hidden = true;
    if (!await ensureUser()) return;
    const existing = state.words.find(item => termKey(item.term) === termKey(term));
    openEditor(existing || null, term);
  });

  function openEditor(item, selected = '') {
    hideOverlay();
    state.editing = item || null;
    state.editorUid = state.user?.uid;
    $('#editor-title').textContent = item ? 'Editar significado' : 'Salvar para estudar';
    $('#word-term').value = item ? item.term : selected;
    $('#word-term').readOnly = Boolean(item);
    $('#word-meaning').value = item ? item.meaning : '';
    $('#editor-error').textContent = '';
    $('#editor-submit').disabled = false;
    $('#word-editor').showModal();
    $('#word-meaning').focus();
  }

  $('#word-form').addEventListener('submit', async event => {
    event.preventDefault();
    const term = normalizeText($('#word-term').value);
    const meaning = normalizeText($('#word-meaning').value);
    const uid = state.user?.uid;
    if (!uid || uid !== state.editorUid || !term || !meaning) return;
    const ticket = state.ticket;
    $('#editor-submit').disabled = true;
    try {
      const existing = state.editing || state.words.find(item => termKey(item.term) === termKey(term));
      if (existing) {
        await wordRef(uid, existing.id).update({ meaning, updatedAt: timestamps() });
      } else {
        const chapter = document.querySelector('.chapter:not([hidden])');
        const sourceUrl = new URL(location.href);
        sourceUrl.hash = chapter.id;
        await collectionRef(uid).doc().set({
          term, meaning, sourceUrl: sourceUrl.href,
          sourceTitle: `The Lord of the Rings · ${chapter.dataset.title}`,
          createdAt: timestamps(), updatedAt: timestamps(),
        });
      }
      if (ticket !== state.ticket) return;
      $('#word-editor').close();
      window.getSelection()?.removeAllRanges();
      toast('Palavra salva. Disponível em Saved Words no ov-dansk.');
    } catch (error) {
      if (ticket !== state.ticket) return;
      $('#editor-error').textContent = 'Não foi possível salvar. Verifique a conexão e tente novamente.';
      $('#editor-submit').disabled = false;
    }
  });

  function showOverlay(mark) {
    const item = state.words.find(word => word.id === mark.dataset.wordId);
    if (!item) return;
    clearTimeout(state.hideTimer);
    state.overlayId = item.id;
    state.overlayAnchor = mark;
    const overlay = $('#word-overlay');
    $('#overlay-term').textContent = item.term;
    $('#overlay-meaning').textContent = item.meaning;
    overlay.hidden = false;
    const rect = mark.getBoundingClientRect();
    const bounds = overlay.getBoundingClientRect();
    overlay.style.left = `${Math.max(10, Math.min(rect.left, innerWidth - bounds.width - 10))}px`;
    const below = rect.bottom + 10;
    overlay.style.top = `${Math.max(10, Math.min(below + bounds.height <= innerHeight ? below : rect.top - bounds.height - 10, innerHeight - bounds.height - 10))}px`;
  }
  const currentOverlayItem = () => state.words.find(item => item.id === state.overlayId);
  $('main').addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    const mark = event.target.closest('mark.study-word');
    if (mark) showOverlay(mark);
  });
  $('main').addEventListener('pointerout', event => {
    if (event.target.closest('mark.study-word')) state.hideTimer = setTimeout(hideOverlay, 250);
  });
  $('main').addEventListener('click', event => {
    const mark = event.target.closest('mark.study-word');
    if (mark && window.getSelection()?.isCollapsed !== false) showOverlay(mark);
  });
  $('main').addEventListener('keydown', event => {
    const mark = event.target.closest('mark.study-word');
    if (mark && ['Enter', ' '].includes(event.key)) { event.preventDefault(); showOverlay(mark); $('#overlay-listen').focus(); }
  });
  $('#word-overlay').addEventListener('pointerenter', () => clearTimeout(state.hideTimer));
  $('#word-overlay').addEventListener('pointerleave', () => { state.hideTimer = setTimeout(hideOverlay, 350); });
  $('#overlay-close').addEventListener('click', hideOverlay);
  $('#overlay-listen').addEventListener('click', () => { const item = currentOverlayItem(); if (item) window.studyTts.play(item.term); });
  $('#overlay-edit').addEventListener('click', () => { const item = currentOverlayItem(); if (item) openEditor(item); });
  $('#overlay-delete').addEventListener('click', () => { const item = currentOverlayItem(); if (item) askDelete(item); });

  function askDelete(item) {
    hideOverlay();
    state.deleting = item;
    state.deleteUid = state.user?.uid;
    $('#delete-term').textContent = item.term;
    $('#delete-error').textContent = '';
    $('#confirm-delete').disabled = false;
    $('#delete-dialog').showModal();
  }
  $('#confirm-delete').addEventListener('click', async () => {
    const uid = state.user?.uid;
    if (!uid || uid !== state.deleteUid || !state.deleting) return;
    const ticket = state.ticket;
    const id = state.deleting.id;
    $('#confirm-delete').disabled = true;
    try {
      const user = client.db.collection('users').doc(uid);
      const batch = client.db.batch();
      batch.delete(user.collection('customWords').doc(id));
      batch.delete(user.collection('progress').doc(`custom_${id}`));
      await batch.commit();
      if (ticket !== state.ticket) return;
      $('#delete-dialog').close();
      toast('Palavra e progresso de revisão excluídos do ov-dansk.');
    } catch (error) {
      if (ticket !== state.ticket) return;
      $('#delete-error').textContent = 'Não foi possível excluir. Tente novamente.';
      $('#confirm-delete').disabled = false;
    }
  });

  $('#show-words').addEventListener('click', () => { renderWords(); $('#words-dialog').showModal(); });
  $('#word-search').addEventListener('input', renderWords);
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
    document.getElementById(button.dataset.closeDialog).close();
  }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideOverlay(); });
  window.addEventListener('scroll', hideOverlay, { passive: true });
  window.addEventListener('resize', hideOverlay);
  window.addEventListener('study:chapter-changed', () => { hideOverlay(); $('#save-selection').hidden = true; });

  if (!client) {
    $('#auth-button').disabled = true;
    $('#account-name').textContent = 'Login indisponível offline';
    $('#vocabulary-state').textContent = 'Abra online para sincronizar palavras';
    renderWords();
  } else {
    client.auth.onAuthStateChanged(attachUser, () => toast('Não foi possível recuperar a sessão do Google.'));
    $('#auth-button').addEventListener('click', async () => {
      if (state.user) {
        try { await client.signOut(); } catch (error) { toast('Não foi possível sair. Tente novamente.'); }
      } else await ensureUser();
    });
  }
})();
