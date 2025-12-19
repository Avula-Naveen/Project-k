'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import GeminiLiveStage from '@/components/GeminiLiveStage';

const Interview = () => {
  const [step, setStep] = useState('upload');
  const [resumeFile, setResumeFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF resume.');
      return;
    }
    setResumeFile(file);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    handleFiles(event.dataTransfer && event.dataTransfer.files);
  };

  const startInterview = (useResume) => {
    if (!useResume) setResumeFile(null);
    setStep('live');
  };

  return (
    <div className="min-h-screen w-full bg-[#0d1526] text-white flex items-center justify-center px-4 py-10">
      {step === 'upload' ? (
        <div className="w-full max-w-3xl space-y-8 text-center">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Upload Your Resume</h1>
            <p className="text-base text-gray-300">
              Drag & drop a PDF to tailor the interview, or continue without it.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`relative border-2 border-dashed rounded-2xl bg-[#111a2d]/70 transition-colors ${
              dragging ? 'border-emerald-400 bg-emerald-500/5' : 'border-gray-600'
            }`}
          >
            <div className="px-10 py-12 flex flex-col items-center gap-4">
              <div className="h-14 w-14 rounded-full border border-gray-600 flex items-center justify-center text-2xl">
                +
              </div>
              {resumeFile ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-lg font-medium">{resumeFile.name}</p>
                  <button
                    onClick={() => setResumeFile(null)}
                    className="text-sm text-emerald-300 hover:text-emerald-200"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-lg text-gray-200">
                    Drag and drop your resume here
                  </p>
                  <p className="text-sm text-gray-400">or click to browse</p>
                  <button
                    onClick={() => inputRef.current?.click()}
                    className="mt-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400"
                  >
                    Upload Resume
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => startInterview(true)}
              className="w-full sm:w-auto rounded-xl bg-emerald-500 px-6 py-3 text-black font-semibold hover:bg-emerald-400 transition disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!resumeFile}
            >
              Use resume & continue
            </button>
            <button
              onClick={() => startInterview(false)}
              className="w-full sm:w-auto rounded-xl border border-gray-600 px-6 py-3 font-semibold text-white hover:border-emerald-400"
            >
              Skip for now
            </button>
          </div>

          <p className="text-xs text-gray-500">
            We only use your PDF to craft relevant questions. Nothing is stored.
          </p>
        </div>
      ) : (
        <GeminiLiveStage resumeFile={resumeFile} onRestart={() => setStep('upload')} />
      )}
    </div>
  );
};


export default Interview;