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
  deletingBookIds: new Set(),
  loadingBookId: "",
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
  activePreparationKey: "",
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
  pageOpening: false,
  pageOpenRequestToken: 0,
  currentDeletingBookId: "",
  autoplayPending: false,
  pageDataCache: new Map(),
  plan: { current: "free", freeBookLimit: 1 },
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
  importVoiceSummary: document.querySelector("#import-voice-summary"),
  libraryCount: document.querySelector("#library-count"),
  bookLibrary: document.querySelector("#book-library"),
  voiceSettingsCard: document.querySelector("#voice-settings-card"),
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
  restartToggle: document.querySelector("#restart-toggle"),
  pageAdvance: document.querySelector("#page-advance"),
  volumeSlider: document.querySelector("#volume-slider"),
  speedToggle: document.querySelector("#speed-toggle"),
  fontSizeToggle: document.querySelector("#font-size-toggle"),
  pagePrev: document.querySelector("#page-prev"),
  pageNext: document.querySelector("#page-next"),
  readerStageStatus: document.querySelector("#reader-stage-status"),
  readerStageSpinner: document.querySelector("#reader-stage-spinner"),
  readerStageMessage: document.querySelector("#reader-stage-message"),
  readerPage: document.querySelector("#reader-page"),
  readerPageOverlay: document.querySelector("#reader-page-overlay"),
  readerPageOverlayTitle: document.querySelector("#reader-page-overlay-title"),
  readerPageOverlayText: document.querySelector("#reader-page-overlay-text"),
  readerContent: document.querySelector("#reader-content"),
  pageFooterNumber: document.querySelector("#page-footer-number"),
  bookAudio: document.querySelector("#book-audio"),
  selectionTranslation: document.querySelector("#selection-translation"),
  saveWordButton: document.querySelector("#save-word-button"),
  savedWordsCount: document.querySelector("#saved-words-count"),
  savedWordsList: document.querySelector("#saved-words-list"),
  landingPage: document.querySelector("#landing-page"),
  authClose: document.querySelector("#auth-close"),
  signupEmail: document.querySelector("#signup-email"),
  signupPassword: document.querySelector("#signup-password"),
  signupConfirm: document.querySelector("#signup-confirm"),
  signupSubmit: document.querySelector("#signup-submit"),
  signupTerms: document.querySelector("#signup-terms"),
  importToggle: document.querySelector("#import-toggle"),
  importPanel: document.querySelector("#import-panel"),
  importClose: document.querySelector("#import-close"),
  topbarUserName: document.querySelector("#topbar-user-name"),
  profileModal: document.querySelector("#profile-modal"),
  profileModalClose: document.querySelector("#profile-modal-close"),
  profileAvatar: document.querySelector("#profile-avatar"),
  profileModalEmail: document.querySelector("#profile-modal-email"),
  profileNameInput: document.querySelector("#profile-name-input"),
  profileEmailInput: document.querySelector("#profile-email-input"),
  profileSaveBtn: document.querySelector("#profile-save-btn"),
  profileSaveStatus: document.querySelector("#profile-save-status"),
  profileListenerLang: document.querySelector("#profile-listener-lang"),
  profileAudiobookLang: document.querySelector("#profile-audiobook-lang"),
  profileLangStatus: document.querySelector("#profile-lang-status"),
  planCards: document.querySelector("#plan-cards"),
  cancelSubRow: document.querySelector("#cancel-sub-row"),
  cancelSubBtn: document.querySelector("#cancel-sub-btn"),
  cancelSubStatus: document.querySelector("#cancel-sub-status"),
  upgradeModal: document.querySelector("#upgrade-modal"),
  upgradeModalClose: document.querySelector("#upgrade-modal-close"),
  welcomeModal: document.querySelector("#welcome-modal"),
  welcomeName: document.querySelector("#welcome-name"),
  welcomeListenerLang: document.querySelector("#welcome-listener-lang"),
  welcomeAudiobookLang: document.querySelector("#welcome-audiobook-lang"),
  welcomeSubmit: document.querySelector("#welcome-submit"),
};

const languageLabels = new Map();

function initCookieBanner() {
  if (localStorage.getItem("cookie_consent")) return;
  const banner = document.getElementById("cookie-banner");
  const btn = document.getElementById("cookie-accept");
  if (!banner || !btn) return;
  banner.classList.remove("hidden");
  btn.addEventListener("click", () => {
    localStorage.setItem("cookie_consent", "1");
    banner.classList.add("hidden");
  });
}

bootstrap().catch((error) => {
  console.error(error);
  setLookupError(`Setup error: ${error.message}`);
});

async function bootstrap() {
  attachEvents();
  attachLandingEvents();
  initCookieBanner();
  const session = await fetchJson("/api/session").catch(() => ({ authenticated: false }));
  if (!session.authenticated) {
    showLandingPage(true);
    return;
  }

  showLandingPage(false);
  await initializeAuthenticatedApp(session.profile || null);
}

// --- Font-size persistence helpers ---
const fontSizeSteps = [
  { label: "Aa", value: "1.22rem" },
  { label: "Aa+", value: "1.35rem" },
  { label: "Aa++", value: "1.5rem" },
  { label: "Aa\u2013", value: "1.08rem" },
];
function restoreReaderFontSize() {
  const saved = state.preferences?.readerFontSize;
  if (saved) {
    document.documentElement.style.setProperty("--reader-font-size", saved);
    const match = fontSizeSteps.find((s) => s.value === saved);
    if (match && els.fontSizeToggle) els.fontSizeToggle.textContent = match.label;
  }
}
async function saveReaderFontSize(value) {
  try {
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readerFontSize: value }),
    });
  } catch { /* silent */ }
}

function attachEvents() {
  els.authSubmit.addEventListener("click", () => void handleLogin());
  els.authPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      void handleLogin();
    }
  });
  if (els.signupSubmit) {
    els.signupSubmit.addEventListener("click", () => void handleSignup());
  }
  if (els.signupConfirm) {
    els.signupConfirm.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void handleSignup();
    });
  }
  els.logoutButton.addEventListener("click", () => void handleLogout());
  els.homeButton.addEventListener("click", handleOpenLibraryView);
  els.backToLibrary.addEventListener("click", handleOpenLibraryView);
  els.bookForm.addEventListener("submit", handleBookImport);
  els.bookFile.addEventListener("change", () => {
    const uploadZone = document.querySelector(".upload-zone");
    if (els.bookFile.files?.length) {
      const name = els.bookFile.files[0].name;
      uploadZone?.classList.add("has-file");
      if (uploadZone) uploadZone.textContent = name;
    } else {
      uploadZone?.classList.remove("has-file");
      uploadZone.textContent = "Click or drag a .txt, .epub, or .pdf file";
    }
  });
  els.bookLanguage.addEventListener("change", () => void handlePreferenceFieldChange());
  els.listenerLanguage.addEventListener("change", () => void handlePreferenceFieldChange());
  els.audiobookLanguage.addEventListener("change", () => void handlePreferenceFieldChange());
  els.generateButton.addEventListener("click", () => void handlePrepareCurrentPage());
  els.readerDeleteBook.addEventListener("click", () => void handleDeleteCurrentBook());
  els.goToPageForm.addEventListener("submit", handleGoToPageSubmit);
  els.pagePrev.addEventListener("click", () => void openAdjacentPage(-1));
  els.pageNext.addEventListener("click", () => void openAdjacentPage(1));
  els.playToggle.addEventListener("click", () => void handlePlayToggle());
  els.restartToggle.addEventListener("click", () => void handleRestartCurrentPage());
  els.pageAdvance.addEventListener("click", () => void openAdjacentPage(1));
  els.saveWordButton.addEventListener("click", () => void saveCurrentLookup());

  // Volume slider
  els.volumeSlider.addEventListener("input", () => {
    els.bookAudio.volume = Number(els.volumeSlider.value);
  });

  // Speed toggle — cycle through speeds on click
  const speedSteps = [0.5, 0.75, 1, 1.25, 1.5, 2];
  els.speedToggle.addEventListener("click", () => {
    const current = els.bookAudio.playbackRate;
    const nextIdx = (speedSteps.indexOf(current) + 1) % speedSteps.length;
    const speed = speedSteps[nextIdx];
    els.bookAudio.playbackRate = speed;
    els.speedToggle.textContent = speed === 1 ? "1\u00D7" : `${speed}\u00D7`;
  });

  // Font size toggle — cycle through reader text sizes
  els.fontSizeToggle.addEventListener("click", () => {
    const root = document.documentElement;
    const current = getComputedStyle(root).getPropertyValue("--reader-font-size").trim();
    const currentIdx = fontSizeSteps.findIndex((s) => s.value === current);
    const nextIdx = (currentIdx + 1) % fontSizeSteps.length;
    const step = fontSizeSteps[nextIdx];
    root.style.setProperty("--reader-font-size", step.value);
    els.fontSizeToggle.textContent = step.label;
    void saveReaderFontSize(step.value);
  });

  if (els.importToggle) {
    els.importToggle.addEventListener("click", () => {
      if (!canImportBook()) return;
      els.importPanel.classList.toggle("hidden");
      if (!els.importPanel.classList.contains("hidden")) {
        els.importPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }
  if (els.importClose) {
    els.importClose.addEventListener("click", () => {
      els.importPanel.classList.add("hidden");
    });
  }

  // Profile modal
  if (els.topbarUserName) {
    els.topbarUserName.addEventListener("click", () => openProfileModal());
  }
  if (els.profileModalClose) {
    els.profileModalClose.addEventListener("click", () => closeProfileModal());
  }
  if (els.profileModal) {
    els.profileModal.querySelector(".profile-modal-backdrop")?.addEventListener("click", () => closeProfileModal());
  }
  if (els.profileSaveBtn) {
    els.profileSaveBtn.addEventListener("click", () => void saveProfileInfo());
  }
  // Language preference auto-save from profile modal
  [els.profileListenerLang, els.profileAudiobookLang].forEach((sel) => {
    if (sel) sel.addEventListener("change", () => void saveProfileLanguages());
  });
  // Welcome modal
  if (els.welcomeSubmit) {
    els.welcomeSubmit.addEventListener("click", () => void handleWelcomeSubmit());
  }

  els.bookAudio.addEventListener("play", startPlaybackTracking);
  els.bookAudio.addEventListener("play", () => {
    state.autoplayPending = false;
    syncTransportIcons(true);
    if (state.currentPage) {
      updateGenerationUiFromPage(state.currentPage);
    }
  });
  els.bookAudio.addEventListener("pause", () => {
    stopPlaybackTracking();
    syncTransportIcons(false);
    if (state.currentPage) {
      updateGenerationUiFromPage(state.currentPage);
    }
  });
  els.bookAudio.addEventListener("ended", () => void handleAudioEnded());
  els.bookAudio.addEventListener("timeupdate", syncPlaybackHighlight);
  els.bookAudio.addEventListener("timeupdate", scheduleProgressSave);
  els.bookAudio.addEventListener("seeking", syncPlaybackHighlight);

  els.readerContent.addEventListener("scroll", handleReaderManualScroll, { passive: true });
  document.addEventListener("selectionchange", scheduleSelectionTranslate);
  document.addEventListener("mouseup", scheduleSelectionTranslate);
  document.addEventListener("keyup", scheduleSelectionTranslate);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!els.profileModal.classList.contains("hidden")) closeProfileModal();
      if (!els.welcomeModal.classList.contains("hidden")) closeWelcomeModal();
    }
  });

  // Refresh current page status when user returns to the tab.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !state.currentBook?.id || !state.currentPage) return;
    void (async () => {
      try {
        const payload = await fetchJson(`/api/books/${state.currentBook.id}/pages/${state.currentPageIndex}`);
        syncBookSummaryPage(payload.page);
        applyBookPage(state.currentBook, payload.page, {
          preserveViewport: true,
          preservePlaybackState: true,
          skipAnimate: true,
        });
      } catch { /* will naturally retry on next visibility change or poll */ }
    })();
  });
}

