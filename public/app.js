const state = {
  title: "",
  fullText: "",
  chapters: [],
  currentChapterIndex: 0,
  currentChapterTokens: [],
  chapterWordCounts: [],
  chapterWordOffsets: [],
  totalWordCount: 0,
  selectedVoice: null,
  voiceSamples: [],
  customVoice: null,
  mediaRecorder: null,
  recordedChunks: [],
  generationJobId: null,
  generationPoller: null,
  currentAudioUrl: "",
  lastHighlightedGlobalIndex: -1,
  alignmentSegments: [],
  defaultExaggeration: 0.42,
};

const voicePromptHints = {
  pt: "O senhor tinha número quatro, mas a senhora tinha tempo e cuidado. Digo tudo com voz calma, natural e precisa.",
  en: "Mr. Parker walked to number four with a calm, clear, natural voice.",
  es: "El señor estaba en el número cuatro, con una voz clara, tranquila y natural.",
  fr: "Monsieur Dupont arrive au numéro quatre, avec une voix calme, claire et naturelle.",
  de: "Herr Weber kommt zu Nummer vier mit einer ruhigen, klaren und natürlichen Stimme.",
  it: "Il signore Rossi arriva al numero quattro con una voce calma, chiara e naturale.",
  nl: "Meneer Jansen gaat naar nummer vier met een rustige, heldere en natuurlijke stem.",
  sv: "Herr Berg går till nummer fyra med en lugn, tydlig och naturlig röst.",
  pl: "Doktor Kowalski mówi spokojnym, wyraźnym i naturalnym głosem przy numerze cztery.",
  tr: "Sayin Demir numara dörtte sakin, net ve doğal bir sesle konuşuyor.",
  zh: "请用平静、清晰、自然的声音读这一段，号码四。",
  ja: "番号四を、落ち着いて、自然で、はっきりした声で読んでください。",
};

const els = {
  bookForm: document.querySelector("#book-form"),
  bookTitle: document.querySelector("#book-title"),
  bookText: document.querySelector("#book-text"),
  bookFile: document.querySelector("#book-file"),
  chapterList: document.querySelector("#chapter-list"),
  chapterCount: document.querySelector("#chapter-count"),
  readerTitle: document.querySelector("#reader-title"),
  readerContent: document.querySelector("#reader-content"),
  playToggle: document.querySelector("#play-toggle"),
  pauseToggle: document.querySelector("#pause-toggle"),
  bookAudio: document.querySelector("#book-audio"),
  translationLanguage: document.querySelector("#translation-language"),
  narrationLanguage: document.querySelector("#narration-language"),
  activeLanguagePill: document.querySelector("#active-language-pill"),
  translationLanguagePill: document.querySelector("#translation-language-pill"),
  voicePill: document.querySelector("#voice-pill"),
  voiceShelf: document.querySelector("#voice-shelf"),
  chapterButtonTemplate: document.querySelector("#chapter-button-template"),
  wordPopover: document.querySelector("#word-popover"),
  selectionTranslation: document.querySelector("#selection-translation"),
  recordToggle: document.querySelector("#record-toggle"),
  uploadVoiceButton: document.querySelector("#upload-voice-button"),
  voiceFile: document.querySelector("#voice-file"),
  voicePreview: document.querySelector("#voice-preview"),
  voiceScriptText: document.querySelector("#voice-script-text"),
  recordingStatus: document.querySelector("#recording-status"),
  exaggeration: document.querySelector("#exaggeration"),
  generateButton: document.querySelector("#generate-button"),
  generationStatus: document.querySelector("#generation-status"),
  generationLabel: document.querySelector("#generation-label"),
  generationPercent: document.querySelector("#generation-percent"),
  generationProgress: document.querySelector("#generation-progress"),
  generationLog: document.querySelector("#generation-log"),
};

const languageLabels = new Map();

bootstrap().catch((error) => {
  console.error(error);
  setSelectionTranslation(`Setup error: ${error.message}`, true);
});

async function bootstrap() {
  const meta = await fetchJson("/api/meta");
  state.voiceSamples = meta.voiceSamples;
  state.defaultExaggeration = meta.defaults?.exaggeration ?? 0.42;
  renderLanguageOptions(meta.languages);
  els.exaggeration.value = String(state.defaultExaggeration);
  renderVoiceShelf();
  attachEvents();
}

