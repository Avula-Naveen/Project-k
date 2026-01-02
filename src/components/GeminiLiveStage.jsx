
// 'use client';

// import React, { useState, useRef, useEffect } from 'react';
// import Link from 'next/link';

// const GeminiLiveStage = ({ resumeFile, onRestart }) => {
//   const [isRecording, setIsRecording] = useState(false);
//   const [isConnected, setIsConnected] = useState(false);
//   const [isMuted, setIsMuted] = useState(false);
//   const [isAISpeaking, setIsAISpeaking] = useState(false);
//   const [resumeText, setResumeText] = useState('');
//   const [resumeStatus, setResumeStatus] = useState('idle');
//   const [isCameraOn, setIsCameraOn] = useState(false);
//   const [cameraError, setCameraError] = useState('');
//   const [errorMessage, setErrorMessage] = useState(null);

//   const wsRef = useRef(null);

//   // Capture (mic)
//   const audioContextRef = useRef(null);
//   const mediaRecorderRef = useRef(null);
//   const isRecordingRef = useRef(false);

//   // Video
//   const aiVideoRef = useRef(null);
//   const localVideoRef = useRef(null);
//   const cameraStreamRef = useRef(null);

//   // Playback (AI audio)
//   const playbackContextRef = useRef(null);
//   const playbackGainRef = useRef(null);
//   const isPlayingRef = useRef(false);
//   const playbackNextStartRef = useRef(0);
//   const audioBufferQueueRef = useRef([]);
//   const isPlaybackStartedRef = useRef(false);
//   const activeSourcesRef = useRef([]);
//   const playbackSampleRateRef = useRef(24000);

//   // Connection guard
//   const hasConnectedRef = useRef(false);

//   // Silence handling
//   const silenceTimeoutRef = useRef(null);
//   const idleCheckTimeoutRef = useRef(null);
//   const hasPromptedForSilenceRef = useRef(false);
//   const lastUserSpeechTimeRef = useRef(null);

//   // Simple VAD smoothing
//   const speechFramesRef = useRef(0);
  
//   // Echo gate / barge-in protection
//   const isAISpeakingRef = useRef(false);
//   useEffect(() => {
//     isAISpeakingRef.current = isAISpeaking;
//   }, [isAISpeaking]);

//   // ========== HELPERS ==========
//   const normalizeText = (t) =>
//     (t || '').replace(/\s+/g, ' ').replace(/(\s*\n\s*)+/g, '\n').trim();

//   const clipText = (t, maxChars = 14000) => {
//     const s = t || '';
//     return s.length <= maxChars ? s : s.slice(0, maxChars) + '\n...[TRUNCATED]';
//   };

//   // Faster base64 encoder for TypedArrays (chunked to avoid huge apply / per-byte loops)
//   const uint8ToBase64 = (u8) => {
//     let binary = '';
//     const chunkSize = 0x8000;
//     for (let i = 0; i < u8.length; i += chunkSize) {
//       binary += String.fromCharCode(...u8.subarray(i, i + chunkSize));
//     }
//     return btoa(binary);
//   };

//   const convertFloat32ToInt16 = (float32Array) => {
//     const int16Array = new Int16Array(float32Array.length);
//     for (let i = 0; i < float32Array.length; i++) {
//       const s = Math.max(-1, Math.min(1, float32Array[i]));
//       int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
//     }
//     return int16Array;
//   };

//   // Linear resampler (lightweight) to force 24k PCM
//   const resampleFloat32Linear = (input, inRate, outRate) => {
//     if (!input || input.length === 0) return new Float32Array(0);
//     if (inRate === outRate) return input;

//     // Fast path for common 48000 -> 24000 (downsample by 2)
//     if (inRate === 48000 && outRate === 24000) {
//       const out = new Float32Array(Math.floor(input.length / 2));
//       for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = input[i];
//       return out;
//     }

//     const ratio = outRate / inRate;
//     const outLen = Math.max(1, Math.floor(input.length * ratio));
//     const out = new Float32Array(outLen);

//     const step = inRate / outRate; // how many input samples per one output sample
//     for (let i = 0; i < outLen; i++) {
//       const pos = i * step;
//       const idx = Math.floor(pos);
//       const frac = pos - idx;
//       const s0 = input[idx] ?? 0;
//       const s1 = input[idx + 1] ?? s0;
//       out[i] = s0 + (s1 - s0) * frac;
//     }
//     return out;
//   };

//   // ========== CAMERA ==========
//   const startCamera = async () => {
//     if (typeof window === 'undefined') return;
//     try {
//       setCameraError('');
//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
//         audio: false,
//       });
//       cameraStreamRef.current = stream;
//       if (localVideoRef.current) {
//         localVideoRef.current.srcObject = stream;
//         try {
//           await localVideoRef.current.play();
//           setIsCameraOn(true);
//         } catch (err) {
//           console.error('Video play error:', err);
//           setCameraError('Video play failed: ' + err.message);
//           setIsCameraOn(false);
//           // Stop the stream if video can't play
//           stream.getTracks().forEach((t) => t.stop());
//           cameraStreamRef.current = null;
//         }
//       } else {
//         setIsCameraOn(true);
//       }
//     } catch (err) {
//       console.error('Camera error:', err);
//       setCameraError('Camera unavailable');
//       setIsCameraOn(false);
//     }
//   };

//   const stopCamera = () => {
//     if (cameraStreamRef.current) {
//       cameraStreamRef.current.getTracks().forEach((t) => t.stop());
//       cameraStreamRef.current = null;
//     }
//     if (localVideoRef.current) localVideoRef.current.srcObject = null;
//     setIsCameraOn(false);
//   };

//   useEffect(() => {
//     startCamera();
//     return () => stopCamera();
//   }, []);

//   // ========== RESUME EXTRACTION ==========
//   const extractTextFromPDF = async (file) => {
//     try {
//       setResumeStatus('processing');
//       setResumeText('');

//       const pdfjsMod = await import('pdfjs-dist');
//       const pdfjs = pdfjsMod.default ?? pdfjsMod;
//       pdfjs.GlobalWorkerOptions.workerSrc =
//         `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

//       const arrayBuffer = await file.arrayBuffer();
//       const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

//       let fullText = '';
//       for (let i = 1; i <= pdf.numPages; i++) {
//         const page = await pdf.getPage(i);
//         const textContent = await page.getTextContent();
//         const pageText = textContent.items.map((item) => item.str).join(' ');
//         fullText += pageText + '\n';
//       }

//       const cleaned = normalizeText(fullText);
//       if (!cleaned) {
//         setResumeStatus('failed');
//         return;
//       }

//       setResumeText(cleaned);
//       setResumeStatus('ready');
//     } catch (error) {
//       console.error('PDF extraction error:', error);
//       setResumeStatus('failed');
//     }
//   };

//   useEffect(() => {
//     if (resumeFile) {
//       extractTextFromPDF(resumeFile);
//     } else {
//       setResumeText('');
//       setResumeStatus('ready');
//     }
//   }, [resumeFile]);

