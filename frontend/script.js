// Configuration
const API_BASE_URL = 'https://media-downloader-7ovf.onrender.com';
let userId = localStorage.getItem('userId');

if (!userId) {
  userId = 'user_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('userId', userId);
}

// DOM Elements
const urlInput = document.getElementById('urlInput');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');
const statusDiv = document.getElementById('status');
const statusMessage = document.getElementById('statusMessage');
const resultDiv = document.getElementById('result');
const videoTitle = document.getElementById('videoTitle');
const downloadLink = document.getElementById('downloadLink');
const newDownloadBtn = document.getElementById('newDownloadBtn');
const remainingSpan = document.getElementById('remaining');
const totalSpan = document.getElementById('total');

let currentDownloadId = null;
let pollInterval = null;

totalSpan.textContent = '15';

// Event Listeners
downloadBtn.addEventListener('click', startDownload);
newDownloadBtn.addEventListener('click', resetForm);
clearBtn.addEventListener('click', clearInput);

urlInput.addEventListener('input', () => {
  clearBtn.style.display = urlInput.value ? 'flex' : 'none';
});

urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startDownload();
});

window.addEventListener('load', checkLimits);

function clearInput() {
  urlInput.value = '';
  clearBtn.style.display = 'none';
  urlInput.focus();
}

async function checkLimits() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/limits/${userId}`);
    if (response.ok) {
      const data = await response.json();
      remainingSpan.textContent = data.remaining;
    }
  } catch (error) {
    console.error('Failed to check limits:', error);
  }
}

// Simple function with retry
async function fetchWithRetry(url, options, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === retries) throw error;
      // Wait 2 seconds before retry
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function startDownload() {
  const url = urlInput.value.trim();
  
  if (!url) {
    showStatus('Please enter a URL', 'error');
    return;
  }

  downloadBtn.disabled = true;
  downloadBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i><span>Processing...</span>';
  
  resultDiv.classList.add('hidden');
  showStatus('Validating URL...', 'processing');

  try {
    new URL(url);
  } catch {
    showStatus('Invalid URL format', 'error');
    resetDownloadButton();
    return;
  }

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  try {
    // Try with retry
    const response = await fetchWithRetry(`${API_BASE_URL}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, userId })
    }, 2);

    const data = await response.json();

    if (!response.ok) {
      showStatus(data.error || 'Download failed', 'error');
      resetDownloadButton();
      return;
    }

    if (data.downloadId) {
      currentDownloadId = data.downloadId;
      showStatus('Processing video...', 'processing');
      pollDownloadStatus();
    }

  } catch (error) {
    showStatus('Server not responding. Please try again.', 'error');
    resetDownloadButton();
  }
}

function pollDownloadStatus() {
  if (!currentDownloadId) return;

  pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/status/${currentDownloadId}`);
      const status = await response.json();

      if (status.status === 'completed') {
        clearInterval(pollInterval);
        handleDownloadComplete(status);
      } else if (status.status === 'failed') {
        clearInterval(pollInterval);
        showStatus(status.error || 'Download failed', 'error');
        resetDownloadButton();
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 2000);
}

function handleDownloadComplete(status) {
  statusDiv.classList.add('hidden');
  resultDiv.classList.remove('hidden');
  
  videoTitle.textContent = status.file?.title || 'Video ready for download';
  
  const downloadId = status.downloadId || currentDownloadId;
  const fileUrl = `${API_BASE_URL}/api/file/${downloadId}`;
  
  downloadLink.onclick = (e) => {
    e.preventDefault();
    window.open(fileUrl, '_blank');
  };
  
  resetDownloadButton();
  
  const current = parseInt(remainingSpan.textContent);
  remainingSpan.textContent = Math.max(0, current - 1);
  
  currentDownloadId = null;
}

function showStatus(message, type) {
  statusDiv.classList.remove('hidden', 'error', 'success', 'processing');
  statusDiv.classList.add(type);
  statusMessage.textContent = message;
  
  if (type === 'processing') {
    statusDiv.innerHTML = `<i class="fas fa-spinner fa-pulse"></i><span id="statusMessage">${message}</span>`;
  } else if (type === 'error') {
    statusDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i><span id="statusMessage">${message}</span>`;
  }
}

function resetDownloadButton() {
  downloadBtn.disabled = false;
  downloadBtn.innerHTML = '<i class="fas fa-download"></i><span>Download</span>';
}

function resetForm() {
  clearInput();
  resultDiv.classList.add('hidden');
  statusDiv.classList.add('hidden');
  resetDownloadButton();
  currentDownloadId = null;
  
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}