function attachEvents() {
  els.bookForm.addEventListener("submit", handleBookOpen);
  els.playToggle.addEventListener("click", () => {
    els.bookAudio.play();
  });
  els.pauseToggle.addEventListener("click", () => {
    els.bookAudio.pause();
  });
  els.bookAudio.addEventListener("timeupdate", syncPlaybackHighlight);
  els.recordToggle.addEventListener("click", toggleRecording);
  els.uploadVoiceButton.addEventListener("click", () => els.voiceFile.click());
  els.voiceFile.addEventListener("change", handleVoiceUploadFromPicker);
  els.generateButton.addEventListener("click", handleGenerateAudiobook);
  els.translationLanguage.addEventListener("change", updateLanguagePills);
  els.narrationLanguage.addEventListener("change", updateLanguagePills);

  document.addEventListener("click", (event) => {
    if (
      event.target instanceof Element &&
      !els.wordPopover.contains(event.target) &&
      !event.target.classList.contains("token")
    ) {
      hideWordPopover();
    }
  });

  document.addEventListener("mouseup", handleSelectionTranslate);
  document.addEventListener("keyup", handleSelectionTranslate);
}

async function handleBookOpen(event) {
  event.preventDefault();

  const formData = new FormData();
  formData.append("title", els.bookTitle.value.trim());
  formData.append("text", els.bookText.value);
  if (els.bookFile.files[0]) {
    formData.append("bookFile", els.bookFile.files[0]);
  }

  setSelectionTranslation("Opening your story...", true);

  try {
    const payload = await fetchJson("/api/book/extract", {
      method: "POST",
      body: formData,
    });

    state.title = payload.title || "Untitled Story";
    state.fullText = payload.text;
    state.chapters = payload.chapters || [];
    state.alignmentSegments = [];
    computeChapterWordMetrics();
    state.currentChapterIndex = 0;
    state.lastHighlightedGlobalIndex = -1;

    els.readerTitle.textContent = state.title;
    renderChapterList();
    renderCurrentChapter();
    updateLanguagePills();
    setSelectionTranslation(`Loaded "${state.title}". Select a word or phrase to translate.`, false);
  } catch (error) {
    setSelectionTranslation(error.message, true);
  }
}

function renderLanguageOptions(languages) {
  for (const language of languages) {
    languageLabels.set(language.code, language.label);

    const narrationOption = document.createElement("option");
    narrationOption.value = language.code;
    narrationOption.textContent = language.label;

    const translationOption = narrationOption.cloneNode(true);

    els.narrationLanguage.append(narrationOption);
    els.translationLanguage.append(translationOption);
  }

  els.narrationLanguage.value = "pt";
  els.translationLanguage.value = "en";
  updateLanguagePills();
}

function renderVoiceShelf() {
  els.voiceShelf.innerHTML = "";

  state.voiceSamples.forEach((sample, index) => {
    const button = document.createElement("button");
    button.type = "button";
    const isActive = state.selectedVoice
      ? state.selectedVoice.id === sample.id
      : index === 0;
    button.className = `voice-card${isActive ? " active" : ""}`;
    button.dataset.voiceId = sample.id;
    button.innerHTML = `
      <strong>${sample.name}</strong>
      <small>${sample.vibe}</small>
      <small>${languageLabels.get(sample.language) || sample.language.toUpperCase()}</small>
    `;
    button.addEventListener("click", () => {
      state.selectedVoice = sample;
      document.querySelectorAll(".voice-card").forEach((card) => card.classList.remove("active"));
      button.classList.add("active");
      updateVoicePill();
    });
    els.voiceShelf.append(button);
  });

  if (!state.selectedVoice) {
    state.selectedVoice = state.voiceSamples[0] || null;
  }
  updateVoicePill();
}

function renderChapterList() {
  els.chapterList.classList.remove("empty-state");
  els.chapterList.textContent = "";
  els.chapterCount.textContent = `${state.chapters.length} section${state.chapters.length === 1 ? "" : "s"}`;

  state.chapters.forEach((chapter, index) => {
    const fragment = els.chapterButtonTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".chapter-button");
    const indexNode = fragment.querySelector(".chapter-index");
    const titleNode = fragment.querySelector(".chapter-title");

    indexNode.textContent = String(index + 1).padStart(2, "0");
    titleNode.textContent = chapter.title || `Section ${index + 1}`;

    if (index === state.currentChapterIndex) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      state.currentChapterIndex = index;
      setActiveChapterButton(index);
      renderCurrentChapter();
    });

    els.chapterList.append(fragment);
  });
}

