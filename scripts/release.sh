#!/usr/bin/env bash
#
# Aggiorna la versione dichiarata nel frontend, crea un commit e pubblica un
# tag di release che attiva la pubblicazione delle immagini Docker su GHCR.
# frontend/package.json e' la fonte di verita della versione.
# La voce di CHANGELOG.md viene preparata dai commit dall'ultimo tag e viene
# revisionata nell'editor prima della pubblicazione.
#
#   ./scripts/release.sh patch
#   ./scripts/release.sh minor
#   ./scripts/release.sh major
#   ./scripts/release.sh X.Y.Z
#   ./scripts/release.sh vX.Y.Z

set -euo pipefail

die() {
    echo "ERRORE: $*" >&2
    exit 1
}

usage() {
    cat <<'USAGE'
Uso:
  ./scripts/release.sh patch
  ./scripts/release.sh minor
  ./scripts/release.sh major
  ./scripts/release.sh X.Y.Z
  ./scripts/release.sh vX.Y.Z

Opzioni:
  --yes, -y    non chiede conferma prima di creare il tag
    --no-llm     non genera la bozza del changelog con un LLM
    --no-edit    non apre l'editor per rivedere il changelog

Variabili d'ambiente:
    RELEASE_CHANGELOG_CMD  comando per la bozza (default: claude -p)
    EDITOR / VISUAL        editor per la voce di changelog (default: vi)
USAGE
    exit 1
}

BUMP=""
ASSUME_YES=0
USE_LLM=1
EDIT_CHANGELOG=1

for arg in "$@"; do
    case "$arg" in
        --yes|-y) ASSUME_YES=1 ;;
        --no-llm) USE_LLM=0 ;;
        --no-edit) EDIT_CHANGELOG=0 ;;
        -h|--help) usage ;;
        *)
            [[ -z "$BUMP" ]] || usage
            BUMP="$arg"
            ;;
    esac
done

[[ -n "$BUMP" ]] || usage

cd "$(dirname "$0")/.."
[[ -d .git ]] || die "questo script va eseguito dentro il repository"
[[ -f frontend/package.json ]] || die "frontend/package.json non trovato"
[[ -f frontend/package-lock.json ]] || die "frontend/package-lock.json non trovato"
command -v git >/dev/null 2>&1 || die "git non trovato nel PATH"
command -v node >/dev/null 2>&1 || die "node non trovato nel PATH"

if [[ -n "$(git status --porcelain)" ]]; then
    git status --short
    die "l'albero di lavoro non e' pulito: committa o metti da parte le modifiche prima della release"
fi

CURRENT_BRANCH="$(git branch --show-current)"
[[ -n "$CURRENT_BRANCH" ]] || die "impossibile creare una release da un HEAD distaccato"

git fetch --tags --prune origin
git rev-parse --verify "refs/remotes/origin/$CURRENT_BRANCH" >/dev/null 2>&1 \
    || die "il branch '$CURRENT_BRANCH' non esiste su origin"
git merge-base --is-ancestor "origin/$CURRENT_BRANCH" HEAD \
    || die "il branch locale e' indietro rispetto a origin/$CURRENT_BRANCH"

