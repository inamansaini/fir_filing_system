// This JavaScript file remains unchanged as the responsiveness issues are handled by CSS.
document.addEventListener('DOMContentLoaded', async () => {
    // Fetches police station data on page load
    await fetchAndStorePoliceStations(); 
    
    // Initial setup calls for various UI components
    checkCategory();
    generateAccusedNameInputs();
    fetchUserFIRs();
    setDateTimeMax();
    loadChatHistory(); 

    // --- Event Listeners ---
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('fir-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('category').addEventListener('change', checkCategory);
    document.getElementById('num-accused').addEventListener('change', generateAccusedNameInputs);
    document.getElementById('state').addEventListener('change', populateDistricts);
    document.getElementById('district').addEventListener('change', populatePoliceStations);
    document.getElementById('police-station').addEventListener('change', updateEmergencyContacts);
    document.getElementById('fir-list').addEventListener('click', handleFirListActions);
    document.querySelector('.close-modal').addEventListener('click', closeModal);
    
    // Close modal if user clicks outside of it
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('fir-details-modal')) {
            closeModal();
        }
    });
    
    // Chatbot event listeners
    document.getElementById('send-message').addEventListener('click', sendMessage);
    document.getElementById('user-message').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('clear-history-btn').addEventListener('click', clearChatHistory);
    document.getElementById('suggested-prompts').addEventListener('click', handlePromptClick);
});

// --- Global Data Storage ---
let policeStationData = {};

const stateDistricts = {
    "Haryana": ["Bhiwani", "Rohtak"],
    "Punjab": [] // Can be populated later
};

const policeStationContacts = {
    "Civil Lines Police Station, Bhiwani": "01664-242339",
    "City Police Station, Bhiwani": "01664-254433",
    "Tosham Police Station": "01253-258231",
    "Loharu Police Station": "01252-258330",
    "Civil Lines Police Station, Rohtak": "01262-274759",
    "Shivaji Colony Police Station, Rohtak": "01262-212994",
    "Arya Nagar Police Station, Rohtak": "01262-248318",
    "Sampla Police Station": "01262-261230",
    "Meham Police Station": "01257-233230"
};

// --- API & Data Functions ---
async function fetchAndStorePoliceStations() {
    try {
        // This assumes you have an API endpoint at '/api/police_stations'
        const response = await fetch('/api/police_stations');
        if (!response.ok) throw new Error('Failed to fetch police stations');
        policeStationData = await response.json();
    } catch (error) {
        console.error("Error fetching police stations:", error);
        // Using a simple alert for now, but a more robust UI notification would be better.
        alert("Could not load police station data. Please refresh the page.");
    }
}

// --- Event Handlers ---
function handleLogout() {
    fetch('/logout', { method: 'POST' })
        .then(res => res.json())
        .then(data => { if (data.redirect) window.location.href = data.redirect; });
}

function handleFormSubmit(event) {
    event.preventDefault();
    const incidentDate = new Date(document.getElementById('incident-date').value);
    if (incidentDate > new Date()) {
        alert("Incident date cannot be in the future!");
        return;
    }
    submitFIRForm();
}

function handleFirListActions(event) {
    const target = event.target;
    if (target.classList.contains('view-btn')) {
        fetchFIRDetails(target.dataset.firId);
    } else if (target.classList.contains('cancel-btn')) {
        if (confirm('Are you sure you want to cancel this FIR? This action cannot be undone.')) {
            cancelFIR(target.dataset.firId);
        }
    }
}

// --- UI Manipulation Functions ---
function generateAccusedNameInputs() {
    const numAccused = document.getElementById('num-accused').value;
    const container = document.getElementById('accused-names-container');
    container.innerHTML = ''; // Clear previous inputs

    if (numAccused === 'Unknown') {
        // No inputs needed if the number is unknown
        return;
    }

    let count = (numAccused === '5+') ? 5 : parseInt(numAccused);

    for (let i = 1; i <= count; i++) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.innerHTML = `
            <label for="accused_name_${i}">Name of Accused ${i}:</label>
            <input type="text" id="accused_name_${i}" name="accused_names[]" placeholder="Enter name of accused person ${i}" required>
        `;
        container.appendChild(formGroup);
    }
}

