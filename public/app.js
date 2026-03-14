const state = {
  appName: "Voxenor",
  authenticated: false,
  profile: null,
  preferences: null,
  modelInfo: null,
  localAccessUrls: [],
  libraryBooks: [],
  piperVoices: [],
  savedWords: [],
  selectedVoice: null,
  currentBook: null,
  currentPage: null,
  previewPage: null,
  currentPageIndex: 0,
  detectedBookLanguage: "auto",
  readerLanguage: "auto",
  alignmentSegments: [],
  alignmentWordTimings: [],
  currentTokens: [],
  lookupTokens: [],
  totalWordCount: 0,
  currentAudioUrl: "",
  lastHighlightedGlobalIndex: -1,
  activeLookupSourceNormalized: "",
  lookup: null,
  pagePreparing: false,
  pageStatusPoller: 0,
  pageStatusPollerBusy: false,
  highlightAnimationFrame: 0,
  followPlayback: true,
  readerScrollLockedUntil: 0,
  selectionTranslateTimer: 0,
  lastSelectionText: "",
  lastWarmWindowKey: "",
  progressSaveTimer: 0,
  bookImporting: false,
  readerTurnTimer: 0,
  previewRequestToken: 0,
};

const els = {
  authShell: document.querySelector("#auth-shell"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authSubmit: document.querySelector("#auth-submit"),
  authStatus: document.querySelector("#auth-status"),
  logoutButton: document.querySelector("#logout-button"),
  homeButton: document.querySelector("#home-button"),
  libraryView: document.querySelector("#library-view"),
  readerView: document.querySelector("#reader-view"),
  backToLibrary: document.querySelector("#back-to-library"),
  bookForm: document.querySelector("#book-form"),
  bookTitle: document.querySelector("#book-title"),
  bookText: document.querySelector("#book-text"),
  bookFile: document.querySelector("#book-file"),
  bookSubmit: document.querySelector("#book-submit"),
  bookStatus: document.querySelector("#book-status"),
  bookLanguage: document.querySelector("#book-language"),
  listenerLanguage: document.querySelector("#listener-language"),
  audiobookLanguage: document.querySelector("#audiobook-language"),
  libraryCount: document.querySelector("#library-count"),
  bookLibrary: document.querySelector("#book-library"),
  voiceShelf: document.querySelector("#voice-shelf"),
  voicePill: document.querySelector("#voice-pill"),
  piperCatalog: document.querySelector("#piper-catalog"),
  piperCatalogStatus: document.querySelector("#piper-catalog-status"),
  supportedLanguageList: document.querySelector("#supported-language-list"),
  profileName: document.querySelector("#profile-name"),
  profileDetails: document.querySelector("#profile-details"),
  networkList: document.querySelector("#network-list"),
  readerBookCover: document.querySelector("#reader-book-cover"),
  readerBookTitle: document.querySelector("#reader-book-title"),
  readerBookMeta: document.querySelector("#reader-book-meta"),
  readerProgressLabel: document.querySelector("#reader-progress-label"),
  readerPageLabel: document.querySelector("#reader-page-label"),
  readerProgressFill: document.querySelector("#reader-progress-fill"),
  readerStatusPill: document.querySelector("#reader-status-pill"),
  activeLanguagePill: document.querySelector("#active-language-pill"),
  translationLanguagePill: document.querySelector("#translation-language-pill"),
  listenerLanguagePill: document.querySelector("#listener-language-pill"),
  readerDeleteBook: document.querySelector("#reader-delete-book"),
  goToPageForm: document.querySelector("#go-to-page-form"),
  goToPageInput: document.querySelector("#go-to-page-input"),
  generateButton: document.querySelector("#generate-button"),
  generationStatus: document.querySelector("#generation-status"),
  generationLabel: document.querySelector("#generation-label"),
  generationPercent: document.querySelector("#generation-percent"),
  generationProgress: document.querySelector("#generation-progress"),
  generationLog: document.querySelector("#generation-log"),
  playToggle: document.querySelector("#play-toggle"),
  pauseToggle: document.querySelector("#pause-toggle"),
  restartToggle: document.querySelector("#restart-toggle"),
  pagePrev: document.querySelector("#page-prev"),
  pageNext: document.querySelector("#page-next"),
  readerPage: document.querySelector("#reader-page"),
  readerContent: document.querySelector("#reader-content"),
  readerContentNext: document.querySelector("#reader-content-next"),
  pageFooterNumber: document.querySelector("#page-footer-number"),
  pageFooterNumberNext: document.querySelector("#page-footer-number-next"),
  bookAudio: document.querySelector("#book-audio"),
  selectionTranslation: document.querySelector("#selection-translation"),
  saveWordButton: document.querySelector("#save-word-button"),
  savedWordsCount: document.querySelector("#saved-words-count"),
  savedWordsList: document.querySelector("#saved-words-list"),
};

const languageLabels = new Map();

bootstrap().catch((error) => {
  console.error(error);
  setLookupError(`Setup error: ${error.message}`);
});

async function bootstrap() {
  attachEvents();
  const session = await fetchJson("/api/session").catch(() => ({ authenticated: false }));
  if (!session.authenticated) {
    showAuthShell(true);
    els.authEmail.value = "eleonorashatkovska@gmail.com";
    switchView("library");
    return;
  }

  await initializeAuthenticatedApp(session.profile || null);
}

function attachEvents() {
  els.authSubmit.addEventListener("click", () => void handleLogin());
  els.authPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      void handleLogin();
    }
  });
  els.logoutButton.addEventListener("click", () => void handleLogout());
  els.homeButton.addEventListener("click", handleOpenLibraryView);
  els.backToLibrary.addEventListener("click", handleOpenLibraryView);
  els.bookForm.addEventListener("submit", handleBookImport);
  els.bookLanguage.addEventListener("change", () => void handlePreferenceFieldChange());
  els.listenerLanguage.addEventListener("change", () => void handlePreferenceFieldChange());
  els.audiobookLanguage.addEventListener("change", () => void handlePreferenceFieldChange());
  els.generateButton.addEventListener("click", () => void handlePrepareCurrentPage());
  els.readerDeleteBook.addEventListener("click", () => void handleDeleteCurrentBook());
  els.goToPageForm.addEventListener("submit", handleGoToPageSubmit);
  els.pagePrev.addEventListener("click", () => void openAdjacentPage(-1));
  els.pageNext.addEventListener("click", () => void openAdjacentPage(1));
  els.playToggle.addEventListener("click", () => void handlePlayToggle());
  els.pauseToggle.addEventListener("click", () => els.bookAudio.pause());
  els.restartToggle.addEventListener("click", () => void handleRestartCurrentPage());
  els.saveWordButton.addEventListener("click", () => void saveCurrentLookup());

  els.bookAudio.addEventListener("play", startPlaybackTracking);
  els.bookAudio.addEventListener("pause", stopPlaybackTracking);
  els.bookAudio.addEventListener("ended", () => void handleAudioEnded());
  els.bookAudio.addEventListener("timeupdate", syncPlaybackHighlight);
  els.bookAudio.addEventListener("timeupdate", scheduleProgressSave);
  els.bookAudio.addEventListener("seeking", syncPlaybackHighlight);

  els.readerContent.addEventListener("scroll", handleReaderManualScroll, { passive: true });
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
  state.piperVoices = [];
  state.savedWords = meta.savedWords || [];

  renderLanguageOptions(meta);
  renderSupportedLanguages(meta.fullySupportedLanguages || []);
  renderProfile(meta.profile, meta.localAccessUrls || []);

  const voiceSamples = meta.voiceSamples || [];
  state.selectedVoice =
    voiceSamples.find((sample) => sample.id === meta.preferences?.selectedVoiceId) ||
    voiceSamples.find((sample) => sample.id === "storybook") ||
    voiceSamples[0] ||
    null;
  renderVoiceShelf(voiceSamples);
  void loadPiperVoiceCatalog();

  const booksPayload = await fetchJson("/api/books");
  state.libraryBooks = booksPayload.books || [];
  renderLibraryBooks();
  renderSavedWords();
  renderLookupPanel();
  renderReaderShell();
  switchView("library");
}

