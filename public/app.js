const state = {
  appName: "Voxenor",
  authenticated: false,
  profile: null,
  modelInfo: null,
  preferences: null,
  localAccessUrls: [],
  libraryBooks: [],
  currentBook: null,
  currentPageIndex: 0,
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
  defaultExaggeration: 0.52,
  progressSaveTimer: 0,
  bookImporting: false,
  pagePreparing: false,
  pageStatusPoller: 0,
  pageStatusPollerBusy: false,
  readerTurnTimer: 0,
  lastWarmWindowKey: "",
};

const voicePromptHints = {
  "pt-pt":
    "O Senhor tinha três portas no número quatro, e os vizinhos tinham tempo para ouvir tudo com calma, clareza e presença natural.",
};

const els = {
  authShell: document.querySelector("#auth-shell"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authSubmit: document.querySelector("#auth-submit"),
  authStatus: document.querySelector("#auth-status"),
  logoutButton: document.querySelector("#logout-button"),
  bookForm: document.querySelector("#book-form"),
  bookTitle: document.querySelector("#book-title"),
  bookText: document.querySelector("#book-text"),
  bookFile: document.querySelector("#book-file"),
  bookSubmit: document.querySelector("#book-submit"),
  bookStatus: document.querySelector("#book-status"),
  bookLanguage: document.querySelector("#book-language"),
  listenerLanguage: document.querySelector("#listener-language"),
  audiobookLanguage: document.querySelector("#audiobook-language"),
  chapterList: document.querySelector("#chapter-list"),
  chapterCount: document.querySelector("#chapter-count"),
  pageWindowLabel: document.querySelector("#page-window-label"),
  pagePrev: document.querySelector("#page-prev"),
  pageNext: document.querySelector("#page-next"),
  libraryCount: document.querySelector("#library-count"),
  bookLibrary: document.querySelector("#book-library"),
  profileName: document.querySelector("#profile-name"),
  profileDetails: document.querySelector("#profile-details"),
  networkList: document.querySelector("#network-list"),
  readerTitle: document.querySelector("#reader-title"),
  readerPage: document.querySelector("#reader-page"),
  readerContent: document.querySelector("#reader-content"),
  seekBackward: document.querySelector("#seek-backward"),
  seekForward: document.querySelector("#seek-forward"),
  restartToggle: document.querySelector("#restart-toggle"),
  playToggle: document.querySelector("#play-toggle"),
  pauseToggle: document.querySelector("#pause-toggle"),
  stopToggle: document.querySelector("#stop-toggle"),
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
  attachEvents();
  const session = await fetchJson("/api/session");
  if (!session.authenticated) {
    showAuthShell(true);
    els.authEmail.value = "eleonorashatkovska@gmail.com";
    return;
  }

  await initializeAuthenticatedApp(session.profile);
}

function attachEvents() {
  els.authSubmit.addEventListener("click", handleLogin);
  els.authPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      void handleLogin();
    }
  });
  els.logoutButton.addEventListener("click", handleLogout);
  els.bookForm.addEventListener("submit", handleBookOpen);
  els.pagePrev.addEventListener("click", () => void openAdjacentPage(-1));
  els.pageNext.addEventListener("click", () => void openAdjacentPage(1));
  if (els.seekBackward) {
    els.seekBackward.addEventListener("click", () => seekCurrentAudio(-10));
  }
  if (els.seekForward) {
    els.seekForward.addEventListener("click", () => seekCurrentAudio(10));
  }
  if (els.restartToggle) {
    els.restartToggle.addEventListener("click", handleRestartCurrentPage);
  }
  els.playToggle.addEventListener("click", handlePlayToggle);
  els.pauseToggle.addEventListener("click", () => els.bookAudio.pause());
  if (els.stopToggle) {
    els.stopToggle.addEventListener("click", handleStopCurrentPage);
  }
  els.bookAudio.addEventListener("timeupdate", syncPlaybackHighlight);
  els.bookAudio.addEventListener("timeupdate", scheduleProgressSave);
  els.bookAudio.addEventListener("play", startPlaybackTracking);
  els.bookAudio.addEventListener("pause", stopPlaybackTracking);
  els.bookAudio.addEventListener("ended", handleAudioEnded);
  els.bookAudio.addEventListener("seeking", syncPlaybackHighlight);
  els.recordToggle.addEventListener("click", toggleRecording);
  els.uploadVoiceButton.addEventListener("click", () => els.voiceFile.click());
  els.voiceFile.addEventListener("change", handleVoiceUploadFromPicker);
  els.generateButton.addEventListener("click", handlePrepareCurrentPage);
  els.bookLanguage.addEventListener("change", handlePreferenceFieldChange);
  els.listenerLanguage.addEventListener("change", handlePreferenceFieldChange);
  els.audiobookLanguage.addEventListener("change", handlePreferenceFieldChange);
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