//   // ========== AI AVATAR VIDEO ==========
//   useEffect(() => {
//     if (!aiVideoRef.current) return;
//     if (isAISpeaking) {
//       aiVideoRef.current.play().catch(() => {});
//     } else {
//       aiVideoRef.current.pause();
//     }
//   }, [isAISpeaking]);

//   // ========== SILENCE DETECTION (robust) ==========
//   const clearSilenceTimeout = () => {
//     if (silenceTimeoutRef.current) {
//       clearTimeout(silenceTimeoutRef.current);
//       silenceTimeoutRef.current = null;
//     }
//   };

//   const clearIdleCheckTimeout = () => {
//     if (idleCheckTimeoutRef.current) {
//       clearTimeout(idleCheckTimeoutRef.current);
//       idleCheckTimeoutRef.current = null;
//     }
//   };

//   const promptUserForResponse = () => {
//     if (
//       hasPromptedForSilenceRef.current ||
//       !wsRef.current ||
//       wsRef.current.readyState !== WebSocket.OPEN
//     ) {
//       return;
//     }

//     hasPromptedForSilenceRef.current = true;
//     try {
//       wsRef.current.send(
//         JSON.stringify({
//           client_content: {
//             turns: [
//               {
//                 role: 'user',
//                 parts: [
//                   {
//                     text:
//                       'The candidate has not responded for a while. Please ask them: "Are you thinking about this, or should we move to the next question?" Keep it brief and natural.',
//                   },
//                 ],
//               },
//             ],
//             turn_complete: true,
//           },
//         })
//       );
//     } catch (err) {
//       console.error('Silence prompt error:', err);
//     }
//   };

//   const startSilenceDetection = () => {
//     clearSilenceTimeout();
//     hasPromptedForSilenceRef.current = false;

//     silenceTimeoutRef.current = setTimeout(() => {
//       // only prompt if we are truly idle (not playing, not queued)
//       const playing = isPlayingRef.current;
//       const queued = audioBufferQueueRef.current.length > 0 || activeSourcesRef.current.length > 0;
//       if (!playing && !queued) promptUserForResponse();
//     }, 4500);
//   };

//   const armSilenceDetectionWhenIdle = () => {
//     clearSilenceTimeout();
//     clearIdleCheckTimeout();
//     hasPromptedForSilenceRef.current = false;

//     const check = () => {
//       const stillPlaying =
//         isPlayingRef.current ||
//         audioBufferQueueRef.current.length > 0 ||
//         activeSourcesRef.current.length > 0;

//       if (stillPlaying) {
//         idleCheckTimeoutRef.current = setTimeout(check, 80);
//         return;
//       }

//       startSilenceDetection();
//     };

//     check();
//   };

//   const handleUserSpeech = () => {
//     clearSilenceTimeout();
//     clearIdleCheckTimeout();
//     hasPromptedForSilenceRef.current = false;
//     lastUserSpeechTimeRef.current = Date.now();
//   };

//   // ========== AUDIO PLAYBACK ==========
//   const stopPlaybackContext = () => {
//     clearIdleCheckTimeout();
//     clearSilenceTimeout();

//     activeSourcesRef.current.forEach((source) => {
//       try {
//         source.stop();
//       } catch (_) {}
//     });
//     activeSourcesRef.current = [];

//     if (playbackContextRef.current) {
//       try {
//         playbackContextRef.current.close();
//       } catch (_) {}
//     }

//     playbackContextRef.current = null;
//     playbackGainRef.current = null;
//     isPlayingRef.current = false;
//     setIsAISpeaking(false);

//     playbackNextStartRef.current = 0;
//     audioBufferQueueRef.current = [];
//     isPlaybackStartedRef.current = false;
//   };

//   const ensurePlaybackContext = async (sampleRate = 24000) => {
//     if (typeof window === 'undefined') return;

//     const desiredRate = sampleRate;
//     playbackSampleRateRef.current = desiredRate;

//     if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
//       const AudioCtx = window.AudioContext || window.webkitAudioContext;
//       const ctx = new AudioCtx({ sampleRate: desiredRate });
//       const gain = ctx.createGain();

//       // IMPORTANT: mute should not drop audio; keep the pipeline in sync, just mute output
//       gain.gain.value = isMuted ? 0 : 1;
//       gain.connect(ctx.destination);

//       playbackContextRef.current = ctx;
//       playbackGainRef.current = gain;
//       playbackNextStartRef.current = ctx.currentTime;

//       try {
//         if (ctx.state === 'suspended') await ctx.resume();
//       } catch (_) {}
//     } else {
//       // keep gain in sync with isMuted
//       if (playbackGainRef.current) playbackGainRef.current.gain.value = isMuted ? 0 : 1;

//       try {
//         if (playbackContextRef.current.state === 'suspended') await playbackContextRef.current.resume();
//       } catch (_) {}
//     }
//   };

//   const flushAudioQueue = () => {
//     const ctx = playbackContextRef.current;
//     const gain = playbackGainRef.current;
//     if (!ctx || !gain) return;

//     // Limit queue size to prevent lag buildup (drop old chunks if queue gets too large)
//     const MAX_QUEUE_SIZE = 6; // Reduced from 10 to prevent lag
//     if (audioBufferQueueRef.current.length > MAX_QUEUE_SIZE) {
//       console.warn(`Audio queue too large (${audioBufferQueueRef.current.length}), dropping old chunks`);
//       // Keep only the most recent chunks
//       audioBufferQueueRef.current = audioBufferQueueRef.current.slice(-MAX_QUEUE_SIZE);
//     }

//     while (audioBufferQueueRef.current.length > 0) {
//       const audioBuffer = audioBufferQueueRef.current.shift();
//       const source = ctx.createBufferSource();
//       source.buffer = audioBuffer;
//       source.connect(gain);

//       const startAt = Math.max(ctx.currentTime, playbackNextStartRef.current);
//       source.start(startAt);
//       playbackNextStartRef.current = startAt + audioBuffer.duration;
//       activeSourcesRef.current.push(source);

//       isPlayingRef.current = true;
//       setIsAISpeaking(true);

//       source.onended = () => {
//         const idx = activeSourcesRef.current.indexOf(source);
//         if (idx > -1) activeSourcesRef.current.splice(idx, 1);

//         // If nothing is queued/active, we are idle now
//         const stillActive = activeSourcesRef.current.length > 0;
//         const stillQueued = audioBufferQueueRef.current.length > 0;

//         if (!stillActive && !stillQueued) {
//           isPlayingRef.current = false;
//           setIsAISpeaking(false);
//           // start silence detection only once truly idle
//           armSilenceDetectionWhenIdle();
//         }
//       };
//     }
//   };

//   const playStreamingChunk = async (base64Data, mimeType) => {
//     try {
//       // Parse sample rate if present
//       let sampleRate = 24000;
//       const m = mimeType && mimeType.match(/rate=(\d+)/);
//       if (m && m[1]) sampleRate = parseInt(m[1], 10) || 24000;

