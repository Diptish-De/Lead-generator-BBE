import React, { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

function App() {
  const [activeTab, setActiveTab] = useState('scraper'); // 'scraper', 'analytics', 'database', 'outreach'
  const [isScraping, setIsScraping] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Advanced Scraper Settings
  const [searchLimit, setSearchLimit] = useState(20);
  const [concurrency, setConcurrency] = useState(3);
  const [strictMode, setStrictMode] = useState(false);
  const [autoExport, setAutoExport] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [sessionLeadUrls, setSessionLeadUrls] = useState(new Set());
  const [dbSelectedLeads, setDbSelectedLeads] = useState([]);
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [addLeadTab, setAddLeadTab] = useState('manual');
  const [newLeadForm, setNewLeadForm] = useState({ 'Company Name': '', Email: '', Website: '', Phone: '', Country: '', City: '', 'Business Type': '', Notes: '' });
  const [importFile, setImportFile] = useState(null);
  const [isAddingLead, setIsAddingLead] = useState(false);
  
  // Scraper State
  const [topics, setTopics] = useState({
    'Handicraft Importers': true,
    'Home Decor Wholesale Buyers': true,
    'Furniture Importers': false,
    'Fair Trade Distributors': false,
    'B2B Trade Portal Leads': false,
    'Ethnic Decor Importers': false,
  });
  
  const [regions, setRegions] = useState({
    'USA': true,
    'UK': true,
    'Europe': false,
    'Australia': false,
    'Canada': false,
    'Middle East': false,
  });

  const [customQueries, setCustomQueries] = useState('');
  const [logs, setLogs] = useState([]);
  const logEndRef = useRef(null);

  // Database State
  const [dbLeads, setDbLeads] = useState([]);
  const [isLoadingDB, setIsLoadingDB] = useState(false);
  const [sortConfig, setSortConfig] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [dbView, setDbView] = useState('active'); // 'active' or 'trash'
  const [exportingToSheets, setExportingToSheets] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [chanceFilter, setChanceFilter] = useState('All');
  const [styleFilter, setStyleFilter] = useState('All');
  const [countryFilter, setCountryFilter] = useState('All');
  
  // Outreach Center State
  const [outreachSelectedLeads, setOutreachSelectedLeads] = useState([]);
  const [catalogUrl, setCatalogUrl] = useState(localStorage.getItem('bbe_catalog_url') || '');
  const [activeTemplateId, setActiveTemplateId] = useState(0);
  const [isSendingDrafts, setIsSendingDrafts] = useState(false);
  const [isEmailSettingsOpen, setIsEmailSettingsOpen] = useState(false);
  const [outreachBatchStatus, setOutreachBatchStatus] = useState(null);
  const [currentBatchId, setCurrentBatchId] = useState(null);
  
  // Email Configuration
  const [emailConfig, setEmailConfig] = useState(() => {
    const saved = localStorage.getItem('bbe_email_config');
    return saved ? JSON.parse(saved) : { email: '', password: '', name: 'BlueBloodExports' };
  });

  // Attachments & Signature
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [signatureFile, setSignatureFile] = useState(null);

  const [userTemplates, setUserTemplates] = useState(() => {
    const saved = localStorage.getItem('bbe_templates');
    const b2bProfessional = {
      name: 'B2B Professional Outreach',
      subject: 'B2B Collaboration Inquiry — BlueBloodExports',
      body: 'Dear [Name],\n\nI hope you are doing well.\n\nWe are BlueBloodExports, an India-based export company specializing in handcrafted furniture, home décor, and traditional handicrafts for international importers, wholesalers, retailers, and sourcing partners.\n\nOur product range includes:\n• Handcrafted wooden furniture\n• Dhokra metal crafts\n• Terracotta décor\n• Handwoven textiles & rugs\n• Traditional Indian handicrafts & lifestyle products\n\nWe focus on premium craftsmanship, competitive FOB/CIF pricing, reliable delivery, and customization based on buyer requirements.\n\nPlease find our product catalogue attached for your reference.\n\nYou can also learn more about us at:\nhttps://www.bluebloodexports.com/\n\nIf you are interested, we would be happy to discuss pricing, product details, or potential business opportunities.\n\nYou can contact us through:\n• hello@bluebloodexports.com\n• +91 78120 28686\n• Or simply reply to this email\n\nLooking forward to hearing from you.\n\nBest regards,\nBlueBloodExports'
    };

    if (saved) {
      const parsed = JSON.parse(saved);
      // Seed the new professional template if it doesn't exist in their saved list
      if (!parsed.some(t => t.name === 'B2B Professional Outreach')) {
        return [...parsed, b2bProfessional];
      }
      return parsed;
    }

    return [
      { 
        name: 'Standard Outreach', 
        subject: 'Handcrafted Indian Decor for [Company]', 
        body: 'Hi [Name],\n\nI came across [Company] and was impressed by your collection of [Style] products.\n\nWe are BlueBloodExports — an Indian export company specializing in artisan-made handicrafts, home decor, and furniture. We supply wholesale to importers and distributors worldwide.\n\nOur product range includes:\n• Dhokra metal craft\n• Terracotta décor\n• Hand-carved wooden furniture\n• Handwoven textiles & rugs\n\nWould you be open to receiving our wholesale catalogue? We offer competitive FOB/CIF pricing and can customize as per your requirements.\n\nLooking forward to hearing from you.\n\nBest regards,\nBlueBloodExports' 
      },
      b2bProfessional
    ];
  });

  // Persist Outreach Data
  useEffect(() => {
    localStorage.setItem('bbe_templates', JSON.stringify(userTemplates));
  }, [userTemplates]);

  useEffect(() => {
    localStorage.setItem('bbe_email_config', JSON.stringify(emailConfig));
  }, [emailConfig]);

  useEffect(() => {
    localStorage.setItem('bbe_catalog_url', catalogUrl);
  }, [catalogUrl]);

  const showNotification = (msg, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  // Outreach Helpers
  const parseVariables = (text, lead) => {
    if (!text) return '';
    const companyName = lead['Company Name'] || 'your store';
    const fallbackName = lead['Company Name'] && lead['Company Name'] !== '-' ? `the ${lead['Company Name']} team` : 'Team';

    return text
      .replace(/\[Name\]/g, lead['Decision Maker'] || fallbackName)
      .replace(/\[Company\]/g, companyName)
      .replace(/\[Style\]/g, (lead['Product Style'] || 'artisan').toLowerCase())
      .replace(/\[City\]/g, lead['City'] && lead['City'] !== '-' ? lead['City'] : 'your area');
  };

  const addNewTemplate = () => {
    const newTpl = { name: 'New Template', subject: 'New Subject', body: 'Hi [Name],\n\n' };
    setUserTemplates([...userTemplates, newTpl]);
    setActiveTemplateId(userTemplates.length);
  };

  const updateTemplate = (key, value) => {
    const updated = [...userTemplates];
    updated[activeTemplateId][key] = value;
    setUserTemplates(updated);
  };

  const deleteTemplate = (index) => {
    if (userTemplates.length <= 1) return;
    const updated = userTemplates.filter((_, i) => i !== index);
    setUserTemplates(updated);
    if (activeTemplateId >= updated.length) setActiveTemplateId(0);
  };

  const toggleLeadSelection = (index) => {
    setOutreachSelectedLeads(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const selectAllNewLeads = () => {
    const newLeadIndices = dbLeads
      .map((l, i) => ({ ...l, i }))
      .filter(l => l.Status === 'New' || !l.Status)
      .map(l => l.i);
    setOutreachSelectedLeads(newLeadIndices);
  };

  const handleIndividualSend = async (index) => {
    const lead = dbLeads[index];
    const template = userTemplates[activeTemplateId];
    
    let subject = parseVariables(template.subject, lead);
    let body = parseVariables(template.body, lead);
    
    if (catalogUrl) {
      body += `\n\nOur Catalog: ${catalogUrl}`;
    }
    
    body += `\n\nBest regards,\nBlueBloodExports`;

    const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.Email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailLink, '_blank');

    // Auto-mark as contacted
    await updateStatus(index, 'Contacted');
  };

  const pollOutreachStatus = (batchId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:4000/api/outreach/status/${batchId}`);
        const data = await res.json();
        setOutreachBatchStatus(data);
        if (data.isComplete) {
          clearInterval(interval);
          setIsSendingDrafts(false);
          showNotification(`🏁 Outreach batch ${batchId} complete!`, 'success');
        }
      } catch (err) {
        console.error('Polling failed:', err);
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleSendToApproval = async () => {
    if (outreachSelectedLeads.length === 0) {
      showNotification('Please select at least one lead.', 'error');
      return;
    }
    
    if (!emailConfig.email || !emailConfig.password) {
      showNotification('Please configure your Email and App Password in Settings.', 'error');
      setIsEmailSettingsOpen(true);
      return;
    }

    if (!window.confirm(`Send ${outreachSelectedLeads.length} outreach emails now?`)) return;

    setIsSendingDrafts(true);
    setOutreachBatchStatus({ current: 0, total: outreachSelectedLeads.length, sent: 0, failed: 0, errors: [], isComplete: false });
    
    try {
      const formData = new FormData();
      
      const drafts = outreachSelectedLeads.map(index => {
        const lead = dbLeads[index];
        const template = userTemplates[activeTemplateId];
        let body = parseVariables(template.body, lead);
        if (catalogUrl) body += `\n\nOur Catalog: ${catalogUrl}`;
        
        return {
          to: lead.Email,
          company: lead['Company Name'] || '-',
          subject: parseVariables(template.subject, lead),
          body: body
        };
      });

      formData.append('drafts', JSON.stringify(drafts));
      formData.append('config', JSON.stringify(emailConfig));
      
      // Add attachments
      attachmentFiles.forEach(file => {
        formData.append('files', file);
      });
      
      // Add signature if exists
      if (signatureFile) {
        formData.append('signature', signatureFile);
      }

      const response = await fetch('http://localhost:4000/api/drafts/create', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success) {
        setCurrentBatchId(data.batchId);
        pollOutreachStatus(data.batchId);
        
        // Auto-mark as contacted
        const idsToUpdate = outreachSelectedLeads.map(idx => dbLeads[idx]?.id).filter(Boolean);
        await fetch('http://localhost:4000/api/leads/bulk-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: idsToUpdate, updates: { Status: 'Contacted', 'Last Contacted': new Date().toISOString() } })
        });
        
        fetchLeads();
        // Keep selection until user clears it or batch starts
      } else {
        showNotification(`Error: ${data.error || 'Failed to start outreach'}`, 'error');
        setIsSendingDrafts(false);
      }
    } catch (err) {
      console.error('Outreach flow failed:', err);
      showNotification('Network error. Is backend running?', 'error');
      setIsSendingDrafts(false);
    }
  };

  // Poll Scraper Logs
  useEffect(() => {
    let interval;
    if (isScraping) {
      interval = setInterval(fetchLogs, 1000);
    }
    return () => clearInterval(interval);
  }, [isScraping]);

  useEffect(() => {
    if (activeTab === 'scraper') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const toggleDbLeadSelection = (id) => {
    setDbSelectedLeads(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllFilteredDbLeads = () => {
    setDbSelectedLeads(sortedLeads.map(l => l.id));
  };

  const clearDbSelectedLeads = () => {
    setDbSelectedLeads([]);
  };

  // Memoized filter calculation for the database view

  const sortedLeads = React.useMemo(() => {
    let filtered = dbLeads.map((l, originalIndex) => ({ ...l, originalIndex }));

    filtered = filtered.filter(l => dbView === 'trash' ? l.Status === 'Trashed' : l.Status !== 'Trashed');

    if (filterText.trim()) {
      const lower = filterText.toLowerCase();
      filtered = filtered.filter(l =>
        (l['Company Name'] || '').toLowerCase().includes(lower) ||
        (l['Email'] || '').toLowerCase().includes(lower) ||
        (l['Website'] || '').toLowerCase().includes(lower) ||
        (l['Notes'] || '').toLowerCase().includes(lower) ||
        (l['Product Style'] || '').toLowerCase().includes(lower) ||
        (l['City'] || '').toLowerCase().includes(lower)
      );
    }

    if (statusFilter !== 'All') {
      filtered = filtered.filter(l => (l.Status || 'New') === statusFilter);
    }

    if (chanceFilter !== 'All') {
      filtered = filtered.filter(l => l.Chance === chanceFilter);
    }

    if (styleFilter !== 'All') {
      filtered = filtered.filter(l => (l['Product Style'] || '').includes(styleFilter));
    }

    if (countryFilter !== 'All') {
      filtered = filtered.filter(l => (l.Country || 'Unknown') === countryFilter);
    }

    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        let aVal = a[sortConfig.key] || '';
        let bVal = b[sortConfig.key] || '';
        if (sortConfig.key === 'Lead Score') {
          aVal = parseInt(aVal, 10) || 0;
          bVal = parseInt(bVal, 10) || 0;
        }
        if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [dbLeads, sortConfig, filterText, dbView, statusFilter, chanceFilter, styleFilter, countryFilter]);
  useEffect(() => {
    if (activeTab === 'database') {
      fetchLeads();
    }
  }, [activeTab]);

  const fetchLogs = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/logs');
      const data = await res.json();
      setLogs(data.logs);
      if (data.logs.some(l => l.includes('JOB FINISHED'))) {
        setIsScraping(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAISuggest = async () => {
    const activeTopics = Object.keys(topics).filter(k => topics[k]);
    if (activeTopics.length === 0 && !customQueries.trim()) return;

    setIsSuggesting(true);
    try {
      const response = await fetch('http://localhost:4000/api/suggest-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topics: activeTopics,
          custom: customQueries 
        }),
      });
      const data = await response.json();
      if (data.suggestions) {
        setCustomQueries(prev => {
          const combined = [...prev.split('\n'), ...data.suggestions].filter(Boolean);
          const unique = Array.from(new Set(combined));
          return unique.join('\n');
        });
      }
    } catch (err) {
      console.error('AI Suggest failed:', err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleStop = async () => {
    try {
      await fetch('http://localhost:4000/api/stop', { method: 'POST' });
      setIsScraping(false);
      setLogs(prev => [...prev, `🛑 Stop signal sent. Closing browsers...`]);
    } catch (err) {
      console.error('Stop failed:', err);
    }
  };

  const handleStart = async () => {
    let finalQueries = [];
    
    const activeTopics = Object.keys(topics).filter(k => topics[k]);
    const activeRegions = Object.keys(regions).filter(k => regions[k]);
    
    // Multiply topics globally
    activeTopics.forEach(t => {
      activeRegions.forEach(r => {
        finalQueries.push(`${t} ${r}`);
      });
    });

    const custom = customQueries.split('\n').map(q => q.trim()).filter(Boolean);
    finalQueries = [...finalQueries, ...custom];

    if (finalQueries.length === 0) return;

    setIsScraping(true);
    setLogs([]);

    try {
      const response = await fetch('http://localhost:4000/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          queries: finalQueries,
          options: {
            searchLimit,
            concurrency,
            strictMode,
            autoExport
          }
        }),
      });
      showNotification('🚀 Extraction job initiated successfully!');
    } catch (err) {
      setLogs(prev => [...prev, `❌ Network Error. Is backend running?`]);
      setIsScraping(false);
    }
  };

  const fetchLeads = async () => {
    setIsLoadingDB(true);
    try {
      const res = await fetch('http://localhost:4000/api/leads');
      const data = await res.json();
      setDbLeads(data.leads || []);
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
    setIsLoadingDB(false);
  };

  const updateStatus = async (leadId, newStatus) => {
    try {
      const res = await fetch(`http://localhost:4000/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Status: newStatus })
      });
      const data = await res.json();
      if (data.success) setDbLeads(data.leads);
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const moveToTrash = async (leadId) => {
    try {
      const res = await fetch(`http://localhost:4000/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Status: 'Trashed' })
      });
      const data = await res.json();
      if (data.success) {
        setDbLeads(data.leads);
        showNotification('Lead moved to trash');
      }
    } catch (err) {
      console.error('Failed to trash lead', err);
    }
  };

  const restoreLead = async (leadId) => {
    try {
      const res = await fetch(`http://localhost:4000/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Status: '' })
      });
      const data = await res.json();
      if (data.success) setDbLeads(data.leads);
    } catch (err) {
      console.error('Failed to restore lead', err);
    }
  };

  const permanentDelete = async (leadId) => {
    if (!window.confirm("Permanently delete this lead? This cannot be undone.")) return;
    try {
      const res = await fetch(`http://localhost:4000/api/leads/${leadId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) setDbLeads(data.leads);
    } catch (err) {
      console.error('Failed to permanently delete lead', err);
    }
  };

  const handleCheckReplies = async () => {
    setIsCheckingReplies(true);
    try {
      const res = await fetch('http://localhost:4000/api/replies');
      const data = await res.json();
      if (data.success) {
        if (data.updatedLeads && data.updatedLeads.length > 0) {
          showNotification(`🚀 Found ${data.updatedLeads.length} new replies!`, 'success');
          fetchLeads();
        } else {
          showNotification('No new replies found.', 'info');
        }
      }
    } catch (err) {
      showNotification('Reply check failed. Is backend running?', 'error');
    } finally {
      setIsCheckingReplies(false);
    }
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsLoadingDB(true);
    try {
      const res = await fetch('http://localhost:4000/api/leads/import', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setDbLeads(data.leads);
        showNotification(`🚀 Imported ${data.count} leads successfully!`, 'success');
      } else {
        showNotification(data.error || 'Import failed', 'error');
      }
    } catch (err) {
      console.error('Import failed', err);
      showNotification('Server error during import', 'error');
    } finally {
      setIsLoadingDB(false);
      e.target.value = ''; // Reset input
    }
  };

  const copyData = (text) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
  };

  const generateEmailTemplate = (lead, type = 'Initial') => {
    if (!lead.Email) return '#';
    const company = lead['Company Name'] && lead['Company Name'] !== '-' ? lead['Company Name'] : 'your store';
    const name = lead['Decision Maker'] || (company !== 'your store' ? `the ${company} team` : 'Team');
    const productStyle = (lead['Product Style'] || 'artisan').toLowerCase();
    const city = lead['City'] && lead['City'] !== '-' ? ` in ${lead['City']}` : '';

    let subject = '';
    let body = '';

    if (type === 'Initial') {
      const subjects = [
        `Curating ${productStyle} pieces for ${company}?`,
        `Question about ${company}'s ${productStyle} collection`,
        `New artisan-made Indian ${productStyle} decor for ${company}${city}`,
        `Love the ${productStyle} vibe at ${company} - Indian handicrafts`,
        `Ethically sourced ${productStyle} decor for ${company}`,
        `Quick question about ${company}'s ${productStyle} pieces`
      ];
      subject = subjects[Math.floor(Math.random() * subjects.length)];
      body = `Hi ${name},\n\nI was browsing ${company}${city} and loved your focus on ${productStyle} items. It's a really unique and well-curated collection.\n\nI'm reaching out from BlueBloodExports — we specialize in supplying high-end, artisan-made Indian handicrafts and home decor that perfectly fits your aesthetic. We focus on ethical, small-batch production that resonates with boutique retailers.\n\nAre you open to seeing our latest lookbook for the upcoming season? No strings attached, just thought our pieces might be a great fit for your shelves.\n\nBest regards,\nBlueBloodExports`;
    } else if (type === 'Followup1') {
      subject = `Re: Question about ${company}'s ${productStyle} collection`;
      body = `Hi ${name},\n\nI'm sure you're incredibly busy, so I'll be brief. I sent a note a few days ago about my artisan handicraft supply for ${company} and wanted to make sure it didn't get buried.\n\nIf you're interested in seeing our wholesale catalog, I'd love to send it over. If not, no worries at all!\n\nBest,\nBlueBloodExports`;
    } else if (type === 'Followup2') {
      subject = `Quick resource for ${company}`;
      body = `Hi ${name},\n\nOne last quick note — I'm sharing a link below to our most recent testimonial from a boutique owner in the ${lead.Country || 'same region'} who recently added our ${productStyle} line to their collection.\n\nWe love what you're doing at ${company} and would love to be part of your store's journey. Let me know if you'd like to chat briefly next week?\n\nBest,\nBlueBloodExports`;
    }

    return `mailto:${lead.Email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleDMPitch = (e, lead) => {
    e.stopPropagation();
    const name = lead['Decision Maker'] || 'there';
    const dmText = `Hi ${name}! Loving your feed. We supply artisan handcrafted decor from India that fits your aesthetic perfectly. Open to seeing a quick catalog?`;
    copyData(dmText);
    window.open(lead.Instagram, '_blank');
  };

  const handleLinkedInSearch = (e, lead) => {
    e.stopPropagation();
    const company = lead['Company Name'] || '';
    const query = `site:linkedin.com/in ("Owner" OR "Founder" OR "CEO" OR "Principal Designer" OR "Director" OR "Partner") "${company}"`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
  };

  const exportCurrentViewToSheets = async () => {
    setExportingToSheets(true);
    try {
      const res = await fetch('http://localhost:4000/api/export-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: sortedLeads })
      });
      const data = await res.json();
      if (data.success) alert("Successfully exported current view to Google Sheets!");
      else alert("Export failed: " + data.message);
    } catch (err) {
      alert("Error exporting: " + err.message);
    }
    setExportingToSheets(false);
  };

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };


  const uniqueCountries = React.useMemo(() => {
    const countries = new Set(dbLeads.map(l => l.Country || 'Unknown').filter(Boolean));
    return ['All', ...Array.from(countries).sort()];
  }, [dbLeads]);

  const uniqueStyles = React.useMemo(() => {
    const styles = new Set();
    dbLeads.forEach(l => {
      if (l['Product Style']) {
        l['Product Style']?.split(',').forEach(s => styles.add(s.trim()));
      }
    });
    return ['All', ...Array.from(styles).sort()];
  }, [dbLeads]);

  const activeTopics = Object.keys(topics).filter(k => topics[k]);
  const activeRegions = Object.keys(regions).filter(k => regions[k]);
  const totalQueries = (activeTopics.length * activeRegions.length) + (customQueries.trim() ? customQueries.split('\n').filter(Boolean).length : 0);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#f8fafc] text-slate-800 font-sans">
      
      {/* NOTIFICATIONS */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-2">
        {notifications.map(n => (
          <div key={n.id} className={`px-5 py-3 rounded-xl shadow-2xl border-l-4 flex items-center gap-3 animate-slide-in text-xs font-bold ring-1 ring-slate-900/5 ${
            n.type === 'success' ? 'bg-white text-emerald-700 border-emerald-500' : 'bg-red-50 text-red-700 border-red-500'
          }`}>
            <span>{n.type === 'success' ? '✅' : '❌'}</span>
            {n.msg}
          </div>
        ))}
      </div>
      
      {/* GLOBAL HEADER & TABS */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-sm z-20 shrink-0 gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Blueblood <span className="text-premium-indigo">Exports</span>
          </h1>
          <div className="h-6 w-px bg-slate-200"></div>
          <button 
            onClick={() => setIsEmailSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all"
          >
            ⚙️ Email Settings
          </button>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner">
          <button 
            onClick={() => setActiveTab('scraper')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'scraper' ? 'bg-white shadow-sm text-premium-indigo' : 'text-slate-500 hover:text-slate-700'}`}
          >
            🔌 Scraper
          </button>
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'analytics' ? 'bg-white shadow-sm text-premium-indigo' : 'text-slate-500 hover:text-slate-700'}`}
          >
            📈 Analytics
          </button>
          <button 
            onClick={() => setActiveTab('database')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'database' ? 'bg-white shadow-sm text-premium-indigo' : 'text-slate-500 hover:text-slate-700'}`}
          >
            🗃️ Database
          </button>
          <button 
            onClick={() => setActiveTab('outreach')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'outreach' ? 'bg-premium-emerald' : 'text-slate-400 hover:text-slate-600'}`}
          >
            ✉️ Outreach
          </button>
        </div>
      </div>

      {/* --- TAB CONTENT: OUTREACH CENTER --- */}
      {activeTab === 'outreach' && (
        <div className="flex-1 flex flex-col md:flex-row min-h-0 w-full overflow-hidden bg-[#f1f5f9]">
          {/* LEFT SIDEBAR: Templates & Attachments */}
          <div className="w-full md:w-[380px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden shadow-xl z-10">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800">Outreach</h2>
                <button onClick={addNewTemplate} className="p-2 bg-premium-indigo text-white rounded-lg hover:shadow-lg transition-all">＋</button>
              </div>
              <p className="text-[11px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Campaign Orchestration</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              <div className="px-2 pb-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Email Scripts</h3>
                <div className="space-y-3">
                  {userTemplates.map((tpl, i) => (
                    <div 
                      key={i} 
                      className={`p-4 rounded-2xl border-2 transition-all group ${activeTemplateId === i ? 'border-premium-indigo bg-indigo-50/30 shadow-sm' : 'border-slate-50 bg-slate-50/50 hover:border-slate-100 hover:bg-white'}`}
                      onClick={() => setActiveTemplateId(i)}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${activeTemplateId === i ? 'bg-premium-indigo text-white' : 'bg-slate-200 text-slate-500'}`}>TPL-0{i+1}</span>
                        <button onClick={(e) => { e.stopPropagation(); deleteTemplate(i); }} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">✕</button>
                      </div>
                      <h3 className="font-bold text-slate-800 text-sm truncate">{tpl.name}</h3>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1 italic">"{tpl.subject}"</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ASSETS SECTION */}
              <div className="p-4 bg-slate-900 rounded-3xl mt-6 shadow-lg">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Digital Assets</h3>
                
                <div className="space-y-4">
                  {/* Multiple PDFs */}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">📄 Project Catalogues (PDFs)</label>
                    <div className="space-y-2 mb-2">
                      {attachmentFiles.map((f, i) => (
                        <div key={i} className="flex justify-between items-center bg-white/10 px-3 py-2 rounded-xl text-[10px] text-white font-medium border border-white/5">
                          <span className="truncate max-w-[180px]">{f.name}</span>
                          <button onClick={() => setAttachmentFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300">✕</button>
                        </div>
                      ))}
                    </div>
                    <label className="flex flex-col items-center justify-center w-full py-4 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5 transition-all text-slate-500 hover:text-slate-300">
                      <span className="text-lg mb-1">📎</span>
                      <span className="text-[10px] font-bold uppercase">Add Files</span>
                      <input type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => setAttachmentFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                    </label>
                  </div>

                  {/* Letter Signature */}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">✒️ Letter Signature (Stamp/Img)</label>
                    {signatureFile ? (
                      <div className="relative group">
                        <img src={URL.createObjectURL(signatureFile)} className="w-full h-24 object-contain bg-white rounded-2xl p-2 border border-white/10" alt="Signature" />
                        <button onClick={() => setSignatureFile(null)} className="absolute top-2 right-2 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all text-[10px]">✕</button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full py-6 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5 transition-all text-slate-500 hover:text-slate-300">
                        <span className="text-xl mb-1">✍️</span>
                        <span className="text-[10px] font-bold uppercase">Upload Signature</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setSignatureFile(e.target.files[0])} />
                      </label>
                    )}
                  </div>
                  
                  {/* Catalog Link */}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">🔗 Global Drive Link</label>
                    <input 
                      type="text" 
                      placeholder="e.g. drive.google.com/..." 
                      value={catalogUrl}
                      onChange={(e) => setCatalogUrl(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-premium-indigo placeholder:text-slate-700"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MAIN ZONE: Editor & Target Selection */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">
            <div className="p-8 flex flex-col h-full overflow-y-auto custom-scrollbar">
              
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* EDITOR SECTION */}
                <div className="lg:col-span-3 space-y-6">
                  <div className="card-premium p-8 glass-panel animate-fade-in">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-black text-slate-800">Email Composer</h3>
                      <div className="flex gap-2">
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black border border-emerald-100">Live Preview</span>
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject Line</label>
                        <input 
                          type="text" 
                          value={userTemplates[activeTemplateId]?.subject || ''} 
                          onChange={(e) => updateTemplate('subject', e.target.value)}
                          className="w-full input-premium font-bold text-slate-800"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Message Body</label>
                        <div className="relative">
                          <textarea 
                            rows="10"
                            value={userTemplates[activeTemplateId]?.body || ''} 
                            onChange={(e) => updateTemplate('body', e.target.value)}
                            className="w-full input-premium text-sm text-slate-700 font-medium leading-relaxed resize-none h-[300px]"
                          />
                          <div className="absolute bottom-4 right-4 flex gap-2">
                            {['[Name]', '[Company]', '[Style]'].map(v => (
                              <button key={v} onClick={() => updateTemplate('body', (userTemplates[activeTemplateId]?.body || '') + v)} className="px-2 py-1 bg-white/80 border border-slate-200 rounded text-[9px] font-bold text-slate-500 hover:text-premium-indigo hover:border-premium-indigo transition-all">{v}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  {outreachBatchStatus ? (
                    <div className="card-premium bg-slate-900 border-slate-800 p-8 shadow-2xl relative overflow-hidden animate-slide-in">
                      <div className={`absolute top-0 left-0 h-1 bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-1000`} style={{ width: `${(outreachBatchStatus.current / outreachBatchStatus.total) * 100}%` }}></div>
                      
                      <div className="flex justify-between items-center mb-8">
                        <div>
                          <h3 className="text-xl font-black text-white">Batch Progress</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ID: {currentBatchId || 'local'}</p>
                            <span className="text-slate-700">•</span>
                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                              ⏱️ {outreachBatchStatus.startTime ? Math.floor((Date.now() - outreachBatchStatus.startTime) / 1000) : 0}s elapsed
                            </p>
                            {outreachBatchStatus.nextSendIn > 0 && (
                              <>
                                <span className="text-slate-700">•</span>
                                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest animate-pulse">
                                  ⏳ Next send in {outreachBatchStatus.nextSendIn}s
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${outreachBatchStatus.isComplete ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400 animate-pulse'}`}>
                          {outreachBatchStatus.isComplete ? 'Complete ✅' : 'Sending... ✉️'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <p className="text-[9px] font-black text-slate-500 uppercase">Success</p>
                          <p className="text-2xl font-black text-emerald-400">{outreachBatchStatus.sent}</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <p className="text-[9px] font-black text-slate-500 uppercase">Failed</p>
                          <p className="text-2xl font-black text-red-400">{outreachBatchStatus.failed}</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest">
                          <span className="text-slate-500">Queue Position</span>
                          <span className="text-white">{outreachBatchStatus.current} / {outreachBatchStatus.total}</span>
                        </div>
                        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000" 
                            style={{ width: `${(outreachBatchStatus.current / outreachBatchStatus.total) * 100}%` }}
                          ></div>
                        </div>
                      </div>

                      {outreachBatchStatus.errors.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-white/5">
                          <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-3">Error Log</p>
                          <div className="max-h-32 overflow-y-auto space-y-2 pr-2 custom-scrollbar-dark">
                            {outreachBatchStatus.errors.map((err, i) => (
                              <p key={i} className="text-[10px] text-slate-500 font-mono bg-red-500/5 p-2 rounded-lg border border-red-500/10">{err}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {outreachBatchStatus.isComplete && (
                        <button 
                          onClick={() => { setOutreachBatchStatus(null); setOutreachSelectedLeads([]); }}
                          className="w-full mt-8 bg-white/10 hover:bg-white/20 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Clear & Start New Batch
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="card-premium bg-slate-900 border-slate-800 p-8 shadow-2xl relative overflow-hidden h-full flex flex-col animate-fade-in">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-premium-indigo to-premium-emerald opacity-50"></div>
                      
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Live Verification</h3>
                        <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></div>
                      </div>

                      {outreachSelectedLeads.length > 0 ? (
                        <div className="flex-1 flex flex-col">
                          <div className="space-y-4 font-mono text-[11px] text-slate-400 flex-1 overflow-y-auto custom-scrollbar pr-2">
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                              <div className="flex gap-3 mb-2"><span className="text-slate-600 w-12 text-right">TO:</span> <span className="text-blue-300 font-bold">{dbLeads.find(l => l.id === outreachSelectedLeads[0])?.Email}</span></div>
                              <div className="flex gap-3"><span className="text-slate-600 w-12 text-right">SUBJ:</span> <span className="text-white">{parseVariables(userTemplates[activeTemplateId].subject, dbLeads.find(l => l.id === outreachSelectedLeads[0]))}</span></div>
                            </div>
                            
                            <div className="bg-white/5 p-6 rounded-3xl border border-white/5 relative">
                              <div className="whitespace-pre-wrap leading-relaxed text-slate-300 text-xs">
                                {parseVariables(userTemplates[activeTemplateId].body, dbLeads.find(l => l.id === outreachSelectedLeads[0]))}
                                
                                {catalogUrl && (
                                  <div className="mt-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-[10px] text-indigo-300 flex items-center gap-3">
                                    <span className="text-lg">📁</span>
                                    <div>
                                      <p className="font-black uppercase tracking-widest text-[8px]">Wholesale Catalogue Attached</p>
                                      <p className="truncate max-w-[150px] opacity-60">{catalogUrl}</p>
                                    </div>
                                  </div>
                                )}

                                {attachmentFiles.length > 0 && (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    {attachmentFiles.map((f, i) => (
                                      <span key={i} className="px-2 py-1 bg-white/5 rounded text-[8px] border border-white/10 uppercase font-black text-slate-500">📎 {f.name}</span>
                                    ))}
                                  </div>
                                )}

                                <div className="mt-8 pt-6 border-t border-white/5">
                                  {signatureFile ? (
                                    <img src={URL.createObjectURL(signatureFile)} className="h-16 object-contain invert opacity-60" alt="Signature" />
                                  ) : (
                                    <div className="text-slate-600">
                                      <p className="text-[10px] font-bold">Best regards,</p>
                                      <p className="text-sm font-black text-white mt-1">BlueBloodExports</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {!dbLeads.find(l => l.id === outreachSelectedLeads[0])?.['Decision Maker'] && (
                                <div className="absolute -top-3 -right-3 bg-red-600 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase shadow-xl animate-bounce">⚠️ Missing Name!</div>
                              )}
                            </div>
                          </div>
                          
                          <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Batch Size: <span className="text-indigo-400">{outreachSelectedLeads.length} Leads</span></div>
                            <button 
                              disabled={outreachSelectedLeads.length === 0 || isSendingDrafts}
                              onClick={handleSendToApproval}
                              className="bg-premium-indigo hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-2"
                            >
                              {isSendingDrafts ? <span className="animate-spin text-lg">↻</span> : '📨 Send Batch'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-700 text-center select-none">
                          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5">
                            <span className="text-4xl">📧</span>
                          </div>
                          <p className="text-sm font-black uppercase tracking-widest text-slate-500">Awaiting Selection</p>
                          <p className="text-[10px] font-medium text-slate-600 mt-2 max-w-[180px]">Choose leads from the database below to begin your campaign preview.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-12 space-y-6">
                <div className="flex justify-between items-end">
                  <div>
                    <h3 className="text-xl font-black text-slate-800">Target Pipeline</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">Refine your selection for this batch</p>
                  </div>
                  <div className="flex gap-4 items-center">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button onClick={selectAllNewLeads} className="px-4 py-1.5 text-[10px] font-black text-slate-500 hover:text-premium-indigo uppercase transition-all">Select All New</button>
                      <button onClick={() => setOutreachSelectedLeads([])} className="px-4 py-1.5 text-[10px] font-black text-slate-400 hover:text-red-500 uppercase transition-all">Clear All</button>
                    </div>
                  </div>
                </div>

                <div className="card-premium shadow-xl border-slate-100 overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 text-[10px] uppercase font-black text-slate-400 tracking-widest border-b border-slate-100">
                          <th className="px-6 py-4 w-12 text-center">
                            <input 
                              type="checkbox" 
                              checked={outreachSelectedLeads.length > 0 && sortedLeads.filter(l => l.Status !== 'Trashed' && l.Email).every(l => outreachSelectedLeads.includes(l.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setOutreachSelectedLeads(sortedLeads.filter(l => l.Status !== 'Trashed' && l.Email).map(l => l.id));
                                } else {
                                  setOutreachSelectedLeads([]);
                                }
                              }}
                              className="w-4 h-4 rounded-lg border-slate-300 text-premium-indigo focus:ring-premium-indigo transition-all cursor-pointer"
                            />
                          </th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Company Details</th>
                          <th className="px-6 py-4">Lead Score</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {sortedLeads.filter(l => l.Status !== 'Trashed' && l.Email).map((lead) => (
                          <tr key={lead.id} className={`group transition-all ${outreachSelectedLeads.includes(lead.id) ? 'bg-indigo-50/30' : 'hover:bg-slate-50'}`}>
                            <td className="px-6 py-5 text-center">
                              <input 
                                type="checkbox" 
                                checked={outreachSelectedLeads.includes(lead.id)}
                                onChange={() => toggleLeadSelection(lead.id)}
                                className="w-4 h-4 rounded-lg border-slate-300 text-premium-indigo focus:ring-premium-indigo transition-all cursor-pointer"
                              />
                            </td>
                            <td className="px-6 py-5">
                              {lead['Decision Maker'] ? (
                                <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter">Verified ✅</span>
                              ) : (
                                <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter">Pending ⚠️</span>
                              )}
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex flex-col">
                                <span className="font-black text-slate-800 text-sm">{lead['Company Name']}</span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-tighter">{lead.Email}</span>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${parseInt(lead['Lead Score']) >= 7 ? 'bg-premium-indigo' : 'bg-slate-400'}`} style={{width: `${(parseInt(lead['Lead Score']) || 5) * 10}%`}}></div>
                                </div>
                                <span className="text-[10px] font-black text-slate-600">{lead['Lead Score'] || '5'}/10</span>
                              </div>
                            </td>
                            <td className="px-6 py-5 text-right">
                              <button 
                                onClick={() => {
                                  toggleLeadSelection(lead.id);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:border-premium-indigo hover:text-premium-indigo transition-all uppercase tracking-widest shadow-sm"
                              >
                                {outreachSelectedLeads.includes(lead.id) ? 'Deselect' : 'Draft ✉️'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL SETTINGS MODAL */}
      {isEmailSettingsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border border-white/20 animate-slide-in">
            <div className="bg-slate-900 p-10 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-premium-indigo/20 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-premium-emerald/10 rounded-full blur-3xl"></div>
              
              <h3 className="text-3xl font-black text-white tracking-tight relative z-10">Email Config</h3>
              <p className="text-indigo-400 text-xs font-bold uppercase tracking-[0.2em] mt-2 relative z-10">SMTP & App Credentials</p>
              
              <button onClick={() => setIsEmailSettingsOpen(false)} className="absolute top-8 right-8 text-white/50 hover:text-white transition-all text-2xl">✕</button>
            </div>
            
            <div className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sender Address (Gmail)</label>
                <input 
                  type="email" 
                  value={emailConfig.email}
                  onChange={(e) => setEmailConfig({...emailConfig, email: e.target.value})}
                  className="w-full input-premium py-4"
                  placeholder="name@gmail.com"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex justify-between">
                  <span>Google App Password</span>
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" className="text-premium-indigo hover:underline">Get Key ↗</a>
                </label>
                <input 
                  type="password" 
                  value={emailConfig.password}
                  onChange={(e) => setEmailConfig({...emailConfig, password: e.target.value})}
                  className="w-full input-premium py-4"
                  placeholder="•••• •••• •••• ••••"
                />
                <p className="text-[9px] text-slate-400 font-medium leading-relaxed italic">
                  ⚠️ Do NOT use your regular password. Create an "App Password" in your Google Account Security settings.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Company Display Name</label>
                <input 
                  type="text" 
                  value={emailConfig.name}
                  onChange={(e) => setEmailConfig({...emailConfig, name: e.target.value})}
                  className="w-full input-premium py-4"
                  placeholder="BlueBloodExports"
                />
              </div>

              <div className="pt-6 border-t border-slate-100 mt-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Verification</p>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    id="testEmailAddress"
                    placeholder="test@example.com"
                    className="flex-1 input-premium py-3 text-xs"
                  />
                  <button 
                    onClick={async () => {
                      const email = document.getElementById('testEmailAddress').value;
                      if (!email) return showNotification('Enter a test email address', 'error');
                      
                      try {
                        const res = await fetch('http://localhost:4000/api/test-email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ config: emailConfig, to: email })
                        });
                        const data = await res.json();
                        if (data.success) showNotification('Test email sent! Check your inbox.', 'success');
                        else showNotification('Test failed: ' + data.error, 'error');
                      } catch (err) {
                        showNotification('Network error', 'error');
                      }
                    }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Test SMTP
                  </button>
                </div>
              </div>

              <button 
                onClick={() => {
                  setIsEmailSettingsOpen(false);
                  showNotification('Settings saved successfully!');
                }}
                className="w-full bg-slate-900 hover:bg-black text-white py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-xs shadow-xl active:scale-95 transition-all mt-4"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: SCRAPER --- */}
      {activeTab === 'scraper' && (
        <div className="flex-1 flex flex-col md:flex-row min-h-0 w-full">
          {/* LEFT SIDEBAR: Topic Checks */}
          <div className="w-full md:w-[420px] bg-white border-r border-slate-200 flex flex-col z-10 shrink-0 shadow-[2px_0_8px_rgba(0,0,0,0.02)]">
            
            <div className="p-5 border-b border-slate-100 bg-slate-50 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">Job Control</h2>
              <p className="text-xs text-slate-500 mt-1">Configure your extraction parameters</p>
            </div>

            <div className="p-6 flex-1 flex flex-col bg-white overflow-y-auto min-h-0">
              
              {/* Topics */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Target Topics</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(topics).map(topic => (
                    <label key={topic} className={`cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium border flex items-center transition-colors select-none
                      ${topics[topic] ? 'bg-blue-50 border-blue-300 text-blue-800 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}>
                      <input type="checkbox" className="hidden" checked={topics[topic]} onChange={() => setTopics({...topics, [topic]: !topics[topic]})} disabled={isScraping} />
                      {topics[topic] && <span className="mr-1.5 text-blue-600 font-bold">✓</span>}
                      {topic}
                    </label>
                  ))}
                </div>
              </div>

              {/* Regions */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Locations</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(regions).map(region => (
                    <label key={region} className={`cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium border flex items-center transition-colors select-none
                      ${regions[region] ? 'bg-indigo-50 border-indigo-300 text-indigo-800 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}>
                      <input type="checkbox" className="hidden" checked={regions[region]} onChange={() => setRegions({...regions, [region]: !regions[region]})} disabled={isScraping} />
                      {regions[region] && <span className="mr-1.5 text-indigo-600 font-bold">✓</span>}
                      {region}
                    </label>
                  ))}
                </div>
              </div>

                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex justify-between items-center group">
                  <span>Custom Keywords</span>
                  <button 
                    onClick={handleAISuggest}
                    disabled={isScraping || isSuggesting}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black border border-indigo-200 transition-all uppercase tracking-tight shadow-sm"
                  >
                    {isSuggesting ? <span className="animate-spin text-indigo-400">↻</span> : '💡 AI Suggest'}
                  </button>
                </label>
                <textarea 
                  className="flex-1 w-full bg-slate-50 text-slate-700 border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none shadow-sm"
                  value={customQueries}
                  onChange={(e) => setCustomQueries(e.target.value)}
                  disabled={isScraping}
                  placeholder="Paste manual queries here...&#10;One per line."
                />
              </div>

              {/* Advanced Settings */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col gap-6">
                <label className="block text-xs font-black text-slate-800 uppercase tracking-widest mb-1 flex items-center justify-between">
                  ⚙️ Advanced Settings
                </label>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Search Depth</label>
                    <select 
                      disabled={isScraping}
                      value={searchLimit} 
                      onChange={(e) => setSearchLimit(Number(e.target.value))}
                      className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={10}>Top 10</option>
                      <option value={20}>Top 20 (Balanced)</option>
                      <option value={50}>Top 50 (Deep)</option>
                      <option value={100}>Top 100 (Extreme)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Concurrency</label>
                    <select 
                      disabled={isScraping}
                      value={concurrency} 
                      onChange={(e) => setConcurrency(Number(e.target.value))}
                      className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={1}>1 (Safe)</option>
                      <option value={3}>3 (Normal)</option>
                      <option value={5}>5 (Fast)</option>
                      <option value={10}>10 (Turbo)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <div className="relative inline-flex items-center">
                      <input type="checkbox" className="sr-only" checked={strictMode} onChange={() => setStrictMode(!strictMode)} disabled={isScraping} />
                      <div className={`w-8 h-4 rounded-full transition-colors ${strictMode ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
                      <div className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${strictMode ? 'translate-x-4' : 'translate-x-0'} shadow-sm`}></div>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Strict Email Mode</span>
                      <span className="text-[9px] text-slate-400 font-medium leading-none">Discard leads with no valid email</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <div className="relative inline-flex items-center">
                      <input type="checkbox" className="sr-only" checked={autoExport} onChange={() => setAutoExport(!autoExport)} disabled={isScraping} />
                      <div className={`w-8 h-4 rounded-full transition-colors ${autoExport ? 'bg-emerald-600' : 'bg-slate-200'}`}></div>
                      <div className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${autoExport ? 'translate-x-4' : 'translate-x-0'} shadow-sm`}></div>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Immediate Sheet Sync</span>
                      <span className="text-[9px] text-slate-400 font-medium leading-none">Push to Google Sheets instantly upon completion</span>
                    </div>
                  </label>
                </div>
              </div>

            <div className="p-5 border-t border-slate-100 bg-white shrink-0">
              <div className="flex justify-between items-center mb-3 px-1 text-xs text-slate-500 font-medium">
                <span>Calculated Searches:</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-700">{totalQueries}</span>
              </div>
              {isScraping ? (
                <button 
                  onClick={handleStop}
                  className="w-full py-3.5 rounded-lg font-black text-sm bg-red-600 text-white hover:bg-red-700 shadow-md hover:shadow-lg active:scale-[0.98] transition-all focus:outline-none flex justify-center items-center gap-2 uppercase tracking-wide"
                >
                  🛑 Stop Engine
                </button>
              ) : (
                <button 
                  onClick={handleStart}
                  disabled={totalQueries === 0}
                  className={`w-full py-3.5 rounded-lg font-bold text-sm transition-all focus:outline-none flex justify-center items-center gap-2 uppercase tracking-wide
                    ${totalQueries === 0 ? 'bg-slate-100 cursor-not-allowed text-slate-400 border border-slate-200' : 'bg-[#1A237E] text-white hover:bg-[#0D113F] shadow-md hover:shadow-lg active:scale-[0.98]'}`}
                >
                  Search
                </button>
              )}
            </div>
          </div>

          {/* RIGHT SIDE: Terminal */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] p-4 md:p-8">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                Live Extraction Feed
              </h2>
              <div className="flex gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm text-xs font-medium text-slate-500">
                Engine Status: 
                <span className={`flex items-center gap-1.5 text-xs font-bold ${isScraping ? 'text-blue-600' : 'text-slate-400'}`}>
                  {isScraping && <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>}
                  {!isScraping && <span className="h-2 w-2 rounded-full bg-slate-300"></span>}
                  {isScraping ? 'Extracting' : 'Idle'}
                </span>
              </div>
            </div>

            <div className="flex-1 bg-[#1e293b] rounded-xl flex flex-col overflow-hidden shadow-lg border border-slate-700/50 min-h-0">
              <div className="bg-[#0f172a] px-4 py-3 flex items-center shrink-0 border-b border-white/5">
                <div className="flex space-x-2"><div className="w-3 h-3 rounded-full bg-red-500/80"></div><div className="w-3 h-3 rounded-full bg-yellow-500/80"></div><div className="w-3 h-3 rounded-full bg-green-500/80"></div></div>
                <div className="mx-auto text-[11px] font-mono text-slate-500">puppeteer-engine</div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-5 font-mono text-[13px] text-green-400 leading-relaxed scroll-smooth">
                {logs.length > 0 ? logs.map((log, index) => {
                  let textColor = "text-green-400";
                  if (log.includes('❌') || log.includes('Error')) textColor = "text-red-400";
                  else if (log.includes('⚠️')) textColor = "text-yellow-400";
                  else if (log.includes('✅') || log.includes('DONE')) textColor = "text-emerald-300 font-semibold";
                  else if (log.includes('===') || log.includes('---')) textColor = "text-blue-300";

                  return (
                    <div key={index} className={`mb-1 opacity-90 truncate ${textColor}`}>
                      <span className="text-slate-600 mr-3 text-[10px]">➜</span>{log}
                    </div>
                  );
                }) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500/50 p-6 text-center select-none h-full mt-24">
                    <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <p className="text-sm font-medium tracking-wide">SYSTEM READY</p>
                    <p className="text-xs mt-1">Awaiting target keywords to commence extraction.</p>
                  </div>
                )}
                <div ref={logEndRef} className="h-4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: ANALYTICS --- */}
      {activeTab === 'analytics' && (
        <div className="flex-1 overflow-auto bg-[#f8fafc] p-4 md:p-8 w-full min-h-0">
          <div className="max-w-6xl mx-auto space-y-6 pb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b border-slate-200 pb-4">Pipeline & Growth Analytics</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-500 uppercase">Total Leads in DB</h3>
                <p className="text-4xl font-black text-blue-600 mt-2">{dbLeads.length}</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-500 uppercase">VIP Leads (Score 8+)</h3>
                <p className="text-4xl font-black text-indigo-600 mt-2">{dbLeads.filter(l => parseInt(l['Lead Score']||0) >= 8).length}</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-500 uppercase">Closed Deals</h3>
                <p className="text-4xl font-black text-emerald-600 mt-2">{dbLeads.filter(l => l.Status === 'Closed').length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-80">
                <h3 className="font-bold text-slate-700 mb-4">Leads by Country Breakdown</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(dbLeads.reduce((acc, lead) => {
                          const country = lead.Country || 'Unknown';
                          acc[country] = (acc[country] || 0) + 1;
                          return acc;
                        }, {})).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value).slice(0, 10)}
                        cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label={({name}) => name.substring(0, 10)}
                      >
                        {dbLeads.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'][index % 8]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-80">
                <h3 className="font-bold text-slate-700 mb-4">Sales Pipeline Stages</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={
                      ['New', 'Contacted', 'Replied', 'Negotiation', 'Closed'].map(status => ({
                        name: status,
                        count: dbLeads.filter(l => (l.Status || 'New') === status).length
                      }))
                    } margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{fontSize: 12}} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: DATABASE CRM --- */}
      {activeTab === 'database' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 min-h-0 w-full overflow-hidden bg-white">
          {/* Database Control Bar */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap gap-4 items-center justify-between shadow-sm z-10 shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative group">
                <input 
                  type="text" 
                  placeholder="Filter by company, city, email..."
                  className="bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm w-64 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>

              <div className="h-6 w-px bg-slate-200 mx-2 hidden md:block"></div>
              
              <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100 shadow-inner">
                <button onClick={() => setDbView('active')} className={`px-4 py-1.5 rounded-md text-[11px] font-black uppercase transition-all ${dbView === 'active' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Active</button>
                <button onClick={() => setDbView('trash')} className={`px-4 py-1.5 rounded-md text-[11px] font-black uppercase transition-all ${dbView === 'trash' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Trash</button>
              </div>

              <button 
                onClick={() => document.getElementById('csvImportInput').click()}
                className="ml-2 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all bg-slate-800 text-white hover:bg-slate-900 border border-slate-700 flex items-center gap-2 shadow-sm"
              >
                📥 Import CSV
              </button>
              <input 
                id="csvImportInput"
                type="file" 
                accept=".csv" 
                onChange={handleImportCSV} 
                className="hidden" 
              />

              <button 
                onClick={handleCheckReplies}
                disabled={isCheckingReplies}
                className={`ml-2 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-2 ${isCheckingReplies ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'}`}
              >
                {isCheckingReplies ? <span className="animate-spin text-emerald-400">↻</span> : '✨'} {isCheckingReplies ? 'Checking...' : 'Check Replies'}
              </button>
            </div>

            {/* Bulk Actions (Dynamic) */}
            {dbSelectedLeads.length > 0 && (
              <div className="flex items-center gap-3 animate-fade-in">
                <span className="text-xs font-bold text-slate-500 uppercase px-2 py-1 bg-slate-100 rounded border border-slate-200">{dbSelectedLeads.length} selected</span>
                {dbView === 'active' ? (
                  <>
                    <button 
                      onClick={async () => {
                        const res = await fetch('http://localhost:4000/api/leads/bulk-update', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ids: dbSelectedLeads, updates: { Status: 'In Outreach' } })
                        });
                        const data = await res.json();
                        if (data.success) {
                          setDbLeads(data.leads);
                          setOutreachSelectedLeads(prev => [...new Set([...prev, ...dbSelectedLeads])]);
                          setDbSelectedLeads([]);
                          showNotification(`Moved ${dbSelectedLeads.length} leads to Outreach`);
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md shadow-blue-200 uppercase tracking-wide flex items-center gap-2"
                    >
                      🚀 Send to Outreach
                    </button>
                    <button 
                      onClick={async () => {
                        const res = await fetch('http://localhost:4000/api/leads/bulk-update', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ids: dbSelectedLeads, updates: { Status: 'Trashed' } })
                        });
                        const data = await res.json();
                        if (data.success) {
                          setDbLeads(data.leads);
                          setDbSelectedLeads([]);
                          showNotification(`${dbSelectedLeads.length} leads moved to Trash`);
                        }
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide"
                    >
                      🗑️ Bulk Trash
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={async () => {
                        const res = await fetch('http://localhost:4000/api/leads/bulk-update', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ids: dbSelectedLeads, updates: { Status: '' } })
                        });
                        const data = await res.json();
                        if (data.success) {
                          setDbLeads(data.leads);
                          setDbSelectedLeads([]);
                          showNotification(`${dbSelectedLeads.length} leads restored`);
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase"
                    >
                      ♻️ Bulk Restore
                    </button>
                    <button 
                      onClick={async () => {
                        if (confirm(`Permanently delete ${dbSelectedLeads.length} leads?`)) {
                          const res = await fetch('http://localhost:4000/api/leads/bulk-delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: dbSelectedLeads })
                          });
                          const data = await res.json();
                          if (data.success) {
                            setDbLeads(data.leads);
                            setDbSelectedLeads([]);
                            showNotification('Leads permanently deleted');
                          }
                        }
                      }}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase"
                    >
                      🔥 Final Delete
                    </button>
                  </>
                )}
                <button onClick={() => setDbSelectedLeads([])} className="text-slate-400 hover:text-slate-600 p-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3 mb-6 bg-slate-50/50 p-4 rounded-xl border border-slate-100 shadow-sm animate-fade-in shrink-0">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Stage</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 w-32 shadow-sm">
                <option value="All">All Stages</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Replied">Replied</option>
                <option value="Negotiation">Negotiation</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Quality</label>
              <select value={chanceFilter} onChange={(e) => setChanceFilter(e.target.value)} className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 w-32 shadow-sm">
                <option value="All">All Quality</option>
                <option value="High">⭐ High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Product Style</label>
              <select value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)} className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 w-40 shadow-sm">
                {uniqueStyles.map(s => <option key={s} value={s}>{s === 'All' ? 'All Styles' : s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Geographic</label>
              <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 w-40 shadow-sm">
                {uniqueCountries.map(c => <option key={c} value={c}>{c === 'All' ? 'All Countries' : c}</option>)}
              </select>
            </div>
            {(statusFilter !== 'All' || chanceFilter !== 'All' || styleFilter !== 'All' || countryFilter !== 'All' || filterText) && (
              <button 
                onClick={() => {
                  setStatusFilter('All');
                  setChanceFilter('All');
                  setStyleFilter('All');
                  setCountryFilter('All');
                  setFilterText('');
                }}
                className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest pl-2 mb-2"
              >
                Reset Filters
              </button>
            )}
          </div>

          <div className="flex-1 border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col min-h-0 bg-white">
            {isLoadingDB ? (
              <div className="flex-1 flex justify-center items-center text-slate-500 text-sm">Loading database...</div>
            ) : sortedLeads.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center items-center text-slate-400 text-sm"><span className="text-3xl mb-2">{dbView === 'trash' ? '🗑️' : '📭'}</span><p>{filterText ? 'No leads match your filter.' : dbView === 'trash' ? 'Trash is empty.' : 'No active leads.'}</p></div>
            ) : (
              <div className="overflow-auto flex-1 h-full w-full">
                <table className="min-w-max w-full text-left border-collapse">
                  <thead className="bg-[#f8fafc] sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-[10px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="px-3 py-3 w-8">
                        <input 
                          type="checkbox" 
                          checked={dbSelectedLeads.length === sortedLeads.length && sortedLeads.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) selectAllFilteredDbLeads();
                            else clearDbSelectedLeads();
                          }}
                          className="w-4 h-4 rounded cursor-pointer text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-3 py-3 w-8">Pipeline Status</th>
                      <th className="px-3 py-3">Follow-Up</th>
                      {['Company Name', 'Decision Maker', 'Last Contacted', 'LinkedIn', 'Email', 'Smart Mail', 'Phone', 'Country', 'Business Type', 'Target Audience', 'Instagram', 'Notes', 'Lead Score', 'Chance'].map((header) => (
                        <th key={header} onClick={() => handleSort(header)} className="px-3 py-3 cursor-pointer hover:bg-slate-200 whitespace-nowrap">{header} {sortConfig?.key === header ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</th>
                      ))}
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {sortedLeads.map((lead) => {
                      const id = lead.id;
                      
                      // Auto-Follow Up Logic
                      const lastContacted = lead['Last Contacted'] ? new Date(lead['Last Contacted']) : null;
                      const daysPassed = lastContacted ? Math.floor((new Date() - lastContacted) / (1000 * 60 * 60 * 24)) : 0;
                      const isOverdue = (lead.Status === 'Contacted' || lead.Status === 'Replied' || lead.Status === 'Negotiation') && daysPassed >= 3;

                      return (
                        <tr key={id} className={`hover:bg-blue-50/40 transition-colors ${dbSelectedLeads.includes(id) ? 'bg-blue-50/70 border-l-4 border-l-blue-500' : isOverdue ? 'bg-red-50/50 border-l-4 border-l-red-500' : lead.Status === 'Contacted' ? 'bg-indigo-50/40' : lead.Status === 'Replied' ? 'bg-amber-50/40' : lead.Status === 'Closed' ? 'bg-teal-50/50' : ''}`}>
                          <td className="px-3 py-2 text-center">
                            <input 
                              type="checkbox" 
                              checked={dbSelectedLeads.includes(id)}
                              onChange={() => toggleDbLeadSelection(id)}
                              className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <select 
                              value={lead.Status && lead.Status !== 'Trashed' ? lead.Status : 'New'} 
                              onChange={(e) => updateStatus(id, e.target.value)}
                              className="bg-white border border-slate-300 rounded text-[11px] font-bold p-1 shadow-sm focus:ring-1 focus:ring-blue-500 cursor-pointer"
                            >
                              <option value="New">🔵 New Lead</option>
                              <option value="Contacted">🟣 Contacted</option>
                              <option value="Replied">🟠 Replied</option>
                              <option value="Negotiation">🟡 Negotiation</option>
                              <option value="Closed">🟢 Closed Deal</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 font-semibold text-center">
                            {isOverdue && <span className="text-red-600 bg-red-100 px-2 py-0.5 rounded text-[10px] font-black uppercase whitespace-nowrap shadow-sm">Overdue ⏰</span>}
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800 cursor-pointer hover:bg-blue-100 hover:text-blue-900 transition-colors" title="Click to copy" onClick={() => copyData(lead['Company Name'])}>{lead['Company Name']}</td>
                          <td className="px-3 py-2 text-slate-700 font-medium cursor-pointer hover:bg-blue-100 transition-colors" title="Click to copy" onClick={() => copyData(lead['Decision Maker'])}>{lead['Decision Maker'] || '-'}</td>
                          <td className="px-3 py-2 text-[10px] text-slate-500 font-mono">
                            {lead['Last Contacted'] ? new Date(lead['Last Contacted']).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            <button onClick={(e) => handleLinkedInSearch(e, lead)} className="text-white bg-[#0a66c2] hover:bg-[#004182] px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider transition-all shadow-sm">🔍 Find Owner</button>
                          </td>
                          <td className="px-3 py-2 text-slate-600 cursor-pointer hover:bg-blue-100 hover:text-blue-900 transition-colors flex items-center gap-1" title="Click to copy" onClick={() => copyData(lead.Email)}>
                            {lead.Email || '-'}
                            {lead['Email Valid'] === 'Valid' && <span title="Email is Verified via Network Ping">✅</span>}
                            {lead['Email Valid'] === 'Invalid' && <span title="Email is potentially dead/fake">⚠️</span>}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {lead.Email ? (
                              <div className="flex flex-col gap-1">
                                {(!lead.Status || lead.Status === 'New' || lead.Status === 'New Lead') && (
                                  <a href={generateEmailTemplate(lead, 'Initial')} onClick={(e) => e.stopPropagation()} className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-full text-[10px] shadow-sm font-bold transition-all uppercase whitespace-nowrap flex items-center justify-center gap-1">✨ First Pitch</a>
                                )}
                                {lead.Status === 'Contacted' && daysPassed < 7 && (
                                  <a href={generateEmailTemplate(lead, 'Followup1')} onClick={(e) => e.stopPropagation()} className="text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-full text-[10px] shadow-sm font-bold transition-all uppercase whitespace-nowrap flex items-center justify-center gap-1">🕒 Day 3 Follow Up</a>
                                )}
                                {lead.Status === 'Contacted' && daysPassed >= 7 && (
                                  <a href={generateEmailTemplate(lead, 'Followup2')} onClick={(e) => e.stopPropagation()} className="text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-full text-[10px] shadow-sm font-bold transition-all uppercase whitespace-nowrap flex items-center justify-center gap-1">🚀 Day 7 Follow Up</a>
                                )}
                                {(lead.Status === 'Replied' || lead.Status === 'Negotiation') && (
                                  <a href={`mailto:${lead.Email}`} onClick={(e) => e.stopPropagation()} className="text-blue-600 border border-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all uppercase whitespace-nowrap flex items-center justify-center gap-1">✍️ Reply Directly</a>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                      <td className="px-3 py-2 text-slate-600 cursor-pointer hover:bg-blue-100 transition-colors" title="Click to copy" onClick={() => copyData(lead.Phone)}>{lead.Phone || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => copyData(lead.Country)}>{lead.Country || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => copyData(lead['Business Type'])}>{lead['Business Type'] || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => copyData(lead['Target Audience'])}>{lead['Target Audience'] || '-'}</td>
                      <td className="px-3 py-2 text-blue-600">
                        {lead.Instagram ? (
                          <div className="flex gap-2">
                            <a href={lead.Instagram} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline text-xs mt-1">IG ↗</a>
                            <button onClick={(e) => handleDMPitch(e, lead)} className="text-white bg-pink-600 hover:bg-pink-700 px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider transition-all whitespace-nowrap shadow-sm">💬 DM Pitch</button>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-normal min-w-[250px] cursor-pointer hover:bg-blue-100 transition-colors border-x border-transparent hover:border-blue-200" title="Click to copy" onClick={() => copyData(lead.Notes)}>{lead.Notes || '-'}</td>
                      <td className="px-3 py-2 font-mono text-center font-bold" onClick={() => copyData(lead['Lead Score'])}>{lead['Lead Score']}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity ${lead.Chance === 'High' ? 'bg-green-100 text-green-700' : lead.Chance === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-200 text-slate-600'}`} onClick={() => copyData(lead.Chance)}>{lead.Chance || 'Low'}</span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {dbView === 'active' ? (
                          <button onClick={(e) => { e.stopPropagation(); moveToTrash(lead.originalIndex); }} className="text-red-500 hover:text-white border border-red-500 hover:bg-red-500 px-2.5 py-1 rounded text-[10px] font-bold transition-all">TRASH</button>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={(e) => { e.stopPropagation(); restoreLead(lead.originalIndex); }} className="text-green-600 hover:text-white border border-green-600 hover:bg-green-600 px-2.5 py-1 rounded text-[10px] font-bold transition-all">RESTORE</button>
                            <button onClick={(e) => { e.stopPropagation(); permanentDelete(lead.originalIndex); }} className="text-white border border-red-600 bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded text-[10px] font-bold transition-all">DELETE</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
            <div className="bg-[#f8fafc] border-t border-slate-200 px-4 py-2 flex justify-between items-center text-[10px] uppercase font-bold text-slate-500 shrink-0">
              <span>Showing {sortedLeads.length} {dbView === 'active' ? 'Active' : 'Trashed'} Leads</span>
              <span>CSV File Verified</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