async function initializeAuthenticatedApp(profileOverride = null) {
  state.authenticated = true;
  showAuthShell(false);
  const meta = await fetchJson("/api/meta");
  state.appName = meta.appName || "Voxenor";
  state.modelInfo = meta.modelInfo || null;
  state.profile = profileOverride || meta.profile || null;
  state.preferences = meta.preferences || null;
  state.localAccessUrls = meta.localAccessUrls || [];
  state.voiceSamples = meta.voiceSamples || [];
  state.selectedVoice =
    state.voiceSamples.find((sample) => sample.id === meta.preferences?.selectedVoiceId) || state.voiceSamples[0] || null;
  if (!meta.modelInfo?.supportsCustomVoiceCloning) {
    state.selectedVoice = state.voiceSamples.find((sample) => sample.id === "storybook") || state.selectedVoice;
  }
  state.defaultExaggeration = meta.defaults?.exaggeration ?? 0.52;
  renderLanguageOptions(meta);
  renderSupportedLanguages(meta.fullySupportedLanguages || []);
  renderVoiceShelf();
  renderProfile(meta.profile, meta.localAccessUrls || []);
  syncVoiceCaptureCapabilities();
  if (!meta.modelInfo?.supportsCustomVoiceCloning && meta.preferences?.selectedVoiceId !== state.selectedVoice?.id) {
    void persistPreferences();
  }
  els.generateButton.textContent = "Generate audiobook";

  const booksPayload = await fetchJson("/api/books");
  state.libraryBooks = booksPayload.books || [];
  renderLibraryBooks();

  const resumeBook = state.libraryBooks[0];
  if (resumeBook) {
    await loadLibraryBook(resumeBook.id, resumeBook.progress?.pageIndex || 0);
  } else {
    renderPageList();
    renderCurrentChapter();
  }
}

function showAuthShell(visible) {
  els.authShell.classList.toggle("hidden", !visible);
}

async function handleLogin() {
  els.authStatus.textContent = "Signing you into Voxenor...";
  try {
    const payload = await fetchJson("/api/session/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: els.authEmail.value.trim(),
        password: els.authPassword.value,
      }),
    });

    state.authenticated = true;
    state.profile = payload.profile || null;
    els.authPassword.value = "";
    await initializeAuthenticatedApp(payload.profile || null);
  } catch (error) {
    els.authStatus.textContent = error.message;
  }
}

async function handleLogout() {
  await fetchJson("/api/session/logout", {
    method: "POST",
  }).catch(() => {});

  stopPageStatusPolling();
  state.authenticated = false;
  state.profile = null;
  state.libraryBooks = [];
  state.currentBook = null;
  state.currentPageIndex = 0;
  state.chapters = [];
  state.fullText = "";
  els.bookAudio.pause();
  els.bookAudio.removeAttribute("src");
  els.bookAudio.load();
  setTransportAvailability(false);
  renderLibraryBooks();
  renderPageList();
  renderCurrentChapter();
  showAuthShell(true);
}

function renderProfile(profile, localAccessUrls) {
  if (!profile) {
    els.profileName.textContent = "Your reader profile";
    els.profileDetails.textContent = "Sign in to see saved preferences.";
    els.networkList.innerHTML = "";
    return;
  }

  const nativeLabels = (profile.nativeLanguages || []).map(getLanguageLabel).join(" + ");
  const fluentLabels = (profile.fluentLanguages || []).map(getLanguageLabel).join(", ");
  els.profileName.textContent = profile.name || profile.email || "Reader";
  els.profileDetails.textContent = `Native: ${nativeLabels || "Unknown"}. Fluent: ${fluentLabels || "Unknown"}. Learning: ${getLanguageLabel(profile.learningLanguage || "pt-pt")}.`;
  els.networkList.innerHTML = (localAccessUrls || [])
    .map((url) => `<span class="network-pill">${escapeHtml(url)}</span>`)
    .join("");
}

async function handlePreferenceFieldChange() {
  updateLanguagePills();
  await persistPreferences();
}

async function persistPreferences() {
  try {
    const payload = await fetchJson("/api/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceLanguage: els.bookLanguage.value,
        listenerLanguage: els.listenerLanguage.value,
        audiobookLanguage: els.audiobookLanguage.value,
        selectedVoiceId: state.selectedVoice?.id || "storybook",
      }),
    });
    state.preferences = payload.preferences;
  } catch (error) {
    console.warn("Preferences update failed:", error.message);
  }
}

function setBookStatus(message, isError = false) {
  els.bookStatus.textContent = message;
  els.bookStatus.classList.toggle("is-error", isError);
}

function setBookImportState(isImporting) {
  state.bookImporting = isImporting;
  els.bookSubmit.disabled = isImporting;
  els.bookSubmit.classList.toggle("is-loading", isImporting);
  els.bookSubmit.textContent = isImporting ? "Importing..." : "Save to library";
}

