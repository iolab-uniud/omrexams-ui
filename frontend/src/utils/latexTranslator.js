// Helper function to translate HTML (Quill) to LaTeX
export const translateToLatex = (text) => {
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
    
    latex = latex.replace(/\n/g, ' ');
    latex = latex.replace(/( \\newline )+$/g, '');
  } else {
    latex = latex.replace(/\n/g, ' \\newline ');
  }
  
  return latex.trim();
};

// Reverse function to decode LaTeX saved in YAML files and restore it to the Quill HTML editor
export const latexToHtml = (latex) => {
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
