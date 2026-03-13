const state = {
  title: "",
  fullText: "",
  sourceText: "",
  chapters: [],
  currentChapterIndex: 0,
  currentChapterTokens: [],
  chapterWordCounts: [],
  chapterWordOffsets: [],
  totalWordCount: 0,
  bookLanguage: "auto",
  detectedBookLanguage: "pt",
  listenerLanguage: "en",
  audiobookLanguage: "pt-pt",
  readerLanguage: "pt-pt",
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
  alignmentWordTimings: [],
  highlightAnimationFrame: 0,
  followPlayback: true,
  readerScrollLockedUntil: 0,
  selectionTranslateTimer: 0,
  lastSelectionText: "",
  defaultExaggeration: 0.56,
};

const voicePromptHints = {
  "pt-pt":
    "O Senhor tinha três portas no número quatro, e os vizinhos tinham tempo para ouvir tudo com calma, clareza e presença natural.",
};

const els = {
  bookForm: document.querySelector("#book-form"),
  bookTitle: document.querySelector("#book-title"),
  bookText: document.querySelector("#book-text"),
  bookFile: document.querySelector("#book-file"),
  bookLanguage: document.querySelector("#book-language"),
  listenerLanguage: document.querySelector("#listener-language"),
  audiobookLanguage: document.querySelector("#audiobook-language"),
  chapterList: document.querySelector("#chapter-list"),
  chapterCount: document.querySelector("#chapter-count"),
  readerTitle: document.querySelector("#reader-title"),
  readerContent: document.querySelector("#reader-content"),
  playToggle: document.querySelector("#play-toggle"),
  pauseToggle: document.querySelector("#pause-toggle"),
  bookAudio: document.querySelector("#book-audio"),
  activeLanguagePill: document.querySelector("#active-language-pill"),
  translationLanguagePill: document.querySelector("#translation-language-pill"),
  listenerLanguagePill: document.querySelector("#listener-language-pill"),
  voicePill: document.querySelector("#voice-pill"),
  voiceShelf: document.querySelector("#voice-shelf"),
  supportedLanguageList: document.querySelector("#supported-language-list"),
  chapterButtonTemplate: document.querySelector("#chapter-button-template"),
  wordPopover: document.querySelector("#word-popover"),
  selectionTranslation: document.querySelector("#selection-translation"),
  recordToggle: document.querySelector("#record-toggle"),
  uploadVoiceButton: document.querySelector("#upload-voice-button"),
  voiceFile: document.querySelector("#voice-file"),
  voiceLabel: document.querySelector("#voice-label"),
  voicePreview: document.querySelector("#voice-preview"),
  voiceScriptText: document.querySelector("#voice-script-text"),
  recordingStatus: document.querySelector("#recording-status"),
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
  state.defaultExaggeration = meta.defaults?.exaggeration ?? 0.56;
  renderLanguageOptions(meta);
  renderSupportedLanguages(meta.fullySupportedLanguages || []);
  renderVoiceShelf();
  attachEvents();
}

function attachEvents() {
  els.bookForm.addEventListener("submit", handleBookOpen);
  els.playToggle.addEventListener("click", () => els.bookAudio.play());
  els.pauseToggle.addEventListener("click", () => els.bookAudio.pause());
  els.bookAudio.addEventListener("timeupdate", syncPlaybackHighlight);
  els.bookAudio.addEventListener("play", startPlaybackTracking);
  els.bookAudio.addEventListener("pause", stopPlaybackTracking);
  els.bookAudio.addEventListener("ended", stopPlaybackTracking);
  els.bookAudio.addEventListener("seeking", syncPlaybackHighlight);
  els.recordToggle.addEventListener("click", toggleRecording);
  els.uploadVoiceButton.addEventListener("click", () => els.voiceFile.click());
  els.voiceFile.addEventListener("change", handleVoiceUploadFromPicker);
  els.generateButton.addEventListener("click", handleGenerateAudiobook);
  els.bookLanguage.addEventListener("change", updateLanguagePills);
  els.listenerLanguage.addEventListener("change", updateLanguagePills);
  els.audiobookLanguage.addEventListener("change", updateLanguagePills);
  els.readerContent.addEventListener("scroll", handleReaderManualScroll, { passive: true });

  document.addEventListener("click", (event) => {
    if (
      event.target instanceof Element &&
      !els.wordPopover.contains(event.target) &&
      !event.target.classList.contains("token")
    ) {
      hideWordPopover();
    }
  });

  document.addEventListener("selectionchange", scheduleSelectionTranslate);
  document.addEventListener("mouseup", scheduleSelectionTranslate);
  document.addEventListener("keyup", scheduleSelectionTranslate);
}

