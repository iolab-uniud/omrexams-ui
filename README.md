# OMR-Exams

[![Docker images](https://github.com/iolab-uniud/omrexams-ui/actions/workflows/publish-images.yml/badge.svg)](https://github.com/iolab-uniud/omrexams-ui/actions/workflows/publish-images.yml)

OMR-Exams è un'applicazione web completa progettata per creare, gestire e correggere automaticamente esami a risposta multipla utilizzando la tecnologia OMR (Optical Mark Recognition).
Nato come evoluzione di un software OMR preesistente, questo progetto integra la logica di correzione all'interno di un'interfaccia web facile da usare anche per gli utenti senza competenze informatiche, offrendo un metodo di distribuzione completamente automatizzato.

## Funzionalità del progetto

- **Creazione Esami:** Genera fogli d'esame stampabili dotati di codici QR per domande a scelta multipla.
- **Correzione Automatica:** Permette di caricare le scansioni dei fogli compilati e utilizza algoritmi OMR per rilevare automaticamente i segni, calcolare i punteggi e associarli agli studenti.
- **Strumenti di ausilio:** Presenza di diversi strumenti secondari rispetto al flusso di generazione e correzione principale, che permettono una gestione completa del sistema.
- **Interfaccia Web:** Il frontend permette agli utenti di gestire l'intero flusso di lavoro direttamente dal browser, senza dover interagire con interfacce a riga di comando.
- **Distribuzione Isolata:** L'intero sistema è "containerizzato" tramite Docker. Ciò vuol dire che funziona allo stesso modo su qualsiasi sistema operativo senza interferire e senza richiedere l'installazione manuale di librerie o dipendenze.

## Come utilizzare l'applicazione

La suite è progettata per essere completamente plug-and-play. Sono richiesti Git e Docker Desktop (oppure Docker Engine con Docker Compose su Linux).

### Avvio

Clona il repository includendo il core OMRExams, mantenuto come submodule in `backend/omrexams`:

```sh
git clone --recurse-submodules https://github.com/iolab-uniud/omrexams-ui.git
```

Se hai già clonato il progetto, inizializza il submodule con `git submodule update --init --recursive`. Gli script di avvio eseguono comunque questo controllo automaticamente e interrompono l'avvio se il core non è disponibile.

1. Apri la cartella principale del progetto.
2. Avvia lo script corrispondente al tuo sistema operativo:
   - Windows: Esegui `start.bat`
   - Mac/Linux: Esegui `./start.sh` da terminale
3. Lo script controllerà che il motore Docker sia acceso, aggiornerà in modo incrementale le immagini, attiverà i container e aprirà in automatico la pagina web corretta (`http://localhost:8080`) nel tuo browser, da dove sarà possibile utilizzare l'applicazione.
La prima build può richiedere diversi minuti; negli avvii successivi Docker riutilizzerà i layer invariati dalla cache.

4. **Spegnimento dell'app:** Basterà premere un tasto qualsiasi nella finestra del terminale rimasta aperta. Lo script si occuperà di spegnere in modo pulito i container e spegnere il Docker Engine qualora richiesto.

### Dipendenze backend con uv

Il backend usa `backend/pyproject.toml` e `backend/uv.lock` per una risoluzione riproducibile delle dipendenze. Dopo aver modificato il manifest, aggiorna il lockfile dalla radice del repository:

```sh
uv lock --project backend
```

Per preparare un ambiente locale, installa prima le dipendenze bloccate e poi il core incluso come submodule, senza risolverne nuovamente le dipendenze:

```sh
cd backend
uv sync --locked
uv pip install --no-deps -e ./omrexams
```

Il sottocomando `uv pip` usa direttamente uv e mantiene il core separato dal manifest della UI, riducendo i conflitti quando il submodule viene aggiornato dal progetto originale.

### Avvio dalle immagini Docker pubblicate

Ogni release contrassegnata da un tag `v*` pubblica immagini multi-architettura per sistemi AMD64 e ARM64, incluse le macchine Mac con Apple Silicon. Il tag `latest` identifica la release più recente.

Crea un file `compose.yaml` in una cartella vuota con questo contenuto:

```yaml
services:
   backend:
      image: ghcr.io/iolab-uniud/omrexams-backend:latest
      environment:
         DATA_DIR: /app/data
      volumes:
         - ./data:/app/data
      restart: unless-stopped

   frontend:
      image: ghcr.io/iolab-uniud/omrexams-frontend:latest
      ports:
         - "8080:80"
      depends_on:
         - backend
      restart: unless-stopped
```

Avvia quindi l'applicazione con `docker compose up -d` e apri `http://localhost:8080`. La directory locale `data/` viene creata automaticamente da Docker e conserva esami, scansioni e risultati anche dopo l'arresto dei container. Per fermare l'applicazione, usa `docker compose down`.

### Creazione di una release

Dopo aver committato tutte le modifiche della release, usa lo script per incrementare la versione e pubblicare il tag che avvia il workflow GHCR:

```sh
./scripts/release.sh patch
```

Sono disponibili anche gli incrementi `minor` e `major`, oppure puoi indicare direttamente una versione, ad esempio `./scripts/release.sh vX.Y.Z`. `frontend/package.json` e' la fonte di verita della versione: lo script la incrementa, aggiorna il lockfile, genera una voce in `CHANGELOG.md`, crea il commit di release e poi pubblica il tag. Se disponibile, `claude -p` prepara la bozza dai commit dall'ultimo tag; altrimenti lo script apre nell'editor l'elenco dei commit, da completare manualmente. Usa `--no-llm` per non usare Claude e `--no-edit` per non aprire l'editor. Lo script controlla inoltre che l'albero di lavoro sia pulito, che l'ultimo tag sia allineato alla versione dichiarata e che il nuovo tag non esista gia'; con `--yes` salta la conferma.

## Parti principali e architettura

Il progetto è diviso in tre blocchi logici principali, orchestrati da `docker-compose.yaml`:

- **Frontend (`frontend/`)**
   È sviluppato in React e compilato con Vite. Il codice applicativo si trova in `frontend/src`, suddiviso in pagine, componenti, hook, client API e utilità.

   La build di produzione viene servita da **Nginx**, che inoltra al backend le richieste dirette a `/api`.

- **Backend (`backend/`)**
   È sviluppato in Python con FastAPI e funge da ponte tra l'interfaccia web e il motore di elaborazione OMR. `backend/main.py` configura l'applicazione, mentre gli endpoint, i modelli di richiesta e risposta, i servizi condivisi e la gestione dello stato risiedono rispettivamente in `api/`, `schemas/`, `services/` e `state/`.

   Il motore OMR riutilizzabile è il progetto separato incluso come submodule in `backend/omrexams/` e installato come pacchetto Python durante la build del container. Gestisce l'elaborazione delle immagini, la generazione dei PDF e le conversioni dei dati degli esami.

- **Dati persistenti (`data/`)**
   La directory locale `data/` è montata nel container backend come `/app/data`. Compiti generati, scansioni, risultati e altri file applicativi restano quindi sul computer dell'utente anche quando i container vengono arrestati o ricreati.

### Struttura del repository

```text
omrexams-ui/
├── backend/
│   ├── api/          # endpoint FastAPI
│   ├── schemas/      # modelli di validazione e trasferimento dati
│   ├── services/     # servizi applicativi condivisi
│   ├── state/        # gestione dello stato applicativo
│   ├── omrexams/     # core OMRExams (Git submodule)
│   ├── fonts/        # font inclusi nell'immagine backend
│   └── main.py       # entry point FastAPI
├── frontend/
│   └── src/
│       ├── api/      # client HTTP
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       └── utils/
├── data/             # dati applicativi persistenti
├── docs/             # documentazione delle funzionalità
├── scripts/          # strumenti di release e manutenzione
├── docker-compose.yaml
├── start.bat
└── start.sh
```

---
La documentazione delle singole funzionalità è disponibile nella cartella `docs/`.
