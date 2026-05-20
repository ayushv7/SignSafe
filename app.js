/**
 * Contract Checker — Main Application Controller
 */

const App = {
  currentFile: null,
  parsedDoc: null,
  analysisResult: null,

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.updateProviderBadge();

    // Test automation: auto-load sample contract via ?test=true
    if (window.location.search.includes('test=true')) {
      fetch('/sample-contract.txt')
        .then(res => res.text())
        .then(text => {
          const file = new File([text], 'sample-contract.txt', { type: 'text/plain' });
          this.handleFile(file);
        })
        .catch(err => console.error('Test load failed:', err));
    }

    // Show settings if no API key configured for key-required providers
    const info = ContractAnalyzer.getProviderInfo();
    if (info.keyRequired && !ContractAnalyzer.getApiKey()) {
      setTimeout(() => this.openModal(), 600);
    }
  },

  cacheDOM() {
    this.els = {
      uploadZone: document.getElementById('upload-zone'),
      fileInput: document.getElementById('file-input'),
      fileInfo: document.getElementById('file-info'),
      fileName: document.getElementById('fi-name'),
      fileMeta: document.getElementById('fi-meta'),
      btnAnalyze: document.getElementById('btn-analyze'),
      btnRemove: document.getElementById('btn-remove'),
      loading: document.getElementById('loading-overlay'),
      loadingSteps: document.querySelectorAll('#loading-overlay .loading-steps li'),
      results: document.getElementById('results'),
      uploadSection: document.getElementById('upload-section'),
      btnSettings: document.getElementById('btn-settings'),
      modal: document.getElementById('settings-modal'),
      apiKeyInput: document.getElementById('api-key-input'),
      providerSelect: document.getElementById('provider-select'),
      btnModalSave: document.getElementById('btn-modal-save'),
      btnModalCancel: document.getElementById('btn-modal-cancel'),
      btnExport: document.getElementById('btn-export'),
      btnNew: document.getElementById('btn-new'),
      toast: document.getElementById('toast'),
      providerDesc: document.getElementById('provider-desc'),
      signupLink: document.getElementById('signup-link'),
      keyGroup: document.getElementById('key-group'),
    };
  },

  bindEvents() {
    const uz = this.els.uploadZone;
    uz.addEventListener('click', () => this.els.fileInput.click());
    uz.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('drag-over'); });
    uz.addEventListener('dragleave', () => uz.classList.remove('drag-over'));
    uz.addEventListener('drop', e => {
      e.preventDefault(); uz.classList.remove('drag-over');
      if (e.dataTransfer.files.length) this.handleFile(e.dataTransfer.files[0]);
    });
    this.els.fileInput.addEventListener('change', e => {
      if (e.target.files.length) this.handleFile(e.target.files[0]);
    });
    this.els.btnAnalyze.addEventListener('click', () => this.runAnalysis());
    this.els.btnRemove.addEventListener('click', () => this.removeFile());
    this.els.btnSettings.addEventListener('click', () => this.openModal());
    this.els.btnModalCancel.addEventListener('click', () => this.closeModal());
    this.els.btnModalSave.addEventListener('click', () => this.saveSettings());
    this.els.modal.addEventListener('click', e => { if (e.target === this.els.modal) this.closeModal(); });
    this.els.btnExport.addEventListener('click', () => this.exportReport());
    this.els.btnNew.addEventListener('click', () => this.resetAll());

    if (this.els.providerSelect) {
      this.els.providerSelect.addEventListener('change', () => this.onProviderChange());
    }
  },

  updateProviderBadge() {
    const badge = document.getElementById('provider-badge');
    if (badge) {
      const info = ContractAnalyzer.getProviderInfo();
      const provider = ContractAnalyzer.getProvider();
      const icons = { groq: '⚡', openrouter: '🔀', gemini: '✨', pollinations: '🌐' };
      badge.textContent = `${icons[provider] || '🤖'} ${info.name}`;
      badge.className = 'provider-badge ' + provider;
    }
  },

  onProviderChange() {
    const provider = this.els.providerSelect.value;
    const info = ContractAnalyzer.PROVIDERS[provider];
    if (this.els.providerDesc) {
      this.els.providerDesc.textContent = info.description;
    }
    if (this.els.signupLink) {
      if (info.signupUrl) {
        this.els.signupLink.href = info.signupUrl;
        this.els.signupLink.style.display = 'inline';
      } else {
        this.els.signupLink.style.display = 'none';
      }
    }
    if (this.els.keyGroup) {
      this.els.keyGroup.style.display = info.keyRequired ? 'block' : 'none';
    }
    // Load saved key for this provider
    const savedKey = ContractAnalyzer.getApiKey(provider);
    this.els.apiKeyInput.value = savedKey;
  },

  handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = ['pdf', 'docx', 'txt'];
    if (!allowed.includes(ext)) {
      return this.showToast('Unsupported file type. Please upload PDF, DOCX, or TXT.');
    }
    if (file.size > 10 * 1024 * 1024) {
      return this.showToast('File too large. Maximum size is 10MB.');
    }
    this.currentFile = file;
    this.els.fileName.textContent = file.name;
    this.els.fileMeta.textContent = `${this.formatSize(file.size)} · ${ext.toUpperCase()}`;
    this.els.fileInfo.classList.add('visible');
    this.els.btnAnalyze.disabled = false;
  },

  removeFile() {
    this.currentFile = null;
    this.parsedDoc = null;
    this.els.fileInfo.classList.remove('visible');
    this.els.fileInput.value = '';
    this.els.btnAnalyze.disabled = true;
  },

  async runAnalysis() {
    if (!this.currentFile) return;

    const info = ContractAnalyzer.getProviderInfo();
    if (info.keyRequired && !ContractAnalyzer.getApiKey()) {
      this.openModal();
      return this.showToast(`Please enter your ${info.name} API key first.`);
    }

    this.showLoading();
    try {
      // Step 1: Parse
      this.setLoadingStep(0);
      this.parsedDoc = await DocumentParser.parseDocument(this.currentFile);

      if (this.parsedDoc.wordCount < 20) {
        throw new Error('Document has too few words to analyze. Please upload a more substantial document.');
      }

      // Step 2: Analyze
      this.setLoadingStep(1);
      this.analysisResult = await ContractAnalyzer.analyze(this.parsedDoc.text);

      // Step 3: Render
      this.setLoadingStep(2);
      await this.sleep(400);
      this.renderResults();

      this.hideLoading();
      this.els.uploadSection.style.display = 'none';
      this.els.results.classList.add('visible');
    } catch (err) {
      this.hideLoading();
      console.error('Analysis error:', err);
      if (err.message === 'API_KEY_MISSING') {
        this.openModal();
        this.showToast(`Please enter your ${info.name} API key.`);
      } else if (err.message === 'RATE_LIMITED') {
        this.showToast('Rate limited. Please wait a moment and try again.');
      } else if (err.message === 'INVALID_KEY') {
        this.openModal();
        this.showToast('Invalid API key. Please check and re-enter.');
      } else {
        this.showToast(err.message || 'An error occurred during analysis.');
      }
    }
  },

  renderResults() {
    const r = this.analysisResult;
    // Risk Score
    const score = Math.min(100, Math.max(0, r.riskScore || 0));
    const circumference = 2 * Math.PI * 70;
    const offset = circumference - (score / 100) * circumference;
    const fillEl = document.getElementById('score-fill');
    const numEl = document.getElementById('score-number');
    const badgeEl = document.getElementById('risk-badge');
    const docTypeEl = document.getElementById('doc-type');

    let color = 'var(--risk-low)';
    let level = r.riskLevel || 'low';
    if (score >= 70) { color = 'var(--risk-high)'; level = level || 'high'; }
    else if (score >= 40) { color = 'var(--risk-medium)'; level = level || 'medium'; }

    fillEl.style.stroke = color;
    setTimeout(() => { fillEl.style.strokeDashoffset = offset; }, 100);
    this.animateNumber(numEl, 0, score, 1200);
    badgeEl.textContent = level.toUpperCase();
    badgeEl.className = 'risk-badge ' + level;
    docTypeEl.textContent = r.documentType || 'Document';

    // Summary
    document.getElementById('summary-text').textContent = r.summary || 'No summary available.';
    document.getElementById('meta-pages').textContent = this.parsedDoc.pageCount;
    document.getElementById('meta-words').textContent = this.parsedDoc.wordCount.toLocaleString();
    document.getElementById('meta-clauses').textContent = (r.clauses || []).length;

    // Clauses
    const clauseContainer = document.getElementById('clauses-list');
    const clauseCount = document.getElementById('clauses-count');
    clauseContainer.innerHTML = '';
    const clauses = r.clauses || [];
    clauseCount.textContent = clauses.length;
    clauses.forEach((c, i) => {
      const div = document.createElement('div');
      div.className = `clause-item severity-${c.severity} fade-in`;
      div.style.animationDelay = `${i * 0.08}s`;
      div.innerHTML = `
        <div class="clause-header" onclick="App.toggleClause(this)">
          <h4>${this.esc(c.title)}</h4>
          <span class="severity-tag ${c.severity}">${c.severity}</span>
          <span class="clause-toggle">▼</span>
        </div>
        <div class="clause-body">
          ${c.originalText ? `<blockquote>${this.esc(c.originalText)}</blockquote>` : ''}
          <p class="explanation">${this.esc(c.explanation)}</p>
          ${c.concern ? `<p class="concern">${this.esc(c.concern)}</p>` : ''}
        </div>`;
      clauseContainer.appendChild(div);
    });

    // Warnings
    const warnContainer = document.getElementById('warnings-list');
    const warnSection = document.getElementById('warnings-section');
    warnContainer.innerHTML = '';
    const warnings = r.warnings || [];
    if (warnings.length) {
      warnSection.style.display = 'block';
      document.getElementById('warnings-count').textContent = warnings.length;
      warnings.forEach(w => {
        const div = document.createElement('div');
        div.className = 'warning-item fade-in';
        div.innerHTML = `<span class="w-icon">🚨</span><div><h4>${this.esc(w.title)}</h4><p>${this.esc(w.description)}</p></div>`;
        warnContainer.appendChild(div);
      });
    } else { warnSection.style.display = 'none'; }

    // Missing Clauses
    const missContainer = document.getElementById('missing-list');
    const missSection = document.getElementById('missing-section');
    missContainer.innerHTML = '';
    const missing = r.missingClauses || [];
    if (missing.length) {
      missSection.style.display = 'block';
      document.getElementById('missing-count').textContent = missing.length;
      missing.forEach(m => {
        const div = document.createElement('div');
        div.className = 'missing-item fade-in';
        div.innerHTML = `<span class="m-icon">📋</span><div><h4>${this.esc(m.title)} <span class="importance" style="color:var(--risk-${m.importance === 'high' ? 'high' : m.importance === 'medium' ? 'medium' : 'low'})">${m.importance}</span></h4><p>${this.esc(m.description)}</p></div>`;
        missContainer.appendChild(div);
      });
    } else { missSection.style.display = 'none'; }

    // Recommendations
    const recContainer = document.getElementById('recommendations-list');
    recContainer.innerHTML = '';
    const recs = r.recommendations || [];
    document.getElementById('recommendations-count').textContent = recs.length;
    recs.forEach(rec => {
      const div = document.createElement('div');
      div.className = 'rec-item fade-in';
      div.innerHTML = `<span class="r-icon">💡</span><div><h4>${this.esc(rec.title)}</h4><p>${this.esc(rec.description)}</p></div>`;
      recContainer.appendChild(div);
    });

    // Legal Terms
    const termsContainer = document.getElementById('terms-list');
    const termsSection = document.getElementById('terms-section');
    termsContainer.innerHTML = '';
    const terms = r.legalTerms || [];
    if (terms.length) {
      termsSection.style.display = 'block';
      document.getElementById('terms-count').textContent = terms.length;
      terms.forEach(t => {
        const div = document.createElement('div');
        div.className = 'term-item fade-in';
        div.innerHTML = `<div class="term-word">${this.esc(t.term)}</div><div class="term-def">${this.esc(t.definition)}</div>`;
        termsContainer.appendChild(div);
      });
    } else { termsSection.style.display = 'none'; }
  },

  toggleClause(headerEl) {
    headerEl.parentElement.classList.toggle('open');
  },

  // --- Modal ---
  openModal() {
    const provider = ContractAnalyzer.getProvider();
    this.els.providerSelect.value = provider;
    this.els.apiKeyInput.value = ContractAnalyzer.getApiKey();
    this.onProviderChange();
    this.els.modal.classList.add('visible');
  },
  closeModal() { this.els.modal.classList.remove('visible'); },
  saveSettings() {
    const provider = this.els.providerSelect.value;
    const key = this.els.apiKeyInput.value.trim();
    const info = ContractAnalyzer.PROVIDERS[provider];

    if (info.keyRequired && !key) {
      return this.showToast(`${info.name} requires an API key.`);
    }

    ContractAnalyzer.setProvider(provider);
    ContractAnalyzer.setApiKey(provider, key);
    this.updateProviderBadge();
    this.closeModal();
    this.showToast(`Using ${info.name} for analysis.`);
  },

  // --- Export ---
  exportReport() {
    if (!this.analysisResult) return;
    const r = this.analysisResult;
    let text = `CONTRACT ANALYSIS REPORT\n${'='.repeat(50)}\n`;
    text += `File: ${this.parsedDoc.fileName}\n`;
    text += `Type: ${r.documentType}\nRisk Score: ${r.riskScore}/100 (${r.riskLevel})\n\n`;
    text += `SUMMARY\n${'-'.repeat(30)}\n${r.summary}\n\n`;
    if (r.warnings?.length) {
      text += `RED FLAGS\n${'-'.repeat(30)}\n`;
      r.warnings.forEach(w => { text += `⚠ ${w.title}: ${w.description}\n`; });
      text += '\n';
    }
    if (r.clauses?.length) {
      text += `CLAUSE ANALYSIS\n${'-'.repeat(30)}\n`;
      r.clauses.forEach(c => { text += `[${c.severity.toUpperCase()}] ${c.title}\n  ${c.explanation}\n  ${c.concern ? 'Concern: ' + c.concern : ''}\n\n`; });
    }
    if (r.missingClauses?.length) {
      text += `MISSING CLAUSES\n${'-'.repeat(30)}\n`;
      r.missingClauses.forEach(m => { text += `• ${m.title} (${m.importance}): ${m.description}\n`; });
      text += '\n';
    }
    if (r.recommendations?.length) {
      text += `RECOMMENDATIONS\n${'-'.repeat(30)}\n`;
      r.recommendations.forEach(rec => { text += `✓ ${rec.title}: ${rec.description}\n`; });
    }
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contract-analysis-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  resetAll() {
    this.removeFile();
    this.analysisResult = null;
    this.parsedDoc = null;
    this.els.results.classList.remove('visible');
    this.els.uploadSection.style.display = '';
  },

  // --- Helpers ---
  showLoading() { this.els.loading.classList.add('visible'); this.els.loadingSteps.forEach(l => l.classList.remove('active', 'done')); },
  hideLoading() { this.els.loading.classList.remove('visible'); },
  setLoadingStep(idx) {
    this.els.loadingSteps.forEach((l, i) => {
      l.classList.remove('active');
      if (i < idx) l.classList.add('done');
      if (i === idx) l.classList.add('active');
    });
  },
  showToast(msg) {
    const t = this.els.toast;
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('visible'), 4000);
  },
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  },
  animateNumber(el, from, to, duration) {
    const start = performance.now();
    const step = ts => {
      const progress = Math.min((ts - start) / duration, 1);
      el.textContent = Math.round(from + (to - from) * this.easeOut(progress));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  easeOut(t) { return 1 - Math.pow(1 - t, 3); },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
