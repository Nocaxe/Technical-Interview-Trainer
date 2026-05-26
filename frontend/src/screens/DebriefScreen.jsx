import { useState, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";

export default function DebriefScreen({ problem, history, finalCode, onRestart }) {
  const [status, setStatus] = useState("loading");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function fetchDebrief() {
      try {
        const response = await axios.post("http://localhost:8000/debrief", {
          problem_description: `${problem.title}\n\n${problem.description}`,
          final_code: finalCode,
          messages: history,
        });
        setFeedback(response.data.debrief);
        setStatus("done");
      } catch (err) {
        console.error("Debrief request failed:", err);
        setStatus("error");
      }
    }

    fetchDebrief();
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-900 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xl text-gray-300">Analysing your interview...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-red-400 text-base mb-6">
            Could not load your debrief. Make sure the backend is running, then try again.
          </p>
          <button
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-colors"
            onClick={onRestart}
          >
            Back to Start
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white py-12 px-6">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8 pb-6 border-b border-gray-700">
          <h1 className="text-3xl font-bold text-white mb-1">Interview Debrief</h1>
          <p className="text-gray-400 text-sm">Problem: {problem.title}</p>
        </div>

        {/* Feedback card */}
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 mb-8 prose prose-invert max-w-none">
          <ReactMarkdown>{feedback}</ReactMarkdown>
        </div>

        {/* Final code snapshot */}
        {finalCode && (
          <div className="mb-8">
            <h3 className="text-base font-semibold text-gray-200 mb-3">Your Final Code</h3>
            <pre className="bg-gray-900 border border-gray-700 text-gray-100 rounded-xl p-5 overflow-x-auto text-sm leading-relaxed font-mono">
              {finalCode}
            </pre>
          </div>
        )}

        {/* Restart */}
        <div className="flex justify-center">
          <button
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-colors"
            onClick={onRestart}
          >
            Start New Interview →
          </button>
        </div>

      </div>
    </div>
  );
}