import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

export function IncidentBreakdownChart({ data = {} }) {
  const labels = Object.keys(data).length > 0 ? Object.keys(data).map(k => k.replace(/_/g, ' ')) : ['No Events'];
  const values = Object.keys(data).length > 0 ? Object.values(data) : [0];

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Flagged Incidents',
        data: values,
        backgroundColor: [
          'rgba(239, 68, 68, 0.75)',  // Red for high risk
          'rgba(245, 158, 11, 0.75)', // Amber
          'rgba(59, 130, 246, 0.75)', // Blue
          'rgba(16, 185, 129, 0.75)', // Green
          'rgba(168, 85, 247, 0.75)'  // Purple
        ],
        borderColor: [
          '#ef4444',
          '#f59e0b',
          '#3b82f6',
          '#10b981',
          '#a855f7'
        ],
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#94a3b8',
        borderColor: '#334155',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8', font: { size: 10 } },
        grid: { color: 'rgba(51, 65, 85, 0.4)' }
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#94a3b8', stepSize: 1 },
        grid: { color: 'rgba(51, 65, 85, 0.4)' }
      }
    }
  };

  return (
    <div style={{ height: '240px', width: '100%' }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}

export function ScoreDistributionChart({ data = {} }) {
  const labels = Object.keys(data).length > 0 ? Object.keys(data) : ['Low', 'Medium', 'High'];
  const values = Object.keys(data).length > 0 ? Object.values(data) : [1, 0, 0];

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: [
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(239, 68, 68, 0.8)'
        ],
        borderColor: '#0f172a',
        borderWidth: 2
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#94a3b8'
      }
    },
    cutout: '70%'
  };

  return (
    <div style={{ height: '240px', width: '100%', position: 'relative' }}>
      <Doughnut data={chartData} options={options} />
    </div>
  );
}
