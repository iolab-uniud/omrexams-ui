import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trash2, CheckSquare, Square, RefreshCcw } from 'lucide-react';
import apiClient, { generateAPI } from '../api/client';
import { useConfirm } from '../hooks/useConfirm';
import BackButton from '../components/BackButton';
import HomeButton from '../components/HomeButton';

export default function Cleanup() {
  const [data, setData] = useState(null);
  const [workingDirs, setWorkingDirs] = useState([]);
  const [selectedWorkingDir, setSelectedWorkingDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState(null);
  const { confirm, ConfirmModal } = useConfirm();

  const categories = [
    { id: 'all', label: 'Tutti i file' },
    { id: 'generated_pdfs', label: 'PDF degli esami generati' },
    { id: 'generated_jsons', label: 'Datafile degli esami generati (JSON)' },
    { id: 'scans', label: 'Esami scansionati' },
    { id: 'sorted', label: 'Esami ordinati' },
    { id: 'corrected', label: 'PDF degli esami corretti (con file JSON supportativi)' },
    { id: 'reports', label: 'File Excel/Markdown (voti e report)' },
    { id: 'config', label: 'File di configurazione YAML' },
    { id: 'students', label: 'File Excel degli studenti' },
    { id: 'questions', label: 'File Markdown delle domande' }
  ];

  const loadDirs = async () => {
    try {
      setLoading(true);
      const status = await generateAPI.getFiles();
      const files = status.working_dirs || [];
      setWorkingDirs(files);
      if (files.length > 0) {
        setSelectedWorkingDir(files[0]);
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const fetchData = async (workingDir) => {
    try {
      setLoading(true);
      let url = '/api/cleanup/files';
      if (workingDir) {
        url += `?working_dir=${encodeURIComponent(workingDir)}`;
      }
      const res = await apiClient.get(url);
      setData(res.data);
      setSelectedFiles(new Set());
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Errore nel caricamento dei file.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirs();
  }, []);

  useEffect(() => {
    if (selectedWorkingDir) {
      fetchData(selectedWorkingDir);
    }
  }, [selectedWorkingDir]);

  const getFilesToShow = () => {
    if (!data) return [];
    if (category === 'all') {
      let all = [];
      Object.values(data).forEach(files => {
        all = all.concat(files);
      });
      // remove duplicates in case
      return [...new Set(all)];
    }
    return data[category] || [];
  };

  const filesToShow = getFilesToShow();

  const handleSelectAll = () => {
    if (selectedFiles.size === filesToShow.length) {
      // Deselect all
      setSelectedFiles(new Set());
    } else {
      // Select all in current view
      setSelectedFiles(new Set(filesToShow));
    }
  };

  const handleSelectFile = (file) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(file)) {
      newSelected.delete(file);
    } else {
      newSelected.add(file);
    }
    setSelectedFiles(newSelected);
  };

  const handleDelete = async () => {
    if (selectedFiles.size === 0) return;
    
    const isConfirmed = await confirm(`Sei sicuro di voler eliminare ${selectedFiles.size} file selezionati?`);
    if (!isConfirmed) return;

    setDeleting(true);
    try {
      const payload = { files: Array.from(selectedFiles) };
      const res = await apiClient.delete('/api/cleanup/files', { data: payload });
      setMessage({ type: 'success', text: `Eliminati ${res.data.deleted.length} file con successo.` });
      fetchData(selectedWorkingDir); // Reload the list
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Errore durante l\'eliminazione dei file.' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-red-200 via-white to-white">
      <ConfirmModal />
      <BackButton />
      <HomeButton />
      <div className="max-w-6xl mx-auto p-6 space-y-8 pb-20">

      <header className="flex items-center gap-4 border-b pb-4 mb-8">
        <div className="bg-red-100 p-3 rounded-full text-red-700">
          <Trash2 size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Gestione dati</h1>
          <p className="text-gray-600 mt-1">Seleziona ed elimina i file non più necessari generati dal sistema.</p>
        </div>
      </header>

      {message && (
        <div className={`p-4 rounded-md mb-6 ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      {workingDirs.length > 0 ? (
        <div className="mb-6 bg-white p-4 rounded-xl border shadow-sm">
          <label className="block text-sm font-bold text-gray-700 mb-2">Seleziona Cartella di lavoro:</label>
          <select
            value={selectedWorkingDir}
            onChange={(e) => setSelectedWorkingDir(e.target.value)}
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 p-2 border"
          >
            {workingDirs.map((dir, idx) => (
              <option key={idx} value={dir}>{dir}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mb-6 p-4 bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200">
          Nessuna cartella di lavoro trovata. Genera un esame prima di gestire i dati.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:border-red-400 hover:shadow-md overflow-hidden flex flex-col md:flex-row h-[600px]">
        
        {/* Sidebar categories */}
        <div className="w-full md:w-1/3 border-r border-gray-200 bg-gray-50">
          <div className="p-4 border-b border-gray-200 font-semibold text-gray-700">
            Categorie
          </div>
          <ul className="flex flex-col">
            {categories.map(c => (
              <li key={c.id}>
                <button
                  onClick={() => { setCategory(c.id); setSelectedFiles(new Set()); }}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${category === c.id ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-500 font-medium' : 'text-gray-600 hover:bg-gray-100 border-l-4 border-transparent'}`}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* File list */}
        <div className="w-full md:w-2/3 flex flex-col">
          {category === 'generated_jsons' && (
            <div className="bg-yellow-50 text-yellow-800 p-3 text-sm border-b border-yellow-200">
              Nel caso ci si accorga che il datafile JSON appena cancellato serva ancora, si può ripristinare alla seguente <Link to="/backup" className="font-semibold underline hover:text-yellow-900">pagina</Link>.
            </div>
          )}
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white">
            <h2 className="font-semibold text-gray-700">
              {categories.find(c => c.id === category)?.label} ({filesToShow.length} file)
            </h2>
            <div className="flex space-x-2">
              <button 
                onClick={() => fetchData(selectedWorkingDir)} 
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                title="Aggiorna lista"
              >
                <RefreshCcw size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto bg-gray-50/50">
            {loading ? (
              <div className="flex justify-center items-center h-full text-gray-400">
                Caricamento in corso...
              </div>
            ) : filesToShow.length === 0 ? (
              <div className="flex justify-center items-center h-full text-gray-400">
                Nessun file trovato in questa categoria.
              </div>
            ) : (
              <ul className="space-y-2">
                {filesToShow.map((file, idx) => (
                  <li key={idx} className="flex items-center p-3 bg-white border border-gray-200 rounded-md shadow-sm hover:border-blue-300 transition-colors">
                    <button 
                      onClick={() => handleSelectFile(file)}
                      className="mr-3 text-gray-400 hover:text-blue-500 focus:outline-none"
                    >
                      {selectedFiles.has(file) ? <CheckSquare className="text-blue-500" size={20} /> : <Square size={20} />}
                    </button>
                    <span className="text-sm text-gray-700 break-all">{file.split('/').pop()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer actions */}
          <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center">
            <div className="flex items-center">
              <button 
                onClick={handleSelectAll}
                disabled={filesToShow.length === 0}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 font-medium"
              >
                {selectedFiles.size === filesToShow.length && filesToShow.length > 0 ? 'Deseleziona tutti' : 'Seleziona tutti'}
              </button>
              <span className="ml-4 text-sm text-gray-500">
                {selectedFiles.size} file selezionati
              </span>
            </div>
            
            <button
              onClick={handleDelete}
              disabled={selectedFiles.size === 0 || deleting}
              className="px-4 py-2 bg-red-600 text-white rounded shadow hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed flex items-center "
            >
              {deleting ? 'Eliminazione...' : 'Cancella'}
            </button>
          </div>
        </div>

      </div>
    </div>
    </div>
  );
}