function showAuthShell(visible) {
  els.authShell.classList.toggle("hidden", !visible);
}

function switchView(view) {
  const readerVisible = view === "reader";
  els.libraryView.classList.toggle("hidden", readerVisible);
  els.readerView.classList.toggle("hidden", !readerVisible);
  els.homeButton.classList.toggle("hidden", !readerVisible);
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

    els.authPassword.value = "";
    await initializeAuthenticatedApp(payload.profile || null);
  } catch (error) {
    els.authStatus.textContent = error.message;
  }
}

async function handleLogout() {
  await fetchJson("/api/session/logout", { method: "POST" }).catch(() => {});
  stopPageStatusPolling();
  stopPlaybackTracking();
  state.authenticated = false;
  state.profile = null;
  state.preferences = null;
  state.libraryBooks = [];
  state.currentBook = null;
  state.currentPage = null;
  state.previewPage = null;
  state.savedWords = [];
  state.lookup = null;
  state.currentTokens = [];
  state.lookupTokens = [];
  state.activeLookupSourceNormalized = "";
  els.bookAudio.pause();
  els.bookAudio.removeAttribute("src");
  els.bookAudio.load();
  showAuthShell(true);
  switchView("library");
  renderLibraryBooks();
  renderSavedWords();
  renderLookupPanel();
  renderReaderShell();
}

function handleOpenLibraryView() {
  els.bookAudio.pause();
  switchView("library");
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
    element.textContent = option.label;
    selectNode.append(element);
  });
}

function renderSupportedLanguages(languages) {
  els.supportedLanguageList.innerHTML = languages
    .map(
      (language) => `
        <div class="support-item">
          <strong>${escapeHtml(language.label)}</strong>
          <span>Fast narration, translation-aware reading, OCR intake, and aligned word highlighting.</span>
        </div>
      `
    )
    .join("");
}

function renderProfile(profile, localAccessUrls) {
  if (!profile) {
    els.profileName.textContent = "Your profile";
    els.profileDetails.textContent = "Sign in to see your saved preferences.";
    els.networkList.innerHTML = "";
    return;
  }

  const nativeLabels = (profile.nativeLanguages || []).map(getLanguageLabel).join(" + ");
  const fluentLabels = (profile.fluentLanguages || []).map(getLanguageLabel).join(", ");
  els.profileName.textContent = profile.name || profile.email || "Reader";
  els.profileDetails.textContent = `Native: ${nativeLabels || "Unknown"}. Fluent: ${fluentLabels || "Unknown"}. Learning: ${getLanguageLabel(profile.learningLanguage || "pt-pt")}.`;
  els.networkList.innerHTML = (localAccessUrls || [])
    .map((url) => `<span>${escapeHtml(url)}</span>`)
    .join("");
}

function renderVoiceShelf(voiceSamples = []) {
  const visibleVoiceSamples = voiceSamples.filter((sample) => sample.builtIn);
  if (state.selectedVoice && !visibleVoiceSamples.some((sample) => sample.id === state.selectedVoice.id)) {
    state.selectedVoice = visibleVoiceSamples[0] || null;
  }
  if (!state.selectedVoice) {
    state.selectedVoice = visibleVoiceSamples[0] || null;
  }

  els.voiceShelf.innerHTML = "";
  if (!visibleVoiceSamples.length) {
    els.voiceShelf.classList.add("empty-state");
    els.voiceShelf.textContent = "No compatible fast narration voices are available right now.";
    updateVoicePill();
    return;
  }

  els.voiceShelf.classList.remove("empty-state");

  visibleVoiceSamples.forEach((sample) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `voice-card${state.selectedVoice?.id === sample.id ? " active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(sample.name)}</strong>
      <small>${escapeHtml(sample.vibe)}</small>
      <small>${escapeHtml(getLanguageLabel(sample.language))}</small>
    `;
    button.addEventListener("click", () => {
      state.selectedVoice = sample;
      renderVoiceShelf(visibleVoiceSamples);
      void persistPreferences();
    });
    els.voiceShelf.append(button);
  });

  updateVoicePill();
}

