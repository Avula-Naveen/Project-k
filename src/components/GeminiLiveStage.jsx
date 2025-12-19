
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

const GeminiLiveStage = ({ resumeFile, onRestart }) => { 
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [resumeStatus, setResumeStatus] = useState('idle');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const aiVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const playbackContextRef = useRef(null);
  const playbackGainRef = useRef(null);
  const isPlayingRef = useRef(false);
  const playbackNextStartRef = useRef(0);
  const audioBufferQueueRef = useRef([]);
  const isPlaybackStartedRef = useRef(false);
  const activeSourcesRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const isRecordingRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const silenceTimeoutRef = useRef(null);
  const lastUserSpeechTimeRef = useRef(null);
  const hasPromptedForSilenceRef = useRef(false);

  // ========== HELPERS ==========
  const normalizeText = (t) =>
    (t || '').replace(/\s+/g, ' ').replace(/(\s*\n\s*)+/g, '\n').trim();

  const clipText = (t, maxChars = 14000) => {
    const s = t || '';
    return s.length <= maxChars ? s : s.slice(0, maxChars) + '\n...[TRUNCATED]';
  };

  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const convertFloat32ToInt16 = (float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  };

  // ========== CAMERA ==========
  const startCamera = async () => {
    if (typeof window === 'undefined') return;
    try {
      setCameraError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        // ✅ CHANGE THIS LINE - Add proper error logging
        await localVideoRef.current.play().catch((err) => {
          console.error('Video play error:', err);
          setCameraError('Video play failed: ' + err.message);
        });
      }
      setIsCameraOn(true);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Camera unavailable');
      setIsCameraOn(false);
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setIsCameraOn(false);
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  // ========== RESUME EXTRACTION ==========
  const extractTextFromPDF = async (file) => {
    try {
      setResumeStatus('processing');
      setResumeText('');

      const pdfjsMod = await import('pdfjs-dist');
      const pdfjs = pdfjsMod.default ?? pdfjsMod;
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(' ');
        fullText += pageText + '\n';
      }

      const cleaned = normalizeText(fullText);
      if (!cleaned) {
        setResumeStatus('failed');
        return;
      }

      setResumeText(cleaned);
      setResumeStatus('ready');
    } catch (error) {
      console.error('PDF extraction error:', error);
      setResumeStatus('failed');
    }
  };

  // ✅ FIX: Properly handle resume-less case
  useEffect(() => {
    if (resumeFile) {
      extractTextFromPDF(resumeFile);
    } else {
      // No resume - mark as ready immediately
      setResumeText('');
      setResumeStatus('ready');
    }
  }, [resumeFile]);

  // ========== AI AVATAR VIDEO ==========
  useEffect(() => {
    if (!aiVideoRef.current) return;
    if (isAISpeaking) {
      aiVideoRef.current.play().catch(() => {});
    } else {
      aiVideoRef.current.pause();
    }
  }, [isAISpeaking]);

  // ========== AUDIO PLAYBACK ==========
  const stopPlaybackContext = () => {
    activeSourcesRef.current.forEach((source) => {
      try { source.stop(); } catch (_) {}
    });
    activeSourcesRef.current = [];
    if (playbackContextRef.current) {
      try { playbackContextRef.current.close(); } catch (_) {}
    }
    playbackContextRef.current = null;
    playbackGainRef.current = null;
    isPlayingRef.current = false;
    setIsAISpeaking(false);
    playbackNextStartRef.current = 0;
    audioBufferQueueRef.current = [];
    isPlaybackStartedRef.current = false;
  };

  const ensurePlaybackContext = () => {
    if (typeof window === 'undefined') return;
    if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 24000 });
      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : 1;
      gain.connect(ctx.destination);
      playbackContextRef.current = ctx;
      playbackGainRef.current = gain;
      playbackNextStartRef.current = ctx.currentTime;
    }
  };

  const flushAudioQueue = () => {
    const ctx = playbackContextRef.current;
    const gain = playbackGainRef.current;
    if (!ctx || !gain) return;

    while (audioBufferQueueRef.current.length > 0) {
      const audioBuffer = audioBufferQueueRef.current.shift();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gain);

      const startAt = Math.max(ctx.currentTime, playbackNextStartRef.current);
      source.start(startAt);
      playbackNextStartRef.current = startAt + audioBuffer.duration;
      activeSourcesRef.current.push(source);

      source.onended = () => {
        const idx = activeSourcesRef.current.indexOf(source);
        if (idx > -1) activeSourcesRef.current.splice(idx, 1);
        if (ctx.currentTime >= playbackNextStartRef.current - 0.05) {
          isPlayingRef.current = false;
          setIsAISpeaking(false);
        }
      };

      isPlayingRef.current = true;
      setIsAISpeaking(true);
    }
  };

  const playStreamingChunk = async (base64Data, mimeType) => {
    if (isMuted || typeof window === 'undefined') return;

    try {
      ensurePlaybackContext();
      const ctx = playbackContextRef.current;
      if (!ctx) return;

      let sampleRate = 24000;
      const m = mimeType && mimeType.match(/rate=(\d+)/);
      if (m && m[1]) sampleRate = parseInt(m[1], 10) || 24000;

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);
      audioBufferQueueRef.current.push(audioBuffer);

      if (!isPlaybackStartedRef.current && audioBufferQueueRef.current.length >= 2) {
        isPlaybackStartedRef.current = true;
        playbackNextStartRef.current = ctx.currentTime + 0.05;
        flushAudioQueue();
      } else if (isPlaybackStartedRef.current) {
        flushAudioQueue();
      }
    } catch (err) {
      console.error('Audio streaming error:', err);
    }
  };

  // ========== SILENCE DETECTION ==========
  const clearSilenceTimeout = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  const promptUserForResponse = () => {
    if (hasPromptedForSilenceRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    hasPromptedForSilenceRef.current = true;
    try {
      wsRef.current.send(JSON.stringify({
        client_content: {
          turns: [{ 
            role: 'user', 
            parts: [{ text: 'The candidate has not responded for a while. Please ask them: "Are you thinking about this, or should we move to the next question?" Keep it brief and natural.' }] 
          }],
          turn_complete: true,
        },
      }));
    } catch (err) {
      console.error('Silence prompt error:', err);
    }
  };

  const startSilenceDetection = () => {
    clearSilenceTimeout();
    hasPromptedForSilenceRef.current = false;
    
    // Start timer for 4.5 seconds (between 4-5 seconds)
    silenceTimeoutRef.current = setTimeout(() => {
      promptUserForResponse();
    }, 4500);
  };

  const handleUserSpeech = () => {
    // User is speaking, clear silence detection
    clearSilenceTimeout();
    hasPromptedForSilenceRef.current = false;
    lastUserSpeechTimeRef.current = Date.now();
  };

  const handleServerResponse = async (serverContent) => {
    if (serverContent?.modelTurn?.parts) {
      // AI is speaking, clear silence detection
      clearSilenceTimeout();
      hasPromptedForSilenceRef.current = false;
      
      for (const part of serverContent.modelTurn.parts) {
        if (part?.inlineData?.data && part?.inlineData?.mimeType?.startsWith('audio/pcm')) {
          await playStreamingChunk(part.inlineData.data, part.inlineData.mimeType);
        }
      }
    }

    if (serverContent?.interrupted) {
      audioBufferQueueRef.current = [];
      isPlaybackStartedRef.current = false;
      stopPlaybackContext();
      clearSilenceTimeout();
    }

    if (serverContent?.turnComplete) {
      if (audioBufferQueueRef.current.length > 0) {
        if (!isPlaybackStartedRef.current) {
          isPlaybackStartedRef.current = true;
          const ctx = playbackContextRef.current;
          if (ctx) playbackNextStartRef.current = ctx.currentTime + 0.05;
        }
        flushAudioQueue();
      }
      
      // Wait for audio to finish playing, then start silence detection
      setTimeout(() => { 
        isPlaybackStartedRef.current = false;
        // Start silence detection after AI finishes speaking
        startSilenceDetection();
      }, 100);
    }
  };

  // ========== CONNECTION ==========
  useEffect(() => {
    // ✅ FIX: Wait only if resume is being processed
    if (resumeStatus === 'processing') return;
    
    // ✅ FIX: Connect when status is 'ready' (works for both with/without resume)
    if (resumeStatus === 'ready' && !hasConnectedRef.current) {
      hasConnectedRef.current = true;
      connectToGemini();
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
      stopRecording();
      stopPlaybackContext();
      clearSilenceTimeout();
    };
  }, [resumeStatus]);

  const connectToGemini = async () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      alert('Please set NEXT_PUBLIC_GEMINI_API_KEY in your .env.local file');
      return;
    }

    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';
    const wsUrl =
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent' +
      `?key=${apiKey}`;

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setIsConnected(true);

      // ✅ IMPROVED: Natural, conversational system prompt
      let systemInstruction = `You are Aarav, a senior technical interviewer having a natural voice conversation with a candidate. Be warm, professional, and conversational—like a real human interviewer would be.

VOICE STYLE:
- Speak naturally in English with Indian accent
- Use casual interjections: "Cool", "Got it", "Makes sense", "Fair enough", "Alright"
- Keep sentences short and clear for voice
- Ask ONE question at a time
- Don't sound robotic or formal—be friendly but professional

INTERVIEW FLOW:
1. Brief greeting (15-20 seconds)
   ${resumeFile && resumeStatus === 'ready' ? 
     `- Say hi and mention you've reviewed their resume
   - Ask them to briefly walk through their background (60 seconds)` :
     `- Say hi and ask them to introduce themselves
   - Get their name, current role, experience level, and main tech stack`}

2. Deep dive into experience (main section)
   - Pick their strongest recent project or role
   - Ask about: technical decisions, challenges, trade-offs, impact
   - Follow up based on their answers (not generic questions)
   - Examples: "Why that approach?", "What would you change?", "How did you debug it?"

3. Technical questions (pick 3-4 relevant ones)
   - Base questions on their actual experience
   - Keep it practical and realistic
   - If stuck, give a small hint and move on

4. Quick scenario (1-2 minutes)
   - Give one real-world problem from their domain
   - Ask how they'd approach it

5. Wrap up
   - Thank them and ask if they have questions
   - Keep it brief

INTERVIEW ENDING AND FEEDBACK:

   - If the candidate says they want to end the interview or session (phrases like):
     * "Ok, we can end the session"
     * "End the interview"
     * "Let's end here"
     * "I think we're done"
     * "Can we wrap up?"
   
     You MUST respond like a real interviewer would:
     - First, say something like: "Sure, that sounds good. Before we wrap up, do you have any questions for me?"
     - Wait for their response
     - If they have questions, answer them professionally
     - If they don't have questions, thank them and end gracefully
   
   - If the candidate asks for FEEDBACK on their performance:
     * "How did I do?"
     * "Can you give me feedback?"
     * "Where do I need to improve?"
     * "What are my strengths and weaknesses?"
     * "How was my performance?"
   
     You SHOULD provide constructive, honest feedback:
     - Highlight what they did well (be specific about their answers)
     - Point out areas for improvement (be constructive, not harsh)
     - Give actionable suggestions
     - Be encouraging but honest
     - Base feedback on their actual answers during the interview
     - This is DIFFERENT from explaining concepts - feedback is about their performance, which is appropriate

STRICT INTERVIEW MODE (HARD RULES — NO EXCEPTIONS):

   - This is a MOCK INTERVIEW, NOT a teaching session or tutorial.
   - NEVER explain concepts, definitions, technologies, frameworks, languages, or any technical topics.
   - If the candidate asks questions like:
     * "What is React?" / "What is React.js?"
     * "Explain Java" / "What is Java?"
     * "What is Python?" / "Can you explain Python?"
     * "What is JavaScript?" / "Tell me about JavaScript"
     * "What is [ANY TECHNOLOGY/CONCEPT]?"
     * "Can you teach me X?" / "Explain X to me"
     * "How does X work?" (when asking for explanations)
   
     You MUST politely refuse immediately and say something like:
     "Since this is an interview, I can't explain concepts or technologies. Please answer based on your understanding, or we can move to the next question."
   
   - Do NOT provide examples, definitions, tutorials, or hints that teach fundamentals.
   - Do NOT explain how technologies work, what they are, or their features.
   - You may ONLY ask interview-style questions or ask for clarifications about their experience.
   - If the candidate insists on explanations, politely refuse once more and immediately move to the next question.
   - Your role is to ASSESS knowledge, not to TEACH or EXPLAIN.
   
   IMPORTANT EXCEPTION - FEEDBACK IS ALLOWED:
   - When the candidate asks for FEEDBACK on their performance (not asking to explain concepts), you SHOULD provide it.
   - Performance feedback is different from explaining concepts - it's about evaluating their answers, which is appropriate for an interviewer.
   - You can give feedback on: their technical answers, problem-solving approach, communication, areas of strength, areas to improve.


   SILENCE AND NON-RESPONSE HANDLING (CRITICAL):

   - If the candidate does not respond for 5-10 seconds or gives no clear answer:
     - DO NOT repeat the same question.
     - DO NOT ask "Did you hear me?" or "Can you answer?"
     - Instead, gently prompt with ONE of these:
       * "Take your time — are you thinking about this, or should we move to the next question?"
       * "No worries if you're not sure. Are you thinking, or can we move on?"
       * "Feel free to take a moment. Should we continue with the next question?"
   
   - If there is still no response after your prompt (another 5-10 seconds):
     - Say something like:
       * "No worries. Let's move to the next question."
       * "That's okay. Let's continue with something else."
     - Then immediately move to the next question.
   
   - NEVER keep repeating the same question multiple times.
   - NEVER pressure or rush aggressively.
   - NEVER ask "Why aren't you answering?" or similar confrontational questions.
   - Keep it natural, understanding, and human-like.
   - If the candidate seems stuck, offer to move on rather than waiting indefinitely.
   
   
RULES:
- Stay focused on the interview—politely redirect off-topic questions
- Don't ask for sensitive personal data
- If they ask unrelated things (cooking, travel, etc.), say: "Let's keep this focused on the interview. Back to your experience..."
- Sound human—use natural pauses, don't enumerate things robotically
- Do not speak any other language other than english, even if they ask you just say we can only discuss in english
${resumeFile && resumeStatus === 'ready' ? `
RESUME CONTEXT:
Here's their resume text. Use it to ask specific questions about their projects, technologies, and impact:

${clipText(resumeText, 14000)}

Reference specific items from their resume when asking questions.` : ''}

Start naturally. If you have their resume, mention it. If not, ask them to introduce themselves. Keep it conversational.`;

      const setupMessage = {
        setup: {
          model: `models/${model}`,
          generation_config: {
            response_modalities: ['AUDIO'],
            speech_config: {
              voice_config: { prebuilt_voice_config: { voice_name: 'Kore' } },
            },
          },
          system_instruction: { parts: [{ text: systemInstruction }] },
          tools: [],
        },
      };

      try {
        wsRef.current.send(JSON.stringify(setupMessage));
        
        // ✅ Start recording automatically
        setTimeout(() => startRecording(), 500);

        // ✅ Trigger greeting
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              client_content: {
                turns: [{ 
                  role: 'user', 
                  parts: [{ text: 'Start the interview with a natural greeting.' }] 
                }],
                turn_complete: true,
              },
            }));
          }
        }, 200);
      } catch (e) {
        console.error('Setup failed:', e);
      }
    };

    wsRef.current.onmessage = async (event) => {
      let raw = event.data;
      if (raw instanceof Blob) {
        try { raw = await raw.text(); } 
        catch (err) { return; }
      }

      try {
        const response = JSON.parse(raw);
        if (response?.serverContent) {
          handleServerResponse(response.serverContent);
        }
      } catch (err) {
        console.error('Message parse error:', err);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
      isRecordingRef.current = false;
      stopPlaybackContext();
      clearSilenceTimeout();
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (_) {}
        audioContextRef.current = null;
      }
    };
  };

  // ========== RECORDING ==========
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioCtx({ sampleRate: 24000 });

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Detect if user is speaking (check audio volume)
        const volume = Math.sqrt(
          inputData.reduce((sum, sample) => sum + sample * sample, 0) / inputData.length
        );
        const speechThreshold = 0.01; // Adjust this threshold as needed
        
        if (volume > speechThreshold) {
          handleUserSpeech();
        }
        
        const pcmData = convertFloat32ToInt16(inputData);
        const base64Data = arrayBufferToBase64(pcmData.buffer);

        try {
          wsRef.current.send(JSON.stringify({
            realtime_input: { 
              media_chunks: [{ data: base64Data, mime_type: 'audio/pcm;rate=24000' }] 
            },
          }));
        } catch (err) {
          console.error('Audio send error:', err);
        }
      };

      mediaRecorderRef.current = { stream, processor, source };
      setIsRecording(true);
      isRecordingRef.current = true;
    } catch (error) {
      console.error('Microphone error:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      const { stream, processor, source } = mediaRecorderRef.current;
      try {
        processor?.disconnect();
        source?.disconnect();
        stream?.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      mediaRecorderRef.current = null;
    }

    if (audioContextRef.current?.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null;
    }

    setIsRecording(false);
    isRecordingRef.current = false;
    clearSilenceTimeout();

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ realtime_input: { turn_complete: true } }));
      } catch (err) {
        console.error('Turn complete error:', err);
      }
    }
  };

  const toggleRecording = () => {
    if (isPlayingRef.current) return;
    isRecording ? stopRecording() : startRecording();
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (playbackGainRef.current) playbackGainRef.current.gain.value = newMuted ? 0 : 1;
  };

  const toggleCamera = () => {
    isCameraOn ? stopCamera() : startCamera();
  };

  const endInterview = () => {
    try { if (wsRef.current) wsRef.current.close(); } catch (_) {}
    stopRecording();
    stopPlaybackContext();
    stopCamera();
    clearSilenceTimeout();
    hasConnectedRef.current = false;
    onRestart();
  };

  // ========== UI ==========
  if (resumeStatus === 'processing') {
    return (
      <div className="w-full max-w-6xl flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="text-gray-300 text-lg">Processing your resume...</p>
        <p className="text-gray-500 text-sm">This will only take a moment</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-sm text-gray-300">
          {resumeFile ? (
            resumeStatus === 'ready' ? (
              `Resume-based interview: ${resumeFile.name} ✓`
            ) : (
              `Resume extraction failed - general interview mode`
            )
          ) : (
            'General mock interview'
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <Link href="/" className="hover:text-white transition">Home</Link>
          <button onClick={onRestart} className="hover:text-white transition">Restart</button>
        </div>
      </div>

      <div className="bg-[#0b1220] border border-[#1a2336] rounded-2xl shadow-2xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* YOU */}
          <div className="relative aspect-video rounded-xl bg-[#10192c] overflow-hidden flex items-center justify-center">
            <div className="absolute top-3 left-3 text-sm text-gray-200 font-medium z-10">You</div>

            {isCameraOn ? (
              <video
                ref={localVideoRef}
                className="h-full w-full object-cover scale-x-[-1]"
                muted
                playsInline
                autoPlay
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-gray-800 flex items-center justify-center text-4xl">
                👤
              </div>
            )}

            {isRecording && (
              <div className="absolute top-3 right-3 z-10">
                <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse"></div>
              </div>
            )}

            {cameraError && (
              <div className="absolute bottom-3 right-3 text-[10px] text-red-300 bg-black/60 px-2 py-1 rounded z-10">
                {cameraError}
              </div>
            )}
          </div>

          {/* AI */}
          <div className="relative aspect-video rounded-xl bg-[#10192c] overflow-hidden">
            {!isAISpeaking && (
              <img
                src="/female-05-img.png"
                alt="AI Avatar"
                className="h-full w-full object-cover"
              />
            )}

            {isAISpeaking && (
              <video
                ref={aiVideoRef}
                src="/female-05.mp4"
                className="h-full w-full object-cover"
                loop
                muted
                playsInline
              />
            )}

            <div className="absolute top-3 left-3 text-sm text-gray-200 font-medium z-10">
              Aarav (AI)
            </div>

            {isConnected && (
              <div className="absolute bottom-3 right-3 text-xs text-emerald-300 bg-black/60 px-3 py-1 rounded-full z-10">
                {isAISpeaking ? 'Speaking...' : 'Listening...'}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={endInterview}
            className="rounded-full bg-red-500 px-6 py-2 font-semibold text-white hover:bg-red-400 transition"
          >
            End Interview
          </button>

          <button
            onClick={toggleCamera}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              isCameraOn
                ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
            }`}
          >
            {isCameraOn ? ' Camera On' : ' Camera Off'}
          </button>

          <button
            onClick={toggleMute}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              isMuted
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
            }`}
          >
            {isMuted ? ' Muted' : ' Audio On'}
          </button>

          {/* <button
            onClick={toggleRecording}
            disabled={isPlayingRef.current}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              isRecording
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isRecording ? ' Recording' : ' Start Mic'}
          </button> */}
        </div>
      </div>
    </div>
  );
};

export default GeminiLiveStage;