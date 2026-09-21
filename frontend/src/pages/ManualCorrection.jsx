import { useState, useEffect } from 'react';
import { ClipboardEdit } from 'lucide-react';
import { manualAPI, correctAPI, generateAPI } from '../api/client';
import PDFPreview from '../components/PDFPreview';
import CroppedPDFPreview from '../components/CroppedPDFPreview';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton';
import HomeButton from '../components/HomeButton';
import HelpButton from '../components/HelpButton';

export default function ManualCorrection() {
  const [workingDirs, setWorkingDirs] = useState([]);
  const [workingDir, setWorkingDir] = useState('');
  
  const [mode, setMode] = useState(null); // 'scans' or 'missing'
  
  // Corrected Mode State
  const [correctedList, setCorrectedList] = useState([]);
  const [selectedCorrected, setSelectedCorrected] = useState('');
  const [correctedMapping, setCorrectedMapping] = useState({});
  const [selectedCorrectedStudent, setSelectedCorrectedStudent] = useState('');
  const [showAlgorithms, setShowAlgorithms] = useState(false);
  const [showFullPdf, setShowFullPdf] = useState(false);
  
  // Missing Mode State
  const [missingList, setMissingList] = useState([]);
  const [currentMissingIndex, setCurrentMissingIndex] = useState(0);
  
  // Student Data (Shared for correction panel)
  const [currentStudentId, setCurrentStudentId] = useState('');
  const [studentData, setStudentData] = useState(null);
  
  // Global Feedback (displayed under JSON select)
  const [globalMessage, setGlobalMessage] = useState('');
  const [globalError, setGlobalError] = useState('');
  
  // Panel Feedback (displayed inside Manual Correction Panel)
  const [panelMessage, setPanelMessage] = useState('');
  const [panelError, setPanelError] = useState('');
  
  const navigate = useNavigate();

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const res = await generateAPI.getFiles();
      setWorkingDirs(res.working_dirs || []);
    } catch (e) {
      console.error(e);
      setGlobalError("Errore nel caricamento dei dati di base");
    }
  };

  const loadCorrected = async () => {
    try {
      const res = await manualAPI.getCorrected(workingDir);
      setCorrectedList(res.corrected || []);
      setMode('corrected');
      setCurrentStudentId('');
      setStudentData(null);
      if (res.corrected.length > 0) {
          setSelectedCorrected(res.corrected[0]);
          loadCorrectedMapping(res.corrected[0]);
      }
    } catch (e) {
      setGlobalError("Errore nel caricamento dei PDF corretti");
    }
  };

  const loadCorrectedMapping = async (pdfName) => {
    try {
      const res = await manualAPI.getCorrectedMapping(workingDir, pdfName);
      setCorrectedMapping(res.mapping || {});
      const students = Object.keys(res.mapping || {});
      if (students.length > 0) {
        setSelectedCorrectedStudent(students[0]);
        handleStudentSelect(students[0]);
      } else {
        setSelectedCorrectedStudent('');
      }
    } catch (e) {
      console.error(e);
      setGlobalError("Mapping del PDF non trovato. È necessario rigenerare gli esami corretti.");
      setCorrectedMapping({});
      setSelectedCorrectedStudent('');
    }
  };

  const handleCorrectedPdfChange = (e) => {
    const pdfName = e.target.value;
    setSelectedCorrected(pdfName);
    loadCorrectedMapping(pdfName);
  };

  const handleCorrectedStudentChange = (e) => {
    const studentId = e.target.value;
    setSelectedCorrectedStudent(studentId);
    handleStudentSelect(studentId);
  };

  const loadMissing = async () => {
    setGlobalError('');
    setGlobalMessage('');
    if (!workingDir) {
      setGlobalError("Seleziona prima un Cartella di lavoro");
      return;
    }
    try {
      const res = await manualAPI.getMissing(workingDir);
      setMissingList(res.missing || []);
      setMode('missing');
      setCurrentMissingIndex(0);
      if (res.missing && res.missing.length > 0) {
        handleStudentSelect(res.missing[0].student_id);
      } else {
        setGlobalMessage("Tutti gli esami sono stati corretti correttamente!");
        setCurrentStudentId('');
        setStudentData(null);
      }
    } catch (e) {
      setGlobalError("Errore nel caricamento degli esami dubbi");
    }
  };

  const handleStudentSelect = async (id) => {
    setPanelError('');
    setPanelMessage('');
    if (!workingDir || !id) return;
    setCurrentStudentId(id);
    try {
      const res = await manualAPI.getStudentData(workingDir, id);
      setStudentData(res);
    } catch (e) {
      setPanelError("Errore nel caricamento dei dati dello studente");
    }
  };

  const handleForceAnswer = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const question = parseInt(fd.get('question'));
    const given_answers = fd.get('given_answers');
    
    if (!question || !given_answers) return;
    
    try {
      await manualAPI.forceAnswer({
        working_dir: workingDir,
        student_id: currentStudentId,
        question,
        given_answers
      });
      setPanelMessage(`Risposta alla domanda ${question} forzata con successo!`);
      // Reload the data to update the form
      handleStudentSelect(currentStudentId);
    } catch (e) {
      setPanelError(e.response?.data?.detail || "Errore durante il salvataggio");
    }
  };

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-yellow-200 via-white to-white pb-20">
      <BackButton />
      <HomeButton />
      <div className="max-w-6xl mx-auto p-6 space-y-6 pb-20">
        <header className="flex items-center gap-4 border-b pb-4 mb-8">
          <div className="bg-yellow-100 p-3 rounded-full text-yellow-700">
            <ClipboardEdit size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Verifica manuale</h1>
            <p className="text-gray-600 mt-1">Gestisci gli esami dubbi e correggi le risposte manualmente.</p>
          </div>
        </header>


        {/* DATAFILE SELECTION */}
        <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-yellow-400 hover:shadow-md transition-all flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <label className="font-semibold text-gray-700">Cartella di lavoro attivo:</label>
            <HelpButton title="Revisione e verifica manuale">
              <div className="text-sm text-gray-700 space-y-3">
                <p>
                  <strong>Esami corretti:</strong> Verranno visualizzati gli esami corretti dal sistema, mostrando per ogni studente le risposte date per ogni domanda e le statistiche delle risposte derivate dagli algoritmi di correzione. È possibile inoltre estendere l'analisi osservando anche come hanno agito i diversi algoritmi di correzione.
                </p>
                <p>
                  <strong>Esami dubbi:</strong> Verranno visualizzati i fogli di esame che non sono stati corretti dal sistema a causa di un problema (es. fallita scansione del codice QR).
                </p>
                <p>
                  Sia le risposte degli esami dubbi che di quelli corretti possono essere modificate attraverso il <strong>pannello correzione manuale</strong> sottostante, che presenterà la maschera delle risposte per lo studente scelto offrendo la possibilità di forzare una determinata risposta.
                </p>
              </div>
            </HelpButton>
          </div>
          <select 
            className="border border-gray-300 p-2 rounded focus:ring-2 focus:ring-orange-500 w-64"
            value={workingDir}
            onChange={(e) => setWorkingDir(e.target.value)}
          >
            <option value="">Seleziona...</option>
            {workingDirs.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </section>

        {/* GLOBAL MESSAGES (under JSON selection) */}
        {globalError && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 shadow-sm flex justify-between">
            <span>{globalError}</span>
            <button onClick={() => setGlobalError('')} className="font-bold">&times;</button>
          </div>
        )}
        {globalMessage && (
          <div className="bg-emerald-50 text-emerald-600 p-4 rounded-lg border border-emerald-200 shadow-sm flex justify-between">
            <span>{globalMessage}</span>
            <button onClick={() => setGlobalMessage('')} className="font-bold">&times;</button>
          </div>
        )}

        {/* MODE */}
        <div className="grid grid-cols-2 gap-6">
          <button 
            onClick={loadCorrected}
            className={`p-6 rounded-xl border-2 transition-all ${mode === 'corrected' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 bg-white shadow-sm'}`}
          >
            <h3 className="text-xl font-bold text-blue-800 mb-2">Esami corretti</h3>
            <p className="text-sm text-gray-600">Visualizza i PDF completi generati durante la correzione automatica.</p>
          </button>
          
          <button 
            onClick={loadMissing}
            className={`p-6 rounded-xl border-2 transition-all ${mode === 'missing' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-300 bg-white shadow-sm'}`}
          >
            <h3 className="text-xl font-bold text-orange-800 mb-2">Esami dubbi (da verificare)</h3>
            <p className="text-sm text-gray-600">Visualizza solo i fogli che il sistema non è riuscito a leggere in automatico.</p>
          </button>
        </div>

        {/* CORRECTED VIEW */}
        {mode === 'corrected' && (
          <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-yellow-400 hover:shadow-md transition-all flex flex-col">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-4">
              <div className="flex items-center gap-4">
                <label className="font-semibold text-gray-700">Seleziona PDF:</label>
                <select 
                  className="border border-gray-300 p-2 rounded w-64"
                  value={selectedCorrected}
                  onChange={handleCorrectedPdfChange}
                >
                  {correctedList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              
              {Object.keys(correctedMapping).length > 0 && (
                <>
                  <div className="flex items-center gap-4">
                    <label className="font-semibold text-gray-700">Studente:</label>
                    <select 
                      className="border border-gray-300 p-2 rounded w-64"
                      value={selectedCorrectedStudent}
                      onChange={handleCorrectedStudentChange}
                    >
                      {Object.keys(correctedMapping).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  
                  <div className="flex items-center ml-auto gap-2">
                    <button
                      onClick={() => setShowFullPdf(true)}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg shadow hover:bg-gray-700 transition-colors"
                    >
                      Visualizza PDF intero
                    </button>
                    <button
                      onClick={() => setShowAlgorithms(!showAlgorithms)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors"
                    >
                      {showAlgorithms ? 'Nascondi algoritmi' : 'Approfondisci algoritmi'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* FULL PDF MODAL */}
            {showFullPdf && selectedCorrected && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800">Visualizzazione completa: {selectedCorrected}</h2>
                    <button 
                      onClick={() => setShowFullPdf(false)}
                      className="text-gray-500 hover:text-red-500 font-bold text-2xl px-2"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 bg-gray-100">
                    <PDFPreview url={`/api/data/${workingDir}/corrected/${selectedCorrected}`} />
                  </div>
                </div>
              </div>
            )}

            <div className="border border-gray-200 rounded overflow-hidden">
              {selectedCorrected && selectedCorrectedStudent ? (
                <div className="w-full overflow-x-auto bg-gray-50">
                  <CroppedPDFPreview 
                    url={`/api/data/${workingDir}/corrected/${encodeURIComponent(selectedCorrected)}`} 
                      pages={correctedMapping[selectedCorrectedStudent]} 
                      showAlgorithms={showAlgorithms}
                    />
                  </div>
              ) : selectedCorrected ? (
                <p className="p-4 text-gray-500">Seleziona uno studente o rigenera il PDF per aggiornare la mappatura.</p>
              ) : (
                <p className="p-4 text-gray-500">Nessun file selezionato</p>
              )}
            </div>
          </section>
        )}

        {/* MISSING VIEW (DOUBTS) */}
        {mode === 'missing' && missingList.length > 0 && (
          <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-yellow-400 hover:shadow-md transition-all flex flex-col">
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg border">
              <button 
                onClick={() => {
                  const newIdx = Math.max(0, currentMissingIndex - 1);
                  setCurrentMissingIndex(newIdx);
                  handleStudentSelect(missingList[newIdx].student_id);
                }}
                disabled={currentMissingIndex === 0}
                className="px-4 py-2 bg-white border border-gray-300 rounded shadow-sm disabled:opacity-50 hover:bg-gray-50"
              >
                &larr; Precedente
              </button>
              <div className="text-center">
                <span className="font-bold text-lg text-gray-800">Studente ID: {missingList[currentMissingIndex].student_id}</span>
                <p className="text-sm text-gray-500">Esame {currentMissingIndex + 1} di {missingList.length}</p>
              </div>
              <button 
                onClick={() => {
                  const newIdx = Math.min(missingList.length - 1, currentMissingIndex + 1);
                  setCurrentMissingIndex(newIdx);
                  handleStudentSelect(missingList[newIdx].student_id);
                }}
                disabled={currentMissingIndex === missingList.length - 1}
                className="px-4 py-2 bg-white border border-gray-300 rounded shadow-sm disabled:opacity-50 hover:bg-gray-50"
              >
                Successivo &rarr;
              </button>
            </div>
            
            <div className="flex gap-4 overflow-x-auto p-4 bg-gray-100 rounded-lg">
              {missingList[currentMissingIndex].images.map(img => (
                <img 
                  key={img} 
                  src={`/api/data/${workingDir}/sorted/${img}`} 
                  alt="Exam Page" 
                  className="max-h-[600px] object-contain border bg-white shadow-sm"
                />
              ))}
              {missingList[currentMissingIndex].images.length === 0 && (
                <p className="text-gray-500 italic p-4">Nessuna immagine trovata in sorted/ per questo studente.</p>
              )}
            </div>
          </section>
        )}

        {/* PROOFING TOOLS (Visible in both modes if there is a file loaded and we insert manually) */}
        <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-yellow-400 hover:shadow-md transition-all flex flex-col">
          <h2 className="text-xl font-semibold text-gray-700 border-b pb-2 flex items-center">
            Pannello correzione manuale
            <HelpButton title="Revisione e modifica manuale">
              <p className="mb-3">In questa sezione puoi visualizzare lo stato delle risposte rilevate otticamente per un preciso studente.</p>
              <p className="mb-3">Se noti un'imprecisione nel rilevamento, c'è la possibilità di modificare manualmente le singole risposte.</p>
              <div className="bg-yellow-50 border border-yellow-100 p-3 rounded mt-4">
                <p className="text-sm text-yellow-800">Le modifiche manuali effettuate qui sovrascriveranno anche i dati rilevati dal sistema per quel determinato studente nel Cartella di lavoro.</p>
              </div>
            </HelpButton>
          </h2>
          
          {panelError && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 shadow-sm flex justify-between">
              <span>{panelError}</span>
              <button onClick={() => setPanelError('')} className="font-bold">&times;</button>
            </div>
          )}
          
          {panelMessage && (
            <div className="bg-emerald-50 text-emerald-600 p-4 rounded-lg border border-emerald-200 shadow-sm flex justify-between">
              <span>{panelMessage}</span>
              <button onClick={() => setPanelMessage('')} className="font-bold">&times;</button>
            </div>
          )}
          
          <div className="flex gap-4 items-end bg-blue-50 p-4 rounded-lg">
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-1">Studente ID in esame:</label>
              <input 
                type="text" 
                value={currentStudentId} 
                onChange={(e) => setCurrentStudentId(e.target.value)}
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Inserisci ID studente..."
              />
            </div>
            <button 
              onClick={() => handleStudentSelect(currentStudentId)}
              className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
            >
              Carica maschera esame
            </button>
          </div>

          {studentData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
              
              {/* Get Answers / Correction Mask table */}
              <div className="space-y-4">
                <h3 className="font-bold text-gray-800">Stato risposte attuale</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 border">Q</th>
                        <th className="p-2 border">Ref Correct</th>
                        <th className="p-2 border">Marked</th>
                        <th className="p-2 border">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentData.answers_status.map((ans, idx) => (
                        <tr key={idx} className={`border-b ${ans.is_doubtful ? 'bg-orange-100 border-orange-300' : ''}`}>
                          <td className="p-2 border font-mono">
                            {ans.question}
                            {ans.is_doubtful && <span className="ml-2 text-xs bg-orange-500 text-white px-1 py-0.5 rounded" title="Dubbio segnalato">Dubbio</span>}
                          </td>
                          <td className="p-2 border text-emerald-600">{Array.isArray(ans.correct_ref) ? ans.correct_ref.join(', ') : ans.correct_ref}</td>
                          <td className="p-2 border text-orange-600 font-bold">{Array.isArray(ans.marked) ? ans.marked.join(', ') : ans.marked || '-'}</td>
                          <td className="p-2 border">{ans.marking}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Form Force Answer */}
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4">Forza risposta</h3>
                <form onSubmit={handleForceAnswer} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">N. domanda</label>
                    <input 
                      name="question"
                      type="number" 
                      min="1" 
                      required
                      className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Risposta (es. A, AC, D...)</label>
                    <input 
                      name="given_answers"
                      type="text" 
                      required
                      placeholder="Stringa senza spazi"
                      className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 uppercase"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-2 bg-yellow-500 text-white font-bold rounded shadow hover:bg-yellow-600"
                  >
                    Applica modifica
                  </button>
                </form>
              </div>
              
            </div>
          )}

        </section>

        <div className="flex justify-center gap-4 pt-4 border-t">
          <button 
              onClick={() => navigate('/mark')}
              className="px-6 py-3 bg-orange-600 text-white font-bold rounded-lg shadow-md hover:bg-orange-700 transition-colors"
            >
              Assegna i voti &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
