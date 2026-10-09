const fs = await import('node:fs/promises');

const owner = process.env.GITHUB_REPOSITORY_OWNER || process.env.GITHUB_ACTOR;
const token = process.env.GITHUB_TOKEN;
const readmePath = 'README.md';

if (!owner) {
  throw new Error('GITHUB_REPOSITORY_OWNER is required');
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'shubham1091-profile-refresh',
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub API ${response.status}: ${path} - ${details}`);
  }

  return response.json();
}

async function getRepositories() {
  const repositories = [];

  for (let page = 1; page <= 10; page += 1) {
    const batch = await github(`/users/${owner}/repos?per_page=100&page=${page}&type=owner&sort=updated`);
    repositories.push(...batch);
    if (batch.length < 100) break;
  }

  return repositories;
}

function eventLabel(event) {
  const labels = {
    CreateEvent: 'Created repository content',
    ForkEvent: 'Forked a repository',
    IssuesEvent: `${event.payload.action || 'Updated'} an issue`,
    PullRequestEvent: `${event.payload.action || 'Updated'} a pull request`,
    PushEvent: `Pushed ${event.payload.commits?.length || 0} commit(s)`,
    ReleaseEvent: `${event.payload.action || 'Published'} a release`,
    WatchEvent: 'Starred a repository',
  };

  return labels[event.type] || event.type.replace('Event', ' activity');
}

function repositoryName(event) {
  return event.repo?.name?.replace(`${owner}/`, '') || 'GitHub';
}

function cleanText(value, fallback) {
  return (value || fallback).replace(/[|\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '-').trim();
}

async function repositoryDescription(repository) {
  if (repository.description) {
    return cleanText(repository.description, 'Public project repository.');
  }

  try {
    const readme = await github(`/repos/${owner}/${repository.name}/readme`);
    const content = Buffer.from(readme.content, 'base64').toString('utf8');
    const firstUsefulLine = content
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 20 && !line.startsWith('#') && !line.startsWith('!['));

    if (firstUsefulLine) {
      return cleanText(firstUsefulLine.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'), 'Public project repository.');
    }
  } catch {
    // Some repositories do not expose a README through the public API.
  }

  return 'Public project repository.';
}

async function projectRows(repositories) {
  const selectedRepositories = repositories
    .filter((repository) => repository.name !== owner && !repository.archived)
    .sort((first, second) => {
      const starDifference = second.stargazers_count - first.stargazers_count;
      return starDifference || new Date(second.updated_at) - new Date(first.updated_at);
    })
    .slice(0, 6);

  return Promise.all(selectedRepositories.map(async (repository) => {
      const description = await repositoryDescription(repository);
      return `| [${repository.name}](${repository.html_url}) | ${description} |`;
    }));
}

const [profile, repositories, events] = await Promise.all([
  github(`/users/${owner}`),
  getRepositories(),
  github(`/users/${owner}/events/public?per_page=20`),
]);

const latestEvent = events[0];
const latestDate = latestEvent ? latestEvent.created_at.slice(0, 10) : 'No recent public activity';
const recentRows = events.slice(0, 3).map((event) => `| ${event.created_at.slice(0, 10)} | ${eventLabel(event)} | ${repositoryName(event)} |`);
const projectRowsMarkdown = await projectRows(repositories);
const signalRows = `
<tr><td>Public repositories</td><td align="right">${profile.public_repos}</td></tr>
<tr><td>Followers</td><td align="right">${profile.followers}</td></tr>
<tr><td>Latest activity</td><td align="right">${latestDate}</td></tr>`;
const activityRows = recentRows.length
  ? recentRows.map((row) => {
      const [, date, signal, repository] = row.match(/^\| (.+) \| (.+) \| (.+) \|$/);
      return `<tr><td>${date}</td><td>${signal}</td><td>${repository}</td></tr>`;
    }).join('\n')
  : '<tr><td colspan="3">No recent public activity</td></tr>';

const generated = `<!-- PROFILE_STATS:START -->
<table>
<tr>
<td valign="top" width="50%">
<strong>Live signal</strong>
<table>
<tr><th align="left">Metric</th><th align="right">Current</th></tr>${signalRows}
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

_Generated daily from the public GitHub API by GitHub Actions. LinkedIn and other social metrics require their official APIs and account credentials._
<!-- PROFILE_STATS:END -->`;

const projects = `<!-- PROJECTS:START -->
| Repository | Description |
| --- | --- |
${projectRowsMarkdown.join('\n')}
<!-- PROJECTS:END -->`;

const readme = await fs.readFile(readmePath, 'utf8');
const updated = readme
  .replace(/<!-- PROFILE_STATS:START -->[\s\S]*?<!-- PROFILE_STATS:END -->/, generated)
  .replace(/<!-- PROJECTS:START -->[\s\S]*?<!-- PROJECTS:END -->/, projects);

if (updated === readme || !readme.includes('<!-- PROFILE_STATS:START -->') || !readme.includes('<!-- PROJECTS:START -->')) {
  throw new Error('README automation markers were not found');
}

await fs.writeFile(readmePath, updated);
