// Configuration
const API_BASE_URL = 'https://media-downloader-7ovf.onrender.com'; // Replace with your Render URL
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
        const data = await response.json();
        remainingSpan.textContent = data.remaining;
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
            body: JSON.stringify({ url, userId })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Download failed');
        }

        showStatus(data.message, 'success');
        
        // Poll for completion (simplified - in production, use websockets)
        setTimeout(() => checkDownloadStatus(url), 3000);

    } catch (error) {
        showStatus(error.message, 'error');
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download';
    }
}

function checkDownloadStatus(url) {
    // For demo purposes, we'll simulate completion
    // In production, you'd poll an actual status endpoint
    simulateCompletion();
}

function simulateCompletion() {
    // Simulate successful download
    showStatus('Download complete!', 'success');
    
    // Show result section
    resultDiv.classList.remove('hidden');
    videoTitle.textContent = `Video from: ${urlInput.value}`;
    
    // Set download link (in production, this would be a real file URL)
    downloadLink.href = '#';
    downloadLink.onclick = (e) => {
        e.preventDefault();
        alert('In production, this would download your video!\n\nFor demo purposes, we\'re simulating the download.');
    };
    
    // Hide status
    statusDiv.classList.add('hidden');
    
    // Reset button
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
    
    // Update remaining limit
    const current = parseInt(remainingSpan.textContent);
    remainingSpan.textContent = Math.max(0, current - 1);
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
}