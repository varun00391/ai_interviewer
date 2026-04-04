import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { api, loadStoredToken, wsInterviewUrl } from "../api";
import { StructuredInsight } from "../components/StructuredInsight";
import { useAuth } from "../hooks/useAuth";
import Whiteboard from "../components/Whiteboard";

type ChatLine = { role: "user" | "assistant"; text: string };

const SILENCE_MS = 5000;
const CAMERA_INTERVAL_MS = 8000;
/** Let TTS release the audio device before starting Web Speech (Chrome / Safari). */
const POST_TTS_LISTEN_MS = 400;

export default function InterviewRoom() {
  const { user } = useAuth();
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
  const [roundLive, setRoundLive] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const committedRef = useRef("");
  const liveTranscriptRef = useRef("");
  const manualTextRef = useRef("");
  const ignoreWsRef = useRef(false);
  const postTtsListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectingAnswerRef = useRef(false);
  const roundActiveRef = useRef(false);
  const finishingRef = useRef(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunkPartsRef = useRef<BlobPart[]>([]);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const deepgramAvailableRef = useRef(false);
  deepgramAvailableRef.current = Boolean(user?.stt_deepgram_available);
  const codeRef = useRef(code);
  const wbRef = useRef(wb);
  const roundTypeRef = useRef(roundType);
  const useTextFallbackRef = useRef(useTextFallback);

  codeRef.current = code;
  wbRef.current = wb;
  roundTypeRef.current = roundType;
  useTextFallbackRef.current = useTextFallback;

  const stopTts = useCallback(() => {
    try {
      ttsAudioRef.current?.pause();
    } catch {
      /* ignore */
    }
    ttsAudioRef.current = null;
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const speakThen = useCallback(
    (text: string, onDone: () => void) => {
      setLines((prev) => [...prev, { role: "assistant", text }]);
      stopTts();
      void (async () => {
        if (user?.tts_deepgram_available) {
          try {
            const res = await api.post("/tts/speak", { text }, { responseType: "blob" });
            const blob = res.data as Blob;
            if (blob instanceof Blob && blob.size > 512) {
              const url = URL.createObjectURL(blob);
              ttsObjectUrlRef.current = url;
              const audio = new Audio(url);
              ttsAudioRef.current = audio;
              await new Promise<void>((resolve) => {
                const done = () => {
                  if (ttsObjectUrlRef.current === url) {
                    URL.revokeObjectURL(url);
                    ttsObjectUrlRef.current = null;
                  }
                  ttsAudioRef.current = null;
                  resolve();
                };
                audio.onended = () => done();
                audio.onerror = () => done();
                void audio.play().catch(() => done());
              });
              onDone();
              return;
            }
          } catch {
            /* fall through to browser TTS */
          }
        }
        if (!("speechSynthesis" in window)) {
          onDone();
          return;
        }
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1;
        u.onend = () => onDone();
        u.onerror = () => onDone();
        window.speechSynthesis.speak(u);
      })();
    },
    [user?.tts_deepgram_available, stopTts]
  );

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
      mediaRecorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null;
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const startDeepgramRecording = useCallback(() => {
    if (!deepgramAvailableRef.current || !audioStreamRef.current) return;
    try {
      audioChunkPartsRef.current = [];
      const stream = audioStreamRef.current;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunkPartsRef.current.push(e.data);
      };
      mr.start(400);
      mediaRecorderRef.current = mr;
    } catch {
      /* ignore */
    }
  }, []);

  const flushAnswer = useCallback(async () => {
    const w = wsRef.current;
    if (!w || w.readyState !== WebSocket.OPEN) return;
    let text =
      committedRef.current.trim() ||
      (useTextFallbackRef.current ? manualText.trim() : "");

    const dg = deepgramAvailableRef.current;
    const mr = mediaRecorderRef.current;
    if (dg && mr && mr.state !== "inactive") {
      await new Promise<void>((resolve) => {
        mr.onstop = () => resolve();
        try {
          mr.stop();
        } catch {
          resolve();
        }
      });
      mediaRecorderRef.current = null;
      const blob = new Blob(audioChunkPartsRef.current, {
        type: mr.mimeType || "audio/webm",
      });
      audioChunkPartsRef.current = [];
      if (blob.size > 800) {
        try {
          const fd = new FormData();
          fd.append("file", blob, "answer.webm");
          const { data } = await api.post<{ text?: string }>("/asr/transcribe", fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          const dgText = String(data?.text || "").trim();
          if (dgText.length >= 2 && dgText.length > text.length) {
            text = dgText;
          } else if (!text && dgText.length >= 2) {
            text = dgText;
          }
        } catch {
          /* keep browser STT text */
        }
      }
    }

    if (!text) return;
    sendSnapshot();
    w.send(JSON.stringify({ type: "user_final", text }));
    setLines((prev) => [...prev, { role: "user", text }]);
    committedRef.current = "";
    liveTranscriptRef.current = "";
    setLive("");
    setManualText("");
    manualTextRef.current = "";
    expectingAnswerRef.current = false;
    stopRec();
  }, [manualText, sendSnapshot, stopRec]);

  const resetSilence = useCallback(() => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = setTimeout(() => {
      if (!expectingAnswerRef.current || useTextFallbackRef.current) return;
      const hasBrowserText = committedRef.current.trim().length > 0;
      const mayHaveDeepgram =
        deepgramAvailableRef.current && audioStreamRef.current;
      if (hasBrowserText || mayHaveDeepgram) {
        void flushAnswer();
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
      liveTranscriptRef.current = committedRef.current + interim;
      setLive(liveTranscriptRef.current);
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
    if (!user?.stt_deepgram_available) return;
    let stream: MediaStream | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
      } catch {
        audioStreamRef.current = null;
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    };
  }, [user?.stt_deepgram_available]);

  const finishInterview = useCallback(async () => {
    const w = wsRef.current;
    if (!w || w.readyState !== WebSocket.OPEN || finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    if (postTtsListenTimerRef.current) {
      clearTimeout(postTtsListenTimerRef.current);
      postTtsListenTimerRef.current = null;
    }
    stopTts();

    let partial = "";
    if (expectingAnswerRef.current) {
      if (useTextFallbackRef.current) {
        partial = manualTextRef.current.trim();
      } else {
        partial =
          liveTranscriptRef.current.trim() || committedRef.current.trim();
      }
    }

    const dg = deepgramAvailableRef.current;
    const mr = mediaRecorderRef.current;
    if (!partial && dg && mr && mr.state !== "inactive") {
      await new Promise<void>((resolve) => {
        mr.onstop = () => resolve();
        try {
          mr.stop();
        } catch {
          resolve();
        }
      });
      mediaRecorderRef.current = null;
      const blob = new Blob(audioChunkPartsRef.current, {
        type: mr.mimeType || "audio/webm",
      });
      audioChunkPartsRef.current = [];
      if (blob.size > 800) {
        try {
          const fd = new FormData();
          fd.append("file", blob, "finish.webm");
          const { data } = await api.post<{ text?: string }>("/asr/transcribe", fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          partial = String(data?.text || "").trim();
        } catch {
          /* ignore */
        }
      }
    }

    stopRec();
    setStatus("Wrapping up and scoring your interview…");
    w.send(
      JSON.stringify({
        type: "finish_interview",
        partial_answer: partial || null,
        end_session: true,
      })
    );
    expectingAnswerRef.current = false;
    committedRef.current = "";
    liveTranscriptRef.current = "";
    setLive("");
    setManualText("");
    manualTextRef.current = "";
  }, [stopRec, stopTts]);

  useEffect(() => {
    const token = loadStoredToken();
    if (!token) return;
    const url = wsInterviewUrl(token);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ignoreWsRef.current = false;
    ws.onopen = () => {
      if (ignoreWsRef.current) return;
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
      if (ignoreWsRef.current) return;
      const data = JSON.parse(ev.data) as Record<string, unknown>;
      const t = data.type as string;
      if (t === "error") {
        finishingRef.current = false;
        setFinishing(false);
        setStatus(String(data.detail || "Error"));
        return;
      }
      if (t === "disqualified") {
        roundActiveRef.current = false;
        setRoundLive(false);
        finishingRef.current = false;
        setFinishing(false);
        setDqReason(String(data.reason || "Session ended."));
        stopTts();
        stopRec();
        setStatus("Session stopped — integrity review.");
        return;
      }
      if (t === "app_locked") {
        roundActiveRef.current = false;
        setRoundLive(false);
        finishingRef.current = false;
        setFinishing(false);
        setDqReason(
          String(
            data.detail ||
              "Your subscription or free quota has ended. Renew to continue."
          )
        );
        stopTts();
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
        finishingRef.current = false;
        setFinishing(false);
        roundActiveRef.current = true;
        setRoundLive(true);
        expectingAnswerRef.current = false;
        committedRef.current = "";
        liveTranscriptRef.current = "";
        setLive("");
        setStatus(
          `Question 1 of ${Number(data.total_questions) || ""}. Listen to the interviewer first.`
        );
        return;
      }
      if (t === "ai_message" && data.is_question) {
        const text = String(data.text || "");
        const tot = Number(data.total_questions);
        const qi = Number(data.question_index);
        const isFu = Boolean(data.is_follow_up);
        if (Number.isFinite(tot) && Number.isFinite(qi)) {
          setStatus(
            isFu
              ? `Follow-up (question ${qi + 1} of ${tot}). Listen, then respond.`
              : `Question ${qi + 1} of ${tot}. Listen to the interviewer first.`
          );
        }
        expectingAnswerRef.current = false;
        committedRef.current = "";
        liveTranscriptRef.current = "";
        setLive("");
        stopTts();
        stopRec();
        speakThen(text, () => {
          expectingAnswerRef.current = true;
          if (useTextFallbackRef.current) {
            setStatus("Type your answer, then tap Send answer.");
            return;
          }
          if (postTtsListenTimerRef.current) {
            clearTimeout(postTtsListenTimerRef.current);
          }
          postTtsListenTimerRef.current = window.setTimeout(() => {
            postTtsListenTimerRef.current = null;
            if (ignoreWsRef.current || !expectingAnswerRef.current) return;
            startDeepgramRecording();
            setStatus(
              deepgramAvailableRef.current
                ? "Listening… speak clearly; pause ~5s when done (Deepgram + browser assist)."
                : "Listening… pause ~5s after speaking to send your answer."
            );
            startListeningRef.current();
          }, POST_TTS_LISTEN_MS);
        });
        return;
      }
      if (t === "round_complete") {
        setRoundDone(data);
        roundActiveRef.current = false;
        setRoundLive(false);
        finishingRef.current = false;
        setFinishing(false);
        expectingAnswerRef.current = false;
        stopTts();
        stopRec();
        if (postTtsListenTimerRef.current) {
          clearTimeout(postTtsListenTimerRef.current);
          postTtsListenTimerRef.current = null;
        }
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
        setRoundLive(false);
        finishingRef.current = false;
        setFinishing(false);
        setStatus("Interview finished.");
        return;
      }
    };
    ws.onclose = () => {
      roundActiveRef.current = false;
      setRoundLive(false);
      finishingRef.current = false;
      setFinishing(false);
      setStatus((s) =>
        /integrity|Session stopped|Wrapping up|paused/i.test(s) ? s : "Disconnected."
      );
    };
    return () => {
      ignoreWsRef.current = true;
      if (postTtsListenTimerRef.current) {
        clearTimeout(postTtsListenTimerRef.current);
        postTtsListenTimerRef.current = null;
      }
      ws.close();
      stopTts();
      stopRec();
      if (silenceRef.current) clearTimeout(silenceRef.current);
    };
  }, [sid, roundType, speakThen, stopRec, stopTts, startDeepgramRecording]);

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
        {allDone && (
          <div
            className="rounded-2xl px-4 py-3.5 text-center shadow-md border border-emerald-400/30 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white"
            role="status"
          >
            <div className="font-display text-lg font-bold tracking-tight">Interview finished</div>
            <p className="text-sm text-emerald-50/95 mt-0.5">
              Your full interview is complete. Review your summary and scores below.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <Link to={`/app/session/${sid}`} className="text-sm text-accent font-medium">
            ← Back
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-mist">{roundTitle}</div>
            {roundLive && !roundDone && !allDone && (
              <button
                type="button"
                disabled={finishing}
                onClick={() => void finishInterview()}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              >
                {finishing ? "Finishing…" : "Finish interview"}
              </button>
            )}
          </div>
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
                  onChange={(e) => {
                    const v = e.target.value;
                    manualTextRef.current = v;
                    setManualText(v);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    committedRef.current = manualText;
                    void flushAnswer();
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
            {roundDone.early_exit === true && (
              <p className="text-sm rounded-xl border border-amber-200 bg-amber-50 text-amber-950 px-3 py-2">
                You ended this round early. Scores reflect only the answers recorded up to that
                point.
              </p>
            )}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-4xl font-bold text-accent">
                  {Number(roundDone.score_overall).toFixed(1)}
                  <span className="text-lg text-mist font-medium"> / 10</span>
                </div>
                <p className="text-sm text-mist mt-2">Overall score for this round.</p>
              </div>
              {radarData.length > 0 && (
                <div className="h-64 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 text-center">
                    Competency profile
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="52%" outerRadius="72%" data={radarData}>
                      <defs>
                        <linearGradient id="radarStroke" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#4f46e5" stopOpacity={1} />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity={1} />
                        </linearGradient>
                        <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#818cf8" stopOpacity={0.5} />
                          <stop offset="70%" stopColor="#6366f1" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
                        </radialGradient>
                      </defs>
                      <PolarGrid
                        gridType="polygon"
                        stroke="#cbd5e1"
                        strokeWidth={0.75}
                        radialLines
                      />
                      <PolarAngleAxis
                        dataKey="dim"
                        tick={{ fill: "#334155", fontSize: 11, fontWeight: 600 }}
                        tickLine={false}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 10]}
                        tickCount={6}
                        tick={{ fill: "#94a3b8", fontSize: 9 }}
                        axisLine={false}
                        stroke="#e2e8f0"
                      />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="url(#radarStroke)"
                        strokeWidth={2.5}
                        fill="url(#radarFill)"
                        fillOpacity={1}
                        dot={{
                          r: 5,
                          fill: "#4f46e5",
                          stroke: "#fff",
                          strokeWidth: 2,
                        }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                        isAnimationActive
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
              <div className="rounded-2xl bg-gradient-to-b from-slate-50 to-white border border-slate-200/90 p-6 shadow-sm">
                <StructuredInsight data={roundDone.analytics} title="Round insights" />
              </div>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to={`/app/session/${sid}/recap`}
                className="inline-flex px-4 py-2 rounded-full border border-emerald-600 text-emerald-800 text-sm font-semibold hover:bg-emerald-50"
              >
                View saved recap (all Q&amp;A &amp; feedback)
              </Link>
            </div>
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
            {allDone.session_ended_early === true && (
              <p className="text-xs text-mist rounded-lg bg-slate-100 border border-slate-200 px-3 py-2">
                You ended the interview early. This summary uses only the rounds and answers
                completed before you stopped.
              </p>
            )}
            {allDone.hire_recommendation &&
              typeof allDone.hire_recommendation === "object" &&
              allDone.hire_recommendation !== null && (
                <div
                  className={`rounded-2xl border-2 p-4 space-y-2 ${
                    String(
                      (allDone.hire_recommendation as Record<string, unknown>).verdict
                    ) === "hire"
                      ? "border-emerald-300 bg-emerald-50/80"
                      : String(
                            (allDone.hire_recommendation as Record<string, unknown>).verdict
                          ) === "no_hire"
                        ? "border-rose-300 bg-rose-50/80"
                        : "border-amber-300 bg-amber-50/80"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-mist">
                      Hiring recommendation (AI-assisted)
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                        String(
                          (allDone.hire_recommendation as Record<string, unknown>).verdict
                        ) === "hire"
                          ? "bg-emerald-600 text-white"
                          : String(
                                (allDone.hire_recommendation as Record<string, unknown>).verdict
                              ) === "no_hire"
                            ? "bg-rose-600 text-white"
                            : "bg-amber-600 text-white"
                      }`}
                    >
                      {String(
                        (allDone.hire_recommendation as Record<string, unknown>).verdict ||
                          "borderline"
                      ).replace(/_/g, " ")}
                    </span>
                  </div>
                  {(() => {
                    const c = Number(
                      (allDone.hire_recommendation as Record<string, unknown>).confidence
                    );
                    if (!Number.isFinite(c)) return null;
                    return (
                      <div className="text-xs text-mist">
                        Confidence:{" "}
                        <span className="font-semibold text-ink">
                          {(c * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })()}
                  {(allDone.hire_recommendation as Record<string, unknown>).rationale && (
                    <p className="text-sm text-ink leading-relaxed">
                      {String(
                        (allDone.hire_recommendation as Record<string, unknown>).rationale
                      )}
                    </p>
                  )}
                  <p className="text-[10px] text-mist leading-snug">
                    Practice-only signal—not a substitute for human review or fair hiring process.
                  </p>
                </div>
              )}
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
              <div className="rounded-2xl bg-gradient-to-b from-slate-50 to-white border border-slate-200/90 p-6 shadow-sm">
                <StructuredInsight data={allDone.analytics} title="Overall insights" />
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-2">
              <Link
                to={`/app/session/${sid}/recap`}
                className="inline-flex px-4 py-2 rounded-full border border-emerald-600 text-emerald-800 text-sm font-semibold hover:bg-emerald-50"
              >
                Full recap page
              </Link>
              <Link
                to="/app"
                className="inline-flex px-4 py-2 rounded-full bg-accent text-white text-sm font-semibold"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
      <style>{`.mirror { transform: scaleX(-1); }`}</style>
    </div>
  );
}
