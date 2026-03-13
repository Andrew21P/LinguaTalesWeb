import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
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
const defaultExaggeration = Number(process.env.DEFAULT_EXAGGERATION || 0.58);
const defaultCfgWeight = Number(process.env.DEFAULT_CFG_WEIGHT || 0.32);

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const uploadsDir = path.join(dataDir, "uploads");
const voicesDir = path.join(dataDir, "voices");
const audioDir = path.join(dataDir, "audio");
const tmpDir = path.join(rootDir, "tmp");
const jobsDir = path.join(dataDir, "jobs");

for (const dir of [dataDir, uploadsDir, voicesDir, audioDir, tmpDir, jobsDir]) {
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

loadVoiceRegistry();

app.use(express.json({ limit: "8mb" }));
app.use(express.static(publicDir));
app.use("/audio", express.static(audioDir));
app.use("/voices", express.static(voicesDir));

app.get("/api/meta", (_req, res) => {
  res.json({
    ok: true,
    sourceLanguages: sourceLanguageCatalog,
    listenerLanguages: listenerLanguageCatalog,
    audiobookLanguages: audiobookLanguageCatalog,
    fullySupportedLanguages: audiobookLanguageCatalog,
    voiceSamples: [...builtInVoiceSamples, ...getPublicVoiceSamples()],
    defaults: {
      exaggeration: defaultExaggeration,
      cfgWeight: defaultCfgWeight,
    },
    modelInfo: {
      active: "Chatterbox Multilingual",
      note: "Portuguese (Portugal) narration is the fully supported output today, with OCR, source-language detection, and PT-BR to PT-PT phrasing normalization in the pipeline.",
    },
  });
});

app.post("/api/book/extract", upload.single("bookFile"), async (req, res) => {
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
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/voice-sample", upload.single("voiceSample"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      error: "No voice sample was uploaded.",
    });
  }

  const id = crypto.randomUUID();
  const fileName = `${id}.wav`;
  const finalPath = path.join(voicesDir, fileName);
  const metadataPath = path.join(voicesDir, `${id}.json`);

  await transcodeVoiceSampleToWav(req.file.path, finalPath);

  const voiceSample = {
    id,
    name: req.body.name?.trim() || "My Voice Sample",
    language: normalizeLanguageCode(req.body.language?.trim() || "pt-pt"),
    url: `/voices/${fileName}`,
    path: finalPath,
    builtIn: false,
    vibe: "Uploaded custom clone sample",
  };

  registerVoiceSample(voiceSample);
  await fsp.writeFile(metadataPath, JSON.stringify(voiceSample, null, 2), "utf8");

  return res.json({
    ok: true,
    voiceSample: toPublicVoiceSample(voiceSample),
  });
});

app.post("/api/audiobook/generate", async (req, res) => {
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

app.get("/api/audiobook/status/:jobId", async (req, res) => {
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

app.post("/api/translate", async (req, res) => {
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
  console.log(`LinguaTales listening on http://${host}:${port}`);
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
  }

  if (config.language === "pt-pt") {
    job.logs.push("Normalizing Portuguese phrasing toward PT-PT before narration.");
    workingText = normalizePortugueseForPortugal(workingText, config.sourceLanguage);
  }

  if (workingText !== originalText) {
    const normalizedTextPath = path.join(path.dirname(config.inputTextPath), "book.normalized.txt");
    await fsp.writeFile(normalizedTextPath, workingText, "utf8");
    effectiveInputTextPath = normalizedTextPath;
  }

  job.readerText = workingText;
  job.readerChapters = splitIntoChapters(workingText);
  job.readerLanguage = config.language;
  await persistJob(config.jobId, job);

  const args = [
    path.join(rootDir, "scripts", "generate_audiobook.py"),
    "--input",
    effectiveInputTextPath,
    "--output",
    config.outputWavPath,
    "--metadata-output",
    config.metadataPath,
    "--language",
    normalizeNarrationModelLanguage(config.language),
    "--exaggeration",
    String(config.exaggeration),
    "--cfg-weight",
    String(config.cfgWeight),
  ];

  if (config.voiceSamplePath) {
    args.push("--voice-sample", config.voiceSamplePath);
  }

  await runPythonStreaming(args, {
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
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-af",
    [
      "silenceremove=start_periods=1:start_silence=0.2:start_threshold=-40dB:stop_periods=-1:stop_silence=0.25:stop_threshold=-40dB",
      "highpass=f=65",
      "lowpass=f=14200",
      "afftdn=nr=10:nf=-32",
      "acompressor=threshold=-19dB:ratio=2.0:attack=8:release=75:makeup=1.5",
      "alimiter=limit=0.96",
    ].join(","),
    "-ac",
    "1",
    "-ar",
    "24000",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);

  await fsp.rm(inputPath, { force: true });
}

async function ensureVoiceSamplePrompt(voiceSample) {
  if (!voiceSample?.path) {
    return null;
  }

  if (path.extname(voiceSample.path).toLowerCase() === ".wav" && fs.existsSync(voiceSample.path)) {
    return voiceSample;
  }

  const normalizedPath = path.join(voicesDir, `${voiceSample.id}.wav`);
  await transcodeVoiceSampleToWav(voiceSample.path, normalizedPath);

  const normalizedVoiceSample = {
    ...voiceSample,
    path: normalizedPath,
    url: `/voices/${voiceSample.id}.wav`,
  };

  registerVoiceSample(normalizedVoiceSample);
  await fsp.writeFile(
    path.join(voicesDir, `${voiceSample.id}.json`),
    JSON.stringify(normalizedVoiceSample, null, 2),
    "utf8"
  );

  return normalizedVoiceSample;
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

  const provider = process.env.DEFAULT_TRANSLATION_PROVIDER || "mymemory";
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

function chunkTextForTranslation(text, maxChunkLength = 420) {
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
