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
const defaultExaggeration = Number(process.env.DEFAULT_EXAGGERATION || 0.42);
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

const languageCatalog = [
  { code: "pt", label: "Portuguese" },
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

const builtInVoiceSamples = [
  {
    id: "storybook",
    name: "Storybook Default",
    language: "pt",
    vibe: "Warm and intimate narration",
    builtIn: true,
  },
  {
    id: "midnight",
    name: "Midnight Velvet",
    language: "en",
    vibe: "Slow cinematic performance",
    builtIn: true,
  },
  {
    id: "ember",
    name: "Ember Stage",
    language: "es",
    vibe: "Expressive storyteller energy",
    builtIn: true,
  },
];

loadVoiceRegistry();

app.use(express.json({ limit: "8mb" }));
app.use(express.static(publicDir));
app.use("/audio", express.static(audioDir));
app.use("/voices", express.static(voicesDir));

app.get("/api/meta", (_req, res) => {
  res.json({
    ok: true,
    languages: languageCatalog,
    voiceSamples: [...builtInVoiceSamples, ...getPublicVoiceSamples()],
    defaults: {
      exaggeration: defaultExaggeration,
      cfgWeight: defaultCfgWeight,
    },
    modelInfo: {
      active: "Chatterbox Multilingual",
      note: "Official Portuguese-capable model from the Chatterbox family.",
    },
  });
});

app.post("/api/book/extract", upload.single("bookFile"), async (req, res) => {
  try {
    const manualText = req.body.text?.trim();
    const title = (req.body.title || "Untitled Story").trim();

    if (manualText) {
      const normalized = normalizeText(manualText);
      return res.json({
        ok: true,
        title,
        text: normalized,
        chapters: splitIntoChapters(normalized),
        source: "manual",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "Please paste text or upload a PDF / EPUB file.",
      });
    }

    const extraction = await runPythonJson("scripts/extract_book.py", [
      req.file.path,
      req.file.originalname,
    ]);

    return res.json({
      ok: true,
      title: extraction.title || title,
      text: extraction.text,
      chapters: extraction.chapters?.length
        ? extraction.chapters
        : splitIntoChapters(extraction.text),
      source: extraction.source || path.extname(req.file.originalname).slice(1),
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
    language: req.body.language?.trim() || "pt",
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
  const { title, text, language, voiceSampleId, exaggeration, cfgWeight } = req.body || {};

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
    language: language || "pt",
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
  await persistJob(config.jobId, job);

  const args = [
    path.join(rootDir, "scripts", "generate_audiobook.py"),
    "--input",
    config.inputTextPath,
    "--output",
    config.outputWavPath,
    "--metadata-output",
    config.metadataPath,
    "--language",
    config.language,
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
    "silenceremove=start_periods=1:start_silence=0.2:start_threshold=-40dB:stop_periods=-1:stop_silence=0.25:stop_threshold=-40dB",
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
        source,
        target,
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

  const langPair = `${source === "auto" ? "pt" : source}|${target}`;
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
  voiceRegistry.set(voiceSample.id, voiceSample);
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
