#!/usr/bin/env node
/**
 * Generates stats.json for the SQUAD SELECT homepage.
 *
 * Repos, stars and languages come from the REST API (authenticated with the
 * workflow's GITHUB_TOKEN when present, plain public API otherwise).
 *
 * The contribution calendar is read from GitHub's public profile fragment
 * (`/users/<login>/contributions`), which needs no token — the Action's bot
 * token cannot read a personal GraphQL contributions collection.
 *
 *   node scripts/fetch-stats.mjs
 */

import { readFile, writeFile } from "node:fs/promises";

const LOGIN = process.env.GH_LOGIN || "mrHumildad";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = new URL("../stats.json", import.meta.url);
const UA = "squad-select-stats/1.0 (+https://mrhumildad.github.io)";

const apiHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": UA,
  "X-GitHub-Api-Version": "2022-11-28",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
};

async function getJSON(url) {
  const res = await fetch(url, { headers: apiHeaders });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function fetchUser() {
  return getJSON(`https://api.github.com/users/${LOGIN}`);
}

async function fetchRepos() {
  const repos = [];
  for (let page = 1; page <= 5; page += 1) {
    const batch = await getJSON(
      `https://api.github.com/users/${LOGIN}/repos?per_page=100&page=${page}&sort=pushed&type=owner`
    );
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((repo) => !repo.fork && !repo.private);
}

function languageBreakdown(repos) {
  const counts = new Map();
  repos.forEach((repo) => {
    if (!repo.language) return;
    counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
  });
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, n]) => ({ name, pct: Math.round((n / total) * 100) }));
}

/**
 * GitHub renders the calendar column-major but emits the cells row-major, as
 * `contribution-day-component-<weekday>-<week>`. Per-day counts live in the
 * matching <tool-tip for="..."> elements; `data-level` is only a 0–4 bucket.
 */
async function fetchCalendar() {
  const res = await fetch(`https://github.com/users/${LOGIN}/contributions`, {
    headers: { "User-Agent": UA, Accept: "text/html" }
  });
  if (!res.ok) throw new Error(`calendar ${res.status} ${res.statusText}`);
  const html = await res.text();

  const cells = new Map();
  for (const tag of html.match(/<td\b[^>]*>/g) || []) {
    const date = /data-date="(\d{4}-\d{2}-\d{2})"/.exec(tag)?.[1];
    const component = /id="contribution-day-component-(\d+)-(\d+)"/.exec(tag);
    const level = /data-level="(\d)"/.exec(tag)?.[1];
    if (!date || !component) continue;
    cells.set(`${component[1]}-${component[2]}`, { date, level: Number(level ?? 0) });
  }
  if (!cells.size) throw new Error("calendar markup not recognised");

  const counts = new Map();
  for (const tooltip of html.match(/<tool-tip\b[^>]*>[^<]*/g) || []) {
    const key = /for="contribution-day-component-(\d+)-(\d+)"/.exec(tooltip);
    if (!key) continue;
    const text = tooltip.slice(tooltip.indexOf(">") + 1);
    const n = /^(\d+)\s+contribution/.exec(text.trim());
    counts.set(`${key[1]}-${key[2]}`, n ? Number(n[1]) : 0);
  }

  const weeks = [];
  const days = [];
  let maxWeek = 0;

  for (const [key, cell] of cells) {
    const [weekday, week] = key.split("-").map(Number);
    maxWeek = Math.max(maxWeek, week);
    if (!weeks[week]) weeks[week] = Array(7).fill(0);
    const count = counts.has(key) ? counts.get(key) : cell.level > 0 ? cell.level : 0;
    weeks[week][weekday] = count;
    days.push({ date: cell.date, count });
  }

  for (let i = 0; i <= maxWeek; i += 1) {
    if (!weeks[i]) weeks[i] = Array(7).fill(0);
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  let run = 0;
  let longest = 0;
  let longestEnd = null;
  days.forEach((day) => {
    if (day.count > 0) {
      run += 1;
      if (run > longest) {
        longest = run;
        longestEnd = day.date;
      }
    } else {
      run = 0;
    }
  });

  const total = counts.size ? days.reduce((sum, day) => sum + day.count, 0) : null;

  return {
    total,
    weeks,
    start: days[0]?.date ?? null,
    longest_streak: { days: longest, end: longestEnd }
  };
}

async function main() {
  const [user, repos] = await Promise.all([fetchUser(), fetchRepos()]);

  const calendar = await fetchCalendar().catch((err) => {
    console.warn("[stats] calendar unavailable:", err.message);
    return null;
  });

  const payload = {
    generated_at: new Date().toISOString(),
    login: user.login,
    public_repos: user.public_repos,
    followers: user.followers,
    stars: repos.reduce((sum, repo) => sum + repo.stargazers_count, 0),
    top_languages: languageBreakdown(repos),
    contributions: calendar
      ? { total: calendar.total, start: calendar.start, weeks: calendar.weeks }
      : null,
    longest_streak: calendar ? calendar.longest_streak : null,
    source: TOKEN ? "github-actions" : "local"
  };

  const next = JSON.stringify(payload, null, 2) + "\n";

  let previous = "";
  try {
    previous = await readFile(OUTPUT, "utf8");
  } catch {
    previous = "";
  }

  if (previous === next) {
    console.log("[stats] unchanged, nothing to write");
    return;
  }

  await writeFile(OUTPUT, next, "utf8");
  console.log(
    `[stats] wrote stats.json — ${payload.public_repos} repos, ${payload.stars} stars, ` +
      `${payload.contributions ? payload.contributions.total : "no"} contributions`
  );
}

main().catch((err) => {
  console.error("[stats] failed:", err);
  process.exit(1);
});
