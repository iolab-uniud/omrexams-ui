# syntax=docker/dockerfile:1

FROM ghcr.io/astral-sh/uv:0.12.17 AS uv

FROM python:3.10-slim AS dependencies

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY --from=uv /uv /bin/uv
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

# Install the shared core without resolving its upstream dependencies: the
# backend manifest selects compatible headless variants where needed.
COPY omrexams/ /opt/omrexams/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --python /app/.venv/bin/python --no-deps /opt/omrexams

# starting from an official Linux image with Python 3.10 already installed
FROM python:3.10-slim

ARG FDSYMBOL_SHA256=a3cb3873d267b3b2b230239f94c14bdba41d7b422fb8417c140ff1c4ea1b25f1

# prevent Python from creating .pyc files
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"

# set the working folder inside the container
WORKDIR /app

# install system programs (Ghostscript, ImageMagick, Perl, TeXLive)
# use texlive-xetex and latexmk because generate.py explicitly requires them
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    imagemagick \
    perl \
    texlive-xetex \
    texlive-latex-extra \
    texlive-lang-italian \
    texlive-fonts-recommended \
    texlive-pstricks \
    lmodern \
    latexmk \
    fontconfig \
    libzbar0 \
    libzxing3 \
    && python -c "from urllib.request import urlretrieve; urlretrieve('https://mirrors.ctan.org/install/fonts/fdsymbol.tds.zip', '/tmp/fdsymbol.tds.zip')" \
    && echo "$FDSYMBOL_SHA256  /tmp/fdsymbol.tds.zip" | sha256sum -c - \
    && python -m zipfile -e /tmp/fdsymbol.tds.zip /usr/local/share/texmf \
    && mktexlsr \
    && rm /tmp/fdsymbol.tds.zip \
    && rm -rf /var/lib/apt/lists/*

# fix the ImageMagick policy that blocks PDFs
RUN find /etc/ImageMagick-* -name "policy.xml" -exec \
    sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' {} \;

# The .otf files must be located in ./fonts/ in the repo (same folder as the Dockerfile)
# copy the folder to this address because fontconfig scans /usr/share/fonts/ and subfolders for fonts
COPY fonts/ /usr/share/fonts/truetype/opendyslexic/
RUN fc-cache -f -v

# copy the locked Python environment built with uv
COPY --from=dependencies /app/.venv /app/.venv

# copy application code last so API changes reuse all dependency layers
COPY api/ ./api/
COPY schemas/ ./schemas/
COPY services/ ./services/
COPY state/ ./state/
COPY main.py ./main.py

# which door to expose
EXPOSE 5000

# The command that will be launched when the container is powered on
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]