DECLARED_VERSION="$(node -p 'require("./frontend/package.json").version')"
[[ "$DECLARED_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
    || die "versione non valida in frontend/package.json: '$DECLARED_VERSION'"

LATEST_TAG="$(git tag --list 'v*' --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)"
if [[ -n "$LATEST_TAG" && "${LATEST_TAG#v}" != "$DECLARED_VERSION" ]]; then
    die "frontend/package.json dichiara $DECLARED_VERSION ma l'ultimo tag e' $LATEST_TAG"
fi

CURRENT_VERSION="$DECLARED_VERSION"
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP" in
    patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
    minor) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
    major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
    *)
        NEW_VERSION="${BUMP#v}"
        [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage
        ;;
esac

NEW_TAG="v${NEW_VERSION}"

if git rev-parse -q --verify "refs/tags/$NEW_TAG" >/dev/null; then
    die "il tag locale '$NEW_TAG' esiste gia'"
fi

if git ls-remote --exit-code --tags origin "refs/tags/$NEW_TAG" >/dev/null 2>&1; then
    die "il tag remoto '$NEW_TAG' esiste gia'"
fi

[[ -f CHANGELOG.md ]] || die "CHANGELOG.md non trovato"
TODAY="$(date +%Y-%m-%d)"

if grep -Eq "^## ${NEW_VERSION}([[:space:]]|$)" CHANGELOG.md; then
    die "CHANGELOG.md contiene gia' una voce per $NEW_VERSION"
fi

if [[ -n "$LATEST_TAG" ]]; then
    RANGE="${LATEST_TAG}..HEAD"
else
    RANGE="HEAD"
fi
COMMITS="$(git log --no-merges --pretty=format:'- %s' "$RANGE" || true)"

ENTRY="$(mktemp)"
trap 'rm -f "$ENTRY"' EXIT

DRAFT=""
if [[ "$USE_LLM" -eq 1 && -n "$COMMITS" ]]; then
    LLM_CMD="${RELEASE_CHANGELOG_CMD:-}"
    if [[ -z "$LLM_CMD" ]] && command -v claude >/dev/null 2>&1; then
        LLM_CMD="claude -p"
    fi

    if [[ -n "$LLM_CMD" ]]; then
        echo "Bozza del changelog con: $LLM_CMD"
        PROMPT="Scrivi la voce di changelog per la versione $NEW_VERSION di OMR-Exams.

Regole:
- rispondi solo con un elenco puntato Markdown, senza titoli o premesse;
- scrivi esclusivamente in italiano, in modo conciso e rivolto a chi usa l'applicazione;
- traduci sempre in italiano i messaggi di commit e non copiarne frasi in inglese;
- mantieni in inglese solo nomi propri, comandi, percorsi e termini tecnici privi di una traduzione naturale;
- descrivi gli effetti visibili, non i dettagli implementativi;
- accorpa i commit che fanno parte dello stesso cambiamento;
- ometti refactoring interni e modifiche senza effetti visibili.

Commit dall'ultima release:
$COMMITS"
        DRAFT="$(printf '%s' "$PROMPT" | $LLM_CMD 2>/dev/null || true)"
    else
        echo "Claude non disponibile: completa manualmente la voce di changelog nell'editor."
    fi
fi

if [[ -n "$DRAFT" ]]; then
    printf '%s\n' "$DRAFT" > "$ENTRY"
elif [[ -n "$COMMITS" ]]; then
    printf '%s\n' "$COMMITS" > "$ENTRY"
else
    printf '%s\n' "- Release $NEW_VERSION." > "$ENTRY"
fi

if [[ "$EDIT_CHANGELOG" -eq 1 && -t 1 ]]; then
    if [[ -z "$DRAFT" ]]; then
        echo "Rivedi e completa manualmente la voce di changelog."
    fi
    EDITOR_CMD="${GIT_EDITOR:-${VISUAL:-${EDITOR:-vi}}}"
    "$EDITOR_CMD" "$ENTRY" </dev/tty >/dev/tty 2>&1 \
        || die "l'editor e' uscito con errore"
fi

[[ -s "$ENTRY" ]] || die "voce di changelog vuota: release annullata"

echo
echo "OMR-Exams release"
echo "-----------------"
echo "Versione corrente : $CURRENT_VERSION"
echo "Nuova versione    : $NEW_VERSION"
echo "Tag               : $NEW_TAG"
echo "Branch            : $CURRENT_BRANCH"
echo "Commit            : $(git log -1 --format='%h %s')"

if [[ "$ASSUME_YES" -eq 0 ]]; then
    echo
    read -r -p "Creare e pubblicare la release $NEW_TAG? [y/N] " answer
    case "$answer" in
        y|Y|yes|YES|s|S|si|SI) ;;
        *)
            echo "Release annullata."
            exit 0
            ;;
    esac
fi

TMPFILE="$(mktemp)"
{
    IFS= read -r first_line || true
    printf '%s\n\n## %s - %s\n\n' "$first_line" "$NEW_VERSION" "$TODAY"
    cat "$ENTRY"
    printf '\n'
    cat
} < CHANGELOG.md > "$TMPFILE"
mv "$TMPFILE" CHANGELOG.md

node - "$NEW_VERSION" <<'NODE'
const fs = require("fs");

const version = process.argv[2];
for (const path of ["frontend/package.json", "frontend/package-lock.json"]) {
    const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
    manifest.version = version;
    if (path.endsWith("package-lock.json")) {
        manifest.packages[""].version = version;
    }
    fs.writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
NODE

git add frontend/package.json frontend/package-lock.json
git add CHANGELOG.md
git commit -m "Release $NEW_TAG"
git push origin "$CURRENT_BRANCH"
git tag -a "$NEW_TAG" -m "OMR-Exams $NEW_VERSION"
git push origin "$NEW_TAG"

echo
echo "Tag $NEW_TAG pubblicato. Il workflow GitHub Actions pubblichera' le immagini su GHCR."