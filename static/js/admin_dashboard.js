document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.logout-btn').addEventListener('click', logout);
    
    const firTable = document.getElementById('firTable');
    if (firTable) {
        firTable.addEventListener('change', handleTableChange);
        firTable.addEventListener('click', handleTableClick);
    }

    const firDetailsModal = document.getElementById('fir-details-modal');
    firDetailsModal.querySelector('.close-modal').addEventListener('click', () => {
        firDetailsModal.style.display = 'none';
    });

    const settingsModal = document.getElementById('settings-modal');
    document.getElementById('open-settings-btn').addEventListener('click', openSettingsModal);
    document.getElementById('close-settings-modal').addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === firDetailsModal) {
            firDetailsModal.style.display = 'none';
        }
        if (event.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    document.getElementById('add-officer-form').addEventListener('submit', handleAddOfficer);
});

function logout() {
    fetch('/logout', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.redirect) {
                window.location.href = data.redirect;
            }
        })
        .catch(err => console.error('Logout failed:', err));
}

function toggleReports() {
    const reportsContainer = document.getElementById('fir-reports');
    if (reportsContainer.style.display === 'none') {
        reportsContainer.style.display = 'block';
    } else {
        reportsContainer.style.display = 'none';
    }
}

function searchFIR() {
    const input = document.getElementById('firSearchInput');
    const filter = input.value.toUpperCase();
    const table = document.getElementById('firTable');
    const tr = table.getElementsByTagName('tr');

    for (let i = 1; i < tr.length; i++) { 
        const td = tr[i].getElementsByTagName('td')[0]; 
        if (td) {
            const txtValue = td.textContent || td.innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                tr[i].style.display = '';
            } else {
                tr[i].style.display = 'none';
            }
        }
    }
}

function handleTableChange(event) {
    if (event.target.classList.contains('status-select')) {
        const firId = event.target.dataset.firId;
        const newStatus = event.target.value;
        updateStatus(firId, newStatus);
    }
}

function handleTableClick(event) {
    if (event.target.classList.contains('view-details-btn')) {
        const firId = event.target.dataset.firId;
        viewDetails(firId);
    }
}

async function updateStatus(firId, status) {
    try {
        const response = await fetch('/admin/update_fir_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fir_id: firId, status: status })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to update status.');
        }
        console.log(result.message);
    } catch (error) {
        console.error('Error updating status:', error);
        alert(error.message);
    }
}

async function viewDetails(firId) {
    try {
        const response = await fetch(`/fir/${firId}`);
        if (!response.ok) throw new Error('Failed to fetch FIR details.');
        
        const data = await response.json();
        const fir = data.fir;
        
        // --- Start of Fix ---
        let documentsHtml = '';
        if (fir.supporting_documents && fir.supporting_documents.length > 0) {
            documentsHtml = `
                <hr>
                <p><strong>Supporting Documents:</strong></p>
                <ul>
            `;
            fir.supporting_documents.forEach((doc, index) => {
                const fileName = doc.url.split('/').pop();
                documentsHtml += `<li><a href="${doc.url}" target="_blank" rel="noopener noreferrer">Document ${index + 1}: ${fileName}</a></li>`;
            });
            documentsHtml += '</ul>';
        } else {
            documentsHtml = '<hr><p><strong>Supporting Documents:</strong> None provided.</p>';
        }
        // --- End of Fix ---
        
        const detailsBody = document.getElementById('fir-details-body');
        detailsBody.innerHTML = `
            <p><strong>FIR ID:</strong> ${fir._id}</p>
            <p><strong>Status:</strong> ${fir.fir_status}</p>
            <p><strong>Investigating Officer:</strong> ${fir.assigned_officer_name || 'Unassigned'}</p>
            <p><strong>Filed Date:</strong> ${new Date(fir.filed_date).toLocaleString()}</p>
            <hr>
            <p><strong>Complainant:</strong> ${fir.user_name}</p>
            <p><strong>Mobile:</strong> ${fir.mobile}</p>
            <p><strong>Address:</strong> ${fir.user_address}</p>
            <hr>
            <p><strong>Incident Date:</strong> ${new Date(fir.incident_date).toLocaleString()}</p>
            <p><strong>Location:</strong> ${fir.location}</p>
            <p><strong>Category:</strong> ${fir.category} ${fir.other_category ? `(${fir.other_category})` : ''}</p>
            <p><strong>Accused Person(s):</strong> ${fir.accused_names && fir.accused_names.length > 0 ? fir.accused_names.join(', ') : 'N/A'}</p>
            <p><strong>Police Station:</strong> ${fir.police_station}</p>
            <p><strong>Description:</strong></p>
            <p>${fir.description}</p>
            ${documentsHtml}
        `;
        
        document.getElementById('fir-details-modal').style.display = 'flex';
    } catch (error) {
        console.error('Error fetching details:', error);
        alert(error.message);
    }
}

function openSettingsModal() {
    document.getElementById('settings-modal').style.display = 'flex';
    fetchOfficers(); 
}

async function fetchOfficers() {
    try {
        const response = await fetch('/admin/settings/officers');
        if (!response.ok) throw new Error('Failed to fetch officers.');
        
        const officers = await response.json();
        const container = document.getElementById('officer-list-container');
        
        if (officers.length === 0) {
            container.innerHTML = '<p>No officers have been added for this station yet.</p>';
            return;
        }

        let officerTable = `
            <table class="fir-table">
                <thead><tr><th>Name</th><th>Badge ID</th><th>Status</th></tr></thead>
                <tbody>
        `;
        officers.forEach(officer => {
            officerTable += `
                <tr>
                    <td>${officer.name}</td>
                    <td>${officer.badge_id}</td>
                    <td>${officer.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
            `;
        });
        officerTable += '</tbody></table>';
        container.innerHTML = officerTable;

    } catch (error) {
        console.error('Error fetching officers:', error);
        container.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}

async function handleAddOfficer(event) {
    event.preventDefault();
    const name = document.getElementById('officer-name').value;
    const badgeId = document.getElementById('officer-badge').value;

    try {
        const response = await fetch('/admin/settings/officers/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, badge_id: badgeId })
        });

        const result = await response.json();
        alert(result.message || result.error);

        if (response.ok) {
            document.getElementById('add-officer-form').reset();
            fetchOfficers(); 
        }
    } catch (error) {
        console.error('Error adding officer:', error);
        alert('An error occurred. Please try again.');
    }
}