//       // Create playback context at the first chunk's rate
//       // Always use the current chunk's sample rate to ensure consistency
//       if (!playbackContextRef.current) {
//         await ensurePlaybackContext(sampleRate);
//       } else if (playbackSampleRateRef.current !== sampleRate) {
//         // If sample rate changed, recreate context with new rate
//         await ensurePlaybackContext(sampleRate);
//       } else {
//         await ensurePlaybackContext(playbackSampleRateRef.current);
//       }

//       const ctx = playbackContextRef.current;
//       if (!ctx) return;

//       // Decode base64 -> Int16 -> Float32
//       const binaryString = atob(base64Data);
//       const bytes = new Uint8Array(binaryString.length);
//       for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

//       const int16 = new Int16Array(bytes.buffer);
//       const float32 = new Float32Array(int16.length);
//       for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

//       // Use the parsed sampleRate for buffer creation (works when ctx sampleRate matches; otherwise WebAudio handles internal conversion)
//       const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
//       audioBuffer.getChannelData(0).set(float32);

//       // Prevent queue from growing too large (drop oldest if queue is full)
//       const MAX_QUEUE_SIZE = 6; // Reduced to prevent lag buildup
//       if (audioBufferQueueRef.current.length >= MAX_QUEUE_SIZE) {
//         // Drop the oldest chunk to prevent lag
//         audioBufferQueueRef.current.shift();
//       }

//       audioBufferQueueRef.current.push(audioBuffer);

//       // Start playback with smaller buffer to reduce latency (1 chunk instead of 2)
//       if (!isPlaybackStartedRef.current && audioBufferQueueRef.current.length >= 1) {
//         isPlaybackStartedRef.current = true;
//         playbackNextStartRef.current = ctx.currentTime + 0.03; // Reduced delay
//         flushAudioQueue();
//       } else if (isPlaybackStartedRef.current) {
//         flushAudioQueue();
//       }
//     } catch (err) {
//       console.error('Audio streaming error:', err);
//     }
//   };

//   const handleServerResponse = async (serverContent) => {
//     if (serverContent?.modelTurn?.parts) {
//       // AI started responding => cancel silence timers
//       clearSilenceTimeout();
//       clearIdleCheckTimeout();
//       hasPromptedForSilenceRef.current = false;

//       for (const part of serverContent.modelTurn.parts) {
//         if (part?.inlineData?.data && part?.inlineData?.mimeType?.startsWith('audio/pcm')) {
//           await playStreamingChunk(part.inlineData.data, part.inlineData.mimeType);
//         }
//       }
//     }

//     if (serverContent?.interrupted) {
//       audioBufferQueueRef.current = [];
//       isPlaybackStartedRef.current = false;
//       stopPlaybackContext();
//       clearSilenceTimeout();
//       clearIdleCheckTimeout();
//     }

//     if (serverContent?.turnComplete) {
//       // Flush any remaining buffers
//       if (audioBufferQueueRef.current.length > 0) {
//         if (!isPlaybackStartedRef.current) {
//           isPlaybackStartedRef.current = true;
//           const ctx = playbackContextRef.current;
//           if (ctx) playbackNextStartRef.current = ctx.currentTime + 0.05;
//         }
//         flushAudioQueue();
//       }

//       // If AI had no audio chunks, we are already idle => arm silence
//       armSilenceDetectionWhenIdle();
//     }
//   };

//   // ========== CONNECTION ==========
//   useEffect(() => {
//     if (resumeStatus === 'processing') return;

//     if (resumeStatus === 'ready' && !hasConnectedRef.current) {
//       hasConnectedRef.current = true;
//       connectToGemini();
//     }

//     return () => {
//       // Cleanup order matters:
//       // 1) stop recording (may try to send turn_complete)
//       // 2) close WS
//       // 3) stop playback / timers
//       stopRecording();
//       try {
//         if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
//       } catch (_) {}
//       stopPlaybackContext();
//       clearSilenceTimeout();
//       clearIdleCheckTimeout();
//     };
//   }, [resumeStatus]);

//   const connectToGemini = async () => {
//     const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
//     if (!apiKey) {
//       setErrorMessage('Please set NEXT_PUBLIC_GEMINI_API_KEY in your .env.local file');
//       setTimeout(() => setErrorMessage(null), 5000);
//       return;
//     }

//     const model = 'gemini-2.5-flash-native-audio-preview-09-2025';
//     const wsUrl =
//       'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent' +
//       `?key=${apiKey}`;

//     wsRef.current = new WebSocket(wsUrl);

//     wsRef.current.onopen = () => {
//       setIsConnected(true);

//       let systemInstruction = `You are Aarav, a senior technical interviewer having a natural voice conversation with a candidate. Be warm, professional, and conversational—like a real human interviewer would be.

// VOICE STYLE:
// - Speak naturally in English with Indian accent
// - Use casual interjections: "Cool", "Got it", "Makes sense", "Fair enough", "Alright"
// - Keep sentences short and clear for voice
// - Ask ONE question at a time
// - Don't sound robotic or formal—be friendly but professional

// INTERVIEW FLOW:
// 1. Brief greeting (15-20 seconds)
//    ${resumeFile && resumeStatus === 'ready'
//         ? `- Say hi and mention you've reviewed their resume
//    - Ask them to briefly walk through their background (60 seconds)`
//         : `- Say hi and ask them to introduce themselves
//    - Get their name, current role, experience level, and main tech stack`}

// 2. Deep dive into experience (main section)
//    - Pick their strongest recent project or role
//    - Ask about: technical decisions, challenges, trade-offs, impact
//    - Follow up based on their answers (not generic questions)
//    - Examples: "Why that approach?", "What would you change?", "How did you debug it?"

// 3. Technical questions (pick 3-4 relevant ones)
//    - Base questions on their actual experience
//    - Keep it practical and realistic

// 4. Quick scenario (1-2 minutes)
//    - Give one real-world problem from their domain
//    - Ask how they'd approach it
//    - Ask questions based on his technical skills
//    - Do ask only related to one topic ask questions related to all user skills

// 5. Wrap up
//    - Thank them and ask if they have questions
//    - Keep it brief

// INTERVIEW ENDING AND FEEDBACK:

//    - If the candidate says they want to end the interview or session (phrases like):
//      * "Ok, we can end the session"
//      * "End the interview"
//      * "Let's end here"
//      * "I think we're done"
//      * "Can we wrap up?"

//      You MUST respond like a real interviewer would:
//      - First, say something like: "Sure, that sounds good. Before we wrap up, do you have any questions for me?"
//      - Wait for their response
//      - If they have questions, answer them professionally
//      - If they don't have questions, thank them and end gracefully

//    - If the candidate asks for FEEDBACK on their performance:
//      * "How did I do?"
//      * "Can you give me feedback?"
//      * "Where do I need to improve?"
//      * "What are my strengths and weaknesses?"
//      * "How was my performance?"

