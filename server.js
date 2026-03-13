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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const pythonBin = process.env.PYTHON_BIN || "python3";
const defaultExaggeration = Number(process.env.DEFAULT_EXAGGERATION || 0.52);
const defaultNarrationSpeed = Number(process.env.DEFAULT_NARRATION_SPEED || 0.94);
const defaultCfgWeight = Number(process.env.DEFAULT_CFG_WEIGHT || 0.28);
const minVoicePromptSeconds = Number(process.env.MIN_VOICE_PROMPT_SECONDS || 2.4);

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

for (const dir of [dataDir, uploadsDir, voicesDir, audioDir, libraryDir, tmpDir, jobsDir]) {
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
let chatterboxWorker = null;
let chatterboxWorkerStdoutRemainder = "";
let chatterboxWorkerStderrRemainder = "";
let chatterboxWorkerActiveJob = null;
let chatterboxWorkerQueue = Promise.resolve();
const appAccountEmail = (process.env.APP_ACCOUNT_EMAIL || "eleonorashatkovska@gmail.com").trim().toLowerCase();
const appAccountPassword = process.env.APP_ACCOUNT_PASSWORD || "1234";
const appAccountName = (process.env.APP_ACCOUNT_NAME || "Eleonora Shatkovska").trim();
const appSessionSecret = process.env.APP_SESSION_SECRET || `${appAccountEmail}:${appAccountPassword}:voxenor`;
const sessionCookieName = "voxenor_session";
const sessionDurationMs = 1000 * 60 * 60 * 24 * 30;

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
const audiobookLanguageCatalog = [{ code: "pt-pt", locale: "pt-PT", label: "Portuguese (Portugal)" }];

const builtInVoiceSamples = [
  {
    id: "storybook",
    name: "Lusophone Studio",
    language: "pt-pt",
    vibe: "Portuguese (Portugal) narrator profile",
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

const accountProfile = {
  email: appAccountEmail,
  name: appAccountName,
  nativeLanguages: [
    normalizeLanguageCode(process.env.APP_ACCOUNT_NATIVE_LANGUAGE_PRIMARY || "ru"),
    normalizeLanguageCode(process.env.APP_ACCOUNT_NATIVE_LANGUAGE_SECONDARY || "uk"),
  ].filter(Boolean),
  fluentLanguages: [normalizeLanguageCode(process.env.APP_ACCOUNT_FLUENT_LANGUAGE || "en")].filter(Boolean),
  learningLanguage: normalizeLanguageCode(process.env.APP_ACCOUNT_LEARNING_LANGUAGE || "pt-pt"),
};
let userPreferences = loadUserPreferences();

loadVoiceRegistry();

app.use(express.json({ limit: "8mb" }));
app.use(express.static(publicDir));
app.use("/audio", requireSession, express.static(audioDir));
app.use("/voices", requireSession, express.static(voicesDir));
app.use("/library-assets", requireSession, express.static(libraryDir));

app.get("/api/session", (req, res) => {
  const session = getSessionFromRequest(req);
  return res.json({
    ok: true,
    authenticated: Boolean(session),
    profile: session ? getPublicProfile() : null,
  });
});

app.post("/api/session/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (email !== appAccountEmail || password !== appAccountPassword) {
    return res.status(401).json({
      ok: false,
      error: "Invalid email or password.",
    });
  }

  const token = createSessionToken(appAccountEmail);
  setSessionCookie(res, token);
  return res.json({
    ok: true,
    authenticated: true,
    profile: getPublicProfile(),
  });
});

app.post("/api/session/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

app.get("/api/meta", requireSession, (_req, res) => {
  res.json({
    ok: true,
    appName,
    sourceLanguages: sourceLanguageCatalog,
    listenerLanguages: listenerLanguageCatalog,
    audiobookLanguages: audiobookLanguageCatalog,
    fullySupportedLanguages: audiobookLanguageCatalog,
    voiceSamples: [...builtInVoiceSamples, ...getPublicVoiceSamples()],
    profile: getPublicProfile(),
    preferences: userPreferences,
    localAccessUrls: getLocalAccessUrls(port),
    defaults: {
      exaggeration: defaultExaggeration,
      narrationSpeed: defaultNarrationSpeed,
      cfgWeight: defaultCfgWeight,
    },
    modelInfo: {
      active: "Chatterbox Multilingual",
      note: "Portuguese (Portugal) narration is the fully supported output today, with OCR, source-language detection, and a warm local Chatterbox worker for faster repeat jobs.",
    },
  });
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
      error: error.message,
    });
  }
});

