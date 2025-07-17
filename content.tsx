import React, { useState } from "react";





const WebContentReader = () => {
  const [content, setContent] = useState("");
  const [showReader, setShowReader] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [aiText, setAiText] = useState("");
  const [loading, setLoading] = useState(false);
  // Remove draggable state
  // Auth state
  const [jwt, setJwt] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string>("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  // Extract and clean main readable content (max coverage)
  const getCleanBodyText = () => {
    const bodyClone = document.body.cloneNode(true) as HTMLElement;
    bodyClone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
    return bodyClone.textContent || "";
  };

  // Simple preprocessing: remove duplicate lines and extra whitespace
  const preprocessContent = (raw: string) => {
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter((line, idx, arr) => line && arr.indexOf(line) === idx)
      .join('\n');
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
    try {
      // Get current page information
      const currentUrl = window.location.href;
      const pageTitle = document.title;
      const sourceDomain = window.location.hostname;
      
      // Prepare content queue request
      const queueRequest = {
        user_id: 3, // Use the default extension user we created
        url: currentUrl,
        title: pageTitle,
        content: content,
        content_type: "full_page", // or "selected_text" if you want to distinguish
        source_domain: sourceDomain,
        priority: 1
      };
      
      const response = await fetch("http://localhost:8000/api/content/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queueRequest)
      });
      
      if (response.ok) {
        const data = await response.json();
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
        const errorData = await response.json();
        setAiResponse(`❌ Error adding to queue: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (e) {
      setAiResponse(`❌ Error connecting to index API: ${e.message}`);
    }
    setLoading(false);
  };

  const handleViewQueue = async () => {
    setLoading(true);
    setAiResponse("");
    try {
      const response = await fetch("http://localhost:8000/api/content/queue?user_id=3", {
        method: "GET",
        headers: { "Content-Type": "application/json" }
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
        const errorData = await response.json();
        setAiResponse(`❌ Error fetching queue: ${errorData.detail || 'Unknown error'}`);
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
      const response = await fetch("http://localhost:8000/query_with_ai", {
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

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const response = await fetch("http://localhost:8000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginForm.username, password: loginForm.password })
      });
      if (!response.ok) {
        setLoginError("Invalid credentials");
        setLoginLoading(false);
        return;
      }
      const data = await response.json();
      setJwt(data.access_token);
      setUserId(data.user_id?.toString() || "");
      setLoginError("");
    } catch (err) {
      setLoginError("Login failed");
    }
    setLoginLoading(false);
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
    <div style={{ position: "fixed", top: 70, right: 24, zIndex: 99999, fontFamily: 'Segoe UI, Arial, sans-serif', background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.13)', maxWidth: 480, minWidth: 320, maxHeight: 600, overflow: 'hidden', border: '1px solid #e0e0e0', padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1976d2', color: 'white', borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: '10px 16px', fontWeight: 600, userSelect: 'none' }}>
        <span>AI Reader</span>
        <button
          style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 20, fontWeight: 700, cursor: 'pointer', marginLeft: 8, lineHeight: 1 }}
          onClick={e => { e.stopPropagation(); setShowReader(false); }}
          title="Close"
        >&#10005;</button>
      </div>
      <div style={{ padding: 16, overflow: 'auto', maxHeight: 540 }}>
        {/* Login form if not logged in */}
        {false && (!jwt || !userId ? (
          <form onSubmit={handleLogin} style={{ marginBottom: 16, background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <input
                type="text"
                placeholder="Username"
                value={loginForm.username}
                onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
                style={{ width: '48%', marginRight: 8, padding: 6, borderRadius: 4, border: '1px solid #ccc' }}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                style={{ width: '48%', padding: 6, borderRadius: 4, border: '1px solid #ccc' }}
                required
              />
            </div>
            <button type="submit" style={{ background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, padding: '6px 18px', fontWeight: 500, cursor: loginLoading ? 'not-allowed' : 'pointer', opacity: loginLoading ? 0.7 : 1 }} disabled={loginLoading}>
              {loginLoading ? 'Logging in...' : 'Login'}
            </button>
            {loginError && <span style={{ color: 'red', marginLeft: 12 }}>{loginError}</span>}
          </form>
        ) : (
          <div style={{ marginBottom: 12, color: '#388e3c', fontWeight: 500, fontSize: 14 }}>
            Logged in as <span style={{ fontWeight: 700 }}>{loginForm.username}</span> (User ID: {userId})
            <button style={{ marginLeft: 16, background: '#e53935', color: 'white', border: 'none', borderRadius: 4, padding: '2px 10px', fontSize: 12, cursor: 'pointer' }} onClick={() => { setJwt(null); setUserId(null); setLoginForm({ username: '', password: '' }); }}>Logout</button>
          </div>
        ))}
        {/* ...existing code... */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#1976d2', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }} onClick={handleReadContent}>Read Whole Page</button>
        <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#43a047', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }} onClick={handleReadSelectedContent}>Read Selected Content</button>
        <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#ff9800', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }} onClick={handleCleanContent}>Clean Content</button>
        <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#e0e0e0', color: '#333', border: 'none', fontWeight: 500, cursor: 'pointer' }} onClick={() => setShowReader(false)}>Hide Reader</button>
      </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#43a047', color: 'white', border: 'none', fontWeight: 500, cursor: content && !loading ? 'pointer' : 'not-allowed', opacity: content && !loading ? 1 : 0.6 }} onClick={handleSendToIndex} disabled={!content || loading}>
          {loading ? "Sending..." : "Send to Index"}
        </button>
        <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#2196f3', color: 'white', border: 'none', fontWeight: 500, cursor: !loading ? 'pointer' : 'not-allowed', opacity: !loading ? 1 : 0.6 }} onClick={handleViewQueue} disabled={loading}>
          {loading ? "Loading..." : "View Queue"}
        </button>
      </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#ff9800', color: 'white', border: 'none', fontWeight: 500, cursor: content && !loading ? 'pointer' : 'not-allowed', opacity: content && !loading ? 1 : 0.6 }} onClick={handleReplyWithAI} disabled={!content || loading}>
          {loading ? "Replying..." : "Reply with AI"}
        </button>
      </div>
        <div style={{ fontSize: 13, marginTop: 8, background: '#fff', borderRadius: 8, padding: 10, minHeight: 80, maxHeight: 220, overflow: 'auto', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {content ? <><b>Extracted Content:</b><br />{content}</> : <span style={{ color: '#aaa' }}>No content extracted yet.</span>}
      </div>
        <div style={{ fontSize: 13, marginTop: 12, color: "#1976d2", background: '#e3f2fd', borderRadius: 8, padding: 10, minHeight: 40, maxHeight: 120, overflow: 'auto' }}>
        {aiResponse ? <><b>API/AI Response:</b><br />{aiResponse}</> : null}
      </div>
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
      </div>
    </div>
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