async function loadPiperVoiceCatalog() {
  try {
    els.piperCatalogStatus.textContent = "Loading...";
    const payload = await fetchJson("/api/piper/voices");
    state.piperVoices = payload.voices || [];
    renderPiperCatalog();
  } catch (error) {
    els.piperCatalogStatus.textContent = "Unavailable";
    els.piperCatalog.classList.add("empty-state");
    els.piperCatalog.textContent = error.message;
  }
}

function renderPiperCatalog() {
  const selectedAudiobookLanguage = normalizeLanguageCode(els.audiobookLanguage?.value || state.preferences?.audiobookLanguage || "pt-pt");
  const filteredVoices = state.piperVoices.filter((voice) => normalizeLanguageCode(voice.languageCode) === selectedAudiobookLanguage);

  if (!filteredVoices.length) {
    els.piperCatalog.classList.add("empty-state");
    els.piperCatalog.textContent = "No Piper voices are available for the selected audiobook language yet.";
    els.piperCatalogStatus.textContent = "0 voices";
    return;
  }

  els.piperCatalogStatus.textContent = `${filteredVoices.length} voice${filteredVoices.length === 1 ? "" : "s"}`;
  els.piperCatalog.classList.remove("empty-state");
  els.piperCatalog.innerHTML = "";

  const label = getLanguageLabel(selectedAudiobookLanguage);
  const section = document.createElement("section");
  section.className = "piper-language-group";
  section.innerHTML = `
    <div class="piper-language-header">
      <strong>${escapeHtml(label)}</strong>
      <span>${filteredVoices.length} voice${filteredVoices.length === 1 ? "" : "s"}</span>
    </div>
  `;

  const chipList = document.createElement("div");
  chipList.className = "piper-chip-list";
  filteredVoices.forEach((voice) => {
    const chip = document.createElement("span");
    chip.className = "piper-chip";
    chip.innerHTML = `
      <strong>${escapeHtml(voice.name)}</strong>
      <small>${escapeHtml(voice.quality)}${voice.active ? " · installed" : ""}</small>
    `;
    chipList.append(chip);
  });

  section.append(chipList);
  els.piperCatalog.append(section);
}

async function handlePreferenceFieldChange() {
  updateLanguagePills();
  renderPiperCatalog();
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
    state.preferences = payload.preferences || state.preferences;
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
  els.bookSubmit.textContent = isImporting ? "Saving..." : "Save to library";
}

async function handleBookImport(event) {
  event.preventDefault();
  if (state.bookImporting) {
    return;
  }

  const hasText = Boolean(els.bookText.value.trim());
  const file = els.bookFile.files[0];
  if (!hasText && !file) {
    setBookStatus("Paste some text or choose a file first.", true);
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

  try {
    const payload = await fetchJson("/api/books/import", {
      method: "POST",
      body: formData,
    });
    upsertLibraryBook(payload.book);
    state.currentBook = payload.book;
    state.currentPageIndex = payload.page?.index || 0;
    renderLibraryBooks();
    setBookStatus(
      payload.existing
        ? `"${payload.book.title}" was already in your library, so I kept the saved copy.`
        : `"${payload.book.title}" is now on your shelf. Open it when you want to read.`
    );
    els.bookFile.value = "";
  } catch (error) {
    setBookStatus(error.message, true);
  } finally {
    setBookImportState(false);
  }
}

function renderLibraryBooks() {
  els.bookLibrary.innerHTML = "";
  els.libraryCount.textContent = `${state.libraryBooks.length} book${state.libraryBooks.length === 1 ? "" : "s"}`;

  if (!state.libraryBooks.length) {
    els.bookLibrary.classList.add("empty-state");
    els.bookLibrary.textContent = "Import a PDF, EPUB, TXT, or page photo to begin your library.";
    return;
  }

  els.bookLibrary.classList.remove("empty-state");

  state.libraryBooks.forEach((book) => {
    const percent = getBookProgressPercent(book);
    const shell = document.createElement("div");
    shell.className = "book-card-shell";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `book-card${state.currentBook?.id === book.id ? " active" : ""}`;
    button.innerHTML = `
      <div class="book-cover">${renderCoverMarkup(book.coverUrl, book.title)}</div>
      <div class="book-card-copy">
        <strong>${escapeHtml(book.title)}</strong>
        <small>${book.totalPages} page${book.totalPages === 1 ? "" : "s"} · ${escapeHtml(getLanguageLabel(book.detectedLanguage))}</small>
        <div class="book-card-progress">
          <small>Resume from page ${(book.progress?.pageIndex ?? 0) + 1}</small>
          <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
        </div>
      </div>
    `;
    button.addEventListener("click", () => void loadLibraryBook(book.id, book.progress?.pageIndex || 0));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "book-card-delete";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void handleDeleteBook(book.id);
    });

    shell.append(button, deleteButton);
    els.bookLibrary.append(shell);
  });
}

