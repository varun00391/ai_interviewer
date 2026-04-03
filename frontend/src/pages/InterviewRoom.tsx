import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { loadStoredToken, wsInterviewUrl } from "../api";
import Whiteboard from "../components/Whiteboard";

type ChatLine = { role: "user" | "assistant"; text: string };

const SILENCE_MS = 5000;
const CAMERA_INTERVAL_MS = 8000;

export default function InterviewRoom() {
  const { sessionId, round } = useParams();
  const sid = Number(sessionId);
  const roundType = String(round || "hr");

  const [lines, setLines] = useState<ChatLine[]>([]);
  const [live, setLive] = useState("");
  const [status, setStatus] = useState<string>("Connecting…");
  const [listening, setListening] = useState(false);
  const [code, setCode] = useState("// Your solution\n");
  const [wb, setWb] = useState<string>("");
  const [roundDone, setRoundDone] = useState<Record<string, unknown> | null>(
    null
  );
  const [allDone, setAllDone] = useState<Record<string, unknown> | null>(null);
  const [continueHint, setContinueHint] = useState<string | null>(null);
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [manualText, setManualText] = useState("");
  const [camLabel, setCamLabel] = useState<string>("");
  const [integrityMsg, setIntegrityMsg] = useState<string | null>(null);
  const [dqReason, setDqReason] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const committedRef = useRef("");
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectingAnswerRef = useRef(false);
  const roundActiveRef = useRef(false);
  const codeRef = useRef(code);
  const wbRef = useRef(wb);
  const roundTypeRef = useRef(roundType);
  const useTextFallbackRef = useRef(useTextFallback);

  codeRef.current = code;
  wbRef.current = wb;
  roundTypeRef.current = roundType;
  useTextFallbackRef.current = useTextFallback;

  const speakThen = useCallback((text: string, onDone: () => void) => {
    setLines((prev) => [...prev, { role: "assistant", text }]);
    if (!("speechSynthesis" in window)) {
      onDone();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.onend = () => onDone();
    u.onerror = () => onDone();
    window.speechSynthesis.speak(u);
  }, []);

  const sendSnapshot = useCallback(() => {
    const w = wsRef.current;
    if (!w || w.readyState !== WebSocket.OPEN) return;
    if (roundTypeRef.current !== "technical") return;
    w.send(
      JSON.stringify({
        type: "technical_snapshot",
        code: codeRef.current,
        whiteboard: wbRef.current || null,
      })
    );
  }, []);

  const stopRec = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const flushAnswer = useCallback(() => {
    const w = wsRef.current;
    if (!w || w.readyState !== WebSocket.OPEN) return;
    const text =
      committedRef.current.trim() ||
      (useTextFallbackRef.current ? manualText.trim() : "");
    if (!text) return;
    sendSnapshot();
    w.send(JSON.stringify({ type: "user_final", text }));
    setLines((prev) => [...prev, { role: "user", text }]);
    committedRef.current = "";
    setLive("");
    setManualText("");
    expectingAnswerRef.current = false;
    stopRec();
  }, [manualText, sendSnapshot, stopRec]);

  const resetSilence = useCallback(() => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = setTimeout(() => {
      if (
        expectingAnswerRef.current &&
        committedRef.current.trim() &&
        !useTextFallbackRef.current
      ) {
        flushAnswer();
      }
    }, SILENCE_MS);
  }, [flushAnswer]);

  const startListening = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setUseTextFallback(true);
      useTextFallbackRef.current = true;
      setStatus("Type your answer below, then tap Send answer.");
      return;
    }
    stopRec();
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let finalChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const piece = res[0].transcript;
        if (res.isFinal) finalChunk += piece;
        else interim += piece;
      }
      if (finalChunk) committedRef.current += finalChunk;
      setLive(committedRef.current + interim);
      resetSilence();
    };
    rec.onerror = (ev) => {
      const err = (ev as unknown as { error?: string }).error;
      if (err === "aborted" || err === "no-speech") return;
      setUseTextFallback(true);
      useTextFallbackRef.current = true;
      setStatus("Mic issue—use the text box below.");
      stopRec();
    };
    rec.onend = () => {
      if (
        expectingAnswerRef.current &&
        !useTextFallbackRef.current &&
        recRef.current === rec
      ) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setStatus("Listening… pause ~5s after speaking to send your answer.");
    } catch {
      setUseTextFallback(true);
      useTextFallbackRef.current = true;
      setStatus("Could not start microphone. Type your answer instead.");
    }
  }, [resetSilence, stopRec]);

  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;

  useEffect(() => {
    const token = loadStoredToken();
    if (!token) return;
    const url = wsInterviewUrl(token);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      setStatus("Starting round…");
      ws.send(
        JSON.stringify({
          type: "start_round",
          session_id: sid,
          round_type: roundType,
        })
      );
    };
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as Record<string, unknown>;
      const t = data.type as string;
      if (t === "error") {
        setStatus(String(data.detail || "Error"));
        return;
      }
      if (t === "disqualified") {
        roundActiveRef.current = false;
        setDqReason(String(data.reason || "Session ended."));
        window.speechSynthesis.cancel();
        stopRec();
        setStatus("Session stopped — integrity review.");
        return;
      }
      if (t === "app_locked") {
        roundActiveRef.current = false;
        setDqReason(
          String(
            data.detail ||
              "Your subscription or free quota has ended. Renew to continue."
          )
        );
        window.speechSynthesis.cancel();
        stopRec();
        setStatus("Access paused — renew your plan.");
        return;
      }
      if (t === "integrity_update") {
        const sev = Number(data.severity);
        const flags = Array.isArray(data.flags) ? (data.flags as string[]).join(", ") : "";
        if (sev >= 6) {
          setIntegrityMsg(
            `Integrity check: severity ${sev.toFixed(1)}/10${flags ? ` — ${flags}` : ""}`
          );
        }
        return;
      }
      if (t === "round_started") {
        setRoundDone(null);
        setAllDone(null);
        setContinueHint(null);
        setIntegrityMsg(null);
        setDqReason(null);
        roundActiveRef.current = true;
        expectingAnswerRef.current = false;
        committedRef.current = "";
        setLive("");
        setStatus(
          `Question 1 of ${Number(data.total_questions) || ""}. Listen to the interviewer first.`
        );
        return;
      }
      if (t === "ai_message" && data.is_question) {
        const text = String(data.text || "");
        expectingAnswerRef.current = false;
        committedRef.current = "";
        setLive("");
        window.speechSynthesis.cancel();
        stopRec();
        speakThen(text, () => {
          expectingAnswerRef.current = true;
          if (!useTextFallbackRef.current) {
            startListeningRef.current();
          } else {
            setStatus("Type your answer, then tap Send answer.");
          }
        });
        return;
      }
      if (t === "round_complete") {
        setRoundDone(data);
        roundActiveRef.current = false;
        expectingAnswerRef.current = false;
        window.speechSynthesis.cancel();
        stopRec();
        setStatus("Round complete. Review your results below.");
        return;
      }
      if (t === "continue_round") {
        setContinueHint(String(data.message || ""));
        return;
      }
      if (t === "interview_complete") {
        setAllDone(data);
        setContinueHint(null);
        roundActiveRef.current = false;
        return;
      }
    };
    ws.onclose = () => {
      roundActiveRef.current = false;
      setStatus((s) =>
        /integrity|Session stopped/i.test(s) ? s : "Disconnected."
      );
    };
    return () => {
      ws.close();
      window.speechSynthesis.cancel();
      stopRec();
      if (silenceRef.current) clearTimeout(silenceRef.current);
    };
  }, [sid, roundType, speakThen, stopRec]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const canvas = document.createElement("canvas");

    async function setupCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, facingMode: "user" },
          audio: false,
        });
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          await el.play().catch(() => {});
        }
        setCamLabel("Camera on — used for integrity checks only.");
      } catch {
        setCamLabel("Camera not available. You can still continue with voice/text.");
        return;
      }

      timer = setInterval(() => {
        const w = wsRef.current;
        const vid = videoRef.current;
        if (!w || w.readyState !== WebSocket.OPEN || !roundActiveRef.current) return;
        if (!vid || !stream || vid.readyState < 2) return;
        const vw = vid.videoWidth || 640;
        const vh = vid.videoHeight || 480;
        const w0 = Math.min(480, vw);
        const h0 = Math.max(1, Math.round(w0 * (vh / vw)));
        canvas.width = w0;
        canvas.height = h0;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(vid, 0, 0, w0, h0);
        const jpeg = canvas.toDataURL("image/jpeg", 0.42);
        w.send(JSON.stringify({ type: "camera_frame", session_id: sid, image_jpeg: jpeg }));
      }, CAMERA_INTERVAL_MS);
    }

    void setupCam();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [sid]);

  const radarData = roundDone?.breakdown
    ? Object.entries(roundDone.breakdown as Record<string, number>).map(
        ([k, v]) => ({
          dim: k.replace(/_/g, " "),
          score: Number(v),
        })
      )
    : [];

  const roundTitle =
    roundType === "hr"
      ? "HR round"
      : roundType === "technical"
        ? "Technical round"
        : "Managerial round";

  if (dqReason) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="max-w-md glass rounded-3xl p-8 text-center space-y-4">
          <h1 className="font-display text-xl font-bold text-ink">Session stopped</h1>
          <p className="text-sm text-mist leading-relaxed">{dqReason}</p>
          <Link
            to="/app"
            className="inline-flex px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <Link to={`/app/session/${sid}`} className="text-sm text-accent font-medium">
            ← Back
          </Link>
          <div className="text-xs text-mist">{roundTitle}</div>
        </div>

        <div className="glass rounded-2xl p-3 flex flex-wrap gap-3 items-center">
          <div className="relative w-36 h-28 rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-slate-200">
            <video
              ref={videoRef}
              className="w-full h-full object-cover mirror"
              playsInline
              muted
              autoPlay
            />
          </div>
          <div className="text-xs text-mist flex-1 min-w-[200px]">
            <div className="font-semibold text-ink mb-1">Your camera</div>
            {camLabel}
            {integrityMsg && (
              <div className="mt-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                {integrityMsg}
              </div>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-4 flex flex-col min-h-[420px]">
            <div className="text-xs font-semibold text-mist mb-2">
              Conversation
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 text-sm max-h-[52vh] pr-1">
              {lines.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.role === "assistant"
                      ? "bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2"
                      : "bg-white border border-slate-200 rounded-xl px-3 py-2 ml-6"
                  }
                >
                  <div className="text-[10px] uppercase tracking-wide text-mist mb-0.5">
                    {l.role === "assistant" ? "Interviewer" : "You"}
                  </div>
                  {l.text}
                </div>
              ))}
              {live && (
                <div className="text-xs text-mist italic border border-dashed border-slate-300 rounded-xl px-3 py-2">
                  Live: {live}
                </div>
              )}
            </div>
            <div className="mt-3 text-xs text-mist">{status}</div>
            {useTextFallback && (
              <div className="mt-3 space-y-2">
                <textarea
                  className="w-full rounded-xl border border-slate-200 p-2 text-sm min-h-[90px]"
                  placeholder="Type your answer"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    committedRef.current = manualText;
                    flushAnswer();
                  }}
                  className="px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold"
                >
                  Send answer
                </button>
              </div>
            )}
            {listening && !useTextFallback && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Microphone on — speak after each question
              </div>
            )}
          </div>

          {roundType === "technical" ? (
            <div className="space-y-4">
              <div className="glass rounded-2xl p-3">
                <div className="text-xs font-semibold text-mist mb-2">
                  Coding space
                </div>
                <div className="h-[220px] rounded-xl overflow-hidden border border-slate-200">
                  <Editor
                    height="220px"
                    defaultLanguage="python"
                    theme="vs-light"
                    value={code}
                    onChange={(v) => setCode(v || "")}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      ariaLabel: "Code editor",
                    }}
                  />
                </div>
              </div>
              <div className="glass rounded-2xl p-3">
                <Whiteboard onChange={setWb} />
              </div>
              <p className="text-xs text-mist px-1">
                Voice works the same as other rounds: wait for the question to finish speaking, then answer out loud.
                Pause about five seconds when you are done.
              </p>
            </div>
          ) : (
            <div className="glass rounded-2xl p-6 text-sm text-mist leading-relaxed">
              <h3 className="font-display font-semibold text-ink mb-2">Tips</h3>
              <ul className="list-disc pl-4 space-y-2">
                <li>
                  Wait until the interviewer finishes speaking, then answer with your voice.
                </li>
                <li>After you finish, stay quiet for about five seconds so we know you are done.</li>
                <li>If the mic misbehaves, use the text box on the left.</li>
              </ul>
            </div>
          )}
        </div>

        {roundDone && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-ink">
              Your round results
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-4xl font-bold text-accent">
                  {Number(roundDone.score_overall).toFixed(1)}
                  <span className="text-lg text-mist font-medium"> / 10</span>
                </div>
                <p className="text-sm text-mist mt-2">Overall score for this round.</p>
              </div>
              {radarData.length > 0 && (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="dim" tick={{ fontSize: 10 }} />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.35}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            {Array.isArray(roundDone.improvements) && (
              <div>
                <div className="text-sm font-semibold text-ink mb-2">
                  Ideas to improve
                </div>
                <ul className="list-disc pl-5 text-sm text-mist space-y-1">
                  {(roundDone.improvements as string[]).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {roundDone.analytics && typeof roundDone.analytics === "object" && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-mist">
                <div className="font-semibold text-ink mb-2">Quick analytics</div>
                <pre className="whitespace-pre-wrap text-xs">
                  {JSON.stringify(roundDone.analytics, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {continueHint && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-ink">
            {continueHint}
            <div className="mt-3">
              <Link
                to={`/app/session/${sid}`}
                className="inline-flex px-4 py-2 rounded-full bg-ink text-white text-xs font-semibold"
              >
                Go to rounds
              </Link>
            </div>
          </div>
        )}

        {allDone && (
          <div className="glass rounded-2xl p-6 space-y-3">
            <h3 className="font-display text-lg font-semibold text-ink">
              Full interview wrap-up
            </h3>
            <div className="text-3xl font-bold text-accent">
              {Number(allDone.overall_score).toFixed(1)}
              <span className="text-base text-mist font-medium"> / 10 overall</span>
            </div>
            {allDone.summary && (
              <p className="text-sm text-mist leading-relaxed">{String(allDone.summary)}</p>
            )}
            {Array.isArray(allDone.improvements) && (
              <div>
                <div className="text-sm font-semibold text-ink mt-2 mb-1">
                  What to work on next
                </div>
                <ul className="list-disc pl-5 text-sm text-mist space-y-1">
                  {(allDone.improvements as string[]).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {allDone.analytics && typeof allDone.analytics === "object" && (
              <pre className="text-xs text-mist whitespace-pre-wrap bg-slate-50 rounded-xl p-3 border border-slate-200">
                {JSON.stringify(allDone.analytics, null, 2)}
              </pre>
            )}
            <Link
              to="/app"
              className="inline-flex mt-2 px-4 py-2 rounded-full bg-accent text-white text-sm font-semibold"
            >
              Back to dashboard
            </Link>
          </div>
        )}
      </div>
      <style>{`.mirror { transform: scaleX(-1); }`}</style>
    </div>
  );
}