function renderCurrentChapter() {
  const chapter = state.chapters[state.currentChapterIndex];
  if (!chapter) {
    els.readerContent.classList.add("empty-state");
    els.readerContent.textContent = "Open a story to start reading.";
    return;
  }

  els.readerContent.classList.remove("empty-state");
  els.readerContent.innerHTML = "";

  const article = document.createElement("article");
  article.className = "reader-article";
  const chapterOffset = state.chapterWordOffsets[state.currentChapterIndex] || 0;
  let localWordIndex = 0;

  const paragraphs = chapter.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  state.currentChapterTokens = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const p = document.createElement("p");
    const tokens = tokenizeParagraph(paragraph);

    tokens.forEach((token) => {
      if (token.type === "word") {
        const span = document.createElement("span");
        span.className = "token";
        span.textContent = token.value;
        span.dataset.globalIndex = String(chapterOffset + localWordIndex);
        span.addEventListener("click", (event) => handleWordTranslate(token.value, event));
        state.currentChapterTokens.push(span);
        localWordIndex += 1;
        p.append(span);
      } else {
        p.append(document.createTextNode(token.value));
      }
    });

    p.dataset.paragraphIndex = String(paragraphIndex);
    article.append(p);
  });

  els.readerContent.append(article);
}

function tokenizeParagraph(paragraph) {
  return paragraph.split(/(\s+|[.,!?;:"“”'()\-]+)/).filter(Boolean).map((part) => {
    if (/^[\p{L}\p{N}]+$/u.test(part)) {
      return { type: "word", value: part };
    }
    return { type: "separator", value: part };
  });
}

async function handleWordTranslate(word, event) {
  try {
    const payload = await translate(word);
    showWordPopover({
      source: word,
      translatedText: payload.translatedText,
      x: event.clientX,
      y: event.clientY,
    });
  } catch (error) {
    showWordPopover({
      source: word,
      translatedText: error.message,
      x: event.clientX,
      y: event.clientY,
    });
  }
}

async function handleSelectionTranslate() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return;
  }

  const text = selection.toString().trim();
  if (!text || text.length < 2 || text.length > 220) {
    return;
  }

  const anchorInReader = els.readerContent.contains(selection.anchorNode);
  const focusInReader = els.readerContent.contains(selection.focusNode);
  if (!anchorInReader && !focusInReader) {
    return;
  }

  try {
    setSelectionTranslation(`Translating "${truncate(text, 60)}"...`, true);
    const payload = await translate(text);
    setSelectionTranslation(
      `<div class="translation-source">${escapeHtml(text)}</div><div class="translation-result">${escapeHtml(payload.translatedText)}</div>`,
      false,
      true
    );
  } catch (error) {
    setSelectionTranslation(error.message, true);
  }
}

function setSelectionTranslation(message, isError, allowHtml = false) {
  els.selectionTranslation.classList.remove("hidden");
  if (allowHtml) {
    els.selectionTranslation.innerHTML = message;
  } else {
    els.selectionTranslation.textContent = message;
  }
  els.selectionTranslation.style.borderColor = isError
    ? "rgba(255, 132, 132, 0.35)"
    : "rgba(255, 232, 206, 0.16)";
}

function hideWordPopover() {
  els.wordPopover.classList.add("hidden");
}

function showWordPopover({ source, translatedText, x, y }) {
  els.wordPopover.innerHTML = `
    <div class="translation-source">${escapeHtml(source)}</div>
    <div class="translation-result">${escapeHtml(translatedText)}</div>
  `;
  els.wordPopover.style.left = `${Math.min(x + 14, window.innerWidth - 280)}px`;
  els.wordPopover.style.top = `${Math.min(y + 14, window.innerHeight - 160)}px`;
  els.wordPopover.classList.remove("hidden");
}

async function toggleRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
    state.mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordedChunks = [];
    const mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder = mediaRecorder;

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        state.recordedChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(state.recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const file = new File([blob], "voice-sample.webm", { type: blob.type });
      await uploadVoiceFile(file);
    });

    mediaRecorder.start();
    els.recordToggle.textContent = "Stop recording";
    els.recordingStatus.textContent = "Recording... speak clearly for around 10 to 20 seconds.";
  } catch (error) {
    els.recordingStatus.textContent = `Microphone error: ${error.message}`;
  }
}

async function handleVoiceUploadFromPicker() {
  const file = els.voiceFile.files[0];
  if (!file) {
    return;
  }
  await uploadVoiceFile(file);
}