//      You SHOULD provide constructive, honest feedback:
//      - Highlight what they did well (be specific about their answers)
//      - Point out areas for improvement (be constructive, not harsh)
//      - Give actionable suggestions
//      - Be encouraging but honest
//      - Base feedback on their actual answers during the interview

// STRICT INTERVIEW MODE (HARD RULES — NO EXCEPTIONS):

//    - This is a MOCK INTERVIEW, NOT a teaching session or tutorial.
//    - NEVER explain concepts, definitions, technologies, frameworks, languages, or any technical topics.
//    - If the candidate asks for explanations, politely refuse and ask them to answer based on their understanding, or move to the next question.
//    - Your role is to ASSESS knowledge, not to TEACH.

// SILENCE AND NON-RESPONSE HANDLING (CRITICAL):

//    - If the candidate does not respond for 5-10 seconds or gives no clear answer:
//      - DO NOT repeat the same question.
//      - Instead, gently prompt: "Take your time — are you thinking about this, or should we move to the next question?"
//    - If there is still no response after your prompt:
//      - Say: "No worries. Let's move to the next question."
//      - Then immediately move on.

// RULES:
// - Stay focused on the interview—politely redirect off-topic questions
// - Don't ask for sensitive personal data
// - You must ask questions related all user skills, do no just focus on one skill, ask questions in all the skills user mentioned
// - Only speak English. If asked to switch languages, politely refuse and continue in English.
// ${resumeFile && resumeStatus === 'ready'
//         ? `
// RESUME CONTEXT:
// Here's their resume text. Use it to ask specific questions about their projects, technologies, and impact:

// ${clipText(resumeText, 14000)}

// Reference specific items from their resume when asking questions.`
//         : ''}

// Start naturally. If you have their resume, mention it. If not, ask them to introduce themselves. Keep it conversational.`;

//       const setupMessage = {
//         setup: {
//           model: `models/${model}`,
//           generation_config: {
//             response_modalities: ['AUDIO'],
//             speech_config: {
//               voice_config: { prebuilt_voice_config: { voice_name: 'Kore' } },
//             },
//           },
//           system_instruction: { parts: [{ text: systemInstruction }] },
//           tools: [],
//         },
//       };

//       try {
//         wsRef.current.send(JSON.stringify(setupMessage));

//         // Start recording automatically
//         setTimeout(() => startRecording(), 500);

//         // Trigger greeting
//         setTimeout(() => {
//           if (wsRef.current?.readyState === WebSocket.OPEN) {
//             wsRef.current.send(
//               JSON.stringify({
//                 client_content: {
//                   turns: [{ role: 'user', parts: [{ text: 'Start the interview with a natural greeting.' }] }],
//                   turn_complete: true,
//                 },
//               })
//             );
//           }
//         }, 200);
//       } catch (e) {
//         console.error('Setup failed:', e);
//       }
//     };

//     wsRef.current.onmessage = async (event) => {
//       let raw = event.data;
//       if (raw instanceof Blob) {
//         try {
//           raw = await raw.text();
//         } catch (err) {
//           return;
//         }
//       }

//       try {
//         const response = JSON.parse(raw);
//         if (response?.serverContent) {
//           handleServerResponse(response.serverContent);
//         }
//       } catch (err) {
//         console.error('Message parse error:', err);
//       }
//     };

//     wsRef.current.onerror = (error) => {
//       console.error('WebSocket error:', error);
//       setIsConnected(false);
//     };

//     wsRef.current.onclose = () => {
//       setIsConnected(false);
//       setIsRecording(false);
//       isRecordingRef.current = false;

//       stopPlaybackContext();
//       clearSilenceTimeout();
//       clearIdleCheckTimeout();

//       if (audioContextRef.current) {
//         try {
//           audioContextRef.current.close();
//         } catch (_) {}
//         audioContextRef.current = null;
//       }
//     };
//   };

//   // ========== RECORDING ==========
//   const startRecording = async () => {
//     try {
//       if (typeof window === 'undefined') return;
//       if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

//       const stream = await navigator.mediaDevices.getUserMedia({
//         audio: {
//           channelCount: 1,
//           echoCancellation: true,
//           noiseSuppression: true,
//           autoGainControl: true,
//         },
//       });

//       const AudioCtx = window.AudioContext || window.webkitAudioContext;
//       audioContextRef.current = new AudioCtx(); // let browser choose rate; we resample to 24k

//       const source = audioContextRef.current.createMediaStreamSource(stream);
//       const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);

//       // IMPORTANT: avoid routing to speakers; connect to a zero-gain node instead
//       const zeroGain = audioContextRef.current.createGain();
//       zeroGain.gain.value = 0;

//       source.connect(processor);
//       processor.connect(zeroGain);
//       zeroGain.connect(audioContextRef.current.destination);

//       // reset VAD smoothing
//       speechFramesRef.current = 0;

//       processor.onaudioprocess = (e) => {
//         if (!isRecordingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

//         const inputData = e.inputBuffer.getChannelData(0);

//         // Efficient RMS (no reduce)
//         let sum = 0;
//         for (let i = 0; i < inputData.length; i++) {
//           const s = inputData[i];
//           sum += s * s;
//         }
//         const rms = Math.sqrt(sum / inputData.length);

//         // Smooth & require consecutive frames to count as "speech"
//         const threshold = 0.012; // tune if needed
//         const requiredFrames = 3;
//         const bargeInThreshold = 0.025; // Higher threshold for interrupting AI

//         if (rms > threshold) {
//           speechFramesRef.current += 1;
//         } else {
//           speechFramesRef.current = Math.max(0, speechFramesRef.current - 1);
//         }

//         if (speechFramesRef.current >= requiredFrames) {
//           handleUserSpeech();
//         }

//         // ECHO GATE / BARGE-IN PROTECTION:
//         // If AI is speaking, only send user audio if user is actually speaking loudly (barge-in)
//         // This prevents echo and allows natural interruption
//         const aiTalking = isAISpeakingRef.current;
//         const userIsActuallySpeaking = rms > bargeInThreshold; // User must speak loudly to interrupt

//         if (aiTalking && !userIsActuallySpeaking) {
//           // AI is speaking and user is not speaking loudly enough - don't send audio
//           return;
//         }

//         // Resample to 24k for server
//         const inRate = audioContextRef.current?.sampleRate || 48000;
//         const resampled = resampleFloat32Linear(inputData, inRate, 24000);

//         const pcmData = convertFloat32ToInt16(resampled);
//         const base64Data = uint8ToBase64(new Uint8Array(pcmData.buffer));

//         try {
//           wsRef.current.send(
//             JSON.stringify({
//               realtime_input: {
//                 media_chunks: [{ data: base64Data, mime_type: 'audio/pcm;rate=24000' }],
//               },
//             })
//           );
//         } catch (err) {
//           console.error('Audio send error:', err);
//         }
//       };