function renderReaderShell() {
  const hasBook = Boolean(state.currentBook && state.currentPage);
  const totalPages = state.currentBook?.totalPages || state.currentBook?.pages?.length || 0;
  const currentPageNumber = hasBook ? state.currentPageIndex + 1 : 0;
  const nextPageNumber = hasBook && currentPageNumber < totalPages ? currentPageNumber + 1 : 0;
  const percent = hasBook ? getBookProgressPercent(state.currentBook) : 0;

  els.readerBookCover.innerHTML = hasBook ? renderCoverMarkup(state.currentBook.coverUrl, state.currentBook.title) : "VX";
  els.readerBookTitle.textContent = hasBook ? state.currentBook.title : "Select a book";
  els.readerBookMeta.textContent = hasBook
    ? `${totalPages} pages · ${getLanguageLabel(state.currentBook.detectedLanguage)} -> ${getLanguageLabel(state.currentBook.audiobookLanguage)}`
    : "Open a book from your shelf to begin.";
  els.readerProgressLabel.textContent = `${Math.round(percent)}%`;
  els.readerPageLabel.textContent = hasBook ? `Page ${currentPageNumber} of ${totalPages}` : "Page 0 of 0";
  els.readerProgressFill.style.width = `${percent}%`;
  els.pageFooterNumber.textContent = hasBook ? `Page ${currentPageNumber}` : "Page 0";
  els.pageFooterNumberNext.textContent = nextPageNumber ? `Page ${nextPageNumber}` : "End";
  els.goToPageInput.value = hasBook ? String(currentPageNumber) : "";
  els.goToPageInput.max = String(totalPages || 1);
  els.pagePrev.disabled = !hasBook || state.currentPageIndex <= 0;
  els.pageNext.disabled = !hasBook || state.currentPageIndex >= totalPages - 1;
  els.readerDeleteBook.disabled = !state.currentBook;
  updateLanguagePills();
  updateReaderStatusPill();

  if (!hasBook) {
    els.readerContent.classList.add("empty-state");
    els.readerContent.textContent = "Open a book from your shelf to enter the reader.";
    els.readerContentNext.classList.add("empty-state");
    els.readerContentNext.textContent = "The next page will appear here.";
    setTransportAvailability(false);
    updateGenerationUi({
      label: "Open a page to begin.",
      progress: 0,
      logs: ["Choose a book from your library, then generate audio for the page you want to hear."],
    });
  }
}

async function loadLibraryBook(bookId, pageIndex = 0, options = {}) {
  const payload = await fetchJson(`/api/books/${bookId}`);
  state.currentBook = payload.book;
  upsertLibraryBook(payload.book);
  renderLibraryBooks();
  switchView("reader");
  await openBookPage(pageIndex, options);
}

async function openBookPage(pageIndex, options = {}) {
  if (!state.currentBook) {
    return;
  }

  const safePageIndex = Math.max(0, Math.min((state.currentBook.pages || []).length - 1, pageIndex));
  const payload = await fetchJson(`/api/books/${state.currentBook.id}/pages/${safePageIndex}`);
  applyBookPage(state.currentBook, payload.page, options);
  await saveProgress();
}

function applyBookPage(book, page, options = {}) {
  const preserveViewport = Boolean(options.preserveViewport);
  const preservePlaybackState = Boolean(options.preservePlaybackState);
  const previousScrollTop = preserveViewport ? els.readerContent.scrollTop : 0;
  const previousAudioTime = preservePlaybackState ? Number(els.bookAudio.currentTime || 0) : 0;
  const shouldResumePlayback = preservePlaybackState && !els.bookAudio.paused && !els.bookAudio.ended;
  const sameAudioUrl = Boolean(page.audioUrl && state.currentAudioUrl && state.currentAudioUrl === page.audioUrl);

  state.currentBook = book;
  state.currentPage = page;
  state.previewPage = null;
  state.currentPageIndex = page.index;
  state.detectedBookLanguage = book.detectedLanguage || "auto";
  state.readerLanguage = page.translatedText ? book.audiobookLanguage || "pt-pt" : book.detectedLanguage || "auto";
  state.currentAudioUrl = page.audioUrl || "";
  state.alignmentSegments = page.alignment?.segments || [];
  state.alignmentWordTimings = buildAlignmentWordTimings(state.alignmentSegments);
  state.lastHighlightedGlobalIndex = -1;
  state.followPlayback = true;
  syncBookSummaryPage(page);
  renderReaderShell();
  renderCurrentReaderContent(page.displayText || page.sourceText || "");
  renderPreviewPlaceholder();
  if (!options.skipAnimate) {
    animatePageTurn(options.turnDirection || "");
  }
  if (preserveViewport) {
    els.readerContent.scrollTop = previousScrollTop;
  }

  if (page.audioUrl) {
    setTransportAvailability(true);
    if (!sameAudioUrl) {
      els.bookAudio.src = page.audioUrl;
      const resumeTime = preservePlaybackState
        ? previousAudioTime
        : book.progress?.pageIndex === page.index && Number.isFinite(book.progress?.audioTime)
          ? book.progress.audioTime
          : 0;
      const restorePlaybackState = () => {
        if (resumeTime > 0) {
          els.bookAudio.currentTime = Math.min(resumeTime, Math.max(0, (els.bookAudio.duration || resumeTime) - 0.2));
        }
        if (shouldResumePlayback || options.autoplay) {
          void els.bookAudio.play().catch(() => {});
        }
      };
      if (els.bookAudio.readyState >= 1) {
        restorePlaybackState();
      } else {
        els.bookAudio.addEventListener("loadedmetadata", restorePlaybackState, { once: true });
      }
    } else if (shouldResumePlayback && els.bookAudio.paused) {
      void els.bookAudio.play().catch(() => {});
    }
  } else {
    els.bookAudio.pause();
    els.bookAudio.removeAttribute("src");
    els.bookAudio.load();
    setTransportAvailability(false);
  }

  updateGenerationUiFromPage(page);
  updateReaderStatusPill();
  applyLookupHighlight();

  if ((page.translationStatus === "running" || page.audioStatus === "running") && !page.audioUrl) {
    startPageStatusPolling(book.id, page.index);
  } else {
    stopPageStatusPolling();
  }

  if (page.audioUrl) {
    void warmUpcomingPagesFromCurrent();
  }

  switchView("reader");
  void loadPreviewPageForCurrentSpread();
}