async function handleBookOpen(event) {
  event.preventDefault();
  if (state.bookImporting) {
    return;
  }

  const hasText = Boolean(els.bookText.value.trim());
  const file = els.bookFile.files[0];
  if (!hasText && !file) {
    setBookStatus("Paste some text or choose a PDF, EPUB, TXT, or image first.", true);
    return;
  }

  const formData = new FormData();
  formData.append("title", els.bookTitle.value.trim());
  formData.append("text", els.bookText.value);
  formData.append("sourceLanguage", els.bookLanguage.value);
  formData.append("listenerLanguage", els.listenerLanguage.value);
  formData.append("audiobookLanguage", els.audiobookLanguage.value);
  if (file) {
    formData.append("bookFile", file);
  }

  setBookImportState(true);
  setBookStatus(file ? "Uploading and extracting your book..." : "Saving your text into the library...");
  setSelectionTranslation("Saving your book into Voxenor...", false);

  try {
    const payload = await fetchJson("/api/books/import", {
      method: "POST",
      body: formData,
    });

    state.currentBook = payload.book;
    state.currentPageIndex = payload.page?.index || 0;
    upsertLibraryBook(payload.book);
    renderLibraryBooks();
    applyBookPage(payload.book, payload.page);
    renderPageList();
    updateLanguagePills();
    const importMessage = payload.existing
      ? `"${payload.book.title}" was already in your library, so I opened the saved copy.`
      : `Saved "${payload.book.title}" to your library.`;
    setBookStatus(payload.existing ? importMessage : `${importMessage} Pick a voice and click Generate audiobook.`);
    setSelectionTranslation(importMessage, false);
    els.bookFile.value = "";
  } catch (error) {
    setBookStatus(error.message, true);
    setSelectionTranslation(error.message, true);
  } finally {
    setBookImportState(false);
  }
}