//       mediaRecorderRef.current = { stream, processor, source, zeroGain };
//       setIsRecording(true);
//       isRecordingRef.current = true;

//       clearSilenceTimeout();
//       clearIdleCheckTimeout();
//     } catch (error) {
//       console.error('Microphone error:', error);
//       setErrorMessage('Could not access microphone. Please check permissions.');
//       setTimeout(() => setErrorMessage(null), 5000);
//     }
//   };

//   const stopRecording = () => {
//     // mark off first (prevents new audio frames sending while tearing down)
//     isRecordingRef.current = false;
//     setIsRecording(false);

//     clearSilenceTimeout();
//     clearIdleCheckTimeout();

//     if (mediaRecorderRef.current) {
//       const { stream, processor, source, zeroGain } = mediaRecorderRef.current;
//       try {
//         processor?.disconnect();
//         source?.disconnect();
//         zeroGain?.disconnect();
//         stream?.getTracks().forEach((track) => track.stop());
//       } catch (_) {}
//       mediaRecorderRef.current = null;
//     }

//     if (audioContextRef.current?.state !== 'closed') {
//       try {
//         audioContextRef.current.close();
//       } catch (_) {}
//       audioContextRef.current = null;
//     }

//     // only send turn_complete if WS is open
//     if (wsRef.current?.readyState === WebSocket.OPEN) {
//       try {
//         wsRef.current.send(JSON.stringify({ realtime_input: { turn_complete: true } }));
//       } catch (err) {
//         console.error('Turn complete error:', err);
//       }
//     }
//   };

//   const toggleMute = () => {
//     const newMuted = !isMuted;
//     setIsMuted(newMuted);
//     // keep playback pipeline; just toggle gain
//     if (playbackGainRef.current) playbackGainRef.current.gain.value = newMuted ? 0 : 1;
//   };

//   const toggleCamera = () => {
//     isCameraOn ? stopCamera() : startCamera();
//   };

//   const endInterview = () => {
//     // Stop recording first, then close WS
//     stopRecording();

//     try {
//       if (wsRef.current) wsRef.current.close();
//     } catch (_) {}

//     stopPlaybackContext();
//     stopCamera();
//     clearSilenceTimeout();
//     clearIdleCheckTimeout();

//     hasConnectedRef.current = false;
//     onRestart();
//   };

//   // ========== UI ==========
//   if (resumeStatus === 'processing') {
//     return (
//       <div className="w-full max-w-6xl flex flex-col items-center justify-center min-h-[60vh] space-y-4">
//         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
//         <p className="text-gray-300 text-lg">Processing your resume...</p>
//         <p className="text-gray-500 text-sm">This will only take a moment</p>
//       </div>
//     );
//   }

//   return (
//     <div className="w-full max-w-6xl space-y-4">
//       <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
//         <div className="text-sm text-gray-300">
//           {resumeFile ? (
//             resumeStatus === 'ready' ? (
//               `Resume-based interview: ${resumeFile.name} ✓`
//             ) : (
//               `Resume extraction failed - general interview mode`
//             )
//           ) : (
//             'General mock interview'
//           )}
//         </div>
//         <div className="flex items-center gap-3 text-sm text-gray-400">
//           <Link href="/" className="hover:text-white transition">
//             Home
//           </Link>
//           <button onClick={onRestart} className="hover:text-white transition">
//             Restart
//           </button>
//         </div>
//       </div>

//       <div className="bg-[#0b1220] border border-[#1a2336] rounded-2xl shadow-2xl p-4 space-y-4">
//         {/* Error Message */}
//         {errorMessage && (
//           <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
//             <div className="flex items-center justify-between">
//               <p className="text-red-300 text-sm">{errorMessage}</p>
//               <button
//                 onClick={() => setErrorMessage(null)}
//                 className="text-red-300 hover:text-red-200 text-lg font-bold ml-4"
//               >
//                 ×
//               </button>
//             </div>
//           </div>
//         )}

//         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//           {/* YOU */}
//           <div className="relative aspect-video rounded-xl bg-[#10192c] overflow-hidden flex items-center justify-center">
//             <div className="absolute top-3 left-3 text-sm text-gray-200 font-medium z-10">You</div>

//             {isCameraOn ? (
//               <video
//                 ref={localVideoRef}
//                 className="h-full w-full object-cover scale-x-[-1]"
//                 muted
//                 playsInline
//                 autoPlay
//               />
//             ) : (
//               <div className="h-20 w-20 rounded-full bg-gray-800 flex items-center justify-center text-4xl">
//                 👤
//               </div>
//             )}

//             {isRecording && (
//               <div className="absolute top-3 right-3 z-10">
//                 <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse"></div>
//               </div>
//             )}

//             {cameraError && (
//               <div className="absolute bottom-3 right-3 text-[10px] text-red-300 bg-black/60 px-2 py-1 rounded z-10">
//                 {cameraError}
//               </div>
//             )}
//           </div>

//           {/* AI */}
//           <div className="relative aspect-video rounded-xl bg-[#10192c] overflow-hidden">
//             {!isAISpeaking && (
//               <img src="/female-05-img.png" alt="AI Avatar" className="h-full w-full object-cover" />
//             )}

//             {isAISpeaking && (
//               <video
//                 ref={aiVideoRef}
//                 src="/female-05.mp4"
//                 className="h-full w-full object-cover"
//                 loop
//                 muted
//                 playsInline
//               />
//             )}

//             <div className="absolute top-3 left-3 text-sm text-gray-200 font-medium z-10">Aarav (AI)</div>

//             {isConnected && (
//               <div className="absolute bottom-3 right-3 text-xs text-white bg-black/60 px-3 py-1 rounded-full z-10">
//                 {isAISpeaking ? 'Speaking...' : 'Listening...'}
//               </div>
//             )}
//           </div>
//         </div>

//         <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
//           <button
//             onClick={endInterview}
//             className="rounded-full bg-red-500 px-6 py-2 font-semibold text-white hover:bg-red-400 transition"
//           >
//             End Interview
//           </button>

//           <button
//             onClick={toggleCamera}
//             className={`rounded-full px-5 py-2 text-sm font-medium transition ${
//               isCameraOn ? 'bg-white text-black hover:bg-gray-200' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
//             }`}
//           >
//             {isCameraOn ? ' Camera On' : ' Camera Off'}
//           </button>

//           <button
//             onClick={toggleMute}
//             className={`rounded-full px-5 py-2 text-sm font-medium transition ${
//               isMuted ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
//             }`}
//           >
//             {isMuted ? ' Muted' : ' Audio On'}
//           </button>

//           {/* <button
//             onClick={toggleRecording}
//             disabled={isPlayingRef.current}
//             className={`rounded-full px-5 py-2 text-sm font-medium transition ${
//               isRecording
//                 ? 'bg-red-500 text-white hover:bg-red-400'
//                 : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
//             } disabled:opacity-50 disabled:cursor-not-allowed`}
//           >
//             {isRecording ? ' Recording' : ' Start Mic'}
//           </button> */}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default GeminiLiveStage;











