import React, { useState, useEffect, useRef } from 'react';

function App() {
  const [queries, setQueries] = useState('home decor store USA\nboutique decor shop UK');
  const [logs, setLogs] = useState([]);
  const [isScraping, setIsScraping] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    let interval;
    if (isScraping) {
      interval = setInterval(fetchLogs, 1000);
    }
    return () => clearInterval(interval);
  }, [isScraping]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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
    setIsScraping(true);
    setLogs([]);
    const queryArray = queries.split('\n').map(q => q.trim()).filter(Boolean);

    try {
      await fetch('http://localhost:4000/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: queryArray })
      });
    } catch (err) {
      setLogs(prev => [...prev, `❌ Could not connect to the engine. Try restarting the backend api.`]);
      setIsScraping(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-[#f8fafc] text-slate-800 font-sans">
      
      {/* LEFT SIDEBAR: Controls */}
      <div className="w-full md:w-[400px] bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        
        {/* Branding Header */}
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Blueblood <span className="text-blue-600">Exports</span>
          </h1>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">
            Lead Generator
          </p>
        </div>

        {/* Input Area */}
        <div className="p-6 flex-1 flex flex-col min-h-0 bg-slate-50/50">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Search Keywords
          </label>
          <textarea 
            className="flex-1 w-full bg-white text-slate-700 border border-slate-300 rounded-lg p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none shadow-sm"
            value={queries}
            onChange={(e) => setQueries(e.target.value)}
            disabled={isScraping}
            placeholder="e.g. interior designers in London"
          />
          <p className="text-[11px] text-slate-400 mt-3 text-center">
            Enter one query per line.
          </p>
        </div>

        {/* Action Button */}
        <div className="p-6 border-t border-slate-100 bg-white">
          <button 
            onClick={handleStart}
            disabled={isScraping || !queries.trim()}
            className={`w-full py-4 rounded-lg font-medium text-sm transition-all focus:outline-none flex justify-center items-center gap-2
              ${isScraping 
                ? 'bg-slate-100 cursor-not-allowed text-slate-400 border border-slate-200' 
                : 'bg-blue-800 text-white hover:bg-blue-900 shadow-md hover:shadow-lg active:scale-[0.98]'}`}
          >
            {isScraping ? (
              <>
                 <svg className="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                Locate Prospects
              </>
            )}
          </button>
        </div>
      </div>

      {/* RIGHT SIDE: Terminal / Output */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 p-4 md:p-8">
        
        {/* Status Bar */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Live Extraction Feed
          </h2>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
             <span className="text-xs font-medium text-slate-500">Status:</span>
             {isScraping ? (
               <span className="flex items-center gap-1.5 text-xs font-bold text-blue-600">
                 <span className="relative flex h-2 w-2">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                 </span>
                 Extracting
               </span>
             ) : (
               <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                 <span className="h-2 w-2 rounded-full bg-slate-300"></span>
                 Idle
               </span>
             )}
          </div>
        </div>

        {/* Console Box */}
        <div className="flex-1 bg-[#1e293b] rounded-xl shadow-lg border border-slate-700/50 flex flex-col overflow-hidden relative">
          
          {/* Mac-style Window header */}
          <div className="bg-[#0f172a] px-4 py-3 flex items-center shrink-0 border-b border-white/5">
            <div className="flex space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <div className="mx-auto text-[11px] font-mono text-slate-500 select-none">puppeteer-engine</div>
          </div>
          
          {/* Logs Area */}
          {logs.length > 0 ? (
            <div className="flex-1 overflow-y-auto p-5 font-mono text-[13px] text-green-400 leading-relaxed scroll-smooth">
              {logs.map((log, index) => {
                // Formatting specific keywords for better terminal reality
                const isError = log.includes('❌') || log.includes('Error');
                const isSuccess = log.includes('✅') || log.includes('DONE');
                const isWarn = log.includes('⚠️');
                const isHeader = log.includes('===') || log.includes('---');
                
                let textColor = "text-green-400";
                if (isError) textColor = "text-red-400";
                else if (isWarn) textColor = "text-yellow-400";
                else if (isSuccess) textColor = "text-emerald-300 font-semibold";
                else if (isHeader) textColor = "text-blue-300";

                return (
                  <div key={index} className={`mb-1 opacity-90 ${textColor}`}>
                    <span className="text-slate-600 mr-3 select-none text-[10px]">➜</span>
                    {log}
                  </div>
                );
              })}
              <div ref={logEndRef} className="h-4" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500/50 p-6 text-center select-none">
              <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
              <p className="text-sm font-medium tracking-wide">SYSTEM READY</p>
              <p className="text-xs mt-1">Awaiting target keywords to commence extraction.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default App;
