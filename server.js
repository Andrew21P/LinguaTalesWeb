import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { promises as fsp } from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import bcrypt from "bcrypt";
import Stripe from "stripe";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import {
  createSession, getSession, deleteSession,
  createUser, getUserByEmail, getUserById, updateUser,
  getUserByStripeCustomerId,
  getUserPreferences, setUserPreferences,
  getSavedWords, addSavedWord, deleteSavedWord,
  linkBookToUser, unlinkBookFromUser, getUserBookIds, isUserBook,
  userHasPremium, getUserBookCount,
  logAnalyticsEvent, getAnalyticsSummary,
} from "./db.js";
import * as s3 from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const pythonBin = process.env.PYTHON_BIN || "python3";
const defaultExaggeration = Number(process.env.DEFAULT_EXAGGERATION || 0.52);
const defaultNarrationSpeed = Number(process.env.DEFAULT_NARRATION_SPEED || 0.78);
const defaultCfgWeight = Number(process.env.DEFAULT_CFG_WEIGHT || 0.28);
const minVoicePromptSeconds = Number(process.env.MIN_VOICE_PROMPT_SECONDS || 2.4);
const readyPageWindow = Math.max(1, Number(process.env.READY_PAGE_WINDOW || 6));

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const uploadsDir = path.join(dataDir, "uploads");
const voicesDir = path.join(dataDir, "voices");
const audioDir = path.join(dataDir, "audio");
const libraryDir = path.join(dataDir, "library");
const tmpDir = path.join(rootDir, "tmp");
const jobsDir = path.join(dataDir, "jobs");
const preferencesPath = path.join(dataDir, "preferences.json");
const appName = "Voxenor";
const configuredTtsBackend = normalizeTtsBackend(process.env.TTS_BACKEND || "piper");
const piperVoiceId = String(process.env.PIPER_VOICE_ID || "pt_PT-tugão-medium").trim() || "pt_PT-tugão-medium";
const piperDownloadDir = process.env.PIPER_DOWNLOAD_DIR || path.join(dataDir, "piper", "voices");
const piperModelPath = process.env.PIPER_MODEL_PATH || path.join(piperDownloadDir, "pt_PT-tugao-medium.onnx");
const piperLengthScale = Number(process.env.PIPER_LENGTH_SCALE || 1.22);
const piperNoiseScale = Number(process.env.PIPER_NOISE_SCALE || 0.5);
const piperNoiseWScale = Number(process.env.PIPER_NOISE_W_SCALE || 0.72);
const piperCatalogCachePath = path.join(dataDir, "piper", "voices-catalog.json");
const piperCatalogUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json?download=true";
const discoverCachePath = path.join(dataDir, "discover-cache.json");

for (const dir of [dataDir, uploadsDir, voicesDir, audioDir, libraryDir, tmpDir, jobsDir, piperDownloadDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 250 * 1024 * 1024,
  },
});

const jobs = new Map();
const voiceRegistry = new Map();
const bookPageTasks = new Map();
const bookPreparationQueues = new Map();
const bookPreparationTargets = new Map();
let chatterboxWorker = null;
let chatterboxWorkerStdoutRemainder = "";
let chatterboxWorkerStderrRemainder = "";
let chatterboxWorkerActiveJob = null;
let chatterboxWorkerQueue = Promise.resolve();
let piperWorker = null;
let piperWorkerStdoutRemainder = "";
let piperWorkerStderrRemainder = "";
let piperWorkerActiveJob = null;
let piperWorkerQueue = Promise.resolve();
let piperVoiceCatalogCache = null;
let piperVoiceCatalogFetchedAt = 0;
let piperVoiceCatalogPromise = null;
const sessionCookieName = "voxenor_session";
const sessionDurationMs = 1000 * 60 * 60 * 24 * 30;
const BCRYPT_ROUNDS = 12;
const FREE_BOOK_LIMIT = 1;
const PREMIUM_PRICE_EUR = 19.99;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

