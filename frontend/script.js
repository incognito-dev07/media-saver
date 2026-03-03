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

window.addEventListener('load', async () => {
  await checkLimits();
  await wakeUpServer();
});

function clearInput() {
  urlInput.value = '';
  clearBtn.style.display = 'none';
  urlInput.focus();
}

// Wake up server on page load
async function wakeUpServer() {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/ping`, {}, 5000);
    if (response.ok) {
      console.log('Server is awake');
    }
  } catch (error) {
    console.log('Server is sleeping, will wake on first request');
  }
}

// Fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Fetch with retry (for cold starts)
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (i > 0) {
        showStatus(`Waking up server... Attempt ${i + 1}/${maxRetries}`, 'processing');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      const response = await fetchWithTimeout(url, options, 30000);
      return response;
      
    } catch (error) {
      console.log(`Attempt ${i + 1} failed:`, error.message);
      if (i === maxRetries - 1) throw error;
    }
  }
}

async function checkLimits() {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/limits/${userId}`, {}, 5000);
    if (response.ok) {
      const data = await response.json();
      remainingSpan.textContent = data.remaining;
    }
  } catch (error) {
    console.error('Failed to check limits:', error);
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
    // Use retry mechanism for the first request (handles cold start)
    const response = await fetchWithRetry(`${API_BASE_URL}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        url: url, 
        userId: userId 
      })
    }, 3);

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
    } else {
      setTimeout(() => {
        handleDownloadComplete({
          status: 'completed',
          file: { title: 'Video ready for download' },
          downloadId: 'latest'
        });
      }, 5000);
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      showStatus('Server is taking too long to respond. Please try again.', 'error');
    } else {
      showStatus('Network error. Please check your connection.', 'error');
    }
    resetDownloadButton();
  }
}

function pollDownloadStatus() {
  if (!currentDownloadId) return;

  const maxAttempts = 45;
  let attempts = 0;

  pollInterval = setInterval(async () => {
    attempts++;
    
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/status/${currentDownloadId}`, {}, 10000);
      const status = await response.json();

      if (status.status === 'completed') {
        clearInterval(pollInterval);
        pollInterval = null;
        handleDownloadComplete(status);
      } else if (status.status === 'failed') {
        clearInterval(pollInterval);
        pollInterval = null;
        showStatus(status.error || 'Download failed', 'error');
        resetDownloadButton();
      } else if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        pollInterval = null;
        showStatus('Download timeout. Please try again.', 'error');
        resetDownloadButton();
      } else {
        const progress = status.progress || Math.min(30 + (attempts * 1.5), 90);
        showStatus(`Downloading... ${Math.round(progress)}%`, 'processing');
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
  
  downloadLink.onclick = async (e) => {
    e.preventDefault();
    downloadLink.innerHTML = '<i class="fas fa-spinner fa-pulse"></i><span>Preparing...</span>';
    
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${downloadId}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      downloadLink.innerHTML = '<i class="fas fa-cloud-download-alt"></i><span>Save Video</span>';
      
    } catch (error) {
      console.error('Download failed:', error);
      downloadLink.innerHTML = '<i class="fas fa-cloud-download-alt"></i><span>Save Video</span>';
      window.open(fileUrl, '_blank');
    }
  };
  
  resetDownloadButton();
  
  const current = parseInt(remainingSpan.textContent);
  remainingSpan.textContent = Math.max(0, current - 1);
  
  currentDownloadId = null;
}

function showStatus(message, type) {
  statusDiv.classList.remove('hidden', 'error', 'success', 'processing');
  statusDiv.classList.add(type);
  
  if (type === 'processing') {
    statusDiv.innerHTML = `<i class="fas fa-spinner fa-pulse"></i><span id="statusMessage">${message}</span>`;
  } else if (type === 'error') {
    statusDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i><span id="statusMessage">${message}</span>`;
  } else if (type === 'success') {
    statusDiv.innerHTML = `<i class="fas fa-check-circle"></i><span id="statusMessage">${message}</span>`;
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