function setDateTimeMax() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('incident-date').max = now.toISOString().slice(0, 16);
}

function checkCategory() {
    const category = document.getElementById("category").value;
    const otherField = document.getElementById("other-category-field");
    const otherInput = document.getElementById("other-category-input");
    const isOther = category === "Other";
    otherField.style.display = isOther ? "flex" : "none"; // Use flex to match other form-groups
    otherInput.required = isOther;
}

function populateDistricts() {
    const state = document.getElementById('state').value;
    const districtSelect = document.getElementById('district');
    districtSelect.innerHTML = '<option value="">Select District</option>';
    if (state && stateDistricts[state]) {
        stateDistricts[state].forEach(district => {
            districtSelect.add(new Option(district, district));
        });
    }
    // Reset and repopulate police stations
    populatePoliceStations();
}

function populatePoliceStations() {
    const district = document.getElementById('district').value;
    const stationSelect = document.getElementById('police-station');
    stationSelect.innerHTML = '<option value="">Select Police Station</option>';
    
    if (district && policeStationData[district]) {
        policeStationData[district].forEach(station => {
            const option = new Option(station.name, station.name);
            const contactNumber = policeStationContacts[station.name];
            if (contactNumber) {
                option.dataset.contact = contactNumber;
            }
            stationSelect.add(option);
        });
    }
    updateEmergencyContacts();
}

function updateEmergencyContacts() {
    const stationSelect = document.getElementById('police-station');
    const selectedOption = stationSelect.selectedOptions[0];
    const emergencyContactSpan = document.getElementById('emergency-contact');
    
    document.getElementById('display-police-station').textContent = selectedOption && selectedOption.value ? selectedOption.value : "Not Selected";

    if (selectedOption && selectedOption.dataset.contact) {
        emergencyContactSpan.textContent = selectedOption.dataset.contact;
    } else {
        emergencyContactSpan.textContent = "112"; // Default emergency number
    }
}

// --- FIR Submission and Management ---
async function submitFIRForm() {
    try {
        const response = await fetch('/submit_fir', {
            method: 'POST',
            body: new FormData(document.getElementById('fir-form')),
        });
        const data = await response.json();
        alert(data.message || data.error);
        if (response.ok) {
            document.getElementById('fir-form').reset();
            checkCategory();
            generateAccusedNameInputs();
            fetchUserFIRs();
        }
    } catch (error) {
        alert('An error occurred while submitting the FIR.');
    }
}

async function fetchUserFIRs() {
    try {
        const response = await fetch('/user/firs');
        const data = await response.json();
        if (response.ok) {
            updateFIRList(data.firs);
        }
    } catch (error) {
        console.error('Error fetching FIRs:', error);
    }
}