// Stripe — will be null if keys not configured yet.
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripePriceId = process.env.STRIPE_PRICE_ID || "";
const stripePriceIdYearly = process.env.STRIPE_PRICE_ID_YEARLY || "";
const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${port}`;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const sourceLanguageCatalog = [
  { code: "auto", label: "Auto Detect" },
  { code: "pt-pt", label: "Portuguese (Portugal)" },
  { code: "pt-br", label: "Portuguese (Brazil)" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "tr", label: "Turkish" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
];

const listenerLanguageCatalog = sourceLanguageCatalog.filter((language) => language.code !== "auto");
const audiobookLanguageCatalog = [
  { code: "ar-jo", locale: "ar-JO", label: "Arabic" },
  { code: "bg-bg", locale: "bg-BG", label: "Bulgarian" },
  { code: "ca-es", locale: "ca-ES", label: "Catalan" },
  { code: "zh-cn", locale: "zh-CN", label: "Chinese (Mandarin)" },
  { code: "hr-hr", locale: "hr-HR", label: "Croatian" },
  { code: "cs-cz", locale: "cs-CZ", label: "Czech" },
  { code: "da-dk", locale: "da-DK", label: "Danish" },
  { code: "nl-nl", locale: "nl-NL", label: "Dutch" },
  { code: "nl-be", locale: "nl-BE", label: "Dutch (Belgium)" },
  { code: "en-gb", locale: "en-GB", label: "English (UK)" },
  { code: "en-us", locale: "en-US", label: "English (US)" },
  { code: "fi-fi", locale: "fi-FI", label: "Finnish" },
  { code: "fr-fr", locale: "fr-FR", label: "French" },
  { code: "ka-ge", locale: "ka-GE", label: "Georgian" },
  { code: "de-de", locale: "de-DE", label: "German" },
  { code: "el-gr", locale: "el-GR", label: "Greek" },
  { code: "hi-in", locale: "hi-IN", label: "Hindi" },
  { code: "hu-hu", locale: "hu-HU", label: "Hungarian" },
  { code: "is-is", locale: "is-IS", label: "Icelandic" },
  { code: "it-it", locale: "it-IT", label: "Italian" },
  { code: "lv-lv", locale: "lv-LV", label: "Latvian" },
  { code: "no-no", locale: "no-NO", label: "Norwegian" },
  { code: "fa-ir", locale: "fa-IR", label: "Persian" },
  { code: "pl-pl", locale: "pl-PL", label: "Polish" },
  { code: "pt-br", locale: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "pt-pt", locale: "pt-PT", label: "Portuguese (Portugal)" },
  { code: "ro-ro", locale: "ro-RO", label: "Romanian" },
  { code: "ru-ru", locale: "ru-RU", label: "Russian" },
  { code: "sr-rs", locale: "sr-RS", label: "Serbian" },
  { code: "sk-sk", locale: "sk-SK", label: "Slovak" },
  { code: "sl-si", locale: "sl-SI", label: "Slovenian" },
  { code: "es-mx", locale: "es-MX", label: "Spanish (Mexico)" },
  { code: "es-es", locale: "es-ES", label: "Spanish (Spain)" },
  { code: "sw-cd", locale: "sw-CD", label: "Swahili" },
  { code: "sv-se", locale: "sv-SE", label: "Swedish" },
  { code: "tr-tr", locale: "tr-TR", label: "Turkish" },
  { code: "uk-ua", locale: "uk-UA", label: "Ukrainian" },
  { code: "vi-vn", locale: "vi-VN", label: "Vietnamese" },
];

const audiobookLanguageCodes = new Set(audiobookLanguageCatalog.map((l) => l.code));

const builtInVoiceSamples = [
  {
    id: "storybook",
    name: "Default Piper voice",
    language: "auto",
    vibe: "Piper TTS — automatically selects the best voice for the audiobook language",
    builtIn: true,
  },
];

const portuguesePortugalLexicon = [
  ["faixa de pedestres", "passadeira"],
  ["telefone celular", "telemóvel"],
  ["telefones celulares", "telemóveis"],
  ["carteira de motorista", "carta de condução"],
  ["carteiras de motorista", "cartas de condução"],
  ["banheiro", "casa de banho"],
  ["banheiros", "casas de banho"],
  ["garota", "rapariga"],
  ["garotas", "raparigas"],
  ["garoto", "rapaz"],
  ["garotos", "rapazes"],
  ["menina", "rapariga"],
  ["meninas", "raparigas"],
  ["menino", "rapaz"],
  ["meninos", "rapazes"],
  ["ônibus", "autocarro"],
  ["onibus", "autocarro"],
  ["ônibus escolar", "autocarro escolar"],
  ["onibus escolar", "autocarro escolar"],
  ["trem", "comboio"],
  ["trens", "comboios"],
  ["celular", "telemóvel"],
  ["celulares", "telemóveis"],
  ["suco", "sumo"],
  ["sucos", "sumos"],
  ["sorvete", "gelado"],
  ["sorvetes", "gelados"],
  ["xícara", "chávena"],
  ["xicara", "chávena"],
  ["xícaras", "chávenas"],
  ["xicaras", "chávenas"],
  ["açougue", "talho"],
  ["acougue", "talho"],
  ["açougues", "talhos"],
  ["acougues", "talhos"],
  ["time", "equipa"],
  ["times", "equipas"],
  ["moça", "rapariga"],
  ["moço", "rapaz"],
  ["moças", "raparigas"],
  ["moços", "rapazes"],
  ["bobagem", "disparate"],
  ["bobagens", "disparates"],
  ["brocas", "berbequins"],
  ["a maior parte do tempo", "grande parte do tempo"],
  ["em lugar nenhum", "em lado nenhum"],
  ["esse tipo de bobagem", "esse tipo de disparate"],
  ["tipo de bobagem", "tipo de disparate"],
  ["que você esperaria", "que se esperaria"],
  ["as últimas pessoas que você esperaria", "as últimas pessoas que se esperaria"],
  ["não aceitavam esse tipo de", "não compactuavam com esse tipo de"],
];

const portuguesePortugalPossessiveNouns = [
  "amiga",
  "amigas",
  "amigo",
  "amigos",
  "autocarro",
  "autocarros",
  "casa",
  "casa de banho",
  "casas",
  "casas de banho",
  "chavena",
  "chavenas",
  "comboio",
  "comboios",
  "equipa",
  "equipas",
  "família",
  "famílias",
  "filha",
  "filhas",
  "filho",
  "filhos",
  "gelado",
  "gelados",
  "irmã",
  "irmão",
  "irmãos",
  "irmãs",
  "mãe",
  "mães",
  "marido",
  "maridos",
  "nome",
  "nomes",
  "pai",
  "pais",
  "rapariga",
  "raparigas",
  "rapaz",
  "rapazes",
  "sumo",
  "sumos",
  "talho",
  "talhos",
  "telemóvel",
  "telemóveis",
  "vida",
  "vidas",
  "voz",
  "vozes",
];

// Per-user preferences are now in the database. Keep a mutable ref for
// backward compat in functions that still read `userPreferences` (will be
// overridden per-request where appropriate).
let userPreferences = loadUserPreferences();

loadVoiceRegistry();

// ── Security middleware ──────────────────────────────────────

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://www.googletagmanager.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://www.gutenberg.org", "https://covers.openlibrary.org", "https://www.googletagmanager.com"],
      connectSrc: ["'self'", "https://www.google-analytics.com", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com"],
    },
  },
}));

// ── SEO: cache immutable assets aggressively, HTML never ────
app.use((req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".woff2", ".woff", ".ttf"].includes(ext)) {
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");       // 30 days
  } else if ([".css", ".js"].includes(ext) && !req.path.endsWith("app.js")) {
    res.setHeader("Cache-Control", "public, max-age=604800");                    // 7 days
  }
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many attempts. Please try again later." },
});

function sanitizeErrorMessage(error) {
  const msg = error?.message || "An unexpected error occurred.";
  if (/\/|\\|ENOENT|EACCES|TypeError|ReferenceError|SyntaxError/i.test(msg)) {
    return "An unexpected error occurred. Please try again.";
  }
  return msg;
}

function validateBookId(req, res, next) {
  if (!UUID_RE.test(req.params.bookId)) {
    return res.status(400).json({ ok: false, error: "Invalid book ID." });
  }
  return next();
}

// Stripe webhook needs raw body — mount BEFORE express.json().
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !stripeWebhookSecret) {
    return res.status(503).json({ ok: false, error: "Stripe not configured." });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], stripeWebhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          updateUser(userId, {
            stripe_subscription_id: session.subscription,
            subscription_status: sub.status,
            subscription_current_period_end: sub.current_period_end,
            plan: sub.status === "active" || sub.status === "trialing" ? "premium" : "free",
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const user = getUserByStripeCustomerId(sub.customer);
        if (user) {
          const active = sub.status === "active" || sub.status === "trialing";
          updateUser(user.id, {
            stripe_subscription_id: sub.id,
            subscription_status: sub.status,
            subscription_current_period_end: sub.current_period_end,
            plan: active ? "premium" : "free",
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const user = getUserByStripeCustomerId(invoice.customer);
        if (user) {
          updateUser(user.id, { subscription_status: "past_due" });
        }
        break;
      }
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "1mb" }));
app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      // HTML pages: never cache (SPA revalidation)
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store");
      }
      // XML sitemap: short cache
      if (filePath.endsWith("sitemap.xml")) {
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
      }
    },
  })
);
app.use("/audio", requireSession, s3.cacheFillMiddleware(audioDir, "audio/"), express.static(audioDir));
app.use("/voices", requireSession, s3.cacheFillMiddleware(voicesDir, "voices/"), express.static(voicesDir));
app.use("/library-assets", requireSession, s3.cacheFillMiddleware(libraryDir, "library/"), express.static(libraryDir));

// ── Auth Routes ─────────────────────────────────────────────

app.get("/api/session", (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.json({ ok: true, authenticated: false, profile: null });
  }
  const user = getUserById(session.user_id);
  if (!user) {
    clearSessionCookie(res);
    return res.json({ ok: true, authenticated: false, profile: null });
  }
  return res.json({
    ok: true,
    authenticated: true,
    profile: getPublicProfile(user),
  });
});

app.post("/api/session/signup", authLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || "").trim();

  if (!email || !email.includes("@")) {
    return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, error: "Password must be at least 8 characters." });
  }
  if (getUserByEmail(email)) {
    return res.status(409).json({ ok: false, error: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = createUser({ email, passwordHash, name: name || email.split("@")[0] });
  const session = createSession(user.id);
  setSessionCookie(res, session.id, session.expiresAt);
  trackEvent(req, "signup", { email });
  return res.json({
    ok: true,
    authenticated: true,
    profile: getPublicProfile(user),
  });
});

app.post("/api/session/login", authLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  const user = getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Invalid email or password." });
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ ok: false, error: "Invalid email or password." });
  }

  const session = createSession(user.id);
  setSessionCookie(res, session.id, session.expiresAt);
  trackEvent(req, "login", { email: user.email });
  return res.json({
    ok: true,
    authenticated: true,
    profile: getPublicProfile(user),
  });
});

app.post("/api/session/logout", (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) deleteSession(sessionId);
  clearSessionCookie(res);
  return res.json({ ok: true });
});

app.get("/api/meta", requireSession, (req, res) => {
  const user = req.user;
  const dbPrefs = getUserPreferences(user.id);
  const prefs = {
    sourceLanguage: normalizeLanguageCode(dbPrefs?.source_language || "auto"),
    listenerLanguage: normalizeLanguageCode(dbPrefs?.listener_language || "en"),
    audiobookLanguage: normalizeLanguageCode(dbPrefs?.audiobook_language || "pt-pt"),
    selectedVoiceId: dbPrefs?.selected_voice_id || "storybook",
    readerFontSize: dbPrefs?.reader_font_size || "1.22rem",
  };
  // Keep global userPreferences in sync for backward compat helpers.
  userPreferences = { ...userPreferences, ...prefs };
  const effectivePreferences = getEffectiveUserPreferences(userPreferences);
  const savedWords = getSavedWords(user.id).map(dbWordToApi);
  res.json({
    ok: true,
    appName,
    sourceLanguages: sourceLanguageCatalog,
    listenerLanguages: listenerLanguageCatalog,
    audiobookLanguages: audiobookLanguageCatalog,
    fullySupportedLanguages: audiobookLanguageCatalog,
    voiceSamples: [...builtInVoiceSamples, ...getPublicVoiceSamples()],
    profile: getPublicProfile(user),
    preferences: effectivePreferences,
    savedWords,
    localAccessUrls: getLocalAccessUrls(port),
    plan: {
      current: userHasPremium(user) ? "premium" : "free",
      freeBookLimit: FREE_BOOK_LIMIT,
      premiumPriceEur: PREMIUM_PRICE_EUR,
      stripeConfigured: Boolean(stripe && stripePriceId),
      yearlyAvailable: Boolean(stripe && stripePriceIdYearly),
    },
    defaults: {
      exaggeration: defaultExaggeration,
      narrationSpeed: defaultNarrationSpeed,
      cfgWeight: defaultCfgWeight,
    },
    modelInfo: {
      active: getNarrationBackendLabel(getDefaultNarrationEngine()),
      note: getNarrationBackendNote(getDefaultNarrationEngine()),
      backend: getDefaultNarrationEngine(),
      supportsCustomVoiceCloning: narrationBackendSupportsCustomVoiceCloning(getDefaultNarrationEngine()),
      builtinVoiceCatalogId: piperVoiceId,
    },
  });
});

app.get("/api/piper/voices", requireSession, async (_req, res) => {
  try {
    const voices = await getPiperVoiceCatalog();
    return res.json({
      ok: true,
      voices,
      activeVoiceId: piperVoiceId,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.post("/api/book/extract", requireSession, upload.single("bookFile"), async (req, res) => {
  try {
    const manualText = req.body.text?.trim();
    const title = (req.body.title || "Untitled Story").trim();
    const sourceLanguageHint = normalizeLanguageCode(req.body.sourceLanguage || "auto");

    if (manualText) {
      const manualFileName = `${crypto.randomUUID()}.txt`;
      const manualFilePath = path.join(tmpDir, manualFileName);
      await fsp.writeFile(manualFilePath, normalizeText(manualText), "utf8");

      try {
        const extraction = await runPythonJson("scripts/extract_book.py", [
          manualFilePath,
          `${title || "manual-book"}.txt`,
          sourceLanguageHint,
        ]);

        return res.json({
          ok: true,
          title: extraction.title || title,
          text: extraction.text,
          chapters: extraction.chapters?.length
            ? extraction.chapters
            : splitIntoChapters(extraction.text),
          source: "manual",
          detectedLanguage: normalizeLanguageCode(extraction.detectedLanguage || sourceLanguageHint || "pt"),
          ocrUsed: Boolean(extraction.ocrUsed),
        });
      } finally {
        await fsp.rm(manualFilePath, { force: true });
      }
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "Please paste text or upload a PDF, EPUB, TXT, or book photo.",
      });
    }

    const extraction = await runPythonJson("scripts/extract_book.py", [
      req.file.path,
      req.file.originalname,
      sourceLanguageHint,
    ]);

    return res.json({
      ok: true,
      title: extraction.title || title,
      text: extraction.text,
      chapters: extraction.chapters?.length
        ? extraction.chapters
        : splitIntoChapters(extraction.text),
      source: extraction.source || path.extname(req.file.originalname).slice(1),
      detectedLanguage: normalizeLanguageCode(extraction.detectedLanguage || sourceLanguageHint || "pt"),
      ocrUsed: Boolean(extraction.ocrUsed),
    });
  } catch (error) {
    if (req.file?.path) {
      await fsp.rm(req.file.path, { force: true }).catch(() => {});
    }
    return res.status(500).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.post("/api/preferences", requireSession, async (req, res) => {
  try {
    const dbUpdates = {
      source_language: normalizeLanguageCode(req.body?.sourceLanguage || "auto"),
      listener_language: normalizeLanguageCode(req.body?.listenerLanguage || "en"),
      audiobook_language: normalizeLanguageCode(req.body?.audiobookLanguage || "pt-pt"),
      selected_voice_id: String(req.body?.selectedVoiceId || "storybook"),
    };
    if (typeof req.body?.readerFontSize === "string" && /^\d+(\.\d+)?rem$/.test(req.body.readerFontSize)) {
      dbUpdates.reader_font_size = req.body.readerFontSize;
    }
    setUserPreferences(req.user.id, dbUpdates);

    // Keep global userPreferences in sync for backward-compat helpers.
    const updates = {
      sourceLanguage: dbUpdates.source_language,
      listenerLanguage: dbUpdates.listener_language,
      audiobookLanguage: dbUpdates.audiobook_language,
      selectedVoiceId: dbUpdates.selected_voice_id,
    };
    userPreferences = { ...userPreferences, ...updates, updatedAt: new Date().toISOString() };
    userPreferences = getEffectiveUserPreferences(userPreferences);
    await persistUserPreferences();

    return res.json({
      ok: true,
      preferences: userPreferences,
    });
  } catch (error) {
    const statusCode =
      /support custom voice cloning|selected custom voice|voice sample was not found|voice sample is unusable/i.test(
        error.message
      )
        ? 400
        : 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 400 ? error.message : sanitizeErrorMessage(error),
    });
  }
});

app.get("/api/saved-words", requireSession, (req, res) => {
  return res.json({
    ok: true,
    savedWords: getSavedWords(req.user.id).map(dbWordToApi),
  });
});

app.post("/api/saved-words", requireSession, async (req, res) => {
  try {
    const entry = normalizeSavedWordEntry(req.body);
    if (!entry) {
      return res.status(400).json({
        ok: false,
        error: "A source phrase and translation are required.",
      });
    }

    addSavedWord(req.user.id, entry);

    return res.json({
      ok: true,
      savedWord: entry,
      savedWords: getSavedWords(req.user.id).map(dbWordToApi),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.delete("/api/saved-words/:savedWordId", requireSession, async (req, res) => {
  try {
    const savedWordId = String(req.params.savedWordId || "").trim();
    deleteSavedWord(req.user.id, savedWordId);

    return res.json({
      ok: true,
      savedWords: getSavedWords(req.user.id).map(dbWordToApi),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.get("/api/books", requireSession, async (req, res) => {
  try {
    const userBookIds = getUserBookIds(req.user.id);
    if (!userBookIds.length) {
      return res.json({ ok: true, books: [] });
    }
    const books = (await Promise.all(userBookIds.map(id => readLibraryBook(id))))
      .filter(Boolean)
      .sort((a, b) => {
        const at = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
        const bt = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
        return bt - at;
      });
    return res.json({
      ok: true,
      books: books.map(toPublicBookSummary),
    });
  } catch (error) {
    const statusCode =
      /support custom voice cloning|selected custom voice|voice sample was not found|voice sample is unusable/i.test(
        error.message
      )
        ? 400
        : 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 400 ? error.message : sanitizeErrorMessage(error),
    });
  }
});

app.post("/api/books/import", requireSession, upload.single("bookFile"), async (req, res) => {
  try {
    // File uploads (PDF, EPUB, TXT) are premium-only.
    if (req.file && !userHasPremium(req.user)) {
      await fsp.rm(req.file.path, { force: true }).catch(() => {});
      return res.status(403).json({
        ok: false,
        error: "Uploading your own books is a Premium feature. Upgrade to unlock unlimited uploads.",
        upgradeRequired: true,
      });
    }

    // Plan gating: free users can only have FREE_BOOK_LIMIT books.
    if (!userHasPremium(req.user)) {
      const bookCount = getUserBookCount(req.user.id);
      if (bookCount >= FREE_BOOK_LIMIT) {
        return res.status(403).json({
          ok: false,
          error: `Free plan allows ${FREE_BOOK_LIMIT} book. Upgrade to Premium for unlimited books.`,
          upgradeRequired: true,
        });
      }
    }
    const imported = await createLibraryBookFromRequest(req);
    linkBookToUser(req.user.id, imported.book.id);
    trackEvent(req, "book_import", { bookId: imported.book.id, title: imported.book.title, method: req.file ? "upload" : "paste" });
    return res.json({
      ok: true,
      existing: Boolean(imported.existing),
      book: toPublicBook(imported.book),
      page: toPublicBookPage(imported.book, imported.book.progress?.pageIndex || 0),
    });
  } catch (error) {
    if (req.file?.path) {
      await fsp.rm(req.file.path, { force: true }).catch(() => {});
    }
    return res.status(400).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.delete("/api/books/:bookId", requireSession, validateBookId, async (req, res) => {
  try {
    if (!isUserBook(req.user.id, req.params.bookId)) {
      return res.status(404).json({ ok: false, error: "That book was not found." });
    }
    const bookDir = getLibraryBookDir(req.params.bookId);
    const metadataPath = getLibraryBookMetadataPath(req.params.bookId);
    if (!fs.existsSync(bookDir) && !fs.existsSync(metadataPath)) {
      return res.status(404).json({
        ok: false,
        error: "That book was not found.",
      });
    }

    await deleteLibraryBook(req.params.bookId);
    unlinkBookFromUser(req.user.id, req.params.bookId);
    return res.json({
      ok: true,
      deletedBookId: req.params.bookId,
    });
  } catch (error) {
    const statusCode =
      /support custom voice cloning|selected custom voice|voice sample was not found|voice sample is unusable/i.test(
        error.message
      )
        ? 400
        : 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 400 ? error.message : sanitizeErrorMessage(error),
    });
  }
});

app.get("/api/books/:bookId", requireSession, validateBookId, async (req, res) => {
  try {
    if (!isUserBook(req.user.id, req.params.bookId)) {
      return res.status(404).json({ ok: false, error: "That book was not found." });
    }
    const book = await readLibraryBook(req.params.bookId);
    if (!book) {
      return res.status(404).json({
        ok: false,
        error: "That book was not found.",
      });
    }

    return res.json({
      ok: true,
      book: toPublicBook(book),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.get("/api/books/:bookId/pages/:pageIndex", requireSession, validateBookId, async (req, res) => {
  try {
    if (!isUserBook(req.user.id, req.params.bookId)) {
      return res.status(404).json({ ok: false, error: "That book was not found." });
    }
    const book = await readLibraryBook(req.params.bookId);
    if (!book) {
      return res.status(404).json({
        ok: false,
        error: "That book was not found.",
      });
    }

    return res.json({
      ok: true,
      page: toPublicBookPage(book, Number(req.params.pageIndex)),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.delete("/api/books/:bookId/pages/:pageIndex", requireSession, validateBookId, async (req, res) => {
  try {
    if (!isUserBook(req.user.id, req.params.bookId)) {
      return res.status(404).json({ ok: false, error: "That book was not found." });
    }
    const result = await deleteLibraryBookPage(req.params.bookId, Number(req.params.pageIndex));
    return res.json({
      ok: true,
      book: toPublicBook(result.book),
      page: toPublicBookPage(result.book, result.pageIndex),
    });
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 404 ? error.message : sanitizeErrorMessage(error),
    });
  }
});

app.post("/api/books/:bookId/progress", requireSession, validateBookId, async (req, res) => {
  try {
    if (!isUserBook(req.user.id, req.params.bookId)) {
      return res.status(404).json({ ok: false, error: "That book was not found." });
    }
    const book = await readLibraryBook(req.params.bookId);
    if (!book) {
      return res.status(404).json({
        ok: false,
        error: "That book was not found.",
      });
    }

    const pageIndex = clampPageIndex(book, Number(req.body?.pageIndex));
    const audioTime = Math.max(0, Number(req.body?.audioTime || 0));
    book.progress = {
      pageIndex,
      audioTime,
      updatedAt: new Date().toISOString(),
    };
    book.updatedAt = new Date().toISOString();
    await persistLibraryBook(book);

    return res.json({
      ok: true,
      progress: book.progress,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.post("/api/books/:bookId/pages/:pageIndex/prepare", requireSession, validateBookId, async (req, res) => {
  try {
    if (!isUserBook(req.user.id, req.params.bookId)) {
      return res.status(404).json({ ok: false, error: "That book was not found." });
    }
    const prepared = await startLibraryBookPagePreparation({
      bookId: req.params.bookId,
      pageIndex: Number(req.params.pageIndex),
      voiceSampleId: String(req.body?.voiceSampleId || "storybook"),
    });

    return res.status(prepared.started ? 202 : 200).json({
      ok: true,
      started: prepared.started,
      book: toPublicBookSummary(prepared.book),
      page: toPublicBookPage(prepared.book, prepared.pageIndex),
    });
  } catch (error) {
    const statusCode =
      /support custom voice cloning|selected custom voice|voice sample was not found|voice sample is unusable/i.test(
        error.message
      )
        ? 400
        : 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 400 ? error.message : sanitizeErrorMessage(error),
    });
  }
});

app.post("/api/voice-sample", requireSession, upload.single("voiceSample"), async (req, res) => {
  let finalPath = "";
  let metadataPath = "";
  let sourcePath = "";
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "No voice sample was uploaded.",
      });
    }

    const id = crypto.randomUUID();
    const fileName = `${id}.wav`;
    finalPath = path.join(voicesDir, fileName);
    metadataPath = path.join(voicesDir, `${id}.json`);
    const sourceExt = extensionForMime(req.file.mimetype, req.file.originalname);
    sourcePath = path.join(voicesDir, `${id}.source${sourceExt}`);

    await fsp.rename(req.file.path, sourcePath);
    const promptInfo = await transcodeVoiceSampleToWav(sourcePath, finalPath);

    const voiceSample = {
      id,
      name: req.body.name?.trim() || "My Voice Sample",
      language: normalizeLanguageCode(req.body.language?.trim() || "pt-pt"),
      url: `/voices/${fileName}`,
      path: finalPath,
      originalPath: sourcePath,
      promptDuration: promptInfo.duration,
      builtIn: false,
      vibe: "Uploaded custom clone sample",
    };

    registerVoiceSample(voiceSample);
    await fsp.writeFile(metadataPath, JSON.stringify(voiceSample, null, 2), "utf8");
    if (s3.isConfigured()) {
      s3.upload(sourcePath, dataDir).catch(() => {});
      s3.upload(finalPath, dataDir).catch(() => {});
      s3.upload(metadataPath, dataDir).catch(() => {});
    }

    return res.json({
      ok: true,
      voiceSample: toPublicVoiceSample(voiceSample),
    });
  } catch (error) {
    await Promise.allSettled([
      req.file?.path ? fsp.rm(req.file.path, { force: true }) : Promise.resolve(),
      sourcePath ? fsp.rm(sourcePath, { force: true }) : Promise.resolve(),
      finalPath ? fsp.rm(finalPath, { force: true }) : Promise.resolve(),
      metadataPath ? fsp.rm(metadataPath, { force: true }) : Promise.resolve(),
    ]);
    return res.status(400).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.delete("/api/voice-sample/:voiceSampleId", requireSession, async (req, res) => {
  try {
    const voiceSampleId = String(req.params.voiceSampleId || "").trim();
    if (!voiceSampleId || !UUID_RE.test(voiceSampleId)) {
      return res.status(400).json({
        ok: false,
        error: "A voice sample id is required.",
      });
    }

    if (builtInVoiceSamples.some((sample) => sample.id === voiceSampleId)) {
      return res.status(400).json({
        ok: false,
        error: "Built-in voice profiles cannot be deleted.",
      });
    }

    const voiceSample = resolveVoiceSample(voiceSampleId);
    if (!voiceSample) {
      return res.status(404).json({
        ok: false,
        error: "That voice sample was not found.",
      });
    }

    await deleteVoiceSampleAssets(voiceSample);

    return res.json({
      ok: true,
      deletedVoiceSampleId: voiceSampleId,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

app.post("/api/audiobook/generate", requireSession, async (req, res) => {
  const {
    title,
    text,
    sourceLanguage,
    listenerLanguage,
    audiobookLanguage,
    voiceSampleId,
    exaggeration,
    cfgWeight,
  } = req.body || {};

  if (!text?.trim()) {
    return res.status(400).json({
      ok: false,
      error: "A book text is required before generating audio.",
    });
  }

  const narrationRequest = resolveNarrationRequest({
    voiceSampleId: String(voiceSampleId || "storybook"),
    voiceSamplePath: resolveVoiceSample(voiceSampleId)?.path || "",
  });
  if (voiceSampleId && voiceSampleId !== "storybook" && !narrationBackendSupportsCustomVoiceCloning(narrationRequest.engine)) {
    return res.status(400).json({
      ok: false,
      error:
        "Piper does not support custom voice cloning. Use the built-in voice, or switch TTS_BACKEND=chatterbox for slower clone experiments.",
    });
  }

  const resolvedVoiceSample = resolveVoiceSample(voiceSampleId)
    ? await ensureVoiceSamplePrompt(resolveVoiceSample(voiceSampleId))
    : null;
  if (voiceSampleId && !resolvedVoiceSample) {
    return res.status(400).json({
      ok: false,
      error: "The selected voice sample was not found anymore. Upload it again and retry.",
    });
  }

  const id = crypto.randomUUID();
  const job = {
    id,
    status: "queued",
    title: (title || "Untitled Story").trim(),
    createdAt: new Date().toISOString(),
    progress: 0,
    logs: ["Queued local generation job."],
    audioUrl: null,
    error: null,
  };

  jobs.set(id, job);
  persistJob(id, job).catch(() => {});

  const jobDir = path.join(jobsDir, id);
  await fsp.mkdir(jobDir, { recursive: true });
  const inputTextPath = path.join(jobDir, "book.txt");
  const outputWavPath = path.join(audioDir, `${id}.wav`);
  const metadataPath = path.join(jobDir, "alignment.json");

  await fsp.writeFile(inputTextPath, normalizeText(text), "utf8");

  res.json({
    ok: true,
    jobId: id,
  });

  runGenerationJob({
    jobId: id,
    title: job.title,
    inputTextPath,
    outputWavPath,
    metadataPath,
    sourceLanguage: normalizeLanguageCode(sourceLanguage || "auto"),
    listenerLanguage: normalizeLanguageCode(listenerLanguage || "en"),
    language: normalizeLanguageCode(audiobookLanguage || "pt-pt"),
    voiceSampleId: String(voiceSampleId || "storybook"),
    voiceSamplePath: resolvedVoiceSample?.path || "",
    exaggeration: Number(exaggeration ?? defaultExaggeration),
    narrationSpeed: Number(defaultNarrationSpeed),
    cfgWeight: Number(cfgWeight ?? defaultCfgWeight),
  }).catch(async (error) => {
    const failedJob = jobs.get(id);
    if (!failedJob) {
      return;
    }
    failedJob.status = "failed";
    failedJob.error = error.message;
    failedJob.logs.push(error.message);
    await persistJob(id, failedJob);
  });
});

app.get("/api/audiobook/status/:jobId", requireSession, async (req, res) => {
  const jobId = req.params.jobId;
  if (!UUID_RE.test(jobId)) {
    return res.status(400).json({ ok: false, error: "Invalid job ID." });
  }
  const memoryJob = jobs.get(jobId);
  if (memoryJob) {
    return res.json({ ok: true, job: memoryJob });
  }

  const jobPath = path.join(jobsDir, jobId, "job.json");
  if (!fs.existsSync(jobPath)) {
    return res.status(404).json({
      ok: false,
      error: "Job not found.",
    });
  }

  const job = JSON.parse(await fsp.readFile(jobPath, "utf8"));
  return res.json({ ok: true, job });
});

app.post("/api/translate", requireSession, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    const source = String(req.body?.source || "auto").trim();
    const target = String(req.body?.target || "en").trim();

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "Text is required for translation.",
      });
    }

    if (text.length > 50000) {
      return res.status(413).json({
        ok: false,
        error: "Text is too long for translation. Please use a shorter selection.",
      });
    }

    const result = await translateText({
      text,
      source,
      target,
    });
    const normalizedTarget = normalizeLanguageCode(target);
    const translatedText =
      normalizedTarget === "pt-pt"
        ? normalizePortugueseForPortugal(result.translatedText, source)
        : result.translatedText;

    return res.json({
      ok: true,
      ...result,
      translatedText,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizeErrorMessage(error),
    });
  }
});

/* ── Project Gutenberg discover cache (via Gutendex) ── */

const discoverCache = new Map();
const discoverInflight = new Map();
const DISCOVER_TTL = 24 * 60 * 60 * 1000;
const DISCOVER_CATEGORIES = ["popular", "fiction", "science fiction", "fantasy", "mystery", "philosophy", "history", "poetry"];
const GUTENDEX = "https://gutendex.com/books";

// Load persisted cache from disk
try {
  if (fs.existsSync(discoverCachePath)) {
    const saved = JSON.parse(fs.readFileSync(discoverCachePath, "utf8"));
    for (const [key, val] of Object.entries(saved)) {
      // Migrate old cache keys (e.g. "popular" → "popular:1")
      const newKey = key.includes(":") ? key : `${key}:1`;
      // Migrate old format { ts, books } → { ts, books, hasMore, total, page }
      if (val.books && val.hasMore === undefined) {
        val.hasMore = false;
        val.total = val.books.length;
        val.page = 1;
      }
      discoverCache.set(newKey, val);
    }
    console.log(`Loaded discover cache from disk (${discoverCache.size} entries)`);
  }
} catch { /* ignore corrupt cache */ }

function persistDiscoverCache() {
  const obj = Object.fromEntries(discoverCache);
  fs.writeFile(discoverCachePath, JSON.stringify(obj), () => {});
}

function flipAuthorName(name) {
  const parts = name.split(", ");
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
}

function normalizeGutenberg(b) {
  return {
    id: b.id,
    title: b.title,
    authors: (b.authors || []).map((a) => flipAuthorName(a.name)),
    coverUrl: b.formats?.["image/jpeg"] || null,
    textUrl: b.formats?.["text/plain; charset=utf-8"] || b.formats?.["text/plain; charset=us-ascii"] || null,
    year: (b.authors?.[0]?.birth_year || null),
    subjects: (b.subjects || []).slice(0, 5),
    summary: (b.summaries || [])[0] || "",
  };
}

async function _doFetchCategory(topic, page = 1) {
  const cacheKey = `${topic}:${page}`;
  try {
    const params = new URLSearchParams({ copyright: "false", languages: "en", sort: "popular", page: String(page) });
    if (topic !== "popular") params.set("topic", topic);
    const res = await fetch(`${GUTENDEX}?${params}`);
    const data = await res.json();
    const books = (data.results || []).map(normalizeGutenberg);
    const result = { ts: Date.now(), books, hasMore: !!data.next, total: data.count || 0, page };
    discoverCache.set(cacheKey, result);
    persistDiscoverCache();
    return result;
  } catch {
    const cached = discoverCache.get(cacheKey);
    return cached || { books: [], hasMore: false, total: 0, page };
  } finally {
    discoverInflight.delete(cacheKey);
  }
}

function fetchDiscoverCategory(topic, page = 1) {
  const cacheKey = `${topic}:${page}`;
  const cached = discoverCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DISCOVER_TTL) return Promise.resolve(cached);

  // Deduplicate in-flight requests
  let pending = discoverInflight.get(cacheKey);
  if (!pending) {
    pending = _doFetchCategory(topic, page);
    discoverInflight.set(cacheKey, pending);
  }
  return pending;
}

function prefetchAllDiscoverCategories() {
  for (const cat of DISCOVER_CATEGORIES) {
    fetchDiscoverCategory(cat).catch(() => {});
  }
}

// Prefetch on startup
prefetchAllDiscoverCategories();
// Refresh every 24h
setInterval(prefetchAllDiscoverCategories, DISCOVER_TTL);

app.get("/api/discover/:topic", requireSession, async (req, res) => {
  const topic = req.params.topic;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  try {
    const result = await fetchDiscoverCategory(topic, page);
    res.json({ ok: true, books: result.books, hasMore: result.hasMore, total: result.total, page: result.page });
  } catch {
    res.status(502).json({ ok: false, error: "Could not reach Project Gutenberg." });
  }
});

app.get("/api/discover-search", requireSession, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ ok: true, books: [], hasMore: false, total: 0, page: 1 });
  const page = Math.max(1, parseInt(req.query.page) || 1);

  const cacheKey = `search_${q.toLowerCase()}:${page}`;
  const cached = discoverCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DISCOVER_TTL) {
    return res.json({ ok: true, books: cached.books, hasMore: cached.hasMore, total: cached.total, page: cached.page });
  }

  try {
    const params = new URLSearchParams({ search: q, copyright: "false", languages: "en", page: String(page) });
    const apiRes = await fetch(`${GUTENDEX}?${params}`);
    const data = await apiRes.json();
    const books = (data.results || []).map(normalizeGutenberg);
    const result = { ts: Date.now(), books, hasMore: !!data.next, total: data.count || 0, page };
    discoverCache.set(cacheKey, result);
    persistDiscoverCache();
    res.json({ ok: true, books: result.books, hasMore: result.hasMore, total: result.total, page: result.page });
  } catch {
    res.status(502).json({ ok: false, error: "Search failed." });
  }
});

app.post("/api/books/import-gutenberg", requireSession, async (req, res) => {
  // Plan gating
  if (!userHasPremium(req.user)) {
    const bookCount = getUserBookCount(req.user.id);
    if (bookCount >= FREE_BOOK_LIMIT) {
      return res.status(403).json({
        ok: false,
        error: `Free plan allows ${FREE_BOOK_LIMIT} book. Upgrade to Premium for unlimited books.`,
        upgradeRequired: true,
      });
    }
  }
  const { title, textUrl, coverUrl } = req.body || {};
  try {
    const parsedUrl = new URL(String(textUrl || ""));
    if (parsedUrl.hostname !== "www.gutenberg.org" || parsedUrl.protocol !== "https:") {
      return res.status(400).json({ ok: false, error: "Invalid Gutenberg URL." });
    }
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid Gutenberg URL." });
  }
  try {
    const textRes = await fetch(String(textUrl));
    if (!textRes.ok) throw new Error("Could not download book text.");
    const rawText = await textRes.text();

    // Build a fake request object compatible with createLibraryBookFromRequest
    const fakeReq = {
      body: {
        title: String(title || "Untitled Book").trim(),
        text: rawText,
        sourceLanguage: "en",
        listenerLanguage: req.body.listenerLanguage || userPreferences.listenerLanguage || "en",
        audiobookLanguage: req.body.audiobookLanguage || userPreferences.audiobookLanguage || "pt-pt",
        skipAudiobook: req.body.skipAudiobook || false,
      },
      file: null,
      _gutenbergCoverUrl: coverUrl || "",
    };
    const imported = await createLibraryBookFromRequest(fakeReq);
    linkBookToUser(req.user.id, imported.book.id);
    trackEvent(req, "book_import", { bookId: imported.book.id, title: imported.book.title, method: "gutenberg" });
    return res.json({
      ok: true,
      existing: Boolean(imported.existing),
      book: toPublicBook(imported.book),
      page: toPublicBookPage(imported.book, imported.book.progress?.pageIndex || 0),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: sanitizeErrorMessage(error) });
  }
});

// ── Profile Update ──────────────────────────────────────────

app.post("/api/profile", requireSession, (req, res) => {
  const updates = {};
  if (typeof req.body?.name === "string") {
    const name = req.body.name.trim();
    if (!name || name.length > 100) {
      return res.status(400).json({ ok: false, error: "Name must be 1–100 characters." });
    }
    updates.name = name;
  }
  if (typeof req.body?.email === "string") {
    const email = req.body.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "Please provide a valid email." });
    }
    const existing = getUserByEmail(email);
    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ ok: false, error: "That email is already in use." });
    }
    updates.email = email;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error: "Nothing to update." });
  }
  updateUser(req.user.id, updates);
  const user = getUserById(req.user.id);
  return res.json({ ok: true, profile: getPublicProfile(user) });
});

// ── Stripe Billing Routes ───────────────────────────────────

app.post("/api/billing/checkout", requireSession, async (req, res) => {
  if (!stripe || !stripePriceId) {
    return res.status(503).json({ ok: false, error: "Payments are not configured yet." });
  }
  const user = req.user;
  const interval = req.body?.interval;
  const selectedPrice = (interval === "yearly" && stripePriceIdYearly) ? stripePriceIdYearly : stripePriceId;
  try {
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
      customerId = customer.id;
      updateUser(user.id, { stripe_customer_id: customerId });
    } else {
      // Verify the stored customer still exists (may be from test mode).
      try { await stripe.customers.retrieve(customerId); } catch {
        const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
        customerId = customer.id;
        updateUser(user.id, { stripe_customer_id: customerId });
      }
    }
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: selectedPrice, quantity: 1 }],
      success_url: `${appBaseUrl}/?upgraded=true`,
      cancel_url: `${appBaseUrl}/?upgraded=cancelled`,
      metadata: { userId: user.id },
    });
    return res.json({ ok: true, url: session.url });
  } catch (error) {
    return res.status(500).json({ ok: false, error: sanitizeErrorMessage(error) });
  }
});

app.post("/api/billing/portal", requireSession, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ ok: false, error: "Payments are not configured yet." });
  }
  const user = req.user;
  if (!user.stripe_customer_id) {
    return res.status(400).json({ ok: false, error: "No billing account found." });
  }
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${appBaseUrl}/`,
    });
    return res.json({ ok: true, url: session.url });
  } catch (error) {
    return res.status(500).json({ ok: false, error: sanitizeErrorMessage(error) });
  }
});

