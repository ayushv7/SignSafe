/**
 * Analyzer Module — Multi-Provider AI Integration
 * Supports: Groq (free), OpenRouter (free), Gemini, Pollinations (no key)
 */

const ContractAnalyzer = {
  PROVIDERS: {
    groq: {
      name: 'Groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      keyRequired: true,
      signupUrl: 'https://console.groq.com',
      description: 'Fastest inference. Free tier, no credit card needed.'
    },
    openrouter: {
      name: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      keyRequired: true,
      signupUrl: 'https://openrouter.ai/keys',
      description: 'Free models available. No credit card needed.'
    },
    gemini: {
      name: 'Gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      keyRequired: true,
      signupUrl: 'https://aistudio.google.com/apikey',
      description: 'Google Gemini. Free tier available.'
    },
    pollinations: {
      name: 'Pollinations',
      url: 'https://text.pollinations.ai/openai',
      model: 'openai',
      keyRequired: false,
      description: 'No key needed. Can be slow.'
    }
  },

  MAX_CHARS: 60000,

  // In-memory key store for current runtime only
  apiKeys: {},

  getProvider() {
    return localStorage.getItem('ai_provider') || 'groq';
  },

  setProvider(provider) {
    localStorage.setItem('ai_provider', provider);
  },

  getApiKey(provider) {
    const p = provider || this.getProvider();
    return this.apiKeys[p] || '';
  },

  setApiKey(provider, key) {
    this.apiKeys[provider] = key.trim();
  },

  getProviderInfo() {
    return this.PROVIDERS[this.getProvider()] || this.PROVIDERS.groq;
  },

  getSystemPrompt() {
    return `You are an expert legal analyst specializing in contract law, insurance policies, and consumer protection. Analyze the provided document thoroughly.

Return ONLY valid JSON (no markdown, no code fences, no extra text) with this exact structure:
{
  "riskScore": <number 0-100, where 100 is extremely risky>,
  "riskLevel": "<low|medium|high|critical>",
  "documentType": "<type e.g. Employment Contract, Insurance Policy, Lease Agreement, NDA, Terms of Service>",
  "summary": "<2-4 sentence plain-language summary of what this document does and its overall fairness>",
  "clauses": [
    {
      "title": "<short clause name>",
      "originalText": "<relevant excerpt from the document>",
      "severity": "<high|medium|low>",
      "explanation": "<plain-language explanation>",
      "concern": "<why this might be problematic for the signer>"
    }
  ],
  "warnings": [
    {
      "title": "<warning title>",
      "description": "<detailed explanation of the red flag>"
    }
  ],
  "missingClauses": [
    {
      "title": "<name of missing clause>",
      "importance": "<high|medium|low>",
      "description": "<why this clause should be present>"
    }
  ],
  "recommendations": [
    {
      "title": "<recommendation title>",
      "description": "<actionable advice>"
    }
  ],
  "legalTerms": [
    {
      "term": "<legal jargon found>",
      "definition": "<simple explanation>"
    }
  ]
}

Rules:
- Include ALL notable clauses. Mark fair ones as "low" severity.
- Always provide at least 3 clauses, 1 warning, and 2 recommendations.
- Explain everything for someone with no legal background.
- Be thorough but concise.
- Return ONLY the JSON object, nothing else.`;
  },

  truncateText(text) {
    if (text.length <= this.MAX_CHARS) return text;
    return text.substring(0, this.MAX_CHARS) + '\n\n[Document truncated due to length...]';
  },

  async analyze(documentText) {
    const provider = this.getProvider();
    const info = this.PROVIDERS[provider];

    if (info.keyRequired && !this.getApiKey()) {
      throw new Error('API_KEY_MISSING');
    }

    const truncated = this.truncateText(documentText);

    if (provider === 'gemini') {
      return this.analyzeWithGemini(truncated);
    } else {
      return this.analyzeWithOpenAICompat(truncated, provider);
    }
  },

  // --- OpenAI-Compatible (Groq, OpenRouter, Pollinations) ---
  async analyzeWithOpenAICompat(text, providerKey) {
    const info = this.PROVIDERS[providerKey];
    const apiKey = this.getApiKey();

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (providerKey === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'Contract Checker';
    }

    const response = await fetch(info.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: info.model,
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: `Analyze this document:\n\n${text}` }
        ],
        temperature: 0.3,
        max_tokens: 8192
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status === 429) throw new Error('RATE_LIMITED');
      if (response.status === 401) throw new Error('INVALID_KEY');
      throw new Error(`API error (${response.status}): ${err?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI. Please try again.');
    }

    return this.parseResponse(content);
  },

  // --- Gemini API ---
  async analyzeWithGemini(text) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');

    const response = await fetch(`${this.PROVIDERS.gemini.url}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${this.getSystemPrompt()}\n\nDocument to analyze:\n\n${text}` }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status === 429) throw new Error('RATE_LIMITED');
      if (response.status === 400 && err?.error?.message?.includes('API key'))
        throw new Error('INVALID_KEY');
      throw new Error(`API error: ${err?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No response from AI. Please try again.');
    }

    return this.parseResponse(content);
  },

  parseResponse(text) {
    try {
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found');
      return JSON.parse(cleaned.substring(start, end + 1));
    } catch (e) {
      console.error('Parse error:', e, '\nRaw response:', text);
      throw new Error('Failed to parse AI response. Please try again.');
    }
  }
};

// Clean up any keys stored in localStorage from previous runs/versions
try {
  ['api_key_groq', 'api_key_openrouter', 'api_key_gemini', 'gemini_api_key'].forEach(key => {
    localStorage.removeItem(key);
  });
} catch (e) {
  console.error('Failed to clean up localStorage keys:', e);
}