async function fetchFIRDetails(firId) {
    try {
        const response = await fetch(`/fir/${firId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Server error');
        displayFIRDetails(data.fir);
        document.getElementById('fir-details-modal').style.display = 'flex';
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function cancelFIR(firId) {
    try {
        const response = await fetch(`/cancel_fir/${firId}`, { method: 'POST' });
        const data = await response.json();
        alert(data.message || data.error);
        if (response.ok) {
            fetchUserFIRs();
        }
    } catch (error) {
        alert('An error occurred while cancelling the FIR.');
    }
}

function updateFIRList(firs) {
    const firListBody = document.getElementById('fir-list');
    firListBody.innerHTML = ''; 
    if (!firs || firs.length === 0) {
        firListBody.innerHTML = '<tr><td colspan="5">You have not filed any FIRs yet.</td></tr>';
        return;
    }
    firs.forEach(fir => {
        const row = firListBody.insertRow();
        row.innerHTML = `
            <td>${fir._id}</td>
            <td>${fir.fir_status}</td>
            <td>${fir.assigned_officer_name || 'Unassigned'}</td>
            <td>${new Date(fir.filed_date).toLocaleDateString()}</td>
            <td>
                <button class="view-details-btn view-btn" data-fir-id="${fir._id}">🔍 View</button>
                <button class="cancel-btn" data-fir-id="${fir._id}" ${fir.fir_status !== 'Pending' ? 'disabled' : ''}>❌ Cancel</button>
            </td>
        `;
    });
}

// --- Modal Display ---
function displayFIRDetails(fir) {
    const detailsDiv = document.getElementById('fir-details');
    // Using a template literal for cleaner HTML structure
    detailsDiv.innerHTML = `
        <p><strong>FIR ID:</strong> <span>${fir._id}</span></p>
        <p><strong>Status:</strong> <span>${fir.fir_status}</span></p>
        <p><strong>Investigating Officer:</strong> <span>${fir.assigned_officer_name || 'Unassigned'}</span></p>
        <p><strong>Filed Date:</strong> <span>${new Date(fir.filed_date).toLocaleString()}</span></p>
        <p><strong>Complainant:</strong> <span>${fir.user_name}</span></p>
        <p><strong>Mobile:</strong> <span>${fir.mobile}</span></p>
        <p><strong>Address:</strong> <span>${fir.user_address}</span></p>
        <hr>
        <p><strong>Incident Date:</strong> <span>${new Date(fir.incident_date).toLocaleString()}</span></p>
        <p><strong>Location:</strong> <span>${fir.location}</span></p>
        <p><strong>Category:</strong> <span>${fir.category} ${fir.other_category ? `(${fir.other_category})` : ''}</span></p>
        <p><strong>Accused Person(s):</strong> <span>${fir.accused_names && fir.accused_names.length > 0 ? fir.accused_names.join(', ') : 'N/A'}</span></p>
        <p><strong>Police Station:</strong> <span>${fir.police_station}</span></p>
        <p><strong>Description:</strong></p>
        <div>${fir.description.replace(/\n/g, '<br>')}</div>
        <hr>
        <h4>Supporting Documents:</h4>
        <div id="fir-documents-preview"></div>
    `;

    const previewContainer = detailsDiv.querySelector('#fir-documents-preview');
    
    if (fir.supporting_documents && fir.supporting_documents.length > 0) {
        let documentsHTML = '<ul style="list-style-type: none; padding: 0;">';
        fir.supporting_documents.forEach(doc => {
            const url = doc.url;
            const resourceType = doc.resource_type;
            
            documentsHTML += '<li style="margin-bottom: 15px;">';

            if (resourceType === 'image') {
                documentsHTML += `<a href="${url}" target="_blank" title="Click to view full image"><img src="${url}" alt="Evidence Preview" style="max-width: 100%; height: auto; border-radius: 5px; border: 1px solid #ccc;"></a>`;
            } else if (resourceType === 'video') {
                documentsHTML += `<video controls style="max-width: 100%; border-radius: 5px;"><source src="${url}">Your browser doesn't support this video format.</video><br><a href="${url}" target="_blank">Download Video</a>`;
            } else {
                const filename = url.substring(url.lastIndexOf('/') + 1);
                documentsHTML += `<a href="${url}" target="_blank">📄 Download/View: ${filename}</a>`;
            }
            
            documentsHTML += '</li>';
        });
        documentsHTML += '</ul>';
        previewContainer.innerHTML = documentsHTML;
    } else {
        previewContainer.innerHTML = '<p><em>No supporting documents were uploaded.</em></p>';
    }
}

function closeModal() {
    document.getElementById('fir-details-modal').style.display = 'none';
}

// --- Chatbot Functions ---
async function loadChatHistory() {
    const chatbox = document.getElementById('chatbox');
    chatbox.innerHTML = ''; 
    try {
        const response = await fetch('/chatbot/history');
        const data = await response.json();
        if (response.ok && data.history && data.history.length > 0) {
            data.history.forEach(msg => {
                const sender = msg.role === 'user' ? 'You' : 'FIR-Bot';
                addMessageToChat(sender, msg.text, false); 
            });
        } else {
            const welcomeMessage = "Hello! I am **FIR-Bot**, your virtual assistant. I can help you understand the FIR filing process, explain your rights, and guide you on what documents to upload. Please ask me a question or click one of the suggestions below. <br><br>**If you are in immediate danger, please stop and call 112.**";
            addMessageToChat('FIR-Bot', welcomeMessage, true, true); 
        }
    } catch (error) {
        console.error("Could not load chat history:", error);
        addMessageToChat('FIR-Bot', "Could not connect to the chat server to retrieve history.", true, true);
    }
}

