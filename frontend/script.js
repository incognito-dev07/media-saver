// Configuration
const API_BASE_URL = 'https://media-downloader-7ovf.onrender.com'; // REPLACE WITH YOUR ACTUAL RENDER URL
let userId = localStorage.getItem('userId');

if (!userId) {
    userId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('userId', userId);
}

// DOM Elements
const urlInput = document.getElementById('urlInput');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result');
const videoTitle = document.getElementById('videoTitle');
const downloadLink = document.getElementById('downloadLink');
const newDownloadBtn = document.getElementById('newDownloadBtn');
const remainingSpan = document.getElementById('remaining');

let currentDownloadId = null;
let pollInterval = null;

// Event Listeners
downloadBtn.addEventListener('click', startDownload);
newDownloadBtn.addEventListener('click', resetForm);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startDownload();
});

// Load user limits on page load
window.addEventListener('load', checkLimits);

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

async function startDownload() {
    const url = urlInput.value.trim();
    
    if (!url) {
        showStatus('Please enter a URL', 'error');
        return;
    }

    // Validate URL format
    try {
        new URL(url);
    } catch {
        showStatus('Invalid URL format', 'error');
        return;
    }

    // Disable button during download
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Processing...';
    
    // Hide any previous results
    resultDiv.classList.add('hidden');
    showStatus('Starting download...', 'processing');

    // Clear any existing poll interval
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                url: url, 
                userId: userId 
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Download failed');
        }

        // Store download ID for status checking
        if (data.downloadId) {
            currentDownloadId = data.downloadId;
            showStatus('Processing video...', 'processing');
            // Start polling for status
            pollDownloadStatus();
        } else {
            // Fallback if no downloadId
            setTimeout(() => {
                handleDownloadComplete({
                    status: 'completed',
                    file: { title: 'Video ready for download' },
                    downloadId: 'latest'
                });
            }, 5000);
        }

    } catch (error) {
        showStatus(error.message, 'error');
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download';
    }
}

function pollDownloadStatus() {
    if (!currentDownloadId) return;

    const maxAttempts = 30; // 30 attempts * 2 seconds = 1 minute max
    let attempts = 0;

    pollInterval = setInterval(async () => {
        attempts++;
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/status/${currentDownloadId}`);
            const status = await response.json();

            if (status.status === 'completed') {
                clearInterval(pollInterval);
                pollInterval = null;
                handleDownloadComplete(status);
            } else if (status.status === 'failed') {
                clearInterval(pollInterval);
                pollInterval = null;
                showStatus(status.error || 'Download failed', 'error');
                downloadBtn.disabled = false;
                downloadBtn.textContent = 'Download';
            } else if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                pollInterval = null;
                // Try to download anyway
                handleDownloadComplete({
                    status: 'completed',
                    file: { title: 'Video ready for download' },
                    downloadId: currentDownloadId
                });
            } else {
                // Update progress message
                const progress = status.progress || Math.min(30 + (attempts * 2), 90);
                showStatus(`Downloading... ${progress}%`, 'processing');
            }
        } catch (error) {
            console.error('Polling error:', error);
            // Don't stop polling on network errors
        }
    }, 2000); // Poll every 2 seconds
}

function handleDownloadComplete(status) {
    showStatus('Download complete!', 'success');
    
    // Show result section
    resultDiv.classList.remove('hidden');
    videoTitle.textContent = status.file?.title || 'Video ready for download';
    
    const downloadId = status.downloadId || currentDownloadId;
    const fileUrl = `${API_BASE_URL}/api/file/${downloadId}`;
    
    // Clear previous onclick and set up new download handling
    downloadLink.onclick = null;
    downloadLink.href = '#';
    downloadLink.removeAttribute('target');
    downloadLink.removeAttribute('download');
    
    // Set up download button
    downloadLink.onclick = async (e) => {
        e.preventDefault();
        downloadLink.textContent = 'Preparing download...';
        
        try {
            // Fetch the file as blob
            const response = await fetch(fileUrl);
            
            if (!response.ok) {
                throw new Error('Download failed');
            }
            
            const blob = await response.blob();
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `video-${downloadId}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            downloadLink.textContent = 'Download Video';
            
        } catch (error) {
            console.error('Download failed:', error);
            downloadLink.textContent = 'Download Video';
            
            // Fallback: open in new tab
            if (confirm('Download failed. Open in new tab instead?')) {
                window.open(fileUrl, '_blank');
            }
        }
    };
    
    // Hide status
    statusDiv.classList.add('hidden');
    
    // Reset button
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
    
    // Update remaining limit
    const current = parseInt(remainingSpan.textContent);
    remainingSpan.textContent = Math.max(0, current - 1);
    
    // Clear current download ID
    currentDownloadId = null;
}

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.classList.remove('hidden');
}

function resetForm() {
    urlInput.value = '';
    resultDiv.classList.add('hidden');
    statusDiv.classList.add('hidden');
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
    currentDownloadId = null;
    
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

// Add error handling for failed image loads or other issues
window.addEventListener('error', (e) => {
    console.log('Caught error:', e.error);
});