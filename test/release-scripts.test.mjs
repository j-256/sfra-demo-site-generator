import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  accessSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..');
const DEPLOY = join(REPO_ROOT, 'scripts', 'deploy-release.sh');
const PUBLISH = join(REPO_ROOT, 'scripts', 'publish-release.sh');

function executableOnPath(name) {
  for (const dir of process.env.PATH.split(delimiter)) {
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep looking
    }
  }
  throw new Error(`${name} not found on PATH`);
}

const REAL_GIT = executableOnPath('git');

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function git(cwd, args) {
  const result = run(REAL_GIT, ['-C', cwd, ...args]);
  assert.equal(result.status, 0, `git ${args.join(' ')} failed:\n${result.stderr}`);
  return result.stdout.trim();
}

function remoteObject(repo, remote, ref) {
  const output = git(repo, ['ls-remote', remote, ref]);
  return output ? output.split(/\s/)[0] : '';
}

function releaseAssets(version) {
  const prefix = `sfra-demo-site-generator-v${version}`;
  return [
    `${prefix}-macos-arm64.tar.gz`,
    `${prefix}-macos-x64.tar.gz`,
    `${prefix}-linux-arm64.tar.gz`,
    `${prefix}-linux-x64.tar.gz`,
    `${prefix}-windows-x64.exe`,
  ];
}

test('release script help and usage follow the CLI contract', () => {
  for (const script of [DEPLOY, PUBLISH]) {
    const shortHelp = run(script, ['-h']);
    const longHelp = run(script, ['--help']);
    assert.equal(shortHelp.status, 0);
    assert.equal(longHelp.status, 0);
    assert.equal(shortHelp.stdout, longHelp.stdout);
    assert.match(shortHelp.stdout, /^Usage:/);
    assert.match(shortHelp.stdout, /Exit status:/);
    assert.equal(shortHelp.stderr, '');
    assert.equal(longHelp.stderr, '');

    const invalid = run(script, ['--not-an-option']);
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Unknown option/);
  }

  const bundledDeploy = run(DEPLOY, ['-nh']);
  assert.equal(bundledDeploy.status, 0);
  assert.match(bundledDeploy.stdout, /^Usage:/);

  const bundledPublish = run(PUBLISH, ['-yh']);
  assert.equal(bundledPublish.status, 0);
  assert.match(bundledPublish.stdout, /^Usage:/);

  const missingNotes = run(DEPLOY, ['--notes-file']);
  assert.equal(missingNotes.status, 2);
  assert.match(missingNotes.stderr, /requires a path/);

  const emptyNotes = run(DEPLOY, ['--notes-file=']);
  assert.equal(emptyNotes.status, 2);
  assert.match(emptyNotes.stderr, /requires a path/);
});

