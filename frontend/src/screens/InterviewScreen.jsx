import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";

const API_BASE = "http://localhost:8000";

const STATUS = {
  IDLE: "idle",
  RECORDING: "recording",
  TRANSCRIBING: "transcribing",
  THINKING: "thinking",
  SPEAKING: "speaking",
};

const SILENCE_THRESHOLD = 10;
const SILENCE_DURATION = 2000;
const ANALYSIS_INTERVAL = 100;

export default function InterviewScreen({ problem, onFinish}) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Hi! I'll be your interviewer today. Let's work through "${problem.title}". 
      Take a moment to read the problem, then feel free to start thinking out loud or 
      ask any clarifying questions.`,
    },
  ]);

  const [code, setCode] = useState("# Write your solution here\n");
  const [status, setStatus] = useState(STATUS.IDLE);
  const [micActive, setMicActive] = useState(false);
  const [timer, setTimer] = useState(45 * 60);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesRef = useRef(messages);
  const codeRef = useRef(code);
  const micActiveRef = useRef(false);

  // Silence detection refs
  const analyserRef = useRef(null);
  const silenceStartRef = useRef(null);
  const silenceTimerRef = useRef(null);

  const chatEndRef = useRef(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { micActiveRef.current = micActive; }, [micActive]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Silence detection setup
    const audioContext = new AudioContext();

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    source.connect(analyser);

    // Array that will hold the volume data
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    silenceStartRef.current = null;
    let hasSpeech = false;

    // Check the volume per interval and check for sustained silence
    silenceTimerRef.current = setInterval(() => {
      // Fill dataArray with the current volume data
      analyser.getByteFrequencyData(dataArray);

      // Calculate the average volume
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      const isSilent = average < SILENCE_THRESHOLD;

      if (!isSilent) {
        hasSpeech = true;
        silenceStartRef.current = null;
      } else if (hasSpeech) {
        // Only count silence after speech has been detected
        if (!silenceStartRef.current) {
          silenceStartRef.current = Date.now();
        }

        const silenceDuration = Date.now() - silenceStartRef.current;
        if (silenceDuration > SILENCE_DURATION) {
          stopRecording();
        }
      }
    }, ANALYSIS_INTERVAL);
    // End of silence detection setup

    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = handleRecordingStop;
    mediaRecorder.start();
    setStatus(STATUS.RECORDING);
  }

  function stopRecording() {
    // Clear silence detection interval
    clearInterval(silenceTimerRef.current);
    silenceTimerRef.current = null;
    silenceStartRef.current = null;

    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }

  function handleMicToggle() {
    const next = !micActive;
    setMicActive(next);
    if (next) {
      startRecording();
    } else {
      stopRecording();
    }
  }

  async function handleRecordingStop() {
    setStatus(STATUS.TRANSCRIBING);

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("problem_context", problem.title);

    try {
      const transcribeResponse = await axios.post(`${API_BASE}/transcribe`, formData);
      const transcript = transcribeResponse.data.transcript;

      if (!transcript?.trim()) {
        if (micActiveRef.current) {
          startRecording();
        } else {
          setStatus(STATUS.IDLE);
        }
        return;
      }

      const userMessage = { role: "user", content: transcript };
      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages(updatedMessages);

      setStatus(STATUS.THINKING);
      const chatResponse = await axios.post(`${API_BASE}/chat`, {
        messages: updatedMessages,
        current_code: codeRef.current,
        problem_description: problem.title + "\n\n" + problem.description,
      });

      const { reply, interview_complete } = chatResponse.data;

      if (interview_complete) {
        const finalMessages = [
          ...updatedMessages,
          { role: "assistant", content: reply },
        ];
        setMessages(finalMessages);
        onFinish(finalMessages, codeRef.current);
        return;
      }

      const finalMessages = [
        ...updatedMessages,
        { role: "assistant", content: reply },
      ];
      setMessages(finalMessages);

      setStatus(STATUS.SPEAKING);
      const speakRes = await axios.post(`${API_BASE}/speak`,
        { text: reply },
        { responseType: "blob" }
      );

      const audioBlob = new Blob([speakRes.data], { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (micActiveRef.current) {
          startRecording();
        } else {
          setStatus(STATUS.IDLE);
        }
      };

      audio.play();
    } catch (err) {
      console.error("Pipeline error:", err);
      if (micActiveRef.current) {
        startRecording();
      } else {
        setStatus(STATUS.IDLE);
      }
    }
  }

  function handleEndInterview() {
    if (status === STATUS.RECORDING) {
      stopRecording();
    }
    onFinish(messagesRef.current, codeRef.current);
  }

  const isProcessing = status !== STATUS.IDLE && status !== STATUS.RECORDING;

  const statusLabels = {
    [STATUS.IDLE]: "Click mic to start speaking",
    [STATUS.RECORDING]: "Listening... will automatically send after silence",
    [STATUS.TRANSCRIBING]: "Transcribing...",
    [STATUS.THINKING]: "Interviewer is thinking...",
    [STATUS.SPEAKING]: "Interviewer is speaking...",
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-700 shrink-0">
        <span className="font-semibold text-lg truncate">{problem.title}</span>
        <span className={`font-mono text-lg font-bold ${timer < 300 ? "text-red-400" : "text-green-400"}`}>
          {formatTime(timer)}
        </span>
        <button
          onClick={handleEndInterview}
          className="bg-red-700 hover:bg-red-600 text-white text-sm px-4 py-1.5 rounded transition-colors"
        >
          End Interview
        </button>
      </div>

      {/* Split panel */}
      <PanelGroup orientation="horizontal" className="flex-1 overflow-hidden">

        {/* Left: Problem + editor */}
        <Panel defaultSize={60} minSize={25}>
          <PanelGroup orientation="vertical" className="h-full">

            {/* Problem description */}
            <Panel defaultSize={25} minSize={10}>
              <div className="h-full px-4 py-3 bg-gray-900 border-b border-gray-700 overflow-y-auto">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Problem</p>
                <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {problem.description}
                </p>
              </div>
            </Panel>

            <PanelResizeHandle className="h-1 bg-gray-700 hover:bg-blue-500 transition-colors cursor-row-resize" />

            {/* Editor */}
            <Panel minSize={20}>
              <Editor
                height="100%"
                defaultLanguage="python"
                value={code}
                onChange={(val) => setCode(val ?? "")}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  padding: { top: 12 },
                }}
              />
            </Panel>

          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-500 transition-colors cursor-col-resize" />

        {/* Right: Chat + mic button */}
        <Panel defaultSize={40} minSize={20}>
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed
                      ${msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-gray-800 text-gray-100 rounded-bl-none"
                      }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Mic toggle button */}
            <div className="px-4 py-5 border-t border-gray-700 bg-gray-900 flex flex-col items-center gap-3 shrink-0">
              <p className="text-xs text-gray-400 text-center">{statusLabels[status]}</p>

              <button
                onClick={handleMicToggle}
                disabled={isProcessing}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 focus:outline-none
                  ${status === STATUS.RECORDING
                    ? "bg-red-500 scale-110 shadow-lg shadow-red-500/40 animate-pulse"
                    : isProcessing
                    ? "bg-gray-700 cursor-not-allowed opacity-50"
                    : "bg-red-500 hover:bg-red-600 active:scale-95"
                  }`}
              >
                {status === STATUS.RECORDING
                  ? <div className="w-5 h-5 rounded-sm bg-white" />
                  : <div className="w-5 h-5 rounded-full bg-white" />
                }
              </button>

              <p className="text-xs text-gray-600">
                {status === STATUS.RECORDING ? "Tap to stop" : "Tap to turn mic on"}
              </p>
            </div>
          </div>
        </Panel>

      </PanelGroup>
    </div>
  );
}