function renderCurrentReaderContent(text) {
  state.lookupTokens = [];
  state.currentTokens = renderReaderContentInto(els.readerContent, text, "current");
  state.totalWordCount = state.currentTokens.length;
  applyLookupHighlight();
}

function renderPreviewPageContent(text) {
  renderReaderContentInto(els.readerContentNext, text, "next");
  applyLookupHighlight();
}

function renderPreviewPlaceholder(message = "The next page will appear here.") {
  state.previewPage = null;
  renderReaderContentInto(els.readerContentNext, "", "next", message);
  applyLookupHighlight();
}

function renderReaderContentInto(container, text, pageRole, emptyMessage = "This page has no text yet.") {
  if (!text.trim()) {
    container.classList.add("empty-state");
    container.textContent = emptyMessage;
    return [];
  }

  container.classList.remove("empty-state");
  container.innerHTML = "";

  const article = document.createElement("article");
  article.className = "reader-article";
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const tokensForRole = [];
  let globalIndex = pageRole === "current" ? 0 : -1;

  paragraphs.forEach((paragraph) => {
    const p = document.createElement("p");
    const tokens = tokenizeParagraph(paragraph);
    tokens.forEach((token) => {
      if (token.type === "word") {
        const span = document.createElement("span");
        span.className = "token";
        span.textContent = token.value;
        span.dataset.pageRole = pageRole;
        span.dataset.normalized = normalizeComparableText(token.value);
        if (pageRole === "current") {
          span.dataset.globalIndex = String(globalIndex);
        }
        if (isSavedSingleWord(token.value)) {
          span.classList.add("is-saved");
        }
        span.addEventListener("click", () => void handleWordLookup(token.value, pageRole));
        tokensForRole.push(span);
        state.lookupTokens.push(span);
        if (pageRole === "current") {
          globalIndex += 1;
        }
        p.append(span);
      } else {
        p.append(document.createTextNode(token.value));
      }
    });
    article.append(p);
  });

  container.append(article);
  return tokensForRole;
}

async function loadPreviewPageForCurrentSpread() {
  const book = state.currentBook;
  if (!book?.pages?.length) {
    renderPreviewPlaceholder();
    return;
  }

  const nextPageIndex = state.currentPageIndex + 1;
  if (nextPageIndex >= book.pages.length) {
    renderPreviewPlaceholder("You are at the end of this book.");
    return;
  }

  const requestToken = state.previewRequestToken + 1;
  state.previewRequestToken = requestToken;
  renderPreviewPlaceholder("Loading the next page...");

  try {
    const payload = await fetchJson(`/api/books/${book.id}/pages/${nextPageIndex}`);
    if (
      requestToken !== state.previewRequestToken ||
      state.currentBook?.id !== book.id ||
      state.currentPageIndex + 1 !== nextPageIndex
    ) {
      return;
    }

    state.previewPage = payload.page;
    renderPreviewPageContent(payload.page.displayText || payload.page.sourceText || "");
    els.pageFooterNumberNext.textContent = `Page ${payload.page.index + 1}`;
  } catch {
    if (requestToken !== state.previewRequestToken) {
      return;
    }
    renderPreviewPlaceholder("The next page preview could not be loaded yet.");
  }
}