async function initializeAuthenticatedApp(profileOverride = null, { isNewSignup = false } = {}) {
  state.authenticated = true;
  showAuthShell(false);
  showLandingPage(false);

  // Fetch meta and books in parallel for instant loading
  const [meta, booksPayload] = await Promise.all([
    fetchJson("/api/meta"),
    fetchJson("/api/books"),
  ]);

  state.appName = meta.appName || "Voxenor";
  state.modelInfo = meta.modelInfo || null;
  state.profile = profileOverride || meta.profile || null;
  state.preferences = meta.preferences || null;
  state.localAccessUrls = meta.localAccessUrls || [];
  state.piperVoices = [];
  state.savedWords = meta.savedWords || [];
  state.plan = meta.plan || { current: "free", freeBookLimit: 1 };

  // Restore saved font size
  restoreReaderFontSize();

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

  // Start discover immediately
  initDiscover();

  state.libraryBooks = booksPayload.books || [];
  els.bookLibrary.classList.remove("loading-state");
  renderLibraryBooks();
  renderSavedWords();
  renderLookupPanel();
  renderReaderShell();
  switchView("library");
  history.replaceState({ view: "library" }, "");

  if (isNewSignup) {
    maybeShowWelcome();
  }
}

function showAuthShell(visible) {
  els.authShell.classList.toggle("hidden", !visible);
}

function showLandingPage(visible) {
  if (els.landingPage) {
    els.landingPage.classList.toggle("hidden", !visible);
  }
  document.querySelector(".app-shell").classList.toggle("hidden", visible);
  if (visible) {
    showAuthShell(false);
  }
}

function openAuthModal(tab = "login") {
  showAuthShell(true);
  switchAuthTab(tab);
}

function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelector(".auth-pane-login").classList.toggle("active", tab === "login");
  document.querySelector(".auth-pane-signup").classList.toggle("active", tab === "signup");
  const switchLogin = document.querySelector(".auth-switch-login");
  const switchSignup = document.querySelector(".auth-switch-signup");
  if (switchLogin) switchLogin.classList.toggle("hidden", tab !== "login");
  if (switchSignup) switchSignup.classList.toggle("hidden", tab !== "signup");
}

function attachLandingEvents() {
  const landingButtons = [
    ["#nav-login", "login"],
    ["#nav-signup", "signup"],
    ["#hero-get-started", "signup"],
    ["#cta-get-started", "signup"],
  ];
  for (const [selector, tab] of landingButtons) {
    const el = document.querySelector(selector);
    if (el) el.addEventListener("click", () => openAuthModal(tab));
  }
  const learnMore = document.querySelector("#hero-learn-more");
  if (learnMore) {
    learnMore.addEventListener("click", () => {
      const section = document.querySelector("#features-section");
      if (section) section.scrollIntoView({ behavior: "smooth" });
    });
  }
  if (els.authClose) {
    els.authClose.addEventListener("click", () => showAuthShell(false));
  }
  document.querySelectorAll(".auth-tab, .auth-switch-text .link-button").forEach((btn) => {
    if (btn.dataset.tab) {
      btn.addEventListener("click", () => switchAuthTab(btn.dataset.tab));
    }
  });
}

