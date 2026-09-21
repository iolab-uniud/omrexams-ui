# Changelog

## 0.4.0 - 2026-09-21

- Introdotta l'organizzazione dei file generati (esami, correzioni, scansioni) in cartelle di lavoro separate e indipendenti per ogni sessione.
- Aggiunta la possibilità di scegliere l'intervallo di domande da cui pescare in fase di generazione dell'esame.
- Le dimensioni personalizzate delle domande aperte ora si esprimono in em anziché in cm.
- Aggiunta l'opzione per lasciare uno spazio bianco sotto le domande aperte, in alternativa alle righe tratteggiate.
- Esteso l'editor di testo (stile Word) anche ai testi delle domande e delle opzioni di risposta.
- Migliorata la conversione tra formattazione HTML e LaTeX nei testi degli esami, rendendola più affidabile.
- Risolto un problema che impediva la corretta build dei container Docker in fase di avvio dell'applicazione.
- Rimossi riferimenti a cartelle dati non più utilizzate a seguito della nuova organizzazione dei file di lavoro.


## 0.3.1 - 2026-09-11

start.sh/start.bat ora eseguono sempre un aggiornamento incrementale dei container Docker invece di saltare la build dopo la prima esecuzione.

- Gli script di avvio (`start.sh`/`start.bat`) ora aggiornano sempre in modo incrementale i container Docker all'avvio, sfruttando la cache, invece di limitarsi alla build una tantum al primo utilizzo.


## 0.3.0 - 2026-09-11

- Nessuna novità visibile per gli utenti in questa versione: la modifica riguarda esclusivamente la riorganizzazione interna del codice (spostamento di omrexams in un submodule) e non introduce cambiamenti alle funzionalità dell'applicazione.


## 0.2.1 - 2026-09-11

- Bookkeeping delle versioni


## 0.2.0 - 2026-09-11

- Nessuna novità visibile per gli utenti in questa versione: gli aggiornamenti riguardano esclusivamente la pubblicazione e il versionamento delle immagini Docker (inclusa la variante arm64) e non modificano le funzionalità dell'applicazione.