async function uploadVoiceFile(file) {
  const formData = new FormData();
  formData.append("voiceSample", file);
  formData.append("name", "My Voice");
  formData.append("language", els.narrationLanguage.value);

  els.recordToggle.textContent = "Record voice";
  els.recordingStatus.textContent = "Uploading your custom voice sample...";

  try {
    const payload = await fetchJson("/api/voice-sample", {
      method: "POST",
      body: formData,
    });

    state.customVoice = payload.voiceSample;
    state.selectedVoice = payload.voiceSample;
    state.voiceSamples = [
      payload.voiceSample,
      ...state.voiceSamples.filter((sample) => sample.id !== payload.voiceSample.id),
    ];
    renderVoiceShelf();
    updateVoicePill();
    els.recordingStatus.textContent = `Custom voice ready: ${payload.voiceSample.name}`;
    els.voicePreview.hidden = false;
    els.voicePreview.src = payload.voiceSample.url;
  } catch (error) {
    els.recordingStatus.textContent = error.message;
  }
}

async function handleGenerateAudiobook() {
  if (!state.fullText) {
    setSelectionTranslation("Open a story first, then create the audiobook.", true);
    return;
  }

  try {
    els.generateButton.disabled = true;
    els.generationStatus.classList.remove("hidden");
    updateGenerationUi({
      label: "Queueing local audiobook generation...",
      progress: 5,
      logs: ["A new local job is being created."],
    });

    const payload = await fetchJson("/api/audiobook/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: state.title,
        text: state.fullText,
        language: els.narrationLanguage.value,
        voiceSampleId: state.selectedVoice?.builtIn ? "" : state.selectedVoice?.id || "",
        exaggeration: Number(els.exaggeration.value),
      }),
    });

    state.generationJobId = payload.jobId;
    startGenerationPolling();
  } catch (error) {
    els.generateButton.disabled = false;
    updateGenerationUi({
      label: error.message,
      progress: 0,
      logs: [error.message],
    });
  }
}

function startGenerationPolling() {
  clearInterval(state.generationPoller);
  state.generationPoller = setInterval(async () => {
    if (!state.generationJobId) {
      return;
    }

    try {
      const payload = await fetchJson(`/api/audiobook/status/${state.generationJobId}`);
      const job = payload.job;
      updateGenerationUi({
        label: job.status === "done" ? "Audiobook ready." : job.logs.at(-1) || job.status,
        progress: job.progress || 0,
        logs: job.logs || [],
      });

      if (job.status === "done" && job.audioUrl) {
        clearInterval(state.generationPoller);
        state.currentAudioUrl = job.audioUrl;
        state.alignmentSegments = job.alignment?.segments || [];
        state.lastHighlightedGlobalIndex = -1;
        els.bookAudio.src = job.audioUrl;
        els.playToggle.disabled = false;
        els.pauseToggle.disabled = false;
        els.generateButton.disabled = false;
      }

      if (job.status === "failed") {
        clearInterval(state.generationPoller);
        els.generateButton.disabled = false;
        updateGenerationUi({
          label: job.error || "Generation failed.",
          progress: job.progress || 0,
          logs: job.logs || [],
        });
      }
    } catch (error) {
      clearInterval(state.generationPoller);
      els.generateButton.disabled = false;
      updateGenerationUi({
        label: error.message,
        progress: 0,
        logs: [error.message],
      });
    }
  }, 2200);
}

function updateGenerationUi({ label, progress, logs }) {
  els.generationLabel.textContent = label;
  els.generationPercent.textContent = `${Math.round(progress)}%`;
  els.generationProgress.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
  els.generationLog.innerHTML = logs.map((entry) => `<div>${escapeHtml(entry)}</div>`).join("");
}

function syncPlaybackHighlight() {
  if (state.alignmentSegments.length) {
    syncPlaybackHighlightFromAlignment();
    return;
  }

  if (!state.totalWordCount || !els.bookAudio.duration) {
    return;
  }

  const progress = els.bookAudio.currentTime / els.bookAudio.duration;
  const globalIndex = Math.min(
    state.totalWordCount - 1,
    Math.max(0, Math.floor(progress * state.totalWordCount))
  );

  if (globalIndex === state.lastHighlightedGlobalIndex) {
    return;
  }

  state.lastHighlightedGlobalIndex = globalIndex;
  const chapterIndex = resolveChapterIndexForWord(globalIndex);

  if (chapterIndex !== state.currentChapterIndex) {
    state.currentChapterIndex = chapterIndex;
    setActiveChapterButton(chapterIndex);
    renderCurrentChapter();
  }

  state.currentChapterTokens.forEach((token) => token.classList.remove("active"));

  const localIndex = globalIndex - (state.chapterWordOffsets[state.currentChapterIndex] || 0);
  const activeToken = state.currentChapterTokens[localIndex];
  if (activeToken) {
    activeToken.classList.add("active");
    activeToken.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }
}

