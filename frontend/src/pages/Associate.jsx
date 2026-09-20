import React, { useState, useEffect } from 'react';
import apiClient, { correctAPI, generateAPI } from '../api/client';
import * as XLSX from 'xlsx';
import { Save, Upload, AlertCircle, CheckCircle, RefreshCw, Search, Server, ScanText, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import BackButton from '../components/BackButton';
import HomeButton from '../components/HomeButton';
import HelpButton from '../components/HelpButton';

const AutocompleteInput = ({ excelData, onSelect, disabled }) => {
  const [query, setQuery] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const wrapperRef = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);
  
  const filteredData = query === ''
    ? excelData
    : excelData.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        String(item.matricola).includes(query)
      );

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xs">
      <input
        type="text"
        className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2 border disabled:bg-gray-100 disabled:text-gray-400"
        placeholder={disabled ? "Carica file Excel prima..." : "Cerca per nome o matricola..."}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        disabled={disabled}
      />
      {isOpen && !disabled && filteredData.length > 0 && (
        <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-60 overflow-auto">
          {filteredData.map((item, i) => (
            <li
              key={i}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
              onClick={() => {
                onSelect(item);
                setQuery(`${item.name} (${item.matricola})`);
                setIsOpen(false);
              }}
            >
              <div className="font-medium text-gray-800">{item.name}</div>
              <div className="text-xs text-gray-500">Matricola: {item.matricola}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default function Associate() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [excelData, setExcelData] = useState([]); // List of {name, serial number} from Excel
  const [serverFiles, setServerFiles] = useState([]);
  const [examSearchId, setExamSearchId] = useState('');
  const [fetchingServerExcel, setFetchingServerExcel] = useState(false);
  const [hasSortedFiles, setHasSortedFiles] = useState(null);
  const [workingDirs, setWorkingDirs] = useState([]);
  const [selectedWorkingDir, setSelectedWorkingDir] = useState('');

  useEffect(() => {
    loadStatus();
    fetchServerFiles();
  }, []);

  const loadStatus = async () => {
    try {
      const status = await generateAPI.getFiles();
      const files = status.working_dirs || [];
      setWorkingDirs(files);
      if (files.length > 0) {
        setSelectedWorkingDir(files[0]);
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error("Errore nel caricamento dei Cartella di lavoro", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWorkingDir) {
      fetchExams(selectedWorkingDir);
      checkSortedFiles(selectedWorkingDir);
    }
  }, [selectedWorkingDir]);

  const checkSortedFiles = async (working_dir) => {
    try {
      const res = await apiClient.get(`/api/associate/check_sorted?working_dir=${working_dir}`);
      setHasSortedFiles(res.data.has_sorted_files);
    } catch (err) {
      console.error("Errore nel controllo dei file ordinati", err);
      // Fallbacks
      setHasSortedFiles(true);
    }
  };

  const fetchServerFiles = async () => {
    try {
      const res = await apiClient.get('/api/associate/students_files');
      if (res.data && res.data.files) {
        setServerFiles(res.data.files);
      }
    } catch (err) {
      console.error("Errore nel caricamento dei file dal server", err);
    }
  };

  const fetchExams = async (working_dir) => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/api/associate/exams?working_dir=${working_dir}`);
      // Initialize state with fetched exams, mapping current student_id and fullname to editable fields
      const formattedExams = res.data.exams.map(ex => ({
        original_id: ex.student_id,
        new_student_id: ex.student_id,
        new_fullname: ex.fullname,
        image: ex.image
      })).sort((a, b) => parseInt(a.original_id) - parseInt(b.original_id));
      setExams(formattedExams);
      setError('');
    } catch (err) {
      console.error(err);
      setError(`Errore: ${err.message}. ${err.response?.data?.detail || ''}`);
    } finally {
      setLoading(false);
    }
  };

  const processExcelData = (data) => {
    let extracted = [];
    if (data.length > 0) {
      data.forEach((row, index) => {
        if (!row || typeof row !== 'object') return;
        
        const keys = Object.keys(row);
        
        let matricolaKey = keys.find(k => {
          const klow = k.toLowerCase();
          return klow.includes('matricola') || klow === 'id' || klow.includes('number');
        });
        let nomeKey = keys.find(k => {
          const klow = k.toLowerCase().trim();
          return klow === 'nome' || klow === 'name' || klow === 'first name' || klow === 'nome studente';
        });
        let cognomeKey = keys.find(k => {
          const klow = k.toLowerCase().trim();
          return klow === 'cognome' || klow === 'surname' || klow === 'last name';
        });
        
        if (!nomeKey) {
            nomeKey = keys.find(k => k.toLowerCase().includes('nome') || k.toLowerCase().includes('name'));
        }
        if (!cognomeKey) {
            cognomeKey = keys.find(k => k.toLowerCase().includes('cognome') || k.toLowerCase().includes('surname'));
        }

        let matricola = matricolaKey ? String(row[matricolaKey]).trim() : '';
        let nome = nomeKey ? String(row[nomeKey]).trim() : '';
        let cognome = cognomeKey ? String(row[cognomeKey]).trim() : '';
        
        let fullName = [nome, cognome].filter(Boolean).join(' ');
        
        if (!matricola) {
           for(let key of keys) {
              const val = String(row[key] || '').trim();
              if (/^\d+$/.test(val) && val.length > 3) {
                 matricola = val;
                 break;
              }
           }
        }

        if (fullName || matricola) {
          extracted.push({
            name: fullName || 'Sconosciuto',
            matricola: matricola || `GEN-${index}`
          });
        }
      });
    }
    
    if (extracted.length > 0) {
      setExcelData(extracted);
      setSuccessMessage(`Caricati ${extracted.length} studenti dal file Excel. Ora puoi selezionarli dai menu a tendina.`);
      setTimeout(() => setSuccessMessage(''), 5000);
    } else {
      setError('Nessun dato valido trovato nel file Excel.');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        processExcelData(data);
      } catch (error) {
        setError('Errore durante la lettura del file Excel.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleServerFileSelect = async (e) => {
    const filename = e.target.value;
    if (!filename) return;
    
    setFetchingServerExcel(true);
    setError('');
    try {
      const response = await fetch(`/api/data/students/${filename}`);
      if (!response.ok) throw new Error("File not found");
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const jsonData = XLSX.utils.sheet_to_json(ws);
      processExcelData(jsonData);
    } catch (err) {
      console.error(err);
      setError(`Errore durante il caricamento del file dal server: ${err.message}`);
    } finally {
      setFetchingServerExcel(false);
      e.target.value = "";
    }
  };

  const handleFieldChange = (original_id, field, value) => {
    const newExams = exams.map(e => 
      e.original_id === original_id ? { ...e, [field]: value } : e
    );
    setExams(newExams);
  };

  const handleDropdownSelect = (original_id, excelItem) => {
    const newExams = exams.map(e => 
      e.original_id === original_id ? { ...e, new_student_id: excelItem.matricola, new_fullname: excelItem.name } : e
    );
    setExams(newExams);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const payload = {
        working_dir: selectedWorkingDir,
        associations: exams.map(e => ({
          original_id: e.original_id,
          new_student_id: e.new_student_id,
          new_fullname: e.new_fullname
        }))
      };
      const res = await apiClient.post('/api/associate/update', payload);
      setSuccessMessage(`Salvataggio completato! ${res.data.updated_count} esami aggiornati.`);
      
      // Update original IDs to match new ones after save
      setExams(exams.map(e => ({
        ...e,
        original_id: e.new_student_id
      })));
      
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore durante il salvataggio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-purple-200 via-white to-white font-sans">
      <BackButton />
      <HomeButton />
      <div className="max-w-7xl mx-auto p-6 space-y-8 pb-20">
        <header className="flex items-center gap-4 border-b pb-4 mb-8">
          <div className="bg-purple-100 p-3 rounded-full text-purple-700">
            <ScanText size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Associa studenti</h1>
            <p className="text-gray-600 mt-1">
              Associa i compiti anonimi agli studenti. Modifica manualmente i campi o carica un file Excel contenente i dati degli studenti da associare.
            </p>
          </div>
        </header>

        {hasSortedFiles === false ? (
          <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-200 text-center flex flex-col items-center">
            <div className="bg-yellow-50 text-yellow-600 p-4 rounded-full mb-6">
              <AlertCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Nessun esame smistato trovato</h2>
            <p className="text-lg text-gray-600 max-w-2xl mb-8 leading-relaxed">
              Prima di associare gli studenti agli esami svolgere lo smistamento degli esami stessi, ovvero la Fase 1 della seguente pagina.
            </p>
            <Link 
              to="/correct" 
              className="inline-flex items-center gap-2 bg-emerald-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
            >
              Vai alla pagina di Smistamento
              <ArrowRight size={20} />
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8 flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <HelpButton title="Associazione Studenti">
            <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
              <p>
                Nella sezione sottostante sono presenti tutte le scansioni degli esami svolte, con di fianco la possibilità di associare ad ogni esame un preciso studente con il rispettivo numero di matricola.
              </p>
              <p>
                Tale informazione è inseribile manualmente oppure, caricando un file Excel con le informazioni degli studenti da associare tramite i pulsanti qui a lato, è possibile svolgere una ricerca dello studente dalla sezione dedicata, per una corrispondenza immediata.
              </p>
            </div>
          </HelpButton>
          
          {workingDirs.length > 0 && (
            <div className="flex items-center gap-2 mr-2">
              <span className="text-sm font-bold text-gray-700">Seleziona Cartella di lavoro:</span>
              <select 
                value={selectedWorkingDir} 
                onChange={(e) => setSelectedWorkingDir(e.target.value)} 
                className="border border-gray-300 p-2 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white cursor-pointer"
              >
                {workingDirs.map(df => <option key={df} value={df}>{df}</option>)}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer bg-blue-50 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors">
            <Upload size={20} />
            <span className="font-semibold">Carica Excel</span>
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
          </label>
          
          {serverFiles.length > 0 && (
            <div className="flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-lg shadow-sm border border-purple-100">
              <Server size={20} />
              <select 
                className="bg-transparent border-none focus:ring-0 font-semibold cursor-pointer text-purple-700 pr-6"
                onChange={handleServerFileSelect}
                disabled={fetchingServerExcel}
                defaultValue=""
              >
                <option value="" disabled>{fetchingServerExcel ? "Caricamento..." : "Scegli file Excel già presente"}</option>
                {serverFiles.map((f, i) => <option key={i} value={f}>{f}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle size={24} />
          <p>{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg flex items-center gap-3">
          <CheckCircle size={24} />
          <p>{successMessage}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <RefreshCw size={48} className="animate-spin mx-auto mb-4 opacity-50" />
          <p className="text-lg">Caricamento esami in corso...</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 shadow-sm text-gray-500">
          <p className="text-lg">Nessun esame trovato. Assicurati di aver generato e smistato gli esami.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:border-purple-400 hover:shadow-md overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4 bg-gray-50">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Search size={20} className="text-gray-400" />
              <input 
                type="text"
                placeholder="Cerca per ID Esame..."
                className="flex-1 max-w-xs border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                value={examSearchId}
                onChange={(e) => setExamSearchId(e.target.value)}
              />
            </div>
            
            <button 
              onClick={handleSave}
              disabled={saving || exams.length === 0}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap"
            >
              <Save size={20} />
              <span className="font-semibold">{saving ? 'Salvataggio...' : 'Salva Associazioni'}</span>
            </button>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Esame scansionato</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compila dati</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seleziona da Excel</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {exams.filter(e => e.original_id.toString().includes(examSearchId)).map((exam) => (
                <tr key={exam.original_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {exam.image ? (
                      <a href={exam.image} target="_blank" rel="noreferrer" className="block w-80 xl:w-96 h-32 border rounded-md overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group bg-white">
                        <img 
                          src={exam.image} 
                          alt={`Esame ${exam.original_id}`} 
                          className="w-full h-full object-cover bg-white scale-[1.7]" 
                          style={{ objectPosition: 'center top', transformOrigin: '35% 8%' }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 z-10">
                          <span className="text-white font-medium bg-black/60 px-3 py-1.5 rounded-md text-sm shadow-sm backdrop-blur-sm">
                            Apri per intero
                          </span>
                        </div>
                      </a>
                    ) : (
                      <span className="text-gray-400 italic">Immagine non trovata</span>
                    )}
                    <p className="mt-2 text-sm text-gray-500">ID attuale: {exam.original_id}</p>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="space-y-4 max-w-xs">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
                        <input
                          type="text"
                          value={exam.new_fullname}
                          onChange={(e) => handleFieldChange(exam.original_id, 'new_fullname', e.target.value)}
                          className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2 border"
                          placeholder="es. Mario Rossi"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Matricola</label>
                        <input
                          type="text"
                          value={exam.new_student_id}
                          onChange={(e) => handleFieldChange(exam.original_id, 'new_student_id', e.target.value)}
                          className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 px-3 py-2 border"
                          placeholder="es. 123456"
                        />
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 align-top">
                    <AutocompleteInput 
                      excelData={excelData} 
                      disabled={excelData.length === 0} 
                      onSelect={(selectedItem) => handleDropdownSelect(exam.original_id, selectedItem)} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
          </>
        )}
    </div>
  </div>
  );
}
