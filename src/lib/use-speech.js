import { useCallback, useEffect, useRef, useState } from "react";

// Free browser text-to-speech (Web Speech API) used to narrate AI lessons. It costs nothing and
// needs no key; it is just less lifelike than a hosted voice.

function pickVoice(voices) {
  const preferred = [
    "Google US English",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Samantha",
  ];
  for (const name of preferred) {
    const match = voices.find((v) => v.name === name);
    if (match) return match;
  }
  return voices.find((v) => v.lang?.startsWith("en")) ?? voices[0];
}

// Chromium silently stops an utterance after ~15 seconds, so a whole slide script is queued as
// short chunks that still sound continuous.
const MAX_CHUNK_CHARS = 140;

export function chunkForSpeech(text) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > MAX_CHUNK_CHARS) {
      push();
      for (const clause of sentence.split(/(?<=,|;|:)\s+/)) {
        if ((current + clause).length > MAX_CHUNK_CHARS) push();
        current += `${clause} `;
      }
      push();
      continue;
    }
    if ((current + sentence).length > MAX_CHUNK_CHARS) push();
    current += sentence;
  }
  push();
  return chunks.length ? chunks : [text];
}

export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const voicesRef = useRef([]);
  // Bumped by every speak/cancel so callbacks from an older utterance are ignored. Without it,
  // the error Chrome fires on cancel() would look like "narration finished" and auto-advance.
  const sessionRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      sessionRef.current += 1;
      window.speechSynthesis.cancel();
    };
  }, []);

  const cancel = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    sessionRef.current += 1;
    window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback((text, opts) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      opts?.onEnd?.();
      return;
    }
    const synth = window.speechSynthesis;
    sessionRef.current += 1;
    const session = sessionRef.current;
    synth.cancel();
    const chunks = chunkForSpeech(text);
    const voice = pickVoice(voicesRef.current);
    let index = 0;
    const next = () => {
      if (session !== sessionRef.current) return;
      if (index >= chunks.length) {
        opts?.onEnd?.();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      if (voice) utterance.voice = voice;
      utterance.rate = opts?.rate ?? 1;
      utterance.onend = next;
      utterance.onerror = next;
      synth.speak(utterance);
    };
    next();
  }, []);

  return { supported, speak, cancel };
}