function syncPlaybackHighlightFromAlignment() {
  if (!state.totalWordCount || !els.bookAudio.duration) {
    return;
  }

  const segment = findAlignmentSegment(els.bookAudio.currentTime);
  if (!segment) {
    return;
  }

  const wordsInSegment = Math.max(1, segment.wordEnd - segment.wordStart);
  const segmentDuration = Math.max(0.001, segment.end - segment.start);
  const progress = Math.max(0, Math.min(0.999, (els.bookAudio.currentTime - segment.start) / segmentDuration));
  const globalIndex = Math.min(
    segment.wordEnd - 1,
    Math.max(segment.wordStart, segment.wordStart + Math.floor(progress * wordsInSegment))
  );

  if (globalIndex === state.lastHighlightedGlobalIndex) {
    return;
  }

  activateWordByGlobalIndex(globalIndex);
}

function findAlignmentSegment(currentTime) {
  let previousSegment = null;
  for (const segment of state.alignmentSegments) {
    if (currentTime >= segment.start && currentTime <= segment.end) {
      return segment;
    }
    if (segment.end < currentTime) {
      previousSegment = segment;
    }
  }
  return previousSegment;
}

function activateWordByGlobalIndex(globalIndex) {
  state.lastHighlightedGlobalIndex = globalIndex;
  const chapterIndex = resolveChapterIndexForWord(globalIndex);

  if (chapterIndex !== state.currentChapterIndex) {
    state.currentChapterIndex = chapterIndex;
    setActiveChapterButton(chapterIndex);
    renderCurrentChapter();
  }

  state.currentChapterTokens.forEach((token) => token.classList.remove("active"));

  const localIndex = globalIndex - (state.chapterWordOffsets[state.currentChapterIndex] || 0);
  const activeToken = state.currentChapterTokens[localIndex];
  if (activeToken) {
    activeToken.classList.add("active");
    activeToken.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }
}

function updateLanguagePills() {
  const narrationLabel = languageLabels.get(els.narrationLanguage.value) || els.narrationLanguage.value;
  const translationLabel =
    languageLabels.get(els.translationLanguage.value) || els.translationLanguage.value;
  els.activeLanguagePill.textContent = `Narration: ${narrationLabel}`;
  els.translationLanguagePill.textContent = `Translate: ${translationLabel}`;
  updateVoicePromptHint();
}

function updateVoicePill() {
  els.voicePill.textContent = `Voice: ${state.selectedVoice?.name || "default"}`;
}

function updateVoicePromptHint() {
  const language = els.narrationLanguage.value;
  els.voiceScriptText.textContent =
    voicePromptHints[language] ||
    "Read one calm, natural sentence with numbers and names so the cloned voice captures your rhythm clearly.";
}

function computeChapterWordMetrics() {
  state.chapterWordCounts = state.chapters.map((chapter) => countWords(chapter.content || ""));
  state.chapterWordOffsets = [];
  let offset = 0;
  for (const wordCount of state.chapterWordCounts) {
    state.chapterWordOffsets.push(offset);
    offset += wordCount;
  }
  state.totalWordCount = offset;
}

function countWords(text) {
  return (text.match(/[\p{L}\p{N}]+/gu) || []).length;
}

function resolveChapterIndexForWord(globalWordIndex) {
  if (!state.chapterWordOffsets.length) {
    return 0;
  }

  for (let index = 0; index < state.chapterWordOffsets.length; index += 1) {
    const start = state.chapterWordOffsets[index];
    const nextStart = state.chapterWordOffsets[index + 1] ?? state.totalWordCount;
    if (globalWordIndex >= start && globalWordIndex < nextStart) {
      return index;
    }
  }

  return state.chapterWordOffsets.length - 1;
}

function setActiveChapterButton(activeIndex) {
  document.querySelectorAll(".chapter-button").forEach((node, index) => {
    node.classList.toggle("active", index === activeIndex);
  });
}

async function translate(text) {
  return fetchJson("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      source: els.narrationLanguage.value,
      target: els.translationLanguage.value,
    }),
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }
  return payload;
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