async function handleBookOpen(event) {
  event.preventDefault();

  const formData = new FormData();
  formData.append("title", els.bookTitle.value.trim());
  formData.append("text", els.bookText.value);
  formData.append("sourceLanguage", els.bookLanguage.value);
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
    state.sourceText = payload.text;
    state.fullText = payload.text;
    state.chapters = payload.chapters || [];
    state.bookLanguage = els.bookLanguage.value;
    state.detectedBookLanguage = payload.detectedLanguage || state.bookLanguage || "pt";
    state.readerLanguage = state.detectedBookLanguage;
    state.alignmentSegments = [];
    state.alignmentWordTimings = [];
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

function renderLanguageOptions(meta) {
  const sourceLanguages = meta.sourceLanguages || [];
  const listenerLanguages = meta.listenerLanguages || [];
  const audiobookLanguages = meta.audiobookLanguages || [];

  for (const language of [...sourceLanguages, ...listenerLanguages, ...audiobookLanguages]) {
    languageLabels.set(language.code, language.label);
  }
  languageLabels.set("pt", "Portuguese");

  populateSelect(els.bookLanguage, sourceLanguages);
  populateSelect(els.listenerLanguage, listenerLanguages);
  populateSelect(els.audiobookLanguage, audiobookLanguages);

  els.bookLanguage.value = "auto";
  els.listenerLanguage.value = "en";
  els.audiobookLanguage.value = "pt-pt";
  updateLanguagePills();
}

function populateSelect(selectNode, options) {
  selectNode.innerHTML = "";
  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.code;
    element.textContent = option.locale ? `${option.label}` : option.label;
    selectNode.append(element);
  });
}

function renderSupportedLanguages(languages) {
  els.supportedLanguageList.innerHTML = languages
    .map(
      (language) => `
        <div class="support-item">
          <strong>${escapeHtml(language.label)}</strong>
          <span>Voice cloning, aligned reading, OCR intake, and translation-aware narration workflow.</span>
        </div>
      `
    )
    .join("");
}

function renderVoiceShelf() {
  els.voiceShelf.innerHTML = "";

  if (state.selectedVoice && !state.voiceSamples.some((sample) => sample.id === state.selectedVoice.id)) {
    state.selectedVoice = null;
  }
  if (!state.selectedVoice) {
    state.selectedVoice = state.voiceSamples[0] || null;
  }

  state.voiceSamples.forEach((sample) => {
    const shell = document.createElement("div");
    shell.className = "voice-card-shell";

    const button = document.createElement("button");
    button.type = "button";
    const isActive = state.selectedVoice?.id === sample.id;
    button.className = `voice-card${isActive ? " active" : ""}`;
    button.dataset.voiceId = sample.id;
    button.innerHTML = `
      <strong>${sample.name}</strong>
      <small>${sample.vibe}</small>
      <small>${languageLabels.get(sample.language) || sample.language.toUpperCase()}</small>
    `;
    button.addEventListener("click", () => {
      state.selectedVoice = sample;
      renderVoiceShelf();
    });

    shell.append(button);

    if (!sample.builtIn) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "voice-delete-button";
      deleteButton.dataset.voiceId = sample.id;
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute("aria-label", `Delete ${sample.name}`);
      deleteButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await handleDeleteVoiceSample(sample.id);
      });
      shell.append(deleteButton);
    }

    els.voiceShelf.append(shell);
  });

  updateVoicePill();
  refreshVoicePreview();
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
  const tokens = [];
  const pattern = /[\p{L}\p{M}\p{N}ºª]+(?:['’\-][\p{L}\p{M}\p{N}ºª]+)*/gu;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(paragraph))) {
    if (match.index > lastIndex) {
      tokens.push({ type: "separator", value: paragraph.slice(lastIndex, match.index) });
    }
    tokens.push({ type: "word", value: match[0] });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < paragraph.length) {
    tokens.push({ type: "separator", value: paragraph.slice(lastIndex) });
  }
  return tokens.filter((token) => token.value);
}