app.get("/api/billing/status", requireSession, (req, res) => {
  const user = getUserById(req.user.id);
  return res.json({
    ok: true,
    plan: userHasPremium(user) ? "premium" : "free",
    subscriptionStatus: user.subscription_status || "none",
    freeBookLimit: FREE_BOOK_LIMIT,
    booksUsed: getUserBookCount(req.user.id),
  });
});

app.post("/api/billing/cancel", requireSession, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ ok: false, error: "Payments are not configured yet." });
  }
  const user = getUserById(req.user.id);
  if (!user.stripe_subscription_id) {
    return res.status(400).json({ ok: false, error: "No active subscription to cancel." });
  }
  try {
    await stripe.subscriptions.cancel(user.stripe_subscription_id);
    updateUser(user.id, {
      plan: "free",
      subscription_status: "canceled",
      stripe_subscription_id: "",
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: sanitizeErrorMessage(error) });
  }
});

// ── Admin Analytics ─────────────────────────────────────────

app.get("/api/admin/analytics", requireSession, requireAdmin, (_req, res) => {
  const data = getAnalyticsSummary();
  return res.json({ ok: true, ...data });
});

app.post("/api/analytics/event", requireSession, (req, res) => {
  const { event, payload } = req.body || {};
  if (!event || typeof event !== "string") {
    return res.status(400).json({ ok: false, error: "Missing event name." });
  }
  const allowed = ["page_read", "audio_play", "word_saved", "book_opened", "upgrade_modal_shown"];
  if (!allowed.includes(event)) {
    return res.status(400).json({ ok: false, error: "Unknown event." });
  }
  trackEvent(req, event, typeof payload === "object" && payload ? payload : {});
  return res.json({ ok: true });
});

// ── Legal pages ─────────────────────────────────────────────

app.get("/admin", requireSession, requireAdmin, (_req, res) => res.sendFile(path.join(publicDir, "admin.html")));
app.get("/terms", (_req, res) => res.sendFile(path.join(publicDir, "terms.html")));
app.get("/privacy", (_req, res) => res.sendFile(path.join(publicDir, "privacy.html")));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, host, async () => {
  console.log(`Voxenor listening on http://${host}:${port}`);
  if (s3.isConfigured()) {
    console.log("S3 object storage configured — syncing library index.");
    await s3.syncLibraryIndex(libraryDir, dataDir).catch((err) => console.error("S3 sync error:", err.message));
  }
});

async function runGenerationJob(config) {
  const job = jobs.get(config.jobId);
  if (!job) {
    return;
  }

  const narrationRequest = resolveNarrationRequest({
    voiceSampleId: config.voiceSampleId,
    voiceSamplePath: config.voiceSamplePath,
  });

  job.status = "running";
  job.progress = 5;
  job.logs.push(`Preparing ${getNarrationBackendLabel(narrationRequest.engine)} generation.`);
  job.sourceLanguage = config.sourceLanguage;
  job.listenerLanguage = config.listenerLanguage;
  job.audiobookLanguage = config.language;
  job.narrationEngine = narrationRequest.engine;
  await persistJob(config.jobId, job);

  let effectiveInputTextPath = config.inputTextPath;
  const originalText = await fsp.readFile(config.inputTextPath, "utf8");
  let workingText = originalText;
  let readerLanguage = config.sourceLanguage === "auto" ? config.language : config.sourceLanguage;

  if (
    config.sourceLanguage &&
    config.sourceLanguage !== "auto" &&
    normalizeTranslationProviderLanguage(config.sourceLanguage) !==
      normalizeTranslationProviderLanguage(config.language)
  ) {
    job.logs.push(
      `Translating the book from ${config.sourceLanguage.toUpperCase()} to ${config.language.toUpperCase()} before narration.`
    );
    job.progress = 8;
    await persistJob(config.jobId, job);

    workingText = await translateLongText({
      text: workingText,
      source: config.sourceLanguage,
      target: config.language,
      onProgress: async ({ percent, message }) => {
        const latestJob = jobs.get(config.jobId);
        if (!latestJob) {
          return;
        }
        latestJob.progress = Math.max(latestJob.progress || 0, Math.min(14, 8 + Math.round(percent * 0.06)));
        latestJob.logs.push(message);
        await persistJob(config.jobId, latestJob);
      },
    });

    if (normalizeLanguageCode(config.language) === "pt-pt") {
      workingText = normalizePortugueseForPortugal(workingText, config.sourceLanguage);
    }

    readerLanguage = config.language;
  }

  if (workingText !== originalText) {
    const normalizedTextPath = path.join(path.dirname(config.inputTextPath), "book.normalized.txt");
    await fsp.writeFile(normalizedTextPath, workingText, "utf8");
    effectiveInputTextPath = normalizedTextPath;
  }

  job.readerText = workingText;
  job.readerChapters = splitIntoChapters(workingText);
  job.readerLanguage = readerLanguage;
  await persistJob(config.jobId, job);

  await runNarrationGeneration({
    inputTextPath: effectiveInputTextPath,
    outputWavPath: config.outputWavPath,
    metadataPath: config.metadataPath,
    language: config.language,
    voiceSampleId: config.voiceSampleId,
    voiceSamplePath: config.voiceSamplePath,
    exaggeration: config.exaggeration,
    narrationSpeed: config.narrationSpeed,
    cfgWeight: config.cfgWeight,
  }, {
    onLine: async (line) => {
      const latestJob = jobs.get(config.jobId);
      if (!latestJob) {
        return;
      }

      if (line.startsWith("PROGRESS:")) {
        const payload = line.slice("PROGRESS:".length);
        const [percentRaw, ...messageParts] = payload.split("|");
        latestJob.progress = Number(percentRaw) || latestJob.progress;
        if (messageParts.length) {
          latestJob.logs.push(messageParts.join("|"));
        }
      } else {
        const sanitizedLine = sanitizeJobLogLine(line);
        if (sanitizedLine) {
          latestJob.logs.push(sanitizedLine);
        }
      }

      await persistJob(config.jobId, latestJob);
    },
  });

  job.status = "done";
  job.progress = 100;
  job.logs.push("Audiobook is ready.");
  job.audioUrl = `/audio/${path.basename(config.outputWavPath)}`;
  if (fs.existsSync(config.metadataPath)) {
    job.alignment = JSON.parse(await fsp.readFile(config.metadataPath, "utf8"));
    if (job.alignment?.preparedText) {
      job.readerText = job.alignment.preparedText;
      job.readerChapters = splitIntoChapters(job.readerText);
    }
  }
  if (s3.isConfigured() && fs.existsSync(config.outputWavPath)) {
    s3.upload(config.outputWavPath, dataDir).catch((err) => console.error("S3 upload error:", err.message));
  }
  await persistJob(config.jobId, job);
}

async function persistJob(id, job) {
  const dir = path.join(jobsDir, id);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, "job.json"), JSON.stringify(job, null, 2));
}

