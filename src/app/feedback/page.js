'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

const FeedbackPage = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [storageType, setStorageType] = useState('Unknown');

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/feedback');
      const data = await response.json();

      if (response.ok) {
        setFeedbacks(data.feedbacks || []);
        // Determine storage type based on response
        setStorageType(data.storageType || 'JSON File');
      } else {
        setError(data.error || 'Failed to fetch feedbacks');
      }
    } catch (err) {
      console.error('Error fetching feedbacks:', err);
      setError('Failed to load feedbacks');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const exportToCSV = () => {
    if (feedbacks.length === 0) {
      alert('No feedback to export');
      return;
    }

    const headers = ['Name', 'Email', 'Phone Number', 'Batch Number', 'Feedback', 'Additional Text', 'Submitted At'];
    const rows = feedbacks.map((fb) => [
      fb.name || '',
      fb.email || '',
      fb.phone_number || fb.phoneNumber || '',
      fb.batch_number || fb.batchNumber || '',
      (fb.feedback || '').replace(/\n/g, ' '),
      (fb.additional_text || fb.additionalText || '').replace(/\n/g, ' '),
      formatDate(fb.submitted_at || fb.submittedAt),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `feedback_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-zinc-50 dark:bg-black text-black dark:text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading feedbacks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-zinc-50 dark:bg-black text-black dark:text-white">
      <NavBar />
      <div className="px-4 py-10">
        <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Feedback Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Total Feedbacks: <span className="text-black dark:text-white font-semibold">{feedbacks.length}</span>
            </p>
            
          </div>
          <div className="flex gap-3 mt-4 sm:mt-0">
            <button
              onClick={fetchFeedbacks}
              className="px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-600 rounded-lg transition"
            >
              Refresh
            </button>
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 rounded-lg transition font-semibold"
            >
              Export CSV
            </button>
            <Link
              href="/"
              className="px-4 py-2 border border-gray-400 dark:border-gray-600 text-gray-800 dark:text-white hover:border-black dark:hover:border-white rounded-lg transition"
            >
              Home
            </Link>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* Feedbacks List */}
        {feedbacks.length === 0 ? (
          <div className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl p-12 text-center">
            <p className="text-gray-600 dark:text-gray-400 text-lg">No feedback submitted yet.</p>
            <Link href="/interview" className="text-black dark:text-white hover:text-gray-600 dark:hover:text-gray-300 mt-4 inline-block">
              Go to Interview →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {feedbacks.map((feedback, index) => (
              <div
                key={index}
                className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl p-6 hover:border-black dark:hover:border-white/30 transition"
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Left Column - User Info */}
                  <div className="lg:w-1/3 space-y-3">
                    <div>
                      <h3 className="text-lg font-semibold text-black dark:text-white">{feedback.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{feedback.email}</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="text-gray-500 dark:text-gray-500">Phone:</span>{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {feedback.phone_number || feedback.phoneNumber || 'N/A'}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-500 dark:text-gray-500">Batch:</span>{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {feedback.batch_number || feedback.batchNumber || 'N/A'}
                        </span>
                      </p>
                      <p className="text-gray-500 dark:text-gray-500 text-xs">
                        {formatDate(feedback.submitted_at || feedback.submittedAt)}
                      </p>
                    </div>
                  </div>

                  {/* Right Column - Feedback Content */}
                  <div className="lg:w-2/3 space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Feedback:</h4>
                      <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{feedback.feedback}</p>
                    </div>
                    {(feedback.additional_text || feedback.additionalText) && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Additional Comments:</h4>
                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm">
                          {feedback.additional_text || feedback.additionalText}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default FeedbackPage;