function renderLanguageOptions(meta) {
  const sourceLanguages = meta.sourceLanguages || [];
  const listenerLanguages = meta.listenerLanguages || [];
  const audiobookLanguages = meta.audiobookLanguages || [];
  const preferences = meta.preferences || {};

  for (const language of [...sourceLanguages, ...listenerLanguages, ...audiobookLanguages]) {
    languageLabels.set(language.code, language.label);
  }
  languageLabels.set("pt", "Portuguese");

  populateSelect(els.bookLanguage, sourceLanguages);
  populateSelect(els.listenerLanguage, listenerLanguages);
  populateSelect(els.audiobookLanguage, audiobookLanguages);

  els.bookLanguage.value = preferences.sourceLanguage || "auto";
  els.listenerLanguage.value = preferences.listenerLanguage || "en";
  els.audiobookLanguage.value = preferences.audiobookLanguage || "pt-pt";
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
    const customVoiceUnavailable = !sample.builtIn && !state.modelInfo?.supportsCustomVoiceCloning;
    button.className = `voice-card${isActive ? " active" : ""}`;
    button.dataset.voiceId = sample.id;
    button.disabled = customVoiceUnavailable;
    button.innerHTML = `
      <strong>${sample.name}</strong>
      <small>${sample.vibe}</small>
      <small>${languageLabels.get(sample.language) || sample.language.toUpperCase()}</small>
    `;
    button.addEventListener("click", () => {
      if (customVoiceUnavailable) {
        return;
      }
      state.selectedVoice = sample;
      renderVoiceShelf();
      void persistPreferences();
    });

    shell.append(button);

    if (!sample.builtIn && state.modelInfo?.supportsCustomVoiceCloning) {
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

function renderLibraryBooks() {
  els.bookLibrary.classList.remove("empty-state");
  els.bookLibrary.textContent = "";
  els.libraryCount.textContent = `${state.libraryBooks.length} book${state.libraryBooks.length === 1 ? "" : "s"}`;

  if (!state.libraryBooks.length) {
    els.bookLibrary.classList.add("empty-state");
    els.bookLibrary.textContent = "Save a PDF, EPUB, or text file to start your library.";
    return;
  }

  state.libraryBooks.forEach((book) => {
    const shell = document.createElement("div");
    shell.className = "book-card-shell";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `book-card${state.currentBook?.id === book.id ? " active" : ""}`;
    button.innerHTML = `
      <div class="book-cover">${book.coverUrl ? `<img src="${book.coverUrl}" alt="${escapeHtml(book.title)} cover" />` : "VOX"}</div>
      <div class="book-card-copy">
        <strong>${escapeHtml(book.title)}</strong>
        <small>${book.totalPages} page${book.totalPages === 1 ? "" : "s"} · ${getLanguageLabel(book.detectedLanguage)}</small>
        <small>Resume from page ${(book.progress?.pageIndex ?? 0) + 1}</small>
      </div>
    `;
    button.addEventListener("click", () => {
      void loadLibraryBook(book.id, book.progress?.pageIndex || 0);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "book-card-delete";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${book.title}`);
    deleteButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleDeleteBook(book.id);
    });

    shell.append(button, deleteButton);
    els.bookLibrary.append(shell);
  });
}

async function loadLibraryBook(bookId, pageIndex = 0, options = {}) {
  const payload = await fetchJson(`/api/books/${bookId}`);
  state.currentBook = payload.book;
  state.currentPageIndex = pageIndex;
  upsertLibraryBook(payload.book);
  renderLibraryBooks();
  renderPageList();
  await openBookPage(pageIndex, { autoPrepare: false, ...options });
}

async function handleDeleteBook(bookId) {
  const book = state.libraryBooks.find((candidate) => candidate.id === bookId);
  if (!book) {
    return;
  }

  const confirmed = window.confirm(`Delete "${book.title}" from your library?`);
  if (!confirmed) {
    return;
  }

  setBookStatus(`Deleting "${book.title}"...`);
  try {
    await fetchJson(`/api/books/${encodeURIComponent(bookId)}`, {
      method: "DELETE",
    });

    state.libraryBooks = state.libraryBooks.filter((candidate) => candidate.id !== bookId);
    renderLibraryBooks();

    if (state.currentBook?.id === bookId) {
      const nextBook = state.libraryBooks[0] || null;
      if (nextBook) {
        await loadLibraryBook(nextBook.id, nextBook.progress?.pageIndex || 0);
      } else {
        state.currentBook = null;
        state.currentPageIndex = 0;
        state.chapters = [];
        state.fullText = "";
        state.sourceText = "";
        state.alignmentSegments = [];
        state.alignmentWordTimings = [];
        els.bookAudio.pause();
        els.bookAudio.removeAttribute("src");
        els.bookAudio.load();
        setTransportAvailability(false);
        renderPageList();
        renderCurrentChapter();
        updateLanguagePills();
      }
    }

    setBookStatus(`Removed "${book.title}" from your library.`);
  } catch (error) {
    setBookStatus(error.message, true);
  }
}

function upsertLibraryBook(book) {
  state.libraryBooks = [
    book,
    ...state.libraryBooks.filter((existingBook) => existingBook.id !== book.id),
  ];
}

function mergeBookSummary(bookSummary) {
  if (!bookSummary) {
    return;
  }

  const existingBook = state.currentBook?.id === bookSummary.id ? state.currentBook : null;
  if (existingBook) {
    state.currentBook = {
      ...existingBook,
      ...bookSummary,
      pages: existingBook.pages || [],
    };
  }

  upsertLibraryBook({
    ...(state.libraryBooks.find((book) => book.id === bookSummary.id) || {}),
    ...bookSummary,
  });
}

function getVisiblePageIndexes(totalPages, currentPageIndex, maxVisible = 5) {
  if (!totalPages) {
    return [];
  }

  const visibleCount = Math.min(maxVisible, totalPages);
  let start = Math.max(0, currentPageIndex - 1);
  if (start + visibleCount > totalPages) {
    start = Math.max(0, totalPages - visibleCount);
  }

  return Array.from({ length: visibleCount }, (_, offset) => start + offset);
}

function renderPageList() {
  els.chapterList.classList.remove("empty-state");
  els.chapterList.textContent = "";
  const pages = state.currentBook?.pages || [];
  els.chapterCount.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"}`;
  els.pageWindowLabel.textContent = pages.length ? `Page ${state.currentPageIndex + 1} of ${pages.length}` : "Current page";
  els.pagePrev.disabled = !pages.length || state.currentPageIndex <= 0;
  els.pageNext.disabled = !pages.length || state.currentPageIndex >= pages.length - 1;

  if (!pages.length) {
    els.chapterList.classList.add("empty-state");
    els.chapterList.textContent = "Open a saved book to see its pages.";
    return;
  }

  const visibleIndexes = getVisiblePageIndexes(pages.length, state.currentPageIndex);

  visibleIndexes.forEach((index) => {
    const page = pages[index];
    const shell = document.createElement("div");
    shell.className = "chapter-card-shell";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `chapter-button${index === state.currentPageIndex ? " active" : ""}`;
    button.dataset.pageIndex = String(index);
    button.innerHTML = `
      <span class="chapter-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="chapter-title">
        <span>${escapeHtml(page.title || `Page ${index + 1}`)}</span>
        <span class="chapter-meta">
          <span class="status-chip">${escapeHtml(page.translationStatus || "idle")}</span>
          <span class="status-chip">${escapeHtml(page.audioStatus || "idle")}</span>
        </span>
        <small class="chapter-preview">${escapeHtml(page.preview || "Open this page to start reading.")}</small>
      </span>
    `;
    button.addEventListener("click", () => {
      const turnDirection = index > state.currentPageIndex ? "forward" : index < state.currentPageIndex ? "backward" : "";
      state.currentPageIndex = index;
      setActiveChapterButton(index);
      void openBookPage(index, { turnDirection });
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "chapter-delete-button";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${page.title || `Page ${index + 1}`}`);
    removeButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleDeletePage(index);
    });

    shell.append(button, removeButton);
    els.chapterList.append(shell);
  });
}

async function openBookPage(pageIndex, options = {}) {
  if (!state.currentBook) {
    return;
  }

  const safePageIndex = Math.max(0, Math.min((state.currentBook.pages || []).length - 1, pageIndex));
  const payload = await fetchJson(`/api/books/${state.currentBook.id}/pages/${safePageIndex}`);
  state.currentPageIndex = payload.page.index;
  applyBookPage(state.currentBook, payload.page, options);
  renderPageList();
  await saveProgress();
}

function applyBookPage(book, page, options = {}) {
  state.currentBook = book;
  state.currentPageIndex = page.index;
  const summaryPage = state.currentBook?.pages?.[page.index];
  if (summaryPage) {
    summaryPage.title = page.title || summaryPage.title || `Page ${page.index + 1}`;
    summaryPage.preview = truncate(page.displayText || page.sourceText || "", 130);
    summaryPage.translationStatus = page.translationStatus || summaryPage.translationStatus || "idle";
    summaryPage.audioStatus = page.audioStatus || summaryPage.audioStatus || "idle";
    summaryPage.ready = Boolean(page.audioUrl);
  }
  state.title = book.title;
  state.sourceText = page.sourceText || "";
  state.fullText = page.displayText || "";
  state.chapters = [
    {
      title: page.title || `Page ${page.index + 1}`,
      content: page.displayText || "",
    },
  ];
  state.currentChapterIndex = 0;
  state.detectedBookLanguage = book.detectedLanguage || "auto";
  state.readerLanguage = page.translatedText ? book.audiobookLanguage || "pt-pt" : book.detectedLanguage || "auto";
  state.alignmentSegments = page.alignment?.segments || [];
  state.alignmentWordTimings = buildAlignmentWordTimings(state.alignmentSegments);
  state.lastHighlightedGlobalIndex = -1;
  state.followPlayback = true;
  computeChapterWordMetrics();
  els.readerTitle.textContent = `${book.title} · ${page.title || `Page ${page.index + 1}`}`;
  renderCurrentChapter();
  els.readerContent.scrollTop = 0;
  animatePageTurn(options.turnDirection || "");
  updateLanguagePills();

  if (page.audioUrl) {
    state.currentAudioUrl = page.audioUrl;
    els.bookAudio.src = page.audioUrl;
    setTransportAvailability(true);
    const resumeTime =
      book.progress?.pageIndex === page.index && Number.isFinite(book.progress?.audioTime) ? book.progress.audioTime : 0;
    if (resumeTime > 0) {
      els.bookAudio.addEventListener(
        "loadedmetadata",
        () => {
          els.bookAudio.currentTime = Math.min(resumeTime, Math.max(0, (els.bookAudio.duration || resumeTime) - 0.2));
        },
        { once: true }
      );
    }
    if (options.autoplay) {
      void els.bookAudio.play();
    }
  } else {
    state.currentAudioUrl = "";
    els.bookAudio.pause();
    els.bookAudio.removeAttribute("src");
    els.bookAudio.load();
    setTransportAvailability(false);
  }

  const needsTranslation =
    (book.detectedLanguage || "auto") !== "auto" &&
    normalizeLanguageCode(book.detectedLanguage || "auto") !== normalizeLanguageCode(book.audiobookLanguage || "pt-pt") &&
    !page.translatedText;
  const generationLogs = page.logs?.length
    ? page.logs
    : [
        `Translation: ${page.translationStatus || (needsTranslation ? "idle" : "source")}.`,
        `Audio: ${page.audioStatus || "idle"}.`,
      ];
  const generationLabel =
    page.audioUrl || page.translationStatus === "running" || page.audioStatus === "running"
      ? buildGenerationLabelFromPage(page)
      : needsTranslation
        ? "This page is still in the original language. Click Generate audiobook to translate it and create the voice."
        : "This page is ready to generate as an audiobook.";
  updateGenerationUi({
    label: generationLabel,
    progress: inferGenerationProgressFromPage(page),
    logs: generationLogs,
  });
  els.generationStatus.classList.remove("hidden");
  els.generateButton.textContent = page.audioUrl ? "Regenerate audiobook" : "Generate audiobook";

  if ((page.translationStatus === "running" || page.audioStatus === "running") && !page.audioUrl) {
    startPageStatusPolling(book.id, page.index);
  } else {
    stopPageStatusPolling();
  }

  if (page.audioUrl) {
    void warmUpcomingPagesFromCurrent();
  }
}

async function warmUpcomingPagesFromCurrent() {
  if (!state.currentBook?.id || !state.selectedVoice?.id) {
    return;
  }

  const currentPage = state.currentBook.pages?.[state.currentPageIndex];
  if (!currentPage?.ready) {
    return;
  }

  const warmKey = `${state.currentBook.id}:${state.currentPageIndex}:${state.selectedVoice.id}`;
  if (state.lastWarmWindowKey === warmKey) {
    return;
  }
  state.lastWarmWindowKey = warmKey;

  try {
    await fetchJson(`/api/books/${state.currentBook.id}/pages/${state.currentPageIndex}/prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voiceSampleId: state.selectedVoice.id,
      }),
    });
  } catch {
    return;
  }

  await refreshUpcomingPageStatuses(state.currentBook.id, state.currentPageIndex);
  window.setTimeout(() => {
    void refreshUpcomingPageStatuses(state.currentBook.id, state.currentPageIndex);
  }, 1400);
}

async function refreshUpcomingPageStatuses(bookId, currentPageIndex, warmDepth = 3) {
  if (!state.currentBook || state.currentBook.id !== bookId) {
    return;
  }

  const indexes = [];
  for (let offset = 1; offset <= warmDepth; offset += 1) {
    const nextIndex = currentPageIndex + offset;
    if (nextIndex >= (state.currentBook.pages || []).length) {
      break;
    }
    indexes.push(nextIndex);
  }

  if (!indexes.length) {
    return;
  }

  const pages = await Promise.all(
    indexes.map((index) =>
      fetchJson(`/api/books/${bookId}/pages/${index}`)
        .then((payload) => payload.page)
        .catch(() => null)
    )
  );

  let changed = false;
  pages.forEach((page) => {
    if (!page) {
      return;
    }
    const summaryPage = state.currentBook?.pages?.[page.index];
    if (!summaryPage) {
      return;
    }
    summaryPage.translationStatus = page.translationStatus || summaryPage.translationStatus || "idle";
    summaryPage.audioStatus = page.audioStatus || summaryPage.audioStatus || "idle";
    summaryPage.ready = Boolean(page.audioUrl);
    summaryPage.preview = truncate(page.displayText || page.sourceText || "", 130);
    changed = true;
  });

  if (changed) {
    renderPageList();
  }
}

function renderCurrentChapter() {
  const chapter = state.chapters[state.currentChapterIndex];
  if (!chapter) {
    els.readerContent.classList.add("empty-state");
    els.readerContent.textContent = "Open a saved book to start reading.";
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

function syncVoiceCaptureCapabilities() {
  const supportsCustomVoiceCloning = Boolean(state.modelInfo?.supportsCustomVoiceCloning);
  els.recordToggle.disabled = !supportsCustomVoiceCloning;
  els.uploadVoiceButton.disabled = !supportsCustomVoiceCloning;
  els.voiceFile.disabled = !supportsCustomVoiceCloning;

  if (!supportsCustomVoiceCloning) {
    els.recordingStatus.textContent =
      "Fast VPS mode is using the built-in PT-PT voice. Custom clone samples are disabled in this backend.";
  }
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
    await persistPreferences();
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
    await persistPreferences();
  } catch (error) {
    els.recordingStatus.textContent = error.message;
  }
}

async function openAdjacentPage(direction) {
  if (!state.currentBook?.pages?.length) {
    return;
  }

  const targetIndex = Math.max(0, Math.min(state.currentBook.pages.length - 1, state.currentPageIndex + direction));
  if (targetIndex === state.currentPageIndex) {
    return;
  }

  await openBookPage(targetIndex);
}

async function handleDeletePage(pageIndex) {
  if (!state.currentBook) {
    return;
  }

  const page = state.currentBook.pages?.[pageIndex];
  const label = page?.title || `Page ${pageIndex + 1}`;
  const confirmed = window.confirm(`Remove ${label} from this saved book?`);
  if (!confirmed) {
    return;
  }

  try {
    updateGenerationUi({
      label: `Removing ${label}...`,
      progress: 0,
      logs: [`Removing ${label} from the saved reading flow.`],
    });
    const payload = await fetchJson(`/api/books/${state.currentBook.id}/pages/${pageIndex}`, {
      method: "DELETE",
    });

    upsertLibraryBook(payload.book);
    state.currentBook = payload.book;
    renderLibraryBooks();
    applyBookPage(payload.book, payload.page);
    renderPageList();
    await saveProgress();
    setBookStatus(`${label} removed from "${payload.book.title}".`);
  } catch (error) {
    setBookStatus(error.message, true);
    updateGenerationUi({
      label: error.message,
      progress: 0,
      logs: [error.message],
    });
  }
}

async function handlePrepareCurrentPage(options = {}) {
  if (!state.currentBook) {
    setSelectionTranslation("Save a book into your library first.", true);
    return;
  }

  if (state.pagePreparing) {
    return;
  }

  try {
    const requestedBookId = state.currentBook.id;
    const requestedPageIndex = state.currentPageIndex;
    const requestedPageLabel = requestedPageIndex + 1;
    state.pagePreparing = true;
    els.generateButton.disabled = true;
    els.generateButton.textContent = "Generating audiobook...";
    els.generationStatus.classList.remove("hidden");
    updateGenerationUi({
      label: options.statusMessage || `Preparing page ${requestedPageLabel}...`,
      progress: 16,
      logs: [
        `Page ${requestedPageLabel}: checking translation state.`,
        "If needed, Voxenor will translate first and then generate the narration.",
      ],
    });
    startPageStatusPolling(requestedBookId, requestedPageIndex);

    const payload = await fetchJson(`/api/books/${requestedBookId}/pages/${requestedPageIndex}/prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voiceSampleId: state.selectedVoice?.id || "storybook",
      }),
    });

    mergeBookSummary(payload.book);
    renderLibraryBooks();
    applyBookPage(state.currentBook || payload.book, payload.page, {
      autoplay: Boolean(options.autoplay),
    });
    renderPageList();
    await persistPreferences();

    const generationStillRunning =
      !payload.page.audioUrl &&
      (payload.started || payload.page.translationStatus === "running" || payload.page.audioStatus === "running");

    if (generationStillRunning) {
      startPageStatusPolling(requestedBookId, requestedPageIndex);
      if (!payload.page.logs?.length) {
        updateGenerationUi({
          label: `Preparing page ${requestedPageLabel}...`,
          progress: 18,
          logs: [
            `Page ${requestedPageLabel}: translation and narration started.`,
            "Voxenor will keep polling until this page is ready.",
          ],
        });
      }
      setBookStatus(`Started generating page ${requestedPageLabel} in "${payload.book.title}".`);
      return;
    }

    stopPageStatusPolling();
    setBookStatus(`Page ${payload.page.index + 1} is ready in "${payload.book.title}".`);
  } catch (error) {
    const requestedBookId = state.currentBook?.id;
    const requestedPageIndex = state.currentPageIndex;

    if (requestedBookId) {
      try {
        const recovery = await fetchJson(`/api/books/${requestedBookId}/pages/${requestedPageIndex}`);
        const recoveryPage = recovery.page;
        const summaryPage = state.currentBook?.pages?.[requestedPageIndex];
        if (summaryPage) {
          summaryPage.translationStatus = recoveryPage.translationStatus || summaryPage.translationStatus || "idle";
          summaryPage.audioStatus = recoveryPage.audioStatus || summaryPage.audioStatus || "idle";
          summaryPage.ready = Boolean(recoveryPage.audioUrl);
        }

        if (recoveryPage.audioUrl || recoveryPage.translationStatus === "running" || recoveryPage.audioStatus === "running") {
          applyBookPage(state.currentBook, recoveryPage, {
            autoplay: Boolean(options.autoplay && recoveryPage.audioUrl),
          });
          renderPageList();

          if (recoveryPage.audioUrl) {
            stopPageStatusPolling();
            setBookStatus(`Page ${recoveryPage.index + 1} is ready in "${state.currentBook.title}".`);
          } else {
            startPageStatusPolling(requestedBookId, requestedPageIndex);
            setBookStatus("Generation is still running in the background.");
          }
          return;
        }
      } catch {
        // Fall through to the normal error path if even the recovery poll fails.
      }
    }

    stopPageStatusPolling();
    setBookStatus(error.message, true);
    updateGenerationUi({
      label: error.message,
      progress: 0,
      logs: [error.message],
    });
  } finally {
    state.pagePreparing = false;
    els.generateButton.disabled = false;
    if (state.currentBook) {
      const currentPage = state.currentBook.pages?.[state.currentPageIndex];
      els.generateButton.textContent = currentPage?.ready ? "Regenerate audiobook" : "Generate audiobook";
    } else {
      els.generateButton.textContent = "Generate audiobook";
    }
  }
}

async function handlePlayToggle() {
  if (!state.currentBook) {
    return;
  }

  if (!els.bookAudio.src) {
    updateGenerationUi({
      label: `Page ${state.currentPageIndex + 1} is not ready yet.`,
      progress: 0,
      logs: ["Pick your voice and click Generate audiobook first."],
    });
    els.generationStatus.classList.remove("hidden");
    return;
  }

  await els.bookAudio.play();
}

async function handleAudioEnded() {
  stopPlaybackTracking();
  if (!state.currentBook || !state.currentBook.pages?.length) {
    return;
  }

  const nextPageIndex = state.currentPageIndex + 1;
  if (nextPageIndex >= state.currentBook.pages.length) {
    return;
  }

  await loadLibraryBook(state.currentBook.id, nextPageIndex, { turnDirection: "forward" });
  if (els.bookAudio.src) {
    await els.bookAudio.play().catch(() => {});
    return;
  }

  await handlePrepareCurrentPage({ autoplay: true });
}

function setTransportAvailability(isReady) {
  if (els.seekBackward) {
    els.seekBackward.disabled = !isReady;
  }
  if (els.seekForward) {
    els.seekForward.disabled = !isReady;
  }
  if (els.restartToggle) {
    els.restartToggle.disabled = !isReady;
  }
  els.playToggle.disabled = !isReady;
  els.pauseToggle.disabled = !isReady;
  if (els.stopToggle) {
    els.stopToggle.disabled = !isReady;
  }
}

function seekCurrentAudio(deltaSeconds) {
  if (!els.bookAudio.src || !Number.isFinite(els.bookAudio.duration)) {
    return;
  }

  const nextTime = Math.max(0, Math.min(els.bookAudio.duration, (els.bookAudio.currentTime || 0) + deltaSeconds));
  els.bookAudio.currentTime = nextTime;
  syncPlaybackHighlight();
  scheduleProgressSave();
}

function handleStopCurrentPage() {
  if (!els.bookAudio.src) {
    return;
  }
  els.bookAudio.pause();
  els.bookAudio.currentTime = 0;
  state.lastHighlightedGlobalIndex = -1;
  syncPlaybackHighlight();
  void saveProgress();
}

async function handleRestartCurrentPage() {
  if (!els.bookAudio.src) {
    return;
  }
  els.bookAudio.currentTime = 0;
  state.lastHighlightedGlobalIndex = -1;
  syncPlaybackHighlight();
  await els.bookAudio.play().catch(() => {});
}

function animatePageTurn(direction) {
  if (!els.readerPage) {
    return;
  }

  els.readerPage.classList.remove("turn-forward", "turn-backward");
  window.clearTimeout(state.readerTurnTimer);
  if (!direction) {
    return;
  }

  const className = direction === "backward" ? "turn-backward" : "turn-forward";
  requestAnimationFrame(() => {
    els.readerPage.classList.add(className);
    state.readerTurnTimer = window.setTimeout(() => {
      els.readerPage.classList.remove(className);
    }, 760);
  });
}

function scheduleProgressSave() {
  clearTimeout(state.progressSaveTimer);
  state.progressSaveTimer = window.setTimeout(() => {
    void saveProgress();
  }, 800);
}

async function saveProgress() {
  if (!state.currentBook) {
    return;
  }

  await fetchJson(`/api/books/${state.currentBook.id}/progress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pageIndex: state.currentPageIndex,
      audioTime: els.bookAudio.currentTime || 0,
    }),
  }).catch(() => {});
}

function updateGenerationUi({ label, progress, logs }) {
  els.generationLabel.textContent = label;
  els.generationPercent.textContent = `${Math.round(progress)}%`;
  els.generationProgress.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
  els.generationLog.innerHTML = logs.map((entry) => `<div>${escapeHtml(entry)}</div>`).join("");
}

function inferGenerationProgressFromPage(page) {
  if (page.audioUrl) {
    return 100;
  }

  const segmentLog =
    page.audioStatus === "running"
      ? [...(page.logs || [])].reverse().find((entry) => /Generating segment \d+ of \d+\./u.test(entry))
      : "";
  if (segmentLog) {
    const match = segmentLog.match(/Generating segment (\d+) of (\d+)\./u);
    if (match) {
      const currentSegment = Number(match[1]);
      const totalSegments = Number(match[2]);
      if (totalSegments > 0) {
        return 35 + (currentSegment / totalSegments) * 55;
      }
    }
  }

  if (page.audioStatus === "running") {
    return 48;
  }
  if (page.translationStatus === "running") {
    return 18;
  }
  if (page.translationStatus === "ready") {
    return 30;
  }
  return 0;
}

function buildGenerationLabelFromPage(page) {
  if (page.audioUrl) {
    return "Audiobook page ready. Press Play.";
  }
  if (page.audioStatus === "running") {
    return `Generating audiobook for page ${page.index + 1}...`;
  }
  if (page.translationStatus === "running") {
    return `Translating page ${page.index + 1}...`;
  }
  if (page.translationStatus === "ready") {
    return `Translation ready for page ${page.index + 1}.`;
  }
  return `Page ${page.index + 1} is waiting for generation.`;
}

function stopPageStatusPolling() {
  if (state.pageStatusPoller) {
    window.clearInterval(state.pageStatusPoller);
    state.pageStatusPoller = 0;
  }
  state.pageStatusPollerBusy = false;
}

function startPageStatusPolling(bookId, pageIndex) {
  stopPageStatusPolling();

  const poll = async () => {
    if (state.pageStatusPollerBusy) {
      return;
    }

    state.pageStatusPollerBusy = true;
    try {
      const payload = await fetchJson(`/api/books/${bookId}/pages/${pageIndex}`);
      const page = payload.page;
      const summaryPage = state.currentBook?.pages?.[pageIndex];
      if (summaryPage) {
        summaryPage.translationStatus = page.translationStatus || summaryPage.translationStatus || "idle";
        summaryPage.audioStatus = page.audioStatus || summaryPage.audioStatus || "idle";
        summaryPage.ready = Boolean(page.audioUrl);
      }

      if (state.currentBook?.id === bookId && state.currentPageIndex === pageIndex) {
        updateGenerationUi({
          label: buildGenerationLabelFromPage(page),
          progress: inferGenerationProgressFromPage(page),
          logs: page.logs?.length ? page.logs : ["Waiting for generation logs..."],
        });
        renderPageList();
      }

      if (page.audioUrl) {
        stopPageStatusPolling();
      }
    } catch {
      // Keep polling quietly while the long-running prepare request is active.
    } finally {
      state.pageStatusPollerBusy = false;
    }
  };

  void poll();
  state.pageStatusPoller = window.setInterval(() => {
    void poll();
  }, 1400);
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
  document.querySelectorAll(".chapter-button").forEach((node) => {
    node.classList.toggle("active", Number(node.dataset.pageIndex) === activeIndex);
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
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("Could not reach the Voxenor server. Refresh and try again.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }
  return payload;
}

function normalizeLanguageCode(language) {
  const code = String(language || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");

  if (!code || code === "auto") {
    return "auto";
  }
  if (code === "pt-br" || code === "pt-pt") {
    return code;
  }
  if (code === "pt") {
    return "pt";
  }
  return code.split("-")[0];
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
