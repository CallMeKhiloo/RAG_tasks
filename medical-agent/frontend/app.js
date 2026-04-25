document.addEventListener('DOMContentLoaded', () => {
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHistory = document.getElementById('chat-history');
    
    // File upload elements
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const previewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const imageName = document.getElementById('image-name');
    const removeImageBtn = document.getElementById('remove-image-btn');

    let currentSessionId = generateSessionId();
    let currentBase64Image = null;

    function generateSessionId() {
        return 'session-' + Math.random().toString(36).substr(2, 9);
    }

    // Auto-resize textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') {
            this.style.height = 'auto';
        }
    });

    function scrollToBottom() {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    scrollToBottom();

    // Handle File Upload UI
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                currentBase64Image = event.target.result;
                imagePreview.src = currentBase64Image;
                imageName.textContent = file.name;
                previewContainer.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        }
    });

    removeImageBtn.addEventListener('click', () => {
        currentBase64Image = null;
        fileInput.value = '';
        previewContainer.style.display = 'none';
    });

    function createMessageElement(type, contentHTML) {
        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        
        let avatarIcon = type === 'user' ? 'ph-user' : 'ph-robot';
        
        // Structure depends on who is speaking
        if (type === 'user') {
            msg.innerHTML = `
                <div class="message-content">
                    ${contentHTML}
                </div>
                <div class="avatar"><i class="ph-fill ${avatarIcon}"></i></div>
            `;
        } else {
            msg.innerHTML = `
                <div class="avatar"><i class="ph-fill ${avatarIcon}"></i></div>
                <div class="message-content">
                    ${contentHTML}
                </div>
            `;
        }
        return msg;
    }

    // Format Structured Output from Backend
    function formatAIResponse(data) {
        let html = '<div class="structured-output">';
        
        if (data.summary && data.summary.trim() !== '') {
            html += `<h4>Case Summary</h4><p>${data.summary.replace(/\n/g, '<br>')}</p>`;
        }
        if (data.insights && data.insights.trim() !== '') {
            html += `<h4>Medical Insights</h4><p>${data.insights.replace(/\n/g, '<br>')}</p>`;
        }
        if (data.hospitals && data.hospitals.trim() !== '') {
            html += `<h4>Hospitals</h4><p>${data.hospitals.replace(/\n/g, '<br>')}</p>`;
        }
        html += '</div>';
        
        return html;
    }

    async function sendMessage() {
        const text = userInput.value.trim();
        
        if (text === '' && !currentBase64Image) return;

        // Construct User UI Content
        let userContent = '';
        if (currentBase64Image) {
            userContent += `
                <div class="attachment">
                    <i class="ph ph-image"></i>
                    <span>${imageName.textContent}</span>
                </div>
                <img src="${currentBase64Image}" style="max-width: 200px; border-radius: 8px; margin-bottom: 8px;">
            `;
        }
        if (text !== '') {
            userContent += `<p>${text}</p>`;
        }

        // Add user message to UI
        const userMsg = createMessageElement('user', userContent);
        chatHistory.appendChild(userMsg);
        
        // Prepare API payload
        const payload = {
            session_id: currentSessionId,
            message: text || "Please analyze the attached image.",
            image_url: currentBase64Image
        };

        // Clear input state
        userInput.value = '';
        userInput.style.height = 'auto';
        currentBase64Image = null;
        fileInput.value = '';
        previewContainer.style.display = 'none';
        scrollToBottom();

        // Add Loading AI Message
        const loadingHtml = `
            <div class="tool-execution">
                <i class="ph ph-spinner ph-spin"></i>
                <span>Analyzing inputs and generating structured response...</span>
            </div>
        `;
        const aiLoadingMsg = createMessageElement('ai', loadingHtml);
        chatHistory.appendChild(aiLoadingMsg);
        scrollToBottom();

        // Make API Call
        try {
            const response = await fetch('http://localhost:8000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('API Error: ' + response.statusText);
            }

            const data = await response.json();
            
            // Replace loading message with actual content
            const contentDiv = aiLoadingMsg.querySelector('.message-content');
            contentDiv.innerHTML = formatAIResponse(data);
            scrollToBottom();

        } catch (error) {
            console.error('Error:', error);
            const contentDiv = aiLoadingMsg.querySelector('.message-content');
            contentDiv.innerHTML = `
                <div class="tool-execution" style="border-color: var(--warning-color); color: var(--warning-color);">
                    <i class="ph-fill ph-warning-circle"></i>
                    <span>Error connecting to the backend. Make sure the FastAPI server is running on port 8000.</span>
                </div>
            `;
            scrollToBottom();
        }
    }

    sendBtn.addEventListener('click', sendMessage);

    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});