async function runPythonJson(scriptRelativePath, args = []) {
  const fullScriptPath = path.join(rootDir, scriptRelativePath);
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [fullScriptPath, ...args], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || "Python script failed."));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse script output: ${error.message}`));
      }
    });
  });
}

async function runPythonStreaming(args, handlers = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const emitLines = async (buffer, sourceName) => {
      const lines = buffer.split(/\r?\n/);
      const remainder = lines.pop() || "";
      for (const line of lines) {
        if (handlers.onLine) {
          await handlers.onLine(line.trim(), sourceName);
        }
      }
      return remainder;
    };

    let stdoutRemainder = "";
    let stderrRemainder = "";

    child.stdout.on("data", async (chunk) => {
      stdoutRemainder = await emitLines(stdoutRemainder + chunk.toString(), "stdout");
    });

    child.stderr.on("data", async (chunk) => {
      stderrRemainder = await emitLines(stderrRemainder + chunk.toString(), "stderr");
    });

    child.on("close", async (code) => {
      if (stdoutRemainder && handlers.onLine) {
        await handlers.onLine(stdoutRemainder.trim(), "stdout");
      }
      if (stderrRemainder && handlers.onLine) {
        await handlers.onLine(stderrRemainder.trim(), "stderr");
      }
      if (code !== 0) {
        reject(new Error(stderrRemainder.trim() || "Audiobook generation failed."));
        return;
      }
      resolve();
    });
  });
}

function buildGenerateChatterboxArgs(config) {
  const args = [
    path.join(rootDir, "scripts", "generate_audiobook.py"),
    "--input",
    config.inputTextPath,
    "--output",
    config.outputWavPath,
    "--metadata-output",
    config.metadataPath,
    "--language",
    normalizeNarrationModelLanguage(config.language),
    "--exaggeration",
    String(config.exaggeration),
    "--speed",
    String(config.narrationSpeed),
    "--cfg-weight",
    String(config.cfgWeight),
  ];

  if (config.voiceSamplePath) {
    args.push("--voice-sample", config.voiceSamplePath);
  }

  return args;
}

function buildGeneratePiperArgs(config) {
  return [
    path.join(rootDir, "scripts", "generate_audiobook_piper.py"),
    "--input",
    config.inputTextPath,
    "--output",
    config.outputWavPath,
    "--metadata-output",
    config.metadataPath,
    "--language",
    normalizeNarrationModelLanguage(config.language),
    "--speed",
    String(config.narrationSpeed),
    "--voice-id",
    resolvePiperVoiceForLanguage(config.language).voiceId,
    "--model-path",
    resolvePiperVoiceForLanguage(config.language).modelPath,
    "--download-dir",
    piperDownloadDir,
    "--length-scale",
    String(piperLengthScale),
    "--noise-scale",
    String(piperNoiseScale),
    "--noise-w-scale",
    String(piperNoiseWScale),
  ];
}

async function runChatterboxGeneration(config, handlers = {}) {
  try {
    await runWarmChatterboxJob(
      {
        input: config.inputTextPath,
        output: config.outputWavPath,
        metadata_output: config.metadataPath,
        language: normalizeNarrationModelLanguage(config.language),
        voice_sample: config.voiceSamplePath || "",
        exaggeration: config.exaggeration,
        speed: config.narrationSpeed,
        cfg_weight: config.cfgWeight,
      },
      handlers
    );
  } catch (error) {
    if (!String(error.code || "").startsWith("WORKER_")) {
      throw error;
    }
    if (handlers.onLine) {
      await handlers.onLine("Warm Chatterbox worker restarted. Falling back to one-shot generation for this job.", "worker");
    }
    await runPythonStreaming(buildGenerateChatterboxArgs(config), handlers);
  }
}

async function runPiperGeneration(config, handlers = {}) {
  if (config.voiceSamplePath) {
    throw new Error(
      "Custom voice cloning is not supported in Piper. Use the built-in voice, or switch TTS_BACKEND=chatterbox for slow clone experiments."
    );
  }

  const resolvedVoice = resolvePiperVoiceForLanguage(config.language);
  try {
    await runWarmPiperJob(
      {
        input: config.inputTextPath,
        output: config.outputWavPath,
        metadata_output: config.metadataPath,
        language: normalizeNarrationModelLanguage(config.language),
        voice_sample: "",
        speed: config.narrationSpeed,
        voice_id: resolvedVoice.voiceId,
        model_path: resolvedVoice.modelPath,
        download_dir: piperDownloadDir,
        length_scale: piperLengthScale,
        noise_scale: piperNoiseScale,
        noise_w_scale: piperNoiseWScale,
      },
      handlers
    );
  } catch (error) {
    if (!String(error.code || "").startsWith("WORKER_")) {
      throw error;
    }
    if (handlers.onLine) {
      await handlers.onLine("Warm Piper worker restarted. Falling back to one-shot generation for this job.", "worker");
    }
    await runPythonStreaming(buildGeneratePiperArgs(config), handlers);
  }
}

async function runNarrationGeneration(config, handlers = {}) {
  const narrationRequest = resolveNarrationRequest({
    voiceSampleId: config.voiceSampleId,
    voiceSamplePath: config.voiceSamplePath,
  });

  if (narrationRequest.engine === "piper") {
    await runPiperGeneration(config, handlers);
    return narrationRequest;
  }

  await runChatterboxGeneration(config, handlers);
  return narrationRequest;
}

function ensureWarmChatterboxWorker() {
  if (chatterboxWorker && chatterboxWorker.exitCode === null && !chatterboxWorker.killed) {
    return chatterboxWorker;
  }

  chatterboxWorkerStdoutRemainder = "";
  chatterboxWorkerStderrRemainder = "";
  chatterboxWorker = spawn(pythonBin, [path.join(rootDir, "scripts", "chatterbox_worker.py")], {
    cwd: rootDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  chatterboxWorker.stdout.on("data", async (chunk) => {
    chatterboxWorkerStdoutRemainder = await consumeWarmWorkerBuffer(
      chatterboxWorkerStdoutRemainder + chunk.toString(),
      "stdout"
    );
  });

  chatterboxWorker.stderr.on("data", async (chunk) => {
    chatterboxWorkerStderrRemainder = await consumeWarmWorkerBuffer(
      chatterboxWorkerStderrRemainder + chunk.toString(),
      "stderr"
    );
  });

  chatterboxWorker.on("close", async (code) => {
    const activeJob = chatterboxWorkerActiveJob;
    chatterboxWorker = null;
    chatterboxWorkerActiveJob = null;

    if (chatterboxWorkerStdoutRemainder) {
      await dispatchWarmWorkerLine(chatterboxWorkerStdoutRemainder.trim(), "stdout");
      chatterboxWorkerStdoutRemainder = "";
    }
    if (chatterboxWorkerStderrRemainder) {
      await dispatchWarmWorkerLine(chatterboxWorkerStderrRemainder.trim(), "stderr");
      chatterboxWorkerStderrRemainder = "";
    }

    if (activeJob) {
      const error = new Error(`Chatterbox worker exited unexpectedly with code ${code ?? "unknown"}.`);
      error.code = "WORKER_EXITED";
      activeJob.reject(error);
    }
  });

  return chatterboxWorker;
}

async function consumeWarmWorkerBuffer(buffer, sourceName) {
  const lines = buffer.split(/\r?\n/);
  const remainder = lines.pop() || "";
  for (const line of lines) {
    await dispatchWarmWorkerLine(line.trim(), sourceName);
  }
  return remainder;
}

async function dispatchWarmWorkerLine(line, sourceName) {
  if (!line) {
    return;
  }

  const activeJob = chatterboxWorkerActiveJob;
  if (!activeJob) {
    return;
  }

  if (sourceName === "stdout") {
    try {
      const event = JSON.parse(line);
      if (event.type === "progress") {
        if (activeJob.handlers.onLine) {
          await activeJob.handlers.onLine(`PROGRESS:${event.percent}|${event.message}`, "worker");
        }
        return;
      }
      if (event.type === "log") {
        if (activeJob.handlers.onLine) {
          await activeJob.handlers.onLine(event.message, "worker");
        }
        return;
      }
      if (event.type === "done") {
        chatterboxWorkerActiveJob = null;
        activeJob.resolve();
        return;
      }
      if (event.type === "error") {
        const error = new Error(event.message || "Audiobook generation failed.");
        error.code = "JOB_FAILED";
        chatterboxWorkerActiveJob = null;
        activeJob.reject(error);
        return;
      }
    } catch {
      // Treat non-JSON stdout as a plain log line.
    }
  }

  if (activeJob.handlers.onLine) {
    await activeJob.handlers.onLine(line, sourceName);
  }
}

async function runWarmChatterboxJob(payload, handlers = {}) {
  const queuedRun = chatterboxWorkerQueue.then(
    () =>
      new Promise((resolve, reject) => {
        const worker = ensureWarmChatterboxWorker();
        chatterboxWorkerActiveJob = { resolve, reject, handlers };
        worker.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
          if (!error) {
            return;
          }
          const activeJob = chatterboxWorkerActiveJob;
          chatterboxWorkerActiveJob = null;
          const workerError = new Error(error.message);
          workerError.code = "WORKER_WRITE_FAILED";
          if (activeJob) {
            activeJob.reject(workerError);
          } else {
            reject(workerError);
          }
        });
      })
  );

  chatterboxWorkerQueue = queuedRun.catch(() => {});
  return queuedRun;
}

function ensureWarmPiperWorker() {
  if (piperWorker && piperWorker.exitCode === null && !piperWorker.killed) {
    return piperWorker;
  }

  piperWorkerStdoutRemainder = "";
  piperWorkerStderrRemainder = "";
  piperWorker = spawn(pythonBin, [path.join(rootDir, "scripts", "piper_worker.py")], {
    cwd: rootDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  piperWorker.stdout.on("data", async (chunk) => {
    piperWorkerStdoutRemainder = await consumeWarmPiperBuffer(piperWorkerStdoutRemainder + chunk.toString(), "stdout");
  });

  piperWorker.stderr.on("data", async (chunk) => {
    piperWorkerStderrRemainder = await consumeWarmPiperBuffer(piperWorkerStderrRemainder + chunk.toString(), "stderr");
  });

  piperWorker.on("close", async (code) => {
    const activeJob = piperWorkerActiveJob;
    piperWorker = null;
    piperWorkerActiveJob = null;

    if (piperWorkerStdoutRemainder) {
      await dispatchWarmPiperLine(piperWorkerStdoutRemainder.trim(), "stdout");
      piperWorkerStdoutRemainder = "";
    }
    if (piperWorkerStderrRemainder) {
      await dispatchWarmPiperLine(piperWorkerStderrRemainder.trim(), "stderr");
      piperWorkerStderrRemainder = "";
    }

    if (activeJob) {
      const error = new Error(`Piper worker exited unexpectedly with code ${code ?? "unknown"}.`);
      error.code = "WORKER_EXITED";
      activeJob.reject(error);
    }
  });

  return piperWorker;
}

async function consumeWarmPiperBuffer(buffer, sourceName) {
  const lines = buffer.split(/\r?\n/);
  const remainder = lines.pop() || "";
  for (const line of lines) {
    await dispatchWarmPiperLine(line.trim(), sourceName);
  }
  return remainder;
}

async function dispatchWarmPiperLine(line, sourceName) {
  if (!line) {
    return;
  }

  const activeJob = piperWorkerActiveJob;
  if (!activeJob) {
    return;
  }

  if (sourceName === "stdout") {
    try {
      const event = JSON.parse(line);
      if (event.type === "progress") {
        if (activeJob.handlers.onLine) {
          await activeJob.handlers.onLine(`PROGRESS:${event.percent}|${event.message}`, "worker");
        }
        return;
      }
      if (event.type === "done") {
        piperWorkerActiveJob = null;
        activeJob.resolve();
        return;
      }
      if (event.type === "error") {
        const error = new Error(event.message || "Audiobook generation failed.");
        error.code = "JOB_FAILED";
        piperWorkerActiveJob = null;
        activeJob.reject(error);
        return;
      }
    } catch {
      // Treat non-JSON stdout as a plain log line.
    }
  }

  if (activeJob.handlers.onLine) {
    await activeJob.handlers.onLine(line, sourceName);
  }
}

async function runWarmPiperJob(payload, handlers = {}) {
  const queuedRun = piperWorkerQueue.then(
    () =>
      new Promise((resolve, reject) => {
        const worker = ensureWarmPiperWorker();
        piperWorkerActiveJob = { resolve, reject, handlers };
        worker.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
          if (!error) {
            return;
          }
          const activeJob = piperWorkerActiveJob;
          piperWorkerActiveJob = null;
          const workerError = new Error(error.message);
          workerError.code = "WORKER_WRITE_FAILED";
          if (activeJob) {
            activeJob.reject(workerError);
          } else {
            reject(workerError);
          }
        });
      })
  );

  piperWorkerQueue = queuedRun.catch(() => {});
  return queuedRun;
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeExtractedBookText(text) {
  const rawText = normalizeText(text).replace(/\t+/g, " ");
  if (!rawText) {
    return "";
  }

  const blocks = rawText.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const normalizedBlocks = blocks.map((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (!lines.length) {
      return "";
    }

    if (lines.length <= 4 && lines.every(looksLikeHeadingLine)) {
      return lines.join("\n");
    }

    return lines.join(" ");
  });

  const mergedBlocks = [];
  for (const block of normalizedBlocks.filter(Boolean)) {
    const previousBlock = mergedBlocks.at(-1) || "";
    if (shouldMergeNormalizedBookBlocks(previousBlock, block)) {
      mergedBlocks[mergedBlocks.length - 1] = `${previousBlock} ${block}`.replace(/\s{2,}/g, " ").trim();
      continue;
    }
    mergedBlocks.push(block);
  }

  return repairCommonBookExtractionArtifacts(mergedBlocks.join("\n\n").trim());
}

function looksLikeHeadingLine(line) {
  const letters = String(line || "").replace(/[^\p{L}]/gu, "");
  return Boolean(letters) && letters === letters.toUpperCase() && letters.length <= 80;
}

function shouldMergeNormalizedBookBlocks(previousBlock, currentBlock) {
  if (!previousBlock || !currentBlock) {
    return false;
  }

  if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Sra|Dra|Doutor|Doutora)\.$/u.test(previousBlock)) {
    return true;
  }

  return !/[.!?…:]"?$/u.test(previousBlock) && /^[a-zà-ÿ]/iu.test(currentBlock);
}

function repairCommonBookExtractionArtifacts(text) {
  return normalizeText(text)
    .replace(/\br\.\s+and\s+Mrs\.(?=\s|$)/giu, "Mr. and Mrs.")
    .replace(/\br\.\s+e\s+a\s+Sra\.(?=\s|$)/giu, "Sr. e a Sra.")
    .replace(/\br\.\s+e\s+a\s+Senhora(?=\s|$)/giu, "Senhor e a Senhora")
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
  if (audiobookLanguageCodes.has(code)) {
    return code;
  }
  if (code === "pt") {
    return "pt";
  }
  return code.split("-")[0];
}

function normalizeNarrationModelLanguage(language) {
  const code = normalizeLanguageCode(language);
  // Piper text normalization uses bare language codes
  return code.split("-")[0];
}

// Default Piper voice IDs per audiobook language (best available for each)
const defaultPiperVoices = {
  "pt-pt": "pt_PT-tugão-medium",
  "pt-br": "pt_BR-faber-medium",
  "en-us": "en_US-lessac-medium",
  "en-gb": "en_GB-cori-medium",
  "es-es": "es_ES-sharvard-medium",
  "es-mx": "es_MX-ald-medium",
  "fr-fr": "fr_FR-siwis-medium",
  "de-de": "de_DE-thorsten-medium",
  "it-it": "it_IT-riccardo-x_low",
  "nl-nl": "nl_NL-mls-medium",
  "nl-be": "nl_BE-nathalie-medium",
  "sv-se": "sv_SE-nst-medium",
  "no-no": "no_NO-talesyntese-medium",
  "da-dk": "da_DK-talesyntese-medium",
  "fi-fi": "fi_FI-harri-medium",
  "pl-pl": "pl_PL-darkman-medium",
  "ru-ru": "ru_RU-irina-medium",
  "uk-ua": "uk_UA-ukrainian_tts-medium",
  "cs-cz": "cs_CZ-jirka-medium",
  "hu-hu": "hu_HU-anna-medium",
  "ro-ro": "ro_RO-mihai-medium",
  "bg-bg": "bg_BG-equinox-medium",
  "sk-sk": "sk_SK-lili-medium",
  "sl-si": "sl_SI-artur-medium",
  "sr-rs": "sr_RS-serbski_institut-medium",
  "el-gr": "el_GR-rapunzelina-low",
  "tr-tr": "tr_TR-dfki-medium",
  "ar-jo": "ar_JO-kareem-medium",
  "fa-ir": "fa_IR-amir-medium",
  "hi-in": "hi_IN-mad_dogs-medium",
  "zh-cn": "zh_CN-huayan-medium",
  "vi-vn": "vi_VN-vivos-x_low",
  "ka-ge": "ka_GE-natia-medium",
  "ca-es": "ca_ES-upc_ona-medium",
  "is-is": "is_IS-bui-medium",
  "lv-lv": "lv_LV-aivars-medium",
  "sw-cd": "sw_CD-lanfrica-medium",
};

function resolvePiperVoiceForLanguage(language) {
  const code = normalizeLanguageCode(language);
  // Try exact match first, then fall back to default
  const voiceId = defaultPiperVoices[code] || piperVoiceId;
  const sanitizedId = voiceId.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-");
  const modelPath = path.join(piperDownloadDir, `${sanitizedId}.onnx`);
  return { voiceId, modelPath };
}

function normalizeTranslationProviderLanguage(language) {
  const code = normalizeLanguageCode(language);
  const provider = getTranslationProvider();
  if (provider === "google-web") {
    if (code === "pt-pt") {
      return "pt-PT";
    }
    if (code === "pt-br") {
      return "pt-BR";
    }
    // Google Translate uses bare language codes for most languages
    return code.split("-")[0];
  }
  if (code === "pt-br" || code === "pt-pt") {
    return "pt";
  }
  return code.split("-")[0];
}

function getTranslationProvider() {
  if (process.env.LIBRETRANSLATE_URL) {
    return "libretranslate";
  }
  return process.env.DEFAULT_TRANSLATION_PROVIDER || "google-web";
}

function normalizeTtsBackend(backend) {
  const normalized = String(backend || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
  if (normalized === "chatterbox") {
    return "chatterbox";
  }
  if (normalized === "auto") {
    return "auto";
  }
  return "piper";
}

function getDefaultNarrationEngine() {
  if (configuredTtsBackend === "auto") {
    return "piper";
  }
  return configuredTtsBackend;
}

function narrationBackendSupportsCustomVoiceCloning(engine) {
  return engine === "chatterbox";
}

function getNarrationBackendLabel(engine) {
  if (engine === "piper") {
    return "Piper PT-PT CPU fast path";
  }
  return "Chatterbox Multilingual clone path";
}

function getNarrationBackendNote(engine) {
  if (engine === "piper") {
    return "Portuguese (Portugal) narration is running on a CPU-friendly Piper voice for fast VPS generation. Custom voice cloning is not available in this fast path.";
  }
  return "Portuguese narration is using the heavier Chatterbox multilingual clone path. It sounds richer with custom prompts, but it is much slower on CPU-only machines.";
}

async function getPiperVoiceCatalog() {
  const cacheTtlMs = 1000 * 60 * 60 * 12;
  if (piperVoiceCatalogCache && Date.now() - piperVoiceCatalogFetchedAt < cacheTtlMs) {
    return piperVoiceCatalogCache;
  }

  if (piperVoiceCatalogPromise) {
    return piperVoiceCatalogPromise;
  }

  piperVoiceCatalogPromise = (async () => {
    try {
      const response = await fetch(piperCatalogUrl, {
        headers: {
          "User-Agent": "Voxenor/1.0",
        },
      });
      if (!response.ok) {
        throw new Error(`Official Piper catalog returned ${response.status}.`);
      }
      const payload = await response.json();
      const normalizedCatalog = normalizePiperVoiceCatalog(payload);
      piperVoiceCatalogCache = normalizedCatalog;
      piperVoiceCatalogFetchedAt = Date.now();
      await fsp.writeFile(
        piperCatalogCachePath,
        JSON.stringify(
          {
            fetchedAt: new Date(piperVoiceCatalogFetchedAt).toISOString(),
            voices: normalizedCatalog,
          },
          null,
          2
        ),
        "utf8"
      );
      return normalizedCatalog;
    } catch (error) {
      const cachedCatalog = await readCachedPiperVoiceCatalog();
      if (cachedCatalog.length) {
        piperVoiceCatalogCache = cachedCatalog;
        piperVoiceCatalogFetchedAt = Date.now();
        return cachedCatalog;
      }
      const fallbackCatalog = [buildFallbackPiperVoiceCatalogEntry()];
      piperVoiceCatalogCache = fallbackCatalog;
      piperVoiceCatalogFetchedAt = Date.now();
      return fallbackCatalog;
    } finally {
      piperVoiceCatalogPromise = null;
    }
  })();

  return piperVoiceCatalogPromise;
}

async function readCachedPiperVoiceCatalog() {
  if (!fs.existsSync(piperCatalogCachePath)) {
    return [];
  }

  try {
    const payload = JSON.parse(await fsp.readFile(piperCatalogCachePath, "utf8"));
    return Array.isArray(payload?.voices) ? payload.voices : [];
  } catch {
    return [];
  }
}

function normalizePiperVoiceCatalog(payload) {
  const entries = Object.values(payload || {});
  return entries
    .map((entry) => {
      const language = entry.language || {};
      const appLanguageCode = normalizePiperLanguageCode(language.code || "");
      const isDefaultVoice = String(entry.key || "") === piperVoiceId;
      return {
        key: String(entry.key || ""),
        name: formatPiperVoiceName(entry.name || entry.key || "Voice"),
        quality: String(entry.quality || "").toLowerCase() || "medium",
        languageCode: appLanguageCode,
        languageLabel: language.name_english || language.name_native || language.code || "Unknown",
        countryLabel: language.country_english || "",
        speakers: Number(entry.num_speakers || 1),
        selectable: true,
        compatible: true,
        installed: isDefaultVoice,
        active: isDefaultVoice,
      };
    })
    .filter((entry) => entry.key)
    .sort((left, right) => {
      const leftLanguage = `${left.languageLabel} ${left.countryLabel}`.trim();
      const rightLanguage = `${right.languageLabel} ${right.countryLabel}`.trim();
      return (
        Number(right.active) - Number(left.active) ||
        Number(right.compatible) - Number(left.compatible) ||
        leftLanguage.localeCompare(rightLanguage) ||
        left.name.localeCompare(right.name) ||
        left.quality.localeCompare(right.quality)
      );
    });
}

function buildFallbackPiperVoiceCatalogEntry() {
  return {
    key: piperVoiceId,
    name: "Tugão",
    quality: "medium",
    languageCode: "pt-pt",
    languageLabel: "Portuguese",
    countryLabel: "Portugal",
    speakers: 1,
    selectable: true,
    compatible: true,
    installed: true,
    active: true,
  };
}

function normalizePiperLanguageCode(languageCode) {
  const normalized = String(languageCode || "")
    .trim()
    .replaceAll("_", "-")
    .toLowerCase();
  if (normalized === "pt-pt" || normalized === "pt-br") {
    return normalized;
  }
  if (normalized.includes("-")) {
    return normalized;
  }
  return normalizeLanguageCode(normalized);
}

function getBuiltInPiperVoiceName(voiceKey) {
  const metadata = parsePiperVoiceKey(voiceKey);
  return metadata.name;
}

function getBuiltInPiperVoiceQuality(voiceKey) {
  const metadata = parsePiperVoiceKey(voiceKey);
  return metadata.quality;
}

function parsePiperVoiceKey(voiceKey) {
  const normalized = String(voiceKey || "").trim();
  if (!normalized) {
    return {
      name: "Piper Voice",
      quality: "medium",
    };
  }

  const pieces = normalized.split("-");
  const quality = pieces.length > 1 ? pieces[pieces.length - 1] : "medium";
  const nameParts = pieces.length > 2 ? pieces.slice(1, -1) : pieces.slice(1);
  const rawName = nameParts.join("_") || normalized;

  return {
    name: formatPiperVoiceName(rawName),
    quality,
  };
}

function formatPiperVoiceName(name) {
  const label = String(name || "").trim();
  if (!label) {
    return "Voice";
  }
  if (label.includes("_")) {
    return label
      .split("_")
      .map((part) => (part ? `${part.slice(0, 1).toUpperCase()}${part.slice(1)}` : part))
      .join(" ");
  }
  return `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
}

function resolveNarrationRequest({ voiceSampleId, voiceSamplePath }) {
  const voiceKey = resolveBookVoiceKey(voiceSampleId);
  if (configuredTtsBackend === "chatterbox") {
    return { engine: "chatterbox", voiceKey };
  }
  if (configuredTtsBackend === "piper") {
    return { engine: "piper", voiceKey };
  }
  if (voiceSamplePath || voiceKey !== "storybook") {
    return { engine: "chatterbox", voiceKey };
  }
  return { engine: "piper", voiceKey };
}

function splitIntoChapters(text) {
  const chapterRegex = /(?:^|\n{2,})(chapter\s+\d+|cap[ií]tulo\s+\d+|part\s+\d+|parte\s+\d+|prologue|epilogue)[^\n]*/gim;
  const matches = [...text.matchAll(chapterRegex)];

  if (!matches.length) {
    return [
      {
        title: "Complete Text",
        content: text,
      },
    ];
  }

  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = matches[index + 1]?.index || text.length;
    return {
      title: match[0].trim(),
      content: text.slice(start, end).trim(),
    };
  });
}