app.post("/api/preferences", requireSession, async (req, res) => {
  try {
    const updates = {
      listenerLanguage: normalizeLanguageCode(req.body?.listenerLanguage || userPreferences.listenerLanguage || "en"),
      audiobookLanguage: normalizeLanguageCode(req.body?.audiobookLanguage || userPreferences.audiobookLanguage || "pt-pt"),
      sourceLanguage: normalizeLanguageCode(req.body?.sourceLanguage || userPreferences.sourceLanguage || "auto"),
      selectedVoiceId: String(req.body?.selectedVoiceId || userPreferences.selectedVoiceId || "storybook"),
    };

    userPreferences = {
      ...userPreferences,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await persistUserPreferences();

    return res.json({
      ok: true,
      preferences: userPreferences,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/api/books", requireSession, async (_req, res) => {
  try {
    const books = await listLibraryBooks();
    return res.json({
      ok: true,
      books: books.map(toPublicBookSummary),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/books/import", requireSession, upload.single("bookFile"), async (req, res) => {
  try {
    const imported = await createLibraryBookFromRequest(req);
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
      error: error.message,
    });
  }
});

app.delete("/api/books/:bookId", requireSession, async (req, res) => {
  try {
    const book = await readLibraryBook(req.params.bookId);
    if (!book) {
      return res.status(404).json({
        ok: false,
        error: "That book was not found.",
      });
    }

    await deleteLibraryBook(req.params.bookId);
    return res.json({
      ok: true,
      deletedBookId: req.params.bookId,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/api/books/:bookId", requireSession, async (req, res) => {
  try {
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
      error: error.message,
    });
  }
});

app.get("/api/books/:bookId/pages/:pageIndex", requireSession, async (req, res) => {
  try {
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
      error: error.message,
    });
  }
});

app.delete("/api/books/:bookId/pages/:pageIndex", requireSession, async (req, res) => {
  try {
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
      error: error.message,
    });
  }
});

app.post("/api/books/:bookId/progress", requireSession, async (req, res) => {
  try {
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
      error: error.message,
    });
  }
});

app.post("/api/books/:bookId/pages/:pageIndex/prepare", requireSession, async (req, res) => {
  try {
    const prepared = await ensureLibraryBookPageReady({
      bookId: req.params.bookId,
      pageIndex: Number(req.params.pageIndex),
      voiceSampleId: String(req.body?.voiceSampleId || "storybook"),
    });

    return res.json({
      ok: true,
      book: toPublicBook(prepared.book),
      page: toPublicBookPage(prepared.book, prepared.pageIndex),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
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
      error: error.message,
    });
  }
});