'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

const GeminiLiveStage = ({
  resumeFile,
  onRestart,
  // OPTIONAL callbacks (won’t break existing usage)
  onTranscriptUpdate, // (payload) => void
  onTranscriptFinal,  // (payload) => void
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false); // socket open
  const [isMuted, setIsMuted] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [resumeStatus, setResumeStatus] = useState('idle');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);

  const wsRef = useRef(null);

  // ===== Live API session readiness (must wait for setupComplete) =====
  const sessionReadyRef = useRef(false);
  const pendingStartAfterSetupRef = useRef(false);

  // Capture (mic)
  const audioContextRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const isRecordingRef = useRef(false);

  // Video
  const aiVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  // Playback (AI audio)
  const playbackContextRef = useRef(null);
  const playbackGainRef = useRef(null);
  const isPlayingRef = useRef(false);
  const playbackNextStartRef = useRef(0);
  const audioBufferQueueRef = useRef([]);
  const isPlaybackStartedRef = useRef(false);
  const activeSourcesRef = useRef([]);
  const playbackSampleRateRef = useRef(24000);

  // Connection guard
  const hasConnectedRef = useRef(false);

  // Silence handling
  const silenceTimeoutRef = useRef(null);
  const idleCheckTimeoutRef = useRef(null);
  const hasPromptedForSilenceRef = useRef(false);
  const lastUserSpeechTimeRef = useRef(null);

  // Simple VAD smoothing
  const speechFramesRef = useRef(0);

  // Echo gate / barge-in protection
  const isAISpeakingRef = useRef(false);
  useEffect(() => {
    isAISpeakingRef.current = isAISpeaking;
  }, [isAISpeaking]);

  // ===== Transcription storage =====
  const transcriptRef = useRef({
    events: [], // { role: 'user'|'ai', text, ts }
    latestUser: '',
    latestAI: '',
  });

  const pushTranscript = (role, text) => {
    const clean = (text || '').trim();
    if (!clean) return;

    const evt = { role, text: clean, ts: Date.now() };
    transcriptRef.current.events.push(evt);

    if (role === 'user') transcriptRef.current.latestUser = clean;
    if (role === 'ai') transcriptRef.current.latestAI = clean;

    try {
      onTranscriptUpdate?.({
        ...transcriptRef.current,
        lastEvent: evt,
      });
    } catch (_) {}
  };

  const normalizeText = (t) =>
    (t || '').replace(/\s+/g, ' ').replace(/(\s*\n\s*)+/g, '\n').trim();

  const clipText = (t, maxChars = 14000) => {
    const s = t || '';
    return s.length <= maxChars ? s : s.slice(0, maxChars) + '\n...[TRUNCATED]';
  };

  // Faster base64 encoder for TypedArrays
  const uint8ToBase64 = (u8) => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < u8.length; i += chunkSize) {
      binary += String.fromCharCode(...u8.subarray(i, i + chunkSize));
    }
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

  // Linear resampler
  const resampleFloat32Linear = (input, inRate, outRate) => {
    if (!input || input.length === 0) return new Float32Array(0);
    if (inRate === outRate) return input;

    // Fast path for common 48000 -> 24000
    if (inRate === 48000 && outRate === 24000) {
      const out = new Float32Array(Math.floor(input.length / 2));
      for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = input[i];
      return out;
    }

    const ratio = outRate / inRate;
    const outLen = Math.max(1, Math.floor(input.length * ratio));
    const out = new Float32Array(outLen);

    const step = inRate / outRate;
    for (let i = 0; i < outLen; i++) {
      const pos = i * step;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = input[idx] ?? 0;
      const s1 = input[idx + 1] ?? s0;
      out[i] = s0 + (s1 - s0) * frac;
    }
    return out;
  };

  // ========== CAMERA ==========
  const attachStreamToLocalVideo = async () => {
    const videoEl = localVideoRef.current;
    const stream = cameraStreamRef.current;

    if (!videoEl || !stream) return;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }

    if (!videoEl.paused && !videoEl.ended) return;

    try {
      const p = videoEl.play();
      if (p && typeof p.then === 'function') await p;
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Video play error:', err);
      setCameraError('Video play failed: ' + (err?.message || 'Unknown error'));
    }
  };

  const setLocalVideoEl = (el) => {
    localVideoRef.current = el;
    if (el) attachStreamToLocalVideo();
  };

  const startCamera = async () => {
    if (typeof window === 'undefined') return;
    try {
      setCameraError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setIsCameraOn(true);
      attachStreamToLocalVideo();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== RESUME EXTRACTION ==========
  const extractTextFromPDF = async (file) => {
    try {
      setResumeStatus('processing');
      setResumeText('');

      const pdfjsMod = await import('pdfjs-dist');
      const pdfjs = pdfjsMod.default ?? pdfjsMod;
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

  useEffect(() => {
    if (resumeFile) {
      extractTextFromPDF(resumeFile);
    } else {
      setResumeText('');
      setResumeStatus('ready');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ========== SILENCE DETECTION ==========
  const clearSilenceTimeout = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  const clearIdleCheckTimeout = () => {
    if (idleCheckTimeoutRef.current) {
      clearTimeout(idleCheckTimeoutRef.current);
      idleCheckTimeoutRef.current = null;
    }
  };

  const safeWsSend = (obj) => {
    try {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
      wsRef.current.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      console.error('WS send error:', e);
      return false;
    }
  };

  const sendClientText = (text) => {
    // This is a "prompt" message (not mic audio)
    return safeWsSend({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    });
  };

  const promptUserForResponse = () => {
    if (hasPromptedForSilenceRef.current) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    hasPromptedForSilenceRef.current = true;

    sendClientText(
      'The candidate has not responded for a while. Please ask them: "Are you thinking about this, or should we move to the next question?" Keep it brief and natural.'
    );
  };

  const startSilenceDetection = () => {
    clearSilenceTimeout();
    hasPromptedForSilenceRef.current = false;

    silenceTimeoutRef.current = setTimeout(() => {
      const playing = isPlayingRef.current;
      const queued = audioBufferQueueRef.current.length > 0 || activeSourcesRef.current.length > 0;
      if (!playing && !queued) promptUserForResponse();
    }, 4500);
  };

  const armSilenceDetectionWhenIdle = () => {
    clearSilenceTimeout();
    clearIdleCheckTimeout();
    hasPromptedForSilenceRef.current = false;

    const check = () => {
      const stillPlaying =
        isPlayingRef.current ||
        audioBufferQueueRef.current.length > 0 ||
        activeSourcesRef.current.length > 0;

      if (stillPlaying) {
        idleCheckTimeoutRef.current = setTimeout(check, 80);
        return;
      }

      startSilenceDetection();
    };

    check();
  };

  const handleUserSpeech = () => {
    clearSilenceTimeout();
    clearIdleCheckTimeout();
    hasPromptedForSilenceRef.current = false;
    lastUserSpeechTimeRef.current = Date.now();
  };

  // ========== AUDIO PLAYBACK ==========
  const stopPlaybackContext = () => {
    clearIdleCheckTimeout();
    clearSilenceTimeout();

    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (_) {}
    });
    activeSourcesRef.current = [];

    if (playbackContextRef.current) {
      try {
        playbackContextRef.current.close();
      } catch (_) {}
    }

    playbackContextRef.current = null;
    playbackGainRef.current = null;
    isPlayingRef.current = false;
    setIsAISpeaking(false);

    playbackNextStartRef.current = 0;
    audioBufferQueueRef.current = [];
    isPlaybackStartedRef.current = false;
  };

  const ensurePlaybackContext = async (sampleRate = 24000) => {
    if (typeof window === 'undefined') return;

    playbackSampleRateRef.current = sampleRate;

    if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate });
      const gain = ctx.createGain();

      gain.gain.value = isMuted ? 0 : 1;
      gain.connect(ctx.destination);

      playbackContextRef.current = ctx;
      playbackGainRef.current = gain;
      playbackNextStartRef.current = ctx.currentTime;

      try {
        if (ctx.state === 'suspended') await ctx.resume();
      } catch (_) {}
    } else {
      if (playbackGainRef.current) playbackGainRef.current.gain.value = isMuted ? 0 : 1;
      try {
        if (playbackContextRef.current.state === 'suspended') await playbackContextRef.current.resume();
      } catch (_) {}
    }
  };

  const flushAudioQueue = () => {
    const ctx = playbackContextRef.current;
    const gain = playbackGainRef.current;
    if (!ctx || !gain) return;

    const MAX_QUEUE_SIZE = 6;
    if (audioBufferQueueRef.current.length > MAX_QUEUE_SIZE) {
      audioBufferQueueRef.current = audioBufferQueueRef.current.slice(-MAX_QUEUE_SIZE);
    }

    while (audioBufferQueueRef.current.length > 0) {
      const audioBuffer = audioBufferQueueRef.current.shift();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gain);

      const startAt = Math.max(ctx.currentTime, playbackNextStartRef.current);
      source.start(startAt);
      playbackNextStartRef.current = startAt + audioBuffer.duration;
      activeSourcesRef.current.push(source);

      isPlayingRef.current = true;
      setIsAISpeaking(true);

      source.onended = () => {
        const idx = activeSourcesRef.current.indexOf(source);
        if (idx > -1) activeSourcesRef.current.splice(idx, 1);

        const stillActive = activeSourcesRef.current.length > 0;
        const stillQueued = audioBufferQueueRef.current.length > 0;

        if (!stillActive && !stillQueued) {
          isPlayingRef.current = false;
          setIsAISpeaking(false);
          armSilenceDetectionWhenIdle();
        }
      };
    }
  };

  const playStreamingChunk = async (base64Data, mimeType) => {
    try {
      let sampleRate = 24000;
      const m = mimeType && mimeType.match(/rate=(\d+)/);
      if (m && m[1]) sampleRate = parseInt(m[1], 10) || 24000;

      if (!playbackContextRef.current) {
        await ensurePlaybackContext(sampleRate);
      } else {
        await ensurePlaybackContext(playbackSampleRateRef.current);
      }

      const ctx = playbackContextRef.current;
      if (!ctx) return;

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const MAX_QUEUE_SIZE = 6;
      if (audioBufferQueueRef.current.length >= MAX_QUEUE_SIZE) {
        audioBufferQueueRef.current.shift();
      }

      audioBufferQueueRef.current.push(audioBuffer);

      if (!isPlaybackStartedRef.current && audioBufferQueueRef.current.length >= 1) {
        isPlaybackStartedRef.current = true;
        playbackNextStartRef.current = ctx.currentTime + 0.03;
        flushAudioQueue();
      } else if (isPlaybackStartedRef.current) {
        flushAudioQueue();
      }
    } catch (err) {
      console.error('Audio streaming error:', err);
    }
  };

  const handleServerContent = async (serverContent) => {
    // Transcriptions can arrive independently and out-of-order
    if (serverContent?.inputTranscription?.text) {
      pushTranscript('user', serverContent.inputTranscription.text);
    }
    if (serverContent?.outputTranscription?.text) {
      pushTranscript('ai', serverContent.outputTranscription.text);
    }

    if (serverContent?.modelTurn?.parts) {
      clearSilenceTimeout();
      clearIdleCheckTimeout();
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
      clearIdleCheckTimeout();
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
      armSilenceDetectionWhenIdle();
    }
  };

  // ========== CONNECTION (FIXED) ==========
  useEffect(() => {
    if (resumeStatus === 'processing') return;

    // Connect once resume is ready OR failed OR absent (anything except processing)
    if (!hasConnectedRef.current) {
      hasConnectedRef.current = true;
      connectToGemini();
    }

    return () => {
      stopRecording();
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
      } catch (_) {}
      stopPlaybackContext();
      clearSilenceTimeout();
      clearIdleCheckTimeout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeStatus]);

  const connectToGemini = async () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      setErrorMessage('Please set NEXT_PUBLIC_GEMINI_API_KEY in your .env.local file');
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    // NOTE: keep your model choice
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    // ✅ v1beta endpoint (per docs)
    const wsUrl =
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent' +
      `?key=${apiKey}`;

    sessionReadyRef.current = false;
    pendingStartAfterSetupRef.current = false;

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setIsConnected(true);

      const systemInstruction = `You are Sam, a senior technical interviewer having a natural voice conversation with a candidate. Be warm, professional, and conversational—like a real human interviewer would be.

VOICE STYLE:
- Speak naturally in English with Indian accent
- Use casual interjections: "Cool", "Got it", "Makes sense", "Fair enough", "Alright"
- Keep sentences short and clear for voice
- Ask ONE question at a time
- Don't sound robotic or formal—be friendly but professional

INTERVIEW FLOW:
1. Brief greeting (15-20 seconds)
   ${
     resumeFile && resumeStatus === 'ready'
       ? `- Say hi and mention you've reviewed their resume
   - Ask them to briefly walk through their background (60 seconds)`
       : `- Say hi and ask them to introduce themselves
   - Get their name, current role, experience level, and main tech stack`
   }

2. Deep dive into experience (main section)
   - Pick their strongest recent project or role
   - Ask about: technical decisions, challenges, trade-offs, impact
   - Follow up based on their answers (not generic questions)

3. Technical questions (pick 3-4 relevant ones)
   - Base questions on their actual experience
   - Keep it practical and realistic

4. Quick scenario (1-2 minutes)
   - Give one real-world problem from their domain
   - Ask how they'd approach it
   - Ask questions based on his technical skills
   - Do ask only related to one topic ask questions related to all user skills

5. Wrap up
   - Thank them and ask if they have questions
   - Keep it brief

INTERVIEW ENDING AND FEEDBACK:
- If candidate wants to end: ask if they have questions, then close politely.
- If candidate asks for feedback: give honest, specific strengths + improvements + actionable tips.

STRICT INTERVIEW MODE:
- Mock interview, NOT teaching.
- Never explain concepts; assess only.

SILENCE:
- If no response, gently prompt and move on.

RULES:
- Stay focused on interview
- Don't ask for sensitive personal data
- Ask questions across all mentioned skills
- Only English

${
  resumeFile && resumeStatus === 'ready'
    ? `RESUME CONTEXT:
${clipText(resumeText, 14000)}`
    : ''
}

Start naturally.`;

      // ✅ Setup message per WebSockets spec (camelCase)
      // ✅ Enable input/output transcription here
      const setupMessage = {
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [],
        },
      };

      safeWsSend(setupMessage);

      // We MUST wait for setupComplete before sending anything else.
      pendingStartAfterSetupRef.current = true;
    };

    wsRef.current.onmessage = async (event) => {
      let raw = event.data;
      if (raw instanceof Blob) {
        try {
          raw = await raw.text();
        } catch (_) {
          return;
        }
      }

      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (err) {
        console.error('Message parse error:', err);
        return;
      }

      // ✅ setupComplete gate
      if (msg?.setupComplete) {
        sessionReadyRef.current = true;

        // Start mic + greeting once, after setupComplete
        if (pendingStartAfterSetupRef.current) {
          pendingStartAfterSetupRef.current = false;

          // startRecording streams realtimeInput.audio continuously
          startRecording();

          // Trigger greeting using clientContent
          setTimeout(() => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
            sendClientText('Start the interview with a natural greeting.');
          }, 150);
        }
        return;
      }

      if (msg?.serverContent) {
        await handleServerContent(msg.serverContent);
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

      sessionReadyRef.current = false;
      pendingStartAfterSetupRef.current = false;

      stopPlaybackContext();
      clearSilenceTimeout();
      clearIdleCheckTimeout();

      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (_) {}
        audioContextRef.current = null;
      }

      // Optional: final transcript callback on close
      try {
        onTranscriptFinal?.({ ...transcriptRef.current });
      } catch (_) {}
    };
  };

  // ========== RECORDING (UPDATED realtimeInput + 16kHz) ==========
  const startRecording = async () => {
    try {
      if (typeof window === 'undefined') return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (!sessionReadyRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioCtx(); // browser rate; we resample

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);

      const zeroGain = audioContextRef.current.createGain();
      zeroGain.gain.value = 0;

      source.connect(processor);
      processor.connect(zeroGain);
      zeroGain.connect(audioContextRef.current.destination);

      speechFramesRef.current = 0;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (!sessionReadyRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          const s = inputData[i];
          sum += s * s;
        }
        const rms = Math.sqrt(sum / inputData.length);

        const threshold = 0.012;
        const requiredFrames = 3;
        const bargeInThreshold = 0.025;

        if (rms > threshold) {
          speechFramesRef.current += 1;
        } else {
          speechFramesRef.current = Math.max(0, speechFramesRef.current - 1);
        }

        if (speechFramesRef.current >= requiredFrames) {
          handleUserSpeech();
        }

        const aiTalking = isAISpeakingRef.current;
        const userIsActuallySpeaking = rms > bargeInThreshold;

        if (aiTalking && !userIsActuallySpeaking) return;

        // ✅ Resample to 16kHz (recommended native input rate)
        const inRate = audioContextRef.current?.sampleRate || 48000;
        const resampled = resampleFloat32Linear(inputData, inRate, 16000);

        const pcmData = convertFloat32ToInt16(resampled);
        const base64Data = uint8ToBase64(new Uint8Array(pcmData.buffer));

        // ✅ Updated realtime message shape: realtimeInput.audio (Blob)
        safeWsSend({
          realtimeInput: {
            audio: {
              data: base64Data,
              mimeType: 'audio/pcm;rate=16000',
            },
          },
        });
      };

      mediaRecorderRef.current = { stream, processor, source, zeroGain };
      setIsRecording(true);
      isRecordingRef.current = true;

      clearSilenceTimeout();
      clearIdleCheckTimeout();
    } catch (error) {
      console.error('Microphone error:', error);
      setErrorMessage('Could not access microphone. Please check permissions.');
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);

    clearSilenceTimeout();
    clearIdleCheckTimeout();

    if (mediaRecorderRef.current) {
      const { stream, processor, source, zeroGain } = mediaRecorderRef.current;
      try {
        processor?.disconnect();
        source?.disconnect();
        zeroGain?.disconnect();
        stream?.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      mediaRecorderRef.current = null;
    }

    if (audioContextRef.current?.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (_) {}
      audioContextRef.current = null;
    }

    // ✅ Proper mic stop signal in Live API
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      safeWsSend({ realtimeInput: { audioStreamEnd: true } });
    }
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
    stopRecording();

    try {
      if (wsRef.current) wsRef.current.close();
    } catch (_) {}

    stopPlaybackContext();
    stopCamera();
    clearSilenceTimeout();
    clearIdleCheckTimeout();

    hasConnectedRef.current = false;

    // optional: provide transcript on manual end too
    try {
      onTranscriptFinal?.({ ...transcriptRef.current });
    } catch (_) {}

    onRestart();
  };

  // ========== UI ==========
  if (resumeStatus === 'processing') {
    return (
      <div className="w-full max-w-6xl flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
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
          <Link href="/" className="hover:text-white transition">
            Home
          </Link>
          <button onClick={onRestart} className="hover:text-white transition">
            Restart
          </button>
        </div>
      </div>

      <div className="bg-[#0b1220] border border-[#1a2336] rounded-2xl shadow-2xl p-4 space-y-4">
        {errorMessage && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-red-300 text-sm">{errorMessage}</p>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-red-300 hover:text-red-200 text-lg font-bold ml-4"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* YOU */}
          <div className="relative aspect-video rounded-xl bg-[#10192c] overflow-hidden flex items-center justify-center">
            <div className="absolute top-3 left-3 text-sm text-gray-200 font-medium z-10">You</div>

            {isCameraOn ? (
              <video
                ref={setLocalVideoEl}
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
              <img src="/male-01-img.png" alt="AI Avatar" className="h-full w-full object-cover" />
            )}

            {isAISpeaking && (
              <video
                ref={aiVideoRef}
                src="/male-01.mp4"
                className="h-full w-full object-cover"
                loop
                muted
                playsInline
              />
            )}

            <div className="absolute top-3 left-3 text-sm text-gray-200 font-medium z-10">Sam (AI)</div>

            {isConnected && (
              <div className="absolute bottom-3 right-3 text-xs text-white bg-black/60 px-3 py-1 rounded-full z-10">
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
              isCameraOn ? 'bg-white text-black hover:bg-gray-200' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
            }`}
          >
            {isCameraOn ? ' Camera On' : ' Camera Off'}
          </button>

          <button
            onClick={toggleMute}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              isMuted ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
            }`}
          >
            {isMuted ? ' Muted' : ' Audio On'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeminiLiveStage;