const ALLOWED_AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".webm", ".m4a", ".ogg", ".flac", ".aac"]);

function extensionForMime(mime, originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  if (ext && ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
    return ext;
  }
  if (mime === "audio/webm") {
    return ".webm";
  }
  if (mime === "audio/wav" || mime === "audio/x-wav") {
    return ".wav";
  }
  if (mime === "audio/mpeg") {
    return ".mp3";
  }
  if (mime === "audio/mp4") {
    return ".m4a";
  }
  return ".bin";
}

function sanitizeJobLogLine(line) {
  if (!line) {
    return null;
  }

  const ignoredPatterns = [
    /^Sampling:/,
    /^Fetching \d+ files:/,
    /^loaded PerthNet/,
    /^\/Users\/.*FutureWarning:/,
    /^.*return_dict_in_generate/,
    /^.*torch\.backends\.cuda\.sdp_kernel/,
    /^deprecate\(/,
    /^warnings\.warn\(/,
    /^self\.gen = func/,
    /^LlamaModel is using/,
    /^We detected that you are passing/,
    /^WARNING:chatterbox\.models\.t3\.inference\.alignment_stream_analyzer:/,
  ];

  if (ignoredPatterns.some((pattern) => pattern.test(line))) {
    return null;
  }

  return line;
}

async function transcodeVoiceSampleToWav(inputPath, outputPath) {
  const aggressiveFilters = [
    "silenceremove=start_periods=1:start_silence=0.18:start_threshold=-42dB:stop_periods=-1:stop_silence=0.22:stop_threshold=-42dB",
    "highpass=f=65",
    "lowpass=f=15800",
    "afftdn=nr=7:nf=-34",
    "equalizer=f=3200:t=q:w=1.1:g=1.2",
    "equalizer=f=7600:t=q:w=1.0:g=1.0",
    "acompressor=threshold=-19dB:ratio=1.9:attack=8:release=72:makeup=1.4",
    "alimiter=limit=0.96",
  ].join(",");
  const safeFilters = [
    "highpass=f=65",
    "lowpass=f=15600",
    "afftdn=nr=5:nf=-35",
    "equalizer=f=3000:t=q:w=1.2:g=0.9",
    "equalizer=f=7200:t=q:w=1.1:g=0.8",
    "acompressor=threshold=-20dB:ratio=1.75:attack=10:release=82:makeup=1.1",
    "alimiter=limit=0.96",
  ].join(",");

  await runFfmpegAudioTranscode(inputPath, outputPath, aggressiveFilters);
  let audioInfo = await inspectAudioFile(outputPath);
  if (isUsableVoicePrompt(audioInfo)) {
    return audioInfo;
  }

  await fsp.rm(outputPath, { force: true });
  await runFfmpegAudioTranscode(inputPath, outputPath, safeFilters);
  audioInfo = await inspectAudioFile(outputPath);
  if (isUsableVoicePrompt(audioInfo)) {
    return audioInfo;
  }

  await fsp.rm(outputPath, { force: true });
  throw new Error(
    "Your voice sample became too short or too silent after cleanup. Record 6 to 15 seconds in a quiet room and speak continuously, then upload it again."
  );
}

async function ensureVoiceSamplePrompt(voiceSample) {
  if (!voiceSample?.path) {
    return null;
  }

  if (path.extname(voiceSample.path).toLowerCase() === ".wav" && fs.existsSync(voiceSample.path)) {
    const audioInfo = await inspectAudioFile(voiceSample.path);
    if (isUsableVoicePrompt(audioInfo)) {
      return voiceSample;
    }
    if (voiceSample.originalPath && fs.existsSync(voiceSample.originalPath)) {
      const repairedInfo = await transcodeVoiceSampleToWav(voiceSample.originalPath, voiceSample.path);
      const repairedVoiceSample = {
        ...voiceSample,
        promptDuration: repairedInfo.duration,
      };
      registerVoiceSample(repairedVoiceSample);
      await fsp.writeFile(
        path.join(voicesDir, `${voiceSample.id}.json`),
        JSON.stringify(repairedVoiceSample, null, 2),
        "utf8"
      );
      return repairedVoiceSample;
    }
    throw new Error("Your saved voice sample is unusable now. Please record or upload it again.");
  }

  const normalizedPath = path.join(voicesDir, `${voiceSample.id}.wav`);
  const promptInfo = await transcodeVoiceSampleToWav(voiceSample.path, normalizedPath);

  const normalizedVoiceSample = {
    ...voiceSample,
    path: normalizedPath,
    url: `/voices/${voiceSample.id}.wav`,
    promptDuration: promptInfo.duration,
  };

  registerVoiceSample(normalizedVoiceSample);
  await fsp.writeFile(
    path.join(voicesDir, `${voiceSample.id}.json`),
    JSON.stringify(normalizedVoiceSample, null, 2),
    "utf8"
  );

  return normalizedVoiceSample;
}

async function runFfmpegAudioTranscode(inputPath, outputPath, filterChain) {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-af",
    filterChain,
    "-ac",
    "1",
    "-ar",
    "24000",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}

async function inspectAudioFile(audioPath) {
  if (!fs.existsSync(audioPath)) {
    return {
      exists: false,
      duration: 0,
      size: 0,
    };
  }

  const stats = await fsp.stat(audioPath).catch(() => ({ size: 0 }));
  const duration = await probeAudioDuration(audioPath);

  return {
    exists: true,
    duration,
    size: Number(stats.size || 0),
  };
}

function isUsableVoicePrompt(audioInfo) {
  return Boolean(audioInfo?.exists && audioInfo.size > 2048 && audioInfo.duration >= minVoicePromptSeconds);
}

async function probeAudioDuration(audioPath) {
  return new Promise((resolve) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audioPath,
      ],
      {
        cwd: rootDir,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("close", () => {
      const duration = Number.parseFloat(stdout.trim());
      resolve(Number.isFinite(duration) ? duration : 0);
    });
  });
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${command} failed.`));
        return;
      }
      resolve();
    });
  });
}

async function translateText({ text, source, target }) {
  const provider = getTranslationProvider();
  const normalizedSource = normalizeTranslationProviderLanguage(source || "auto");
  const normalizedTarget = normalizeTranslationProviderLanguage(target || "pt-pt");

  const libretranslateUrl = process.env.LIBRETRANSLATE_URL;
  const libretranslateKey = process.env.LIBRETRANSLATE_API_KEY;

  if (libretranslateUrl) {
    const response = await fetch(`${libretranslateUrl.replace(/\/$/, "")}/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: text,
        source: normalizedSource,
        target: normalizedTarget,
        api_key: libretranslateKey || undefined,
        format: "text",
      }),
    });

    if (!response.ok) {
      throw new Error(`LibreTranslate returned ${response.status}.`);
    }

    const payload = await response.json();
    return {
      provider: "libretranslate",
      translatedText: payload.translatedText,
    };
  }

  if (provider === "google-web") {
    const translation = await translateWithGoogleWeb({
      text,
      source: normalizedSource,
      target: normalizedTarget,
    });
    if (translationNeedsRetry(translation.translatedText, normalizedSource, normalizedTarget)) {
      const retriedTranslation = await translateWithGoogleWeb({
        text,
        source: normalizedSource,
        target: normalizedTarget,
      });
      if (!translationNeedsRetry(retriedTranslation.translatedText, normalizedSource, normalizedTarget)) {
        return retriedTranslation;
      }
    }
    return translation;
  }

  if (provider !== "mymemory") {
    throw new Error("Translation provider is not configured.");
  }

  const langPair = `${normalizedSource === "auto" ? "en" : normalizedSource}|${normalizedTarget}`;
  const endpoint = new URL("https://api.mymemory.translated.net/get");
  endpoint.searchParams.set("q", text);
  endpoint.searchParams.set("langpair", langPair);

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Translation service returned ${response.status}.`);
  }

  const payload = await response.json();
  const translatedText =
    payload?.responseData?.translatedText ||
    payload?.matches?.find((item) => item.translation)?.translation;

  if (!translatedText) {
    throw new Error("Translation service did not return a result.");
  }

  return {
    provider: "mymemory",
    translatedText,
  };
}

async function translateWithGoogleWeb({ text, source, target }) {
  const filePath = path.join(tmpDir, `${crypto.randomUUID()}.translate.txt`);
  await fsp.writeFile(filePath, text, "utf8");
  try {
    return await runPythonJson("scripts/translate_text.py", [filePath, source, target]);
  } finally {
    await fsp.rm(filePath, { force: true });
  }
}

function translationNeedsRetry(translatedText, source, target) {
  if (!translatedText?.trim()) {
    return true;
  }

  if (normalizeLanguageCode(target) === "pt-pt") {
    return ptPortugalTranslationNeedsRetry(translatedText);
  }

  if (target !== "pt") {
    return false;
  }

  const englishLeakPattern =
    /\b(?:hello|this|that|with|saved|page|library|check|first|second|boy|lived|street|number)\b/iu;
  const portugueseSignalPattern =
    /\b(?:o|a|os|as|um|uma|para|com|não|esta|está|primeira|página|biblioteca|olá|número|senhor)\b/iu;

  if ((source === "ru" || source === "uk" || source === "en") && englishLeakPattern.test(translatedText)) {
    return !portugueseSignalPattern.test(translatedText) || englishLeakPattern.test(translatedText.split(/[.!?]/)[0] || "");
  }

  return false;
}

async function translateLongText({ text, source, target, onProgress }) {
  const normalizedText = normalizeText(text);
  const normalizedSource = normalizeTranslationProviderLanguage(source);
  const normalizedTarget = normalizeTranslationProviderLanguage(target);
  if (!normalizedText || normalizedSource === normalizedTarget) {
    return normalizedText;
  }

  const chunks = chunkTextForTranslation(normalizedText);
  const translatedChunks = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const progressPercent = Math.round(((index + 1) / chunks.length) * 100);
    const { translatedText } = await translateText({
      text: chunk,
      source: normalizedSource,
      target: normalizedTarget,
    });
    translatedChunks.push(translatedText.trim());
    if (onProgress) {
      await onProgress({
        percent: progressPercent,
        message: `Translated section ${index + 1} of ${chunks.length}.`,
      });
    }
  }

  return normalizeText(translatedChunks.join("\n\n"));
}

function chunkTextForTranslation(text, maxChunkLength = 1200) {
  const paragraphs = normalizeText(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let currentChunk = "";
  for (const paragraph of paragraphs) {
    const candidate = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChunkLength) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (paragraph.length <= maxChunkLength) {
      currentChunk = paragraph;
      continue;
    }

    const sentences = paragraph.match(/[^.!?]+[.!?]?/g) || [paragraph];
    let sentenceChunk = "";
    for (const sentence of sentences) {
      const sentenceCandidate = sentenceChunk ? `${sentenceChunk} ${sentence.trim()}` : sentence.trim();
      if (sentenceCandidate.length <= maxChunkLength) {
        sentenceChunk = sentenceCandidate;
      } else {
        if (sentenceChunk) {
          chunks.push(sentenceChunk);
        }
        sentenceChunk = sentence.trim();
      }
    }
    currentChunk = sentenceChunk;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length ? chunks : [normalizeText(text)];
}

function normalizePortugueseForPortugal(text, sourceLanguage = "auto") {
  const normalizedSource = normalizeLanguageCode(sourceLanguage);
  if (!text?.trim()) {
    return "";
  }

  let normalized = normalizeText(text);
  if (normalizedSource === "pt-pt") {
    return normalized;
  }

  const orderedLexicon = [...portuguesePortugalLexicon].sort((left, right) => right[0].length - left[0].length);
  for (const [sourceTerm, targetTerm] of orderedLexicon) {
    normalized = replaceWholePhrase(normalized, sourceTerm, targetTerm);
  }

  normalized = injectPortuguesePossessiveArticles(normalized);
  normalized = normalized
    .replace(/\bpara você\b/giu, (match) => applySourceCasing(match, "para ti"))
    .replace(/\bcom você\b/giu, (match) => applySourceCasing(match, "contigo"))
    .replace(/\bde você\b/giu, (match) => applySourceCasing(match, "de ti"))
    .replace(/\bem você\b/giu, (match) => applySourceCasing(match, "em ti"))
    .replace(/\ba você\b/giu, (match) => applySourceCasing(match, "a ti"))
    .replace(/\bpor você\b/giu, (match) => applySourceCasing(match, "por ti"))
    .replace(/\bque você\b/giu, (match) => applySourceCasing(match, "que tu"))
    .replace(/\bse você\b/giu, (match) => applySourceCasing(match, "se tu"))
    .replace(/\bquando você\b/giu, (match) => applySourceCasing(match, "quando tu"))
    .replace(/\bonde você\b/giu, (match) => applySourceCasing(match, "onde tu"))
    .replace(/\bcomo você\b/giu, (match) => applySourceCasing(match, "como tu"))
    .replace(/\bo que você\b/giu, (match) => applySourceCasing(match, "o que tu"))
    .replace(/\bnão é\?/giu, "pois não?")
    .replace(/\br\.\s+e\s+a\s+(sra\.|senhora)\b/giu, "o senhor e a senhora")
    .replace(/\bSra\.(?=\s|$)/giu, (match) => applySourceCasing(match, "Senhora"))
    .replace(/\bSr\.(?=\s|$)/giu, (match) => applySourceCasing(match, "Senhor"))
    .replace(/\bDra\.(?=\s|$)/giu, (match) => applySourceCasing(match, "Doutora"))
    .replace(/\bDr\.(?=\s|$)/giu, (match) => applySourceCasing(match, "Doutor"))
    .replace(/\bque eles eram\b/giu, "que eram")
    .replace(/\beles eram as últimas pessoas\b/giu, "eram as últimas pessoas")
    .replace(/\bque estivessem envolvidas\b/giu, "que se metessem")
    .replace(/\bestavam orgulhosos de dizer\b/giu, "orgulhavam-se de dizer")
    .replace(/\bse esticando\b/giu, (match) => applySourceCasing(match, "esticando-se"))
    .replace(/\btelemovel\b/giu, (match) => applySourceCasing(match, "telemóvel"))
    .replace(/\btelemoveis\b/giu, (match) => applySourceCasing(match, "telemóveis"))
    .replace(/\bchavena\b/giu, (match) => applySourceCasing(match, "chávena"))
    .replace(/\bchavenas\b/giu, (match) => applySourceCasing(match, "chávenas"))
    .replace(/\bconducao\b/giu, (match) => applySourceCasing(match, "condução"))
    .replace(/\bfamilia\b/giu, (match) => applySourceCasing(match, "família"))
    .replace(/\birma\b/giu, (match) => applySourceCasing(match, "irmã"))
    .replace(/\birmas\b/giu, (match) => applySourceCasing(match, "irmãs"))
    .replace(/\bmae\b/giu, (match) => applySourceCasing(match, "mãe"))
    .replace(/\bmaes\b/giu, (match) => applySourceCasing(match, "mães"))
    .replace(/\bnumero\b/giu, (match) => applySourceCasing(match, "número"))
    .replace(/\bvocê não tem\b/giu, (match) => applySourceCasing(match, "não tens"))
    .replace(/\bvocê tem\b/giu, (match) => applySourceCasing(match, "tens"))
    .replace(/\bvocê sabe\b/giu, (match) => applySourceCasing(match, "sabes"))
    .replace(/\bvocê via\b/giu, (match) => applySourceCasing(match, "vias"))
    .replace(/\bvocê viu\b/giu, (match) => applySourceCasing(match, "viste"))
    .replace(/\bvocê deveria\b/giu, (match) => applySourceCasing(match, "deverias"))
    .replace(/\bvocê podia\b/giu, (match) => applySourceCasing(match, "podias"))
    .replace(/\bvocê pode\b/giu, (match) => applySourceCasing(match, "podes"))
    .replace(/\bvocê quer\b/giu, (match) => applySourceCasing(match, "queres"))
    .replace(/\bvocê queria\b/giu, (match) => applySourceCasing(match, "querias"))
    .replace(/\bvocê consegue\b/giu, (match) => applySourceCasing(match, "consegues"))
    .replace(/\bvocê conseguia\b/giu, (match) => applySourceCasing(match, "conseguias"))
    .replace(/\bvocê está\b/giu, (match) => applySourceCasing(match, "estás"))
    .replace(/\bvocê era\b/giu, (match) => applySourceCasing(match, "eras"))
    .replace(/\bvocê foi\b/giu, (match) => applySourceCasing(match, "foste"))
    .replace(/\bvocê vai\b/giu, (match) => applySourceCasing(match, "vais"))
    .replace(/\bvocê gostaria\b/giu, (match) => applySourceCasing(match, "gostarias"))
    .replace(/\bvoce\b/giu, (match) => applySourceCasing(match, "tu"))
    .replace(/\bvocê\b/giu, (match) => applySourceCasing(match, "tu"));

  return normalized
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function replaceWholePhrase(text, sourceTerm, targetTerm) {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}])${escapeRegex(sourceTerm).replaceAll(" ", "\\s+")}(?![\\p{L}\\p{M}\\p{N}])`,
    "giu"
  );
  return text.replace(pattern, (match) => applySourceCasing(match, targetTerm));
}

function injectPortuguesePossessiveArticles(text) {
  const nounPattern = portuguesePortugalPossessiveNouns
    .sort((left, right) => right.length - left.length)
    .map((noun) => escapeRegex(noun).replaceAll(" ", "\\s+"))
    .join("|");
  const possessivePattern = new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}])(seu|sua|seus|suas)\\s+(${nounPattern})(?![\\p{L}\\p{M}\\p{N}])`,
    "giu"
  );

  return text.replace(possessivePattern, (match, pronoun, noun, offset, fullText) => {
    const before = fullText.slice(Math.max(0, offset - 8), offset).toLowerCase();
    if (
      /\b(?:a|o|as|os|ao|aos|à|às|do|da|dos|das|no|na|nos|nas|dum|duma|duns|dumas|pelo|pela|pelos|pelas)\s$/u.test(
        before
      )
    ) {
      return match;
    }

    const articleMap = {
      seu: "o",
      seus: "os",
      sua: "a",
      suas: "as",
    };
    const article = applySourceCasing(pronoun, articleMap[pronoun.toLowerCase()] || "o");
    const normalizedPronoun =
      /^[A-ZÀ-Ý][a-zà-ÿ]/u.test(pronoun) && article !== article.toLowerCase() ? pronoun.toLowerCase() : pronoun;
    return `${article} ${normalizedPronoun} ${noun}`;
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applySourceCasing(source, replacement) {
  const letters = [...String(source)].filter((character) => /\p{L}/u.test(character)).join("");
  if (letters.length > 1 && letters === letters.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (letters && letters.slice(0, 1) === letters.slice(0, 1).toUpperCase()) {
    return replacement.slice(0, 1).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function getPublicProfile(user) {
  return {
    email: user.email,
    name: user.name,
    plan: userHasPremium(user) ? "premium" : "free",
    subscriptionStatus: user.subscription_status || "none",
    booksUsed: getUserBookCount(user.id),
  };
}

function dbWordToApi(row) {
  return {
    id: row.id,
    source: row.source,
    translatedText: row.translated_text,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    bookId: row.book_id,
    bookTitle: row.book_title,
    pageIndex: row.page_index,
    context: row.context,
    createdAt: row.created_at,
  };
}

async function atomicWriteTextFile(filePath, contents) {
  const directory = path.dirname(filePath);
  await fsp.mkdir(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`
  );
  await fsp.writeFile(tempPath, contents, "utf8");
  await fsp.rename(tempPath, filePath);
  if (s3.isConfigured() && s3.isManaged(filePath, dataDir)) {
    s3.upload(filePath, dataDir).catch((err) => console.error("S3 upload error:", err.message));
  }
}

