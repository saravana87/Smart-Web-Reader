import React, { useState } from "react";





const WebContentReader = () => {
  // Add CSS animation for notifications
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  const [content, setContent] = useState("");
  const [showReader, setShowReader] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [aiText, setAiText] = useState("");
  const [loading, setLoading] = useState(false);
  // API Key state
  const [apiKey, setApiKey] = useState<string>("");
  const [apiUrl, setApiUrl] = useState<string>("http://localhost:8000");
  const [showSettings, setShowSettings] = useState(false);
  // Remove old auth state that's not being used
  const [loginError, setLoginError] = useState<string>("");
  
  // Indexer Mode state
  const [indexerMode, setIndexerMode] = useState<boolean>(false);
  const [autoIndexTimer, setAutoIndexTimer] = useState<NodeJS.Timeout | null>(null);
  
  // Notification state
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info', show: boolean}>({
    message: '', type: 'info', show: false
  });
  const [indexedCount, setIndexedCount] = useState<number>(0);
  const [sessionStats, setSessionStats] = useState<{
    manual: number,
    auto: number,
    duplicates: number,
    errors: number
  }>({ manual: 0, auto: 0, duplicates: 0, errors: 0 });

  // Load API key from storage on component mount
  React.useEffect(() => {
    const loadApiSettings = async () => {
      try {
        // Check if chrome.storage is available
        if (typeof chrome === 'undefined' || !chrome.storage) {
          console.log('Chrome storage API not available');
          setShowSettings(true);
          return;
        }
        
        const result = await chrome.storage.local.get(['aiReaderApiKey', 'aiReaderApiUrl', 'indexerModeEnabled']);
        
        // Load API URL (default to localhost if not set)
        if (result.aiReaderApiUrl) {
          setApiUrl(result.aiReaderApiUrl);
        }
        
        // Load API key
        if (result.aiReaderApiKey) {
          setApiKey(result.aiReaderApiKey);
          setShowSettings(false);
          console.log("API settings loaded successfully");
        } else {
          setShowSettings(true); // Show settings if no API key
          console.log("No API key found in storage");
        }
        
        // Load indexer mode setting
        if (result.indexerModeEnabled !== undefined) {
          setIndexerMode(result.indexerModeEnabled);
        }
        
        // Load session stats
        if (result.sessionStats) {
          setSessionStats(result.sessionStats);
        }
        if (result.indexedCount) {
          setIndexedCount(result.indexedCount);
        }
      } catch (error) {
        console.error('Error loading API settings:', error);
        setShowSettings(true);
      }
    };
    loadApiSettings();
  }, []);

  // Notification helper functions
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) => {
    setNotification({ message, type, show: true });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, duration);
  };

  const updateStats = async (type: 'manual' | 'auto' | 'duplicate' | 'error') => {
    const newStats = { ...sessionStats };
    if (type === 'duplicate') {
      newStats.duplicates++;
    } else if (type === 'error') {
      newStats.errors++;
    } else {
      newStats[type]++;
      setIndexedCount(prev => prev + 1);
    }
    
    setSessionStats(newStats);
    
    // Save to storage
    try {
      await chrome.storage.local.set({ 
        sessionStats: newStats,
        indexedCount: type !== 'duplicate' && type !== 'error' ? indexedCount + 1 : indexedCount
      });
    } catch (error) {
      console.error('Failed to save stats:', error);
    }
  };

  // Save API key to storage
  const saveApiKey = async (key: string) => {
    try {
      await chrome.storage.local.set({ aiReaderApiKey: key });
      setApiKey(key);
      setShowSettings(false);
      setLoginError("");
    } catch (error) {
      setLoginError("Failed to save API key");
    }
  };

  // Toggle Indexer Mode
  const toggleIndexerMode = async (enabled: boolean) => {
    try {
      await chrome.storage.local.set({ indexerModeEnabled: enabled });
      setIndexerMode(enabled);
      
      if (enabled) {
        // Start automatic indexing after 10 seconds of staying on page
        startAutoIndexing();
      } else {
        // Stop automatic indexing
        stopAutoIndexing();
      }
    } catch (error) {
      console.error("Failed to save indexer mode setting:", error);
    }
  };

  // Start automatic indexing timer
  const startAutoIndexing = () => {
    stopAutoIndexing(); // Clear any existing timer
    
    const timer = setTimeout(() => {
      if (indexerMode && apiKey) {
        autoIndexCurrentPage();
      }
    }, 10000); // Auto-index after 10 seconds
    
    setAutoIndexTimer(timer);
  };

  // Stop automatic indexing timer
  const stopAutoIndexing = () => {
    if (autoIndexTimer) {
      clearTimeout(autoIndexTimer);
      setAutoIndexTimer(null);
    }
  };

  // Automatically index current page
  const autoIndexCurrentPage = async () => {
    try {
      const rawText = getCleanBodyText();
      if (!rawText.trim() || rawText.length < 100) {
        return; // Skip pages with minimal content
      }

      // Clean the content properly using the same preprocessing as manual capture
      const cleanText = preprocessContent(rawText);
      if (!cleanText.trim() || cleanText.length < 50) {
        return; // Skip if cleaning resulted in minimal content
      }

      const currentUrl = window.location.href;
      const pageTitle = document.title;
      const sourceDomain = window.location.hostname;

      // Enhanced metadata extraction for auto-indexing
      const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || pageTitle;
      const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || 
                             document.querySelector('meta[property="og:description"]')?.getAttribute('content');
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || currentUrl;

      const queueRequest = {
        url: currentUrl,
        title: pageTitle,
        content: cleanText,
        content_type: "full_page",
        source_domain: sourceDomain,
        priority: 1,
        // Enhanced fields
        canonical_url: canonicalUrl,
        meta_title: metaTitle,
        meta_description: metaDescription,
        og_image: ogImage,
        capture_trigger: "auto",
        reading_time_minutes: Math.ceil(cleanText.split(' ').length / 200), // Estimate reading time
        time_spent_seconds: 10 // Since we waited 10 seconds
      };

      const response = await fetch(`${apiUrl}/api/content/queue`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(queueRequest)
      });

      if (response.ok) {
        const data = await response.json();
        
        // Check if it was a duplicate (same ID returned) or new content
        const isDuplicate = data.created_at && new Date(data.created_at) < new Date(Date.now() - 60000); // If created more than 1 min ago
        
        if (isDuplicate) {
          await updateStats('duplicate');
          showNotification(`🔄 Page already indexed: ${sourceDomain}`, 'info', 2000);
        } else {
          await updateStats('auto');
          showNotification(`✅ Auto-indexed: ${sourceDomain} (${indexedCount + 1} total)`, 'success', 3000);
        }
        
        console.log("✅ Page auto-indexed successfully");
      } else {
        await updateStats('error');
        showNotification(`❌ Auto-index failed: ${sourceDomain}`, 'error', 3000);
      }
    } catch (error) {
      await updateStats('error');
      showNotification(`❌ Auto-index error: ${window.location.hostname}`, 'error', 3000);
      console.error("Auto-indexing failed:", error);
    }
  };

  // Restart auto-indexing when page changes or indexer mode is enabled
  React.useEffect(() => {
    if (indexerMode && apiKey) {
      startAutoIndexing();
    } else {
      stopAutoIndexing();
    }
    
    return () => stopAutoIndexing(); // Cleanup on unmount
  }, [indexerMode, apiKey]);

  // Listen for URL changes to restart auto-indexing
  React.useEffect(() => {
    let lastUrl = window.location.href;
    
    const checkUrlChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        if (indexerMode && apiKey) {
          startAutoIndexing(); // Restart timer for new page
        }
      }
    };
    
    const observer = new MutationObserver(checkUrlChange);
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => observer.disconnect();
  }, [indexerMode, apiKey]);

  // Extract and clean main readable content (enhanced cleaning)
  const getCleanBodyText = () => {
    const bodyClone = document.body.cloneNode(true) as HTMLElement;
    
    // Remove script, style, and other non-content elements
    bodyClone.querySelectorAll(`
      script, style, noscript, iframe, object, embed,
      nav, header, footer, aside, 
      .ad, .ads, .advertisement, .sidebar, .menu, .navigation,
      .cookie-banner, .popup, .modal, .overlay,
      .share-buttons, .social-buttons, .comments,
      [class*="ad-"], [class*="ads-"], [id*="ad-"], [id*="ads-"]
    `).forEach(el => el.remove());
    
    // Remove elements with common ad/navigation attributes
    bodyClone.querySelectorAll('[role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"]')
      .forEach(el => el.remove());
    
    return bodyClone.textContent || "";
  };

  // Enhanced preprocessing: remove duplicate lines, extra whitespace, and common noise
  const preprocessContent = (raw: string) => {
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter((line, idx, arr) => {
        // Remove empty lines
        if (!line) return false;
        
        // Remove very short lines (likely navigation/UI elements)
        if (line.length < 3) return false;
        
        // Remove duplicate lines
        if (arr.indexOf(line) !== idx) return false;
        
        // Remove common navigation patterns
        const skipPatterns = [
          /^(skip to|menu|navigation|search|login|register|home|about|contact)$/i,
          /^(click here|read more|continue reading|share|like|comment)$/i,
          /^(cookie|privacy|terms|accept|decline)$/i,
          /^\d+$/, // Pure numbers (likely page numbers/counters)
          /^[^\w\s]{3,}$/ // Lines with only special characters
        ];
        
        if (skipPatterns.some(pattern => pattern.test(line))) return false;
        
        return true;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newline
      .trim();
  };

  // Read only the selected content from the page
  const handleReadSelectedContent = () => {
    const selectedText = window.getSelection()?.toString() || "";
    if (selectedText.trim()) {
      const processed = preprocessContent(selectedText);
      setContent(processed);
    } else {
      setContent("No text selected. Please select some text on the page.");
    }
  };

  // Clean the current content (remove duplicate lines, whitespace)
  const handleCleanContent = () => {
    if (content.trim()) {
      const processed = preprocessContent(content);
      setContent(processed);
    } else {
      setContent("No content to clean. Use another button first.");
    }
  };

  const handleReadContent = () => {
    const cleanText = getCleanBodyText();
    setContent(cleanText);
  };

  const handleSendToIndex = async () => {
    setLoading(true);
    setAiResponse("");
    
    // Check if API key is provided
    if (!apiKey.trim()) {
      setAiResponse("❌ Please set your API key in settings first!");
      setLoading(false);
      return;
    }
    
    try {
      // Get current page information
      const currentUrl = window.location.href;
      const pageTitle = document.title;
      const sourceDomain = window.location.hostname;
      
      // Enhanced metadata extraction
      const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || pageTitle;
      const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || 
                             document.querySelector('meta[property="og:description"]')?.getAttribute('content');
      const metaKeywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content');
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || currentUrl;
      
      // Ensure content is properly cleaned before sending
      const cleanedContent = preprocessContent(content);
      if (!cleanedContent.trim()) {
        setAiResponse("❌ No valid content to index after cleaning.");
        setLoading(false);
        return;
      }
      
      // Prepare enhanced content queue request
      const queueRequest = {
        url: currentUrl,
        title: pageTitle,
        content: cleanedContent, // Use cleaned content
        content_type: content === getCleanBodyText() ? "full_page" : "selected_text",
        source_domain: sourceDomain,
        priority: 1,
        // Enhanced fields
        canonical_url: canonicalUrl,
        meta_title: metaTitle,
        meta_description: metaDescription,
        meta_keywords: metaKeywords,
        og_image: ogImage,
        capture_trigger: "manual",
        reading_time_minutes: Math.ceil(cleanedContent.split(' ').length / 200), // Use cleaned content for calculation
        time_spent_seconds: 0 // Manual capture
      };
      
      const response = await fetch(`${apiUrl}/api/content/queue`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(queueRequest)
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if it was a duplicate by comparing timestamps
        const isDuplicate = data.created_at && new Date(data.created_at) < new Date(Date.now() - 60000);
        
        if (isDuplicate) {
          await updateStats('duplicate');
          showNotification(`🔄 Content already indexed`, 'info', 3000);
        } else {
          await updateStats('manual');
          showNotification(`✅ Content indexed manually (${indexedCount + 1} total)`, 'success', 3000);
        }
        
        setAiResponse(
          `✅ Content added to index queue successfully!\n\n` +
          `Queue ID: ${data.id}\n` +
          `Status: ${data.status}\n` +
          `URL: ${data.url}\n` +
          `Title: ${data.title || 'N/A'}\n` +
          `Word Count: ${data.word_count}\n` +
          `Priority: ${data.priority}\n\n` +
          `Your content will be processed and indexed in the background.`
        );
      } else {
        await updateStats('error');
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          showNotification(`❌ Authentication failed`, 'error', 3000);
          setAiResponse(`❌ Authentication failed: Invalid API key. Please check your API key in settings.`);
        } else {
          showNotification(`❌ Indexing failed`, 'error', 3000);
          setAiResponse(`❌ Error adding to queue: ${errorData.detail || 'Unknown error'}`);
        }
      }
    } catch (e) {
      await updateStats('error');
      showNotification(`❌ Connection error`, 'error', 3000);
      setAiResponse(`❌ Error connecting to index API: ${e.message}`);
    }
    setLoading(false);
  };

  const handleViewQueue = async () => {
    setLoading(true);
    setAiResponse("");
    
    // Check if API key is provided
    if (!apiKey.trim()) {
      setAiResponse("❌ Please set your API key in settings first!");
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch(`${apiUrl}/api/content/queue`, {
        method: "GET",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        }
      });
      
      if (response.ok) {
        const queueItems = await response.json();
        if (queueItems.length === 0) {
          setAiResponse("📭 Your content queue is empty. Use 'Send to Index' to add content!");
        } else {
          let queueSummary = `📋 Content Queue (${queueItems.length} items):\n\n`;
          queueItems.forEach((item, index) => {
            queueSummary += `${index + 1}. [${item.status.toUpperCase()}] ${item.title || 'Untitled'}\n`;
            queueSummary += `   URL: ${item.url}\n`;
            queueSummary += `   Words: ${item.word_count} | Priority: ${item.priority}\n`;
            queueSummary += `   Added: ${new Date(item.created_at).toLocaleString()}\n`;
            if (item.processed_at) {
              queueSummary += `   Processed: ${new Date(item.processed_at).toLocaleString()}\n`;
            }
            queueSummary += "\n";
          });
          setAiResponse(queueSummary);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          setAiResponse(`❌ Authentication failed: Invalid API key. Please check your API key in settings.`);
        } else {
          setAiResponse(`❌ Error fetching queue: ${errorData.detail || 'Unknown error'}`);
        }
      }
    } catch (e) {
      setAiResponse(`❌ Error connecting to queue API: ${e.message}`);
    }
    setLoading(false);
  };

  const handleReplyWithAI = async () => {
    setLoading(true);
    setAiResponse("");
    setAiText("");
    try {
      // Use a default user id (e.g., "1")
      const formData = new FormData();
      formData.append("user_id", "1");
      formData.append("user_input", content);
      const response = await fetch(`${apiUrl}/query_with_ai`, {
        method: "POST",
        body: formData
      });
      let data;
      try {
        data = await response.json();
      } catch {
        data = { ai_response: "[Placeholder] AI response for: " + content.slice(0, 100) };
      }
      setAiText(data.ai_response || "No response");
    } catch (e) {
      setAiText("Error contacting AI API");
    }
    setLoading(false);
  };

  // API key handler
  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    // Save API key to Chrome storage
    chrome.storage.local.set({ aiReaderApiKey: value });
  };

  // Settings management
  const validateApiKey = async (key: string, url: string) => {
    try {
      const response = await fetch(`${url}/api/validate-key`, {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return { valid: true, user: data.user || null };
      } else {
        return { valid: false, error: response.status === 401 ? "Invalid API key" : "API validation failed" };
      }
    } catch (error) {
      return { valid: false, error: `Connection failed: ${error.message}` };
    }
  };

  const handleSaveApiKey = async (key: string, url: string) => {
    if (!key.trim()) {
      setLoginError("Please enter a valid API key");
      return;
    }
    
    if (!url.trim()) {
      setLoginError("Please enter a valid API URL");
      return;
    }
    
    try {
      // Check if chrome.storage is available
      if (typeof chrome === 'undefined' || !chrome.storage) {
        setLoginError("Chrome storage API not available. Please ensure this is running as an extension.");
        return;
      }
      
      setLoginError("Validating API key...");
      
      // Validate API key with the backend
      const validation = await validateApiKey(key.trim(), url.trim());
      
      if (!validation.valid) {
        setLoginError(validation.error);
        return;
      }
      
      // Save both API key and URL
      await chrome.storage.local.set({ 
        aiReaderApiKey: key.trim(),
        aiReaderApiUrl: url.trim()
      });
      
      setApiKey(key.trim());
      setApiUrl(url.trim());
      setShowSettings(false);
      setLoginError("");
      console.log("API settings saved and validated successfully");
      
      // Show success message briefly
      setLoginError(`✅ API key validated! Connected as: ${validation.user?.username || 'User'}`);
      setTimeout(() => setLoginError(""), 3000);
      
    } catch (error) {
      console.error("Error saving API settings:", error);
      setLoginError(`Failed to save API settings: ${error.message || 'Unknown error'}`);
    }
  };

  const handleClearApiKey = async () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        setLoginError("Chrome storage API not available. Please ensure this is running as an extension.");
        return;
      }
      
      await chrome.storage.local.remove(['aiReaderApiKey', 'aiReaderApiUrl']);
      setApiKey("");
      setApiUrl("http://localhost:8000"); // Reset to default
      setShowSettings(true);
      setLoginError("");
      console.log("API settings cleared successfully");
    } catch (error) {
      console.error("Error clearing API settings:", error);
      setLoginError(`Failed to clear API settings: ${error.message || 'Unknown error'}`);
    }
  };

  // Floating button and UI

  // Draggable floating button

  React.useEffect(() => {
    let wrapper = document.getElementById('web-content-reader-float-btn-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'web-content-reader-float-btn-wrapper';
      Object.assign(wrapper.style, {
        position: 'fixed',
        zIndex: 99999,
        top: '24px',
        right: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      });
      document.body.appendChild(wrapper);
    }
    // Remove any children
    while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);

    // AI Reader button
    const btn = document.createElement('button');
    btn.id = 'web-content-reader-float-btn';
    btn.textContent = showReader ? 'Hide AI Reader' : 'AI Reader';
    Object.assign(btn.style, {
      padding: '12px 20px',
      borderRadius: '8px',
      background: '#1976d2',
      color: 'white',
      border: 'none',
      fontWeight: 600,
      fontSize: '16px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.13)',
      cursor: 'pointer',
      transition: 'background 0.2s',
    });
    btn.onclick = null;
    btn.addEventListener('click', () => {
      setShowReader((v) => !v);
    });
    wrapper.appendChild(btn);

    // Close (X) icon
    const closeBtn = document.createElement('button');
    closeBtn.id = 'web-content-reader-float-btn-close';
    closeBtn.innerHTML = '&#10005;';
    Object.assign(closeBtn.style, {
      background: 'transparent',
      border: 'none',
      color: '#1976d2',
      fontSize: '22px',
      fontWeight: 700,
      cursor: 'pointer',
      marginLeft: '2px',
      lineHeight: 1,
      padding: '0 6px',
    });
    closeBtn.onclick = null;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrapper.style.display = 'none';
      setShowReader(false);
    });
    wrapper.appendChild(closeBtn);

    return () => {
      // Clean up
      if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    };
  }, [showReader]);



  // Always render null (UI is handled by floating button)
  if (!showReader) {
    return null;
  }




  return (
    <>
      {/* Notification Toast */}
      {notification.show && (
        <div style={{
          position: 'fixed',
          top: 10,
          right: 24,
          zIndex: 100000,
          background: notification.type === 'success' ? '#4caf50' : notification.type === 'error' ? '#f44336' : '#2196f3',
          color: 'white',
          padding: '12px 16px',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: 14,
          fontWeight: 500,
          maxWidth: 320,
          animation: 'slideIn 0.3s ease-out'
        }}>
          {notification.message}
        </div>
      )}
      
      <div style={{ position: "fixed", top: 70, right: 24, zIndex: 99999, fontFamily: 'Segoe UI, Arial, sans-serif', background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.13)', maxWidth: 480, minWidth: 320, maxHeight: 600, overflow: 'hidden', border: '1px solid #e0e0e0', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1976d2', color: 'white', borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: '10px 16px', fontWeight: 600, userSelect: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>AI Reader</span>
            {indexedCount > 0 && (
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: 10, fontSize: 12 }}>
                {indexedCount}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer', borderRadius: 4, padding: '4px 8px' }}
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >⚙️</button>
            <button
              style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 20, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}
              onClick={e => { e.stopPropagation(); setShowReader(false); }}
              title="Close"
            >&#10005;</button>
          </div>
        </div>
      <div style={{ padding: 16, overflow: 'auto', maxHeight: 540 }}>
        
        {/* Settings Panel */}
        {showSettings ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#333', fontSize: 16 }}>API Settings</h3>
              
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#333', fontSize: 14 }}>API URL:</label>
                <input
                  type="text"
                  placeholder="http://localhost:8000"
                  value={apiUrl}
                  onChange={e => setApiUrl(e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', boxSizing: 'border-box', fontSize: 14, marginBottom: 8 }}
                />
              </div>
              
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#333', fontSize: 14 }}>API Key:</label>
                <input
                  type="password"
                  placeholder="Enter your API key"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd', boxSizing: 'border-box', fontSize: 14 }}
                />
              </div>
              
              {loginError && (
                <div style={{ 
                  color: loginError.startsWith('✅') ? '#2e7d32' : '#e53935', 
                  fontSize: 12, 
                  marginBottom: 12, 
                  padding: 8, 
                  background: loginError.startsWith('✅') ? '#e8f5e8' : '#ffebee', 
                  borderRadius: 4 
                }}>
                  {loginError}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ flex: 1, padding: '10px 16px', borderRadius: 6, background: '#43a047', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer', fontSize: 14 }}
                  onClick={() => handleSaveApiKey(apiKey, apiUrl)}
                >
                  Validate & Save
                </button>
                {(apiKey || apiUrl !== "http://localhost:8000") && (
                  <button
                    style={{ padding: '10px 16px', borderRadius: 6, background: '#e53935', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer', fontSize: 14 }}
                    onClick={handleClearApiKey}
                  >
                    Reset
                  </button>
                )}
              </div>
              
              <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.4 }}>
                💡 Default URL: <code style={{ background: '#e0e0e0', padding: '2px 4px', borderRadius: 2 }}>http://localhost:8000</code><br/>
                Test API key: <code style={{ background: '#e0e0e0', padding: '2px 4px', borderRadius: 2 }}>test_api_key_123</code>
              </div>
            </div>
          </div>
        ) : (
          /* Status Bar */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '8px 12px', background: apiKey ? '#e8f5e8' : '#fff3e0', borderRadius: 6, border: `1px solid ${apiKey ? '#c8e6c9' : '#ffcc02'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <span>{apiKey ? '✅' : '⚠️'}</span>
              <span style={{ color: apiKey ? '#2e7d32' : '#f57c00', fontWeight: 500 }}>
                {apiKey ? 'API Key Configured' : 'API Key Required'}
              </span>
            </div>
            <button
              style={{ background: 'transparent', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setShowSettings(true)}
            >
              Configure
            </button>
          </div>
        )}

        {/* Main Functionality - Only show if API key is configured and settings are hidden */}
        {apiKey && !showSettings && (
          <>
            {/* Content extraction buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#1976d2', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }} onClick={handleReadContent}>Read Whole Page</button>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#43a047', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }} onClick={handleReadSelectedContent}>Read Selected Content</button>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#ff9800', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }} onClick={handleCleanContent}>Clean Content</button>
            </div>
            
            {/* API operation buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#43a047', color: 'white', border: 'none', fontWeight: 500, cursor: content && !loading ? 'pointer' : 'not-allowed', opacity: content && !loading ? 1 : 0.6 }} onClick={handleSendToIndex} disabled={!content || loading}>
                {loading ? "Sending..." : "Send to Index"}
              </button>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#2196f3', color: 'white', border: 'none', fontWeight: 500, cursor: !loading ? 'pointer' : 'not-allowed', opacity: !loading ? 1 : 0.6 }} onClick={handleViewQueue} disabled={loading}>
                {loading ? "Loading..." : "View Queue"}
              </button>
            </div>
            
            {/* Indexer Mode Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '8px 12px', background: indexerMode ? '#e8f5e8' : '#f5f5f5', borderRadius: 6, border: `1px solid ${indexerMode ? '#c8e6c9' : '#e0e0e0'}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#333', marginBottom: 2 }}>
                  🤖 Indexer Mode
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {indexerMode ? 'Auto-capturing content after 10s on each page' : 'Manually capture content only'}
                </div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={indexerMode}
                  onChange={(e) => toggleIndexerMode(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: indexerMode ? '#43a047' : '#ccc',
                  borderRadius: 12,
                  transition: '0.2s',
                  cursor: 'pointer'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '',
                    height: 18,
                    width: 18,
                    left: indexerMode ? 23 : 3,
                    bottom: 3,
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                  }} />
                </span>
              </label>
            </div>
            
            {/* Session Stats */}
            {(sessionStats.manual > 0 || sessionStats.auto > 0 || sessionStats.duplicates > 0 || sessionStats.errors > 0) && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8f9fa', borderRadius: 6, border: '1px solid #e9ecef' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#495057', marginBottom: 4 }}>
                  📊 Session Stats
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6c757d' }}>
                  <span>✋ Manual: {sessionStats.manual}</span>
                  <span>🤖 Auto: {sessionStats.auto}</span>
                  <span>🔄 Duplicates: {sessionStats.duplicates}</span>
                  <span>❌ Errors: {sessionStats.errors}</span>
                </div>
              </div>
            )}
            
            {/* AI reply button */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#ff9800', color: 'white', border: 'none', fontWeight: 500, cursor: content && !loading ? 'pointer' : 'not-allowed', opacity: content && !loading ? 1 : 0.6 }} onClick={handleReplyWithAI} disabled={!content || loading}>
                {loading ? "Replying..." : "Reply with AI"}
              </button>
            </div>
            
            {/* Content display */}
            <div style={{ fontSize: 13, marginTop: 8, background: '#fff', borderRadius: 8, padding: 10, minHeight: 80, maxHeight: 220, overflow: 'auto', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              {content ? <><b>Extracted Content:</b><br />{content}</> : <span style={{ color: '#aaa' }}>No content extracted yet.</span>}
            </div>
            
            {/* API response display */}
            <div style={{ fontSize: 13, marginTop: 12, color: "#1976d2", background: '#e3f2fd', borderRadius: 8, padding: 10, minHeight: 40, maxHeight: 120, overflow: 'auto' }}>
              {aiResponse ? <><b>API/AI Response:</b><br />{aiResponse}</> : null}
            </div>
            
            {/* AI text display */}
            {aiText && (
              <div style={{ fontSize: 13, marginTop: 12, background: '#f9fbe7', borderRadius: 8, padding: 10, minHeight: 40, maxHeight: 180, overflow: 'auto', position: 'relative' }}>
                <b>AI Reply:</b>
                <textarea
                  style={{ width: '100%', minHeight: 60, maxHeight: 120, marginTop: 6, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, background: '#f9fbe7', border: '1px solid #e0e0e0', borderRadius: 6, padding: 8 }}
                  value={aiText}
                  readOnly
                />
                <button
                  style={{ position: 'absolute', top: 10, right: 10, background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
                  onClick={() => { navigator.clipboard.writeText(aiText); }}
                  title="Copy to clipboard"
                >Copy</button>
              </div>
            )}
          </>
        )}

        {/* Welcome message when no API key is configured */}
        {!apiKey && !showSettings && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#666' }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🔑</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#333' }}>Welcome to AI Reader</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, lineHeight: 1.4 }}>
              Please configure your API key to start using the extension features.
            </p>
            <button
              style={{ padding: '10px 20px', borderRadius: 6, background: '#1976d2', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }}
              onClick={() => setShowSettings(true)}
            >
              Configure API Key
            </button>
          </div>
        )}
      </div>
      </div>
    </>
  );

};

export default WebContentReader;

// Inject and render the component on every page (after component definition)
import ReactDOM from "react-dom/client";
const containerId = "web-content-reader-root";
let container = document.getElementById(containerId);
if (!container) {
  container = document.createElement("div");
  container.id = containerId;
  document.body.appendChild(container);
}
const root = ReactDOM.createRoot(container);
root.render(<WebContentReader />);


// Listen for messages from the popup and respond with selected text or page content
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelectedText") {
    sendResponse({ text: window.getSelection().toString() });
  } else if (request.action === "getPageContent") {
    // Remove scripts/styles/noscript and return text content
    const bodyClone = document.body.cloneNode(true) as HTMLElement;
    bodyClone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
    sendResponse({ text: bodyClone.textContent || "" });
  } else if (request.action === "showAIReader") {
    // Show the AI Reader modal
    const btn = document.getElementById('web-content-reader-float-btn');
    if (btn) {
      btn.click();
      sendResponse({ status: 'shown' });
    } else {
      sendResponse({ status: 'not_found' });
    }
  }
  // Return true to indicate async response if needed (not needed here)
  return false;
});