app.delete("/api/voice-sample/:voiceSampleId", requireSession, async (req, res) => {
  try {
    const voiceSampleId = String(req.params.voiceSampleId || "").trim();
    if (!voiceSampleId) {
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
      error: error.message,
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

    const result = await translateText({
      text,
      source,
      target,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, host, () => {
  console.log(`Voxenor listening on http://${host}:${port}`);
});

async function runGenerationJob(config) {
  const job = jobs.get(config.jobId);
  if (!job) {
    return;
  }

  job.status = "running";
  job.progress = 5;
  job.logs.push("Preparing Chatterbox generation.");
  job.sourceLanguage = config.sourceLanguage;
  job.listenerLanguage = config.listenerLanguage;
  job.audiobookLanguage = config.language;
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

  await runChatterboxGeneration({
    inputTextPath: effectiveInputTextPath,
    outputWavPath: config.outputWavPath,
    metadataPath: config.metadataPath,
    language: config.language,
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

function buildGenerateAudiobookArgs(config) {
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
    await runPythonStreaming(buildGenerateAudiobookArgs(config), handlers);
  }
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

function normalizeText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
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

function normalizeNarrationModelLanguage(language) {
  const code = normalizeLanguageCode(language);
  if (code === "pt-br" || code === "pt-pt" || code === "pt") {
    return "pt";
  }
  return code;
}

function normalizeTranslationProviderLanguage(language) {
  const code = normalizeLanguageCode(language);
  if (code === "pt-br" || code === "pt-pt") {
    return "pt";
  }
  return code;
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

function extensionForMime(mime, originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  if (ext) {
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

  const provider = process.env.DEFAULT_TRANSLATION_PROVIDER || "google-web";
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
    .replace(/\bnumero\b/giu, (match) => applySourceCasing(match, "número"));

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

function getPublicProfile() {
  return {
    email: accountProfile.email,
    name: accountProfile.name,
    nativeLanguages: accountProfile.nativeLanguages,
    fluentLanguages: accountProfile.fluentLanguages,
    learningLanguage: accountProfile.learningLanguage,
  };
}

function loadUserPreferences() {
  const fallback = {
    sourceLanguage: "auto",
    listenerLanguage: normalizeLanguageCode(process.env.APP_ACCOUNT_INTERFACE_LANGUAGE || "en"),
    audiobookLanguage: accountProfile.learningLanguage || "pt-pt",
    selectedVoiceId: "storybook",
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
    };
  } catch {
    return fallback;
  }
}

async function persistUserPreferences() {
  await fsp.writeFile(preferencesPath, JSON.stringify(userPreferences, null, 2), "utf8");
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

function createSessionToken(email) {
  const expiresAt = Date.now() + sessionDurationMs;
  const payload = `${email}|${expiresAt}`;
  const signature = crypto.createHmac("sha256", appSessionSecret).update(payload).digest("hex");
  return `${payload}|${signature}`;
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[sessionCookieName];
  if (!token) {
    return null;
  }

  const [email, expiresAtRaw, signature] = token.split("|");
  const payload = `${email}|${expiresAtRaw}`;
  const expectedSignature = crypto.createHmac("sha256", appSessionSecret).update(payload).digest("hex");
  const expiresAt = Number(expiresAtRaw);
  if (
    !email ||
    email !== appAccountEmail ||
    !signature ||
    signature !== expectedSignature ||
    !Number.isFinite(expiresAt) ||
    expiresAt < Date.now()
  ) {
    return null;
  }

  return {
    email,
    expiresAt,
  };
}

function setSessionCookie(res, token) {
  const maxAge = Math.floor(sessionDurationMs / 1000);
  res.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
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

  req.session = session;
  return next();
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
      return null;
    }
    const book = JSON.parse(await fsp.readFile(metadataPath, "utf8"));
    const { book: sanitizedBook, changed } = await sanitizeLibraryBookState(book);
    if (changed) {
      await persistLibraryBook(sanitizedBook);
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
  await fsp.writeFile(getLibraryBookMetadataPath(book.id), JSON.stringify(book, null, 2), "utf8");
}

async function persistLibraryDerivedTexts(book) {
  const bookDir = getLibraryBookDir(book.id);
  await fsp.mkdir(bookDir, { recursive: true });
  const originalText = normalizeText(book.pages.map((page) => page.originalText).join("\n\n"));
  await fsp.writeFile(path.join(bookDir, "original.txt"), originalText, "utf8");

  const translatedPages = book.pages.some((page) => page.translatedText?.trim());
  if (!translatedPages) {
    return;
  }

  const translatedText = normalizeText(book.pages.map((page) => page.translatedText || page.originalText).join("\n\n"));
  await fsp.writeFile(path.join(bookDir, `translated.${book.audiobookLanguage}.txt`), translatedText, "utf8");
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

function bookPageNeedsTranslation(book) {
  return (
    book.detectedLanguage &&
    book.detectedLanguage !== "auto" &&
    normalizeTranslationProviderLanguage(book.detectedLanguage) !==
      normalizeTranslationProviderLanguage(book.audiobookLanguage || "pt-pt")
  );
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

async function sanitizeLibraryBookState(book) {
  let changed = false;
  const needsTranslation = bookPageNeedsTranslation(book);

  for (const page of book.pages || []) {
    const audioPath = resolveLibraryAudioFilePath(book.id, page.audioUrl);
    const audioExists = audioPath ? fs.existsSync(audioPath) : false;

    if (page.translationStatus === "running" && !page.translatedText?.trim()) {
      page.translationStatus = needsTranslation ? "idle" : "source";
      changed = true;
    }

    if (page.translatedText?.trim()) {
      if (page.translationStatus !== "ready") {
        page.translationStatus = "ready";
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
    if (hasInconsistentAudio || hasMissingAudioFile) {
      if (audioPath && audioExists) {
        await fsp.rm(audioPath, { force: true }).catch(() => {});
      }
      page.audioStatus = "idle";
      page.audioUrl = "";
      page.audioVoiceId = "";
      page.alignment = null;
      if (hasInconsistentAudio) {
        page.logs = [...(page.logs || []).slice(-6), "Reset an out-of-sync page so you can generate it again cleanly."];
      }
      changed = true;
    } else if (page.audioStatus === "running" && !page.audioUrl) {
      page.audioStatus = "idle";
      changed = true;
    } else if (page.audioUrl && page.audioStatus !== "ready") {
      page.audioStatus = "ready";
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
      ready: Boolean(page.audioUrl),
    })),
  };
}

function toPublicBookPage(book, pageIndex) {
  const safePageIndex = clampPageIndex(book, pageIndex);
  const page = book.pages[safePageIndex];
  return {
    index: safePageIndex,
    title: page.title || `Page ${safePageIndex + 1}`,
    sourceText: page.originalText,
    translatedText: page.translatedText || "",
    displayText: page.translatedText || page.originalText,
    translationStatus: page.translationStatus || "idle",
    audioStatus: page.audioStatus || "idle",
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
  const extractedText = normalizeText(extraction.text || "");
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
    const coverPath = path.join(bookDir, "cover.jpg");
    await maybeCreateBookCover(sourcePath, req.file.originalname, coverPath);
  }

  const coverUrl = fs.existsSync(path.join(bookDir, "cover.jpg")) ? `/library-assets/${bookId}/cover.jpg` : "";
  const pages = paginateBookText(extractedText).map((pageText, index) => ({
    title: `Page ${index + 1}`,
    originalText: pageText,
    translatedText: "",
    translationStatus: "idle",
    audioStatus: "idle",
    audioUrl: "",
    alignment: null,
    logs: [],
  }));

  const book = {
    id: bookId,
    title: extraction.title || requestedTitle || "Untitled Book",
    sourceType,
    originalFileName,
    sourceLanguageHint,
    detectedLanguage: normalizeLanguageCode(extraction.detectedLanguage || sourceLanguageHint || "auto"),
    listenerLanguage,
    audiobookLanguage,
    contentFingerprint,
    sourceFileFingerprint,
    voiceSampleId: userPreferences.selectedVoiceId || "storybook",
    coverUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: {
      pageIndex: 0,
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

function sanitizeVoiceKey(voiceKey) {
  return String(voiceKey || "storybook").replace(/[^a-z0-9_-]+/gi, "-");
}

function pageHasReadyAudio(page, voiceKey) {
  return page?.audioStatus === "ready" && page?.audioVoiceId === voiceKey && Boolean(page?.audioUrl);
}

function appendPageLog(page, message) {
  page.logs = [...(page.logs || []), message].slice(-8);
}

async function clearBookAudioCache(book) {
  const audioCacheDir = path.join(getLibraryBookDir(book.id), "audio");
  await fsp.rm(audioCacheDir, { recursive: true, force: true });
  for (const page of book.pages) {
    page.audioStatus = "idle";
    page.audioUrl = "";
    page.audioVoiceId = "";
    page.alignment = null;
    page.logs = [];
  }
}

async function deleteLibraryBook(bookId) {
  await fsp.rm(getLibraryBookDir(bookId), { recursive: true, force: true });
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

async function ensureLibraryBookPageReady({ bookId, pageIndex, voiceSampleId, prefetch = false }) {
  const voiceKey = resolveBookVoiceKey(voiceSampleId);
  const taskKey = `${bookId}:${pageIndex}:${voiceKey}`;
  if (bookPageTasks.has(taskKey)) {
    return bookPageTasks.get(taskKey);
  }

  const task = (async () => {
    let book = await readLibraryBook(bookId);
    if (!book) {
      throw new Error("That book was not found.");
    }

    const safePageIndex = clampPageIndex(book, pageIndex);
    const page = book.pages[safePageIndex];
    if (!page) {
      throw new Error("That page was not found.");
    }

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
          text: page.originalText,
          source: book.detectedLanguage,
          target: book.audiobookLanguage,
        });

        page.translatedText =
          normalizeLanguageCode(book.audiobookLanguage) === "pt-pt"
            ? normalizePortugueseForPortugal(translatedText, book.detectedLanguage)
            : translatedText;
        page.translationStatus = "ready";
        appendPageLog(page, "Translation saved for this page.");
        await persistLibraryBook(book);
        await persistLibraryDerivedTexts(book);
      } else {
        page.translatedText = page.originalText;
        page.translationStatus = "ready";
      }
    }

    if (!pageHasReadyAudio(page, voiceKey)) {
      page.audioStatus = "running";
      appendPageLog(page, "Generating the audiobook page.");
      await persistLibraryBook(book);

      const bookDir = getLibraryBookDir(book.id);
      const pagesDir = path.join(bookDir, "pages");
      const audioCacheDir = path.join(bookDir, "audio");
      await fsp.mkdir(pagesDir, { recursive: true });
      await fsp.mkdir(audioCacheDir, { recursive: true });

      const pagePrefix = `page-${String(safePageIndex + 1).padStart(4, "0")}-${sanitizeVoiceKey(voiceKey)}`;
      const inputTextPath = path.join(pagesDir, `${pagePrefix}.txt`);
      const outputWavPath = path.join(audioCacheDir, `${pagePrefix}.wav`);
      const metadataPath = path.join(audioCacheDir, `${pagePrefix}.json`);
      await fsp.writeFile(inputTextPath, normalizeText(page.translatedText || page.originalText), "utf8");

      const resolvedVoiceSample = resolveVoiceSample(voiceKey)
        ? await ensureVoiceSamplePrompt(resolveVoiceSample(voiceKey))
        : null;
      if (voiceKey !== "storybook" && !resolvedVoiceSample) {
        throw new Error("The selected custom voice is no longer available. Upload it again and retry.");
      }

      await runChatterboxGeneration(
        {
          inputTextPath,
          outputWavPath,
          metadataPath,
          language: book.audiobookLanguage,
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
      completedPage.audioUrl = `/library-assets/${book.id}/audio/${path.basename(outputWavPath)}`;
      if (fs.existsSync(metadataPath)) {
        completedPage.alignment = JSON.parse(await fsp.readFile(metadataPath, "utf8"));
      }
      appendPageLog(completedPage, "Audiobook page ready.");
      await persistLibraryBook(book);
    }

    if (!prefetch && safePageIndex + 1 < book.pages.length) {
      void ensureLibraryBookPageReady({
        bookId,
        pageIndex: safePageIndex + 1,
        voiceSampleId: voiceKey,
        prefetch: true,
      }).catch(() => {});
    }

    return {
      book,
      pageIndex: safePageIndex,
    };
  })();

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
  voiceRegistry.delete(voiceSample.id);
}
