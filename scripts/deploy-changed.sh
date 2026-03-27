#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-changed.sh [user@host:/remote/webroot] [options]

Options:
  --source DIR     Local directory to compare/sync (default: ./)
  --dry-run        Don't actually run rsync + remote deletes (default: run for real)
  --no-delete      Do not remove deleted files from remote
  -h, --help       Show this help

Examples:
  # Set a default remote once for your shell/session
  export DEPLOY_REMOTE=user@host:/var/www/facerix.com
  bash scripts/deploy-changed.sh

  # Sync changes
  bash scripts/deploy-changed.sh user@host:/var/www/facerix.com

  # Preview what would sync from ./
  bash scripts/deploy-changed.sh user@host:/var/www/facerix.com --dry-run
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

# Load optional .env file for defaults.
# Values already exported in the shell take precedence.
if [[ -f ".env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Ignore empty/comment lines and only parse simple KEY=VALUE pairs.
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    [[ "$line" != *=* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"

    # Skip invalid identifiers.
    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi

    # Trim surrounding single or double quotes.
    if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi

    # Only set defaults from file; do not override exported values.
    if [[ -z "${!key+x}" ]]; then
      printf -v "$key" '%s' "$value"
      export "$key"
    fi
  done < ".env"
fi

REMOTE="${DEPLOY_REMOTE:-}"
if [[ $# -gt 0 && "${1:-}" != --* ]]; then
  REMOTE="$1"
  shift
fi

if [[ -z "$REMOTE" ]]; then
  echo "Error: remote destination is required."
  echo "Provide it as the first argument or set DEPLOY_REMOTE."
  usage
  exit 1
fi

SOURCE_DIR="./"
DRY_RUN=false
DO_DELETE=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE_DIR="${2:-}"
      if [[ -z "$SOURCE_DIR" ]]; then
        echo "Error: --source requires a value."
        exit 1
      fi
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-delete)
      DO_DELETE=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Error: source directory '$SOURCE_DIR' does not exist."
  exit 1
fi

# Ensure we are in a git repository and have at least one commit.
git rev-parse --is-inside-work-tree >/dev/null
git rev-parse --verify HEAD >/dev/null

tmp_changed="$(mktemp)"
tmp_deleted="$(mktemp)"
cleanup() {
  rm -f "$tmp_changed" "$tmp_deleted"
}
trap cleanup EXIT

# Added/copied/modified/renamed/tracked changes under source dir.
git diff --name-only --diff-filter=ACMRT HEAD -- "$SOURCE_DIR" > "$tmp_changed" || true
# Include untracked files under source dir.
git ls-files --others --exclude-standard -- "$SOURCE_DIR" >> "$tmp_changed" || true

# Normalize: strip "<source>/" prefix because rsync source is "$SOURCE_DIR/".
sed -E "s#^${SOURCE_DIR}/##" "$tmp_changed" | awk 'NF' | sort -u > "${tmp_changed}.norm"
mv "${tmp_changed}.norm" "$tmp_changed"

# Deleted files under source dir.
if [[ "$DO_DELETE" == true ]]; then
  git diff --name-only --diff-filter=D HEAD -- "$SOURCE_DIR" | sed -E "s#^${SOURCE_DIR}/##" | awk 'NF' | sort -u > "$tmp_deleted" || true
fi

change_count="$(wc -l < "$tmp_changed" | tr -d ' ')"
delete_count="0"
if [[ "$DO_DELETE" == true ]]; then
  delete_count="$(wc -l < "$tmp_deleted" | tr -d ' ')"
fi

if [[ "$change_count" == "0" && "$delete_count" == "0" ]]; then
  echo "No changes detected under '$SOURCE_DIR' since HEAD."
  exit 0
fi

echo "Changed files to sync: $change_count"
if [[ "$DO_DELETE" == true ]]; then
  echo "Deleted files to remove remotely: $delete_count"
fi

if [[ "$DRY_RUN" == false ]]; then
  rsync_flags=(-avz --progress)
else
  rsync_flags=(-avzn --progress)
fi

if [[ "$change_count" != "0" ]]; then
  rsync "${rsync_flags[@]}" --files-from="$tmp_changed" "$SOURCE_DIR"/ "$REMOTE"/
else
  echo "No file uploads needed."
fi

if [[ "$DO_DELETE" == true && "$delete_count" != "0" ]]; then
  remote_host="${REMOTE%%:*}"
  remote_path="${REMOTE#*:}"

  if [[ "$DRY_RUN" == false ]]; then
    echo "Removing deleted files on remote..."
  else
    echo "Dry run: would remove these remote files:"
    cat "$tmp_deleted"
  fi

  while IFS= read -r rel_path; do
    [[ -z "$rel_path" ]] && continue
    if [[ "$DRY_RUN" == false ]]; then
      ssh "$remote_host" "rm -f -- \"${remote_path%/}/$rel_path\""
    fi
  done < "$tmp_deleted"
fi

if [[ "$DRY_RUN" == false ]]; then
  echo "Done."
else
  echo "Dry run complete. Re-run without --dry-run to execute."
fi
