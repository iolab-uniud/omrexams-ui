import axios from 'axios';

// Create a centralized basic axios instance
const apiClient = axios.create({
  baseURL: '', // Edit with environment variables if necessary
  headers: {
    'Content-Type': 'application/json',
  },
});

// Collection of APIs grouped by functionality
export const dashboardAPI = {
  getStatus: async () => {
    const response = await apiClient.get('/api/dashboard/status');
    return response.data;
  },
  previewExcel: async (filename, folder, headerRows = 1, indexCols = 0, centerHeaders = false) => {
    let url = `/api/dashboard/preview_excel?filename=${filename}&headerRows=${headerRows}&indexCols=${indexCols}&centerHeaders=${centerHeaders}`;
    if (folder) url += `&folder=${encodeURIComponent(folder)}`;
    const response = await apiClient.get(url);
    return response.data;
  }
};

export const generateAPI = {
  getConfig: async (folder) => {
    const response = await apiClient.get(`/api/generate/config?folder=${folder}`);
    return response.data;
  },
  getFiles: async () => {
    const response = await apiClient.get('/api/generate/files');
    return response.data;
  },
  uploadQuestion: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/generate/upload/question', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  uploadStudent: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/generate/upload/student', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  saveQuestions: async (requestData) => {
    const response = await apiClient.post('/api/generate/questions/save', requestData);
    return response.data;
  },
  readQuestions: async (filename) => {
    const response = await apiClient.get(`/api/generate/questions/read?filename=${encodeURIComponent(filename)}`);
    return response.data;
  },
  updateCorrected: async (requestData) => {
    const response = await apiClient.post('/api/generate/questions/update-corrected', requestData);
    return response.data;
  },
  startGeneration: async (requestData) => {
    const response = await apiClient.post('/api/generate/start', requestData);
    return response.data;
  },
  testLayout: async (requestData) => {
    const response = await apiClient.post('/api/generate/test-layout', requestData);
    return response.data;
  }
};
export const sortAPI = {
  getStatus: async (folder) => {
    let url = '/api/sort/status';
    if (folder) url += `?folder=${encodeURIComponent(folder)}`;
    const response = await apiClient.get(url);
    return response.data;
  },
  uploadScan: async (file, folder) => {
    const formData = new FormData();
    formData.append('file', file);
    let url = '/api/sort/upload';
    if (folder) url += `?folder=${encodeURIComponent(folder)}`;
    const response = await apiClient.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  startSort: async (requestData) => {
    const response = await apiClient.post('/api/sort/start', requestData);
    return response.data;
  }
};
export const correctAPI = {
  getStatus: async (folder) => {
    let url = '/api/correct/status';
    if (folder) url += `?folder=${encodeURIComponent(folder)}`;
    const response = await apiClient.get(url);
    return response.data;
  },
  startCorrection: async (requestData) => {
    const response = await apiClient.post('/api/correct/start', requestData);
    return response.data;
  }
};

export const manualAPI = {
  getScans: async (working_dir) => {
    let url = '/api/manual/scans';
    if (working_dir) url += `?working_dir=${encodeURIComponent(working_dir)}`;
    const response = await apiClient.get(url);
    return response.data;
  },
  getCorrected: async (working_dir) => {
    let url = '/api/manual/corrected';
    if (working_dir) url += `?working_dir=${encodeURIComponent(working_dir)}`;
    const response = await apiClient.get(url);
    return response.data;
  },
  getCorrectedMapping: async (working_dir, pdfName) => {
    const response = await apiClient.get(`/api/manual/corrected_mapping?working_dir=${encodeURIComponent(working_dir)}&pdf_name=${encodeURIComponent(pdfName)}`);
    return response.data;
  },
  getMissing: async (working_dir) => {
    const response = await apiClient.get(`/api/manual/missing?working_dir=${encodeURIComponent(working_dir)}`);
    return response.data;
  },
  getStudentData: async (working_dir, studentId) => {
    const response = await apiClient.get(`/api/manual/student_data?working_dir=${encodeURIComponent(working_dir)}&student_id=${studentId}`);
    return response.data;
  },
  forceAnswer: async (requestData) => {
    const response = await apiClient.post('/api/manual/force_answer', requestData);
    return response.data;
  },
  forceAnswers: async (requestData) => {
    const response = await apiClient.post('/api/manual/force_answers', requestData);
    return response.data;
  }
};

export const markAPI = {
  getQuestionsList: async (working_dir) => {
    const response = await apiClient.get(`/api/mark/questions_list?working_dir=${encodeURIComponent(working_dir)}`);
    return response.data;
  },
  calculateMark: async (requestData) => {
    const response = await apiClient.post('/api/mark/calculate', requestData);
    return response.data;
  },
  generateReport: async (requestData) => {
    const response = await apiClient.post('/api/mark/report', requestData);
    return response.data;
  },
  reviewQuestion: async (working_dir, questionFile, questionIndex, exportFormat, outputFilename) => {
    let url = `/api/mark/review_question?working_dir=${encodeURIComponent(working_dir)}&question_file=${questionFile}&question=${questionIndex}`;
    if (exportFormat && outputFilename) {
      url += `&export_format=${exportFormat}&output_filename=${outputFilename}`;
    }
    const response = await apiClient.get(url);
    return response.data;
  },
  studentsWithQuestion: async (working_dir, questionFile, questionIndex, exportFormat, outputFilename) => {
    let url = `/api/mark/students_with_question?working_dir=${encodeURIComponent(working_dir)}&question_file=${questionFile}&question=${questionIndex}`;
    if (exportFormat && outputFilename) {
      url += `&export_format=${exportFormat}&output_filename=${outputFilename}`;
    }
    const response = await apiClient.get(url);
    return response.data;
  }
};

export const moodleAPI = {
  getQuestionsFiles: async () => {
    const response = await apiClient.get('/api/moodle/questions');
    return response.data;
  },
  getXmlFiles: async () => {
    const response = await apiClient.get('/api/moodle/xml_files');
    return response.data;
  },
  exportToMoodle: async (requestData) => {
    const response = await apiClient.post('/api/moodle/export', requestData);
    return response.data;
  },
  importFromMoodle: async (requestData) => {
    const response = await apiClient.post('/api/moodle/import', requestData);
    return response.data;
  },
  uploadXml: async (formData) => {
    const response = await apiClient.post('/api/moodle/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }
};

export const backupAPI = {
  getBackups: async () => {
    const response = await apiClient.get('/api/backup/list');
    return response.data;
  },
  restoreBackup: async (filename) => {
    const response = await apiClient.post(`/api/backup/restore/${filename}`);
    return response.data;
  }
};

export default apiClient;
