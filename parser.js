/**
 * Document Parser Module
 * Extracts text from PDF, DOCX, and TXT files
 */

const DocumentParser = {
  async parseDocument(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const meta = { fileName: file.name, fileSize: file.size, fileType: ext };

    let result;
    switch (ext) {
      case 'pdf':
        result = await this.parsePDF(file);
        break;
      case 'docx':
        result = await this.parseDOCX(file);
        break;
      case 'txt':
        result = await this.parseTXT(file);
        break;
      default:
        throw new Error(`Unsupported file type: .${ext}. Please upload a PDF, DOCX, or TXT file.`);
    }

    return { ...meta, ...result };
  },

  async parsePDF(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library not loaded. Please refresh the page.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }

    return {
      text: fullText.trim(),
      pageCount: pdf.numPages,
      wordCount: fullText.trim().split(/\s+/).filter(w => w.length > 0).length
    };
  },

  async parseDOCX(file) {
    if (typeof mammoth === 'undefined') {
      throw new Error('Mammoth.js library not loaded. Please refresh the page.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value.trim();

    return {
      text,
      pageCount: Math.max(1, Math.ceil(text.split('\n\n').length / 40)),
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length
    };
  },

  async parseTXT(file) {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });

    return {
      text: text.trim(),
      pageCount: 1,
      wordCount: text.trim().split(/\s+/).filter(w => w.length > 0).length
    };
  }
};
