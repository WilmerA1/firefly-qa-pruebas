'use strict';

/**
 * Reporter de Playwright para QAtlas (#570).
 *
 * Sin dependencias (usa `fetch`/`FormData`/`Blob` de Node >= 18). Al terminar
 * la corrida envía los resultados a `POST /test-runs/ingest` — que crea la
 * ejecución si hace falta — y después sube la evidencia (captura, video,
 * trace) de los tests que fallaron a cada caso ejecutado.
 *
 * Nunca rompe tu corrida de pruebas: si QAtlas no responde o la configuración
 * está incompleta, avisa por consola y sigue (salvo `failOnError: true`).
 */

const fs = require('node:fs');
const path = require('node:path');

const ANSI = /\u001b\[[0-9;]*m/g;
const CASE_CODE = /^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*-TC-\d+$/;
const CASE_CODE_IN_TITLE = /@([A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*-TC-\d+)/;
const MAX_ERROR_CHARS = 4000;
// Mismos topes que el backend (attachments/service.py): 10 MB por archivo, 50 MB para video, 10 por caso.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_CASE = 10;
const ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf',
  'application/zip', 'application/json', 'text/plain', 'text/csv', 'application/xml', 'text/markdown',
  'video/webm', 'video/mp4',
]);

const EXTENSIONS = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
  'application/pdf': '.pdf', 'application/zip': '.zip', 'application/json': '.json',
  'text/plain': '.txt', 'text/csv': '.csv', 'text/markdown': '.md', 'application/xml': '.xml',
  'video/webm': '.webm', 'video/mp4': '.mp4',
};

const truthy = (value) => ['1', 'true', 'yes', 'si'].includes(String(value ?? '').toLowerCase());

/** Título legible → id de automatización: "Bloque › título" (o solo el título). */
function defaultAutomationId(test) {
  const blocks = [];
  for (let suite = test.parent; suite; suite = suite.parent) {
    if (suite.type === 'describe' && suite.title) blocks.unshift(suite.title);
  }
  return [...blocks, test.title].join(' › ');
}

/** Cómo identificar el caso de QAtlas: anotación > tag/título > id de automatización. */
function identify(test, automationIdOf) {
  const annotation = (test.annotations || []).find((a) => a.type === 'qatlas' && a.description);
  if (annotation) {
    const value = String(annotation.description).trim();
    return CASE_CODE.test(value) ? { test_case_code: value } : { automation_id: value };
  }
  const tag = (test.tags || []).map((t) => String(t).replace(/^@/, '')).find((t) => CASE_CODE.test(t));
  if (tag) return { test_case_code: tag };
  const inTitle = CASE_CODE_IN_TITLE.exec(test.title);
  if (inTitle) return { test_case_code: inTitle[1] };
  return { automation_id: automationIdOf(test) };
}

function statusOf(test) {
  switch (test.outcome()) {
    case 'skipped': return 'skipped';
    case 'unexpected': return 'failed';
    default: return 'passed'; // expected / flaky (pasó tras reintentos)
  }
}

function errorMessageOf(result) {
  const error = result.error || (result.errors || [])[0];
  if (!error) return undefined;
  const text = String(error.message || error.value || error).replace(ANSI, '').trim();
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS)}…` : text;
}

function stepsOf(result) {
  return (result.steps || [])
    .filter((step) => step.category === 'test.step')
    .map((step) => ({
      title: step.title,
      status: step.error ? 'failed' : 'passed',
      error_message: step.error ? String(step.error.message || '').replace(ANSI, '').trim() : undefined,
    }));
}

function ciRunId(env) {
  if (env.GITHUB_RUN_ID) return `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT || 1}`;
  if (env.CI_PIPELINE_ID) return `gl-${env.CI_PIPELINE_ID}`;
  if (env.BUILD_TAG || env.BUILD_ID) return `jenkins-${env.BUILD_TAG || env.BUILD_ID}`;
  return undefined;
}

function defaultRunName(env) {
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  if (env.GITHUB_RUN_NUMBER) return `Playwright #${env.GITHUB_RUN_NUMBER}`;
  return `Playwright ${when}`;
}

