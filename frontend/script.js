// Configuration
const API_BASE_URL = 'https://media-downloader-7ovf.onrender.com'; // Replace with your actual Render URL
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
        }

        showStatus('Processing video...', 'processing');
        
        // Start polling for status
        pollDownloadStatus();

    } catch (error) {
        showStatus(error.message, 'error');
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download';
    }
}

async function pollDownloadStatus() {
    if (!currentDownloadId) {
        simulateCompletion();
        return;
    }

    const maxAttempts = 30; // 30 attempts * 2 seconds = 1 minute max
    let attempts = 0;

    const poll = setInterval(async () => {
        attempts++;
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/status/${currentDownloadId}`);
            const status = await response.json();

            if (status.status === 'completed') {
                clearInterval(poll);
                handleDownloadComplete(status);
            } else if (status.status === 'failed') {
                clearInterval(poll);
                showStatus(status.error || 'Download failed', 'error');
                downloadBtn.disabled = false;
                downloadBtn.textContent = 'Download';
            } else if (attempts >= maxAttempts) {
                clearInterval(poll);
                showStatus('Download timeout. Please try again.', 'error');
                downloadBtn.disabled = false;
                downloadBtn.textContent = 'Download';
            } else {
                // Update progress message
                showStatus(`Downloading... ${status.progress || 0}%`, 'processing');
            }
        } catch (error) {
            console.error('Polling error:', error);
            // Don't clear interval on network errors, just continue
        }
    }, 2000); // Poll every 2 seconds
}

function handleDownloadComplete(status) {
    showStatus('Download complete!', 'success');
    
    // Show result section
    resultDiv.classList.remove('hidden');
    videoTitle.textContent = status.file?.title || 'Video ready for download';
    
    // Set actual download link
    if (status.file?.filePath) {
        const filename = status.file.filePath.split('/').pop();
        downloadLink.href = `${API_BASE_URL}/api/file/${currentDownloadId}`;
        downloadLink.download = filename || 'video.mp4';
        downloadLink.target = '_blank';
    } else {
        // Fallback
        downloadLink.href = '#';
        downloadLink.onclick = (e) => {
            e.preventDefault();
            alert('Download link not available. Please try again.');
        };
    }
    
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

function simulateCompletion() {
    // Fallback for when backend doesn't return downloadId
    setTimeout(() => {
        showStatus('Download complete!', 'success');
        
        resultDiv.classList.remove('hidden');
        videoTitle.textContent = `Video from: ${urlInput.value}`;
        
        // For demo - in production this would be real
        downloadLink.href = '#';
        downloadLink.onclick = (e) => {
            e.preventDefault();
            // Try one more time to get the real file
            window.open(`${API_BASE_URL}/api/file/latest?url=${encodeURIComponent(urlInput.value)}`, '_blank');
        };
        
        statusDiv.classList.add('hidden');
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download';
        
        const current = parseInt(remainingSpan.textContent);
        remainingSpan.textContent = Math.max(0, current - 1);
    }, 5000);
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
}