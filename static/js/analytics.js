document.addEventListener('DOMContentLoaded', function() {
    fetchAndRenderAnalytics();
});

async function fetchAndRenderAnalytics() {
    const loadingMessage = document.getElementById('loading-message');
    const chartContainer = document.querySelector('.chart-container');
    const summaryContainer = document.getElementById('summary-container');
    const noDataMessage = document.getElementById('no-data-message');

    try {
        const response = await fetch('/admin/analytics_data');
        if (!response.ok) {
            throw new Error('Failed to fetch analytics data from the server.');
        }
        const data = await response.json();

        loadingMessage.style.display = 'none';

        if (Object.keys(data).length === 0) {
            noDataMessage.style.display = 'block';
            return;
        }

        chartContainer.style.display = 'block';
        summaryContainer.style.display = 'block';

        const labels = Object.keys(data);
        const counts = Object.values(data);
        const totalFirs = counts.reduce((sum, count) => sum + count, 0);

        renderPieChart(labels, counts);
        renderSummaryTable(data, totalFirs);

    } catch (error) {
        loadingMessage.innerHTML = `<p style="color: #EF4444;"><strong>Error:</strong> ${error.message}</p>`;
        console.error('Error fetching analytics:', error);
    }
}

function renderPieChart(labels, counts) {
    const ctx = document.getElementById('crimeChart').getContext('2d');
    
    const chartColors = [
        '#F59E0B', '#3B82F6', '#10B981', '#EF4444',
        '#8B5CF6', '#F97316', '#6B7280', '#EC4899'
    ];

    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of FIRs',
                data: counts,
                backgroundColor: chartColors,
                borderColor: '#1F2937',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#D1D5DB'
                    }
                },
                title: {
                    display: false
                }
            }
        }
    });
}

function renderSummaryTable(data, totalFirs) {
    const tbody = document.getElementById('summary-tbody');
    tbody.innerHTML = '';

    const sortedData = Object.entries(data).sort(([, a], [, b]) => b - a);

    for (const [category, count] of sortedData) {
        const percentage = totalFirs > 0 ? ((count / totalFirs) * 100).toFixed(2) : 0;
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${category}</td>
            <td>${count}</td>
            <td>${percentage}%</td>
        `;
    }

    const totalRow = tbody.insertRow();
    
    totalRow.classList.add('total-row');
    
    totalRow.style.fontWeight = 'bold';
    totalRow.innerHTML = `
        <td>Total</td>
        <td>${totalFirs}</td>
        <td>100.00%</td>
    `;
}
