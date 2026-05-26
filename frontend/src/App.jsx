import { useState } from 'react'
import SetupScreen from './screens/SetupScreen'
import InterviewScreen from './screens/InterviewScreen'
import DebriefScreen from './screens/DebriefScreen'

export default function App() {
  // Screen visible
  const [screen, setScreen] = useState("setup")

  // Problem being solved
  const [problem, setProblem] = useState({ title: "", description: "" });

  // Conversation history
  const [history, setHistory] = useState([]);

  // Code editor content at the end of the interview
  const [finalCode, setFinalCode] = useState("");

  if (screen === "setup") {
    return (
      <SetupScreen
        onStart={(title, description) => {
          setProblem({ title, description });
          setScreen("interview");
        }}
      />
    );
  }

  if (screen === "interview") {
    return (
      <InterviewScreen
        problem={problem}
        onFinish={(conversationHistory, code) => {
          setHistory(conversationHistory);
          setFinalCode(code);
          setScreen("debrief");
        }}
      />
    );
  }

  // else debrief screen
  return (
    <DebriefScreen
      problem={problem}
      history={history}
      finalCode={finalCode}
      
      onRestart={() => {
        setProblem({ title: "", description: "" });
        setHistory([]);
        setFinalCode("");
        setScreen("setup");
      }}
      />
  );
}