test('dual-host deploy resumes rejected pushes and partial releases', () => {
  const root = mkdtempSync(join(tmpdir(), 'sfra-release-test-'));
  const repo = join(root, 'repo');
  const origin = join(root, 'origin.git');
  const soma = join(root, 'soma.git');
  const fakeBin = join(root, 'bin');
  const ghState = join(root, 'gh-state');
  const version = '2.0.0';
  const tag = `v${version}`;
  const expectedAssets = releaseAssets(version);

  try {
    mkdirSync(repo);
    mkdirSync(fakeBin);
    mkdirSync(ghState);
    assert.equal(run(REAL_GIT, ['init', '--bare', origin]).status, 0);
    assert.equal(run(REAL_GIT, ['init', '--bare', soma]).status, 0);
    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.name', 'Release Test']);
    git(repo, ['config', 'user.email', 'release-test@example.com']);

    mkdirSync(join(repo, 'scripts'));
    copyFileSync(DEPLOY, join(repo, 'scripts', 'deploy-release.sh'));
    copyFileSync(PUBLISH, join(repo, 'scripts', 'publish-release.sh'));
    chmodSync(join(repo, 'scripts', 'deploy-release.sh'), 0o755);
    chmodSync(join(repo, 'scripts', 'publish-release.sh'), 0o755);
    writeFileSync(join(repo, '.gitignore'), 'dist/\n');
    writeFileSync(join(repo, 'package.json'), `${JSON.stringify({ version }, null, 2)}\n`);
    writeFileSync(join(repo, 'baseline.txt'), 'baseline\n');
    git(repo, ['add', '.gitignore', 'package.json', 'scripts/deploy-release.sh', 'scripts/publish-release.sh', 'baseline.txt']);
    git(repo, ['commit', '-m', 'test: establish remote baseline']);
    const baseline = git(repo, ['rev-parse', 'HEAD']);

    git(repo, ['remote', 'add', 'origin', origin]);
    git(repo, ['remote', 'add', 'soma', soma]);
    git(repo, ['push', 'origin', 'main']);
    git(repo, ['push', 'soma', 'main']);

    writeFileSync(join(repo, 'release.txt'), 'release\n');
    git(repo, ['add', 'release.txt']);
    git(repo, ['commit', '-m', 'chore(release): prepare v2.0.0']);
    git(repo, ['tag', '-a', tag, '-m', `chore(release): prepare ${tag}`]);
    const releaseHead = git(repo, ['rev-parse', 'HEAD']);
    const tagObject = git(repo, ['rev-parse', `refs/tags/${tag}`]);

    const releaseDir = join(repo, 'dist', 'releases', tag);
    mkdirSync(releaseDir, { recursive: true });
    for (const asset of expectedAssets) writeFileSync(join(releaseDir, asset), `${asset}\n`);

    const fakeGit = join(fakeBin, 'git');
    writeFileSync(fakeGit, `#!/bin/bash
set -euo pipefail
prefix=()
if [ "\${1:-}" = "-C" ]; then
  prefix=(-C "$2")
  shift 2
fi
if [ "\${1:-}" = "remote" ] && [ "\${2:-}" = "get-url" ]; then
  case "\${3:-}" in
    origin) printf '%s\\n' 'https://origin.test/owner/repo.git'; exit 0 ;;
    soma) printf '%s\\n' 'https://soma.test/owner/repo.git'; exit 0 ;;
  esac
fi
exec "$REAL_GIT" "\${prefix[@]}" "$@"
`);
    chmodSync(fakeGit, 0o755);

    const fakeGh = join(fakeBin, 'gh');
    writeFileSync(fakeGh, `#!/bin/bash
set -euo pipefail
command_name="\${1:-}"
shift || true
case "$command_name" in
  api)
    host=""
    endpoint=""
    jq_filter=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --hostname) host="$2"; shift 2 ;;
        --jq) jq_filter="$2"; shift 2 ;;
        --silent) shift ;;
        *) [ -n "$endpoint" ] || endpoint="$1"; shift ;;
      esac
    done
    release_file="$GH_STATE/$host.release"
    asset_file="$GH_STATE/$host.assets"
    case "$endpoint" in
      repos/*/git/ref/tags/*)
        printf '%s\\n' "$TAG_OBJECT"
        ;;
      repos/*/releases/tags/*)
        if [ ! -f "$release_file" ]; then
          printf '%s\\n' 'HTTP 404: Not Found' >&2
          exit 1
        fi
        case "$jq_filter" in
          .draft|.prerelease) printf '%s\\n' 'false' ;;
          '.assets[].name') [ ! -f "$asset_file" ] || while IFS= read -r asset; do printf '%s\\n' "$asset"; done < "$asset_file" ;;
        esac
        ;;
      repos/*) ;;
      *) printf 'Unexpected API endpoint: %s\\n' "$endpoint" >&2; exit 1 ;;
    esac
    ;;
  release)
    action="\${1:-}"
    shift || true
    tag="\${1:-}"
    shift || true
    repo_spec=""
    assets=()
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --repo) repo_spec="$2"; shift 2 ;;
        --notes-file) shift 2 ;;
        --verify-tag) shift ;;
        *) assets+=("$1"); shift ;;
      esac
    done
    host="\${repo_spec%%/*}"
    release_file="$GH_STATE/$host.release"
    asset_file="$GH_STATE/$host.assets"
    if [ "$action" = "create" ] && [ "\${FAIL_RELEASE_HOST:-}" = "$host" ]; then
      printf 'Rejected release for %s\\n' "$host" >&2
      exit 1
    fi
    if [ "$action" = "create" ]; then : > "$asset_file"; fi
    for asset in "\${assets[@]}"; do printf '%s\\n' "\${asset##*/}" >> "$asset_file"; done
    printf '%s\\n' 'published' > "$release_file"
    printf '%s %s\\n' "$host" "$action" >> "$GH_STATE/events"
    printf 'https://%s/owner/repo/releases/tag/%s\\n' "$host" "$tag"
    ;;
  *) printf 'Unexpected gh command: %s\\n' "$command_name" >&2; exit 1 ;;
esac
`);
    chmodSync(fakeGh, 0o755);

    const rejectHook = join(soma, 'hooks', 'pre-receive');
    writeFileSync(rejectHook, '#!/bin/bash\nexit 1\n');
    chmodSync(rejectHook, 0o755);

    const releaseEnv = {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
      REAL_GIT,
      GH_STATE: ghState,
      TAG_OBJECT: tagObject,
    };

    const rejectedPush = run(join(repo, 'scripts', 'deploy-release.sh'), [], { cwd: repo, env: releaseEnv });
    assert.equal(rejectedPush.status, 1, rejectedPush.stderr);
    assert.equal(remoteObject(repo, 'origin', 'refs/heads/main'), releaseHead,
      `deploy output:\n${rejectedPush.stdout}\n${rejectedPush.stderr}`);
    assert.equal(remoteObject(repo, 'origin', `refs/tags/${tag}`), tagObject);
    assert.equal(remoteObject(repo, 'soma', 'refs/heads/main'), baseline);
    assert.equal(remoteObject(repo, 'soma', `refs/tags/${tag}`), '');
    assert.equal(existsSync(join(ghState, 'events')), false);

    unlinkSync(rejectHook);
    const partialRelease = run(join(repo, 'scripts', 'deploy-release.sh'), [], {
      cwd: repo,
      env: { ...releaseEnv, FAIL_RELEASE_HOST: 'soma.test' },
    });
    assert.equal(partialRelease.status, 1, partialRelease.stderr);
    assert.equal(remoteObject(repo, 'soma', 'refs/heads/main'), releaseHead);
    assert.equal(remoteObject(repo, 'soma', `refs/tags/${tag}`), tagObject);
    assert.equal(existsSync(join(ghState, 'origin.test.release')), true);
    assert.equal(existsSync(join(ghState, 'soma.test.release')), false);

    const completed = run(join(repo, 'scripts', 'deploy-release.sh'), [], { cwd: repo, env: releaseEnv });
    assert.equal(completed.status, 0, completed.stderr);
    assert.equal(existsSync(join(ghState, 'soma.test.release')), true);
    assert.match(completed.stdout, /Deployed v2\.0\.0 to origin soma/);

    const originAssetsPath = join(ghState, 'origin.test.assets');
    writeFileSync(originAssetsPath, `${expectedAssets.slice(0, -1).join('\n')}\n`);
    const repairedAssets = run(join(repo, 'scripts', 'deploy-release.sh'), [], { cwd: repo, env: releaseEnv });
    assert.equal(repairedAssets.status, 0, repairedAssets.stderr);
    assert.deepEqual(readFileSync(originAssetsPath, 'utf8').trim().split('\n').sort(), expectedAssets.sort());

    const events = readFileSync(join(ghState, 'events'), 'utf8').trim().split('\n');
    assert.deepEqual(events, ['origin.test create', 'soma.test create', 'origin.test upload']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