async function handleWordTranslate(word, event) {
  const selectionText = getActiveReaderSelectionText();
  if (selectionText) {
    await handleSelectionTranslate(selectionText);
    return;
  }

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

function scheduleSelectionTranslate() {
  clearTimeout(state.selectionTranslateTimer);
  state.selectionTranslateTimer = window.setTimeout(async () => {
    const text = getActiveReaderSelectionText();
    if (!text || text === state.lastSelectionText) {
      return;
    }
    state.lastSelectionText = text;
    await handleSelectionTranslate(text);
  }, 140);
}

function getActiveReaderSelectionText() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    state.lastSelectionText = "";
    return "";
  }

  const text = selection.toString().trim();
  if (!text || text.length < 2 || text.length > 220) {
    return "";
  }

  const anchorInReader = els.readerContent.contains(selection.anchorNode);
  const focusInReader = els.readerContent.contains(selection.focusNode);
  if (!anchorInReader && !focusInReader) {
    return "";
  }
  return text;
}

async function handleSelectionTranslate(text = getActiveReaderSelectionText()) {
  if (!text) {
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
    : "rgba(124, 255, 186, 0.22)";
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
  try {
    await uploadVoiceFile(file);
  } finally {
    els.voiceFile.value = "";
  }
}

async function uploadVoiceFile(file) {
  const formData = new FormData();
  formData.append("voiceSample", file);
  formData.append("name", getVoiceLabelValue());
  formData.append("language", els.audiobookLanguage.value);

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
    els.voiceLabel.value = payload.voiceSample.name;
  } catch (error) {
    els.recordingStatus.textContent = error.message;
  }
}

