/**
 * dsh-context-boost
 *
 * Extends the per-conversation context capacity of DeepSeek Harness.
 *
 * Mechanism
 * ---------
 * DeepSeek Harness resolves a model's usable context window from the
 * `llm-deepseek` settings namespace: `models[].contextWindow` per model, and
 * `defaultContextWindow` as the fallback (default 1e6 = 1M tokens). This
 * plugin reads a user-editable JSON file and applies its values onto that
 * namespace through the settings service, so a larger value takes effect
 * without touching the application code.
 *
 * Configuration file
 * ------------------
 *   $DSH_HOME/dsh-context-boost.json    (default: ~/.dsh/dsh-context-boost.json)
 *
 *   {
 *     "enabled": true,
 *     "contextWindow": 4000000,          // applied to every model + default
 *     "maxTokens": 262144,               // optional per-request output cap
 *     "models": { "deepseek-flash": 8000000 }   // optional per-model override
 *   }
 *
 * The file wins over the plugin's patch `config`; the plugin polls the file
 * every 5 seconds and re-applies on change (no restart required).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export const name = "dsh-context-boost";
export const inject = ["settings"];

const TARGET_NS = "llm-deepseek";
const CONFIG_FILE_NAME = "dsh-context-boost.json";
const POLL_INTERVAL_MS = 5000;

function resolveDshHome() {
  const env = process.env.DSH_HOME;
  if (env && env.trim()) {
    const value = env.trim();
    return value.startsWith("~") ? join(homedir(), value.slice(1)) : resolve(value);
  }
  return join(homedir(), ".dsh");
}

function configPath() {
  return join(resolveDshHome(), CONFIG_FILE_NAME);
}

function loadConfigFile() {
  const file = configPath();
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw;
  } catch (error) {
    console.error(`[dsh-context-boost] failed to parse ${file}: ${error.message}`);
    return null;
  }
}

/** A positive safe integer, or undefined when the value is absent/invalid. */
function positiveInt(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

function signatureOf(config) {
  if (!config) return "";
  return JSON.stringify({
    enabled: config.enabled,
    contextWindow: config.contextWindow,
    maxTokens: config.maxTokens,
    models: config.models ?? null
  });
}

let lastSignature = "";

/**
 * Read the merged config (file wins over patch config) and apply it to the
 * `llm-deepseek` settings namespace. Only updates when the resolved value
 * actually changed, so the settings document is not rewritten on every poll.
 */
async function applyBoost(ctx, patchConfig) {
  const fileConfig = loadConfigFile();
  const merged = {
    enabled: fileConfig?.enabled ?? patchConfig?.enabled ?? true,
    contextWindow: fileConfig?.contextWindow ?? patchConfig?.contextWindow,
    maxTokens: fileConfig?.maxTokens ?? patchConfig?.maxTokens,
    models: fileConfig?.models ?? patchConfig?.models ?? null
  };

  const signature = signatureOf(merged);
  if (signature === lastSignature) return;
  if (merged.enabled === false) {
    lastSignature = signature;
    return;
  }

  const contextWindow = positiveInt(merged.contextWindow);
  const maxTokens = positiveInt(merged.maxTokens);
  const perModel = merged.models && typeof merged.models === "object" ? merged.models : {};
  if (!contextWindow && !maxTokens) return;

  const settings = ctx.settings;
  if (!settings) return;
  const current = settings.get(TARGET_NS);
  if (!current || typeof current !== "object") {
    // llm-deepseek namespace not registered yet; caller retries.
    return;
  }

  const models = Array.isArray(current.models)
    ? current.models.map((model) => {
        const per = positiveInt(perModel[model.id]);
        return {
          ...model,
          ...(per || contextWindow ? { contextWindow: per ?? contextWindow } : {}),
          ...(maxTokens ? { maxTokens } : {})
        };
      })
    : undefined;

  const patch = {
    ...(contextWindow ? { defaultContextWindow: contextWindow } : {}),
    ...(maxTokens ? { maxTokens } : {}),
    ...(models ? { models } : {})
  };

  await settings.update(TARGET_NS, patch);
  lastSignature = signature;
  console.log(
    `[dsh-context-boost] applied contextWindow=${contextWindow ?? "keep"} ` +
      `maxTokens=${maxTokens ?? "keep"} (${models?.length ?? 0} models) -> ${TARGET_NS}`
  );
}

export function apply(ctx, patchConfig = {}) {
  let applied = false;
  const run = async () => {
    try {
      await applyBoost(ctx, patchConfig);
      applied = true;
    } catch (error) {
      console.error(`[dsh-context-boost] ${error?.message ?? error}`);
    }
  };

  // Apply once the settings service is up, retrying a few times so the
  // llm-deepseek namespace registration is visible to us. Falls back to an
  // immediate attempt when the context does not expose `inject`.
  const attemptLoop = () => {
    let tries = 0;
    const attempt = async () => {
      await run();
      if (!applied && tries++ < 10) setTimeout(attempt, 1000);
    };
    void attempt();
  };
  if (typeof ctx.inject === "function") ctx.inject(["settings"], attemptLoop);
  else attemptLoop();

  // Poll the config file so "just edit the JSON" works live.
  const timer = setInterval(() => void run(), POLL_INTERVAL_MS);
  const stop = () => clearInterval(timer);
  if (typeof ctx.on === "function") {
    try {
      ctx.on("dispose", stop);
    } catch {
      /* event name varies across cordis versions; timer leaks are benign */
    }
  } else if (typeof ctx.onDispose === "function") {
    ctx.onDispose(stop);
  }
}
