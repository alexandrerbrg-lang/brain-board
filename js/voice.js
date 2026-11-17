// Dictée vocale dans le navigateur (Web Speech API, fr-FR).
// Chrome / Edge / Safari (macOS & iOS). Repli : la dictée du clavier du téléphone dans la zone de texte.
export function createVoice({ onFinal, onInterim, onState }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, on = false;
  function start() {
    if (!SR) { onState('unsupported'); return false; }
    if (on) return true;
    rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinal(r[0].transcript); else interim += r[0].transcript;
      }
      onInterim(interim);
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { on = false; onState('denied'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') onState('error', e.error);
    };
    rec.onend = () => {
      if (on) { try { rec.start(); } catch (_) { on = false; onState('off'); } }
      else onState('off');
    };
    on = true;
    try { rec.start(); } catch (_) {}
    onState('on'); return true;
  }
  function stop() { if (!on) return; on = false; try { rec.stop(); } catch (_) { onState('off'); } }
  return { start, stop, toggle: () => (on ? stop() : start()), get on() { return on; }, supported: !!SR };
}
