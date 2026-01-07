'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const FeedbackForm = ({ onBack }) => {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    batchNumber: '',
    feedback: '',
    additionalText: '',
  });

  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required';
    } else if (!/^[\d\s\-\+\(\)]+$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = 'Please enter a valid phone number';
    }

    if (!formData.batchNumber.trim()) {
      newErrors.batchNumber = 'Batch number is required';
    }

    if (!formData.feedback.trim()) {
      newErrors.feedback = 'Feedback is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitStatus({ type: 'success', message: 'Thank you for your feedback!' });
        // Reset form
        setFormData({
          name: '',
          email: '',
          phoneNumber: '',
          batchNumber: '',
          feedback: '',
          additionalText: '',
        });
        // Redirect to home after 2 seconds
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } else {
        setSubmitStatus({
          type: 'error',
          message: data.error || 'Failed to submit feedback. Please try again.',
        });
      }
    } catch (error) {
      console.error('Feedback submission error:', error);
      setSubmitStatus({
        type: 'error',
        message: 'An error occurred. Please try again later.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-50 dark:bg-black text-black dark:text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold mb-2">Interview Feedback</h1>
          <p className="text-base text-gray-600 dark:text-gray-300">
            We'd love to hear about your experience. Please share your feedback with us.
          </p>
        </div>

        {submitStatus && (
          <div
            className={`p-4 rounded-lg border ${
              submitStatus.type === 'success'
                ? 'bg-gray-200 dark:bg-gray-800 border-gray-400 dark:border-gray-600 text-gray-800 dark:text-white'
                : 'bg-red-500/10 border-red-500/50 text-red-600 dark:text-red-300'
            }`}
          >
            {submitStatus.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl p-6 space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-2">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full px-4 py-3 bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white ${
                  errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Enter your full name"
              />
              {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full px-4 py-3 bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white ${
                  errors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="your.email@example.com"
              />
              {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-medium mb-2">
                Phone Number <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                id="phoneNumber"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                className={`w-full px-4 py-3 bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white ${
                  errors.phoneNumber ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="+91 8712623010"
              />
              {errors.phoneNumber && (
                <p className="mt-1 text-sm text-red-400">{errors.phoneNumber}</p>
              )}
            </div>

            {/* Batch Number */}
            <div>
              <label htmlFor="batchNumber" className="block text-sm font-medium mb-2">
                Batch Number <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="batchNumber"
                name="batchNumber"
                value={formData.batchNumber}
                onChange={handleChange}
                className={`w-full px-4 py-3 bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white ${
                  errors.batchNumber ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Enter your batch number"
              />
              {errors.batchNumber && (
                <p className="mt-1 text-sm text-red-400">{errors.batchNumber}</p>
              )}
            </div>

            {/* Feedback Section */}
            <div>
              <label htmlFor="feedback" className="block text-sm font-medium mb-2">
                Feedback <span className="text-red-400">*</span>
              </label>
              <textarea
                id="feedback"
                name="feedback"
                value={formData.feedback}
                onChange={handleChange}
                rows={5}
                className={`w-full px-4 py-3 bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-none ${
                  errors.feedback ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Please share your thoughts about the interview experience..."
              />
              {errors.feedback && (
                <p className="mt-1 text-sm text-red-400">{errors.feedback}</p>
              )}
            </div>

            {/* Additional Text Section */}
            <div>
              <label htmlFor="additionalText" className="block text-sm font-medium mb-2">
                Additional Comments (Optional)
              </label>
              <textarea
                id="additionalText"
                name="additionalText"
                value={formData.additionalText}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-none"
                placeholder="Any additional comments or suggestions..."
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto rounded-xl bg-white text-black px-8 py-3 font-semibold hover:bg-gray-200 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
            <Link
              href="/"
              className="w-full sm:w-auto rounded-xl border border-gray-600 px-8 py-3 font-semibold text-white hover:border-white text-center"
            >
              Skip for now
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FeedbackForm;

