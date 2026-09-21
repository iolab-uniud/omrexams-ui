import React, { useState, useEffect } from 'react';
import { generateAPI } from '../api/client';
import { Play, Upload, CheckCircle2, AlertCircle, ArrowLeft, FilePlus, X, FileText, FileEdit, Copy, Plus, Search, Library } from 'lucide-react';
import HeaderFooterEditor from '../components/HeaderFooterEditor';
import { useNavigate, Link } from 'react-router-dom';
import PDFPreview from '../components/PDFPreview';
import BackButton from '../components/BackButton';
import HomeButton from '../components/HomeButton';
import HelpButton from '../components/HelpButton';
import { usePrompt } from '../hooks/usePrompt';

// Helper function to translate HTML (Quill) to LaTeX
const translateToLatex = (text) => {
  if (!text) return text;
  let latex = text;
  
  // New magic variables
  latex = latex.replace(/\{\{NOME\}\}/g, '\\thestudent');
  latex = latex.replace(/\{\{MATRICOLA\}\}/g, '\\thematriculationno');
  latex = latex.replace(/\{\{DATA\}\}/g, '\\thedate');
  latex = latex.replace(/\{\{PAGINA\}\}/g, '\\thepage');
  
  // Compatibility of old texts
  if (!latex.includes('\\thepage')) latex = latex.replace(/Numero di pagina/gi, '\\thepage');
  if (!latex.includes('\\thedate')) latex = latex.replace(/Data dell'esame/gi, 'Data: \\thedate');
  if (!latex.includes('\\thestudent')) latex = latex.replace(/Nome del candidato/gi, 'Candidato: \\thestudent');
  if (!latex.includes('\\thematriculationno')) latex = latex.replace(/Matricola/gi, 'Matricola: \\thematriculationno');

  // HTML management from Quill
  if (latex.includes('<')) {
    // Quill applies ql-align-* classes to <p> tags
    latex = latex.replace(/<p class="ql-align-center">(.*?)<\/p>/g, '\\begin{center}$1\\end{center}');
    latex = latex.replace(/<p class="ql-align-right">(.*?)<\/p>/g, '\\begin{flushright}$1\\end{flushright}');
    latex = latex.replace(/<p class="ql-align-justify">(.*?)<\/p>/g, '$1');

    // We keep the <div>s for backwards compatibility
    latex = latex.replace(/<div class="ql-align-center">(.*?)<\/div>/g, '\\begin{center}$1\\end{center}');
    latex = latex.replace(/<div class="ql-align-right">(.*?)<\/div>/g, '\\begin{flushright}$1\\end{flushright}');
    latex = latex.replace(/<div class="ql-align-justify">(.*?)<\/div>/g, '$1');
    latex = latex.replace(/<div[^>]*>(.*?)<\/div>/g, '$1 \\newline ');
    
    latex = latex.replace(/<strong>(.*?)<\/strong>/g, '\\textbf{$1}');
    latex = latex.replace(/<em>(.*?)<\/em>/g, '\\textit{$1}');
    latex = latex.replace(/<u>(.*?)<\/u>/g, '\\underline{$1}');
    
    latex = latex.replace(/<p><br><\/p>/g, ' \\newline ');
    latex = latex.replace(/<\/p>/g, ' \\newline ');
    latex = latex.replace(/<p[^>]*>/g, '');
    latex = latex.replace(/<br\s*\/?>/g, ' \\newline ');
    
    latex = latex.replace(/<[^>]+>/g, '');
    latex = latex.replace(/&nbsp;/g, ' ');
    latex = latex.replace(/&lt;/g, '<');
    latex = latex.replace(/&gt;/g, '>');
    latex = latex.replace(/&amp;/g, '&');
    
    latex = latex.replace(/( \\newline )+$/g, '');
  } else {
    latex = latex.replace(/\n/g, ' \\newline ');
  }
  
  return latex.trim();
};

// Reverse function to decode LaTeX saved in YAML files and restore it to the Quill HTML editor
const latexToHtml = (latex) => {
  if (!latex) return latex;
  let html = latex;
  
  // Variables
  html = html.replace(/\\thestudent/g, '{{NOME}}');
  html = html.replace(/\\thematriculationno/g, '{{MATRICOLA}}');
  html = html.replace(/\\thedate/g, '{{DATA}}');
  html = html.replace(/\\thepage/g, '{{PAGINA}}');
  
  // Inline formatting
  html = html.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
  html = html.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>');
  html = html.replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>');
  
  // Alignments (multiline support)
  html = html.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g, '<p class="ql-align-center">$1</p>');
  html = html.replace(/\\begin\{flushright\}([\s\S]*?)\\end\{flushright\}/g, '<p class="ql-align-right">$1</p>');
  
  // Newlines
  html = html.replace(/ \\newline /g, '<br>');
  html = html.replace(/\\newline/g, '<br>');
  
  // Wrap in <p> if needed to be digested well by Quill
  if (!html.includes('<p')) {
    html = `<p>${html}</p>`;
  }
  
  return html;
};

