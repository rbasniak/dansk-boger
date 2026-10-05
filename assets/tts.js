/* Google Translate TTS, with cancellation-safe Danish browser speech. */
(() => {
  'use strict';
  let generation = 0;
  let audio = null;
  let utterance = null;
  let rejectPending = null;
  let resumePending = null;
  let phase = 'idle';
  let engine = 'google';
  let rate = 0.9;

  const aborted = () => new DOMException('Afspilning stoppet', 'AbortError');
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));
  const setPhase = value => { phase = value; emit('study:tts-state', value); };

  function splitText(text, maxLength = 180) {
    const parts = [];
    let rest = String(text).replace(/\s+/g, ' ').trim();
    while (rest.length > maxLength) {
      let end = rest.lastIndexOf(' ', maxLength);
      if (end < 1) end = maxLength;
      parts.push(rest.slice(0, end));
      rest = rest.slice(end).trim();
    }
    if (rest) parts.push(rest);
    return parts;
  }

  function googleTtsUrl(text) {
    return 'https://translate.google.com/translate_tts?' + new URLSearchParams({
      ie: 'UTF-8', client: 'tw-ob', tl: 'da', q: text,
    });
  }

  function stop() {
    generation += 1;
    const cancel = rejectPending;
    rejectPending = null;
    resumePending = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      audio.onplay = null;
      audio.onpause = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio = null;
    }
    utterance = null;
    window.speechSynthesis?.cancel();
    cancel?.(aborted());
    setPhase('idle');
  }

  function googlePart(text, ticket) {
    return new Promise((resolve, reject) => {
      if (ticket !== generation) { reject(aborted()); return; }
      const player = new Audio();
      let settled = false;
      let timer;
      const armTimer = () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => finish(new Error('Tempo limite do Google TTS.')), 15000);
      };
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        player.onended = player.onerror = player.onplaying = player.onplay = player.onpause = null;
        if (audio === player) audio = null;
        if (rejectPending === cancel) rejectPending = null;
        if (error) {
          player.pause();
          player.removeAttribute('src');
          player.load();
          reject(error);
        } else resolve();
      }
      const cancel = error => finish(error);
      rejectPending = cancel;
      audio = player;
      // Set the policy before src: required on github.io.
      player.referrerPolicy = 'no-referrer';
      player.onended = () => finish();
      player.onerror = () => finish(new Error('Google TTS indisponível.'));
      player.onplaying = () => { clearTimeout(timer); };
      player.onplay = armTimer;
      player.onpause = () => { clearTimeout(timer); };
      player.src = googleTtsUrl(text);
      player.playbackRate = rate;
      armTimer();
      player.play().catch(error => {
        if (ticket === generation && phase === 'paused' && error.name === 'AbortError') return;
        finish(error);
      });
    });
  }

  function waitForResume(ticket) {
    if (ticket !== generation) return Promise.reject(aborted());
    if (phase !== 'paused') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cancel = error => { resumePending = null; reject(error); };
      rejectPending = cancel;
      resumePending = () => {
        if (rejectPending === cancel) rejectPending = null;
        resumePending = null;
        resolve();
      };
    });
  }

  function browserPart(text, ticket) {
    return new Promise((resolve, reject) => {
      if (ticket !== generation) { reject(aborted()); return; }
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        reject(new Error('Este navegador não oferece leitura em voz alta.'));
        return;
      }
      const speech = new SpeechSynthesisUtterance(text);
      let settled = false;
      function finish(error) {
        if (settled) return;
        settled = true;
        if (rejectPending === cancel) rejectPending = null;
        if (utterance === speech) utterance = null;
        if (error) reject(error); else resolve();
      }
      const cancel = error => finish(error);
      rejectPending = cancel;
      utterance = speech;
      speech.lang = 'da-DK';
      speech.rate = rate;
      const danish = speechSynthesis.getVoices().find(voice => /^da(?:-|$)/i.test(voice.lang));
      if (danish) speech.voice = danish;
      speech.onend = () => finish();
      speech.onerror = event => finish(
        ticket !== generation || ['canceled', 'interrupted'].includes(event.error)
          ? aborted() : new Error('A voz do navegador não conseguiu ler este trecho.'),
      );
      speechSynthesis.speak(speech);
    });
  }

  async function playItems(items, onItem = () => {}) {
    stop();
    const ticket = generation;
    let currentEngine = engine;
    setPhase('playing');
    try {
      for (const item of items) {
        if (ticket !== generation) throw aborted();
        onItem(item);
        for (const part of splitText(item.text)) {
          await waitForResume(ticket);
          if (ticket !== generation) throw aborted();
          if (currentEngine === 'google') {
            try { await googlePart(part, ticket); }
            catch (error) {
              if (ticket !== generation || error.name === 'AbortError') throw aborted();
              await waitForResume(ticket);
              currentEngine = 'browser';
              emit('study:tts-message', 'Google TTS indisponível. Continuando com a voz do navegador.');
              await browserPart(part, ticket);
            }
          } else await browserPart(part, ticket);
        }
      }
    } catch (error) {
      if (ticket === generation && error.name !== 'AbortError') emit('study:tts-message', error.message);
    } finally {
      if (ticket === generation) setPhase('idle');
    }
  }

  function pause() {
    if (phase !== 'playing') return;
    if (audio) audio.pause();
    if (utterance) window.speechSynthesis?.pause();
    setPhase('paused');
  }

  function resume() {
    if (phase !== 'paused') return;
    setPhase('playing');
    resumePending?.();
    if (audio) {
      const ticket = generation;
      audio.play().catch(error => {
        if (ticket === generation) rejectPending?.(error);
      });
    }
    if (utterance) window.speechSynthesis?.resume();
  }

  window.studyTts = {
    splitText, googleTtsUrl, stop, pause, resume, playItems,
    play: text => playItems([{ text }]),
    configure(options) {
      if (options.engine) engine = options.engine;
      if (Number.isFinite(options.rate)) {
        rate = Math.min(1.5, Math.max(0.5, options.rate));
        if (audio) audio.playbackRate = rate;
      }
    },
    get phase() { return phase; },
  };
})();
