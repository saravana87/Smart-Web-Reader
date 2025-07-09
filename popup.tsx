import React from "react"

function sendMessageToContentScript(message) {
  return new Promise((resolve) => {
    if (chrome && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, message, resolve)
      })
    } else {
      resolve(undefined)
    }
  })
}

const IndexPopup = () => {
  const handleShowAIReader = async () => {
    await sendMessageToContentScript({ action: "showAIReader" })
    window.close()
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: 16, color: '#1976d2', textAlign: 'center', width: 320 }}>
      <b>AI Reader Extension</b>
      <div style={{ marginTop: 12, color: '#444', fontSize: 14 }}>
        This extension works automatically on every page.<br />
        Use the floating <b>AI Reader</b> button on the web page to extract and process content.
      </div>
      <button style={{ marginTop: 24, background: '#1976d2', color: 'white', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }} onClick={handleShowAIReader}>
        Show AI Reader
      </button>
    </div>
  );
}

export default IndexPopup