/** Contexto de la corrida en CI, tomado de las variables de entorno de cada proveedor. */
function ciContext(env) {
  const branch = env.GITHUB_REF_NAME || env.CI_COMMIT_REF_NAME || env.GIT_BRANCH || env.BRANCH_NAME;
  const commit = env.GITHUB_SHA || env.CI_COMMIT_SHA || env.GIT_COMMIT;
  const build = env.GITHUB_RUN_NUMBER || env.CI_PIPELINE_IID || env.BUILD_NUMBER;
  let ciUrl = env.CI_PIPELINE_URL || env.BUILD_URL;
  if (!ciUrl && env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY) {
    ciUrl = `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  }
  return { branch, commit_sha: commit, build, ci_url: ciUrl };
}

class QAtlasReporter {
  constructor(options = {}) {
    const env = process.env;
    this.url = String(options.url ?? env.QATLAS_URL ?? '').replace(/\/+$/, '');
    this.token = options.token ?? env.QATLAS_TOKEN;
    this.project = options.project ?? env.QATLAS_PROJECT;
    this.runName = options.runName ?? env.QATLAS_RUN_NAME ?? defaultRunName(env);
    this.externalId = options.externalId ?? env.QATLAS_RUN_ID ?? ciRunId(env);
    this.createMissingCases = options.createMissingCases ?? truthy(env.QATLAS_CREATE_MISSING_CASES);
    this.createBugOnFailure = options.createBugOnFailure ?? truthy(env.QATLAS_CREATE_BUG_ON_FAILURE);
    this.attachments = options.attachments ?? env.QATLAS_ATTACHMENTS ?? 'failed'; // failed | all | none
    this.onlyProject = options.onlyProject ?? env.QATLAS_ONLY_PROJECT;
    this.failOnError = options.failOnError ?? truthy(env.QATLAS_FAIL_ON_ERROR);
    this.automationId = options.automationId ?? defaultAutomationId;
    // Contexto de la corrida: opciones > QATLAS_* > variables del CI detectado.
    const ci = ciContext(env);
    this.context = {
      environment: options.environment ?? env.QATLAS_ENVIRONMENT,
      browser: options.browser ?? env.QATLAS_BROWSER,
      build: options.build ?? env.QATLAS_BUILD ?? ci.build,
      branch: options.branch ?? env.QATLAS_BRANCH ?? ci.branch,
      commit_sha: options.commitSha ?? env.QATLAS_COMMIT ?? ci.commit_sha,
      ci_url: options.ciUrl ?? env.QATLAS_CI_URL ?? ci.ci_url,
    };
    // Compuerta de calidad: si el % de aprobación queda por debajo, la corrida falla.
    const gate = options.minPassRate ?? env.QATLAS_MIN_PASS_RATE;
    this.minPassRate = gate === undefined || gate === '' ? undefined : Number(gate);
    this.tests = new Map();
  }

  printsToStdio() {
    return false;
  }

  onTestEnd(test, result) {
    // Los reintentos llegan en orden: el último resultado de cada test es el final.
    this.tests.set(test.id, { test, result });
  }

  log(message) {
    console.log(`[QAtlas] ${message}`);
  }

  warn(message) {
    console.warn(`[QAtlas] ⚠ ${message}`);
  }

  fail(message) {
    if (this.failOnError) throw new Error(`[QAtlas] ${message}`);
    this.warn(message);
  }

  headers(extra = {}) {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }

  async onEnd() {
    const missing = ['url', 'token', 'project'].filter((key) => !this[key]);
    if (missing.length > 0) {
      this.warn(
        `configuración incompleta (${missing.join(', ')}): no se envían resultados. ` +
          'Define QATLAS_URL, QATLAS_TOKEN y QATLAS_PROJECT (o las opciones del reporter).'
      );
      return;
    }

    const entries = [...this.tests.values()].filter(({ test }) => {
      if (!this.onlyProject) return true;
      const project = typeof test.parent?.project === 'function' ? test.parent.project() : undefined;
      return project?.name === this.onlyProject;
    });
    if (entries.length === 0) return;

    const payloadResults = entries.map(({ test, result }) => ({
      ...identify(test, this.automationId),
      title: test.title,
      status: statusOf(test),
      error_message: statusOf(test) === 'failed' ? errorMessageOf(result) : undefined,
      steps: stepsOf(result),
      duration_ms: Math.max(0, Math.round(result.duration ?? 0)) || undefined,
      attempts: (result.retry ?? 0) + 1,
      flaky: test.outcome() === 'flaky' || undefined,
    }));

    // El navegador sale del proyecto de Playwright si no se configuró a mano.
    const context = { ...this.context };
    if (!context.browser) {
      const first = entries[0].test;
      const project = typeof first.parent?.project === 'function' ? first.parent.project() : undefined;
      if (project?.name) context.browser = project.name;
    }
    for (const key of Object.keys(context)) if (!context[key]) delete context[key];

    let data;
    try {
      const response = await fetch(`${this.url}/test-runs/ingest`, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          project: this.project,
          run: { name: this.runName, external_id: this.externalId, ...context },
          results: payloadResults,
          create_missing_cases: this.createMissingCases,
          create_bug_on_failure: this.createBugOnFailure,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.fail(`QAtlas respondió ${response.status}: ${detail.slice(0, 500)}`);
        return;
      }
      data = await response.json();
    } catch (error) {
      this.fail(`no se pudo contactar a QAtlas (${error.message})`);
      return;
    }

    const { summary, test_run: run, rows } = data;
    const webBase = this.url.replace(/\/api$/, '');
    this.log(
      `ejecución ${run.code} ${data.created_run ? 'creada' : 'actualizada'}: ` +
        `${summary.passed} aprobados, ${summary.failed} fallidos, ${summary.skipped} omitidos` +
        (summary.unmatched ? `, ${summary.unmatched} sin caso (ver ID de automatización)` : '') +
        (summary.created_cases ? `, ${summary.created_cases} casos creados` : '') +
        (summary.created_bugs ? `, ${summary.created_bugs} defectos abiertos` : '') +
        ` → ${webBase}/test-runs/${run.code}`
    );
    for (const row of rows.filter((r) => !r.matched)) {
      this.warn(`sin caso para "${row.key}": ${row.message ?? ''}`);
    }

    if (this.attachments !== 'none') await this.uploadEvidence(entries, payloadResults, rows);
    return this.qualityGate(run);
  }

  /** Compuerta de calidad: consulta el resumen de la ejecución y falla la corrida bajo el umbral. */
  async qualityGate(run) {
    if (this.minPassRate === undefined || Number.isNaN(this.minPassRate)) return undefined;
    try {
      const response = await fetch(`${this.url}/test-runs/${run.id}/summary`, {
        headers: this.headers(),
      });
      if (!response.ok) {
        this.fail(`no se pudo evaluar la compuerta de calidad (${response.status}).`);
        return undefined;
      }
      const summary = await response.json();
      if (summary.pass_rate === null || summary.pass_rate >= this.minPassRate) {
        this.log(`compuerta de calidad superada (${summary.pass_rate ?? 'sin datos'} % ≥ ${this.minPassRate} %).`);
        return undefined;
      }
      this.warn(
        `compuerta de calidad NO superada: ${summary.pass_rate} % aprobado, se exige ${this.minPassRate} %.`
      );
      return { status: 'failed' };
    } catch (error) {
      this.fail(`no se pudo evaluar la compuerta de calidad (${error.message}).`);
      return undefined;
    }
  }

  async uploadEvidence(entries, payloadResults, rows) {
    const rowByKey = new Map(rows.map((row) => [row.key, row]));
    for (let index = 0; index < entries.length; index += 1) {
      const { result } = entries[index];
      const sent = payloadResults[index];
      const row = rowByKey.get(sent.test_case_code || sent.automation_id);
      if (!row?.matched || !row.test_run_case_id) continue;
      if (this.attachments === 'failed' && sent.status !== 'failed') continue;
      const files = (result.attachments || []).filter((a) => a.path || a.body);
      for (const attachment of files.slice(0, MAX_ATTACHMENTS_PER_CASE)) {
        await this.uploadOne(row, attachment);
      }
      if (files.length > MAX_ATTACHMENTS_PER_CASE) {
        this.warn(`"${row.key}" tiene ${files.length} adjuntos; solo se suben ${MAX_ATTACHMENTS_PER_CASE}.`);
      }
    }
  }

  async uploadOne(row, attachment) {
    const type = String(attachment.contentType || '').split(';')[0];
    let name = attachment.path ? path.basename(attachment.path) : attachment.name;
    // Un adjunto en memoria (testInfo.attach con `body`) trae solo un nombre
    // ("captura"): sin extensión se vería como un archivo sin tipo en QAtlas.
    if (!path.extname(name) && EXTENSIONS[type]) name += EXTENSIONS[type];
    try {
      const body = attachment.body ?? fs.readFileSync(attachment.path);
      const limit = type.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
      if (!ALLOWED_TYPES.has(type)) return this.warn(`adjunto "${name}" omitido: tipo ${type} no admitido.`);
      if (body.length > limit) {
        return this.warn(`adjunto "${name}" omitido: ${(body.length / 1048576).toFixed(1)} MB supera el límite.`);
      }
      const form = new FormData();
      form.append('entity_type', 'test_run_case');
      form.append('entity_id', String(row.test_run_case_id));
      form.append('file', new Blob([body], { type }), name);
      const response = await fetch(`${this.url}/attachments`, {
        method: 'POST',
        headers: this.headers(),
        body: form,
      });
      if (!response.ok) this.warn(`no se pudo subir "${name}" (${response.status}).`);
    } catch (error) {
      this.warn(`no se pudo subir "${name}" (${error.message}).`);
    }
  }
}

module.exports = QAtlasReporter;
module.exports.default = QAtlasReporter;
