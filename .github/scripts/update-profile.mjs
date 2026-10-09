const fs = await import("node:fs/promises");

const owner = process.env.GITHUB_REPOSITORY_OWNER || process.env.GITHUB_ACTOR;
const token = process.env.GITHUB_TOKEN;
const readmePath = "README.md";
const coreStack = "Python, SQL, TypeScript, Next.js";

if (!owner) {
  throw new Error("GITHUB_REPOSITORY_OWNER is required");
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "shubham1091-profile-refresh",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub API ${response.status}: ${path} - ${details}`);
  }

  return response.json();
}

function capitalize(value, fallback) {
  const text = value || fallback;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Returns a readable label, or null for events that are noise.
// The Events API no longer includes a commits array on PushEvent,
// so pushes are labelled by branch instead of commit count.
function eventLabel(event) {
  const payload = event.payload || {};

  switch (event.type) {
    case "PushEvent": {
      const branch = payload.ref?.replace("refs/heads/", "");
      return branch ? `Pushed to ${branch}` : "Pushed changes";
    }
    case "CreateEvent":
      return `Created a ${payload.ref_type || "repository"}`;
    case "PullRequestEvent":
      return `${capitalize(payload.action, "updated")} a pull request`;
    case "IssuesEvent":
      return `${capitalize(payload.action, "updated")} an issue`;
    case "ReleaseEvent":
      return `${capitalize(payload.action, "published")} a release`;
    case "ForkEvent":
      return "Forked a repository";
    case "PublicEvent":
      return "Made a repository public";
    default:
      return null;
  }
}

function repositoryName(event) {
  return event.repo?.name?.replace(`${owner}/`, "") || "GitHub";
}

const [profile, events] = await Promise.all([
  github(`/users/${owner}`),
  github(`/users/${owner}/events/public?per_page=50`),
]);

// Skip the profile repo itself so the bot's own commits don't show up.
const signals = events.filter(
  (event) => repositoryName(event) !== owner && eventLabel(event),
);

const latestDate = signals.length
  ? signals[0].created_at.slice(0, 10)
  : "No recent public activity";

const activityRows = signals.length
  ? signals
      .slice(0, 3)
      .map(
        (event) =>
          `<tr><td>${event.created_at.slice(0, 10)}</td><td>${eventLabel(event)}</td><td>${repositoryName(event)}</td></tr>`,
      )
      .join("\n")
  : '<tr><td colspan="3">No recent public activity</td></tr>';

const generated = `<!-- PROFILE_STATS:START -->
<table>
<tr>
<td valign="top" width="50%">
<strong>Live signal</strong>
<table>
<tr><th align="left">Metric</th><th align="right">Current</th></tr>
<tr><td>Public repositories</td><td align="right">${profile.public_repos}</td></tr>
<tr><td>Core stack</td><td align="right">${coreStack}</td></tr>
<tr><td>Latest activity</td><td align="right">${latestDate}</td></tr>
</table>
</td>
<td valign="top" width="50%">
<strong>Recent public activity</strong>
<table>
<tr><th align="left">Date</th><th align="left">Signal</th><th align="left">Repository</th></tr>
${activityRows}
</table>
</td>
</tr>
</table>

_Generated daily from the public GitHub API by GitHub Actions._
<!-- PROFILE_STATS:END -->`;

const readme = await fs.readFile(readmePath, "utf8");

if (!readme.includes("<!-- PROFILE_STATS:START -->")) {
  throw new Error("README automation markers were not found");
}

const updated = readme.replace(
  /<!-- PROFILE_STATS:START -->[\s\S]*?<!-- PROFILE_STATS:END -->/,
  generated,
);

if (updated !== readme) {
  await fs.writeFile(readmePath, updated);
}