async function readTextFileWithRetries(filePath, attempts = 4) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fsp.readFile(filePath, "utf8");
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 35 * (attempt + 1)));
    }
  }
  throw lastError || new Error(`Unable to read ${filePath}.`);
}

function parseJsonWithTrailingTrim(text, maxTrimCharacters = 32) {
  const normalized = String(text || "").trimEnd();
  let candidate = normalized;
  let lastError = null;

  for (let trimCount = 0; trimCount <= maxTrimCharacters && candidate; trimCount += 1) {
    try {
      return {
        value: JSON.parse(candidate),
        repaired: trimCount > 0,
      };
    } catch (error) {
      lastError = error;
      candidate = candidate.slice(0, -1).trimEnd();
    }
  }

  throw lastError || new Error("Unable to parse JSON.");
}

function loadUserPreferences() {
  const fallback = {
    sourceLanguage: "auto",
    listenerLanguage: normalizeLanguageCode(process.env.APP_ACCOUNT_INTERFACE_LANGUAGE || "en"),
    audiobookLanguage: normalizeLanguageCode(process.env.APP_ACCOUNT_LEARNING_LANGUAGE || "pt-pt"),
    selectedVoiceId: "storybook",
    savedWords: [],
    updatedAt: new Date().toISOString(),
  };

  try {
    if (!fs.existsSync(preferencesPath)) {
      return fallback;
    }
    const parsed = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
    return {
      ...fallback,
      ...parsed,
      sourceLanguage: normalizeLanguageCode(parsed.sourceLanguage || fallback.sourceLanguage),
      listenerLanguage: normalizeLanguageCode(parsed.listenerLanguage || fallback.listenerLanguage),
      audiobookLanguage: normalizeLanguageCode(parsed.audiobookLanguage || fallback.audiobookLanguage),
      selectedVoiceId: String(parsed.selectedVoiceId || fallback.selectedVoiceId),
      savedWords: normalizeSavedWords(parsed.savedWords),
    };
  } catch {
    return fallback;
  }
}

function getEffectiveUserPreferences(preferences = userPreferences) {
  const effectivePreferences = {
    ...preferences,
    savedWords: normalizeSavedWords(preferences.savedWords),
  };

  if (
    !narrationBackendSupportsCustomVoiceCloning(getDefaultNarrationEngine()) &&
    effectivePreferences.selectedVoiceId !== "storybook"
  ) {
    effectivePreferences.selectedVoiceId = "storybook";
  }

  return effectivePreferences;
}

function normalizeSavedWords(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map(normalizeSavedWordEntry)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
}

function normalizeSavedWordEntry(entry) {
  const source = String(entry?.source || "").trim();
  const translatedText = String(entry?.translatedText || "").trim();
  if (!source || !translatedText) {
    return null;
  }

  return {
    id: String(entry?.id || crypto.randomUUID()),
    source,
    translatedText,
    sourceLanguage: normalizeLanguageCode(entry?.sourceLanguage || "auto"),
    targetLanguage: normalizeLanguageCode(entry?.targetLanguage || "en"),
    bookId: String(entry?.bookId || "").trim(),
    bookTitle: String(entry?.bookTitle || "").trim(),
    pageIndex: Math.max(0, Number(entry?.pageIndex || 0)),
    context: String(entry?.context || "").trim().slice(0, 360),
    createdAt: entry?.createdAt || new Date().toISOString(),
  };
}

async function persistUserPreferences() {
  await atomicWriteTextFile(preferencesPath, JSON.stringify(userPreferences, null, 2));
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex <= 0) {
        return cookies;
      }
      const key = pair.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(pair.slice(separatorIndex + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function getSessionIdFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[sessionCookieName] || null;
}

function getSessionFromRequest(req) {
  const sessionId = getSessionIdFromRequest(req);
  return sessionId ? getSession(sessionId) : null;
}

function setSessionCookie(res, sessionId, expiresAt) {
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
}

function requireSession(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({
      ok: false,
      error: "Please sign in to Voxenor first.",
    });
  }

  const user = getUserById(session.user_id);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
  }

  req.session = session;
  req.user = user;
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    return res.status(403).json({ ok: false, error: "Forbidden." });
  }
  return next();
}

// ── User-Agent parsing ──────────────────────────────────────

function parseUA(ua) {
  ua = ua || "";
  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";

  let browser = "Unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox/i.test(ua)) browser = "Firefox";

  return { os, browser };
}

function trackEvent(req, event, payload = {}) {
  const ua = parseUA(req.headers["user-agent"]);
  const lang = (req.headers["accept-language"] || "").split(",")[0].trim() || "";
  const ip = (req.ip || req.headers["x-forwarded-for"] || "").replace(/^::ffff:/, "");
  logAnalyticsEvent(req.user?.id || null, event, {
    payload, os: ua.os, browser: ua.browser, language: lang, ip,
  });
}

function getLocalAccessUrls(activePort) {
  const interfaces = os.networkInterfaces();
  const urls = [];
  for (const records of Object.values(interfaces)) {
    for (const record of records || []) {
      if ((record.family !== "IPv4" && record.family !== 4) || record.internal) {
        continue;
      }
      urls.push(`http://${record.address}:${activePort}`);
    }
  }
  return [...new Set(urls)];
}

function getLibraryBookDir(bookId) {
  return path.join(libraryDir, bookId);
}

function getLibraryBookMetadataPath(bookId) {
  return path.join(getLibraryBookDir(bookId), "book.json");
}

async function listLibraryBooks() {
  if (!fs.existsSync(libraryDir)) {
    return [];
  }

  const entries = await fsp.readdir(libraryDir, { withFileTypes: true });
  const books = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const book = await readLibraryBook(entry.name);
    if (book) {
      books.push(book);
    }
  }

  return books.sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
    const rightTime = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
    return rightTime - leftTime;
  });
}

async function readLibraryBook(bookId) {
  try {
    const metadataPath = getLibraryBookMetadataPath(bookId);
    if (!fs.existsSync(metadataPath)) {
      if (s3.isConfigured()) {
        await s3.ensureLocal(metadataPath, dataDir);
      }
      if (!fs.existsSync(metadataPath)) return null;
    }
    const parsedBook = parseJsonWithTrailingTrim(await readTextFileWithRetries(metadataPath));
    const { book: sanitizedBook, changed } = await sanitizeLibraryBookState(parsedBook.value);
    if (changed || parsedBook.repaired) {
      await persistLibraryBook(sanitizedBook);
      await persistLibraryDerivedTexts(sanitizedBook);
    }
    return sanitizedBook;
  } catch {
    return null;
  }
}

async function persistLibraryBook(book) {
  const bookDir = getLibraryBookDir(book.id);
  await fsp.mkdir(bookDir, { recursive: true });
  book.updatedAt = new Date().toISOString();
  await atomicWriteTextFile(getLibraryBookMetadataPath(book.id), JSON.stringify(book, null, 2));
}

async function persistLibraryDerivedTexts(book) {
  const bookDir = getLibraryBookDir(book.id);
  await fsp.mkdir(bookDir, { recursive: true });
  const originalText = normalizeText(book.pages.map((page) => page.originalText).join("\n\n"));
  await atomicWriteTextFile(path.join(bookDir, "original.txt"), originalText);

  const translatedPages = book.pages.some((page) => page.translatedText?.trim());
  if (!translatedPages) {
    return;
  }

  const translatedText = normalizeText(book.pages.map((page) => page.translatedText || page.originalText).join("\n\n"));
  await atomicWriteTextFile(path.join(bookDir, `translated.${book.audiobookLanguage}.txt`), translatedText);
}