function getPageTextByRole(pageRole) {
  if (pageRole === "next") {
    return state.previewPage?.displayText || state.previewPage?.sourceText || "";
  }
  return state.currentPage?.displayText || state.currentPage?.sourceText || "";
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

function applyLookupHighlight() {
  state.lookupTokens.forEach((token) => {
    token.classList.toggle("is-looked-up", Boolean(state.activeLookupSourceNormalized) && token.dataset.normalized === state.activeLookupSourceNormalized);
    token.classList.toggle("is-saved", isSavedSingleWord(token.textContent || ""));
  });
}

function isSavedSingleWord(word) {
  const normalizedWord = normalizeComparableText(word);
  return state.savedWords.some((entry) => !/\s/u.test(entry.source) && normalizeComparableText(entry.source) === normalizedWord);
}

function syncBookSummaryPage(page) {
  const summaryPage = state.currentBook?.pages?.[page.index];
  if (!summaryPage) {
    return;
  }
  summaryPage.translationStatus = page.translationStatus || summaryPage.translationStatus || "idle";
  summaryPage.audioStatus = page.audioStatus || summaryPage.audioStatus || "idle";
  summaryPage.ready = Boolean(page.audioUrl);
  summaryPage.audioEngine = page.audioEngine || summaryPage.audioEngine || "";
}

function upsertLibraryBook(book) {
  const summary = summarizeBook(book);
  state.libraryBooks = [summary, ...state.libraryBooks.filter((existingBook) => existingBook.id !== summary.id)];
}

function summarizeBook(book) {
  return {
    id: book.id,
    title: book.title,
    coverUrl: book.coverUrl || "",
    sourceType: book.sourceType,
    detectedLanguage: book.detectedLanguage,
    audiobookLanguage: book.audiobookLanguage,
    totalPages: book.totalPages || book.pages?.length || 0,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    progress: book.progress || { pageIndex: 0, audioTime: 0 },
  };
}

function getBookProgressPercent(book) {
  const totalPages = Math.max(1, book.totalPages || book.pages?.length || 1);
  return Math.min(100, Math.max(0, (((book.progress?.pageIndex || 0) + 1) / totalPages) * 100));
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

  try {
    await fetchJson(`/api/books/${encodeURIComponent(bookId)}`, { method: "DELETE" });
    state.libraryBooks = state.libraryBooks.filter((candidate) => candidate.id !== bookId);
    if (state.currentBook?.id === bookId) {
      state.currentBook = null;
      state.currentPage = null;
      state.previewPage = null;
      state.currentPageIndex = 0;
      state.currentTokens = [];
      state.lookupTokens = [];
      state.activeLookupSourceNormalized = "";
      state.lookup = null;
      els.bookAudio.pause();
      els.bookAudio.removeAttribute("src");
      els.bookAudio.load();
      stopPageStatusPolling();
    }
    renderLibraryBooks();
    renderReaderShell();
    renderSavedWords();
    switchView("library");
    setBookStatus(`Removed "${book.title}" from your shelf.`);
  } catch (error) {
    setBookStatus(error.message, true);
  }
}

async function handleDeleteCurrentBook() {
  if (!state.currentBook) {
    return;
  }
  await handleDeleteBook(state.currentBook.id);
}

async function handleGoToPageSubmit(event) {
  event.preventDefault();
  if (!state.currentBook) {
    return;
  }

  const targetPage = Number(els.goToPageInput.value);
  if (!Number.isFinite(targetPage) || targetPage < 1) {
    return;
  }
  const pageIndex = Math.min((state.currentBook.pages || []).length - 1, targetPage - 1);
  const direction = pageIndex > state.currentPageIndex ? "forward" : pageIndex < state.currentPageIndex ? "backward" : "";
  await openBookPage(pageIndex, { turnDirection: direction });
}

async function openAdjacentPage(direction) {
  if (!state.currentBook?.pages?.length) {
    return;
  }
  const targetIndex = Math.max(0, Math.min(state.currentBook.pages.length - 1, state.currentPageIndex + direction));
  if (targetIndex === state.currentPageIndex) {
    return;
  }
  await openBookPage(targetIndex, { turnDirection: direction > 0 ? "forward" : "backward" });
}

async function handlePrepareCurrentPage(options = {}) {
  if (!state.currentBook || !state.currentPage) {
    setLookupError("Open a book first.");
    return;
  }

  if (state.pagePreparing) {
    return;
  }

  const requestedBookId = state.currentBook.id;
  const requestedPageIndex = state.currentPageIndex;

  try {
    state.pagePreparing = true;
    els.generateButton.disabled = true;
    els.generateButton.textContent = "Generating...";
    updateGenerationUi({
      label: `Preparing page ${requestedPageIndex + 1}...`,
      progress: 16,
      logs: [
        `Page ${requestedPageIndex + 1}: checking translation state.`,
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

    const generationStillRunning =
      !payload.page.audioUrl &&
      (payload.started || payload.page.translationStatus === "running" || payload.page.audioStatus === "running");

    if (!generationStillRunning) {
      stopPageStatusPolling();
    }
  } catch (error) {
    setLookupError(error.message);
    updateGenerationUi({
      label: error.message,
      progress: 0,
      logs: [error.message],
    });
  } finally {
    state.pagePreparing = false;
    els.generateButton.disabled = false;
    els.generateButton.textContent = state.currentPage?.audioUrl ? "Regenerate audiobook" : "Generate audiobook";
  }
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

function updateGenerationUiFromPage(page) {
  const needsTranslation =
    (state.currentBook?.detectedLanguage || "auto") !== "auto" &&
    normalizeLanguageCode(state.currentBook?.detectedLanguage || "auto") !==
      normalizeLanguageCode(state.currentBook?.audiobookLanguage || "pt-pt") &&
    !page.translatedText;

  const logs = page.logs?.length
    ? page.logs
    : [
        `Translation: ${page.translationStatus || (needsTranslation ? "idle" : "source")}.`,
        `Audio: ${page.audioStatus || "idle"}.`,
      ];

  const label =
    page.audioUrl || page.translationStatus === "running" || page.audioStatus === "running"
      ? buildGenerationLabelFromPage(page)
      : needsTranslation
        ? "This page still needs PT-PT translation before the audio can be generated."
        : "This page is ready to generate as audio.";

  updateGenerationUi({
    label,
    progress: inferGenerationProgressFromPage(page),
    logs,
  });
  els.generateButton.textContent = page.audioUrl ? "Regenerate audiobook" : "Generate audiobook";
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
      ? [...(page.logs || [])]
          .reverse()
          .find((entry) => /Generating segment \d+ of \d+(?: with Piper)?\./u.test(entry))
      : "";
  if (segmentLog) {
    const match = segmentLog.match(/Generating segment (\d+) of (\d+)(?: with Piper)?\./u);
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

function updateReaderStatusPill() {
  if (!state.currentPage) {
    els.readerStatusPill.textContent = "Idle";
    return;
  }

  if (state.currentPage.audioUrl) {
    els.readerStatusPill.textContent = "Ready";
    return;
  }
  if (state.currentPage.audioStatus === "running") {
    els.readerStatusPill.textContent = "Generating";
    return;
  }
  if (state.currentPage.translationStatus === "running") {
    els.readerStatusPill.textContent = "Translating";
    return;
  }
  if (state.currentPage.translationStatus === "ready") {
    els.readerStatusPill.textContent = "Text ready";
    return;
  }
  els.readerStatusPill.textContent = "Idle";
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
      syncBookSummaryPage(page);

      if (state.currentBook?.id === bookId && state.currentPageIndex === pageIndex) {
        applyBookPage(state.currentBook, page, {
          preserveViewport: true,
          preservePlaybackState: true,
          skipAnimate: true,
        });
      }

      if (page.audioUrl) {
        stopPageStatusPolling();
      }
    } catch {
      // Keep polling quietly while background work continues.
    } finally {
      state.pageStatusPollerBusy = false;
    }
  };

  void poll();
  state.pageStatusPoller = window.setInterval(() => {
    void poll();
  }, 1400);
}

async function warmUpcomingPagesFromCurrent() {
  if (!state.currentBook?.id || !state.selectedVoice?.id || !state.currentPage?.audioUrl) {
    return;
  }

  const warmKey = `${state.currentBook.id}:${state.currentPageIndex}:${state.selectedVoice.id}`;
  if (state.lastWarmWindowKey === warmKey) {
    return;
  }
  state.lastWarmWindowKey = warmKey;

  await fetchJson(`/api/books/${state.currentBook.id}/pages/${state.currentPageIndex}/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voiceSampleId: state.selectedVoice.id,
    }),
  }).catch(() => {});
}

async function handlePlayToggle() {
  if (!els.bookAudio.src) {
    updateGenerationUi({
      label: `Page ${state.currentPageIndex + 1} is not ready yet.`,
      progress: 0,
      logs: ["Press Generate audiobook first so Voxenor can translate and render this page."],
    });
    return;
  }

  await els.bookAudio.play().catch(() => {});
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

async function handleAudioEnded() {
  stopPlaybackTracking();
  if (!state.currentBook?.pages?.length) {
    return;
  }

  const nextPageIndex = state.currentPageIndex + 1;
  if (nextPageIndex >= state.currentBook.pages.length) {
    return;
  }

  await openBookPage(nextPageIndex, { turnDirection: "forward" });
  if (els.bookAudio.src) {
    await els.bookAudio.play().catch(() => {});
    return;
  }
  await handlePrepareCurrentPage({ autoplay: true });
}

function setTransportAvailability(isReady) {
  els.playToggle.disabled = !isReady;
  els.pauseToggle.disabled = !isReady;
  els.restartToggle.disabled = !isReady;
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
  if (!state.alignmentWordTimings.length || !state.totalWordCount || !els.bookAudio.duration) {
    return;
  }

  const wordTiming = findAlignmentWordTiming(els.bookAudio.currentTime);
  if (!wordTiming || wordTiming.index === state.lastHighlightedGlobalIndex) {
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
  state.currentTokens.forEach((token) => token.classList.remove("active"));
  const activeToken = state.currentTokens[globalIndex];
  if (!activeToken) {
    return;
  }
  activeToken.classList.add("active");
  revealTokenIfNeeded(activeToken);
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

function revealTokenIfNeeded(token) {
  if (!state.followPlayback) {
    return;
  }

  const containerRect = els.readerContent.getBoundingClientRect();
  const tokenRect = token.getBoundingClientRect();
  const topPadding = 96;
  const bottomPadding = 120;

  if (tokenRect.top >= containerRect.top + topPadding && tokenRect.bottom <= containerRect.bottom - bottomPadding) {
    return;
  }

  const offsetTop = token.offsetTop - els.readerContent.clientHeight * 0.25;
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

function animatePageTurn(direction) {
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

function scheduleSelectionTranslate() {
  clearTimeout(state.selectionTranslateTimer);
  state.selectionTranslateTimer = window.setTimeout(async () => {
    const selection = getActiveReaderSelection();
    if (!selection.text || selection.text === state.lastSelectionText) {
      return;
    }
    state.lastSelectionText = selection.text;
    await handleSelectionLookup(selection.text, selection.pageRole);
  }, 140);
}

function getActiveReaderSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    state.lastSelectionText = "";
    return { text: "", pageRole: "current" };
  }

  const text = selection.toString().trim();
  if (!text || text.length < 2 || text.length > 220) {
    return { text: "", pageRole: "current" };
  }

  const anchorRole = getReaderRoleForNode(selection.anchorNode);
  const focusRole = getReaderRoleForNode(selection.focusNode);
  if (!anchorRole || !focusRole || anchorRole !== focusRole) {
    return { text: "", pageRole: "current" };
  }

  return { text, pageRole: anchorRole };
}

function getReaderRoleForNode(node) {
  if (!node) {
    return "";
  }

  const element =
    node instanceof HTMLElement ? node : node.parentElement instanceof HTMLElement ? node.parentElement : null;
  const container = element?.closest?.(".reader-content");
  return container?.dataset?.pageRole || "";
}

async function handleWordLookup(word, pageRole = "current") {
  state.activeLookupSourceNormalized = normalizeComparableText(word);
  applyLookupHighlight();
  try {
    setLookupPending(word);
    const payload = await translate(word);
    setLookupValue({
      source: word,
      translatedText: payload.translatedText,
      context: buildContextSnippet(word, pageRole),
      sourceLanguage: state.readerLanguage,
      targetLanguage: els.listenerLanguage.value,
      pageIndex: pageRole === "next" ? state.previewPage?.index ?? state.currentPageIndex : state.currentPageIndex,
    });
  } catch (error) {
    setLookupError(error.message, word);
  }
}

async function handleSelectionLookup(text, pageRole = "current") {
  state.activeLookupSourceNormalized = "";
  applyLookupHighlight();
  try {
    setLookupPending(text);
    const payload = await translate(text);
    setLookupValue({
      source: text,
      translatedText: payload.translatedText,
      context: buildContextSnippet(text, pageRole),
      sourceLanguage: state.readerLanguage,
      targetLanguage: els.listenerLanguage.value,
      pageIndex: pageRole === "next" ? state.previewPage?.index ?? state.currentPageIndex : state.currentPageIndex,
    });
  } catch (error) {
    setLookupError(error.message, text);
  }
}

function setLookupPending(source) {
  state.lookup = {
    source,
    translatedText: `Translating "${truncate(source, 72)}"...`,
    context: "",
    isError: false,
    pending: true,
  };
  renderLookupPanel();
}

function setLookupValue(lookup) {
  state.lookup = {
    ...lookup,
    isError: false,
    pending: false,
  };
  renderLookupPanel();
}

function setLookupError(message, source = "") {
  state.lookup = {
    source,
    translatedText: message,
    context: "",
    isError: true,
    pending: false,
  };
  renderLookupPanel();
}

function renderLookupPanel() {
  const lookup = state.lookup;
  if (!lookup) {
    els.selectionTranslation.classList.add("empty-state");
    els.selectionTranslation.textContent = "Click a word or select a phrase in the page to translate it here.";
    els.saveWordButton.classList.add("hidden");
    return;
  }

  els.selectionTranslation.classList.remove("empty-state");
  els.selectionTranslation.innerHTML = `
    <div class="lookup-source">${escapeHtml(lookup.source || "Current lookup")}</div>
    <div class="lookup-result">${escapeHtml(lookup.translatedText || "")}</div>
    ${
      lookup.context
        ? `<div class="lookup-meta">${escapeHtml(lookup.context)}</div>`
        : `<div class="lookup-meta">${escapeHtml(
            `${getLanguageLabel(lookup.sourceLanguage || state.readerLanguage)} -> ${getLanguageLabel(
              lookup.targetLanguage || els.listenerLanguage.value
            )}`
          )}</div>`
    }
  `;
  els.saveWordButton.classList.toggle("hidden", lookup.isError || lookup.pending || !lookup.source || !lookup.translatedText);
  els.saveWordButton.textContent = /\s/u.test(lookup.source || "") ? "Save phrase" : "Save word";
}

function buildContextSnippet(source, pageRole = "current") {
  const baseText = getPageTextByRole(pageRole);
  if (!baseText || !source) {
    return "";
  }

  const lowerBase = baseText.toLowerCase();
  const lowerSource = source.toLowerCase();
  const index = lowerBase.indexOf(lowerSource);
  if (index < 0) {
    return truncate(baseText, 160);
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(baseText.length, index + source.length + 60);
  const snippet = baseText.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "..." : ""}${snippet}${end < baseText.length ? "..." : ""}`;
}

async function saveCurrentLookup() {
  if (!state.lookup || state.lookup.isError || state.lookup.pending || !state.lookup.source || !state.lookup.translatedText) {
    return;
  }

  try {
    const payload = await fetchJson("/api/saved-words", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: state.lookup.source,
        translatedText: state.lookup.translatedText,
        sourceLanguage: state.lookup.sourceLanguage || state.readerLanguage,
        targetLanguage: state.lookup.targetLanguage || els.listenerLanguage.value,
        bookId: state.currentBook?.id || "",
        bookTitle: state.currentBook?.title || "",
        pageIndex: Number.isInteger(state.lookup.pageIndex) ? state.lookup.pageIndex : state.currentPageIndex,
        context: state.lookup.context || "",
      }),
    });
    state.savedWords = payload.savedWords || state.savedWords;
    renderSavedWords();
    applyLookupHighlight();
  } catch (error) {
    setLookupError(error.message, state.lookup.source);
  }
}

function renderSavedWords() {
  els.savedWordsCount.textContent = `${state.savedWords.length} item${state.savedWords.length === 1 ? "" : "s"}`;
  els.savedWordsList.innerHTML = "";

  if (!state.savedWords.length) {
    els.savedWordsList.classList.add("empty-state");
    els.savedWordsList.textContent = "Save useful words and short phrases while you read.";
    return;
  }

  els.savedWordsList.classList.remove("empty-state");

  state.savedWords.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "saved-word-item";
    item.innerHTML = `
      <div class="saved-word-head">
        <div>
          <strong>${escapeHtml(entry.source)}</strong>
          <div class="lookup-meta">${escapeHtml(getLanguageLabel(entry.sourceLanguage))} -> ${escapeHtml(
            getLanguageLabel(entry.targetLanguage)
          )}</div>
        </div>
        <button class="saved-word-delete" type="button" data-saved-word-id="${escapeHtml(entry.id)}">Remove</button>
      </div>
      <div class="saved-word-translation">${escapeHtml(entry.translatedText)}</div>
      ${
        entry.context
          ? `<div class="saved-word-context">${escapeHtml(entry.context)}</div>`
          : ""
      }
    `;
    item.querySelector(".saved-word-delete").addEventListener("click", () => void handleDeleteSavedWord(entry.id));
    item.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest(".saved-word-delete")) {
        return;
      }
      state.lookup = {
        source: entry.source,
        translatedText: entry.translatedText,
        context: entry.context || "",
        sourceLanguage: entry.sourceLanguage,
        targetLanguage: entry.targetLanguage,
        pageIndex: entry.pageIndex,
        isError: false,
        pending: false,
      };
      state.activeLookupSourceNormalized = /\s/u.test(entry.source) ? "" : normalizeComparableText(entry.source);
      renderLookupPanel();
      applyLookupHighlight();
    });
    els.savedWordsList.append(item);
  });
}