function handlePromptClick(event) {
    if (event.target.classList.contains('prompt-btn')) {
        const message = event.target.textContent;
        const userInput = document.getElementById('user-message');
        userInput.value = message;
        sendMessage();
    }
}

async function sendMessage() {
    const userInput = document.getElementById('user-message');
    const message = userInput.value.trim();
    if (!message) return;

    addMessageToChat('You', message, false); 
    userInput.value = '';
    userInput.focus();
    addTypingIndicator();
    document.getElementById('suggested-prompts').style.display = 'none';

    try {
        const response = await fetch('/chatbot/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });
        const data = await response.json();
        removeTypingIndicator();
        addMessageToChat('FIR-Bot', data.response || "Sorry, I encountered an error.", true, true);
    } catch (error) {
        removeTypingIndicator();
        addMessageToChat('FIR-Bot', 'Connection error. Please check your network and try again.', true, true);
    }
}

async function clearChatHistory() {
    if (!confirm('Are you sure you want to delete your entire chat history? This cannot be undone.')) {
        return;
    }
    try {
        const response = await fetch('/chatbot/clear', { method: 'POST' });
        if (response.ok) {
            loadChatHistory();
            document.getElementById('suggested-prompts').style.display = 'flex';
        } else {
            alert("Failed to clear history on the server.");
        }
    } catch (error) {
        console.error("Error clearing chat history:", error);
        alert("A connection error occurred while trying to clear history.");
    }
}

function addMessageToChat(sender, message, processMarkdown = true, useTypingEffect = false) {
    const chatbox = document.getElementById('chatbox');
    const msgElement = document.createElement('div');
    
    const senderClass = sender === 'You' ? 'user-message' : 'bot-message';
    msgElement.classList.add('chat-message', senderClass);

    const formattedMessage = processMarkdown 
        ? message
            .replace(/&/g, '&amp;') 
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*/g, '')
            .replace(/\n/g, '<br>')
        : message;

    msgElement.innerHTML = `<strong>${sender}:</strong><div class="message-content"></div>`;
    const contentDiv = msgElement.querySelector('.message-content');
    
    chatbox.appendChild(msgElement);

    if (sender === 'FIR-Bot' && useTypingEffect) {
        typeWriter(msgElement, contentDiv, formattedMessage, 15);
    } else {
        contentDiv.innerHTML = formattedMessage;
    }
    
    chatbox.scrollTop = chatbox.scrollHeight;
}

function typeWriter(messageElement, contentElement, text, speed) {
    let i = 0;
    contentElement.innerHTML = '';
    messageElement.classList.add('typing'); 

    const chatbox = document.getElementById('chatbox'); 

    function typing() {
        const shouldScroll = chatbox.scrollHeight - chatbox.clientHeight <= chatbox.scrollTop + 10;

        if (i < text.length) {
            if (text.charAt(i) === '<') {
                const tagEndIndex = text.indexOf('>', i);
                if (tagEndIndex !== -1) {
                    const tag = text.substring(i, tagEndIndex + 1);
                    contentElement.innerHTML += tag;
                    i = tagEndIndex; 
                }
            } else {
                contentElement.innerHTML += text.charAt(i);
            }
            i++;

            if (shouldScroll) {
                chatbox.scrollTop = chatbox.scrollHeight;
            }
            
            setTimeout(typing, speed);
        } else {
            messageElement.classList.remove('typing'); 
            if(shouldScroll){
                 chatbox.scrollTop = chatbox.scrollHeight;
            }
        }
    }
    typing();
}

function addTypingIndicator() {
    const chatbox = document.getElementById('chatbox');
    if (document.getElementById('typing-indicator')) return;

    const typingEl = document.createElement('div');
    typingEl.id = 'typing-indicator';
    typingEl.classList.add('chat-message', 'bot-message');
    typingEl.innerHTML = '<strong>FIR-Bot:</strong> <em class="typing-dots"><span>.</span><span>.</span><span>.</span></em>';
    chatbox.appendChild(typingEl);
    chatbox.scrollTop = chatbox.scrollHeight;
}

function removeTypingIndicator() {
    const typingEl = document.getElementById('typing-indicator');
    if (typingEl) typingEl.remove();
}