export default function Generate() {
  const navigate = useNavigate();
  const [config, setConfig] = useState({
    exam: { name: 'Esame', language: 'it', shuffle_questions: true, shuffle_answers: true, max_questions: '', max_open_questions: '', page_limits: '', qr_eclevel: 'H' },
    choices: { circled: false, usesf: false },
    paper: 'A4',
    dyslexia: false,
    header: '',
    footer: '',
    preamble: '',
    excel: {
      data_marker: { skip_until: '', on_column: 0, skip_rows: 0 },
      fields: { id: 'id', name: 'name', surname: 'surname', email: '' }
    },
    questions: []
  });

  const [runtime, setRuntime] = useState({
    date: new Date().toISOString().split('T')[0],
    is_anonymous: false,
    num_anonymous_exams: 1,
    selected_student_file: '',
    output_prefix: 'esame_generato',
    split: '',
    seed: Math.floor(Math.random() * 1000000),
    rotated: false,
    save_config: false,
    config_output_name: '',
    dyslexia_count: ''
  });

  const [availableFiles, setAvailableFiles] = useState({ questions: [], students: [], working_dirs: [], jsons_by_dir: {}, configs_by_dir: {} });
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [dataDir, setDataDir] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [selectedConfig, setSelectedConfig] = useState('');
  
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [testPdfUrl, setTestPdfUrl] = useState(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testOutputPrefix, setTestOutputPrefix] = useState('test_layout');
  
  const { prompt, PromptModal } = usePrompt();

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    if (!taskId) return;
    const sse = new EventSource(`/api/sse/stream/${taskId}`);
    sse.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.error) {
        setError(data.error);
        sse.close();
      } else {
        setProgress(data);
        if (data.completed) sse.close();
      }
    };
    sse.onerror = () => {
      setError("Connessione SSE persa.");
      sse.close();
    };
    return () => sse.close();
  }, [taskId]);

  const loadFiles = async () => {
    try {
      const files = await generateAPI.getFiles();
      setAvailableFiles(files);
      if (files.configs_by_dir && Object.keys(files.configs_by_dir).length > 0) {
        setSelectedConfig(Object.keys(files.configs_by_dir)[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadConfig = async () => {
    if (!selectedConfig) return;
    try {
      const savedConfig = await generateAPI.getConfig(selectedConfig);
      if (savedConfig && Object.keys(savedConfig).length > 0) {
        // Reset HTML for WYSIWYG editor
        if (savedConfig.header) savedConfig.header = latexToHtml(savedConfig.header);
        if (savedConfig.preamble) savedConfig.preamble = latexToHtml(savedConfig.preamble);
        if (savedConfig.footer) savedConfig.footer = latexToHtml(savedConfig.footer);
        
        setConfig(() => {
          const newConfig = {
            exam: { name: 'Esame', language: 'it', shuffle_questions: true, shuffle_answers: true, max_questions: '', max_open_questions: '', page_limits: '', qr_eclevel: 'H' },
            choices: { circled: false, usesf: false },
            paper: 'A4',
            dyslexia: false,
            header: '',
            footer: '',
            preamble: '',
            excel: {
              data_marker: { skip_until: '', on_column: 0, skip_rows: 0 },
              fields: { id: 'id', name: 'name', surname: 'surname', email: '' }
            },
            questions: []
          };
          
          if (savedConfig.exam) {
            newConfig.exam = { ...newConfig.exam, ...savedConfig.exam };
          }
          if (savedConfig.choices) {
            newConfig.choices = { ...newConfig.choices, ...savedConfig.choices };
          }
          if (savedConfig.excel) {
            newConfig.excel = { ...newConfig.excel, ...savedConfig.excel };
            if (savedConfig.excel.data_marker) {
              newConfig.excel.data_marker = { ...newConfig.excel.data_marker, ...savedConfig.excel.data_marker };
            }
            if (savedConfig.excel.fields) {
              newConfig.excel.fields = { ...newConfig.excel.fields, ...savedConfig.excel.fields };
            }
          }
          
          const baseKeys = ['paper', 'dyslexia', 'header', 'footer', 'preamble', 'questions'];
          baseKeys.forEach(k => {
            if (savedConfig[k] !== undefined) {
              newConfig[k] = savedConfig[k];
            }
          });
          
          return newConfig;
        });
        
        if (savedConfig.students) {
          setRuntime(prev => ({ ...prev, is_anonymous: false, selected_student_file: savedConfig.students, config_output_name: selectedConfig }));
        } else {
          setRuntime(prev => ({ ...prev, config_output_name: selectedConfig }));
        }
      } else {
        alert("Configurazione non valida o vuota.");
      }
    } catch (e) {
      alert("Errore caricamento config");
    }
  };

  const handleUploadQuestion = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await generateAPI.uploadQuestion(file);
    loadFiles();
  };

  const handleUploadStudent = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await generateAPI.uploadStudent(file);
    loadFiles();
  };

  const handleStart = async () => {
    const safeName = (config.exam.name || "Esame_Generato").replace(/[<>:"/\|?*]/g, '').trim() || "Esame_Generato";
    let currentPrefix = runtime.output_prefix;
    let cleanWorkingDir = false;

    if (availableFiles.working_dirs && availableFiles.working_dirs.includes(safeName)) {
      const userChoice = await prompt(
        `La cartella di lavoro "${safeName}" esiste già.
Puoi decidere di svuotare la cartella esistente e popolarla con i nuovi file, aggiungere i nuovi file alla cartella esistente oppure cambiare nome dell'esame e creare così una nuova cartella`,
        "",
        [
          { label: "Svuota cartella", value: "overwrite", className: "bg-red-600 text-white hover:bg-red-700" },
          { label: "Aggiungi file alla cartella", value: "append", className: "bg-green-600 text-white hover:bg-green-700" },
          { label: "Annulla (Cambia nome)", value: "cancel", className: "bg-gray-300 text-gray-800 hover:bg-gray-400" }
        ],
        true
      );

      if (!userChoice || userChoice.action === "cancel") {
        return; // Stop generation
      }

      if (userChoice.action === "overwrite") {
        cleanWorkingDir = true;
      } else if (userChoice.action === "append") {
        const jsonsInDir = availableFiles.jsons_by_dir?.[safeName] || [];
        while (jsonsInDir.includes(`${currentPrefix}.json`)) {
          const prefixChoice = await prompt(
            `Il prefisso "${currentPrefix}" esiste già nella cartella.
Inserisci un nuovo prefisso per i file:`,
            currentPrefix
          );
          if (prefixChoice === null) return;
          currentPrefix = prefixChoice;
        }
      }
    }

    if (currentPrefix !== runtime.output_prefix) {
      setRuntime(prev => ({ ...prev, output_prefix: currentPrefix }));
    }

    setError(null);
    setProgress(null);

    
    const getPayloadConfig = () => {
      // Create a deep copy to avoid mutating React state
      const payloadConfig = JSON.parse(JSON.stringify(config));
      
      payloadConfig.header = translateToLatex(payloadConfig.header);
      payloadConfig.preamble = translateToLatex(payloadConfig.preamble);
      payloadConfig.footer = translateToLatex(payloadConfig.footer);

      if (!payloadConfig.exam.max_questions) delete payloadConfig.exam.max_questions;
      if (!payloadConfig.exam.max_open_questions) delete payloadConfig.exam.max_open_questions;
      if (!payloadConfig.exam.page_limits) delete payloadConfig.exam.page_limits;
      
      const mappedQuestions = payloadConfig.questions.filter(q => q.from && q.draw).map(q => ({
        from: q.from,
        draw: parseInt(q.draw, 10)
      }));
      payloadConfig.questions = mappedQuestions.length > 0 ? mappedQuestions : undefined;
      return payloadConfig;
    };

    const payloadConfig = getPayloadConfig();

    const reqData = {
      config: payloadConfig,
      save_config: runtime.save_config,
      config_output_name: runtime.config_output_name,
      date: runtime.date,
      is_anonymous: runtime.is_anonymous,
      num_anonymous_exams: runtime.is_anonymous ? parseInt(runtime.num_anonymous_exams, 10) : undefined,
      selected_student_file: runtime.is_anonymous ? undefined : runtime.selected_student_file,
      output_prefix: currentPrefix,
      split: runtime.split ? parseInt(runtime.split, 10) : undefined,
      seed: parseInt(runtime.seed, 10),
      folded: runtime.folded,
      rotated: runtime.rotated,
      dyslexia_count: runtime.dyslexia_count ? parseInt(runtime.dyslexia_count, 10) : undefined,
      clean_working_dir: cleanWorkingDir
    };

    try {
      const res = await generateAPI.startGeneration(reqData);
      setTaskId(res.task_id);
      setDataDir(res.data_dir);
      setWorkingDir(res.working_dir);
    } catch (e) {
      let errorMsg = e.message;
      if (e.response?.data?.detail) {
        errorMsg = typeof e.response.data.detail === 'string' 
          ? e.response.data.detail 
          : JSON.stringify(e.response.data.detail);
      }
      setError(errorMsg);
    }
  };

  const handleTestLayout = async () => {
    let currentPrefix = testOutputPrefix;
    while (availableFiles.pdfs && availableFiles.pdfs.includes(`${currentPrefix}.pdf`)) {
      const userChoice = await prompt(`Il file PDF di test "${currentPrefix}.pdf" esiste già.\nInserisci un nuovo nome per creare un nuovo file, oppure lascia questo per sovrascriverlo (Annulla per fermare):`, currentPrefix);
      if (userChoice === null) {
        return;
      }
      if (userChoice === currentPrefix) {
        break;
      }
      currentPrefix = userChoice;
    }
    
    if (currentPrefix !== testOutputPrefix) {
      setTestOutputPrefix(currentPrefix);
    }

    setError(null);
    setIsTestLoading(true);
    setTestPdfUrl(null);

    const payloadConfig = { ...config };
    
    payloadConfig.header = translateToLatex(payloadConfig.header);
    payloadConfig.preamble = translateToLatex(payloadConfig.preamble);
    payloadConfig.footer = translateToLatex(payloadConfig.footer);

    if (!payloadConfig.exam.max_questions) delete payloadConfig.exam.max_questions;
    if (!payloadConfig.exam.max_open_questions) delete payloadConfig.exam.max_open_questions;
    if (!payloadConfig.exam.page_limits) delete payloadConfig.exam.page_limits;
    
    const mappedQuestions = payloadConfig.questions.filter(q => q.from && q.draw).map(q => ({
      from: q.from,
      draw: parseInt(q.draw, 10)
    }));
    payloadConfig.questions = mappedQuestions.length > 0 ? mappedQuestions : undefined;

    try {
      const reqData = {
        config: payloadConfig,
        save_config: false,
        config_output_name: '',
        date: runtime.date,
        is_anonymous: false,
        output_prefix: currentPrefix,
        seed: parseInt(runtime.seed, 10) || 42,
        folded: runtime.folded,
        rotated: runtime.rotated
      };
      const res = await generateAPI.testLayout(reqData);
      setTestPdfUrl(res.pdf_url);
    } catch (e) {
      let errorMsg = e.message;
      if (e.response?.data?.detail) {
        errorMsg = typeof e.response.data.detail === 'string' 
          ? e.response.data.detail 
          : JSON.stringify(e.response.data.detail);
      }
      setError(errorMsg);
    } finally {
      setIsTestLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-blue-200 via-white to-white">
      <PromptModal />
      <BackButton />
      <HomeButton />
      <div className="max-w-5xl mx-auto p-8 font-sans">
        <header className="flex justify-between items-center mb-8 border-b pb-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-full text-blue-700">
              <FilePlus size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Genera esami</h1>
              <p className="text-gray-600 mt-1">Genera esami in base alla configurazione fornita.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <select 
                className="bg-white/80 backdrop-blur px-3 py-2 rounded-lg shadow-sm border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                value={selectedConfig}
                onChange={e => setSelectedConfig(e.target.value)}
                disabled={!availableFiles.working_dirs || availableFiles.working_dirs.length === 0}
              >
                {availableFiles.working_dirs && availableFiles.working_dirs.length > 0 ? (
                  availableFiles.working_dirs.map(c => <option key={c} value={c}>{c}</option>)
                ) : (
                  <option value="">Nessuna configurazione presente</option>
                )}
              </select>
            </div>
            <button 
              onClick={loadConfig} 
              disabled={!selectedConfig}
              className="bg-white/80 backdrop-blur px-4 py-2 rounded-lg shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Precompila configurazione
            </button>
          </div>
        </header>

        {showTestModal && testPdfUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
              <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
                <h3 className="text-xl font-bold text-gray-800">Test del layout - anteprima</h3>
                <button 
                  onClick={() => setShowTestModal(false)}
                  className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full transition-colors"
                >
                  <X size={24} className="text-gray-700" />
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-gray-100 p-6">
                <PDFPreview url={testPdfUrl} title="Layout Test" />
              </div>
            </div>
          </div>
        )}

      <div className="space-y-8">
        
        {/* Exam Settings section */}
        <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all flex flex-col">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2 flex items-center">
            Impostazioni esame
            <HelpButton title="Generazione Esami">
              <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                <p>
                  Per generare degli esami è possibile compilare manualmente tutte le sezioni sottostanti, specificando tutte le impostazione desiderate.
                </p>
                <p>
                  In alternativa, è possibile <strong>precompilare</strong> automaticamente tutti i campi (al di fuori dell'eventuale file Excel con le informazioni degli studenti utilizzato) caricando un file di configurazione precedentemente salvato, utilizzando l'apposito menu a tendina posizionato in alto a destra.
                </p>
              </div>
            </HelpButton>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titolo esame</label>
              <input type="text" className="w-full border p-2 rounded" value={config.exam.name} onChange={e => setConfig({...config, exam: {...config.exam, name: e.target.value}})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lingua</label>
              <select className="w-full border p-2 rounded" value={config.exam.language} onChange={e => setConfig({...config, exam: {...config.exam, language: e.target.value}})}>
                <option value="it">Italiano</option>
                <option value="en">Inglese</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data esame</label>
              <input type="date" className="w-full border p-2 rounded" value={runtime.date} onChange={e => setRuntime({...runtime, date: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prefisso output file</label>
              <input type="text" className="w-full border p-2 rounded" value={runtime.output_prefix} onChange={e => setRuntime({...runtime, output_prefix: e.target.value})} />
            </div>
          </div>
        </section>

        {/* Student Settings section */}
        <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all flex flex-col">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">Impostazioni studenti</h2>
          
          <div className="flex gap-6 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="student_mode" checked={runtime.is_anonymous} onChange={() => setRuntime({...runtime, is_anonymous: true})} className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-gray-700">Generazione anonima</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="student_mode" checked={!runtime.is_anonymous} onChange={() => setRuntime({...runtime, is_anonymous: false})} className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-gray-700">Utilizza file studenti</span>
            </label>
          </div>

          <div className="mt-2">
            {runtime.is_anonymous ? (
              <div className="max-w-md">
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero esami da generare</label>
                <input type="number" min="1" className="w-full border p-2 rounded" value={runtime.num_anonymous_exams} onChange={e => setRuntime({...runtime, num_anonymous_exams: e.target.value})} />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="max-w-md">
                  <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                    Seleziona file excel studenti
                    <HelpButton title="Come preparare il file Excel">
                      <p className="mb-3">Il file Excel deve avere la prima riga dedicata alle <strong>intestazioni delle colonne</strong>.</p>
                      <p className="mb-2">Per funzionare correttamente, il sistema deve poter estrapolare questi tre dati per ogni riga:</p>
                      <ul className="list-disc pl-5 mb-4 space-y-1">
                        <li><code className="bg-gray-100 px-1 rounded text-grey-900">id</code> (la matricola o identificativo)</li>
                        <li><code className="bg-gray-100 px-1 rounded text-grey-900">name</code> (il nome)</li>
                        <li><code className="bg-gray-100 px-1 rounded text-grey-900">surname</code> (il cognome)</li>
                      </ul>
                      <p>Se il tuo file usa parole diverse per le intestazioni (ad esempio "Matricola", "NomeStudente", "CognomeStudente") o presenta colonne aggiuntive basterà specificarlo nella sezione <strong>Mappatura colonne Excel</strong> sottostante</p>
                    </HelpButton>
                  </label>
                  <div className="flex gap-2">
                    <select className="flex-1 border p-2 rounded" value={runtime.selected_student_file} onChange={e => setRuntime({...runtime, selected_student_file: e.target.value})}>
                      <option value="">-- Seleziona --</option>
                      {availableFiles.students.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <label className="bg-gray-100 border p-2 rounded cursor-pointer hover:bg-gray-200 flex items-center justify-center w-10">
                      <Upload size={20} />
                      <input type="file" accept=".xls,.xlsx" className="hidden" onChange={handleUploadStudent} />
                    </label>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Mappatura colonne Excel</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(config.excel.fields).map(([key, value]) => {
                      const isMandatory = ['name', 'surname', 'id'].includes(key);
                      return (
                        <div key={key}>
                          <label className="block text-xs text-gray-600 mb-1 capitalize">Colonna {key === 'id' ? 'Matricola' : key}</label>
                          <div className="flex gap-2">
                            <input type="text" className="flex-1 border p-2 rounded text-sm" value={value} onChange={e => setConfig({...config, excel: {...config.excel, fields: {...config.excel.fields, [key]: e.target.value}}})} />
                            {!isMandatory && (
                              <button className="text-red-500 hover:bg-red-50 px-2 rounded font-bold text-sm" onClick={() => {
                                const newFields = {...config.excel.fields};
                                delete newFields[key];
                                setConfig({...config, excel: {...config.excel, fields: newFields}});
                              }}>X</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button className="text-sm text-blue-600 hover:underline mt-4 inline-block text-left" onClick={() => {
                    const newKey = prompt("Inserisci il nome del nuovo parametro (es. email):");
                    if (newKey && !config.excel.fields[newKey.toLowerCase()]) {
                      setConfig({...config, excel: {...config.excel, fields: {...config.excel.fields, [newKey.toLowerCase()]: newKey}}});
                    }
                  }}>
                    + Aggiungi colonna personalizzata
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Question Settings section */}
        <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all flex flex-col">
          <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h2 className="text-xl font-semibold text-gray-700 flex items-center">
              Impostazioni domande
              <HelpButton title="Sintassi Markdown delle domande">
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-gray-800 mb-2">Il file markdown delle domande può essere creato o modificato attraverso il pulsante <strong>Editor domande</strong> qui a destra, oppure convertito da un file delle domande esportato da Moodle tramite il collegamento <strong>Converti da Moodle</strong>. In alternativa il file markdown pùò essere compilato seguendo le seguenti convenzioni. Esempio pratico:</p>
                    <pre className="bg-slate-800 text-gray-100 p-3 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
{`---
## Quale linguaggio viene eseguito nel browser?

- [ ] Java
- [x] JavaScript
- [ ] Python
- [ ] C`}
                    </pre>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 mb-2">Convenzioni strutturali:</p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><code className="bg-gray-100 px-1 rounded text-pink-600 font-bold">[x]</code> indica la risposta corretta</li>
                      <li><code className="bg-gray-100 px-1 rounded text-pink-600 font-bold">[ ]</code> indica una risposta errata</li>
                      <li><code className="bg-gray-100 px-1 rounded text-pink-600 font-bold">---</code> funge da separatore tra una domanda e l'altra</li>
                      <li><code className="bg-gray-100 px-1 rounded text-pink-600 font-bold">##</code> definisce una domanda chiusa (a scelta multipla)</li>
                      <li><code className="bg-gray-100 px-1 rounded text-pink-600 font-bold">###</code> definisce una domanda aperta</li>
                      <li><code className="bg-gray-100 px-1 rounded text-pink-600 font-bold">\vspace{'{'}-0.3cm{'}'}</code> sceglie di quanto avvicinare le linee per la risposta al testo di una domanda aperta</li>
                      <li><code className="bg-gray-100 px-1 rounded text-pink-600 font-bold">{'{'}lines:2cm{'}'}</code> definisce lo spazio da lasciare per rispondere ad una domanda aperta</li>
                      <li>È possibile avere domande con più risposte corrette</li>
                    </ul>
                  </div>
                </div>
              </HelpButton>
            </h2>
            <div className="flex gap-2">
              <Link to="/questions" className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1 rounded hover:bg-indigo-100 flex items-center gap-1 font-medium transition-colors">
                <FileEdit size={16} /> Editor domande
              </Link>
              <Link to="/moodle" className="text-sm bg-teal-50 text-teal-600 px-3 py-1 rounded hover:bg-teal-100 flex items-center gap-1 font-medium transition-colors">
                <Library size={16} /> Converti da Moodle
              </Link>
              <label className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded cursor-pointer hover:bg-blue-100 flex items-center gap-1 transition-colors">
                <Upload size={16} /> Carica file .md
                <input type="file" accept=".md" className="hidden" onChange={handleUploadQuestion} />
              </label>
            </div>
          </div>
          
          {config.questions.length > 0 && (
            <div className="flex gap-4 mb-2 px-1">
              <label className="flex-1 text-sm font-medium text-gray-700">File delle domande</label>
              <label className="w-48 text-sm font-medium text-gray-700 flex items-center">
                Domande da estrarre
                <HelpButton title="Estrazione delle domande">
                  <p className="mb-3">Il numero di domande indicato si riferisce <strong>sia alle domande a scelta multipla che alle domande aperte</strong>. Questo vuol dire che impostando n domande da estrarre verranno aggiunte all'esame n domande chiuse seguite da n domande aperte.</p>
                  <p className="mb-3">Per limitare il numero di domande chiuse o domande aperte è possibile selezionare le caselle "Numero max domande aperte" e "Numero max domande chiuse" nella sezione delle <strong>impostazioni aggiuntive</strong> sottostante.</p>
                  <div className="bg-blue-50 border border-blue-100 p-3 rounded mt-2">
                    <p className="text-sm text-blue-800">Valutare di tenere le domande chiuse e quelle aperte separate in due file <code>.md</code> distinti.</p>
                  </div>
                </HelpButton>
              </label>
              <div className="w-8"></div>
            </div>
          )}

          {config.questions.map((q, idx) => (
            <div key={idx} className="flex gap-4 mb-2 items-center">
              <select className="flex-1 border p-2 rounded" value={q.from} onChange={e => {
                const newQ = [...config.questions];
                newQ[idx].from = e.target.value;
                setConfig({...config, questions: newQ});
              }}>
                <option value="">-- Seleziona file markdown --</option>
                {availableFiles.questions.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <input type="number" placeholder="Quante estrarne?" className="w-48 border p-2 rounded" value={q.draw || ''} onChange={e => {
                const newQ = [...config.questions];
                newQ[idx].draw = e.target.value;
                setConfig({...config, questions: newQ});
              }} />
              <button className="text-red-500 hover:bg-red-50 p-2 rounded" onClick={() => {
                const newQ = config.questions.filter((_, i) => i !== idx);
                setConfig({...config, questions: newQ});
              }}>X</button>
            </div>
          ))}
          <button className="text-sm text-blue-600 hover:underline mt-2 inline-block text-left" onClick={() => setConfig({...config, questions: [...config.questions, {from: '', draw: 1}]})}>
            + Aggiungi file delle domande
          </button>
        </section>

        {/* Additional settings section */}
        <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all flex flex-col">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">Impostazioni aggiuntive</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center">
              <input type="checkbox" className="mr-2" checked={config.exam.shuffle_questions} onChange={e => setConfig({...config, exam: {...config.exam, shuffle_questions: e.target.checked}})} />
              <label className="text-sm text-gray-600">Mescola domande</label>
            </div>
            <div className="flex items-center">
              <input type="checkbox" className="mr-2" checked={config.exam.shuffle_answers} onChange={e => setConfig({...config, exam: {...config.exam, shuffle_answers: e.target.checked}})} />
              <label className="text-sm text-gray-600">Mescola risposte</label>
            </div>
            <div className="flex items-center">
              <input type="checkbox" className="mr-2" checked={config.exam.separate_open_questions || false} onChange={e => setConfig({...config, exam: {...config.exam, separate_open_questions: e.target.checked}})} />
              <label className="text-sm text-gray-600">Domande chiuse e aperte in pagine differenti</label>
            </div>
            <div className="flex items-center">
              <input type="checkbox" className="mr-2" checked={config.dyslexia} onChange={e => setConfig({...config, dyslexia: e.target.checked})} />
              <label className="text-sm text-gray-600 mr-2">Modalità dislessia</label>
              {config.dyslexia && (
                <input type="number" min="1" placeholder="Quanti esami? (vuoto = tutti)" className="w-48 border p-1 rounded text-sm" value={runtime.dyslexia_count} onChange={e => setRuntime({...runtime, dyslexia_count: e.target.value})} />
              )}
            </div>
            <div className="flex items-center">
              <input type="checkbox" className="mr-2" checked={config.choices?.circled || false} onChange={e => setConfig({...config, choices: {...(config.choices || {}), circled: e.target.checked}})} />
              <label className="text-sm text-gray-600">Cerchia opzioni di risposta</label>
            </div>
            
            <div className="flex items-center gap-2">
              <input type="checkbox" className="mr-2" checked={config.exam.max_questions !== '' && config.exam.max_questions !== undefined} onChange={e => {
                if(e.target.checked) setConfig({...config, exam: {...config.exam, max_questions: 10}});
                else setConfig({...config, exam: {...config.exam, max_questions: ''}});
              }} />
              <label className="text-sm text-gray-600">Numero max domande chiuse</label>
              {(config.exam.max_questions !== '' && config.exam.max_questions !== undefined) && (
                <input type="number" min="1" className="w-20 border p-1 rounded text-sm ml-auto" value={config.exam.max_questions} onChange={e => setConfig({...config, exam: {...config.exam, max_questions: e.target.value}})} />
              )}
            </div>


            <div className="flex items-center gap-2">
              <input type="checkbox" className="mr-2" checked={config.exam.max_open_questions !== '' && config.exam.max_open_questions !== undefined} onChange={e => {
                if(e.target.checked) setConfig({...config, exam: {...config.exam, max_open_questions: 5}});
                else setConfig({...config, exam: {...config.exam, max_open_questions: ''}});
              }} />
              <label className="text-sm text-gray-600">Numero max domande aperte</label>
              {(config.exam.max_open_questions !== '' && config.exam.max_open_questions !== undefined) && (
                <input type="number" min="1" className="w-20 border p-1 rounded text-sm ml-auto" value={config.exam.max_open_questions} onChange={e => setConfig({...config, exam: {...config.exam, max_open_questions: e.target.value}})} />
              )}
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" className="mr-2" checked={config.exam.page_limits !== '' && config.exam.page_limits !== undefined} onChange={e => {
                if(e.target.checked) setConfig({...config, exam: {...config.exam, page_limits: 2}});
                else setConfig({...config, exam: {...config.exam, page_limits: ''}});
              }} />
              <label className="text-sm text-gray-600">Numero max pagine pdf</label>
              {(config.exam.page_limits !== '' && config.exam.page_limits !== undefined) && (
                <input type="number" min="1" className="w-20 border p-1 rounded text-sm ml-auto" value={config.exam.page_limits} onChange={e => setConfig(prev => ({...prev, exam: {...prev.exam, page_limits: e.target.value}}))} />
              )}
            </div>

            <div className="mt-2 md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Formato carta</label>
              <select className="w-full md:w-1/2 border p-2 rounded" value={config.paper} onChange={e => setConfig(prev => ({...prev, paper: e.target.value}))}>
                <option value="A4">A4</option>
                <option value="A3">A3</option>
              </select>
            </div>
            
            <div className="mt-2 md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 flex items-center">
                Livello Correzione QR (ECLevel)
                <HelpButton title="Livello Correzione QR">
                  <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>
                      Il livello scelto determina la <strong>percentuale di tolleranza agli errori</strong> dei QR code generati. Una tolleranza maggiore permette al sistema di leggere correttamente il QR code anche se parzialmente danneggiato, sporco o scansionato male.
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>L:</strong> circa 7% di tolleranza</li>
                      <li><strong>M:</strong> circa 15% di tolleranza</li>
                      <li><strong>Q:</strong> circa 25% di tolleranza</li>
                      <li><strong>H:</strong> circa 30% di tolleranza</li>
                    </ul>
                    <div className="bg-blue-50 border border-blue-100 p-3 rounded">
                      <p className="text-blue-800">
                        <strong>Altamente consigliato: Livello H</strong>
                      </p>
                      <p className="text-blue-700 mt-1">
                        Garantisce la massima affidabilità in fase di lettura. L'unico compromesso è che, contenendo più dati per la correzione, il lato dei QR code stampati sarà lungo <strong>2.8 cm</strong>, a differenza degli altri livelli che producono QR code da <strong>2.5 cm</strong>.
                      </p>
                    </div>
                  </div>
                </HelpButton>
              </label>
              <select className="w-full md:w-1/2 border p-2 rounded" value={config.exam.qr_eclevel || 'H'} onChange={e => setConfig({...config, exam: {...config.exam, qr_eclevel: e.target.value}})}>
                <option value="L">Low (L)</option>
                <option value="M">Medium (M)</option>
                <option value="Q">Quartile (Q)</option>
                <option value="H">High (H)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Structure (Header, Preamble, Footer) */}
        <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all flex flex-col">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2 flex items-center">
            Struttura e layout della pagina
            <HelpButton title="Struttura e Layout">
              <div className="space-y-4 text-sm text-gray-700">
                <p>
                  In questa sezione puoi determinare come appariranno le diverse parti della pagina per tutti gli esami generati:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Header:</strong> La testata dell'esame</li>
                  <li><strong>Preamble:</strong> Le istruzioni iniziali</li>
                  <li><strong>Footer:</strong> Il piè di pagina</li>
                </ul>
                <p>
                  È possibile inserire anche dei comandi che stampano: data dell'esame, nome del candidato (se utilizzato file excel per nominare gli studenti), matricola del candidato (con la stessa condizione), numero della pagina attuale.
                </p>
                <p>
                  Nel caso si volesse scrivere direttamente in <strong>LaTeX</strong>, si è liberi di farlo. L'unica accortezza è quella di andare a capo con <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold">Shift+Invio</kbd> per evitare l'inserimento di <code>\newline</code> indesiderati (che verrebbero generati in automatico premendo solo <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold">Invio</kbd>).
                </p>
                <p>
                  Nella parte di destra verrà visualizzato un'anteprima dell'esame contenente le sezioni aggiunte, utilizzando come template un esempio di esame generato.
                </p>
              </div>
            </HelpButton>
          </h2>
          <p className="text-sm text-gray-500 mb-6">Personalizza la testata, le istruzioni e il piè di pagina visualizzando l'anteprima in tempo reale.</p>
          <HeaderFooterEditor config={config} setConfig={setConfig} />
        </section>

        {/* Layout Test */}
        <section className="group bg-white p-6 rounded-xl shadow-sm border border-gray-300 hover:border-blue-400 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2 text-blue-900">Test del layout</h2>
            <p className="text-blue-700/80 mb-4 text-sm">
              Genera un singolo esame contenente tutte le domande selezionate per verificare rapidamente l'impaginazione e il formato senza generare l'intero set di esami.
            </p>
            <button
              onClick={handleTestLayout}
              disabled={isTestLoading || (config.questions.filter(q => q.draw > 0).length === 0)}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold shadow-sm hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isTestLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Generazione test...
                </>
              ) : (
                'Esegui test layout'
              )}
            </button>
          </div>
          
          {testPdfUrl && (
            <div 
              onClick={() => setShowTestModal(true)}
              className="cursor-pointer group/card shrink-0 w-32 h-40 bg-white border-2 border-dashed border-blue-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-500 hover:bg-blue-50 transition-all shadow-sm relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-blue-600 text-white text-xs px-3 py-1 rounded-full font-medium shadow-sm">Apri test</span>
              </div>
              <FileText className="text-red-500" size={40} />
              <span className="text-xs font-semibold text-gray-500 text-center px-2 break-all">{testOutputPrefix}.pdf</span>
            </div>
          )}
        </section>

        {/* Submit */}
        {(!taskId || (progress && (progress.completed || progress.error)) || error) && (
          <div className="flex items-center justify-between bg-gray-50 p-6 rounded-xl border border-gray-200">
            <div className="flex items-center gap-4">
              <div className="flex items-center">
                <input type="checkbox" className="mr-2 h-5 w-5" checked={runtime.save_config} onChange={e => {
                  setRuntime({...runtime, save_config: e.target.checked, config_output_name: e.target.checked ? (runtime.config_output_name || selectedConfig || `${runtime.output_prefix}_config.yaml`) : ''});
                }} />
                <label className="font-medium text-gray-700">Salva configurazione</label>
              </div>
              {runtime.save_config && (
                <div className="flex items-center">
                  <label className="text-sm text-gray-600 mr-2">Nome file:</label>
                  <input type="text" className="border p-1 rounded text-sm w-48" value={runtime.config_output_name} onChange={e => setRuntime({...runtime, config_output_name: e.target.value})} placeholder="nome_config.yaml" />
                </div>
              )}
            </div>
            <button 
              onClick={handleStart}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors"
            >
              <Play size={20} /> Avvia generazione
            </button>
          </div>
        )}

        {/* Progress Bar, Errors and Preview */}
        {error && <div className="p-4 mt-6 bg-red-100 text-red-700 rounded-lg">{error}</div>}
        
        {taskId && progress && (
          <div className="mt-6 p-6 bg-blue-50 rounded-xl border border-blue-100">
            <h2 className="text-xl font-bold text-blue-800 mb-2">Stato Generazione</h2>
            <div className="w-full bg-blue-200 rounded-full h-4 mb-2">
              <div className="bg-blue-600 h-4 rounded-full transition-all duration-500" style={{ width: `${(progress.progress / progress.total) * 100}%` }}></div>
            </div>
            <p className="text-blue-700">{progress.message} ({progress.progress} / {progress.total})</p>
            {progress.completed && !progress.error && (
              <div className="mt-4">
                <p className="text-green-600 font-bold mb-4"><CheckCircle2 className="inline mr-1" /> Generazione Completata!</p>
                <p className="text-gray-800 mb-4 bg-white p-4 rounded border border-gray-200 shadow-sm">
                  Il file pdf degli esami è stato generato ed è presente nella cartella:<br />
                  <span className="font-mono text-sm text-blue-600 block mb-3">cartella data/ del progetto</span>
                  <div className="text-sm text-orange-600 font-medium flex items-start gap-1.5 bg-orange-50 p-3 rounded border border-orange-100">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>
                      Non spostare il file <strong className="font-mono">{runtime.output_prefix}.json</strong> per poter svolgere in seguito la correzione di questi esami dato che contiene le informazioni sugli esami generati.
                    </span>
                  </div>
                </p>
                
                {/* PDF Preview */}
                <PDFPreview url={`/api/data/${workingDir}/${runtime.output_prefix}.pdf`} />
                
                {/* Return Dashboard */}
                <div className="mt-6 flex justify-center">
                  <button 
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center gap-2 bg-gray-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-gray-900"
                  >
                    <ArrowLeft size={20} /> Torna alla Dashboard
                  </button>
                </div>
              </div>
            )}
            {progress.error && <p className="text-red-600 font-bold mt-2"><AlertCircle className="inline mr-1" /> Errore: {progress.error}</p>}
          </div>
        )}

      </div>
    </div>
    </div>
  );
}