async function handleDeleteSavedWord(savedWordId) {
  try {
    const payload = await fetchJson(`/api/saved-words/${encodeURIComponent(savedWordId)}`, {
      method: "DELETE",
    });
    state.savedWords = payload.savedWords || [];
    renderSavedWords();
    applyLookupHighlight();
  } catch (error) {
    setLookupError(error.message);
  }
}

function updateLanguagePills() {
  const chosenBookLanguage =
    els.bookLanguage.value === "auto"
      ? `${getLanguageLabel(state.detectedBookLanguage)} detected`
      : getLanguageLabel(els.bookLanguage.value);

  els.activeLanguagePill.textContent = `Book: ${chosenBookLanguage}`;
  els.translationLanguagePill.textContent = `Audio: ${getLanguageLabel(els.audiobookLanguage.value)}`;
  els.listenerLanguagePill.textContent = `You: ${getLanguageLabel(els.listenerLanguage.value)}`;
  updateVoicePill();
}

function updateVoicePill() {
  els.voicePill.textContent = `Voice: ${state.selectedVoice?.name || "default"}`;
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

function renderCoverMarkup(coverUrl, title) {
  if (coverUrl) {
    return `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(title || "Book")} cover" />`;
  }

  const initials = String(title || "VX")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
  return `<span>${escapeHtml(initials || "VX")}</span>`;
}

function getLanguageLabel(code) {
  return languageLabels.get(code) || String(code || "").toUpperCase();
}

function tokenizeWords(text) {
  return text.match(/[\p{L}\p{M}\p{N}ºª]+(?:['’\-][\p{L}\p{M}\p{N}ºª]+)*/gu) || [];
}

function normalizeComparableText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
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
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
