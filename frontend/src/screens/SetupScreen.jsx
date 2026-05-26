import { useState } from "react";

export default function SetupScreen({ onStart }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleStart() {
    if (!title.trim() || !description.trim()) {
      alert("Please fill in both the problem title and description.");
      return;
    }
    onStart(title.trim(), description.trim());
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans flex items-start justify-center">
      <div className="max-w-2xl w-full mt-20 px-6">

        <h1 className="text-3xl font-bold mb-2">Technical Interview Coach</h1>
        <p className="text-gray-400 mb-8">
          Paste the problem you want to practice below, then hit Start.
        </p>

        {/* Problem Title field */}
        <div className="mb-6">
          <label className="block font-semibold mb-2 text-gray-200">Problem Title</label>
          <input
            type="text"
            placeholder="e.g. Two Sum"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-base bg-gray-800 border border-gray-700 text-white
                       placeholder-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Problem Description field */}
        <div className="mb-6">
          <label className="block font-semibold mb-2 text-gray-200">Problem Description</label>
          <textarea
            placeholder="Paste the full problem statement here..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white
                       placeholder-gray-500 font-mono resize-y rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleStart}
          className="bg-blue-600 text-white px-7 py-3 text-base rounded-md
                     hover:bg-blue-500 transition-colors cursor-pointer"
        >
          Start Interview →
        </button>
      </div>
    </div>
  );
}