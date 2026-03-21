import React, { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

function App() {
  const [activeTab, setActiveTab] = useState('scraper'); // 'scraper' or 'database'
  
  // Scraper State
  const [topics, setTopics] = useState({
    'Home Decor Boutiques': true,
    'Interior Designers': true,
    'Furniture Stores': false,
    'Handicraft Retailers': false,
    'Museum Gift Shops': false,
  });
  
  const [regions, setRegions] = useState({
    'USA': true,
    'UK': true,
    'Europe': false,
    'Australia': false,
    'Canada': false,
  });

  const [customQueries, setCustomQueries] = useState('');
  const [logs, setLogs] = useState([]);
  const [isScraping, setIsScraping] = useState(false);
  const logEndRef = useRef(null);

  // Database State
  const [dbLeads, setDbLeads] = useState([]);
  const [isLoadingDB, setIsLoadingDB] = useState(false);
  const [sortConfig, setSortConfig] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [dbView, setDbView] = useState('active'); // 'active' or 'trash'
  const [exportingToSheets, setExportingToSheets] = useState(false);

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
      await fetch('http://localhost:4000/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: finalQueries })
      });
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

  const updateStatus = async (index, newStatus) => {
    try {
      const res = await fetch(`http://localhost:4000/api/leads/${index}`, {
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

  const moveToTrash = async (index) => {
    try {
      const res = await fetch(`http://localhost:4000/api/leads/${index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Status: 'Trashed' })
      });
      const data = await res.json();
      if (data.success) setDbLeads(data.leads);
    } catch (err) {
      console.error('Failed to trash lead', err);
    }
  };

  const restoreLead = async (index) => {
    try {
      const res = await fetch(`http://localhost:4000/api/leads/${index}`, {
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

  const permanentDelete = async (index) => {
    if (!window.confirm("Permanently delete this lead? This cannot be undone.")) return;
    try {
      const res = await fetch(`http://localhost:4000/api/leads/${index}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) setDbLeads(data.leads);
    } catch (err) {
      console.error('Failed to permanently delete lead', err);
    }
  };

  const copyData = (text) => {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text);
  };

  const generateEmailTemplate = (lead) => {
    if (!lead.Email) return '#';
    const name = lead['Decision Maker'] || 'Team';
    const company = lead['Company Name'] || 'your company';
    const audience = lead['Target Audience'] || 'your customers';
    const country = lead['Country'] || 'your region';
    
    
    const subject = `Partnership with Blueblood Exports for ${company}`;
    const body = `Hi ${name},\n\nI loved ${company}'s collection and focus on ${audience} in ${country}!\n\nWe supply high-end, artisan-made Indian handicrafts and home decor that perfectly fits your aesthetic. Are you currently open to seeing our new B2B catalog?\n\nBest regards,\nBlueblood Exports`;
    
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
    const query = `site:linkedin.com/in "Founder" OR "CEO" OR "Owner" "${company}"`;
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

  // Compute the final Leads to show
  const sortedLeads = React.useMemo(() => {
    let filtered = dbLeads.map((l, originalIndex) => ({ ...l, originalIndex }));
    
    filtered = filtered.filter(l => dbView === 'trash' ? l.Status === 'Trashed' : l.Status !== 'Trashed');
    
    if (filterText.trim()) {
      const lower = filterText.toLowerCase();
      filtered = filtered.filter(l => 
        (l['Company Name'] || '').toLowerCase().includes(lower) ||
        (l['Email'] || '').toLowerCase().includes(lower) ||
        (l['Website'] || '').toLowerCase().includes(lower) ||
        (l['Notes'] || '').toLowerCase().includes(lower)
      );
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
  }, [dbLeads, sortConfig, filterText, dbView]);

  const activeTopics = Object.keys(topics).filter(k => topics[k]);
  const activeRegions = Object.keys(regions).filter(k => regions[k]);
  const totalQueries = (activeTopics.length * activeRegions.length) + (customQueries.trim() ? customQueries.split('\n').filter(Boolean).length : 0);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#f8fafc] text-slate-800 font-sans">
      
      {/* GLOBAL HEADER & TABS */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-sm z-20 shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Blueblood <span className="text-blue-600">Exports</span>
          </h1>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('scraper')}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'scraper' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            🔌 Scraper Engine
          </button>
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'analytics' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            📈 Analytics
          </button>
          <button 
            onClick={() => setActiveTab('database')}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'database' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            🗃️ Lead Database
          </button>
        </div>
      </div>

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

              {/* Custom */}
              <div className="flex-1 flex flex-col min-h-[120px]">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                  <span>Custom Keywords</span>
                  <span className="font-normal normal-case text-slate-400">(Optional)</span>
                </label>
                <textarea 
                  className="flex-1 w-full bg-slate-50 text-slate-700 border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none shadow-sm"
                  value={customQueries}
                  onChange={(e) => setCustomQueries(e.target.value)}
                  disabled={isScraping}
                  placeholder="Paste manual queries here...&#10;One per line."
                />
              </div>

            </div>

            <div className="p-5 border-t border-slate-100 bg-white shrink-0">
              <div className="flex justify-between items-center mb-3 px-1 text-xs text-slate-500 font-medium">
                <span>Calculated Searches:</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-700">{totalQueries}</span>
              </div>
              <button 
                onClick={handleStart}
                disabled={isScraping || totalQueries === 0}
                className={`w-full py-3.5 rounded-lg font-bold text-sm transition-all focus:outline-none flex justify-center items-center gap-2 uppercase tracking-wide
                  ${isScraping ? 'bg-slate-100 cursor-not-allowed text-slate-400 border border-slate-200' : 'bg-[#1A237E] text-white hover:bg-[#0D113F] shadow-md hover:shadow-lg active:scale-[0.98]'}`}
              >
                {isScraping ? '⚙️ Processing...' : 'Search'}
              </button>
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

      {/* --- TAB CONTENT: DATABASE CRM --- (Unchanged) */}
      {activeTab === 'database' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 min-h-0 w-full overflow-hidden bg-white">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 shrink-0 gap-4">
            <div className="flex items-center gap-4">
              <div className="flex bg-slate-100 rounded p-1">
                <button onClick={() => setDbView('active')} className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${dbView === 'active' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Active Leads</button>
                <button onClick={() => setDbView('trash')} className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${dbView === 'trash' ? 'bg-red-500 shadow text-white' : 'text-slate-500 hover:text-slate-700'}`}>🗑️ Trash</button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-xs">🔍</span>
                <input type="text" placeholder="Filter name, email, notes..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded shadow-sm focus:ring-1 focus:ring-blue-500/50 outline-none w-64"/>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchLeads} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded text-xs hover:bg-slate-50 font-medium shadow-sm">↻ Refresh Data</button>
              <button disabled={exportingToSheets || sortedLeads.length === 0} onClick={exportCurrentViewToSheets} className="px-4 py-1.5 bg-green-600 text-white border border-green-700 rounded text-xs hover:bg-green-700 font-bold shadow-sm disabled:opacity-50">
                {exportingToSheets ? 'Exporting...' : '📊 Export to Google Sheets'}
              </button>
            </div>
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
                      <th className="px-3 py-3 w-8">Pipeline Status</th>
                      <th className="px-3 py-3">Follow-Up</th>
                      {['Company Name', 'Decision Maker', 'LinkedIn', 'Email', 'Smart Mail', 'Phone', 'Country', 'Business Type', 'Target Audience', 'Instagram', 'Notes', 'Lead Score', 'Chance'].map((header) => (
                        <th key={header} onClick={() => handleSort(header)} className="px-3 py-3 cursor-pointer hover:bg-slate-200 whitespace-nowrap">{header} {sortConfig?.key === header ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</th>
                      ))}
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {sortedLeads.map((lead) => {
                      const idx = lead.originalIndex;
                      
                      // Auto-Follow Up Logic
                      const lastContacted = lead['Last Contacted'] ? new Date(lead['Last Contacted']) : null;
                      const daysPassed = lastContacted ? Math.floor((new Date() - lastContacted) / (1000 * 60 * 60 * 24)) : 0;
                      const isOverdue = (lead.Status === 'Contacted' || lead.Status === 'Replied' || lead.Status === 'Negotiation') && daysPassed >= 3;

                      return (
                        <tr key={idx} className={`hover:bg-blue-50/40 transition-colors ${isOverdue ? 'bg-red-50/50 border-l-4 border-l-red-500' : lead.Status === 'Contacted' ? 'bg-indigo-50/40' : lead.Status === 'Replied' ? 'bg-amber-50/40' : lead.Status === 'Closed' ? 'bg-teal-50/50' : ''}`}>
                          <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <select 
                              value={lead.Status && lead.Status !== 'Trashed' ? lead.Status : 'New'} 
                              onChange={(e) => updateStatus(idx, e.target.value)}
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
                          <td className="px-3 py-2 font-medium">
                            <button onClick={(e) => handleLinkedInSearch(e, lead)} className="text-white bg-[#0a66c2] hover:bg-[#004182] px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider transition-all shadow-sm">🔍 Find Owner</button>
                          </td>
                          <td className="px-3 py-2 text-slate-600 cursor-pointer hover:bg-blue-100 hover:text-blue-900 transition-colors flex items-center gap-1" title="Click to copy" onClick={() => copyData(lead.Email)}>
                            {lead.Email || '-'}
                            {lead['Email Valid'] === 'Valid' && <span title="Email is Verified via Network Ping">✅</span>}
                            {lead['Email Valid'] === 'Invalid' && <span title="Email is potentially dead/fake">⚠️</span>}
                          </td>
                          <td className="px-3 py-2 font-medium">{lead.Email ? <a href={generateEmailTemplate(lead)} onClick={(e) => e.stopPropagation()} className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-full text-xs shadow-sm shadow-blue-500/30 font-bold tracking-wide transition-all uppercase whitespace-nowrap flex items-center justify-center gap-1">✨ Write Pitch</a> : '-'}</td>
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
                              <button onClick={(e) => { e.stopPropagation(); moveToTrash(idx); }} className="text-red-500 hover:text-white border border-red-500 hover:bg-red-500 px-2.5 py-1 rounded text-[10px] font-bold transition-all">TRASH</button>
                            ) : (
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); restoreLead(idx); }} className="text-green-600 hover:text-white border border-green-600 hover:bg-green-600 px-2.5 py-1 rounded text-[10px] font-bold transition-all">RESTORE</button>
                                <button onClick={(e) => { e.stopPropagation(); permanentDelete(idx); }} className="text-white border border-red-600 bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded text-[10px] font-bold transition-all">DELETE</button>
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