async function handleDeleteVoiceSample(voiceSampleId) {
  const sample = state.voiceSamples.find((candidate) => candidate.id === voiceSampleId);
  if (!sample || sample.builtIn) {
    return;
  }

  const confirmed = window.confirm(`Delete "${sample.name}" from your saved voices?`);
  if (!confirmed) {
    return;
  }

  try {
    els.recordingStatus.textContent = `Deleting "${sample.name}"...`;
    await fetchJson(`/api/voice-sample/${encodeURIComponent(voiceSampleId)}`, {
      method: "DELETE",
    });

    state.voiceSamples = state.voiceSamples.filter((candidate) => candidate.id !== voiceSampleId);
    if (state.selectedVoice?.id === voiceSampleId) {
      state.selectedVoice = state.voiceSamples[0] || null;
    }
    if (state.customVoice?.id === voiceSampleId) {
      state.customVoice = null;
    }

    renderVoiceShelf();
    els.recordingStatus.textContent = `"${sample.name}" deleted.`;
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
        text: state.sourceText || state.fullText,
        sourceLanguage:
          els.bookLanguage.value === "auto" ? state.detectedBookLanguage || "pt" : els.bookLanguage.value,
        listenerLanguage: els.listenerLanguage.value,
        audiobookLanguage: els.audiobookLanguage.value,
        voiceSampleId: state.selectedVoice?.builtIn ? "" : state.selectedVoice?.id || "",
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
        state.alignmentWordTimings = buildAlignmentWordTimings(state.alignmentSegments);
        state.lastHighlightedGlobalIndex = -1;
        state.followPlayback = true;
        if (job.readerText && job.readerText !== state.fullText) {
          state.fullText = job.readerText;
          state.chapters = job.readerChapters || [{ title: "Complete Text", content: job.readerText }];
          state.readerLanguage = job.readerLanguage || els.audiobookLanguage.value;
          state.currentChapterIndex = 0;
          computeChapterWordMetrics();
          renderChapterList();
          renderCurrentChapter();
        }
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

function startPlaybackTracking() {
  state.followPlayback = true;
  cancelAnimationFrame(state.highlightAnimationFrame);
  const tick = () => {
    syncPlaybackHighlight();
    if (!els.bookAudio.paused && !els.bookAudio.ended) {
      state.highlightAnimationFrame = window.requestAnimationFrame(tick);
    }
  };
  tick();
}

function stopPlaybackTracking() {
  cancelAnimationFrame(state.highlightAnimationFrame);
}

function syncPlaybackHighlight() {
  if (state.alignmentWordTimings.length) {
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
  if (!state.totalWordCount || !els.bookAudio.duration || !state.alignmentWordTimings.length) {
    return;
  }

  const wordTiming = findAlignmentWordTiming(els.bookAudio.currentTime);
  if (!wordTiming) {
    return;
  }

  if (wordTiming.index === state.lastHighlightedGlobalIndex) {
    return;
  }

  activateWordByGlobalIndex(wordTiming.index);
}

function findAlignmentWordTiming(currentTime) {
  let previousWord = null;
  for (const wordTiming of state.alignmentWordTimings) {
    if (currentTime >= wordTiming.start && currentTime <= wordTiming.end) {
      return wordTiming;
    }
    if (wordTiming.end < currentTime) {
      previousWord = wordTiming;
    }
  }
  return previousWord;
}

function activateWordByGlobalIndex(globalIndex) {
  state.lastHighlightedGlobalIndex = globalIndex;
  const chapterIndex = resolveChapterIndexForWord(globalIndex);

  if (chapterIndex !== state.currentChapterIndex && state.followPlayback) {
    state.currentChapterIndex = chapterIndex;
    setActiveChapterButton(chapterIndex);
    renderCurrentChapter();
  }

  state.currentChapterTokens.forEach((token) => token.classList.remove("active"));

  const localIndex = globalIndex - (state.chapterWordOffsets[state.currentChapterIndex] || 0);
  const activeToken = state.currentChapterTokens[localIndex];
  if (activeToken) {
    activeToken.classList.add("active");
    revealTokenIfNeeded(activeToken);
  }
}

function buildAlignmentWordTimings(segments) {
  const timings = [];
  for (const segment of segments) {
    const words = tokenizeWords(segment.text);
    if (!words.length) {
      continue;
    }

    const segmentDuration = Math.max(0.001, segment.end - segment.start);
    const weights = words.map((word) => Math.max(1, Math.pow(word.length, 0.9)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = segment.start;

    for (let index = 0; index < words.length; index += 1) {
      const sliceDuration =
        index === words.length - 1
          ? Math.max(0.001, segment.end - cursor)
          : segmentDuration * (weights[index] / totalWeight);
      timings.push({
        index: segment.wordStart + index,
        start: cursor,
        end: cursor + sliceDuration,
      });
      cursor += sliceDuration;
    }
  }
  return timings;
}

function tokenizeWords(text) {
  return text.match(/[\p{L}\p{M}\p{N}ºª]+(?:['’\-][\p{L}\p{M}\p{N}ºª]+)*/gu) || [];
}

function revealTokenIfNeeded(token) {
  if (!state.followPlayback) {
    return;
  }

  const containerRect = els.readerContent.getBoundingClientRect();
  const tokenRect = token.getBoundingClientRect();
  const topPadding = 96;
  const bottomPadding = 120;

  if (
    tokenRect.top >= containerRect.top + topPadding &&
    tokenRect.bottom <= containerRect.bottom - bottomPadding
  ) {
    return;
  }

  const offsetTop = token.offsetTop - els.readerContent.clientHeight * 0.28;
  state.readerScrollLockedUntil = Date.now() + 500;
  els.readerContent.scrollTo({
    top: Math.max(0, offsetTop),
    behavior: "smooth",
  });
}

function handleReaderManualScroll() {
  if (Date.now() < state.readerScrollLockedUntil) {
    return;
  }
  state.followPlayback = false;
}

function updateLanguagePills() {
  const chosenBookLanguage =
    els.bookLanguage.value === "auto"
      ? `${getLanguageLabel(state.detectedBookLanguage)} detected`
      : getLanguageLabel(els.bookLanguage.value);
  const audiobookLabel = getLanguageLabel(els.audiobookLanguage.value);
  const listenerLabel = getLanguageLabel(els.listenerLanguage.value);

  els.activeLanguagePill.textContent = `Book: ${chosenBookLanguage}`;
  els.translationLanguagePill.textContent = `Audio: ${audiobookLabel}`;
  els.listenerLanguagePill.textContent = `You: ${listenerLabel}`;
  updateVoicePromptHint();
}

function updateVoicePill() {
  els.voicePill.textContent = `Voice: ${state.selectedVoice?.name || "default"}`;
}

function getVoiceLabelValue() {
  return els.voiceLabel.value.trim() || "My Voice";
}

function refreshVoicePreview() {
  const previewSample = state.selectedVoice && !state.selectedVoice.builtIn ? state.selectedVoice : null;
  if (!previewSample?.url) {
    els.voicePreview.pause();
    els.voicePreview.removeAttribute("src");
    els.voicePreview.hidden = true;
    return;
  }

  els.voicePreview.hidden = false;
  if (els.voicePreview.src !== new URL(previewSample.url, window.location.origin).href) {
    els.voicePreview.src = previewSample.url;
  }
}

function updateVoicePromptHint() {
  const language = els.audiobookLanguage.value;
  els.voiceScriptText.textContent =
    voicePromptHints[language] ||
    "Read one calm, natural sentence with numbers and names so the cloned voice captures your rhythm clearly.";
}

function getLanguageLabel(code) {
  return languageLabels.get(code) || String(code || "").toUpperCase();
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
  return tokenizeWords(text).length;
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
      source: state.readerLanguage || state.detectedBookLanguage || els.bookLanguage.value,
      target: els.listenerLanguage.value,
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
