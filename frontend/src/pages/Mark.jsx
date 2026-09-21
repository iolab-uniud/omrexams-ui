import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, ArrowRight, Table, AlertCircle, FileSpreadsheet, Download, DownloadIcon, FileCode2, Home, FileOutput } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton';
import HomeButton from '../components/HomeButton';
import HelpButton from '../components/HelpButton';
import { usePrompt } from '../hooks/usePrompt';
import { correctAPI, markAPI, generateAPI } from '../api/client';
import XlsxPreview from '../components/XlsxPreview';

export default function Mark() {
  const [workingDirs, setWorkingDirs] = useState([]);
  const [allFiles, setAllFiles] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Calculation of votes
  const [markWorkingDir, setMarkWorkingDir] = useState('');
  const [markOutput, setMarkOutput] = useState('voti.xlsx');
  const [useCustomWeights, setUseCustomWeights] = useState(false);
  const [weightCorrect, setWeightCorrect] = useState(1.0);
  const [weightWrong, setWeightWrong] = useState(-0.33);
  const [weightMissing, setWeightMissing] = useState(0.0);
  const [markResult, setMarkResult] = useState(null);
  const [markLoading, setMarkLoading] = useState(false);
  const [markError, setMarkError] = useState(null);

  // Reports
  const [reportWorkingDir, setReportWorkingDir] = useState('');
  const [reportOutput, setReportOutput] = useState('report.xlsx');
  const [reportResult, setReportResult] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  // Analyses
  const [analysisWorkingDir, setAnalysisWorkingDir] = useState('');
  const [questionsList, setQuestionsList] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [analysisMode, setAnalysisMode] = useState(''); // 'review' or 'students'
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  
  const { prompt, PromptModal } = usePrompt();

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const status = await generateAPI.getFiles();
      setWorkingDirs(status.working_dirs || []);
      // all_files might not be present in generateAPI.getFiles(), we can omit or handle it differently
      setAllFiles(status.jsons || []); // We don't strictly need allFiles except to check existing outputs, but outputs are now saved in working_dirs.
      if (status.working_dirs && status.working_dirs.length > 0) {
        setMarkWorkingDir(status.working_dirs[0]);
        setReportWorkingDir(status.working_dirs[0]);
        setAnalysisWorkingDir(status.working_dirs[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    if (analysisWorkingDir) {
      loadQuestionsList(analysisWorkingDir);
    }
  }, [analysisWorkingDir]);

  const loadQuestionsList = async (working_dir) => {
    try {
      const res = await markAPI.getQuestionsList(working_dir);
      setQuestionsList(res.questions);
      if (res.questions.length > 0) {
        setSelectedQuestion(JSON.stringify(res.questions[0]));
      }
    } catch (e) {
      console.error("Errore nel caricamento delle domande:", e);
      setQuestionsList([]);
    }
  };

  const handleCalculateMark = async () => {
    if (!markWorkingDir || !markOutput) return;
    
    let currentOutput = markOutput;
    while (allFiles.includes(currentOutput)) {
      const userChoice = await prompt(`Il file "${currentOutput}" esiste già.\nInserisci un nuovo nome per creare un nuovo file, oppure lascia questo per sovrascriverlo (Annulla per fermare):`, currentOutput);
      if (userChoice === null) return;
      const newName = userChoice.trim();
      if (newName === currentOutput) break;
      currentOutput = newName;
    }
    
    if (currentOutput !== markOutput) {
      setMarkOutput(currentOutput);
    }

    setMarkLoading(true);
    setMarkError(null);
    setMarkResult(null);
    try {
      const payload = { working_dir: markWorkingDir, outputfile: currentOutput };
      if (useCustomWeights) {
        payload.use_custom_weights = true;
        payload.weight_correct = parseFloat(weightCorrect) || 0;
        payload.weight_wrong = parseFloat(weightWrong) || 0;
        payload.weight_missing = parseFloat(weightMissing) || 0;
      }
      const res = await markAPI.calculateMark(payload);
      setMarkResult(res);
      await loadStatus();
    } catch (e) {
      setMarkError(e.response?.data?.detail || "Errore durante il calcolo voti");
    } finally {
      setMarkLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!reportWorkingDir || !reportOutput) return;
    
    let currentOutput = reportOutput;
    while (allFiles.includes(currentOutput)) {
      const userChoice = await prompt(`Il file "${currentOutput}" esiste già.\nInserisci un nuovo nome per creare un nuovo file, oppure lascia questo per sovrascriverlo (Annulla per fermare):`, currentOutput);
      if (userChoice === null) return;
      const newName = userChoice.trim();
      if (newName === currentOutput) break;
      currentOutput = newName;
    }
    
    if (currentOutput !== reportOutput) {
      setReportOutput(currentOutput);
    }

    setReportLoading(true);
    setReportError(null);
    setReportResult(null);
    try {
      const res = await markAPI.generateReport({ working_dir: reportWorkingDir, outputfile: currentOutput });
      setReportResult(res);
      await loadStatus();
    } catch (e) {
      setReportError(e.response?.data?.detail || "Errore durante la generazione del report");
    } finally {
      setReportLoading(false);
    }
  };

  const handleAnalyze = async (mode, exportFormat = null) => {
    if (!analysisWorkingDir || !selectedQuestion) return;
    
    let outputFilename = null;
    if (exportFormat) {
      let currentOutput = await prompt(`Inserisci il nome del file per esportare in ${exportFormat.toUpperCase()}:`, `export.${exportFormat === 'excel' ? 'xlsx' : 'md'}`);
      if (!currentOutput) return;
      
      currentOutput = currentOutput.trim();
      
      while (allFiles.includes(currentOutput)) {
        const userChoice = await prompt(`Il file "${currentOutput}" esiste già.\nInserisci un nuovo nome per creare un nuovo file, oppure lascia questo per sovrascriverlo (Annulla per fermare):`, currentOutput);
        if (userChoice === null) return;
        const newName = userChoice.trim();
        if (newName === currentOutput) break;
        currentOutput = newName;
      }
      outputFilename = currentOutput;
    }

    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    setAnalysisMode(mode);
    try {
      const q = JSON.parse(selectedQuestion);
      if (mode === 'review') {
        const res = await markAPI.reviewQuestion(analysisWorkingDir, q.file, q.index, exportFormat, outputFilename);
        setAnalysisResult({ type: 'review', data: res.results, exported: res.file, path: res.path });
      } else {
        const res = await markAPI.studentsWithQuestion(analysisWorkingDir, q.file, q.index, exportFormat, outputFilename);
        setAnalysisResult({ type: 'students', data: res.students, exported: res.file, path: res.path });
      }
      if (exportFormat) await loadStatus();
    } catch (e) {
      setAnalysisError(e.response?.data?.detail || "Errore durante l'analisi");
    } finally {
      setAnalysisLoading(false);
    }
  };

  if (loadingInitial) return <div className="p-8 text-center animate-pulse">Caricamento stato...</div>;

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-orange-200 via-white to-white">
      <PromptModal />
      <BackButton />
      <HomeButton />
      <div className="max-w-6xl mx-auto p-6 space-y-8 pb-20">
        <header className="flex items-center gap-4 border-b pb-4 mb-8">
          <div className="bg-orange-100 p-3 rounded-full text-orange-700">
            <FileOutput size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Assegnazione voti</h1>
            <p className="text-gray-600 mt-1">Calcola i voti, genera report statistici ed esplora i dati sulle singole domande.</p>
          </div>
        </header>

        {/* Stoplight */}
        <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-orange-400 hover:shadow-md transition-all flex items-center gap-4">
          <div className={`w-4 h-4 rounded-full ${workingDirs.length > 0 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'}`}></div>
          <div>
            <h3 className="font-semibold text-gray-800">Stato Cartella di lavoro</h3>
            <p className="text-sm text-gray-500">
              {workingDirs.length > 0 ? `${workingDirs.length} Cartelle di lavoro trovate.` : 'Nessuna cartella di lavoro trovata. Esegui prima le fasi precedenti.'}
            </p>
          </div>
        </section>

        {workingDirs.length > 0 && (
          <div className="grid grid-cols-1 gap-8">
            
            {/* Vote Calculation */}
            <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-orange-400 hover:shadow-md transition-all flex flex-col">
              <h2 className="text-xl font-bold text-gray-700 border-b pb-2 flex items-center">
                Calcolo voti
                <HelpButton title="Lettura del file dei voti">
                  <p className="mb-3">Viene generato un foglio Excel contenente per ogni studente e per ogni domanda sottoposta all'esame le seguenti informazioni:</p>
                  <ul className="list-disc pl-5 mb-4 space-y-2">
                    <li>Risposte corrette</li>
                    <li>Risposte corrette mancanti (nel caso ci siano più risposte corrette)</li>
                    <li>Risposte errate</li>
                    <li>Numero di opzioni di risposta</li>
                    <li>Indice della domanda (all'interno del file markdown originale)</li>
                    <li>Punti totali dello studente</li>
                    <li>Voto proposto (calcolato)</li>
                  </ul>
                  <p className="mb-3">Viene data la possibilità di impostare i pesi da aggiungere o togliere per le varie risposte corrette, sbagliate e omesse.</p>
                  <p className="mb-3">Nel caso invece non venga selezionata l'opzione viene applicata in automatica una funzione che assegna il peso in base al numero di soluzioni di una domanda. Se ad esempio una domanda ha una risposta giusta la risposta corretta avrà peso 1.0, mentre se la domanda ha due risposte corrette ogni risposta corretta peserà 0.5.</p>
                </HelpButton>
              </h2>
              <div className="flex flex-col gap-4 bg-orange-50 p-4 rounded-lg">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Seleziona Cartella di lavoro:</label>
                    <select value={markWorkingDir} onChange={(e) => setMarkWorkingDir(e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500">
                      {workingDirs.map(df => <option key={df} value={df}>{df}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome file output (.xlsx):</label>
                    <input type="text" value={markOutput} onChange={(e) => setMarkOutput(e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button 
                    onClick={handleCalculateMark} 
                    disabled={markLoading}
                    className="px-4 py-2 bg-orange-500 text-white rounded shadow hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                  >
                    {markLoading ? 'Calcolo in corso...' : 'Calcolo Voti'}
                  </button>
                </div>
                
                <div className="mt-1 border-t border-orange-200 pt-3">
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={useCustomWeights} onChange={(e) => setUseCustomWeights(e.target.checked)} className="w-4 h-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded" />
                    <span className="text-sm font-bold text-gray-700">Usa pesi personalizzati (sovrascrive il calcolo standard)</span>
                  </label>
                  
                  {useCustomWeights && (
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-600 mb-1">Punti Risposta Esatta:</label>
                        <input type="number" step="0.01" value={weightCorrect} onChange={(e) => setWeightCorrect(e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-orange-500 text-sm bg-white" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-600 mb-1">Punti Risposta Errata (es. -0.33):</label>
                        <input type="number" step="0.01" value={weightWrong} onChange={(e) => setWeightWrong(e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-orange-500 text-sm bg-white" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-600 mb-1">Punti Risposta Omessa:</label>
                        <input type="number" step="0.01" value={weightMissing} onChange={(e) => setWeightMissing(e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-orange-500 text-sm bg-white" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {markError && <div className="text-red-600 bg-red-50 p-3 rounded">{markError}</div>}
              
              {markResult && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg text-emerald-800">
                  <p className="font-semibold">Calcolo dei voti completato. File excel salvato nella cartella di lavoro ({markWorkingDir})</p>
                  <XlsxPreview filename={markResult.file} folder={markWorkingDir} headerRows={3} indexCols={1} centerHeaders={true} rotateLowestHeaders={true} />
                </div>
              )}
            </section>

            {/* Statistical Report */}
            <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-orange-400 hover:shadow-md transition-all flex flex-col">
              <h2 className="text-xl font-bold text-gray-700 border-b pb-2 flex items-center">
                Generazione report
                <HelpButton title="Report Statistico dell'esame">
                  <p className="mb-3">Viene generato un file Excel contenente le statistiche per ogni singola domanda presente negli esami.</p>
                  <p className="mb-2 font-medium">Informazioni calcolate per ogni domanda:</p>
                  <ul className="list-disc pl-5 mb-4 space-y-2">
                    <li>Statistiche sui successi (<code className="bg-gray-100 px-1 rounded text-grey-700 font-mono">count, sum, mean, std</code>)</li>
                    <li>Statistiche sulle risposte omesse nel caso ci siano più risposte corrette (<code className="bg-gray-100 px-1 rounded text-grey-700 font-mono">mean, std</code>)</li>
                    <li>Statistiche sugli errori (<code className="bg-gray-100 px-1 rounded text-grey-700 font-mono">mean, std</code>)</li>
                    <li>Numero di opzioni di risposta alle domande</li>
                    <li>Numero di risposte corrette per quella domanda (1 o più)</li>
                  </ul>
                </HelpButton>
              </h2>
              <div className="flex gap-4 items-end bg-orange-50 p-4 rounded-lg">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Seleziona Cartella di lavoro:</label>
                  <select value={reportWorkingDir} onChange={(e) => setReportWorkingDir(e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500">
                    {workingDirs.map(df => <option key={df} value={df}>{df}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Nome file output (.xlsx):</label>
                  <input type="text" value={reportOutput} onChange={(e) => setReportOutput(e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500" />
                </div>
                <button 
                  onClick={handleGenerateReport} 
                  disabled={reportLoading}
                  className="px-4 py-2 bg-orange-500 text-white rounded shadow hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                >
                  {reportLoading ? 'Generazione...' : 'Genera report'}
                </button>
              </div>
              
              {reportError && <div className="text-red-600 bg-red-50 p-3 rounded">{reportError}</div>}
              
              {reportResult && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg text-emerald-800">
                  <p className="font-semibold">Generazione report completata. File excel salvato nella cartella di lavoro ({reportWorkingDir})</p>
                  <XlsxPreview filename={reportResult.file} folder={reportWorkingDir} headerRows={2} indexCols={2} centerHeaders={true} rotateFirstIndex={true} />
                </div>
              )}
            </section>

            {/* Analysis Questions */}
            <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-orange-400 hover:shadow-md transition-all flex flex-col">
              <h2 className="text-xl font-bold text-gray-700 border-b pb-2 flex items-center">
                Analisi domanda specifica
                <HelpButton title="Analisi di una singola domanda">
                  <p className="mb-3">Questa sezione permette di estrarre e approfondire l'andamento statistico di una <strong>precisa domanda</strong> tra tutte quelle somministrate, fornendo il suo indice all'interno del file delle domande.</p>
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded mt-4">
                    <p className="text-sm text-grey-400">Le statistiche calcolate in questa sezione sono esportabili sia in formato <strong>Excel (.xlsx)</strong> che in <strong>Markdown (.md)</strong>.</p>
                  </div>
                </HelpButton>
              </h2>
              <div className="flex flex-col md:flex-row gap-4 items-end bg-orange-50 p-4 rounded-lg">
                <div className="flex-1 w-full">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Seleziona Cartella di lavoro:</label>
                  <select value={analysisWorkingDir} onChange={(e) => setAnalysisWorkingDir(e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-orange-500">
                    {workingDirs.map(df => <option key={df} value={df}>{df}</option>)}
                  </select>
                </div>
                <div className="flex-1 w-full">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Seleziona domanda:</label>
                  <select value={selectedQuestion} onChange={(e) => setSelectedQuestion(e.target.value)} className="w-full border p-2 rounded focus:ring-2 focus:ring-orange-500">
                    {questionsList.map((q, idx) => (
                      <option key={idx} value={JSON.stringify(q)}>{q.file} (Indice: {q.index})</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleAnalyze('students')} 
                    disabled={analysisLoading}
                    className="px-4 py-2 bg-orange-500 text-white rounded shadow hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                  >
                    Studenti con questa domanda
                  </button>
                  <button 
                    onClick={() => handleAnalyze('review')} 
                    disabled={analysisLoading}
                    className="px-4 py-2 bg-orange-700 text-white rounded shadow hover:bg-orange-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    Revisione domanda
                  </button>
                </div>
              </div>

              {analysisError && <div className="text-red-600 bg-red-50 p-3 rounded">{analysisError}</div>}
              
              {analysisResult && analysisResult.exported && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg text-emerald-800">
                  <p className="font-semibold">Analisi esportata con successo come <strong>{analysisResult.exported}</strong> nella cartella di lavoro ({analysisWorkingDir}).</p>
                </div>
              )}

              {analysisResult && (
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => handleAnalyze(analysisMode, 'excel')} className="px-3 py-1 bg-green-600 text-white text-sm rounded shadow hover:bg-green-700">
                    Esporta Excel
                  </button>
                  <button onClick={() => handleAnalyze(analysisMode, 'markdown')} className="px-3 py-1 bg-gray-800 text-white text-sm rounded shadow hover:bg-gray-900">
                    Esporta Markdown
                  </button>
                </div>
              )}

              {analysisResult && analysisMode === 'students' && (
                <div className="mt-4 p-4 border rounded bg-gray-50">
                  <h3 className="font-bold text-gray-700 mb-2">Studenti a cui è stata assegnata la domanda:</h3>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.data.length > 0 ? analysisResult.data.map(sid => (
                      <span key={sid} className="bg-white border px-3 py-1 rounded-full text-sm font-mono">{sid}</span>
                    )) : <span className="text-gray-500">Nessuno studente trovato.</span>}
                  </div>
                </div>
              )}

              {analysisResult && analysisMode === 'review' && (
                <div className="mt-4 overflow-x-auto border rounded bg-white">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="p-2 border">Studente</th>
                        <th className="p-2 border">Q. Num</th>
                        <th className="p-2 border">Correct Ref</th>
                        <th className="p-2 border">Marked</th>
                        <th className="p-2 border">Correct</th>
                        <th className="p-2 border">Missing</th>
                        <th className="p-2 border">Wrong</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResult.data.length > 0 ? analysisResult.data.map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2 border font-mono">{row.student_id}</td>
                          <td className="p-2 border font-mono">{row.question}</td>
                          <td className="p-2 border text-emerald-600">{row.correct_ref.join(', ')}</td>
                          <td className="p-2 border font-bold">{row.marked.join(', ') || '-'}</td>
                          <td className="p-2 border text-green-600">{row.correct.join(', ') || '-'}</td>
                          <td className="p-2 border text-yellow-600">{row.missing.join(', ') || '-'}</td>
                          <td className="p-2 border text-red-600">{row.wrong.join(', ') || '-'}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan="7" className="p-4 text-center text-gray-500">Nessun dato di correzione per questa domanda.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
        )}

        {/* Return to the Dashboard */}
        <div className="flex justify-center mt-12">
          <Link to="/dashboard" className="px-6 py-2 bg-gray-800 text-white rounded shadow hover:bg-gray-900 transition-colors">
            Torna alla Dashboard
          </Link>
        </div>

      </div>
    </div>
  );
}