function paginateBookText(text, pageWordLimit = 190, pageCharLimit = 1150) {
  const blocks = normalizeText(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const pages = [];
  let currentParts = [];
  let currentWordCount = 0;
  let currentCharCount = 0;

  const flushPage = () => {
    if (!currentParts.length) {
      return;
    }
    const content = normalizeText(currentParts.join("\n\n"));
    if (content) {
      pages.push(content);
    }
    currentParts = [];
    currentWordCount = 0;
    currentCharCount = 0;
  };

  const appendChunk = (chunk) => {
    const normalizedChunk = normalizeText(chunk);
    if (!normalizedChunk) {
      return;
    }

    const chunkWordCount = countWords(normalizedChunk);
    const chunkCharCount = normalizedChunk.length;
    if (
      currentParts.length &&
      (currentWordCount + chunkWordCount > pageWordLimit || currentCharCount + chunkCharCount > pageCharLimit)
    ) {
      flushPage();
    }

    currentParts.push(normalizedChunk);
    currentWordCount += chunkWordCount;
    currentCharCount += chunkCharCount;
  };

  for (const block of blocks) {
    if (countWords(block) <= pageWordLimit && block.length <= pageCharLimit) {
      appendChunk(block);
      continue;
    }

    const sentences = block.match(/[^.!?…]+[.!?…]?/g) || [block];
    let sentenceChunk = "";
    for (const sentence of sentences) {
      const candidate = sentenceChunk ? `${sentenceChunk} ${sentence.trim()}` : sentence.trim();
      if (countWords(candidate) <= pageWordLimit && candidate.length <= pageCharLimit) {
        sentenceChunk = candidate;
      } else {
        if (sentenceChunk) {
          appendChunk(sentenceChunk);
        }
        sentenceChunk = sentence.trim();
      }
    }
    if (sentenceChunk) {
      appendChunk(sentenceChunk);
    }
  }

  flushPage();
  return pages.length ? pages : [normalizeText(text)];
}

function countWords(text) {
  return (text.match(/[\p{L}\p{M}\p{N}ºª]+(?:['’\-][\p{L}\p{M}\p{N}ºª]+)*/gu) || []).length;
}

function analyzeBookStructure(pages) {
  const chapterMarkers = [];
  const maxScanPages = Math.min(pages.length, 160);
  let suggestedStartPageIndex = 0;
  let foundStart = false;

  // First pass: classify every page
  const classifications = [];
  for (let pageIndex = 0; pageIndex < maxScanPages; pageIndex += 1) {
    const page = pages[pageIndex];
    const analysis = analyzePageStructure(page.originalText || "");
    if (analysis.title) {
      page.title = analysis.title;
    }
    classifications.push(analysis);

    if (analysis.isChapterStart) {
      chapterMarkers.push({
        pageIndex,
        title: analysis.title || `Page ${pageIndex + 1}`,
      });
      if (!foundStart) {
        suggestedStartPageIndex = pageIndex;
        foundStart = true;
      }
    }
  }

  // Second pass: if we found a chapter start, treat everything before it
  // that isn't itself a chapter as front matter (skippable preamble).
  // This catches dense continuation pages of forewords, notes, etc.
  if (foundStart && suggestedStartPageIndex > 0) {
    const preambleMarkers = chapterMarkers.filter((m) => m.pageIndex < suggestedStartPageIndex);
    if (preambleMarkers.length === 0) {
      // No earlier chapter markers — everything before suggestedStartPageIndex is preamble
      for (let i = 0; i < suggestedStartPageIndex; i += 1) {
        classifications[i].isFrontMatter = true;
        classifications[i].isChapterStart = false;
      }
    }
  }

  // Fallback: if no chapter was detected at all, find the first non-front-matter
  // page with substantial text
  if (!foundStart) {
    for (let pageIndex = 0; pageIndex < maxScanPages; pageIndex += 1) {
      const page = pages[pageIndex];
      const analysis = classifications[pageIndex];
      if (!analysis.isFrontMatter && countWords(page.originalText || "") > 70) {
        suggestedStartPageIndex = pageIndex;
        foundStart = true;
        break;
      }
    }
  }

  return {
    suggestedStartPageIndex,
    chapterMarkers,
  };
}

function analyzePageStructure(text) {
  const normalizedText = normalizeText(text || "");
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLines = lines.slice(0, 6);
  const firstChunk = firstLines.join(" ").slice(0, 260);
  const fullHead = normalizedText.slice(0, 800);
  const tocLineCount = lines.filter((line) => /\.{2,}\s*\d+\s*$/u.test(line) || /\b\d+\s*$/u.test(line)).length;
  const wordCount = countWords(normalizedText);

  const frontMatterPattern =
    /\b(?:table of contents|contents|index|copyright|all rights reserved|isbn|foreword|preface|acknowledg(?:e)?ments?|introduction|dedication|title page|editor['']?s? note|translator['']?s? note|note on the (?:text|translation|author)|about the (?:author|translator|editor)|biographical note|publisher['']?s? note|list of (?:illustrations|plates|maps|figures)|illustrations|dramatis personae|persons represented|sum[aá]rio|[íi]ndice|pref[aá]cio|agradecimentos|introdu[cç][aã]o|dedicat[oó]ria|nota (?:do|da) (?:tradutor|editor))\b/iu;
  const gutenbergPattern =
    /\b(?:project gutenberg|distributed proofreading|etext|e-text|this ebook|this e-book|produced by|transcriber['']?s? note)\b/iu;
  const chapterPattern =
    /^(?:chapter|cap[ií]tulo|livro|book|part|parte|prologue|pr[oó]logo|epilogue|ep[ií]logo)\b/iu;

  const chapterHeadingLine = firstLines.find((line) => chapterPattern.test(line)) || "";
  const romanHeadingLine = firstLines.find((line) => /^(?:[IVXLCDM]+|[0-9]{1,3})[.)\-]?\s*$/u.test(line)) || "";
  const titleCandidateLines = firstLines.filter((line) => isBookHeadingLine(line)).slice(0, 2);
  const titleCandidate = compactDetectedPageTitle(titleCandidateLines.join(" - "));

  let chapterScore = 0;
  if (chapterHeadingLine) {
    chapterScore += 4;
  }
  if (romanHeadingLine && titleCandidateLines.length >= 1) {
    chapterScore += 2;
  }
  if (!chapterHeadingLine && titleCandidateLines.length >= 1 && wordCount >= 40 && wordCount <= 180 && tocLineCount === 0) {
    chapterScore += 1;
  }

  let frontMatterScore = 0;
  if (frontMatterPattern.test(firstChunk)) {
    frontMatterScore += 3;
  }
  if (frontMatterPattern.test(fullHead)) {
    frontMatterScore += 2;
  }
  if (gutenbergPattern.test(fullHead)) {
    frontMatterScore += 4;
  }
  if (tocLineCount >= 3) {
    frontMatterScore += 3;
  }
  if (/\b(?:copyright|all rights reserved|isbn)\b/iu.test(normalizedText.slice(0, 600))) {
    frontMatterScore += 3;
  }
  if (wordCount < 30 && !chapterHeadingLine) {
    frontMatterScore += 2;
  } else if (wordCount < 60 && !chapterHeadingLine) {
    frontMatterScore += 1;
  }
  // Roman numeral page markers (e.g., "xv", "xxii") are typical of front matter
  if (/\b[ivxlc]{2,6}\b/iu.test(firstLines[0] || "") && !chapterHeadingLine) {
    frontMatterScore += 1;
  }

  const isFrontMatter = frontMatterScore >= 3 && chapterScore < 4;
  const isChapterStart = chapterScore >= 3 && !isFrontMatter;
  const isExplicitChapter = /^(?:chapter|cap[ií]tulo)\b/iu.test(chapterHeadingLine);

  return {
    isFrontMatter,
    isChapterStart,
    isExplicitChapter,
    title: titleCandidate || compactDetectedPageTitle(chapterHeadingLine) || "",
  };
}

function compactDetectedPageTitle(title) {
  const normalizedTitle = normalizeText(String(title || ""));
  if (!normalizedTitle) {
    return "";
  }

  const trimmedSentence = normalizedTitle.split(/(?<=[.!?])\s+/u)[0] || normalizedTitle;
  const words = trimmedSentence.split(/\s+/u).filter(Boolean);
  if (trimmedSentence.length <= 96 && words.length <= 14) {
    return trimmedSentence;
  }

  return words.slice(0, 12).join(" ").replace(/[,:;.\-–—]+$/u, "");
}

function isBookHeadingLine(line) {
  const normalizedLine = String(line || "").trim();
  if (!normalizedLine || normalizedLine.length > 90) {
    return false;
  }

  const wordCountForLine = countWords(normalizedLine);
  if (wordCountForLine === 0 || wordCountForLine > 14) {
    return false;
  }

  if (/[.!?]$/u.test(normalizedLine)) {
    return false;
  }

  const letters = [...normalizedLine].filter((character) => /\p{L}/u.test(character));
  const uppercaseRatio =
    letters.length > 0 ? letters.filter((character) => character === character.toUpperCase()).length / letters.length : 0;
  return uppercaseRatio >= 0.35 || /^[A-ZÀ-Ý0-9]/u.test(normalizedLine);
}

function bookPageNeedsTranslation(book) {
  return (
    book.detectedLanguage &&
    book.detectedLanguage !== "auto" &&
    normalizeTranslationProviderLanguage(book.detectedLanguage) !==
      normalizeTranslationProviderLanguage(book.audiobookLanguage || "pt-pt")
  );
}

function ptPortugalTranslationNeedsRetry(text) {
  if (!text?.trim()) {
    return false;
  }

  return /\b(?:você|ônibus|onibus|trem|trens|celular|celulares|banheiro|banheiros|sorvete|sorvetes|xícara|xicara|xícaras|xicaras|time|times)\b/iu.test(
    text
  );
}

function ptPortugalPageHasBrokenArtifact(page) {
  const candidates = [page?.translatedText || "", page?.alignment?.preparedText || ""];
  return candidates.some((text) => /\br\.\s+e\s+a\s+(?:sra\.|senhora)(?=\s|$)/iu.test(text));
}

function resolveLibraryAudioFilePath(bookId, audioUrl) {
  if (!audioUrl || typeof audioUrl !== "string") {
    return "";
  }

  const expectedPrefix = `/library-assets/${bookId}/audio/`;
  if (!audioUrl.startsWith(expectedPrefix)) {
    return "";
  }

  return path.join(getLibraryBookDir(bookId), "audio", path.basename(audioUrl));
}

async function getCachedLibraryAudioArtifacts(bookId) {
  const audioDir = path.join(getLibraryBookDir(bookId), "audio");
  const artifactMap = new Map();
  const entries = await fsp.readdir(audioDir).catch(() => []);

  for (const entry of entries) {
    const match = /^page-(\d{4})-([a-z0-9_-]+)-(.+)\.wav$/iu.exec(entry);
    if (!match) {
      continue;
    }

    const [, rawPageNumber, rawEngine, rawVoiceId] = match;
    const pageIndex = Math.max(0, Number(rawPageNumber) - 1);
    const wavPath = path.join(audioDir, entry);
    const metadataPath = wavPath.replace(/\.wav$/iu, ".json");
    const audioInfo = await inspectAudioFile(wavPath);
    if (!audioInfo.exists || audioInfo.duration <= 0) {
      continue;
    }

    let metadata = null;
    if (fs.existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(await fsp.readFile(metadataPath, "utf8"));
      } catch {
        metadata = null;
      }
    }

    artifactMap.set(pageIndex, {
      audioUrl: `/library-assets/${bookId}/audio/${entry}`,
      audioEngine: String(metadata?.engine || rawEngine || getDefaultNarrationEngine()),
      audioVoiceId: String(rawVoiceId || "storybook"),
      alignment: metadata || null,
      preparedText: String(metadata?.preparedText || "").trim(),
      duration: audioInfo.duration,
    });
  }

  return artifactMap;
}

function enqueueBookPreparation(bookId, operation) {
  const previousTail = bookPreparationQueues.get(bookId) || Promise.resolve();
  const next = previousTail.catch(() => {}).then(operation);
  const nextTail = next.catch(() => {});
  bookPreparationQueues.set(bookId, nextTail);
  void nextTail.finally(() => {
    if (bookPreparationQueues.get(bookId) === nextTail) {
      bookPreparationQueues.delete(bookId);
    }
  });
  return next;
}

async function sanitizeLibraryBookState(book) {
  let changed = false;
  const needsTranslation = bookPageNeedsTranslation(book);
  const targetLanguage = normalizeLanguageCode(book.audiobookLanguage || "pt-pt");
  const targetProviderLanguage = normalizeTranslationProviderLanguage(targetLanguage);
  const targetIsPtPortugal = targetLanguage === "pt-pt";
  const generationLogPattern =
    /Generating segment \d+ of \d+\.|Loading Chatterbox models\.|Applying your uploaded voice sample\.|Combining narration chunks\.|Audiobook finished\./u;
  const cachedAudioArtifacts = await getCachedLibraryAudioArtifacts(book.id);
  const previousSuggestedStartPageIndex = Number.isInteger(book.suggestedStartPageIndex) ? book.suggestedStartPageIndex : 0;
  const firstExplicitStoredChapterMarker =
    Array.isArray(book.chapterMarkers) && book.chapterMarkers.length
      ? book.chapterMarkers.find((marker) => /^(?:chapter|cap[ií]tulo)\b/iu.test(marker?.title || ""))
      : null;
  const shouldRefreshStructure =
    !Number.isInteger(book.suggestedStartPageIndex) ||
    !Array.isArray(book.chapterMarkers) ||
    book.chapterMarkers.length === 0 ||
    !book.chapterMarkers.some((marker) => /^(?:chapter|cap[ií]tulo)\b/iu.test(marker?.title || "")) ||
    (Number.isInteger(firstExplicitStoredChapterMarker?.pageIndex) &&
      firstExplicitStoredChapterMarker.pageIndex > previousSuggestedStartPageIndex + 2) ||
    (Array.isArray(book.chapterMarkers) && book.chapterMarkers.length > 0 &&
      book.chapterMarkers[0].pageIndex < previousSuggestedStartPageIndex - 2);

  if (shouldRefreshStructure && Array.isArray(book.pages)) {
    const structure = analyzeBookStructure(book.pages);
    book.suggestedStartPageIndex = structure.suggestedStartPageIndex;
    book.chapterMarkers = structure.chapterMarkers;
    const currentProgressPageIndex = Number(book.progress?.pageIndex || 0);
    const progressPageLooksLikeFrontMatter = analyzePageStructure(book.pages[clampPageIndex(book, currentProgressPageIndex)]?.originalText || "").isFrontMatter;
    const progressStillNearOldStart = currentProgressPageIndex <= previousSuggestedStartPageIndex + 1;
    if (
      (currentProgressPageIndex === 0 || progressStillNearOldStart || progressPageLooksLikeFrontMatter) &&
      structure.suggestedStartPageIndex > currentProgressPageIndex
    ) {
      book.progress = {
        pageIndex: structure.suggestedStartPageIndex,
        audioTime: 0,
        updatedAt: new Date().toISOString(),
      };
    }
    changed = true;
  }

  for (const [pageIndex, page] of (book.pages || []).entries()) {
    const pageTaskActive = [...bookPageTasks.keys()].some((taskKey) => taskKey.startsWith(`${book.id}:${pageIndex}:`));
    const normalizedSourceText = normalizeExtractedBookText(page.originalText || "");
    if (normalizedSourceText && normalizedSourceText !== page.originalText) {
      page.originalText = normalizedSourceText;
      if (!page.audioUrl) {
        page.translatedText = "";
        page.translationStatus = needsTranslation ? "idle" : "source";
        page.logs = [...(page.logs || []).slice(-4), "Source text was cleaned for stronger translation quality. Generate again to use it."];
      }
      changed = true;
    }

    let audioPath = resolveLibraryAudioFilePath(book.id, page.audioUrl);
    let audioExists = audioPath ? fs.existsSync(audioPath) : false;
    const cachedArtifact = cachedAudioArtifacts.get(pageIndex) || null;

    if (!page.audioUrl && cachedArtifact) {
      page.audioStatus = "ready";
      page.audioUrl = cachedArtifact.audioUrl;
      page.audioVoiceId = cachedArtifact.audioVoiceId;
      page.audioEngine = cachedArtifact.audioEngine;
      if (!page.alignment && cachedArtifact.alignment) {
        page.alignment = cachedArtifact.alignment;
      }
      if (needsTranslation) {
        if (!page.translatedText?.trim() && cachedArtifact.preparedText) {
          page.translatedText = cachedArtifact.preparedText;
        }
        if (page.translatedText?.trim()) {
          page.translationStatus = "ready";
          page.translationProvider = page.translationProvider || "cached";
          page.translationProviderTarget = targetProviderLanguage;
        }
      } else if (!page.translatedText?.trim() && page.originalText?.trim()) {
        page.translatedText = page.originalText;
        page.translationStatus = "source";
      }
      page.logs = [...(page.logs || []).slice(-5), "Recovered a cached audiobook page from disk."];
      audioPath = resolveLibraryAudioFilePath(book.id, page.audioUrl);
      audioExists = audioPath ? fs.existsSync(audioPath) : false;
      changed = true;
    }

    if (page.translationStatus === "running" && !page.translatedText?.trim() && !pageTaskActive) {
      page.translationStatus = needsTranslation ? "idle" : "source";
      changed = true;
    }

    let translationChanged = false;
    let resetTranslationForPtPortugal = false;
    if (page.translatedText?.trim()) {
      if (targetIsPtPortugal) {
        const normalizedTranslatedText = normalizePortugueseForPortugal(page.translatedText, book.detectedLanguage);
        if (normalizedTranslatedText && normalizedTranslatedText !== page.translatedText) {
          page.translatedText = normalizedTranslatedText;
          translationChanged = true;
          changed = true;
        }
      }
      if (page.translationStatus !== "ready") {
        page.translationStatus = "ready";
        changed = true;
      }
      const hasLegacyPtTranslation =
        targetIsPtPortugal &&
        needsTranslation &&
        Boolean(page.translationProviderTarget) &&
        normalizeLanguageCode(page.translationProviderTarget) !== "pt-pt";
      const missingPtDialectMarker = targetIsPtPortugal && needsTranslation && !page.translationProviderTarget;
      if (
        targetIsPtPortugal &&
        (ptPortugalTranslationNeedsRetry(page.translatedText) || hasLegacyPtTranslation || missingPtDialectMarker)
      ) {
        resetTranslationForPtPortugal = true;
        page.translatedText = "";
        page.translationStatus = "idle";
        page.translationProvider = "";
        page.translationProviderTarget = "";
        page.logs = [...(page.logs || []).slice(-4), "Refreshing this page with direct PT-PT translation."];
        changed = true;
      }
    } else if (!needsTranslation) {
      if (page.translationStatus !== "source") {
        page.translationStatus = "source";
        changed = true;
      }
    } else if (page.translationStatus === "ready") {
      page.translationStatus = "idle";
      changed = true;
    }

    const hasInconsistentAudio = needsTranslation && !page.translatedText?.trim() && page.audioUrl;
    const hasMissingAudioFile = Boolean(page.audioUrl) && !audioExists;
    if (page.audioUrl && !page.audioEngine) {
      page.audioEngine = "chatterbox";
      changed = true;
    }
    const needsPtPortugalAssetRefresh =
      targetIsPtPortugal &&
      !pageTaskActive &&
      (ptPortugalPageHasBrokenArtifact(page) || translationChanged || resetTranslationForPtPortugal);
    if (hasInconsistentAudio || hasMissingAudioFile || needsPtPortugalAssetRefresh) {
      if (audioPath && audioExists) {
        await fsp.rm(audioPath, { force: true }).catch(() => {});
        await fsp.rm(audioPath.replace(/\.wav$/iu, ".json"), { force: true }).catch(() => {});
      }
      page.audioStatus = "idle";
      page.audioUrl = "";
      page.audioVoiceId = "";
      page.audioEngine = "";
      page.alignment = null;
      if (hasInconsistentAudio) {
        page.logs = [...(page.logs || []).slice(-6), "Reset an out-of-sync page so you can generate it again cleanly."];
      } else if (needsPtPortugalAssetRefresh) {
        if (!page.translatedText?.trim()) {
          page.translationStatus = "idle";
        }
        page.logs = [...(page.logs || []).slice(-6), "Reset this page to rebuild it with the latest PT-PT fixes."];
      }
      changed = true;
    } else if (page.audioStatus === "running" && !page.audioUrl && !pageTaskActive) {
      page.audioStatus = "idle";
      changed = true;
    } else if (page.audioUrl && page.audioStatus !== "ready") {
      page.audioStatus = "ready";
      changed = true;
    }

    if (needsTranslation) {
      const expectedProviderTarget = page.translatedText?.trim() ? targetProviderLanguage : "";
      if ((page.translationProviderTarget || "") !== expectedProviderTarget) {
        page.translationProviderTarget = expectedProviderTarget;
        changed = true;
      }
    } else if (page.translationProviderTarget) {
      page.translationProviderTarget = "";
      changed = true;
    }

    if (!pageTaskActive && !page.audioUrl && (page.logs || []).some((entry) => generationLogPattern.test(entry))) {
      const cleanedLogs = (page.logs || []).filter((entry) => !generationLogPattern.test(entry)).slice(-4);
      page.logs = [...cleanedLogs, "Previous generation stopped before finishing. Open this page again and Voxenor will retry it cleanly."];
      changed = true;
    }
  }

  return {
    book,
    changed,
  };
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function buildBookContentFingerprint({ detectedLanguage, text }) {
  const hash = crypto.createHash("sha1");
  hash.update(normalizeLanguageCode(detectedLanguage || "auto"));
  hash.update("\n");
  hash.update(normalizeText(text));
  return hash.digest("hex");
}

function getBookContentFingerprint(book) {
  if (book.contentFingerprint) {
    return book.contentFingerprint;
  }

  return buildBookContentFingerprint({
    detectedLanguage: book.detectedLanguage || book.sourceLanguageHint || "auto",
    text: book.pages.map((page) => page.originalText || "").join("\n\n"),
  });
}

async function getBookSourceFingerprint(book) {
  if (book.sourceFileFingerprint) {
    return book.sourceFileFingerprint;
  }

  const bookDir = getLibraryBookDir(book.id);
  if (!fs.existsSync(bookDir)) {
    return "";
  }

  const entries = await fsp.readdir(bookDir).catch(() => []);
  const sourceEntry = entries.find((entry) => entry.startsWith("source."));
  if (!sourceEntry) {
    return "";
  }

  const fingerprint = await hashFile(path.join(bookDir, sourceEntry)).catch(() => "");
  if (fingerprint) {
    book.sourceFileFingerprint = fingerprint;
    await persistLibraryBook(book);
  }
  return fingerprint;
}

async function findExistingLibraryBook({ contentFingerprint, sourceFileFingerprint, audiobookLanguage }) {
  if (!contentFingerprint && !sourceFileFingerprint) {
    return null;
  }

  const books = await listLibraryBooks();
  const normalizedAudiobookLanguage = normalizeLanguageCode(audiobookLanguage || "pt-pt");
  for (const book of books) {
    const bookFingerprint = contentFingerprint ? getBookContentFingerprint(book) : "";
    const bookSourceFingerprint = sourceFileFingerprint ? await getBookSourceFingerprint(book) : "";
    const missingContentFingerprint = Boolean(contentFingerprint && !book.contentFingerprint);
    const missingSourceFingerprint = Boolean(sourceFileFingerprint && !book.sourceFileFingerprint);
    if (
      (bookFingerprint && bookFingerprint === contentFingerprint) ||
      (bookSourceFingerprint && bookSourceFingerprint === sourceFileFingerprint)
    ) {
      if (normalizeLanguageCode(book.audiobookLanguage || "pt-pt") !== normalizedAudiobookLanguage) {
        continue;
      }
      if (missingContentFingerprint) {
        book.contentFingerprint = bookFingerprint;
      }
      if (missingSourceFingerprint) {
        book.sourceFileFingerprint = bookSourceFingerprint;
      }
      if (missingContentFingerprint || missingSourceFingerprint) {
        await persistLibraryBook(book);
      }
      return book;
    }
  }

  return null;
}

function toPublicBookSummary(book) {
  return {
    id: book.id,
    title: book.title,
    coverUrl: book.coverUrl || "",
    sourceType: book.sourceType,
    detectedLanguage: book.detectedLanguage,
    audiobookLanguage: book.audiobookLanguage,
    skipAudiobook: book.skipAudiobook || false,
    totalPages: book.pages.length,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    progress: book.progress || { pageIndex: 0, audioTime: 0 },
  };
}

function toPublicBook(book) {
  return {
    ...toPublicBookSummary(book),
    originalFileName: book.originalFileName || "",
    listenerLanguage: book.listenerLanguage,
    voiceSampleId: book.voiceSampleId || "storybook",
    pages: book.pages.map((page, index) => ({
      index,
      title: page.title || `Page ${index + 1}`,
      translationStatus: page.translationStatus || "idle",
      audioStatus: page.audioStatus || "idle",
      audioEngine: page.audioEngine || "",
      ready: Boolean(page.audioUrl),
    })),
  };
}

function toPublicBookPage(book, pageIndex) {
  const safePageIndex = clampPageIndex(book, pageIndex);
  const page = book.pages[safePageIndex];
  const displayText = page.alignment?.preparedText || page.translatedText || page.originalText;
  return {
    index: safePageIndex,
    title: page.title || `Page ${safePageIndex + 1}`,
    sourceText: page.originalText,
    translatedText: page.translatedText || "",
    displayText,
    translationStatus: page.translationStatus || "idle",
    audioStatus: page.audioStatus || "idle",
    audioEngine: page.audioEngine || "",
    audioUrl: page.audioUrl || "",
    alignment: page.alignment || null,
    logs: page.logs || [],
    voiceSampleId: book.voiceSampleId || "storybook",
  };
}

async function createLibraryBookFromRequest(req) {
  const manualText = String(req.body?.text || "").trim();
  const requestedTitle = (req.body?.title || "Untitled Book").trim();
  const sourceLanguageHint = normalizeLanguageCode(req.body?.sourceLanguage || userPreferences.sourceLanguage || "auto");
  const listenerLanguage = normalizeLanguageCode(req.body?.listenerLanguage || userPreferences.listenerLanguage || "en");
  const audiobookLanguage = normalizeLanguageCode(req.body?.audiobookLanguage || userPreferences.audiobookLanguage || "pt-pt");
  const skipAudiobook = Boolean(req.body?.skipAudiobook);
  const sourceFileFingerprint = req.file?.path ? await hashFile(req.file.path).catch(() => "") : "";
  if (sourceFileFingerprint) {
    const existingBook = await findExistingLibraryBook({
      sourceFileFingerprint,
      audiobookLanguage,
    });
    if (existingBook) {
      if (req.file?.path) {
        await fsp.rm(req.file.path, { force: true }).catch(() => {});
      }
      if (existingBook.skipAudiobook !== skipAudiobook) {
        existingBook.skipAudiobook = skipAudiobook;
        await persistLibraryBook(existingBook);
      }
      return {
        book: existingBook,
        existing: true,
      };
    }
  }

  const extraction = await extractBookPayload({
    manualText,
    title: requestedTitle,
    sourceLanguageHint,
    file: req.file,
  });
  const extractedText = normalizeExtractedBookText(extraction.text || "");
  if (!extractedText) {
    throw new Error("I could not extract readable text from that upload.");
  }

  const contentFingerprint = buildBookContentFingerprint({
    detectedLanguage: extraction.detectedLanguage || sourceLanguageHint,
    text: extractedText,
  });
  const existingBook = await findExistingLibraryBook({
    contentFingerprint,
    sourceFileFingerprint,
    audiobookLanguage,
  });
  if (existingBook) {
    if (req.file?.path) {
      await fsp.rm(req.file.path, { force: true }).catch(() => {});
    }
    if (existingBook.skipAudiobook !== skipAudiobook) {
      existingBook.skipAudiobook = skipAudiobook;
      await persistLibraryBook(existingBook);
    }
    // Download cover for existing Gutenberg books that lack one
    if (!existingBook.coverUrl && req._gutenbergCoverUrl) {
      try {
        const existingBookDir = getLibraryBookDir(existingBook.id);
        const existingCoverPath = path.join(existingBookDir, "cover.jpg");
        if (!fs.existsSync(existingCoverPath)) {
          const coverRes = await fetch(String(req._gutenbergCoverUrl));
          if (coverRes.ok) {
            const coverBuf = Buffer.from(await coverRes.arrayBuffer());
            await fsp.writeFile(existingCoverPath, coverBuf);
            if (s3.isConfigured()) s3.upload(existingCoverPath, dataDir).catch(() => {});
            existingBook.coverUrl = `/library-assets/${existingBook.id}/cover.jpg`;
            await persistLibraryBook(existingBook);
          }
        }
      } catch { /* cover download failed, continue without */ }
    }
    return {
      book: existingBook,
      existing: true,
    };
  }

  const bookId = crypto.randomUUID();
  const bookDir = getLibraryBookDir(bookId);
  await fsp.mkdir(bookDir, { recursive: true });

  let originalFileName = "";
  let sourceType = extraction.source || "manual";
  if (req.file) {
    const ext = path.extname(req.file.originalname) || ".bin";
    originalFileName = req.file.originalname;
    const sourcePath = path.join(bookDir, `source${ext}`);
    await fsp.rename(req.file.path, sourcePath);
    if (s3.isConfigured()) s3.upload(sourcePath, dataDir).catch(() => {});
    const coverPath = path.join(bookDir, "cover.jpg");
    await maybeCreateBookCover(sourcePath, req.file.originalname, coverPath);
    if (s3.isConfigured() && fs.existsSync(coverPath)) s3.upload(coverPath, dataDir).catch(() => {});
  } else if (req._gutenbergCoverUrl) {
    try {
      const coverRes = await fetch(String(req._gutenbergCoverUrl));
      if (coverRes.ok) {
        const coverBuf = Buffer.from(await coverRes.arrayBuffer());
        await fsp.writeFile(path.join(bookDir, "cover.jpg"), coverBuf);
        if (s3.isConfigured()) s3.upload(path.join(bookDir, "cover.jpg"), dataDir).catch(() => {});
      }
    } catch { /* cover download failed, continue without */ }
  }

  const coverUrl = fs.existsSync(path.join(bookDir, "cover.jpg")) ? `/library-assets/${bookId}/cover.jpg` : "";
  const pages = paginateBookText(extractedText).map((pageText, index) => ({
    title: `Page ${index + 1}`,
    originalText: pageText,
    translatedText: "",
    translationStatus: "idle",
    audioStatus: "idle",
    audioUrl: "",
    audioEngine: "",
    alignment: null,
    logs: [],
  }));
  const bookStructure = analyzeBookStructure(pages);

  const book = {
    id: bookId,
    title: (requestedTitle && requestedTitle !== "Untitled Book" ? requestedTitle : extraction.title) || requestedTitle || "Untitled Book",
    sourceType,
    originalFileName,
    sourceLanguageHint,
    detectedLanguage: normalizeLanguageCode(extraction.detectedLanguage || sourceLanguageHint || "auto"),
    listenerLanguage,
    audiobookLanguage,
    skipAudiobook,
    contentFingerprint,
    sourceFileFingerprint,
    voiceSampleId: userPreferences.selectedVoiceId || "storybook",
    coverUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    suggestedStartPageIndex: bookStructure.suggestedStartPageIndex,
    chapterMarkers: bookStructure.chapterMarkers,
    progress: {
      pageIndex: bookStructure.suggestedStartPageIndex,
      audioTime: 0,
      updatedAt: new Date().toISOString(),
    },
    pages,
  };

  await persistLibraryBook(book);
  await persistLibraryDerivedTexts(book);
  return {
    book,
    existing: false,
  };
}

async function extractBookPayload({ manualText, title, sourceLanguageHint, file }) {
  if (manualText) {
    const manualFilePath = path.join(tmpDir, `${crypto.randomUUID()}.txt`);
    await fsp.writeFile(manualFilePath, normalizeText(manualText), "utf8");
    try {
      const extraction = await runPythonJson("scripts/extract_book.py", [
        manualFilePath,
        `${title || "manual-book"}.txt`,
        sourceLanguageHint,
      ]);
      return {
        ...extraction,
        source: "manual",
      };
    } finally {
      await fsp.rm(manualFilePath, { force: true });
    }
  }

  if (!file) {
    throw new Error("Please paste text or upload a PDF, EPUB, TXT, or book photo.");
  }

  return runPythonJson("scripts/extract_book.py", [file.path, file.originalname, sourceLanguageHint]);
}

async function maybeCreateBookCover(sourcePath, originalName, outputPath) {
  try {
    await runCommand(pythonBin, [path.join(rootDir, "scripts/extract_cover.py"), sourcePath, originalName, outputPath]);
  } catch {
    // Cover extraction is a best-effort enhancement for the library.
  }
}

function clampPageIndex(book, pageIndex) {
  if (!book?.pages?.length) {
    return 0;
  }
  if (!Number.isFinite(pageIndex)) {
    return 0;
  }
  return Math.max(0, Math.min(book.pages.length - 1, Math.floor(pageIndex)));
}

function resolveBookVoiceKey(voiceSampleId) {
  return voiceSampleId && !builtInVoiceSamples.some((sample) => sample.id === voiceSampleId)
    ? voiceSampleId
    : "storybook";
}

function buildAudioRenderKey(engine, voiceKey) {
  return `${engine}:${voiceKey}`;
}

function setBookPreparationTarget(bookId, voiceKey, anchorPageIndex) {
  const target = {
    voiceKey,
    anchorPageIndex: Math.max(0, Number(anchorPageIndex) || 0),
    readyWindow: readyPageWindow,
    updatedAt: Date.now(),
  };
  bookPreparationTargets.set(bookId, target);
  return target;
}

function shouldPreparePageForCurrentTarget(bookId, pageIndex, voiceKey) {
  const target = bookPreparationTargets.get(bookId);
  if (!target) {
    return true;
  }

  if (target.voiceKey !== voiceKey) {
    return false;
  }

  return pageIndex >= target.anchorPageIndex && pageIndex <= target.anchorPageIndex + target.readyWindow;
}

function queueUpcomingBookPages(book, anchorPageIndex, voiceKey) {
  for (let offset = 1; offset <= readyPageWindow; offset += 1) {
    const upcomingPageIndex = anchorPageIndex + offset;
    if (upcomingPageIndex >= book.pages.length) {
      break;
    }

    void startLibraryBookPagePreparation({
      bookId: book.id,
      pageIndex: upcomingPageIndex,
      voiceSampleId: voiceKey,
      prefetch: true,
    }).catch(() => {});
  }
}

function sanitizeVoiceKey(voiceKey) {
  return String(voiceKey || "storybook").replace(/[^a-z0-9_-]+/gi, "-");
}

function pageHasReadyAudio(page, voiceKey, engine = getDefaultNarrationEngine()) {
  return (
    page?.audioStatus === "ready" &&
    page?.audioVoiceId === voiceKey &&
    page?.audioEngine === engine &&
    Boolean(page?.audioUrl)
  );
}

function appendPageLog(page, message) {
  page.logs = [...(page.logs || []), message].slice(-8);
}

async function markBookPagePreparationStarted(book, pageIndex, voiceKey, engine, prefetch = false) {
  const page = book.pages?.[pageIndex];
  if (!page) {
    return;
  }

  const needsTranslation = bookPageNeedsTranslation(book);
  let changed = false;

  if (!page.translatedText?.trim() && needsTranslation) {
    if (page.translationStatus !== "running") {
      page.translationStatus = "running";
      changed = true;
    }
    if (!prefetch) {
      appendPageLog(page, `Translating page ${pageIndex + 1} into ${book.audiobookLanguage.toUpperCase()}.`);
      changed = true;
    }
  } else if (!pageHasReadyAudio(page, voiceKey, engine)) {
    if (page.translationStatus !== "ready" && !needsTranslation) {
      page.translationStatus = "ready";
      changed = true;
    }
    if (page.audioStatus !== "running") {
      page.audioStatus = "running";
      changed = true;
    }
    if (page.audioEngine !== engine) {
      page.audioEngine = engine;
      changed = true;
    }
    if (!prefetch) {
      appendPageLog(page, `Generating the audiobook page with ${getNarrationBackendLabel(engine)}.`);
      changed = true;
    }
  }

  if (changed) {
    await persistLibraryBook(book);
  }
}

async function clearBookAudioCache(book) {
  const audioCacheDir = path.join(getLibraryBookDir(book.id), "audio");
  await fsp.rm(audioCacheDir, { recursive: true, force: true });
  if (s3.isConfigured()) {
    s3.deletePrefix(`library/${book.id}/audio/`).catch((err) => console.error("S3 delete error:", err.message));
  }
  for (const page of book.pages) {
    page.audioStatus = "idle";
    page.audioUrl = "";
    page.audioVoiceId = "";
    page.audioEngine = "";
    page.alignment = null;
    page.logs = [];
  }
}

async function deleteLibraryBook(bookId) {
  bookPreparationTargets.delete(bookId);
  await fsp.rm(getLibraryBookDir(bookId), { recursive: true, force: true });
  if (s3.isConfigured()) {
    s3.deletePrefix(`library/${bookId}/`).catch((err) => console.error("S3 delete error:", err.message));
  }
}

async function deleteLibraryBookPage(bookId, pageIndex) {
  const book = await readLibraryBook(bookId);
  if (!book) {
    throw new Error("That book was not found.");
  }

  if (!book.pages?.length) {
    throw new Error("That book has no pages left.");
  }

  if (book.pages.length === 1) {
    throw new Error("This book only has one page left. Delete the whole book instead.");
  }

  const safePageIndex = clampPageIndex(book, pageIndex);
  book.pages.splice(safePageIndex, 1);

  book.pages.forEach((page, index) => {
    if (!page.title || /^Page \d+$/u.test(page.title)) {
      page.title = `Page ${index + 1}`;
    }
  });

  const currentProgressIndex = Number(book.progress?.pageIndex || 0);
  const nextProgressIndex = currentProgressIndex > safePageIndex ? currentProgressIndex - 1 : currentProgressIndex;
  book.progress = {
    pageIndex: clampPageIndex(book, nextProgressIndex),
    audioTime: 0,
    updatedAt: new Date().toISOString(),
  };

  await clearBookAudioCache(book);
  await persistLibraryBook(book);
  await persistLibraryDerivedTexts(book);

  return {
    book,
    pageIndex: book.progress.pageIndex,
  };
}

async function startLibraryBookPagePreparation({ bookId, pageIndex, voiceSampleId, prefetch = false }) {
  const narrationRequest = resolveNarrationRequest({
    voiceSampleId,
    voiceSamplePath: resolveVoiceSample(voiceSampleId)?.path || "",
  });
  const requestedVoiceKey = narrationRequest.voiceKey;
  if (requestedVoiceKey !== "storybook" && !narrationBackendSupportsCustomVoiceCloning(narrationRequest.engine)) {
    throw new Error(
      "This fast PT-PT VPS engine does not support custom voice cloning yet. Pick the built-in PT-PT voice, or switch the backend back to Chatterbox for slower clone experiments."
    );
  }
  let book = await readLibraryBook(bookId);
  if (!book) {
    throw new Error("That book was not found.");
  }

  const safePageIndex = clampPageIndex(book, pageIndex);
  const page = book.pages[safePageIndex];
  if (!page) {
    throw new Error("That page was not found.");
  }

  if (!prefetch) {
    setBookPreparationTarget(bookId, requestedVoiceKey, safePageIndex);
  } else if (!shouldPreparePageForCurrentTarget(bookId, safePageIndex, requestedVoiceKey)) {
    return {
      book,
      pageIndex: safePageIndex,
      started: false,
      skipped: true,
    };
  }

  const taskKey = `${bookId}:${safePageIndex}:${buildAudioRenderKey(narrationRequest.engine, requestedVoiceKey)}`;
  const alreadyReady = pageHasReadyAudio(page, requestedVoiceKey, narrationRequest.engine);
  if (!alreadyReady && !bookPageTasks.has(taskKey)) {
    await markBookPagePreparationStarted(book, safePageIndex, requestedVoiceKey, narrationRequest.engine, prefetch);
    void ensureLibraryBookPageReady({
      bookId,
      pageIndex: safePageIndex,
      voiceSampleId: requestedVoiceKey,
      prefetch,
    }).catch(() => {});
  }

  if (!prefetch) {
    queueUpcomingBookPages(book, safePageIndex, requestedVoiceKey);
  }

  book = (await readLibraryBook(bookId)) || book;
  return {
    book,
    pageIndex: safePageIndex,
    started: !alreadyReady,
  };
}

async function ensureLibraryBookPageReady({ bookId, pageIndex, voiceSampleId, prefetch = false }) {
  const narrationRequest = resolveNarrationRequest({
    voiceSampleId,
    voiceSamplePath: resolveVoiceSample(voiceSampleId)?.path || "",
  });
  const voiceKey = narrationRequest.voiceKey;
  const taskKey = `${bookId}:${pageIndex}:${buildAudioRenderKey(narrationRequest.engine, voiceKey)}`;
  if (bookPageTasks.has(taskKey)) {
    return bookPageTasks.get(taskKey);
  }

  const task = enqueueBookPreparation(bookId, async () => {
    let book = await readLibraryBook(bookId);
    if (!book) {
      throw new Error("That book was not found.");
    }

    const safePageIndex = clampPageIndex(book, pageIndex);
    const page = book.pages[safePageIndex];
    if (!page) {
      throw new Error("That page was not found.");
    }

    if (!shouldPreparePageForCurrentTarget(bookId, safePageIndex, voiceKey)) {
      return {
        book,
        pageIndex: safePageIndex,
        skipped: true,
      };
    }

    try {
      if (book.voiceSampleId !== voiceKey) {
        book.voiceSampleId = voiceKey;
        await clearBookAudioCache(book);
        await persistLibraryBook(book);
      }

      if (!prefetch) {
        book.progress = {
          pageIndex: safePageIndex,
          audioTime: 0,
          updatedAt: new Date().toISOString(),
        };
      }

      if (!page.translatedText?.trim()) {
        if (
          book.detectedLanguage &&
          book.detectedLanguage !== "auto" &&
          normalizeTranslationProviderLanguage(book.detectedLanguage) !==
            normalizeTranslationProviderLanguage(book.audiobookLanguage)
        ) {
          page.translationStatus = "running";
          appendPageLog(page, `Translating page ${safePageIndex + 1} into ${book.audiobookLanguage.toUpperCase()}.`);
          await persistLibraryBook(book);

          const translatedText = await translateLongText({
            text: normalizeExtractedBookText(page.originalText),
            source: book.detectedLanguage,
            target: book.audiobookLanguage,
          });

          page.translatedText =
            normalizeLanguageCode(book.audiobookLanguage) === "pt-pt"
              ? normalizePortugueseForPortugal(translatedText, book.detectedLanguage)
              : translatedText;
          page.translationStatus = "ready";
          page.translationProvider = getTranslationProvider();
          page.translationProviderTarget = normalizeTranslationProviderLanguage(book.audiobookLanguage);
          appendPageLog(page, "Translation saved for this page.");
          await persistLibraryBook(book);
          await persistLibraryDerivedTexts(book);
        } else {
          page.translatedText = page.originalText;
          page.translationStatus = "ready";
          page.translationProvider = "identity";
          page.translationProviderTarget = "";
        }
      }

      if (!shouldPreparePageForCurrentTarget(bookId, safePageIndex, voiceKey)) {
        return {
          book,
          pageIndex: safePageIndex,
          skipped: true,
        };
      }

      if (!pageHasReadyAudio(page, voiceKey, narrationRequest.engine)) {
        page.audioStatus = "running";
        page.audioEngine = narrationRequest.engine;
        appendPageLog(page, `Generating the audiobook page with ${getNarrationBackendLabel(narrationRequest.engine)}.`);
        await persistLibraryBook(book);

        const bookDir = getLibraryBookDir(book.id);
        const pagesDir = path.join(bookDir, "pages");
        const audioCacheDir = path.join(bookDir, "audio");
        await fsp.mkdir(pagesDir, { recursive: true });
        await fsp.mkdir(audioCacheDir, { recursive: true });

        const pagePrefix = `page-${String(safePageIndex + 1).padStart(4, "0")}-${sanitizeVoiceKey(narrationRequest.engine)}-${sanitizeVoiceKey(voiceKey)}`;
        const inputTextPath = path.join(pagesDir, `${pagePrefix}.txt`);
        const outputWavPath = path.join(audioCacheDir, `${pagePrefix}.wav`);
        const metadataPath = path.join(audioCacheDir, `${pagePrefix}.json`);
        await fsp.writeFile(inputTextPath, normalizeText(page.translatedText || page.originalText), "utf8");
        if (s3.isConfigured()) s3.upload(inputTextPath, dataDir).catch(() => {});

        if (voiceKey !== "storybook" && !narrationBackendSupportsCustomVoiceCloning(narrationRequest.engine)) {
          throw new Error(
            "Piper does not support custom voice cloning. Use the built-in voice, or switch the backend to Chatterbox for slower clone experiments."
          );
        }

        const resolvedVoiceSample = resolveVoiceSample(voiceKey)
          ? await ensureVoiceSamplePrompt(resolveVoiceSample(voiceKey))
          : null;
        if (voiceKey !== "storybook" && !resolvedVoiceSample) {
          throw new Error("The selected custom voice is no longer available. Upload it again and retry.");
        }

        await runNarrationGeneration(
          {
            inputTextPath,
            outputWavPath,
            metadataPath,
            language: book.audiobookLanguage,
            voiceSampleId: voiceKey,
            voiceSamplePath: resolvedVoiceSample?.path || "",
            exaggeration: defaultExaggeration,
            narrationSpeed: defaultNarrationSpeed,
            cfgWeight: defaultCfgWeight,
          },
          {
            onLine: async (line) => {
              book = (await readLibraryBook(book.id)) || book;
              const livePage = book.pages[safePageIndex];
              if (!livePage) {
                return;
              }
              if (line.startsWith("PROGRESS:")) {
                const [, rawMessage = ""] = line.split("|");
                if (rawMessage) {
                  appendPageLog(livePage, rawMessage);
                  await persistLibraryBook(book);
                }
              }
            },
          }
        );

        book = (await readLibraryBook(book.id)) || book;
        const completedPage = book.pages[safePageIndex];
        completedPage.audioStatus = "ready";
        completedPage.audioVoiceId = voiceKey;
        completedPage.audioEngine = narrationRequest.engine;
        completedPage.audioUrl = `/library-assets/${book.id}/audio/${path.basename(outputWavPath)}`;
        if (fs.existsSync(metadataPath)) {
          completedPage.alignment = JSON.parse(await fsp.readFile(metadataPath, "utf8"));
        }
        if (s3.isConfigured()) {
          if (fs.existsSync(outputWavPath)) s3.upload(outputWavPath, dataDir).catch(() => {});
          if (fs.existsSync(metadataPath)) s3.upload(metadataPath, dataDir).catch(() => {});
        }
        appendPageLog(completedPage, "Audiobook page ready.");
        await persistLibraryBook(book);
      }

      return {
        book,
        pageIndex: safePageIndex,
      };
    } catch (error) {
      book = (await readLibraryBook(bookId)) || book;
      const failedPage = book.pages?.[safePageIndex];
      if (failedPage) {
        if (failedPage.translationStatus === "running") {
          failedPage.translationStatus = bookPageNeedsTranslation(book) ? "idle" : "source";
        }
        if (failedPage.audioStatus === "running") {
          failedPage.audioStatus = "idle";
        }
        failedPage.audioUrl = "";
        failedPage.audioVoiceId = "";
        failedPage.audioEngine = "";
        failedPage.alignment = null;
        appendPageLog(failedPage, `Generation failed: ${error.message}`);
        await persistLibraryBook(book).catch(() => {});
      }
      throw error;
    }
  });

  bookPageTasks.set(taskKey, task);
  try {
    return await task;
  } finally {
    bookPageTasks.delete(taskKey);
  }
}

function truncateText(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function loadVoiceRegistry() {
  if (!fs.existsSync(voicesDir)) {
    return;
  }

  const entries = fs.readdirSync(voicesDir).filter((entry) => entry.endsWith(".json"));
  for (const entry of entries) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.join(voicesDir, entry), "utf8"));
      if (payload?.id && payload?.path && fs.existsSync(payload.path)) {
        registerVoiceSample(payload);
      }
    } catch {
      // Ignore malformed metadata files and keep booting the app.
    }
  }
}

function registerVoiceSample(voiceSample) {
  const normalizedLanguage = normalizeLanguageCode(voiceSample.language || "pt-pt");
  voiceRegistry.set(voiceSample.id, {
    ...voiceSample,
    language: normalizedLanguage === "pt" ? "pt-pt" : normalizedLanguage,
  });
}

function resolveVoiceSample(voiceSampleId) {
  if (!voiceSampleId || builtInVoiceSamples.some((sample) => sample.id === voiceSampleId)) {
    return null;
  }
  return voiceRegistry.get(voiceSampleId) || null;
}

function toPublicVoiceSample(voiceSample) {
  return {
    id: voiceSample.id,
    name: voiceSample.name,
    language: voiceSample.language,
    url: voiceSample.url,
    builtIn: voiceSample.builtIn,
    vibe: voiceSample.vibe || "Custom voice sample",
  };
}

function getPublicVoiceSamples() {
  return [...voiceRegistry.values()].map(toPublicVoiceSample);
}

async function deleteVoiceSampleAssets(voiceSample) {
  const metadataPath = path.join(voicesDir, `${voiceSample.id}.json`);
  const pathsToDelete = [voiceSample.path, voiceSample.originalPath, metadataPath].filter(Boolean);

  await Promise.allSettled(pathsToDelete.map((filePath) => fsp.rm(filePath, { force: true })));
  if (s3.isConfigured()) {
    s3.deletePrefix(`voices/${voiceSample.id}.`).catch(() => {});
  }
  voiceRegistry.delete(voiceSample.id);
}
