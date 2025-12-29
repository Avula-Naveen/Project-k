
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

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [errorMessage, setErrorMessage] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef(null);

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
  const FIXED_SAMPLE_RATE = 48000; // Use fixed rate, let WebAudio resample

  // Connection guard
  const hasConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);
  const shouldReconnectRef = useRef(true);

  // Silence handling
  const silenceTimeoutRef = useRef(null);
  const idleCheckTimeoutRef = useRef(null);
  const hasPromptedForSilenceRef = useRef(false);
  const lastUserSpeechTimeRef = useRef(null);

  // VAD (Voice Activity Detection)
  const speechFramesRef = useRef(0);
  const noiseFloorRef = useRef(0.01); // Adaptive noise floor
  
  // Echo gate / barge-in protection
  const isAISpeakingRef = useRef(false);
  useEffect(() => {
    isAISpeakingRef.current = isAISpeaking;
  }, [isAISpeaking]);

  // Metrics tracking
  const metricsRef = useRef({
    audioLatency: [],
    bufferUnderruns: 0,
    totalAudioChunks: 0,
    reconnects: 0,
  });

  // ========== CONSTANTS ==========
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_BASE_DELAY = 2000;
  const MAX_QUEUE_SIZE = 8; // Increased for better stability
  const MIN_BUFFER_BEFORE_PLAY = 1; // Start playing after 1 chunk for low latency
  const SILENCE_TIMEOUT = 5000; // 5 seconds
  const SPEECH_THRESHOLD = 0.015; // Base threshold
  const BARGE_IN_THRESHOLD = 0.03; // Higher threshold for interrupting AI
  const SPEECH_FRAMES_REQUIRED = 3; // Consecutive frames needed
  const ADAPTIVE_NOISE_SAMPLES = 50; // Samples for noise floor calculation

  // ========== HELPERS ==========
  const normalizeText = useCallback((t) =>
    (t || '').replace(/\s+/g, ' ').replace(/(\s*\n\s*)+/g, '\n').trim()
  , []);

  const clipText = useCallback((t, maxChars = 14000) => {
    const s = t || '';
    return s.length <= maxChars ? s : s.slice(0, maxChars) + '\n...[TRUNCATED]';
  }, []);

  // Optimized base64 encoder
  const uint8ToBase64 = useCallback((u8) => {
    if (u8.length < 1000) {
      return btoa(String.fromCharCode(...u8));
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < u8.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, u8.length);
      binary += String.fromCharCode(...u8.subarray(i, end));
    }
    return btoa(binary);
  }, []);

  const convertFloat32ToInt16 = useCallback((float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }, []);

  // Enhanced resampler with better quality
  const resampleFloat32Linear = useCallback((input, inRate, outRate) => {
    if (!input || input.length === 0) return new Float32Array(0);
    if (inRate === outRate) return input;

    // Fast path for common downsampling
    if (inRate === 48000 && outRate === 24000) {
      const out = new Float32Array(Math.floor(input.length / 2));
      for (let i = 0, j = 0; j < out.length; i += 2, j++) {
        out[j] = (input[i] + input[i + 1]) / 2; // Average for better quality
      }
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
  }, []);

  // Enhanced VAD with adaptive noise floor and zero-crossing rate
  const analyzeAudio = useCallback((inputData) => {
    // Calculate RMS
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);

    // Calculate zero-crossing rate (ZCR) for better speech detection
    let zeroCrossings = 0;
    for (let i = 1; i < inputData.length; i++) {
      if ((inputData[i] >= 0 && inputData[i - 1] < 0) || 
          (inputData[i] < 0 && inputData[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const zcr = zeroCrossings / inputData.length;

    // Update adaptive noise floor (running average of quiet periods)
    if (rms < SPEECH_THRESHOLD) {
      noiseFloorRef.current = noiseFloorRef.current * 0.95 + rms * 0.05;
    }

    // Speech detection: RMS above threshold AND reasonable ZCR (0.3-0.7 typical for speech)
    const adaptiveThreshold = Math.max(SPEECH_THRESHOLD, noiseFloorRef.current * 2);
    const isSpeech = rms > adaptiveThreshold && zcr > 0.25 && zcr < 0.75;

    return { rms, zcr, isSpeech, adaptiveThreshold };
  }, []);

  // ========== CAMERA ==========
  const startCamera = useCallback(async () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      console.warn('Navigator not available');
      return;
    }

    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera not supported in this browser');
      setIsCameraOn(false);
      return;
    }

    try {
      setCameraError('');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        },
        audio: false,
      });

      // Verify stream has video tracks
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No video tracks available');
      }

      cameraStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        
        // Wait for metadata to load before playing
        await new Promise((resolve, reject) => {
          const video = localVideoRef.current;
          if (!video) {
            reject(new Error('Video element not found'));
            return;
          }

          video.onloadedmetadata = () => {
            console.log('Video metadata loaded');
            resolve();
          };

          video.onerror = (e) => {
            console.error('Video error event:', e);
            reject(new Error('Video load error'));
          };

          // Timeout after 5 seconds
          setTimeout(() => reject(new Error('Video load timeout')), 5000);
        });

        // Now try to play
        try {
          await localVideoRef.current.play();
          console.log('Video playing successfully');
          setIsCameraOn(true);
        } catch (playErr) {
          console.error('Video play error:', playErr);
          setCameraError('Could not play video: ' + playErr.message);
          setIsCameraOn(false);
          stream.getTracks().forEach((t) => t.stop());
          cameraStreamRef.current = null;
        }
      } else {
        console.warn('Video ref not available yet');
        setIsCameraOn(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
      const errorMsg = err.name === 'NotAllowedError' 
        ? 'Camera permission denied'
        : err.name === 'NotFoundError'
        ? 'No camera found'
        : 'Camera unavailable: ' + err.message;
      setCameraError(errorMsg);
      setIsCameraOn(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
    console.log('Camera stopped');
  }, []);

  // Initialize camera on mount
  useEffect(() => {
    // Add a small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      startCamera();
    }, 100);

    return () => {
      clearTimeout(timer);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // ========== RESUME EXTRACTION ==========
  const extractTextFromPDF = useCallback(async (file) => {
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
        console.error('No text extracted from PDF');
        setResumeStatus('failed');
        return;
      }

      setResumeText(cleaned);
      setResumeStatus('ready');
      console.log('Resume extracted successfully, length:', cleaned.length);
    } catch (error) {
      console.error('PDF extraction error:', error);
      setResumeStatus('failed');
      setErrorMessage('Failed to extract text from PDF. Using general interview mode.');
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }, [normalizeText]);

  useEffect(() => {
    if (resumeFile) {
      extractTextFromPDF(resumeFile);
    } else {
      setResumeText('');
      setResumeStatus('ready');
    }
  }, [resumeFile, extractTextFromPDF]);

  // ========== AI AVATAR VIDEO ==========
  useEffect(() => {
    if (!aiVideoRef.current) return;
    
    const video = aiVideoRef.current;
    
    if (isAISpeaking) {
      video.play().catch((err) => {
        console.warn('AI video play error:', err);
      });
    } else {
      video.pause();
      video.currentTime = 0; // Reset to start
    }
  }, [isAISpeaking]);

  // ========== SILENCE DETECTION ==========
  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  const clearIdleCheckTimeout = useCallback(() => {
    if (idleCheckTimeoutRef.current) {
      clearTimeout(idleCheckTimeoutRef.current);
      idleCheckTimeoutRef.current = null;
    }
  }, []);

  const promptUserForResponse = useCallback(() => {
    if (
      hasPromptedForSilenceRef.current ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    hasPromptedForSilenceRef.current = true;
    console.log('Prompting user due to silence');
    
    try {
      wsRef.current.send(
        JSON.stringify({
          client_content: {
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text: 'The candidate has not responded for a while. Please ask them: "Are you thinking about this, or should we move to the next question?" Keep it brief and natural.',
                  },
                ],
              },
            ],
            turn_complete: true,
          },
        })
      );
    } catch (err) {
      console.error('Silence prompt error:', err);
    }
  }, []);

  const startSilenceDetection = useCallback(() => {
    clearSilenceTimeout();
    hasPromptedForSilenceRef.current = false;

    silenceTimeoutRef.current = setTimeout(() => {
      const playing = isPlayingRef.current;
      const queued = audioBufferQueueRef.current.length > 0 || activeSourcesRef.current.length > 0;
      
      if (!playing && !queued) {
        promptUserForResponse();
      }
    }, SILENCE_TIMEOUT);
  }, [clearSilenceTimeout, promptUserForResponse]);

  const armSilenceDetectionWhenIdle = useCallback(() => {
    clearSilenceTimeout();
    clearIdleCheckTimeout();
    hasPromptedForSilenceRef.current = false;

    const check = () => {
      const stillPlaying =
        isPlayingRef.current ||
        audioBufferQueueRef.current.length > 0 ||
        activeSourcesRef.current.length > 0;

      if (stillPlaying) {
        idleCheckTimeoutRef.current = setTimeout(check, 100);
        return;
      }

      startSilenceDetection();
    };

    check();
  }, [clearSilenceTimeout, clearIdleCheckTimeout, startSilenceDetection]);

  const handleUserSpeech = useCallback(() => {
    clearSilenceTimeout();
    clearIdleCheckTimeout();
    hasPromptedForSilenceRef.current = false;
    lastUserSpeechTimeRef.current = Date.now();
  }, [clearSilenceTimeout, clearIdleCheckTimeout]);

  // ========== AUDIO PLAYBACK ==========
  const stopPlaybackContext = useCallback(() => {
    clearIdleCheckTimeout();
    clearSilenceTimeout();

    // Stop all active sources
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (_) {}
    });
    activeSourcesRef.current = [];

    // Close context
    if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
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

    console.log('Playback context stopped');
  }, [clearIdleCheckTimeout, clearSilenceTimeout]);

  const ensurePlaybackContext = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: FIXED_SAMPLE_RATE });
      const gain = ctx.createGain();

      gain.gain.value = isMuted ? 0 : 1;
      gain.connect(ctx.destination);

      playbackContextRef.current = ctx;
      playbackGainRef.current = gain;
      playbackNextStartRef.current = ctx.currentTime;

      console.log('Playback context created with sample rate:', FIXED_SAMPLE_RATE);

      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
          console.log('Playback context resumed');
        }
      } catch (err) {
        console.warn('Failed to resume context:', err);
      }
    } else {
      // Update gain if mute state changed
      if (playbackGainRef.current) {
        playbackGainRef.current.gain.value = isMuted ? 0 : 1;
      }

      try {
        if (playbackContextRef.current.state === 'suspended') {
          await playbackContextRef.current.resume();
        }
      } catch (_) {}
    }
  }, [isMuted]);

  const flushAudioQueue = useCallback(() => {
    const ctx = playbackContextRef.current;
    const gain = playbackGainRef.current;
    if (!ctx || !gain) return;

    // Prevent buffer bloat
    if (audioBufferQueueRef.current.length > MAX_QUEUE_SIZE) {
      console.warn(`Queue overflow: ${audioBufferQueueRef.current.length}, dropping old chunks`);
      metricsRef.current.bufferUnderruns++;
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
  }, [armSilenceDetectionWhenIdle]);

  const playStreamingChunk = useCallback(async (base64Data, mimeType) => {
    try {
      const chunkStartTime = Date.now();

      // Parse sample rate from MIME type
      let sampleRate = 24000;
      const match = mimeType && mimeType.match(/rate=(\d+)/);
      if (match && match[1]) {
        sampleRate = parseInt(match[1], 10) || 24000;
      }

      await ensurePlaybackContext();

      const ctx = playbackContextRef.current;
      if (!ctx) {
        console.error('Playback context not available');
        return;
      }

      // Decode base64 to Int16 PCM
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      // Create audio buffer at the incoming sample rate
      // WebAudio will handle resampling to context's sample rate automatically
      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      // Queue management
      if (audioBufferQueueRef.current.length >= MAX_QUEUE_SIZE) {
        audioBufferQueueRef.current.shift();
        metricsRef.current.bufferUnderruns++;
      }

      audioBufferQueueRef.current.push(audioBuffer);
      metricsRef.current.totalAudioChunks++;

      // Track latency
      const latency = Date.now() - chunkStartTime;
      metricsRef.current.audioLatency.push(latency);
      if (metricsRef.current.audioLatency.length > 100) {
        metricsRef.current.audioLatency.shift();
      }

      // Start playback after minimal buffering
      if (!isPlaybackStartedRef.current && audioBufferQueueRef.current.length >= MIN_BUFFER_BEFORE_PLAY) {
        isPlaybackStartedRef.current = true;
        playbackNextStartRef.current = ctx.currentTime + 0.05; // Small delay for stability
        flushAudioQueue();
        console.log('Started audio playback');
      } else if (isPlaybackStartedRef.current) {
        flushAudioQueue();
      }
    } catch (err) {
      console.error('Audio streaming error:', err);
      setErrorMessage('Audio playback error. Continuing...');
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [ensurePlaybackContext, flushAudioQueue]);

  const handleServerResponse = useCallback(async (serverContent) => {
    if (!serverContent) {
      console.warn('Empty server content received');
      return;
    }

    if (serverContent.modelTurn?.parts) {
      // AI started responding
      clearSilenceTimeout();
      clearIdleCheckTimeout();
      hasPromptedForSilenceRef.current = false;

      for (const part of serverContent.modelTurn.parts) {
        if (part?.inlineData?.data && part?.inlineData?.mimeType?.startsWith('audio/pcm')) {
          await playStreamingChunk(part.inlineData.data, part.inlineData.mimeType);
        }
      }
    }

    if (serverContent.interrupted) {
      console.log('AI interrupted');
      audioBufferQueueRef.current = [];
      isPlaybackStartedRef.current = false;
      stopPlaybackContext();
      clearSilenceTimeout();
      clearIdleCheckTimeout();
    }

    if (serverContent.turnComplete) {
      console.log('AI turn complete');
      
      // Flush remaining buffers
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
  }, [clearSilenceTimeout, clearIdleCheckTimeout, playStreamingChunk, stopPlaybackContext, flushAudioQueue, armSilenceDetectionWhenIdle]);

  // ========== CONNECTION ==========
  const getSystemInstruction = useCallback(() => {
    let instruction = `You are Aarav, a senior technical interviewer having a natural voice conversation with a candidate. Be warm, professional, and conversational—like a real human interviewer would be.

VOICE STYLE:
- Speak naturally in English with Indian accent
- Use casual interjections: "Cool", "Got it", "Makes sense", "Fair enough", "Alright"
- Keep sentences short and clear for voice
- Ask ONE question at a time
- Don't sound robotic or formal—be friendly but professional

INTERVIEW FLOW:
1. Brief greeting (15-20 seconds)
   ${resumeFile && resumeStatus === 'ready'
        ? `- Say hi and mention you've reviewed their resume
   - Ask them to briefly walk through their background (60 seconds)`
        : `- Say hi and ask them to introduce themselves
   - Get their name, current role, experience level, and main tech stack`}

2. Deep dive into experience (main section)
   - Pick their strongest recent project or role
   - Ask about: technical decisions, challenges, trade-offs, impact
   - Follow up based on their answers (not generic questions)
   - Examples: "Why that approach?", "What would you change?", "How did you debug it?"

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

STRICT INTERVIEW MODE (HARD RULES — NO EXCEPTIONS):

   - This is a MOCK INTERVIEW, NOT a teaching session or tutorial.
   - NEVER explain concepts, definitions, technologies, frameworks, languages, or any technical topics.
   - If the candidate asks for explanations, politely refuse and ask them to answer based on their understanding, or move to the next question.
   - Your role is to ASSESS knowledge, not to TEACH.

SILENCE AND NON-RESPONSE HANDLING (CRITICAL):

   - If the candidate does not respond for 5-10 seconds or gives no clear answer:
     - DO NOT repeat the same question.
     - Instead, gently prompt: "Take your time — are you thinking about this, or should we move to the next question?"
   - If there is still no response after your prompt:
     - Say: "No worries. Let's move to the next question."
     - Then immediately move on.

RULES:
- Stay focused on the interview—politely redirect off-topic questions
- Don't ask for sensitive personal data
- You must ask questions related all user skills, do no just focus on one skill, ask questions in all the skills user mentioned
- Only speak English. If asked to switch languages, politely refuse and continue in English.`;

    if (resumeFile && resumeStatus === 'ready' && resumeText) {
      instruction += `

RESUME CONTEXT:
Here's their resume text. Use it to ask specific questions about their projects, technologies, and impact:

${clipText(resumeText, 14000)}

Reference specific items from their resume when asking questions.`;
    }

    instruction += '\n\nStart naturally. If you have their resume, mention it. If not, ask them to introduce themselves. Keep it conversational.';

    return instruction;
  }, [resumeFile, resumeStatus, resumeText, clipText]);

  const connectToGemini = useCallback(async () => {
    if (isConnectingRef.current) {
      console.log('Connection already in progress');
      return;
    }

    isConnectingRef.current = true;

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      setErrorMessage('Please set NEXT_PUBLIC_GEMINI_API_KEY in your .env.local file');
      setTimeout(() => setErrorMessage(null), 5000);
      isConnectingRef.current = false;
      return;
    }

    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';
    const wsUrl =
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent' +
      `?key=${apiKey}`;

    console.log('Connecting to Gemini Live API...');

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setReconnectAttempts(0);
        isConnectingRef.current = false;

        const systemInstruction = getSystemInstruction();

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
          console.log('Setup message sent');

          // Start recording automatically after connection
          setTimeout(() => {
            startRecording();
          }, 500);

          // Send greeting trigger
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  client_content: {
                    turns: [
                      { 
                        role: 'user', 
                        parts: [{ text: 'Start the interview with a natural greeting.' }] 
                      }
                    ],
                    turn_complete: true,
                  },
                })
              );
              console.log('Greeting trigger sent');
            }
          }, 200);
        } catch (e) {
          console.error('Setup failed:', e);
          setErrorMessage('Failed to initialize interview. Please try again.');
          setTimeout(() => setErrorMessage(null), 5000);
        }
      };

      wsRef.current.onmessage = async (event) => {
        let raw = event.data;
        if (raw instanceof Blob) {
          try {
            raw = await raw.text();
          } catch (err) {
            console.error('Failed to read blob:', err);
            return;
          }
        }

        try {
          const response = JSON.parse(raw);
          if (response?.serverContent) {
            await handleServerResponse(response.serverContent);
          } else if (response?.setupComplete) {
            console.log('Setup completed');
          } else {
            console.log('Unknown message type:', response);
          }
        } catch (err) {
          console.error('Message parse error:', err);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setErrorMessage('Connection error. Attempting to reconnect...');
        setTimeout(() => setErrorMessage(null), 3000);
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setIsRecording(false);
        isRecordingRef.current = false;
        isConnectingRef.current = false;

        stopPlaybackContext();
        clearSilenceTimeout();
        clearIdleCheckTimeout();

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try {
            audioContextRef.current.close();
          } catch (_) {}
          audioContextRef.current = null;
        }

        // Attempt reconnection if allowed
        if (
          shouldReconnectRef.current &&
          !event.wasClean &&
          reconnectAttempts < MAX_RECONNECT_ATTEMPTS
        ) {
          const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          
          setErrorMessage(`Connection lost. Reconnecting... (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          
          setTimeout(() => {
            if (shouldReconnectRef.current) {
              setReconnectAttempts((prev) => prev + 1);
              metricsRef.current.reconnects++;
              connectToGemini();
            }
          }, delay);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          setErrorMessage('Failed to reconnect. Please restart the interview.');
        }
      };
    } catch (err) {
      console.error('WebSocket creation failed:', err);
      setErrorMessage('Failed to establish connection. Please try again.');
      setTimeout(() => setErrorMessage(null), 5000);
      isConnectingRef.current = false;
    }
  }, [
    reconnectAttempts,
    getSystemInstruction,
    handleServerResponse,
    stopPlaybackContext,
    clearSilenceTimeout,
    clearIdleCheckTimeout,
  ]);

  // Initialize connection when resume is ready
  useEffect(() => {
    if (resumeStatus === 'processing') return;

    if (resumeStatus === 'ready' && !hasConnectedRef.current) {
      hasConnectedRef.current = true;
      shouldReconnectRef.current = true;
      connectToGemini();
    }

    return () => {
      // Cleanup on unmount
      shouldReconnectRef.current = false;
      stopRecording();
      
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
          }
        } catch (_) {}
        wsRef.current = null;
      }
      
      stopPlaybackContext();
      clearSilenceTimeout();
      clearIdleCheckTimeout();
    };
  }, [resumeStatus, connectToGemini, stopPlaybackContext, clearSilenceTimeout, clearIdleCheckTimeout]);

  // ========== RECORDING ==========
  const startRecording = useCallback(async () => {
    try {
      if (typeof window === 'undefined') return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn('Cannot start recording: WebSocket not ready');
        return;
      }

      console.log('Starting audio recording...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioCtx();
      console.log('Audio context created with sample rate:', audioContextRef.current.sampleRate);

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);

      // Use zero-gain node to prevent feedback
      const zeroGain = audioContextRef.current.createGain();
      zeroGain.gain.value = 0;

      source.connect(processor);
      processor.connect(zeroGain);
      zeroGain.connect(audioContextRef.current.destination);

      // Reset VAD state
      speechFramesRef.current = 0;
      noiseFloorRef.current = 0.01;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const audioAnalysis = analyzeAudio(inputData);

        // Smooth VAD with consecutive frame requirement
        if (audioAnalysis.isSpeech) {
          speechFramesRef.current = Math.min(speechFramesRef.current + 1, SPEECH_FRAMES_REQUIRED + 2);
        } else {
          speechFramesRef.current = Math.max(0, speechFramesRef.current - 1);
        }

        // User is speaking if we have enough consecutive speech frames
        if (speechFramesRef.current >= SPEECH_FRAMES_REQUIRED) {
          handleUserSpeech();
        }

        // Echo gate / barge-in protection
        const aiTalking = isAISpeakingRef.current;
        const userBarging = audioAnalysis.rms > BARGE_IN_THRESHOLD;

        // Don't send audio if AI is talking and user is not speaking loudly enough
        if (aiTalking && !userBarging) {
          return;
        }

        // Resample to 24kHz for Gemini API
        const inRate = audioContextRef.current?.sampleRate || 48000;
        const resampled = resampleFloat32Linear(inputData, inRate, 24000);

        const pcmData = convertFloat32ToInt16(resampled);
        const base64Data = uint8ToBase64(new Uint8Array(pcmData.buffer));

        try {
          wsRef.current.send(
            JSON.stringify({
              realtime_input: {
                media_chunks: [{ data: base64Data, mime_type: 'audio/pcm;rate=24000' }],
              },
            })
          );
        } catch (err) {
          console.error('Audio send error:', err);
        }
      };

      mediaRecorderRef.current = { stream, processor, source, zeroGain };
      setIsRecording(true);
      isRecordingRef.current = true;

      clearSilenceTimeout();
      clearIdleCheckTimeout();

      console.log('Audio recording started successfully');
    } catch (error) {
      console.error('Microphone error:', error);
      setErrorMessage('Could not access microphone. Please check permissions.');
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }, [
    analyzeAudio,
    handleUserSpeech,
    resampleFloat32Linear,
    convertFloat32ToInt16,
    uint8ToBase64,
    clearSilenceTimeout,
    clearIdleCheckTimeout,
  ]);

  const stopRecording = useCallback(() => {
    console.log('Stopping audio recording...');
    
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
      } catch (err) {
        console.warn('Error stopping recorder:', err);
      }
      mediaRecorderRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (_) {}
      audioContextRef.current = null;
    }

    // Send turn complete only if WebSocket is open
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ realtime_input: { turn_complete: true } }));
        console.log('Turn complete sent');
      } catch (err) {
        console.error('Turn complete error:', err);
      }
    }
  }, [clearSilenceTimeout, clearIdleCheckTimeout]);

  // ========== CONTROLS ==========
  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    
    // Update gain without stopping playback
    if (playbackGainRef.current) {
      playbackGainRef.current.gain.value = newMuted ? 0 : 1;
    }
    
    console.log('Audio', newMuted ? 'muted' : 'unmuted');
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  }, [isCameraOn, startCamera, stopCamera]);

  const endInterview = useCallback(() => {
    console.log('Ending interview...');
    
    shouldReconnectRef.current = false;
    stopRecording();

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
      } catch (_) {}
      wsRef.current = null;
    }

    stopPlaybackContext();
    stopCamera();
    clearSilenceTimeout();
    clearIdleCheckTimeout();

    hasConnectedRef.current = false;
    isConnectingRef.current = false;
    
    // Log metrics
    console.log('Interview metrics:', {
      totalChunks: metricsRef.current.totalAudioChunks,
      avgLatency: metricsRef.current.audioLatency.reduce((a, b) => a + b, 0) / metricsRef.current.audioLatency.length || 0,
      bufferUnderruns: metricsRef.current.bufferUnderruns,
      reconnects: metricsRef.current.reconnects,
    });
    
    onRestart();
  }, [stopRecording, stopPlaybackContext, stopCamera, clearSilenceTimeout, clearIdleCheckTimeout, onRestart]);

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
        {/* Error Message */}
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
              <img src="/female-05-img.png" alt="AI Avatar" className="h-full w-full object-cover" />
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

            <div className="absolute top-3 left-3 text-sm text-gray-200 font-medium z-10">Aarav (AI)</div>

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