function switchView(view, { pushState = true } = {}) {
  const readerVisible = view === "reader";
  els.libraryView.classList.toggle("hidden", readerVisible);
  els.readerView.classList.toggle("hidden", !readerVisible);
  els.homeButton.classList.toggle("hidden", !readerVisible);
  if (pushState && history.state?.view !== view) {
    history.pushState({ view }, "");
  }
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

async function handleSignup() {
  const email = (els.signupEmail?.value || "").trim();
  const password = els.signupPassword?.value || "";
  const confirm = els.signupConfirm?.value || "";

  if (!email || !email.includes("@")) {
    els.authStatus.textContent = "Please enter a valid email address.";
    return;
  }
  if (password.length < 8) {
    els.authStatus.textContent = "Password must be at least 8 characters.";
    return;
  }
  if (password !== confirm) {
    els.authStatus.textContent = "Passwords do not match.";
    return;
  }
  if (els.signupTerms && !els.signupTerms.checked) {
    els.authStatus.textContent = "Please agree to the Terms of Service and Privacy Policy.";
    return;
  }

  els.authStatus.textContent = "Creating your account...";
  try {
    const payload = await fetchJson("/api/session/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: email.split("@")[0] }),
    });
    if (els.signupPassword) els.signupPassword.value = "";
    if (els.signupConfirm) els.signupConfirm.value = "";
    await initializeAuthenticatedApp(payload.profile || null, { isNewSignup: true });
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
  state.deletingBookIds = new Set();
  state.currentDeletingBookId = "";
  state.lookup = null;
  state.currentTokens = [];
  state.lookupTokens = [];
  state.activeLookupSourceNormalized = "";
  els.bookAudio.pause();
  els.bookAudio.removeAttribute("src");
  els.bookAudio.load();
  showLandingPage(true);
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

window.addEventListener("popstate", (event) => {
  const view = event.state?.view || "library";
  if (view === "library") {
    els.bookAudio.pause();
    switchView("library", { pushState: false });
  } else if (view === "reader" && state.currentBook) {
    switchView("reader", { pushState: false });
  }
});

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
  if (discoverEls.modalAudiobookLang) populateSelect(discoverEls.modalAudiobookLang, audiobookLanguages);

  els.bookLanguage.value = preferences.sourceLanguage || "auto";
  els.listenerLanguage.value = preferences.listenerLanguage || "en";
  els.audiobookLanguage.value = preferences.audiobookLanguage || "pt-pt";
  if (discoverEls.modalAudiobookLang) discoverEls.modalAudiobookLang.value = preferences.audiobookLanguage || "pt-pt";
  updateLanguagePills();
}

function populateSelect(selectNode, options) {
  selectNode.innerHTML = "";
  const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label));
  sorted.forEach((option) => {
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

  const displayName = profile.name || profile.email || "Reader";
  const planLabel = (profile.plan === "premium") ? "Premium" : "Free";
  const planBadge = `<span class="plan-badge plan-badge-${profile.plan || 'free'}">${planLabel}</span>`;
  els.profileName.innerHTML = `${escapeHtml(displayName)} ${planBadge}`;
  if (els.topbarUserName) {
    const label = els.topbarUserName.querySelector(".topbar-profile-label");
    if (label) label.textContent = displayName;
  }

  const billingHtml = (profile.plan === "premium")
    ? `<span style="font-size:0.85rem;color:var(--muted)">Premium subscriber</span>`
    : `<button class="link-button" data-action="upgrade" data-interval="monthly">Upgrade to Premium — €19.99/month</button>`;
  els.profileDetails.innerHTML = `${escapeHtml(profile.email)}<br/>${billingHtml}`;

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

  els.voiceSettingsCard.classList.toggle("hidden", visibleVoiceSamples.length <= 1);
  els.importVoiceSummary.textContent = state.selectedVoice
    ? `Voice: ${state.selectedVoice.name}`
    : "PDF / EPUB / OCR";

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
  els.bookSubmit.textContent = isImporting ? "Saving and opening..." : "Save and read!";
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
  setBookStatus(file ? "Uploading, extracting, and preparing your book..." : "Saving your text into the library...");

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
        ? `"${payload.book.title}" was already on your shelf, so Voxenor is reopening it.`
        : `"${payload.book.title}" is saved. Opening the reader now.`
    );
    els.bookFile.value = "";
    els.bookText.value = "";
    els.bookTitle.value = "";
    await loadLibraryBook(payload.book.id, payload.book.progress?.pageIndex || 0);
  } catch (error) {
    if (error.upgradeRequired) {
      openUpgradeModal();
    } else {
      setBookStatus(error.message, true);
    }
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

  state.libraryBooks.forEach((book, index) => {
    const percent = getBookProgressPercent(book);
    const isDeleting = state.deletingBookIds.has(book.id);
    const shell = document.createElement("div");
    shell.className = "book-card-shell";
    shell.style.animationDelay = `${index * 60}ms`;

    const button = document.createElement("button");
    button.type = "button";
    const isLoading = state.loadingBookId === book.id;
    button.className = `book-card${state.currentBook?.id === book.id ? " active" : ""}${isLoading ? " is-loading" : ""}`;
    button.disabled = isDeleting || isLoading;
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
    deleteButton.disabled = isDeleting;
    deleteButton.classList.toggle("is-loading", isDeleting);
    deleteButton.textContent = isDeleting ? "Deleting..." : "Delete";
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
  const percent = hasBook ? getBookProgressPercent(state.currentBook) : 0;
  const isReadOnly = hasBook && state.currentBook.skipAudiobook;

  document.querySelector("#reader-view")?.classList.toggle("read-only-mode", isReadOnly);

  els.readerBookCover.innerHTML = hasBook ? renderCoverMarkup(state.currentBook.coverUrl, state.currentBook.title) : "VX";
  els.readerBookTitle.textContent = hasBook ? state.currentBook.title : "Select a book";
  els.readerBookMeta.textContent = hasBook
    ? isReadOnly
      ? `${totalPages} pages · ${getLanguageLabel(state.currentBook.detectedLanguage)} · Read-only`
      : `${totalPages} pages · ${getLanguageLabel(state.currentBook.detectedLanguage)} -> ${getLanguageLabel(state.currentBook.audiobookLanguage)}`
    : "Open a book from your shelf to begin.";
  els.readerProgressLabel.textContent = `${Math.round(percent)}%`;
  els.readerPageLabel.textContent = hasBook ? `Page ${currentPageNumber} of ${totalPages}` : "Page 0 of 0";
  els.readerProgressFill.style.width = `${percent}%`;
  els.pageFooterNumber.textContent = hasBook ? `Page ${currentPageNumber}` : "Page 0";
  els.goToPageInput.value = hasBook ? String(currentPageNumber) : "";
  els.goToPageInput.max = String(totalPages || 1);
  els.pagePrev.disabled = !hasBook || state.currentPageIndex <= 0;
  els.pageNext.disabled = !hasBook || state.currentPageIndex >= totalPages - 1;
  const isDeletingCurrentBook = Boolean(state.currentBook?.id && state.currentDeletingBookId === state.currentBook.id);
  els.readerDeleteBook.disabled = !state.currentBook || isDeletingCurrentBook;
  els.readerDeleteBook.textContent = isDeletingCurrentBook ? "Deleting this book..." : "Delete this book";
  updateLanguagePills();
  updateReaderStatusPill();

  if (!hasBook) {
    els.readerContent.classList.add("empty-state");
    els.readerContent.textContent = "Open a book from your shelf to enter the reader.";
    setReaderStageStatus("Open a book from your shelf to start reading.", { loading: false });
    setTransportAvailability(false);
    updateGenerationUi({
      label: "Open a page to begin.",
      progress: 0,
      logs: ["Choose a book from your library, then Voxenor will start preparing the visible reading pages automatically."],
    });
  }
}

async function loadLibraryBook(bookId, pageIndex = 0, options = {}) {
  state.loadingBookId = bookId;
  state.pageDataCache.clear();
  renderLibraryBooks();
  // Clear read-only-mode immediately so it doesn't persist from a previous book.
  document.querySelector("#reader-view")?.classList.remove("read-only-mode");
  switchView("reader");
  showReaderPageOverlay("Opening book...", "Loading your book from the shelf.");
  setReaderStageStatus("Opening book...", { loading: true });
  try {
    const payload = await fetchJson(`/api/books/${bookId}`);
    state.currentBook = payload.book;
    upsertLibraryBook(payload.book);
    renderLibraryBooks();
    await openBookPage(pageIndex, options);
  } catch (error) {
    hideReaderPageOverlay();
    setReaderStageStatus(error.message, { loading: false });
  } finally {
    state.loadingBookId = "";
    renderLibraryBooks();
  }
}

async function openBookPage(pageIndex, options = {}) {
  if (!state.currentBook) {
    return;
  }

  const safePageIndex = Math.max(0, Math.min((state.currentBook.pages || []).length - 1, pageIndex));
  const pageSummary = state.currentBook.pages?.[safePageIndex];
  const pageAlreadyReady = pageSummary?.ready;

  const requestToken = state.pageOpenRequestToken + 1;
  state.pageOpenRequestToken = requestToken;
  state.autoplayPending = Boolean(options.autoplay);
  if (!pageAlreadyReady && !options.autoplay) {
    showReaderPageOverlay(`Opening page ${safePageIndex + 1}...`, "Voxenor is loading the text and current page state.");
    setReaderStageStatus(`Opening page ${safePageIndex + 1}...`, { loading: true });
  }

  try {
    const cacheKey = `${state.currentBook.id}:${safePageIndex}`;
    const cachedPage = state.pageDataCache.get(cacheKey);
    let page;
    if (cachedPage) {
      state.pageDataCache.delete(cacheKey);
      page = cachedPage;
    } else {
      const payload = await fetchJson(`/api/books/${state.currentBook.id}/pages/${safePageIndex}`);
      page = payload.page;
    }
    if (requestToken !== state.pageOpenRequestToken) {
      return;
    }
    applyBookPage(state.currentBook, page, options);
    await saveProgress();
  } catch (error) {
    if (requestToken !== state.pageOpenRequestToken) {
      return;
    }
    state.autoplayPending = false;
    setReaderStageStatus(error.message, { loading: false });
    throw error;
  } finally {
    if (requestToken === state.pageOpenRequestToken) {
      hideReaderPageOverlay();
    }
  }
}

function applyBookPage(book, page, options = {}) {
  const preserveViewport = Boolean(options.preserveViewport);
  const preservePlaybackState = Boolean(options.preservePlaybackState);
  const previousBookId = state.currentBook?.id || "";
  const previousScrollTop = preserveViewport ? els.readerContent.scrollTop : 0;
  const previousAudioTime = preservePlaybackState ? Number(els.bookAudio.currentTime || 0) : 0;
  const shouldResumePlayback = preservePlaybackState && !els.bookAudio.paused && !els.bookAudio.ended;
  const sameAudioUrl = Boolean(page.audioUrl && state.currentAudioUrl && state.currentAudioUrl === page.audioUrl);

  state.currentBook = book;
  state.currentPage = page;
  state.currentPageIndex = page.index;
  state.detectedBookLanguage = book.detectedLanguage || "auto";
  state.readerLanguage = page.translatedText ? book.audiobookLanguage || "pt-pt" : book.detectedLanguage || "auto";
  state.currentAudioUrl = page.audioUrl || "";
  state.alignmentSegments = page.alignment?.segments || [];
  state.alignmentWordTimings = buildAlignmentWordTimings(state.alignmentSegments);
  state.lastHighlightedGlobalIndex = -1;
  state.followPlayback = true;

  // Sync language dropdowns to this book's settings so pills and pipeline reflect the actual book.
  if (book.detectedLanguage) {
    els.bookLanguage.value = book.detectedLanguage;
  }
  if (book.audiobookLanguage) {
    els.audiobookLanguage.value = book.audiobookLanguage;
  }
  if (book.listenerLanguage) {
    els.listenerLanguage.value = book.listenerLanguage;
  }

  syncBookSummaryPage(page);
  renderReaderShell();
  renderCurrentReaderContent(page.displayText || page.sourceText || "");
  if (!options.skipAnimate) {
    animatePageTurn(options.turnDirection || "");
  }
  if (preserveViewport) {
    els.readerContent.scrollTop = previousScrollTop;
  }

  if (page.audioUrl) {
    setTransportAvailability(true);
    if (!sameAudioUrl) {
      state._pendingPlayRequest = false;
      els.bookAudio.src = page.audioUrl;
      // Preserve user's speed/volume when switching tracks.
      els.bookAudio.playbackRate = parseFloat(els.speedToggle.textContent) || 1;
      els.bookAudio.volume = Number(els.volumeSlider.value);
      const resumeTime = preservePlaybackState
        ? previousAudioTime
        : book.progress?.pageIndex === page.index && Number.isFinite(book.progress?.audioTime)
          ? book.progress.audioTime
          : 0;
      const restorePlaybackState = () => {
        if (resumeTime > 0) {
          els.bookAudio.currentTime = Math.min(resumeTime, Math.max(0, (els.bookAudio.duration || resumeTime) - 0.2));
        }
        if (shouldResumePlayback || options.autoplay || state._pendingPlayRequest) {
          state._pendingPlayRequest = false;
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

  if (!options.skipGenerationUiUpdate) {
    updateGenerationUiFromPage(page);
  }
  updateReaderStatusPill();
  applyLookupHighlight();

  if (visiblePageNeedsPolling(page, { preview: false }) || state.activePreparationKey) {
    startPageStatusPolling(book.id, page.index);
  } else {
    stopPageStatusPolling();
  }

  if (page.audioUrl) {
    void warmUpcomingPagesFromCurrent();
  }

  switchView("reader");
  if (!options.skipAutoPrepare) {
    void maybeAutoPrepareCurrentPage();
  }
}

function renderCurrentReaderContent(text) {
  state.lookupTokens = [];
  state.currentTokens = renderReaderContentInto(els.readerContent, text, "current");
  state.totalWordCount = state.currentTokens.length;
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
        span.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          clearReaderSelection();
          void handleWordLookup(token.value, pageRole, event);
        });
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

function clearReaderSelection() {
  const selection = window.getSelection();
  selection?.removeAllRanges?.();
  state.lastSelectionText = "";
}

function getPageTextByRole(pageRole) {
  return state.currentPage?.displayText || state.currentPage?.sourceText || "";
}

async function maybeAutoPrepareCurrentPage() {
  if (!state.currentBook || !state.currentPage) {
    return;
  }

  if (state.currentBook.skipAudiobook) {
    return;
  }

  const page = state.currentPage;
  if (page.audioUrl || page.audioStatus === "running" || page.translationStatus === "running") {
    return;
  }

  await handlePrepareCurrentPage({ silent: false });
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

  if (state.deletingBookIds.has(bookId)) {
    return;
  }

  const confirmed = await showConfirmDialog({
    title: "Delete this book?",
    message: `"${book.title}" will be permanently removed from your library, including all translations and generated audio.`,
    okLabel: "Delete",
  });
  if (!confirmed) {
    return;
  }

  state.deletingBookIds.add(bookId);
  state.currentDeletingBookId = bookId;
  renderLibraryBooks();
  renderReaderShell();
  setBookStatus(`Deleting "${book.title}" from your shelf...`);
  if (state.currentBook?.id === bookId) {
    setReaderStageStatus(`Deleting "${book.title}" from your shelf...`, { loading: true });
  }

  try {
    await fetchJson(`/api/books/${encodeURIComponent(bookId)}`, { method: "DELETE" });
    state.libraryBooks = state.libraryBooks.filter((candidate) => candidate.id !== bookId);
    if (state.currentBook?.id === bookId) {
      state.currentBook = null;
      state.currentPage = null;
      state.currentPageIndex = 0;
      state.currentTokens = [];
      state.lookupTokens = [];
      state.activeLookupSourceNormalized = "";
      state.lookup = null;
      els.bookAudio.pause();
      els.bookAudio.removeAttribute("src");
      els.bookAudio.load();
      stopPageStatusPolling();
      state.activePreparationKey = "";
    }
    renderLibraryBooks();
    renderReaderShell();
    renderSavedWords();
    switchView("library");
    setBookStatus(`Removed "${book.title}" from your shelf.`);
  } catch (error) {
    setBookStatus(error.message, true);
  } finally {
    state.deletingBookIds.delete(bookId);
    if (state.currentDeletingBookId === bookId) {
      state.currentDeletingBookId = "";
    }
    renderLibraryBooks();
    renderReaderShell();
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
  if (state._navCooldown) {
    return;
  }
  state._navCooldown = true;
  setTimeout(() => { state._navCooldown = false; }, 350);
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

  const requestedBookId = state.currentBook.id;
  const requestedPageIndex = state.currentPageIndex;
  const preparationKey = `${requestedBookId}:${requestedPageIndex}:${state.selectedVoice?.id || "storybook"}`;
  if (state.activePreparationKey === preparationKey) {
    return;
  }

  try {
    state.activePreparationKey = preparationKey;
    els.generateButton.disabled = true;
    if (!options.silent) {
      updateGenerationUi({
        label: `Preparing page ${requestedPageIndex + 1}...`,
        progress: 16,
        logs: [
          `Page ${requestedPageIndex + 1}: checking translation state.`,
          "If needed, Voxenor will translate first and then generate the narration.",
        ],
      });
    }
    setReaderStageStatus(
      `Showing this page now while Voxenor prepares translation and audio for page ${requestedPageIndex + 1}.`,
      { loading: true }
    );

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

    const generationStillRunning =
      !payload.page.audioUrl &&
      (payload.started || payload.page.translationStatus === "running" || payload.page.audioStatus === "running");

    const stillCurrent = state.currentBook?.id === requestedBookId && state.currentPageIndex === requestedPageIndex;
    if (stillCurrent) {
      applyBookPage(state.currentBook || payload.book, payload.page, {
        autoplay: Boolean(options.autoplay),
        skipAutoPrepare: true,
      });
    }

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
    setReaderStageStatus(error.message, { loading: false });
  } finally {
    if (state.activePreparationKey === preparationKey) {
      state.activePreparationKey = "";
    }
    els.generateButton.disabled = false;
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

function setReaderStageStatus(message, { loading = false } = {}) {
  els.readerStageMessage.textContent = message;
  els.readerStageSpinner.classList.toggle("hidden", !loading);
}

function showReaderPageOverlay(title, text) {
  state.pageOpening = true;
  els.readerPageOverlayTitle.textContent = title;
  els.readerPageOverlayText.textContent = text;
  els.readerPageOverlay.classList.remove("hidden");
}

function hideReaderPageOverlay() {
  state.pageOpening = false;
  els.readerPageOverlay.classList.add("hidden");
}

function updateGenerationUiFromPage(page) {
  const needsTranslation =
    (state.currentBook?.detectedLanguage || "auto") !== "auto" &&
    normalizeLanguageCode(state.currentBook?.detectedLanguage || "auto") !==
      normalizeLanguageCode(state.currentBook?.audiobookLanguage || "pt-pt") &&
    !page.translatedText;

  const willAutoPrepare = !state.currentBook?.skipAudiobook && !page.audioUrl && page.audioStatus !== "running" && page.translationStatus !== "running";

  const logs = page.logs?.length
    ? page.logs
    : willAutoPrepare
      ? [
          `Page ${page.index + 1}: queuing for preparation.`,
          needsTranslation ? "Voxenor will translate first and then generate the narration." : "Generating audio now.",
        ]
      : [
          `Translation: ${page.translationStatus || (needsTranslation ? "idle" : "source")}.`,
          `Audio: ${page.audioStatus || "idle"}.`,
        ];

  const label =
    page.audioUrl || page.translationStatus === "running" || page.audioStatus === "running"
      ? buildGenerationLabelFromPage(page)
      : willAutoPrepare && needsTranslation
        ? `Starting PT-PT translation for page ${page.index + 1}...`
        : willAutoPrepare
          ? `Preparing audio for page ${page.index + 1}...`
          : needsTranslation
            ? "This page still needs PT-PT translation before the audio can be generated."
            : "This page is ready to generate as audio.";

  updateGenerationUi({
    label,
    progress: willAutoPrepare ? Math.max(8, inferGenerationProgressFromPage(page)) : inferGenerationProgressFromPage(page),
    logs,
  });
  setReaderStageStatus(buildReaderStageLabel(page, needsTranslation), {
    loading: page.translationStatus === "running" || page.audioStatus === "running" || willAutoPrepare,
  });
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

function isCurrentPagePlaying(page) {
  return Boolean(page?.audioUrl && state.currentAudioUrl === page.audioUrl && !els.bookAudio.paused && !els.bookAudio.ended);
}

function buildGenerationLabelFromPage(page) {
  if (page.audioUrl && isCurrentPagePlaying(page)) {
    return `Playing page ${page.index + 1} now.`;
  }
  if (state.autoplayPending) {
    return page.audioUrl
      ? `Audio ready for page ${page.index + 1}. Starting playback now.`
      : `Autoplay is armed for page ${page.index + 1}. Voxenor will start as soon as the audio is ready.`;
  }
  if (page.audioUrl) {
    return "Audio ready. Press Play whenever you want.";
  }
  if (page.audioStatus === "running") {
    return `Generating audiobook for page ${page.index + 1} while you keep reading.`;
  }
  if (page.translationStatus === "running") {
    return `Translating page ${page.index + 1} while the source text stays visible.`;
  }
  if (page.translationStatus === "ready") {
    return `Translation ready for page ${page.index + 1}; audio is next.`;
  }
  return `Page ${page.index + 1} is on screen. Voxenor will prepare this page and the next six.`;
}

function buildReaderStageLabel(page, needsTranslation) {
  const sourceLabel = getLanguageLabel(state.currentBook?.detectedLanguage || "auto");
  const targetLabel = getLanguageLabel(state.currentBook?.audiobookLanguage || "pt-pt");
  if (state.autoplayPending && page.audioUrl) {
    return `Page ${page.index + 1} is ready. Starting playback now.`;
  }
  if (state.autoplayPending) {
    return `Page ${page.index + 1} is on screen. Voxenor will start playback as soon as the audiobook is ready.`;
  }
  if (isCurrentPagePlaying(page)) {
    return `Playing page ${page.index + 1} in ${targetLabel}.`;
  }
  if (page.audioUrl) {
    return `Page ${page.index + 1} is ready. Press Play to hear it.`;
  }
  if (page.audioStatus === "running") {
    return `Page ${page.index + 1} is visible now. Voxenor is generating the audiobook in ${targetLabel}.`;
  }
  if (page.translationStatus === "running") {
    return `Showing ${sourceLabel} for page ${page.index + 1} while Voxenor translates it into ${targetLabel}.`;
  }
  if (page.translationStatus === "ready") {
    return `Page ${page.index + 1} is translated. Voxenor is lining up the audiobook render.`;
  }
  if (needsTranslation) {
    return `Showing the original ${sourceLabel} text for page ${page.index + 1} while Voxenor starts the translation pipeline.`;
  }
  return `Page ${page.index + 1} is on screen. Voxenor is preparing audio in the background.`;
}

function visiblePageNeedsPolling(page, { preview = false } = {}) {
  if (!page || !state.currentBook) {
    return false;
  }

  if (page.translationStatus === "running" || page.audioStatus === "running") {
    return true;
  }

  // Keep polling while translation is done but audio pipeline hasn't started/finished yet.
  if (!state.currentBook.skipAudiobook && !page.audioUrl &&
      (page.translationStatus === "ready" || page.audioStatus === "ready")) {
    return true;
  }

  const needsTranslation =
    normalizeLanguageCode(state.currentBook.detectedLanguage || "auto") !== "auto" &&
    normalizeLanguageCode(state.currentBook.detectedLanguage || "auto") !==
      normalizeLanguageCode(state.currentBook.audiobookLanguage || "pt-pt");

  if (preview && needsTranslation && !page.translatedText?.trim()) {
    return true;
  }

  if (preview && !page.audioUrl) {
    return true;
  }

  return false;
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
  if (!state.currentBook?.skipAudiobook) {
    els.readerStatusPill.textContent = "Preparing";
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
      if (state.currentBook?.id !== bookId) {
        stopPageStatusPolling();
        return;
      }

      const currentPagePayload = await fetchJson(`/api/books/${bookId}/pages/${pageIndex}`);
      const currentPage = currentPagePayload.page;
      syncBookSummaryPage(currentPage);

      if (state.currentBook?.id === bookId && state.currentPageIndex === pageIndex) {
        applyBookPage(state.currentBook, currentPage, {
          preserveViewport: true,
          preservePlaybackState: true,
          skipAnimate: true,
          skipAutoPrepare: true,
        });
      }

      const stillNeedsPolling = visiblePageNeedsPolling(state.currentPage, { preview: false });
      if (!stillNeedsPolling && !state.activePreparationKey) {
        stopPageStatusPolling();
      }
    } catch (pollError) {
      console.warn("[poll] page status fetch failed:", pollError.message);
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

  // Trigger server-side look-ahead preparation for upcoming pages.
  await fetchJson(`/api/books/${state.currentBook.id}/pages/${state.currentPageIndex}/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voiceSampleId: state.selectedVoice.id,
    }),
  }).catch(() => {});

  // Refresh full book data so page `ready` flags are up to date for seamless transitions.
  try {
    const payload = await fetchJson(`/api/books/${state.currentBook.id}`);
    if (payload.book && state.currentBook?.id === payload.book.id) {
      state.currentBook = { ...state.currentBook, ...payload.book };
      renderLibraryBooks();
    }
  } catch {
    // Not critical — pages will still load, just might briefly show the overlay.
  }

  // Pre-fetch the next few pages' full data so page transitions are instant.
  const bookId = state.currentBook.id;
  const totalPages = state.currentBook.pages?.length || 0;
  for (let offset = 1; offset <= 3; offset++) {
    const idx = state.currentPageIndex + offset;
    if (idx >= totalPages) break;
    const cacheKey = `${bookId}:${idx}`;
    if (state.pageDataCache.has(cacheKey)) continue;
    fetchJson(`/api/books/${bookId}/pages/${idx}`).then(payload => {
      if (payload.page) state.pageDataCache.set(cacheKey, payload.page);
    }).catch(() => {});
  }
}

async function handlePlayToggle() {
  if (!els.bookAudio.src) {
    updateGenerationUi({
      label: `Page ${state.currentPageIndex + 1} is not ready yet.`,
      progress: 0,
      logs: ["Voxenor is still translating or rendering this page. Keep reading and playback will unlock as soon as the audio is ready."],
    });
    return;
  }

  if (!els.bookAudio.paused) {
    els.bookAudio.pause();
    return;
  }

  // If metadata hasn't loaded yet, wait for it then play
  if (els.bookAudio.readyState < 1) {
    state._pendingPlayRequest = true;
    els.bookAudio.addEventListener("loadedmetadata", () => {
      if (state._pendingPlayRequest) {
        state._pendingPlayRequest = false;
        void els.bookAudio.play().catch(() => {});
      }
    }, { once: true });
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

  await openBookPage(nextPageIndex, { turnDirection: "forward", autoplay: true });
  if (els.bookAudio.src) {
    if (els.bookAudio.paused) {
      await els.bookAudio.play().catch(() => {});
    }
    return;
  }
  await handlePrepareCurrentPage({ autoplay: true });
}

function setTransportAvailability(isReady) {
  els.playToggle.disabled = !isReady;
  els.restartToggle.disabled = !isReady;
  els.pageAdvance.disabled = !state.currentBook?.pages?.length || state.currentPageIndex >= (state.currentBook.pages.length - 1);
}

function syncTransportIcons(playing) {
  const playIcon = els.playToggle.querySelector(".icon-play");
  const pauseIcon = els.playToggle.querySelector(".icon-pause");
  if (playIcon && pauseIcon) {
    playIcon.classList.toggle("hidden", playing);
    pauseIcon.classList.toggle("hidden", !playing);
  }
  els.playToggle.setAttribute("aria-label", playing ? "Pause" : "Play");
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
  if (!state.alignmentWordTimings.length || !state.totalWordCount) {
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
  els.readerContent.classList.remove("page-enter-forward", "page-enter-backward");
  window.clearTimeout(state.readerTurnTimer);
  if (!direction) {
    return;
  }
  const className = direction === "backward" ? "page-enter-backward" : "page-enter-forward";
  // Force reflow so the animation restarts even if called rapidly.
  void els.readerContent.offsetWidth;
  els.readerContent.classList.add(className);
  state.readerTurnTimer = window.setTimeout(() => {
    els.readerContent.classList.remove(className);
  }, 340);
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

async function handleWordLookup(word, pageRole = "current", clickEvent = null) {
  state.activeLookupSourceNormalized = normalizeComparableText(word);
  applyLookupHighlight();
  if (clickEvent) showWordTooltip(clickEvent, word, null);
  try {
    const payload = await translate(word);
    if (clickEvent) {
      showWordTooltip(clickEvent, word, payload.translatedText);
    }
    setLookupValue({
      source: word,
      translatedText: payload.translatedText,
      context: buildContextSnippet(word, pageRole),
      sourceLanguage: state.readerLanguage,
      targetLanguage: els.listenerLanguage.value,
      pageIndex: state.currentPageIndex,
    });
  } catch (error) {
    if (clickEvent) hideWordTooltip();
    setLookupError(error.message, word);
  }
}

function showWordTooltip(event, word, translation) {
  let tip = document.getElementById("word-tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "word-tooltip";
    tip.className = "word-tooltip";
    document.body.appendChild(tip);
  }
  if (translation) {
    tip.innerHTML = `<span class="word-tooltip-source">${escapeHtml(word)}</span><span class="word-tooltip-sep">→</span><span class="word-tooltip-result">${escapeHtml(translation)}</span>`;
  } else {
    tip.innerHTML = `<span class="word-tooltip-source">${escapeHtml(word)}</span><span class="word-tooltip-sep">…</span>`;
  }
  // Make visible off-screen first to measure, then position
  tip.style.left = "-9999px";
  tip.style.top = "-9999px";
  tip.classList.add("visible");

  const rect = event.target instanceof HTMLElement ? event.target.getBoundingClientRect() : { left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY, width: 0, height: 0 };
  const tipWidth = tip.offsetWidth;
  const tipHeight = tip.offsetHeight;
  let left = rect.left + rect.width / 2 - tipWidth / 2;
  let top = rect.top - tipHeight - 8;
  if (top < 4) top = rect.bottom + 8;
  if (left < 4) left = 4;
  if (left + tipWidth > window.innerWidth - 4) left = window.innerWidth - tipWidth - 4;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;

  clearTimeout(tip._hideTimer);
  tip._hideTimer = setTimeout(hideWordTooltip, 4000);

  document.addEventListener("click", _wordTooltipOutsideClick, true);
}

function hideWordTooltip() {
  const tip = document.getElementById("word-tooltip");
  if (tip) {
    tip.classList.remove("visible");
    clearTimeout(tip._hideTimer);
  }
  document.removeEventListener("click", _wordTooltipOutsideClick, true);
}

function _wordTooltipOutsideClick(e) {
  const tip = document.getElementById("word-tooltip");
  if (tip && !tip.contains(e.target) && !e.target.closest(".token")) {
    hideWordTooltip();
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
      pageIndex: state.currentPageIndex,
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

/* ═══════════════════════════════════════════════════════════
   PROJECT GUTENBERG DISCOVER
   ═══════════════════════════════════════════════════════════ */

const discoverEls = {
  grid: document.querySelector("#discover-grid"),
  search: document.querySelector("#discover-search"),
  searchClear: document.querySelector("#discover-search-clear"),
  modal: document.querySelector("#discover-modal"),
  modalClose: document.querySelector("#discover-modal-close"),
  modalBackdrop: document.querySelector(".discover-modal-backdrop"),
  modalCover: document.querySelector("#discover-modal-cover"),
  modalTitle: document.querySelector("#discover-modal-title"),
  modalAuthor: document.querySelector("#discover-modal-author"),
  modalYear: document.querySelector("#discover-modal-year"),
  modalSubjects: document.querySelector("#discover-modal-subjects"),
  modalDesc: document.querySelector("#discover-modal-desc"),
  modalAdd: document.querySelector("#discover-modal-add"),
  modalNoAudiobook: document.querySelector("#discover-no-audiobook"),
  modalLangField: document.querySelector("#discover-lang-field"),
  modalAudiobookLang: document.querySelector("#discover-audiobook-language"),
};

let discoverSearchTimeout = null;
let activeDiscoverBook = null;
let discoverPaging = { mode: "category", topic: "popular", query: "", page: 1, hasMore: false, loading: false };

function initDiscover() {
  document.querySelectorAll(".discover-cat").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".discover-cat").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (discoverEls.search) discoverEls.search.value = "";
      discoverPaging = { mode: "category", topic: btn.dataset.subject, query: "", page: 1, hasMore: false, loading: false };
      void loadDiscoverBooks(btn.dataset.subject, 1);
    });
  });

  if (discoverEls.search) {
    discoverEls.search.addEventListener("input", () => {
      clearTimeout(discoverSearchTimeout);
      const query = discoverEls.search.value.trim();
      discoverEls.searchClear?.classList.toggle("hidden", !query);
      if (!query) {
        const activeCat = document.querySelector(".discover-cat.active");
        void loadDiscoverBooks(activeCat?.dataset.subject || "popular");
        return;
      }
      discoverSearchTimeout = setTimeout(() => {
        document.querySelectorAll(".discover-cat").forEach((b) => b.classList.remove("active"));
        void searchDiscoverBooks(query);
      }, 500);
    });
  }

  if (discoverEls.searchClear) {
    discoverEls.searchClear.addEventListener("click", () => {
      discoverEls.search.value = "";
      discoverEls.searchClear.classList.add("hidden");
      const activeCat = document.querySelector(".discover-cat.active");
      if (!activeCat) {
        document.querySelector('.discover-cat[data-subject="popular"]')?.classList.add("active");
      }
      void loadDiscoverBooks(activeCat?.dataset.subject || "popular");
      discoverEls.search.focus();
    });
  }

  if (discoverEls.modalClose) discoverEls.modalClose.addEventListener("click", closeDiscoverModal);
  if (discoverEls.modalBackdrop) discoverEls.modalBackdrop.addEventListener("click", closeDiscoverModal);
  if (discoverEls.modalAdd) discoverEls.modalAdd.addEventListener("click", handleAddDiscoverBook);
  if (discoverEls.modalNoAudiobook) {
    discoverEls.modalNoAudiobook.addEventListener("change", () => {
      if (discoverEls.modalLangField) {
        discoverEls.modalLangField.style.display = discoverEls.modalNoAudiobook.checked ? "none" : "";
      }
    });
  }

  void loadDiscoverBooks("popular", 1);
}

async function loadDiscoverBooks(topic, page = 1) {
  const append = page > 1;
  if (!append) {
    var loadingTimer = setTimeout(showDiscoverLoading, 200);
  }
  discoverPaging.loading = true;
  try {
    const res = await fetch(`/api/discover/${encodeURIComponent(topic)}?page=${page}`);
    const data = await res.json();
    if (!append) clearTimeout(loadingTimer);
    if (data.ok) {
      discoverPaging.page = data.page;
      discoverPaging.hasMore = data.hasMore;
      renderDiscoverGrid(data.books, append);
    } else if (!append) {
      discoverEls.grid.innerHTML = '<p style="text-align:center;color:var(--muted);grid-column:1/-1">Could not load books. Try again later.</p>';
    }
  } catch {
    if (!append) {
      clearTimeout(loadingTimer);
      discoverEls.grid.innerHTML = '<p style="text-align:center;color:var(--muted);grid-column:1/-1">Could not load books. Try again later.</p>';
    }
  } finally {
    discoverPaging.loading = false;
  }
}

async function searchDiscoverBooks(query, page = 1) {
  const append = page > 1;
  if (!append) {
    var loadingTimer = setTimeout(showDiscoverLoading, 200);
  }
  discoverPaging.loading = true;
  try {
    const res = await fetch(`/api/discover-search?q=${encodeURIComponent(query)}&page=${page}`);
    const data = await res.json();
    if (!append) clearTimeout(loadingTimer);
    if (data.ok) {
      discoverPaging.page = data.page;
      discoverPaging.hasMore = data.hasMore;
      renderDiscoverGrid(data.books, append);
    } else if (!append) {
      discoverEls.grid.innerHTML = '<p style="text-align:center;color:var(--muted);grid-column:1/-1">Search failed. Try again later.</p>';
    }
  } catch {
    if (!append) {
      clearTimeout(loadingTimer);
      discoverEls.grid.innerHTML = '<p style="text-align:center;color:var(--muted);grid-column:1/-1">Search failed. Try again later.</p>';
    }
  } finally {
    discoverPaging.loading = false;
  }
}

function showDiscoverLoading() {
  discoverEls.grid.classList.add("loading-state");
  discoverEls.grid.innerHTML = '<div class="library-loader"><span class="stage-spinner"></span><span>Loading books...</span></div>';
}

function renderDiscoverGrid(books, append = false) {
  discoverEls.grid.classList.remove("loading-state");

  // Remove existing load-more button
  const existingBtn = discoverEls.grid.querySelector(".discover-load-more");
  if (existingBtn) existingBtn.remove();

  if (!append) {
    discoverEls.grid.innerHTML = "";
  }

  if (!books.length && !append) {
    discoverEls.grid.innerHTML = '<p style="text-align:center;color:var(--muted);grid-column:1/-1;padding:2rem 0">No books found. Try a different search.</p>';
    return;
  }

  const existingCount = append ? discoverEls.grid.querySelectorAll(".discover-book").length : 0;

  books.forEach((book, i) => {
    const el = document.createElement("div");
    el.className = "discover-book";
    el.style.animationDelay = `${(existingCount + i) * 40}ms`;

    const coverHtml = book.coverUrl
      ? `<img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" loading="lazy" />`
      : `<div class="discover-cover-fallback">${escapeHtml(book.title)}</div>`;

    el.innerHTML = `
      <div class="discover-book-cover">${coverHtml}</div>
      <div class="discover-book-title">${escapeHtml(book.title)}</div>
      <div class="discover-book-author">${escapeHtml(book.authors.join(", ") || "Unknown author")}</div>
    `;
    el.addEventListener("click", () => openDiscoverModal(book));
    discoverEls.grid.append(el);
  });

  // Add "Load more" button if there are more pages
  if (discoverPaging.hasMore) {
    const loadMoreEl = document.createElement("div");
    loadMoreEl.className = "discover-load-more";
    loadMoreEl.innerHTML = '<button class="discover-load-more-btn">Load more books</button>';
    loadMoreEl.querySelector("button").addEventListener("click", handleDiscoverLoadMore);
    discoverEls.grid.append(loadMoreEl);
  }
}

function handleDiscoverLoadMore() {
  if (discoverPaging.loading) return;
  const nextPage = discoverPaging.page + 1;
  const btn = discoverEls.grid.querySelector(".discover-load-more-btn");
  if (btn) {
    btn.textContent = "Loading...";
    btn.disabled = true;
  }
  if (discoverPaging.mode === "search") {
    void searchDiscoverBooks(discoverPaging.query, nextPage);
  } else {
    void loadDiscoverBooks(discoverPaging.topic, nextPage);
  }
}

function openDiscoverModal(book) {
  activeDiscoverBook = book;

  discoverEls.modalCover.innerHTML = book.coverUrl
    ? `<img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" />`
    : `<div class="discover-cover-fallback" style="font-size:1.2rem">${escapeHtml(book.title)}</div>`;

  discoverEls.modalTitle.textContent = book.title;
  discoverEls.modalAuthor.textContent = book.authors.join(", ") || "Unknown author";
  discoverEls.modalYear.textContent = "";
  discoverEls.modalSubjects.textContent = book.subjects.length ? book.subjects.join(" · ") : "";
  discoverEls.modalDesc.textContent = book.summary || "No description available.";

  if (discoverEls.modalNoAudiobook) {
    discoverEls.modalNoAudiobook.checked = false;
  }
  if (discoverEls.modalLangField) {
    discoverEls.modalLangField.style.display = "";
  }

  discoverEls.modal.classList.remove("hidden");
  discoverEls.modal.setAttribute("aria-hidden", "false");
}

function closeDiscoverModal() {
  discoverEls.modal.classList.add("hidden");
  discoverEls.modal.setAttribute("aria-hidden", "true");
  activeDiscoverBook = null;
}

async function handleAddDiscoverBook() {
  if (!activeDiscoverBook) return;
  const book = activeDiscoverBook;
  const btn = discoverEls.modalAdd;
  if (!book.textUrl) {
    btn.textContent = "No text available for this book";
    setTimeout(() => {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg> Add to my library';
    }, 1500);
    return;
  }
  btn.disabled = true;
  btn.textContent = "Importing...";

  try {
    const payload = await fetchJson("/api/books/import-gutenberg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: book.title,
        textUrl: book.textUrl,
        coverUrl: book.coverUrl || "",
        audiobookLanguage: discoverEls.modalAudiobookLang?.value || els.audiobookLanguage.value,
        listenerLanguage: els.listenerLanguage.value,
        skipAudiobook: discoverEls.modalNoAudiobook?.checked || false,
      }),
    });
    upsertLibraryBook(payload.book);
    state.currentBook = payload.book;
    state.currentPageIndex = payload.page?.index || 0;
    renderLibraryBooks();
    closeDiscoverModal();
    await loadLibraryBook(payload.book.id, payload.book.progress?.pageIndex || 0);
  } catch (error) {
    btn.textContent = error.upgradeRequired ? "Upgrade to Premium for unlimited books" : (error.message || "Failed — try again");
    if (error.upgradeRequired) openUpgradeModal();
  } finally {
    btn.disabled = false;
    setTimeout(() => {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg> Add to my library';
    }, 1200);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showConfirmDialog({ title = "Are you sure?", message = "", okLabel = "Confirm" } = {}) {
  return new Promise((resolve) => {
    const dialog = document.querySelector("#confirm-dialog");
    const backdrop = dialog.querySelector(".confirm-dialog-backdrop");
    const titleEl = document.querySelector("#confirm-dialog-title");
    const messageEl = document.querySelector("#confirm-dialog-message");
    const cancelBtn = document.querySelector("#confirm-dialog-cancel");
    const okBtn = document.querySelector("#confirm-dialog-ok");

    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = okLabel;

    dialog.classList.remove("hidden");
    dialog.setAttribute("aria-hidden", "false");
    cancelBtn.focus();

    function cleanup(result) {
      dialog.classList.add("hidden");
      dialog.setAttribute("aria-hidden", "true");
      backdrop.removeEventListener("click", onCancel);
      cancelBtn.removeEventListener("click", onCancel);
      okBtn.removeEventListener("click", onOk);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }

    function onCancel() { cleanup(false); }
    function onOk() { cleanup(true); }
    function onKey(e) {
      if (e.key === "Escape") { cleanup(false); }
    }

    backdrop.addEventListener("click", onCancel);
    cancelBtn.addEventListener("click", onCancel);
    okBtn.addEventListener("click", onOk);
    document.addEventListener("keydown", onKey);
  });
}

// ── Plan & Billing ──────────────────────────────────────────

async function handleUpgradeClick(interval) {
  closeUpgradeModal();
  try {
    const payload = await fetchJson("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: interval || "monthly" }),
    });
    if (payload.url) window.location.href = payload.url;
  } catch (error) {
    alert(error.message || "Could not open checkout. Try again.");
  }
}
window.handleUpgradeClick = handleUpgradeClick;

// Global event delegation for data-action handlers (CSP-safe, no inline onclick)
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (action === "upgrade") {
    e.preventDefault();
    handleUpgradeClick(el.dataset.interval || "monthly");
  } else if (action === "legal") {
    e.preventDefault();
    window.openLegalPage(el.dataset.page);
  } else if (action === "close-legal") {
    e.preventDefault();
    window.closeLegalPage();
  }
});

function canImportBook() {
  const profile = state.profile || {};
  const plan = state.plan || {};
  if (profile.plan === "premium") return true;
  const limit = plan.freeBookLimit || 1;
  const used = profile.booksUsed || 0;
  if (used >= limit) {
    openUpgradeModal();
    return false;
  }
  return true;
}

function openUpgradeModal() {
  if (!els.upgradeModal) return;
  els.upgradeModal.classList.remove("hidden");
  els.upgradeModal.setAttribute("aria-hidden", "false");
}
function closeUpgradeModal() {
  if (!els.upgradeModal) return;
  els.upgradeModal.classList.add("hidden");
  els.upgradeModal.setAttribute("aria-hidden", "true");
}
window.openUpgradeModal = openUpgradeModal;

if (els.upgradeModalClose) {
  els.upgradeModalClose.addEventListener("click", closeUpgradeModal);
}
if (els.upgradeModal) {
  els.upgradeModal.querySelector(".upgrade-modal-backdrop")?.addEventListener("click", closeUpgradeModal);
}

async function handleCancelSubscription() {
  const confirmed = await showConfirmDialog({
    title: "Cancel Premium?",
    message: "You'll lose access to unlimited books immediately. No refund will be issued. Are you sure?",
    okLabel: "Cancel subscription",
  });
  if (!confirmed) return;
  const statusEl = els.cancelSubStatus;
  if (statusEl) { statusEl.textContent = "Canceling..."; statusEl.className = "profile-save-status"; }
  try {
    await fetchJson("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (statusEl) { statusEl.textContent = "Subscription canceled."; statusEl.className = "profile-save-status is-ok"; }
    const meta = await fetchJson("/api/meta");
    state.plan = meta.plan || state.plan;
    state.profile = meta.profile || state.profile;
    renderProfile(meta);
    // Delay hiding cancel row so the user sees the success message
    setTimeout(() => renderPlanCards(), 2000);
  } catch (error) {
    if (statusEl) { statusEl.textContent = error.message || "Could not cancel."; statusEl.className = "profile-save-status is-error"; }
  }
}
if (els.cancelSubBtn) {
  els.cancelSubBtn.addEventListener("click", handleCancelSubscription);
}

// ── Profile Modal ───────────────────────────────────────────

function openProfileModal() {
  if (!state.profile) return;
  const p = state.profile;

  // Avatar initial
  const initial = (p.name || p.email || "?").charAt(0).toUpperCase();
  els.profileAvatar.textContent = initial;
  els.profileModalEmail.textContent = p.email;

  // Fill form fields
  els.profileNameInput.value = p.name || "";
  els.profileEmailInput.value = p.email || "";
  els.profileSaveStatus.textContent = "";
  els.profileSaveStatus.className = "profile-save-status";

  // Language selects
  populateProfileLangSelects();

  // Plan cards
  renderPlanCards();

  els.profileModal.classList.remove("hidden");
  els.profileModal.setAttribute("aria-hidden", "false");
}

function closeProfileModal() {
  els.profileModal.classList.add("hidden");
  els.profileModal.setAttribute("aria-hidden", "true");
}

function populateProfileLangSelects() {
  const prefs = state.preferences || {};
  // Use the same language data already loaded in the main dropdowns
  const copyOptions = (sourceSelect, targetSelect, selectedValue) => {
    targetSelect.innerHTML = "";
    for (const opt of sourceSelect.options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.textContent;
      targetSelect.append(o);
    }
    targetSelect.value = selectedValue || "";
  };
  copyOptions(els.listenerLanguage, els.profileListenerLang, prefs.listenerLanguage);
  copyOptions(els.audiobookLanguage, els.profileAudiobookLang, prefs.audiobookLanguage);
}

async function saveProfileInfo() {
  const name = els.profileNameInput.value.trim();
  const email = els.profileEmailInput.value.trim();
  els.profileSaveStatus.textContent = "Saving...";
  els.profileSaveStatus.className = "profile-save-status";

  try {
    const payload = await fetchJson("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    state.profile = payload.profile;
    els.profileSaveStatus.textContent = "Saved!";
    els.profileSaveStatus.className = "profile-save-status is-ok";
    els.profileModalEmail.textContent = payload.profile.email;
    els.profileAvatar.textContent = (payload.profile.name || payload.profile.email || "?").charAt(0).toUpperCase();
    if (els.topbarUserName) {
      const label = els.topbarUserName.querySelector(".topbar-profile-label");
      if (label) label.textContent = payload.profile.name || payload.profile.email;
    }
    renderProfile(payload.profile, state.localAccessUrls);
  } catch (error) {
    els.profileSaveStatus.textContent = error.message;
    els.profileSaveStatus.className = "profile-save-status is-error";
  }
}

async function saveProfileLanguages() {
  const prefs = {
    listenerLanguage: els.profileListenerLang.value,
    audiobookLanguage: els.profileAudiobookLang.value,
    sourceLanguage: state.preferences?.sourceLanguage || "auto",
    selectedVoiceId: state.preferences?.selectedVoiceId || "storybook",
  };
  els.profileLangStatus.textContent = "Saving...";
  els.profileLangStatus.className = "profile-save-status";

  try {
    const payload = await fetchJson("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    state.preferences = payload.preferences;
    // Sync main dropdowns
    els.listenerLanguage.value = prefs.listenerLanguage;
    els.audiobookLanguage.value = prefs.audiobookLanguage;
    els.profileLangStatus.textContent = "Saved!";
    els.profileLangStatus.className = "profile-save-status is-ok";
  } catch (error) {
    els.profileLangStatus.textContent = error.message;
    els.profileLangStatus.className = "profile-save-status is-error";
  }
}

function renderPlanCards() {
  const plan = state.plan || {};
  const profile = state.profile || {};
  const isPremium = profile.plan === "premium";
  const stripeConfigured = plan.stripeConfigured;
  const freeLimit = plan.freeBookLimit || 1;
  const booksUsed = profile.booksUsed || 0;

  let html = "";

  // Free card
  html += `
    <div class="plan-card ${!isPremium ? "plan-card-active" : ""}">
      ${!isPremium ? '<span class="plan-card-badge plan-card-badge-current">Current</span>' : ""}
      <div class="plan-card-name">Free</div>
      <div class="plan-card-price">€0</div>
      <div class="plan-card-desc">${freeLimit} book from the free library.<br/>Read and listen with full features.</div>
      ${!isPremium ? `<div class="plan-card-desc" style="font-weight:500; color: var(--ink)">${booksUsed}/${freeLimit} books used</div>` : ""}
    </div>`;

  // Monthly card
  html += `
    <div class="plan-card ${isPremium ? "plan-card-active" : ""}">
      ${isPremium ? '<span class="plan-card-badge plan-card-badge-current">Current</span>' : ""}
      <div class="plan-card-name">Premium</div>
      <div class="plan-card-price">€19.99<small>/month</small></div>
      <div class="plan-card-desc">Upload unlimited books.<br/>All languages &amp; voices.</div>
      <div class="plan-card-action">
        ${isPremium
          ? ``
          : stripeConfigured
            ? `<button class="btn btn-primary btn-sm" data-action="upgrade" data-interval="monthly">Upgrade</button>`
            : `<button class="btn btn-outline btn-sm" disabled>Coming soon</button>`
        }
      </div>
    </div>`;

  // Yearly card
  const yearlyAvailable = plan.yearlyAvailable;
  html += `
    <div class="plan-card plan-card-recommended">
      <span class="plan-card-badge plan-card-badge-best">Best value</span>
      <div class="plan-card-name">Premium</div>
      <div class="plan-card-price">€149.99<small>/year</small></div>
      <div class="plan-card-desc">Save 37% — everything in monthly,<br/>billed annually.</div>
      <div class="plan-card-action">
        ${isPremium
          ? ``
          : yearlyAvailable
            ? `<button class="btn btn-primary btn-sm" data-action="upgrade" data-interval="yearly">Upgrade</button>`
            : `<button class="btn btn-outline btn-sm" disabled>Coming soon</button>`
        }
      </div>
    </div>`;

  els.planCards.innerHTML = html;

  // Show/hide cancel button for premium users
  if (els.cancelSubRow) {
    els.cancelSubRow.classList.toggle("hidden", !isPremium);
  }
  if (els.cancelSubStatus) {
    els.cancelSubStatus.textContent = "";
  }
}

// ── Welcome (First Login) ───────────────────────────────────

function maybeShowWelcome() {
  if (!state.profile) return;
  const name = state.profile.name || "";
  const email = state.profile.email || "";
  // Show welcome if name looks like the auto-generated default (email prefix)
  const emailPrefix = email.split("@")[0];
  if (name === emailPrefix || !name) {
    showWelcomeModal();
  }
}

function showWelcomeModal() {
  // Populate language dropdowns
  const prefs = state.preferences || {};
  const copyOptions = (sourceSelect, targetSelect, selectedValue) => {
    targetSelect.innerHTML = "";
    for (const opt of sourceSelect.options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.textContent;
      targetSelect.append(o);
    }
    targetSelect.value = selectedValue || "";
  };
  copyOptions(els.listenerLanguage, els.welcomeListenerLang, prefs.listenerLanguage);
  copyOptions(els.audiobookLanguage, els.welcomeAudiobookLang, prefs.audiobookLanguage);

  els.welcomeName.value = "";
  els.welcomeModal.classList.remove("hidden");
  els.welcomeModal.setAttribute("aria-hidden", "false");
  els.welcomeName.focus();
}

function closeWelcomeModal() {
  els.welcomeModal.classList.add("hidden");
  els.welcomeModal.setAttribute("aria-hidden", "true");
}

async function handleWelcomeSubmit() {
  const name = els.welcomeName.value.trim();
  if (!name) {
    els.welcomeName.focus();
    return;
  }

  // Save name
  try {
    const payload = await fetchJson("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    state.profile = payload.profile;
    if (els.topbarUserName) {
      const label = els.topbarUserName.querySelector(".topbar-profile-label");
      if (label) label.textContent = payload.profile.name || payload.profile.email;
    }
    renderProfile(payload.profile, state.localAccessUrls);
  } catch { /* proceed anyway */ }

  // Save language preferences
  const prefs = {
    listenerLanguage: els.welcomeListenerLang.value,
    audiobookLanguage: els.welcomeAudiobookLang.value,
    sourceLanguage: state.preferences?.sourceLanguage || "auto",
    selectedVoiceId: state.preferences?.selectedVoiceId || "storybook",
  };
  try {
    const payload = await fetchJson("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    state.preferences = payload.preferences;
    els.listenerLanguage.value = prefs.listenerLanguage;
    els.audiobookLanguage.value = prefs.audiobookLanguage;
  } catch { /* proceed anyway */ }

  closeWelcomeModal();
}

// ── Legal pages (inline overlay) ──────────────────────────

const legalCache = {};

async function openLegalPage(page) {
  const overlay = document.getElementById("legal-overlay");
  const content = document.getElementById("legal-overlay-content");
  if (!overlay || !content) return;

  if (!legalCache[page]) {
    try {
      const res = await fetch(`/${page}`);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const container = doc.querySelector(".container");
      // Remove the "back" link since we have a close button
      const backLink = container?.querySelector(".back");
      if (backLink) backLink.remove();
      legalCache[page] = container?.innerHTML || html;
    } catch {
      legalCache[page] = `<h1>Could not load page</h1><p>Please try again later.</p>`;
    }
  }

  content.innerHTML = legalCache[page];
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeLegalPage() {
  const overlay = document.getElementById("legal-overlay");
  if (overlay) overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

window.openLegalPage = openLegalPage;
window.closeLegalPage = closeLegalPage;

async function fetchJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("Could not reach the Voxenor server. Refresh and try again.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const err = new Error(payload.error || `Request failed with status ${response.status}.`);
    err.upgradeRequired = Boolean(payload.upgradeRequired);
    throw err;
  }
  return payload;
}
